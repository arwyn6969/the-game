import type { StampChallenge } from "./types";

/** Read-only Bitcoin methods only; wallet-created connect proofs are never accepted. */
export type WonderProvider = {
  requestAccounts: () => Promise<unknown>;
  getAccounts: () => Promise<unknown>;
  signMessage: (message: string, address?: string) => Promise<unknown>;
  on?: (event: string, listener: () => void) => unknown;
  off?: (event: string, listener: () => void) => unknown;
  removeListener?: (event: string, listener: () => void) => unknown;
};
export type WonderAddress = { address: string };
export type WonderProof = { address: string; message: string; signature: string };
export type WonderOptions = { provider?: WonderProvider; signal?: AbortSignal };
export type WonderWalletErrorCode =
  "unavailable" | "unsupported" | "rejected" | "invalid" | "cancelled" | "expired" | "changed";

export class WonderWalletError extends Error {
  constructor(
    public readonly code: WonderWalletErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WonderWalletError";
  }
}

const MAINNET_P2WPKH = /^bc1q[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{38}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function getWonderProvider(): WonderProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const provider = (window as unknown as { wonderWallet?: unknown }).wonderWallet;
  return object(provider) &&
    typeof provider.requestAccounts === "function" &&
    typeof provider.getAccounts === "function" &&
    typeof provider.signMessage === "function"
    ? (provider as WonderProvider)
    : undefined;
}

export function hasWonderProvider(): boolean {
  return Boolean(getWonderProvider());
}

function cancelled(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new WonderWalletError(
      "cancelled",
      "Wallet connection cancelled. Your selection has not changed.",
    );
}

function walletError(value: unknown): WonderWalletError {
  if (value instanceof WonderWalletError) return value;
  const outer = object(value) ? value : {};
  const detail = object(outer.error) ? outer.error : outer;
  if (
    detail.code === 4001 ||
    detail.code === "USER_REJECTION" ||
    (typeof detail.message === "string" && /reject|declin|cancel/i.test(detail.message))
  )
    return new WonderWalletError(
      "rejected",
      "Wallet request declined. Your selection has not changed.",
    );
  return new WonderWalletError(
    "invalid",
    "The wallet request could not be completed. Try again in Wonder Wallet.",
  );
}

async function request(call: () => Promise<unknown>, signal?: AbortSignal): Promise<unknown> {
  cancelled(signal);
  let onAbort: (() => void) | undefined;
  try {
    // Abort discards a late reply; extension popup dismissal remains under user control.
    const response = await Promise.race([
      Promise.resolve().then(() => {
        cancelled(signal);
        return call();
      }),
      new Promise<never>((_resolve, reject) => {
        if (!signal) return;
        onAbort = () =>
          reject(
            new WonderWalletError(
              "cancelled",
              "Wallet connection cancelled. Your selection has not changed.",
            ),
          );
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      }),
    ]);
    cancelled(signal);
    if (object(response) && Object.hasOwn(response, "error")) throw walletError(response);
    return response;
  } catch (error) {
    cancelled(signal);
    throw walletError(error);
  } finally {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

function providerFor(options: WonderOptions): WonderProvider {
  const provider = options.provider ?? getWonderProvider();
  if (!provider)
    throw new WonderWalletError(
      "unavailable",
      "Wonder Wallet was not found in this browser. Install or enable its extension, then try again.",
    );
  return provider;
}

function activeAddress(accounts: unknown): string {
  if (
    !Array.isArray(accounts) ||
    accounts.length > 256 ||
    accounts.some((address) => typeof address !== "string" || address.length > 128)
  )
    throw new WonderWalletError("invalid", "Wonder Wallet returned an unreadable account list.");
  // signMessage signs the active account, not an arbitrary address later in the list.
  const address = accounts[0];
  if (typeof address !== "string" || !MAINNET_P2WPKH.test(address))
    throw new WonderWalletError(
      "unsupported",
      "Choose a Bitcoin mainnet Native SegWit account in Wonder Wallet. Other address types are not supported yet.",
    );
  return address;
}

export async function getWonderCurrentAddress(options: WonderOptions = {}): Promise<WonderAddress> {
  const provider = providerFor(options);
  const accounts = await request(() => provider.getAccounts(), options.signal);
  return { address: activeAddress(accounts) };
}

export async function getWonderConnection(
  options: WonderOptions = {},
): Promise<WonderAddress & { newlyApproved: boolean }> {
  const provider = providerFor(options);
  const response = await request(() => provider.requestAccounts(), options.signal);
  if (!object(response) && !Array.isArray(response))
    throw new WonderWalletError(
      "invalid",
      "Wonder Wallet returned an unreadable connection reply.",
    );
  // The extension returns an array for a previously permitted site, and an object on new approval.
  const address = activeAddress(Array.isArray(response) ? response : response.accounts);
  // The automatic wallet-generated proof has no server nonce and is deliberately ignored.
  const current = await getWonderCurrentAddress({ ...options, provider });
  if (current.address !== address)
    throw new WonderWalletError("changed", "The wallet account changed. Connect again.");
  return { address, newlyApproved: !Array.isArray(response) };
}

export async function getWonderAddress(options: WonderOptions = {}): Promise<WonderAddress> {
  const { address } = await getWonderConnection(options);
  return { address };
}

/** Match only the server's unprefixed, canonical two-item BIP-322-simple framing. */
function simpleSignature(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 60 || value.length > 148 || !BASE64.test(value))
    return false;
  try {
    const witness = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    if (btoa(String.fromCharCode(...witness)) !== value || witness[0] !== 2) return false;
    const length = witness[1];
    const keyOffset = 2 + length;
    if (
      length < 9 ||
      length > 73 ||
      witness[keyOffset] !== 33 ||
      witness.length !== keyOffset + 34 ||
      ![2, 3].includes(witness[keyOffset + 1]) ||
      witness[2] !== 0x30 ||
      witness[3] !== length - 3 ||
      witness[4] !== 2 ||
      witness[keyOffset - 1] !== 1
    )
      return false;
    const rLength = witness[5];
    const sTag = 6 + rLength;
    const sLength = witness[sTag + 1];
    if (
      rLength < 1 ||
      rLength > 33 ||
      sTag + 2 >= keyOffset - 1 ||
      witness[sTag] !== 2 ||
      sLength < 1 ||
      sLength > 33 ||
      sTag + 2 + sLength !== keyOffset - 1
    )
      return false;
    for (const [start, size] of [
      [6, rLength],
      [sTag + 2, sLength],
    ])
      if (
        witness[start] & 0x80 ||
        (size > 1 && witness[start] === 0 && !(witness[start + 1] & 0x80))
      )
        return false;
    return true;
  } catch {
    return false;
  }
}

function validateChallenge(challenge: StampChallenge, selected: WonderAddress): void {
  if (
    !MAINNET_P2WPKH.test(selected.address) ||
    challenge.address !== selected.address ||
    typeof challenge.message !== "string" ||
    !challenge.message ||
    challenge.message.length > 4096
  )
    throw new WonderWalletError(
      "invalid",
      "The wallet challenge did not match the selected address. Connect again.",
    );
  if (!Number.isFinite(challenge.expiresAt) || challenge.expiresAt <= Date.now())
    throw new WonderWalletError(
      "expired",
      "The wallet check expired. Connect again for a fresh message.",
    );
}

export async function signWonderChallenge(
  challenge: StampChallenge,
  selected: WonderAddress,
  options: WonderOptions = {},
): Promise<WonderProof> {
  cancelled(options.signal);
  validateChallenge(challenge, selected);
  const provider = providerFor(options);
  const before = await getWonderCurrentAddress({ ...options, provider });
  if (before.address !== selected.address)
    throw new WonderWalletError("changed", "The wallet account changed. Connect again.");
  validateChallenge(challenge, selected);
  const signature = await request(
    () => provider.signMessage(challenge.message, selected.address),
    options.signal,
  );
  if (!simpleSignature(signature))
    throw new WonderWalletError(
      "invalid",
      "Wonder Wallet returned an unsupported message signature. Your selection has not changed.",
    );
  const after = await getWonderCurrentAddress({ ...options, provider });
  if (after.address !== selected.address)
    throw new WonderWalletError("changed", "The wallet account changed. Connect again.");
  validateChallenge(challenge, selected);
  return { address: selected.address, message: challenge.message, signature };
}
