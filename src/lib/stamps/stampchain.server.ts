import { Address } from "bip322-js";
import type { StampHolding, StampHoldingsPage } from "./types";
import { stampCpidSchema } from "./validation";

export const STAMP_PAGE_SIZE = 24;
export const STAMP_REQUEST_TIMEOUT_MS = 8_000;
export const STAMP_MAX_RESPONSE_BYTES = 1024 * 1024;
const API_ORIGIN = "https://stampchain.io";
const MAX_SCAN_PAGES = 10;
const SCAN_PAGE_SIZE = 100;
const MAX_ASSET_QUANTITY = 18_446_744_073_709_551_615n;
const CPID = /^[A-Za-z0-9][A-Za-z0-9._@!-]{3,254}$/;
const HASH = /^[a-f0-9]{64}$/;
const MEDIA_URL = /^https:\/\/stampchain\.io\/stamps\/([a-f0-9]{64})\.(png|jpg|jpeg|webp)$/;

export type StampFetchOptions = { fetch?: typeof fetch };
type MediaType = NonNullable<StampHolding["mediaType"]>;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function approvedStampMedia(
  url: unknown,
  mime: unknown,
): { url: string; mime: MediaType; hash: string } | null {
  if (typeof url !== "string" || typeof mime !== "string") return null;
  const match = MEDIA_URL.exec(url);
  if (!match) return null;
  const expected =
    match[2] === "png" ? "image/png" : match[2] === "webp" ? "image/webp" : "image/jpeg";
  return mime === expected ? { url, mime: expected, hash: match[1] } : null;
}

/** Fixed-origin callers share byte, redirect and time bounds, including streamed bodies. */
export async function boundedStampFetch(
  url: string,
  allowedMime: readonly string[],
  options: StampFetchOptions = {},
): Promise<{ bytes: Uint8Array; mime: string }> {
  const parsed = new URL(url);
  if (parsed.origin !== API_ORIGIN || parsed.username || parsed.password)
    throw new Error("Unsupported Stampchain request origin.");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("The Stampchain request timed out. Please try again."));
    }, STAMP_REQUEST_TIMEOUT_MS);
  });
  const request = async () => {
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: allowedMime.join(", ") },
    });
    if (!response.ok || response.redirected || (response.url && response.url !== url))
      throw new Error(`Stampchain returned an unavailable response (${response.status}).`);
    const mime = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
    if (!allowedMime.includes(mime))
      throw new Error("Stampchain returned an unsupported content type.");
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > STAMP_MAX_RESPONSE_BYTES))
      throw new Error("The Stampchain response exceeds its size limit.");
    if (!response.body) throw new Error("Stampchain returned an empty response.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > STAMP_MAX_RESPONSE_BYTES) {
          void reader.cancel().catch(() => undefined);
          throw new Error("The Stampchain response exceeds its size limit.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes, mime };
  };
  try {
    return await Promise.race([request(), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function unsignedInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`Stampchain returned an invalid ${field}.`);
  return value;
}

function quantity(value: unknown, field: string): string {
  let text: string;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) text = String(value);
  else if (typeof value === "string" && /^(0|[1-9][0-9]{0,19})$/.test(value)) text = value;
  else throw new Error(`Stampchain returned an unsafe ${field}.`);
  if (BigInt(text) > MAX_ASSET_QUANTITY) throw new Error(`Stampchain returned an unsafe ${field}.`);
  return text;
}

function flag(value: unknown, field: string): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  throw new Error(`Stampchain returned an invalid ${field}.`);
}

function validateAddress(address: string): void {
  if (
    typeof address !== "string" ||
    address.length > 90 ||
    !/^(?:[13][1-9A-HJ-NP-Za-km-z]+|bc1[a-z0-9]+)$/.test(address) ||
    !Address.isValidBitcoinAddress(address)
  )
    throw new Error("A valid mainnet Bitcoin address is required.");
}

function holding(row: unknown, address: string): StampHolding | null {
  if (!object(row) || typeof row.cpid !== "string" || !CPID.test(row.cpid))
    throw new Error("Stampchain returned an invalid asset identity.");
  if (row.address !== address) throw new Error("Stampchain returned holdings for another address.");
  if (!stampCpidSchema.safeParse(row.cpid).success) return null;
  const divisible = flag(row.divisible, "divisibility");
  // Divisible balances are outside this packet, including fractional quantities.
  if (divisible) return null;
  const balance = quantity(row.balance, "balance");
  if (balance === "0") return null;
  const media = approvedStampMedia(row.stamp_url, row.stamp_mimetype);
  if (!media) return null;
  if (typeof row.tx_hash !== "string" || !HASH.test(row.tx_hash) || media.hash !== row.tx_hash)
    throw new Error("Stampchain returned inconsistent artwork metadata.");
  const stampNumber = row.stamp === null ? null : row.stamp;
  if (
    stampNumber !== null &&
    (typeof stampNumber !== "number" || !Number.isSafeInteger(stampNumber))
  )
    throw new Error("Stampchain returned an invalid stamp number.");
  if (stampNumber !== null && stampNumber < 0) return null;
  const supply = row.supply === null ? null : quantity(row.supply, "supply");
  const locked = row.locked === null ? false : flag(row.locked, "lock status");
  return {
    cpid: row.cpid,
    stampNumber,
    quantity: balance,
    supply,
    divisible: false,
    locked,
    title: stampNumber === null ? row.cpid.slice(0, 160) : `Stamp #${stampNumber}`,
    mediaUrl: media.url,
    mediaType: media.mime,
  };
}

async function requestPage(
  address: string,
  page: number,
  limit: number,
  options: StampFetchOptions,
): Promise<StampHoldingsPage> {
  validateAddress(address);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100_000)
    throw new Error("A valid stamp holdings page is required.");
  const url = `${API_ORIGIN}/api/v2/stamps/balance/${encodeURIComponent(address)}?limit=${limit}&page=${page}`;
  const { bytes } = await boundedStampFetch(url, ["application/json"], options);
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("Stampchain returned unreadable holdings.");
  }
  if (!object(data) || !Array.isArray(data.data) || data.data.length > limit)
    throw new Error("Stampchain returned malformed holdings.");
  const actualPage = unsignedInteger(data.page, "page");
  const actualLimit = unsignedInteger(data.limit, "page size");
  const totalPages = unsignedInteger(data.totalPages, "page count");
  const total = unsignedInteger(data.total, "holdings count");
  const indexedBlock = unsignedInteger(data.last_block, "indexed block");
  const expectedPages = Math.ceil(total / limit);
  if (
    actualPage !== page ||
    actualLimit !== limit ||
    indexedBlock === 0 ||
    (totalPages !== expectedPages && !(total === 0 && totalPages === 1)) ||
    (total === 0 ? page !== 1 || data.data.length !== 0 : page > totalPages) ||
    data.data.length !== Math.min(limit, Math.max(0, total - (page - 1) * limit))
  )
    throw new Error("Stampchain returned inconsistent pagination or index state.");
  const assets: StampHolding[] = [];
  const seen = new Set<string>();
  for (const row of data.data) {
    if (!object(row) || typeof row.cpid !== "string" || seen.has(row.cpid))
      throw new Error("Stampchain returned missing or duplicate asset identities.");
    seen.add(row.cpid);
    const asset = holding(row, address);
    if (asset) assets.push(asset);
  }
  return {
    assets,
    page,
    totalPages,
    total,
    unsupported: data.data.length - assets.length,
    indexedBlock,
  };
}

/** A live page; unsupported art/asset kinds remain visible in its count. */
export function listStampHoldings(
  address: string,
  page = 1,
  options: StampFetchOptions = {},
): Promise<StampHoldingsPage> {
  return requestPage(address, page, STAMP_PAGE_SIZE, options);
}

/** Fresh bounded ownership lookup. An incomplete scan is not evidence of absence. */
export async function findStampHolding(
  address: string,
  cpid: string,
  options: StampFetchOptions = {},
): Promise<StampHolding | null> {
  if (typeof cpid !== "string" || !CPID.test(cpid) || !stampCpidSchema.safeParse(cpid).success)
    throw new Error("A supported stamp asset identity is required.");
  let snapshot: StampHoldingsPage | undefined;
  const seen = new Set<string>();
  for (let page = 1; page <= MAX_SCAN_PAGES; page++) {
    const result = await requestPage(address, page, SCAN_PAGE_SIZE, options);
    if (
      snapshot &&
      (result.total !== snapshot.total ||
        result.totalPages !== snapshot.totalPages ||
        result.indexedBlock !== snapshot.indexedBlock)
    )
      throw new Error("Stamp holdings changed while checking ownership. Please try again.");
    snapshot ??= result;
    for (const asset of result.assets) {
      if (seen.has(asset.cpid))
        throw new Error("Stampchain returned overlapping ownership pages. Please try again.");
      seen.add(asset.cpid);
      if (asset.cpid === cpid) return asset;
    }
    if (page >= result.totalPages) return null;
  }
  throw new Error(
    "This wallet exceeds the supported ownership scan. Its remaining stamps were not checked.",
  );
}
