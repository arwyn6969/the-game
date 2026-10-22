import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  beginStampProof,
  chooseStampAppearance,
  clearStampAppearance,
  disconnectStampIdentity,
  finishStampProof,
  getStampIdentity,
  previewStampImage,
} from "@/lib/stamps.functions";
import {
  getWalletAddress,
  signWalletChallenge,
  WalletError,
  watchWalletChanges,
  type WalletId,
} from "@/lib/stamps/wallet";
import {
  isStampSuppressed,
  isStampVerificationRequired,
  rememberStampSession,
  setStampSuppressed,
  setStampVerificationRequired,
} from "@/lib/stamps/client-session";
import { StampPanelRequests, type StampPanelOperation } from "@/lib/stamps/panel-requests";
import type {
  StampAppearance,
  StampCrop,
  StampHolding,
  StampIdentityView,
  StampImage,
  StampResult,
  StampScope,
} from "@/lib/stamps/types";

type Mode = "original" | "portrait" | "head";
type DraftStamp = Pick<StampHolding, "cpid" | "title" | "stampNumber">;
type Operation = StampPanelOperation;
const DEFAULT_CROP: StampCrop = { x: 0, y: 0, size: 1 };
const WALLET_NAMES: Record<WalletId, string> = { wonder: "Wonder Wallet", leather: "Leather" };

class StampPanelError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function readResult<T>(result: StampResult<T>): T {
  if (!result.ok) throw new StampPanelError(result.error, result.message);
  return result.value;
}

function safeImage(image: StampImage | null | undefined): image is StampImage {
  return Boolean(
    image &&
    typeof image.pngDataUrl === "string" &&
    image.pngDataUrl.length <= 1_500_000 &&
    /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image.pngDataUrl),
  );
}

function currentAppearance(
  appearance: StampAppearance | null,
  scope: StampScope,
): StampAppearance | null {
  return appearance &&
    appearance.worldId === scope.worldId &&
    appearance.characterId === scope.characterId &&
    appearance.expiresAt > Date.now() &&
    safeImage(appearance)
    ? appearance
    : null;
}

export function StampIdentityPanel({
  scope,
  onAppearance,
  onClose,
}: {
  scope: StampScope;
  onAppearance: (appearance: StampAppearance | null) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const modeId = useId();
  const walletSelectId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<StampIdentityView | null>(null);
  const [draft, setDraft] = useState<DraftStamp | null>(null);
  const [preview, setPreview] = useState<StampImage | null>(null);
  const [mode, setMode] = useState<Mode>("original");
  const [crop, setCrop] = useState<StampCrop>({ ...DEFAULT_CROP });
  const [busy, setBusy] = useState(false);
  const [disconnectPending, setDisconnectPending] = useState(false);
  const [note, setNote] = useState("Checking your stamp connection…");
  const [error, setError] = useState(false);
  const [walletId, setWalletId] = useState<WalletId>("wonder");
  const [walletNeedsVerification, setWalletNeedsVerification] = useState(false);
  const mounted = useRef(false);
  const callbacks = useRef({ onAppearance, onClose });
  const currentScopeKey = `${scope.worldId}:${scope.characterId}`;
  const scopeKey = useRef(currentScopeKey);
  const viewRef = useRef(view);
  const polling = useRef(true);
  const currentWallet = useRef(walletId);
  const walletVerificationRequired = useRef(false);
  const disconnectPendingRef = useRef(disconnectPending);
  const requests = useRef<StampPanelRequests | null>(null);
  if (!requests.current)
    requests.current = new StampPanelRequests((operation) => {
      if (
        operation.background ||
        !mounted.current ||
        operation.scopeKey !== scopeKey.current ||
        operation.walletId !== currentWallet.current
      )
        return;
      setBusy(false);
      setError(true);
      setNote(
        "This request took too long. Your draft is still here; try again. If a wallet prompt is open, dismiss it before reconnecting. A change already accepted by the service may still finish.",
      );
    });
  callbacks.current = { onAppearance, onClose };
  scopeKey.current = currentScopeKey;
  viewRef.current = view;
  currentWallet.current = walletId;
  disconnectPendingRef.current = disconnectPending;
  const walletName = WALLET_NAMES[walletId];

  function isCurrent(operation: Operation): boolean {
    return (
      mounted.current &&
      requests.current!.isCurrent(operation) &&
      operation.scopeKey === scopeKey.current &&
      operation.walletId === currentWallet.current &&
      !operation.abort.signal.aborted
    );
  }

  function begin(background = false, wallet = false): Operation | null {
    const operation = requests.current!.begin(
      // Polling keeps its mount-time callback; use the current wallet selection.
      { scopeKey: scopeKey.current, walletId: currentWallet.current },
      background,
      wallet,
    );
    if (!operation) return null;
    if (!background) {
      setBusy(true);
      setError(false);
    }
    return operation;
  }

  function finish(operation: Operation): void {
    if (!isCurrent(operation)) return;
    requests.current!.finish(operation);
    if (!operation.background) setBusy(false);
  }

  function cancel(): void {
    invalidate();
    setBusy(false);
    setError(false);
    setNote(
      "Stopped waiting for this request. A change already accepted by the service may still finish.",
    );
  }

  function invalidate(): void {
    requests.current!.invalidate();
  }

  function close(): void {
    cancel();
    callbacks.current.onClose();
  }

  function failure(cause: unknown, operation: Operation): void {
    if (!isCurrent(operation)) return;
    // An unavailable background check must not interrupt the player's draft.
    if (operation.background && !(cause instanceof StampPanelError && cause.code === "expired"))
      return;
    if (cause instanceof WalletError && cause.code === "changed") {
      resetWalletPresentation(cause.message.slice(0, 400));
      setError(true);
      return;
    }
    if (cause instanceof StampPanelError && cause.code === "expired") {
      setView((previous) =>
        previous ? { ...previous, connected: false, appearance: null, holdings: null } : previous,
      );
      callbacks.current.onAppearance(null);
    }
    if (
      cause instanceof StampPanelError &&
      cause.code === "not-held" &&
      operation.cpid !== undefined &&
      viewRef.current?.appearance?.cpid === operation.cpid
    ) {
      setView((previous) => (previous ? { ...previous, appearance: null } : previous));
      callbacks.current.onAppearance(null);
    }
    setError(true);
    setNote(
      cause instanceof WalletError || cause instanceof StampPanelError
        ? cause.message.slice(0, 400)
        : "The stamp service could not be reached. Your draft is still here; try again.",
    );
  }

  function acceptView(next: StampIdentityView, operation: Operation, resetDraft = false): void {
    if (!isCurrent(operation)) return;
    const lostConnection = Boolean(viewRef.current?.connected && !next.connected);
    rememberStampSession(scope, next.connected);
    const appearance = next.connected ? currentAppearance(next.appearance, scope) : null;
    setView({ ...next, appearance });
    callbacks.current.onAppearance(appearance);
    if (resetDraft) {
      setDraft(
        appearance
          ? { cpid: appearance.cpid, title: appearance.title, stampNumber: appearance.stampNumber }
          : null,
      );
      setMode(appearance?.mode ?? "original");
      setCrop(appearance ? { ...appearance.crop } : { ...DEFAULT_CROP });
      setPreview(appearance);
    }
    if (!operation.background || lostConnection)
      setNote(
        next.connected
          ? "Your holdings have been checked. Choose a stamp to preview it."
          : next.address || lostConnection
            ? "Your wallet check expired. Sign again to refresh your holdings."
            : "Choose a wallet and connect to browse stamps you hold.",
      );
  }

  async function refresh(page?: number, resetDraft = false, background = false): Promise<void> {
    if (isStampSuppressed(scope) || walletVerificationRequired.current) return;
    const operation = begin(background);
    if (!operation) return;
    if (!background)
      setNote(resetDraft ? "Checking your stamp connection…" : "Refreshing your stamp holdings…");
    try {
      const next = readResult(
        await getStampIdentity({
          data: { scope, ...(page === undefined ? {} : { page }) },
          signal: operation.abort.signal,
        }),
      );
      acceptView(next, operation, resetDraft);
    } catch (cause) {
      failure(cause, operation);
    } finally {
      finish(operation);
    }
  }

  useEffect(() => {
    mounted.current = true;
    polling.current = true;
    invalidate();
    setView(null);
    setDraft(null);
    setPreview(null);
    setMode("original");
    setCrop({ ...DEFAULT_CROP });
    setBusy(false);
    disconnectPendingRef.current = false;
    setDisconnectPending(false);
    setError(false);
    walletVerificationRequired.current = false;
    setWalletNeedsVerification(false);
    setNote("Checking your stamp connection…");
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    if (isStampSuppressed(scope) || isStampVerificationRequired(scope)) {
      polling.current = false;
      const required = isStampVerificationRequired(scope);
      walletVerificationRequired.current = required;
      setWalletNeedsVerification(required);
      disconnectPendingRef.current = !required;
      setDisconnectPending(!required);
      setNote(
        required
          ? "Your local wallet check is hidden. Connect your selected wallet to verify it again."
          : "Your local stamp appearance is cleared. Retry Disconnect to confirm it before reconnecting.",
      );
    } else void refresh(undefined, true);
    const interval = setInterval(() => {
      if (polling.current && !requests.current!.current && !isStampSuppressed(scope))
        void refresh(viewRef.current?.holdings?.page, false, true);
    }, 60_000);
    return () => {
      mounted.current = false;
      invalidate();
      clearInterval(interval);
      if (
        document.activeElement === document.body &&
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected
      )
        previousFocus.focus();
    };
    // A new identity invalidates every pending callback and resets only this panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScopeKey]);

  function resetWalletPresentation(message: string): void {
    invalidate();
    polling.current = false;
    walletVerificationRequired.current = true;
    setWalletNeedsVerification(true);
    setBusy(false);
    setView(null);
    setDraft(null);
    setPreview(null);
    setMode("original");
    setCrop({ ...DEFAULT_CROP });
    setStampSuppressed(scope, true);
    setStampVerificationRequired(scope, !disconnectPendingRef.current);
    rememberStampSession(scope, false);
    callbacks.current.onAppearance(null);
    setError(false);
    setNote(
      disconnectPendingRef.current
        ? "Your local stamp appearance is cleared. Retry Disconnect to confirm it before reconnecting."
        : message,
    );
  }

  function selectWallet(next: WalletId): void {
    if (next === currentWallet.current) return;
    currentWallet.current = next;
    setWalletId(next);
    resetWalletPresentation(
      `${WALLET_NAMES[next]} selected. Verify this wallet to load its stamps; your previous wallet check is hidden.`,
    );
  }

  useEffect(() => {
    return watchWalletChanges(walletId, () => {
      if (!mounted.current || currentWallet.current !== walletId) return;
      resetWalletPresentation(
        `${WALLET_NAMES[walletId]} changed or disconnected. Verify your wallet again to load its stamps.`,
      );
    });
    // Wallet events remove local presentation and never start a new verification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletId, currentScopeKey]);

  useEffect(() => {
    const appearance = view?.appearance;
    if (!appearance) return;
    const capturedScope = currentScopeKey;
    const timeout = setTimeout(
      () => {
        if (
          !mounted.current ||
          scopeKey.current !== capturedScope ||
          viewRef.current?.appearance !== appearance
        )
          return;
        callbacks.current.onAppearance(null);
        setView((previous) =>
          previous?.appearance?.expiresAt === appearance.expiresAt
            ? { ...previous, appearance: null }
            : previous,
        );
      },
      Math.max(0, appearance.expiresAt - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [view?.appearance, currentScopeKey]);

  async function connect(): Promise<void> {
    if (disconnectPendingRef.current) return;
    const operation = begin(false, true);
    if (!operation) return;
    polling.current = true;
    // An explicit reconnect hides the old proof while the new account grant is reviewed.
    // Wonder may acknowledge that grant with accountsChanged before its request resolves.
    setView(null);
    setDraft(null);
    setPreview(null);
    setMode("original");
    setCrop({ ...DEFAULT_CROP });
    setStampSuppressed(scope, true);
    setStampVerificationRequired(scope, true);
    rememberStampSession(scope, false);
    walletVerificationRequired.current = true;
    setWalletNeedsVerification(true);
    callbacks.current.onAppearance(null);
    setNote(
      `Choose your mainnet Native SegWit address in ${walletName}. ${
        walletId === "wonder"
          ? "Wonder may first request its own connection proof; the game's fresh verification message follows. "
          : ""
      }Its prompt may open behind this window; check the popup/extension icon.`,
    );
    try {
      const selected = await getWalletAddress(operation.walletId, {
        signal: operation.abort.signal,
      });
      if (!isCurrent(operation)) return;
      const challenge = readResult(
        await beginStampProof({
          data: { scope, address: selected.address },
          signal: operation.abort.signal,
        }),
      );
      if (!isCurrent(operation)) return;
      setNote(
        `Review the message in ${walletName}. Signing this check does not spend BTC or move stamps. Its prompt may open behind this window; check the popup/extension icon.`,
      );
      const proof = await signWalletChallenge(operation.walletId, challenge, selected, {
        signal: operation.abort.signal,
      });
      if (!isCurrent(operation)) return;
      const next = readResult(
        await finishStampProof({
          data: { scope, challengeId: challenge.id, ...proof },
          signal: operation.abort.signal,
        }),
      );
      if (!isCurrent(operation)) return;
      setStampSuppressed(scope, false);
      setStampVerificationRequired(scope, false);
      disconnectPendingRef.current = false;
      setDisconnectPending(false);
      walletVerificationRequired.current = false;
      setWalletNeedsVerification(false);
      acceptView(next, operation, true);
    } catch (cause) {
      failure(cause, operation);
    } finally {
      finish(operation);
    }
  }

  async function select(stamp: StampHolding): Promise<void> {
    const operation = begin();
    if (!operation) return;
    operation.cpid = stamp.cpid;
    setDraft({ cpid: stamp.cpid, title: stamp.title, stampNumber: stamp.stampNumber });
    setPreview(null);
    setCrop({ ...DEFAULT_CROP });
    if (mode === "original") setMode("portrait");
    setNote("Preparing a safe image preview…");
    try {
      const image = readResult(
        await previewStampImage({
          data: { scope, cpid: stamp.cpid },
          signal: operation.abort.signal,
        }),
      );
      if (!isCurrent(operation)) return;
      if (!safeImage(image))
        throw new StampPanelError(
          "unsupported",
          "This artwork cannot be previewed here. Choose another stamp.",
        );
      setPreview(image);
      setNote("Preview ready. Choose how to use it, then apply your appearance.");
    } catch (cause) {
      failure(cause, operation);
    } finally {
      finish(operation);
    }
  }

  async function save(): Promise<void> {
    const operation = begin();
    if (!operation) return;
    operation.cpid = draft?.cpid;
    setNote("Applying your appearance…");
    try {
      if (mode === "original") {
        readResult(await clearStampAppearance({ data: { scope }, signal: operation.abort.signal }));
        if (!isCurrent(operation)) return;
        setView((previous) => (previous ? { ...previous, appearance: null } : previous));
        callbacks.current.onAppearance(null);
        setNote("Your original appearance is active. Your wallet stays connected.");
      } else {
        if (!draft || !preview)
          throw new StampPanelError("invalid", "Choose a stamp with a preview first.");
        const appearance = readResult(
          await chooseStampAppearance({
            data: { scope, cpid: draft.cpid, mode, crop },
            signal: operation.abort.signal,
          }),
        );
        if (!isCurrent(operation)) return;
        const valid = currentAppearance(appearance, scope);
        if (!valid)
          throw new StampPanelError(
            "expired",
            "The appearance check expired. Refresh your holdings, then try again.",
          );
        setView((previous) => (previous ? { ...previous, appearance: valid } : previous));
        callbacks.current.onAppearance(valid);
        setNote(
          mode === "head"
            ? "Your stamp head is active."
            : "Your stamp portrait is active; your original sprite head stays in place.",
        );
      }
    } catch (cause) {
      failure(cause, operation);
    } finally {
      finish(operation);
    }
  }

  async function disconnect(): Promise<void> {
    const operation = begin();
    if (!operation) return;
    polling.current = false;
    disconnectPendingRef.current = true;
    setDisconnectPending(true);
    setStampVerificationRequired(scope, false);
    walletVerificationRequired.current = false;
    setWalletNeedsVerification(false);
    setView(null);
    setDraft(null);
    setPreview(null);
    setMode("original");
    setCrop({ ...DEFAULT_CROP });
    setStampSuppressed(scope, true);
    rememberStampSession(scope, false);
    callbacks.current.onAppearance(null);
    setNote("Disconnecting the wallet check…");
    try {
      readResult(
        await disconnectStampIdentity({ data: { scope }, signal: operation.abort.signal }),
      );
      if (!isCurrent(operation)) return;
      setStampSuppressed(scope, false);
      disconnectPendingRef.current = false;
      setDisconnectPending(false);
      walletVerificationRequired.current = false;
      setWalletNeedsVerification(false);
      setNote("Wallet disconnected. Your original appearance is active.");
    } catch {
      if (isCurrent(operation)) {
        setError(true);
        setNote(
          "Your local appearance is cleared, but the service could not confirm disconnection. Retry Disconnect before connecting again.",
        );
      }
    } finally {
      finish(operation);
    }
  }

  function zoom(value: number): void {
    const size = 1 / value;
    setCrop((previous) => ({
      size,
      x: Math.max(0, Math.min(1 - size, previous.x + (previous.size - size) / 2)),
      y: Math.max(0, Math.min(1 - size, previous.y + (previous.size - size) / 2)),
    }));
  }

  const connected = Boolean(view?.connected);
  const holdings = view?.holdings;
  return (
    <section
      className="mind player-tools"
      role="dialog"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
    >
      <div className="mind-bar">
        <h2 id={titleId} className="font-display">
          Your stamp appearance
        </h2>
        <button
          ref={closeRef}
          className="btn"
          type="button"
          onClick={close}
          aria-label="Close stamp appearance"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mind-body" aria-busy={busy}>
        <p>
          Verify a wallet to browse stamps you hold. Signing this check does not spend BTC or move
          stamps.
        </p>
        <p className="mt-2 text-sm text-muted">
          This optional wallet check changes appearance only. It does not grant control of a game
          character or create a receiving wallet.
        </p>
        <label className="mt-3 block text-sm" htmlFor={walletSelectId}>
          Wallet
        </label>
        <select
          id={walletSelectId}
          className="field mt-1 w-full"
          value={walletId}
          onChange={(event) => selectWallet(event.target.value as WalletId)}
        >
          <option value="wonder">Wonder Wallet · recommended</option>
          <option value="leather">Leather · alternative</option>
        </select>
        <p className="mt-2 text-sm text-muted">
          {walletId === "wonder" ? (
            <a href="https://www.wonder-wallet.com" target="_blank" rel="noopener noreferrer">
              Get Wonder Wallet
            </a>
          ) : (
            <a href="https://leather.io" target="_blank" rel="noopener noreferrer">
              Get Leather
            </a>
          )}
          . Use a mainnet Native SegWit address. Wallet changes require a new verification.
          {walletId === "leather" && (
            <> Leather asks you to choose an account, then sign one verification message.</>
          )}
          {walletId === "wonder" && (
            <>
              {" "}
              To change accounts, disconnect and reconnect this site in Wonder's Connected sites,
              then verify the selected address again.
            </>
          )}
        </p>
        {view?.address && (
          <p className="mt-3 text-sm">
            {connected ? "Verified address" : "Previously checked address"}
            <br />
            <span style={{ overflowWrap: "anywhere" }}>{view.address}</span>
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="btn"
            type="button"
            onClick={() => void connect()}
            disabled={busy || disconnectPending}
          >
            {view?.address ? `Sign again with ${walletName}` : `Connect ${walletName}`}
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => void refresh(holdings?.page)}
            disabled={busy || disconnectPending || walletNeedsVerification}
          >
            Refresh holdings
          </button>
          {(view?.address || !polling.current) && (
            <button className="btn" type="button" onClick={() => void disconnect()} disabled={busy}>
              {disconnectPending ? "Retry Disconnect" : "Disconnect"}
            </button>
          )}
          {busy && (
            <button className="btn" type="button" onClick={cancel}>
              Cancel request
            </button>
          )}
        </div>
        <p className="mt-3 text-sm" role={error ? "alert" : "status"} aria-live="polite">
          {note}
        </p>
        <p className="mt-2 text-sm text-muted">
          Wonder Wallet is recommended; Leather is available when you select it above. This preview
          verifies mainnet Native SegWit addresses. Taproot and testnet are not supported.
        </p>
        {connected && holdings && (
          <section className="mt-5" aria-label="Your stamp holdings">
            <h3>Choose a stamp</h3>
            {holdings.assets.length === 0 ? (
              <p>No supported stamps were found on this page for this address.</p>
            ) : (
              <ul className="mt-2 space-y-2" style={{ listStyle: "none", padding: 0 }}>
                {holdings.assets.map((stamp) => (
                  <li key={stamp.cpid}>
                    <button
                      className="btn w-full text-left"
                      type="button"
                      disabled={busy}
                      aria-pressed={draft?.cpid === stamp.cpid}
                      onClick={() => void select(stamp)}
                      style={{ display: "block", whiteSpace: "normal", overflowWrap: "anywhere" }}
                    >
                      <strong>{stamp.title || "Untitled stamp"}</strong>
                      {stamp.stampNumber === null ? "" : ` · #${stamp.stampNumber}`}
                      <br />
                      <span className="text-sm">
                        You hold {stamp.quantity} ·{" "}
                        {stamp.supply === null ? "Supply unknown" : `Supply ${stamp.supply}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {holdings.unsupported > 0 && (
              <p className="mt-2 text-sm text-muted">
                {holdings.unsupported} unsupported{" "}
                {holdings.unsupported === 1 ? "asset is" : "assets are"} hidden.
              </p>
            )}
            <div
              className="mt-3 flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Stamp pages"
            >
              <button
                className="btn"
                type="button"
                disabled={busy || holdings.page <= 1}
                onClick={() => void refresh(holdings.page - 1)}
              >
                Previous
              </button>
              <span className="text-sm">
                Page {holdings.page} of {Math.max(1, holdings.totalPages)}
              </span>
              <button
                className="btn"
                type="button"
                disabled={busy || holdings.page >= holdings.totalPages}
                onClick={() => void refresh(holdings.page + 1)}
              >
                Next
              </button>
            </div>
          </section>
        )}
        <section className="mt-5" aria-label="Appearance preview">
          <h3>{draft ? draft.title || "Untitled stamp" : "Your appearance"}</h3>
          {safeImage(preview) && (
            <div
              className="mt-3"
              style={{
                position: "relative",
                width: 160,
                height: 160,
                overflow: "hidden",
                border: "1px solid currentColor",
                background: "#251b30",
              }}
            >
              <img
                src={preview.pngDataUrl}
                alt={`Preview of ${draft?.title || "your selected stamp"}`}
                draggable={false}
                style={{
                  position: "absolute",
                  maxWidth: "none",
                  width: `${100 / crop.size}%`,
                  height: `${100 / crop.size}%`,
                  left: `${(-crop.x / crop.size) * 100}%`,
                  top: `${(-crop.y / crop.size) * 100}%`,
                  imageRendering: "pixelated",
                }}
              />
            </div>
          )}
          <fieldset className="mt-3" disabled={busy || !connected}>
            <legend>Use your stamp as</legend>
            {(
              [
                ["original", "Original appearance"],
                ["portrait", "Portrait only · original sprite head"],
                ["head", "Stamp head and portrait"],
              ] as const
            ).map(([value, label]) => (
              <label className="tool-option mt-2" key={value}>
                <input
                  type="radio"
                  name={modeId}
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />{" "}
                {label}
              </label>
            ))}
          </fieldset>
          {preview && mode !== "original" && (
            <fieldset className="mt-4" disabled={busy || !connected}>
              <legend>Crop your preview</legend>
              <label className="mt-2 block text-sm">
                Zoom · {(1 / crop.size).toFixed(1)}×
                <input
                  className="mt-1 block w-full"
                  type="range"
                  min="1"
                  max="4"
                  step="0.1"
                  value={1 / crop.size}
                  onChange={(event) => zoom(Number(event.target.value))}
                />
              </label>
              <label className="mt-2 block text-sm">
                Horizontal position
                <input
                  className="mt-1 block w-full"
                  type="range"
                  min="0"
                  max={1 - crop.size}
                  step="0.001"
                  value={crop.x}
                  disabled={crop.size === 1}
                  onChange={(event) =>
                    setCrop((previous) => ({ ...previous, x: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="mt-2 block text-sm">
                Vertical position
                <input
                  className="mt-1 block w-full"
                  type="range"
                  min="0"
                  max={1 - crop.size}
                  step="0.001"
                  value={crop.y}
                  disabled={crop.size === 1}
                  onChange={(event) =>
                    setCrop((previous) => ({ ...previous, y: Number(event.target.value) }))
                  }
                />
              </label>
            </fieldset>
          )}
          <button
            className="btn mt-4"
            type="button"
            data-on="true"
            onClick={() => void save()}
            disabled={busy || !connected || (mode !== "original" && (!draft || !preview))}
          >
            Apply appearance
          </button>
          <p className="mt-2 text-sm text-muted">
            Your holdings are checked again when you apply. A stamp’s supply can include several
            editions; wearing it does not promise a unique character.
          </p>
        </section>
      </div>
    </section>
  );
}
