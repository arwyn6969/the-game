import {
  getLeatherAddress,
  getLeatherProvider,
  LeatherWalletError,
  signLeatherChallenge,
  type LeatherProvider,
} from "./leather";
import {
  getWonderConnection,
  getWonderProvider,
  signWonderChallenge,
  WonderWalletError,
  type WonderProvider,
} from "./wonder";
import type { StampChallenge } from "./types";

export type WalletId = "wonder" | "leather";
export type WalletAddress = Readonly<{ walletId: WalletId; address: string; account?: number }>;
export type WalletProof = { address: string; message: string; signature: string };
export type WalletOptions = { signal?: AbortSignal };
export type WalletErrorCode =
  "unavailable" | "unsupported" | "rejected" | "invalid" | "cancelled" | "expired" | "changed";

export class WalletError extends Error {
  constructor(
    public readonly code: WalletErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WalletError";
  }
}

type Provider = LeatherProvider | WonderProvider;
type Connection = { payloads: unknown[]; seen: Set<unknown> };
type ProviderState = {
  revision: number;
  connecting?: Connection;
  expectedGrant?: { address: string; expiresAt: number };
  ignoredPayload?: unknown;
};
type Selection = {
  walletId: WalletId;
  provider: Provider;
  state: ProviderState;
  revision: number;
};
const selections = new WeakMap<WalletAddress, Selection>();
const providerStates = new WeakMap<Provider, ProviderState>();

function providerFor(walletId: WalletId): Provider | undefined {
  return walletId === "wonder"
    ? getWonderProvider()
    : walletId === "leather"
      ? getLeatherProvider()
      : undefined;
}

export function hasWalletProvider(walletId: WalletId): boolean {
  return Boolean(providerFor(walletId));
}

function changed(): never {
  throw new WalletError("changed", "The wallet account or provider changed. Connect again.");
}

function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new WalletError(
      "cancelled",
      "Wallet connection cancelled. Your selection has not changed.",
    );
}

function eventsFor(walletId: WalletId): string[] {
  return walletId === "wonder"
    ? ["accountsChanged", "disconnect", "networkChanged", "chainChanged"]
    : ["accountsChanged", "disconnect"];
}

function grantAccounts(payload: unknown, address: string): boolean {
  return Array.isArray(payload) && payload.length === 1 && payload[0] === address;
}

/** Correlate the one accountsChanged event emitted for a fresh site grant. */
function grantEvent(state: ProviderState | undefined, payload: unknown): boolean {
  if (!state) return false;
  if (state.connecting) {
    if (!state.connecting.seen.has(payload)) {
      state.connecting.seen.add(payload);
      state.connecting.payloads.push(payload);
    }
    return true;
  }
  if (state.ignoredPayload === payload && payload !== undefined) return true;
  if (
    state.expectedGrant &&
    Date.now() <= state.expectedGrant.expiresAt &&
    grantAccounts(payload, state.expectedGrant.address)
  ) {
    state.expectedGrant = undefined;
    state.ignoredPayload = payload;
    queueMicrotask(() => {
      if (state.ignoredPayload === payload) state.ignoredPayload = undefined;
    });
    return true;
  }
  return false;
}

function stateFor(provider: Provider, walletId: WalletId): ProviderState {
  let state = providerStates.get(provider);
  if (!state) {
    state = { revision: 0 };
    providerStates.set(provider, state);
    const current = state;
    // One bounded invalidation observer per injected provider, shared by all selections.
    for (const event of eventsFor(walletId))
      try {
        provider.on?.(event, (...args: unknown[]) => {
          if (walletId === "wonder" && event === "accountsChanged" && grantEvent(current, args[0]))
            return;
          current.expectedGrant = undefined;
          current.revision++;
        });
      } catch {
        // The before/after account and provider checks still apply without events.
      }
  }
  return state;
}

function checkSelection(selection: Selection, signal?: AbortSignal): void {
  checkCancellation(signal);
  if (
    providerFor(selection.walletId) !== selection.provider ||
    selection.state.revision !== selection.revision
  )
    changed();
}

function publicError(error: unknown): WalletError {
  if (error instanceof WalletError) return error;
  if (error instanceof LeatherWalletError || error instanceof WonderWalletError)
    return new WalletError(error.code, error.message);
  return new WalletError("invalid", "The wallet request could not be completed. Connect again.");
}

export async function getWalletAddress(
  walletId: WalletId,
  options: WalletOptions = {},
): Promise<WalletAddress> {
  checkCancellation(options.signal);
  const provider = providerFor(walletId);
  if (!provider)
    throw new WalletError(
      "unavailable",
      `${walletId === "wonder" ? "Wonder Wallet" : "Leather"} was not found in this browser. Install or enable its extension, then try again.`,
    );
  const state = stateFor(provider, walletId);
  if (state.connecting) changed();
  const connection: Connection | undefined =
    walletId === "wonder" ? { payloads: [], seen: new Set() } : undefined;
  state.connecting = connection;
  state.expectedGrant = undefined;
  const selection: Selection = { walletId, provider, state, revision: state.revision };
  try {
    let address: { address: string; account?: number };
    if (walletId === "wonder") {
      const result = await getWonderConnection({
        ...options,
        provider: provider as WonderProvider,
      });
      if (
        connection &&
        (connection.payloads.length > 1 ||
          connection.payloads.some((payload) => !grantAccounts(payload, result.address)) ||
          (!result.newlyApproved && connection.payloads.length > 0))
      )
        changed();
      // Chrome's event delivery may trail the connect response. Correlate at most one exact event.
      if (result.newlyApproved && connection?.payloads.length === 0)
        state.expectedGrant = { address: result.address, expiresAt: Date.now() + 5_000 };
      address = { address: result.address };
    } else {
      address = await getLeatherAddress({ ...options, provider: provider as LeatherProvider });
    }
    checkSelection(selection, options.signal);
    const selected = Object.freeze({ walletId, ...address });
    selections.set(selected, selection);
    return selected;
  } catch (error) {
    checkSelection(selection, options.signal);
    throw publicError(error);
  } finally {
    if (state.connecting === connection) state.connecting = undefined;
  }
}

export async function signWalletChallenge(
  walletId: WalletId,
  challenge: StampChallenge,
  selected: WalletAddress,
  options: WalletOptions = {},
): Promise<WalletProof> {
  checkCancellation(options.signal);
  const selection = selections.get(selected);
  if (!selection || walletId !== selected.walletId || selection.walletId !== walletId) changed();
  checkSelection(selection, options.signal);
  // Snapshot server fields so later caller mutations cannot change the requested message.
  const request = { ...challenge };
  if (
    request.address !== selected.address ||
    typeof request.message !== "string" ||
    !request.message ||
    request.message.length > 4096
  )
    throw new WalletError(
      "invalid",
      "The wallet challenge did not match the selected address. Connect again.",
    );
  if (!Number.isFinite(request.expiresAt) || request.expiresAt <= Date.now())
    throw new WalletError(
      "expired",
      "The wallet check expired. Connect again for a fresh message.",
    );
  try {
    if (walletId === "wonder") {
      const proof = await signWonderChallenge(request, selected, {
        ...options,
        provider: selection.provider as WonderProvider,
      });
      checkSelection(selection, options.signal);
      return proof;
    }
    const provider = selection.provider as LeatherProvider;
    const before = await getLeatherAddress({ ...options, provider });
    checkSelection(selection, options.signal);
    if (before.address !== selected.address || before.account !== selected.account) changed();
    const proof = await signLeatherChallenge(request, selected, { ...options, provider });
    checkSelection(selection, options.signal);
    const after = await getLeatherAddress({ ...options, provider });
    checkSelection(selection, options.signal);
    if (after.address !== selected.address || after.account !== selected.account) changed();
    if (request.expiresAt <= Date.now())
      throw new WalletError(
        "expired",
        "The wallet check expired. Connect again for a fresh message.",
      );
    return proof;
  } catch (error) {
    checkSelection(selection, options.signal);
    throw publicError(error);
  }
}

/** Observe only; registration never connects a wallet or prompts for a signature. */
export function watchWalletChanges(walletId: WalletId, callback: () => void): () => void {
  let active = true;
  let provider = providerFor(walletId);
  let unlisten = () => {};
  const notify = () => {
    if (active) callback();
  };
  function attach() {
    const target = provider;
    if (!target) return;
    const events = eventsFor(walletId);
    const handlers = new Map<string, (...args: unknown[]) => void>();
    for (const event of events)
      try {
        const handler = (...args: unknown[]) => {
          if (
            walletId === "wonder" &&
            event === "accountsChanged" &&
            grantEvent(providerStates.get(target), args[0])
          )
            return;
          notify();
        };
        handlers.set(event, handler);
        target.on?.(event, handler);
      } catch {
        // Optional provider events are not required for explicit verification.
      }
    unlisten = () => {
      for (const event of events)
        try {
          const handler = handlers.get(event);
          if (!handler) continue;
          if (target.off) target.off(event, handler);
          else target.removeListener?.(event, handler);
        } catch {
          // The active flag also makes any unremovable handler inert.
        }
    };
  }
  const replacement = () => {
    const next = providerFor(walletId);
    if (next === provider) return;
    unlisten();
    provider = next;
    attach();
    notify();
  };
  attach();
  if (typeof window !== "undefined") {
    window.addEventListener("focus", replacement);
    if (walletId === "wonder") window.addEventListener("wonder-wallet#initialized", replacement);
  }
  return () => {
    active = false;
    unlisten();
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", replacement);
      if (walletId === "wonder")
        window.removeEventListener("wonder-wallet#initialized", replacement);
    }
  };
}
