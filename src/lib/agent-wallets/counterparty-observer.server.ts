import { validateP2wpkhAddress } from "../stamps/proof.server";
import { chainRead, COUNTERPARTY_ORIGIN, type ChainFetchOptions } from "./chain-http.server";
import type {
  ChainAnchor,
  KnownObservation,
  ObservationScan,
  TransferObservation,
} from "./observations";

const PAGE_SIZE = 100;
const MAX_PAGES = 2;
const MAX_EVENTS = 200;
const MAX_HEIGHTS = 12;
const MEMPOOL_HEIGHT = 9_999_999;
const UINT64_MAX = 18_446_744_073_709_551_615n;
const HASH = /^[0-9a-f]{64}$/;
const ASSET = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,249}$/;
const SEND_EVENTS = new Set(["SEND", "ENHANCED_SEND", "MPMA_SEND"]);
type Row = Record<string, unknown>;
type Root = { height: number; backendHeight: number };
type Page = { rows: unknown[]; next: string | null };

function invalid(): never {
  throw new Error("Invalid Counterparty observation response.");
}
function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Row;
}
function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}
function hash(value: unknown): string {
  if (typeof value !== "string" || !HASH.test(value)) invalid();
  return value;
}
function text(value: unknown, maximum = 256): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > maximum ||
    [...value].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
  )
    invalid();
  return value;
}
function status(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > 256 ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    invalid();
  return value;
}
function quantity(value: unknown): string {
  let raw: string;
  if (typeof value === "number") {
    integer(value);
    raw = String(value);
  } else if (typeof value === "string" && /^(0|[1-9][0-9]{0,19})$/.test(value)) raw = value;
  else invalid();
  const result = BigInt(raw);
  if (result > UINT64_MAX) invalid();
  return result.toString();
}
function envelope(value: unknown): Row {
  const result = object(value);
  if (result.error !== undefined && result.error !== null) invalid();
  return result;
}
function rootInfo(value: unknown, anchor: ChainAnchor): Root {
  const root = object(envelope(value).result);
  const height = integer(root.counterparty_height);
  const backendHeight = integer(root.backend_height);
  if (
    root.network !== "mainnet" ||
    root.server_ready !== true ||
    root.ledger_state !== "Following" ||
    height > anchor.height ||
    height > backendHeight ||
    backendHeight - height > 1
  )
    throw new Error("Counterparty is not ready on the observed mainnet chain.");
  return { height, backendHeight };
}
function page(value: unknown): Page {
  const response = envelope(value);
  if (!Array.isArray(response.result) || response.result.length > PAGE_SIZE) invalid();
  if (response.result_count !== undefined) integer(response.result_count);
  let next: string | null = null;
  if (response.next_cursor === null) next = null;
  else if (typeof response.next_cursor === "number") next = String(integer(response.next_cursor));
  else if (
    typeof response.next_cursor === "string" &&
    /^(0|[1-9][0-9]{0,15})$/.test(response.next_cursor) &&
    Number.isSafeInteger(Number(response.next_cursor))
  )
    next = response.next_cursor;
  else invalid();
  if (next !== null && response.result.length === 0) invalid();
  return { rows: response.result, next };
}

/** Raw Counterparty direct sends, not classified stamps, deposits or spendable balances. */
export async function observeCounterparty(
  address: string,
  known: KnownObservation[],
  anchor: ChainAnchor,
  canonicalHash: (height: number) => Promise<string>,
  options: ChainFetchOptions = {},
): Promise<ObservationScan> {
  if (!validateP2wpkhAddress(address) || !Array.isArray(known) || known.length > 1_000) invalid();
  integer(anchor.height);
  hash(anchor.hash);
  const read = (path: string) => chainRead(`${COUNTERPARTY_ORIGIN}/v2/${path}`, "json", options);
  const before = rootInfo(await read(""), anchor);
  const canonical = new Map<number, string>();
  const blocks = new Map<number, string>();
  const events = new Map<string, TransferObservation>();
  const orphaned = new Set<string>();
  const unverifiedKnown = new Set<string>();
  let historyComplete = true;
  let mempoolComplete = true;
  let suppressedPending = false;

  async function canonicalAt(height: number): Promise<string | null> {
    if (canonical.has(height)) return canonical.get(height)!;
    if (canonical.size >= MAX_HEIGHTS) return null;
    const value = hash(await canonicalHash(height));
    canonical.set(height, value);
    return value;
  }
  async function blockAt(height: number, fresh = false): Promise<string | null> {
    const expected = await canonicalAt(height);
    if (expected === null) return null;
    if (!fresh && blocks.has(height)) return blocks.get(height)!;
    const block = object(envelope(await read(`blocks/${height}`)).result);
    if (integer(block.block_index) !== height) invalid();
    const actual = hash(block.block_hash);
    if (block.previous_block_hash !== undefined) hash(block.previous_block_hash);
    if (actual !== expected)
      throw new Error("Counterparty's block is not on the observed canonical chain.");
    blocks.set(height, actual);
    return actual;
  }
  const initialBlock = await blockAt(before.height);
  if (initialBlock === null) invalid();

  // Reorg evidence comes from a positive old-block hash mismatch, never absence.
  for (const previous of known) {
    if (previous.protocol !== "counterparty" || previous.destination !== address || !previous.block)
      continue;
    const height = integer(previous.block.height);
    hash(previous.block.hash);
    if (previous.eventId !== `counterparty:${hash(previous.txid)}:${integer(previous.eventIndex)}`)
      invalid();
    if (height > anchor.height) {
      historyComplete = false;
      unverifiedKnown.add(previous.eventId);
      continue;
    }
    const current = await canonicalAt(height);
    if (current === null) {
      historyComplete = false;
      unverifiedKnown.add(previous.eventId);
    } else if (current !== previous.block.hash) orphaned.add(previous.eventId);
  }

  async function parseSend(raw: unknown, pending: boolean): Promise<TransferObservation | null> {
    const row = object(raw);
    const state = status(row.status);
    const type = text(row.send_type, 16);
    // Address mempool history includes outgoing sends. Invalid protocol sends
    // and attach/move/detach are deliberately outside this observer's scope.
    if (state !== "valid" || type !== "send") return null;
    const destination = text(row.destination);
    if (destination !== address) {
      if (!pending) invalid();
      return null;
    }
    const txid = hash(row.tx_hash);
    const eventIndex = integer(row.msg_index);
    const eventId = `counterparty:${txid}:${eventIndex}`;
    const asset = text(row.asset, 250);
    if (!ASSET.test(asset)) invalid();
    const amount = quantity(row.quantity);
    const source = text(row.source);
    const height = integer(row.block_index);
    if (amount === "0") return null;
    let block: ChainAnchor | null = null;
    if (pending) {
      if (height !== MEMPOOL_HEIGHT) invalid();
      // A mempool row cannot refresh an old confirmation unless its previous
      // inclusion was checked. Keep the retained observation stale instead.
      if (unverifiedKnown.has(eventId)) {
        suppressedPending = true;
        return null;
      }
    } else {
      if (height > before.height || height === MEMPOOL_HEIGHT) invalid();
      const blockHash = await blockAt(height);
      if (blockHash === null) {
        historyComplete = false;
        return null;
      }
      block = { height, hash: blockHash };
    }
    return {
      eventId,
      protocol: "counterparty",
      txid,
      eventIndex,
      source,
      destination,
      asset,
      quantity: amount,
      block,
    };
  }
  function add(event: TransferObservation): boolean {
    const previous = events.get(event.eventId);
    if (previous) {
      const withoutBlock = (value: TransferObservation) => ({ ...value, block: null });
      if (JSON.stringify(withoutBlock(previous)) !== JSON.stringify(withoutBlock(event))) invalid();
      if (
        previous.block &&
        event.block &&
        JSON.stringify(previous.block) !== JSON.stringify(event.block)
      )
        invalid();
      if (!previous.block && event.block) events.set(event.eventId, event);
      return true;
    }
    if (events.size >= MAX_EVENTS) return false;
    events.set(event.eventId, event);
    return true;
  }
  async function feed(pending: boolean): Promise<boolean> {
    const cursors = new Set<string>();
    let cursor: string | null = null;
    for (let index = 0; index < MAX_PAGES; index++) {
      const parameters = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (pending) {
        parameters.set("addresses", address);
        parameters.set("event_name", "SEND,ENHANCED_SEND,MPMA_SEND");
      } else parameters.set("send_type", "send");
      if (cursor !== null) parameters.set("cursor", cursor);
      const path = pending ? "addresses/mempool" : `addresses/${address}/receives`;
      const current = page(await read(`${path}?${parameters}`));
      for (const raw of current.rows) {
        let row = raw;
        if (pending) {
          const wrapper = object(raw);
          if (!SEND_EVENTS.has(text(wrapper.event, 32))) continue;
          const params = object(wrapper.params);
          if (hash(wrapper.tx_hash) !== hash(params.tx_hash)) invalid();
          if (
            typeof wrapper.timestamp !== "number" ||
            !Number.isFinite(wrapper.timestamp) ||
            wrapper.timestamp < 0
          )
            invalid();
          row = params;
        }
        const event = await parseSend(row, pending);
        if (event && !add(event)) return false;
      }
      if (current.next === null) return true;
      if (cursors.has(current.next)) return false;
      cursors.add(current.next);
      cursor = current.next;
    }
    return false;
  }

  historyComplete = (await feed(false)) && historyComplete;
  mempoolComplete = (await feed(true)) && !suppressedPending;
  const after = rootInfo(await read(""), anchor);
  if (before.height !== after.height || before.backendHeight !== after.backendHeight)
    throw new Error("Counterparty advanced during the observation. Refresh again.");
  if ((await blockAt(after.height, true)) !== initialBlock)
    throw new Error("Counterparty's chain changed during the observation.");
  return {
    protocol: "counterparty",
    anchor,
    indexedHeight: before.height,
    historyComplete,
    mempoolComplete,
    events: [...events.values()],
    orphanedEventIds: [...orphaned],
  };
}
