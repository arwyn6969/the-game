import { Address } from "bip322-js";
import { validateP2wpkhAddress } from "../stamps/proof.server";
import { chainRead, ESPLORA_ORIGIN, type ChainFetchOptions } from "./chain-http.server";
import type {
  ChainAnchor,
  KnownObservation,
  ObservationScan,
  TransferObservation,
} from "./observations";

const HASH = /^[0-9a-f]{64}$/;
const SATOSHI_LIMIT = 2_100_000_000_000_000;
const MAX_HEIGHTS = 12;
const MAX_EVENTS = 200;
type Row = Record<string, unknown>;
function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid chain record.");
  return value as Row;
}
function integer(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > max)
    throw new Error("Invalid chain integer.");
  return value;
}
function hash(value: unknown): string {
  if (typeof value !== "string" || !HASH.test(value)) throw new Error("Invalid chain hash.");
  return value;
}
function block(value: unknown): ChainAnchor | null {
  const status = object(value);
  if (status.confirmed === false) {
    if (status.block_height != null || status.block_hash != null)
      throw new Error("Inconsistent pending block.");
    return null;
  }
  if (status.confirmed !== true) throw new Error("Missing transaction status.");
  return { height: integer(status.block_height), hash: hash(status.block_hash) };
}

/** Canonical hashes are cached only for one explicitly requested observation. */
export class EsploraObservationReader {
  private readonly hashes = new Map<number, Promise<string>>();
  constructor(private readonly options: ChainFetchOptions = {}) {}
  private read(path: string, format: "json" | "text" = "json") {
    return chainRead(`${ESPLORA_ORIGIN}/api/${path}`, format, this.options);
  }
  async tip(): Promise<ChainAnchor> {
    const tip = hash(((await this.read("blocks/tip/hash", "text")) as string).trim());
    const details = object(await this.read(`block/${tip}`));
    if (hash(details.id) !== tip) throw new Error("Chain tip changed.");
    return { height: integer(details.height), hash: tip };
  }
  canonicalHash = (height: number): Promise<string> => {
    integer(height);
    let result = this.hashes.get(height);
    if (!result) {
      result = this.read(`block-height/${height}`, "text").then((value) =>
        hash((value as string).trim()),
      );
      this.hashes.set(height, result);
    }
    return result;
  };
  async assertAnchor(anchor: ChainAnchor): Promise<void> {
    // Re-read without the per-scan cache. A moving tip yields unknown, never a false reorg.
    const current = hash(((await this.read("blocks/tip/hash", "text")) as string).trim());
    const atHeight = hash(
      ((await this.read(`block-height/${anchor.height}`, "text")) as string).trim(),
    );
    if (current !== anchor.hash || atHeight !== anchor.hash)
      throw new Error("Chain anchor moved during observation.");
  }
  async bitcoin(
    address: string,
    known: KnownObservation[],
    anchor: ChainAnchor,
  ): Promise<ObservationScan> {
    if (!validateP2wpkhAddress(address)) throw new Error("Unsupported watched address.");
    integer(anchor.height);
    hash(anchor.hash);
    const script = Address.convertAdressToScriptPubkey(address).toString("hex");
    const [pendingValue, firstValue] = await Promise.all([
      this.read(`address/${address}/txs/mempool`),
      this.read(`address/${address}/txs/chain`),
    ]);
    function page(value: unknown, limit: number): Row[] {
      if (!Array.isArray(value) || value.length > limit)
        throw new Error("Invalid transaction page.");
      return value.map(object);
    }
    const pending = page(pendingValue, 50);
    const confirmed = page(firstValue, 25);
    let historyComplete = confirmed.length < 25;
    if (!historyComplete) {
      const cursor = hash(confirmed.at(-1)?.txid);
      const next = page(await this.read(`address/${address}/txs/chain/${cursor}`), 25);
      confirmed.push(...next);
      historyComplete = next.length < 25;
    }
    const events: TransferObservation[] = [];
    const seen = new Set<string>();
    const heights = new Set<number>();
    let bounded = false;
    const verifyBlock = async (inclusion: ChainAnchor): Promise<boolean> => {
      if (inclusion.height > anchor.height)
        throw new Error("Transaction is ahead of the chain anchor.");
      if (!heights.has(inclusion.height) && heights.size >= MAX_HEIGHTS) {
        bounded = true;
        return false;
      }
      heights.add(inclusion.height);
      if ((await this.canonicalHash(inclusion.height)) !== inclusion.hash)
        throw new Error("Transaction inclusion disagrees with the canonical chain.");
      return true;
    };
    const txids = new Set<string>();
    for (const [transactions, expectsConfirmed] of [
      [pending, false],
      [confirmed, true],
    ] as const) {
      for (const transaction of transactions) {
        const txid = hash(transaction.txid);
        if (txids.has(txid))
          throw new Error("Overlapping chain history changed during observation.");
        txids.add(txid);
        const inclusion = block(transaction.status);
        if (Boolean(inclusion) !== expectsConfirmed)
          throw new Error("Unexpected transaction history status.");
        if (inclusion && !(await verifyBlock(inclusion))) continue;
        if (!Array.isArray(transaction.vout) || transaction.vout.length > 10_000)
          throw new Error("Invalid transaction outputs.");
        let mentionsAddress = false;
        for (const [eventIndex, raw] of transaction.vout.entries()) {
          const output = object(raw);
          integer(output.value, SATOSHI_LIMIT);
          if (
            typeof output.scriptpubkey !== "string" ||
            !/^(?:[0-9a-f]{2}){0,10000}$/.test(output.scriptpubkey)
          )
            throw new Error("Invalid output script.");
          if (output.scriptpubkey_address === address && output.scriptpubkey !== script)
            throw new Error("Output address and script disagree.");
          if (output.scriptpubkey !== script) continue;
          if (output.scriptpubkey_address !== address)
            throw new Error("Missing exact destination address.");
          mentionsAddress = true;
          if (output.value === 0) continue;
          if (events.length >= MAX_EVENTS) {
            bounded = true;
            continue;
          }
          const eventId = `bitcoin:${txid}:${eventIndex}`;
          seen.add(eventId);
          events.push({
            eventId,
            protocol: "bitcoin",
            txid,
            eventIndex,
            source: null,
            destination: address,
            asset: "BTC",
            quantity: String(output.value),
            block: inclusion,
          });
        }
        // An outgoing transaction may have no output to this address. Prove the address
        // occurs in its inputs rather than accepting an unrelated injected history row.
        if (!mentionsAddress) {
          if (
            !Array.isArray(transaction.vin) ||
            !transaction.vin.some((raw) => {
              const previous = object(raw).prevout;
              if (previous == null) return false;
              const out = object(previous);
              return out.scriptpubkey_address === address && out.scriptpubkey === script;
            })
          )
            throw new Error("Unrelated transaction in address history.");
        }
      }
    }
    const orphanedEventIds: string[] = [];
    const removeUnverifiedPending = (eventId: string) => {
      const index = events.findIndex((event) => event.eventId === eventId && event.block === null);
      if (index >= 0) events.splice(index, 1);
    };
    for (const previous of known) {
      if (
        previous.protocol !== "bitcoin" ||
        previous.destination !== address ||
        !previous.block ||
        (seen.has(previous.eventId) &&
          events.some((event) => event.eventId === previous.eventId && event.block !== null))
      )
        continue;
      const height = previous.block.height;
      if (height > anchor.height) {
        bounded = true;
        removeUnverifiedPending(previous.eventId);
        continue;
      }
      if (!heights.has(height) && heights.size >= MAX_HEIGHTS) {
        bounded = true;
        removeUnverifiedPending(previous.eventId);
        continue;
      }
      heights.add(height);
      const canonical = await this.canonicalHash(height);
      if (canonical !== previous.block.hash) orphanedEventIds.push(previous.eventId);
      else if (seen.has(previous.eventId)) {
        // A pending row can lag a canonical inclusion. The store keeps the earlier
        // confirmation only after this positive check of its old inclusion block.
      } else if (events.length < MAX_EVENTS) {
        // Re-observe immutable historical outputs with positive canonical-block evidence,
        // even when they have aged beyond the bounded newest-history window.
        const {
          state: _state,
          firstObservedAt: _first,
          lastObservedAt: _last,
          wasReorged: _reorged,
          ...event
        } = previous;
        void _state;
        void _first;
        void _last;
        void _reorged;
        events.push(event);
      } else bounded = true;
    }
    return {
      protocol: "bitcoin",
      anchor,
      indexedHeight: anchor.height,
      historyComplete: historyComplete && !bounded,
      mempoolComplete: pending.length < 50 && !bounded,
      events,
      orphanedEventIds,
    };
  }
}
