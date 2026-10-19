import type { StampChallenge } from "./types";

/** Narrow client adapter: no transaction, PSBT, sending or custody methods. */
export type LeatherProvider = {
  request: (
    method: "getAddresses" | "signMessage",
    params?: Record<string, unknown>,
  ) => Promise<unknown>;
  on?: (event: string, listener: () => void) => unknown;
  off?: (event: string, listener: () => void) => unknown;
  removeListener?: (event: string, listener: () => void) => unknown;
};
export type LeatherAddress = { address: string; account?: number };
export type LeatherProof = { address: string; message: string; signature: string };
export type LeatherOptions = { provider?: LeatherProvider; signal?: AbortSignal };
export type LeatherWalletErrorCode =
  "unavailable" | "unsupported" | "rejected" | "invalid" | "cancelled" | "expired";

export class LeatherWalletError extends Error {
  constructor(
    public readonly code: LeatherWalletErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LeatherWalletError";
  }
}

const MAINNET_P2WPKH = /^bc1q[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/;
const SIMPLE_SIGNATURE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function getLeatherProvider(): LeatherProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const provider = (window as unknown as { LeatherProvider?: unknown }).LeatherProvider;
  return object(provider) && typeof provider.request === "function"
    ? (provider as LeatherProvider)
    : undefined;
}

export function hasLeatherProvider(): boolean {
  return Boolean(getLeatherProvider());
}

function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new LeatherWalletError(
      "cancelled",
      "Wallet connection cancelled. Your selection has not changed.",
    );
}

function walletError(value: unknown): LeatherWalletError {
  if (value instanceof LeatherWalletError) return value;
  const outer = object(value) ? value : {};
  const detail = object(outer.error) ? outer.error : outer;
  if (
    detail.code === 4001 ||
    detail.code === "USER_REJECTION" ||
    (typeof detail.message === "string" && /reject|declin|cancel/i.test(detail.message))
  )
    return new LeatherWalletError(
      "rejected",
      "Wallet request declined. Your selection has not changed.",
    );
  return new LeatherWalletError(
    "invalid",
    "The wallet request could not be completed. Try again in Leather.",
  );
}

async function request(
  method: "getAddresses" | "signMessage",
  params: Record<string, unknown> | undefined,
  options: LeatherOptions,
): Promise<unknown> {
  checkCancellation(options.signal);
  const provider = options.provider ?? getLeatherProvider();
  if (!provider || typeof provider.request !== "function")
    throw new LeatherWalletError(
      "unavailable",
      "Leather was not found in this browser. Install or enable its extension, then try again.",
    );
  // Leather does not expose popup cancellation; abort only ignores the response.
  const signal = options.signal;
  let onAbort: (() => void) | undefined;
  try {
    const response = await Promise.race([
      provider.request(method, params),
      new Promise<never>((_resolve, reject) => {
        if (!signal) return;
        onAbort = () =>
          reject(
            new LeatherWalletError(
              "cancelled",
              "Wallet connection cancelled. Your selection has not changed.",
            ),
          );
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      }),
    ]);
    checkCancellation(signal);
    if (object(response) && Object.hasOwn(response, "error")) throw walletError(response);
    return response;
  } catch (error) {
    checkCancellation(signal);
    throw walletError(error);
  } finally {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

function accountFor(path: unknown): number | undefined {
  if (path === undefined) return undefined;
  if (typeof path !== "string")
    throw new LeatherWalletError("unsupported", "This Leather address path is not supported.");
  const match = /^m\/84'\/0'\/(0|[1-9][0-9]*)'\/0\/0$/.exec(path);
  const account = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(account) || account < 0 || account >= 2 ** 31)
    throw new LeatherWalletError(
      "unsupported",
      "Choose a mainnet Native SegWit receiving address in Leather.",
    );
  return account;
}

/** Client filtering is compatibility only; the server verifies address and proof. */
export async function getLeatherAddress(options: LeatherOptions = {}): Promise<LeatherAddress> {
  const response = await request("getAddresses", undefined, options);
  const addresses =
    object(response) && object(response.result) ? response.result.addresses : undefined;
  if (!Array.isArray(addresses) || addresses.length > 256)
    throw new LeatherWalletError(
      "invalid",
      "Leather returned an unreadable address list. Try connecting again.",
    );
  for (const entry of addresses) {
    if (
      !object(entry) ||
      entry.symbol !== "BTC" ||
      entry.type !== "p2wpkh" ||
      typeof entry.address !== "string" ||
      !MAINNET_P2WPKH.test(entry.address) ||
      (entry.network !== undefined && entry.network !== "mainnet")
    )
      continue;
    try {
      const account = accountFor(entry.derivationPath);
      return { address: entry.address, ...(account === undefined ? {} : { account }) };
    } catch (error) {
      if (!(error instanceof LeatherWalletError) || error.code !== "unsupported") throw error;
    }
  }
  throw new LeatherWalletError(
    "unsupported",
    "This preview supports Leather mainnet Native SegWit addresses only. Taproot, testnet and other wallets are not supported yet.",
  );
}

export async function signLeatherChallenge(
  challenge: StampChallenge,
  selected: LeatherAddress,
  options: LeatherOptions = {},
): Promise<LeatherProof> {
  checkCancellation(options.signal);
  if (
    !MAINNET_P2WPKH.test(selected.address) ||
    challenge.address !== selected.address ||
    typeof challenge.message !== "string" ||
    !challenge.message ||
    challenge.message.length > 16_384 ||
    (selected.account !== undefined &&
      (!Number.isSafeInteger(selected.account) ||
        selected.account < 0 ||
        selected.account >= 2 ** 31))
  )
    throw new LeatherWalletError(
      "invalid",
      "The wallet challenge did not match the selected address. Connect again.",
    );
  if (!Number.isFinite(challenge.expiresAt) || challenge.expiresAt <= Date.now())
    throw new LeatherWalletError(
      "expired",
      "The wallet check expired. Connect again for a fresh message.",
    );
  const response = await request(
    "signMessage",
    {
      type: "bip322",
      message: challenge.message,
      paymentType: "p2wpkh",
      network: "mainnet",
      ...(selected.account === undefined ? {} : { account: selected.account }),
    },
    options,
  );
  const proof = object(response) && object(response.result) ? response.result : undefined;
  if (
    !proof ||
    proof.address !== challenge.address ||
    proof.message !== challenge.message ||
    typeof proof.signature !== "string" ||
    proof.signature.length < 8 ||
    proof.signature.length > 2_048 ||
    !SIMPLE_SIGNATURE.test(proof.signature)
  )
    throw new LeatherWalletError(
      "invalid",
      "Leather signed a different address or message, or returned an unsupported signature. Your selection has not changed.",
    );
  if (challenge.expiresAt <= Date.now())
    throw new LeatherWalletError(
      "expired",
      "The wallet check expired while waiting. Connect again for a fresh message.",
    );
  return {
    address: proof.address,
    message: proof.message,
    signature: proof.signature,
  } as LeatherProof;
}
