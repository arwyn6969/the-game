export const ESPLORA_ORIGIN = "https://blockstream.info";
export const COUNTERPARTY_ORIGIN = "https://api.counterparty.io:4000";
export const CHAIN_REQUEST_TIMEOUT_MS = 6_000;
const MAX_BYTES = 2 * 1024 * 1024;
export type ChainFetchOptions = { fetch?: typeof fetch; signal?: AbortSignal; timeoutMs?: number };

/** Only the documented fixed mainnet indexers; never a client-supplied URL or signer. */
export async function chainRead(
  url: string,
  format: "json" | "text",
  options: ChainFetchOptions = {},
): Promise<unknown> {
  const parsed = new URL(url);
  if (
    ![ESPLORA_ORIGIN, COUNTERPARTY_ORIGIN].includes(parsed.origin) ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    (parsed.origin === ESPLORA_ORIGIN && !parsed.pathname.startsWith("/api/")) ||
    (parsed.origin === COUNTERPARTY_ORIGIN && !parsed.pathname.startsWith("/v2/"))
  )
    throw new Error("Unsupported chain indexer.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => {
        controller.abort();
        reject(new Error("Chain observation timed out."));
      },
      Math.min(options.timeoutMs ?? CHAIN_REQUEST_TIMEOUT_MS, CHAIN_REQUEST_TIMEOUT_MS),
    );
  });
  const work = async () => {
    if (options.signal?.aborted) throw new Error("Chain observation cancelled.");
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
      headers: { Accept: format === "json" ? "application/json" : "text/plain" },
    });
    if (!response.ok || response.redirected || (response.url && response.url !== url))
      throw new Error("Chain indexer unavailable.");
    const mime = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (mime !== (format === "json" ? "application/json" : "text/plain"))
      throw new Error("Unexpected chain response type.");
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES))
      throw new Error("Chain response is too large.");
    if (!response.body) throw new Error("Empty chain response.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw new Error("Chain response is too large.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return format === "json" ? (JSON.parse(text) as unknown) : text;
  };
  try {
    return await Promise.race([work(), deadline]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    controller.abort();
  }
}
