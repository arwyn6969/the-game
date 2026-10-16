import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import {
  beginAgentReceivingProof,
  findAgentWorld,
  finishAgentReceivingProof,
  getAgentOwnerAccess,
  getAgentReceivingInventory,
  registerAgentWorld,
  retireAgentReceivingProfile,
} from "@/lib/agent-wallets.functions";
import type {
  OwnerAccess,
  ReceivingInventory,
  RegisteredWorldView,
  RegistryResult,
  RegistryErrorCode,
  WorldRegistrationInput,
} from "@/lib/agent-wallets/types";
import type { AgentId } from "@/game/types";
import { authClient, authEnabled, GROK_PROVIDERS, signIn, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getLeatherAddress, LeatherWalletError, signLeatherChallenge } from "@/lib/stamps/leather";
import { isAgentOwnerHidden, setAgentOwnerHidden } from "@/lib/agent-wallets/client-state";
import { ownerReference } from "@/lib/agent-wallets/owner-reference";
import { AgentDepositObservations } from "./AgentDepositObservations";

type Tagged<T> = { context: string; value: T };
type CopyState = Tagged<{
  state: "missing" | "ready" | "unknown";
  view: RegisteredWorldView | null;
}>;
type InventoryState = Tagged<{ observation: ReceivingInventory; stale: boolean }>;
type Operation = {
  generation: number;
  context: string;
  abort: AbortController;
  role?: AgentId;
  kind: "owner" | "sign-in" | "sign-out" | "register" | "proof" | "retire" | "inventory";
};
const subscribeToNothing = () => () => {};
const noGateSession = () => false;

class RegistryPanelError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function valueOf<T>(result: RegistryResult<T>): T {
  if (!result.ok) throw new RegistryPanelError(result.error, result.message);
  return result.value;
}

function sameRoster(view: RegisteredWorldView, source: WorldRegistrationInput): boolean {
  return (
    view.world.sourceWorldId === source.sourceWorldId &&
    view.world.residents.length === source.characters.length &&
    source.characters.every(
      (character) =>
        view.world.residents.filter(
          (resident) =>
            resident.role === character.role &&
            resident.sourceCharacterId === character.sourceCharacterId,
        ).length === 1,
    )
  );
}

function when(timestamp: number | null): string {
  return timestamp !== null && Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "Not checked";
}

/** Owner tools mount only after opt-in and never mutate the portable town. */
export function AgentWalletsPanel({
  world,
  onClose,
}: {
  world: WorldRegistrationInput;
  onClose: () => void;
}) {
  const titleId = useId();
  const residentId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const { user, isPending } = useCurrentUserState();
  // authEnabled is fixed for this build; disabled/offline play must not mount an auth request.
  const ownerSession = authEnabled ? authClient.useSession() : null;
  const gateSession = useSyncExternalStore(subscribeToNothing, hasGateSessionMarker, noGateSession);
  const realUser = user && !user.isDevFallback ? user : null;
  const expectedOwnerRef = realUser ? ownerReference(realUser.id) : null;
  const sourceKey = `${world.sourceWorldId}:${world.characters
    .map((character) => `${character.role}:${character.sourceCharacterId}`)
    .sort()
    .join("|")}`;
  const context = `${realUser?.id ?? (isPending ? "pending" : "signed-out")}:${sourceKey}`;
  const [access, setAccess] = useState<Tagged<OwnerAccess> | null>(null);
  const [copy, setCopy] = useState<CopyState | null>(null);
  const [selectedRole, setSelectedRole] = useState<AgentId>("player");
  const [inventory, setInventory] = useState<InventoryState | null>(null);
  const [busy, setBusy] = useState<Operation["kind"] | null>(null);
  const [privateHidden, setPrivateHidden] = useState(false);
  const [ownerReload, setOwnerReload] = useState(0);
  const [confirmRetire, setConfirmRetire] = useState<string | null>(null);
  const [note, setNote] = useState("Checking owner access…");
  const [error, setError] = useState(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const signInAttempt = useRef(0);
  const refreshedAccount = useRef<{ userId: string | null; sourceKey: string } | null>(null);
  const active = useRef<Operation | null>(null);
  const currentContext = useRef(context);
  const currentRole = useRef(selectedRole);
  const callbacks = useRef({ onClose });
  currentContext.current = context;
  currentRole.current = selectedRole;
  callbacks.current = { onClose };

  const ownerAccess = access?.context === context ? access.value : null;
  const ownerPresentationHidden = Boolean(realUser && isAgentOwnerHidden(realUser.id));
  const ownerReady = Boolean(
    !isPending &&
    realUser &&
    ownerAccess?.available &&
    ownerAccess.authenticated &&
    ownerAccess.ownerRef === expectedOwnerRef &&
    !privateHidden &&
    !ownerPresentationHidden,
  );
  const registered =
    ownerReady &&
    copy?.context === context &&
    copy.value.state === "ready" &&
    copy.value.view?.ownerRef === expectedOwnerRef
      ? copy.value.view
      : null;
  const resident = registered?.world.residents.find((item) => item.role === selectedRole);
  const profile = resident
    ? registered?.profiles.find((item) => item.residentId === resident.residentId)
    : null;
  const observation =
    registered &&
    profile?.state === "draft" &&
    inventory?.context === context &&
    inventory.value.observation.profileId === profile.profileId &&
    inventory.value.observation.revision === profile.revision &&
    inventory.value.observation.address === profile.address
      ? inventory.value
      : null;

  function invalidate(): void {
    generation.current++;
    active.current?.abort.abort();
    active.current = null;
  }

  function isCurrent(operation: Operation): boolean {
    return (
      mounted.current &&
      operation.context === currentContext.current &&
      operation.generation === generation.current &&
      !operation.abort.signal.aborted &&
      (operation.role === undefined || operation.role === currentRole.current)
    );
  }

  function begin(kind: Operation["kind"], role?: AgentId): Operation | null {
    if (active.current) return null;
    const operation: Operation = {
      kind,
      role,
      context,
      generation: ++generation.current,
      abort: new AbortController(),
    };
    active.current = operation;
    setBusy(kind);
    setError(false);
    return operation;
  }

  function finish(operation: Operation): void {
    if (!isCurrent(operation)) return;
    active.current = null;
    setBusy(null);
  }

  function clearPrivate(): void {
    setCopy(null);
    setInventory(null);
    setConfirmRetire(null);
  }

  function cancel(): void {
    refreshedAccount.current = null;
    invalidate();
    setBusy(null);
    setError(false);
    setNote(
      "Stopped waiting for this request. Refresh owner status to check whether a submitted change finished.",
    );
  }

  function failure(cause: unknown, operation: Operation): void {
    if (!isCurrent(operation)) return;
    const ownerMismatch = cause instanceof RegistryPanelError && cause.code === "owner-mismatch";
    const unauthorized =
      (cause instanceof RegistryPanelError && cause.code === "unauthenticated") ||
      (cause instanceof Error &&
        (cause.message === "Unauthorized" || ("status" in cause && cause.status === 401)));
    if (ownerMismatch) {
      setPrivateHidden(true);
      clearPrivate();
      setAccess(null);
    } else if (unauthorized) {
      setPrivateHidden(true);
      clearPrivate();
      setAccess({
        context,
        value: {
          available: true,
          authenticated: false,
          ownerRef: null,
          message: "Sign in again to manage your private profiles.",
        },
      });
    } else if (
      cause instanceof RegistryPanelError &&
      ["conflict", "stale", "not-found"].includes(cause.code)
    ) {
      clearPrivate();
      setCopy({ context, value: { state: "unknown", view: null } });
    }
    if (operation.kind === "inventory")
      setInventory((previous) =>
        previous?.context === context
          ? { ...previous, value: { ...previous.value, stale: true } }
          : previous,
      );
    setError(true);
    setNote(
      ownerMismatch
        ? "Your account changed. Private details are hidden; refresh owner status to continue."
        : unauthorized
          ? "Your owner session ended. Sign in again to view private profiles."
          : cause instanceof RegistryPanelError || cause instanceof LeatherWalletError
            ? cause.message.slice(0, 400)
            : "The owner service could not be reached. Your local town is still available; try again.",
    );
  }

  function acceptWorld(
    next: RegisteredWorldView | null,
    owner: OwnerAccess,
    operation: Operation,
  ): void {
    if (!isCurrent(operation)) return;
    if (
      !expectedOwnerRef ||
      owner.ownerRef !== expectedOwnerRef ||
      (next && next.ownerRef !== expectedOwnerRef)
    )
      throw new RegistryPanelError("owner-mismatch", "Your account changed. Refresh owner status.");
    if (next && !sameRoster(next, world))
      throw new RegistryPanelError(
        "invalid",
        "This private copy has a different owner or resident roster. Refresh owner status or restore the matching town.",
      );
    setCopy({ context, value: { state: next ? "ready" : "missing", view: next } });
    setInventory(null);
    setConfirmRetire(null);
  }

  async function refreshOwner(refreshSession = false, recoverPresentation = false): Promise<void> {
    const operation = begin("owner");
    if (!operation) return;
    setNote("Checking owner access…");
    try {
      if (refreshSession && authEnabled) {
        clearPrivate();
        setPrivateHidden(true);
        const session = await authClient.getSession({ query: { disableCookieCache: true } });
        if (session.error) throw new Error("Account status could not be refreshed.");
        if (!isCurrent(operation)) return;
        refreshedAccount.current = { userId: session.data?.user?.id ?? null, sourceKey };
        // getSession returns fresh data but does not update Better Auth's reactive atom.
        // Reload from the next reactive render, never this closure's previous owner.
        await ownerSession?.refetch({ query: { disableCookieCache: true } });
        if (isCurrent(operation)) setOwnerReload((previous) => previous + 1);
        return;
      }
      const next = valueOf(await getAgentOwnerAccess());
      if (!isCurrent(operation)) return;
      if (next.authenticated && (!expectedOwnerRef || next.ownerRef !== expectedOwnerRef))
        throw new RegistryPanelError(
          "owner-mismatch",
          "Your account changed. Refresh owner status.",
        );
      setAccess({ context, value: next });
      if (
        !next.available ||
        !next.authenticated ||
        !next.ownerRef ||
        !realUser ||
        !expectedOwnerRef
      ) {
        clearPrivate();
        setNote(next.message);
        return;
      }
      const found = valueOf(
        await findAgentWorld({
          data: { expectedOwnerRef, input: { sourceWorldId: world.sourceWorldId } },
        }),
      );
      if (!isCurrent(operation)) return;
      acceptWorld(found, next, operation);
      if (recoverPresentation) {
        setAgentOwnerHidden(realUser.id, false);
        setPrivateHidden(false);
      }
      setNote(
        found
          ? "Your private copy is available. Choose a resident to manage its watch-only profile."
          : "This account has no registered private copy of this town yet.",
      );
    } catch (cause) {
      failure(cause, operation);
    } finally {
      finish(operation);
    }
  }

  useEffect(() => {
    mounted.current = true;
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    return () => {
      mounted.current = false;
      invalidate();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    invalidate();
    setAccess(null);
    clearPrivate();
    setSelectedRole("player");
    const recovery = refreshedAccount.current;
    if (!isPending || recovery?.sourceKey !== sourceKey) refreshedAccount.current = null;
    const refreshedThisAccount =
      recovery?.sourceKey === sourceKey &&
      recovery.userId === (realUser?.id ?? null) &&
      !ownerSession?.error;
    const hidden = Boolean(realUser && isAgentOwnerHidden(realUser.id));
    setPrivateHidden(hidden);
    setBusy(null);
    setError(false);
    if (isPending) setNote("Checking your account session…");
    else if (recovery?.sourceKey === sourceKey && ownerSession?.error) {
      setPrivateHidden(true);
      setError(true);
      setNote("Account status could not be refreshed. Private details stay hidden; try again.");
    } else if (hidden && !refreshedThisAccount)
      setNote(
        "Private owner details are hidden. Retry Sign out, or explicitly refresh owner status to reopen them.",
      );
    else void refreshOwner(false, refreshedThisAccount);
    return invalidate;
    // Account or portable roster changes remove private data before any new load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, ownerReload]);

  async function login(providerId: string): Promise<void> {
    refreshedAccount.current = null;
    const operation = begin("sign-in");
    if (!operation) return;
    const attempt = ++signInAttempt.current;
    setPrivateHidden(true);
    clearPrivate();
    setNote("Complete sign-in to manage a private world copy. Your town stays in this browser.");
    try {
      await signIn(providerId, { callbackURL: "/", errorCallbackURL: "/" });
      const session = await authClient.getSession({ query: { disableCookieCache: true } });
      if (
        mounted.current &&
        attempt === signInAttempt.current &&
        !session.error &&
        session.data?.user?.id
      ) {
        setAgentOwnerHidden(session.data.user.id, false);
        setOwnerReload((previous) => previous + 1);
      }
      if (isCurrent(operation)) setNote("Sign-in completed. Refresh owner status to continue.");
    } catch {
      if (isCurrent(operation)) {
        setError(true);
        setNote(
          "Sign-in was cancelled or could not finish. Try again, or return to your local town.",
        );
      }
    } finally {
      finish(operation);
    }
  }

  async function logout(): Promise<void> {
    refreshedAccount.current = null;
    if (realUser) setAgentOwnerHidden(realUser.id, true);
    signInAttempt.current++;
    invalidate();
    setBusy(null);
    const operation = begin("sign-out");
    if (!operation) return;
    setPrivateHidden(true);
    clearPrivate();
    setAccess(null);
    setNote("Signing out. Private owner details are hidden.");
    try {
      await signOut();
      if (isCurrent(operation)) setNote("Signed out. Your local town is still available.");
    } catch {
      if (isCurrent(operation)) {
        setError(true);
        setNote(
          "Sign-out could not be confirmed. Private details stay hidden; retry Sign out or refresh owner status.",
        );
      }
    } finally {
      finish(operation);
    }
  }

  async function register(): Promise<void> {
    if (!ownerReady || !ownerAccess || !expectedOwnerRef) return;
    const operation = begin("register");
    if (!operation) return;
    setNote("Registering a private copy for your account…");
    try {
      const next = valueOf(await registerAgentWorld({ data: { expectedOwnerRef, input: world } }));
      acceptWorld(next, ownerAccess, operation);
      if (isCurrent(operation))
        setNote(
          "Private copy registered to you. Its residents have no external addresses linked yet.",
        );
    } catch (cause) {
      failure(cause, operation);
    } finally {
      finish(operation);
    }
  }

  function selectResident(role: AgentId): void {
    invalidate();
    setBusy(null);
    currentRole.current = role;
    setSelectedRole(role);
    setInventory(null);
    setConfirmRetire(null);
    setError(false);
    setNote("Resident selected. Verify an external address or refresh its private inventory.");
  }

  async function verifyAddress(): Promise<void> {
    if (!registered || !resident || !profile || !expectedOwnerRef) return;
    const operation = begin("proof", selectedRole);
    if (!operation) return;
    const registrationId = registered.world.registrationId;
    const profileId = profile.profileId;
    setNote(
      profile.state === "draft"
        ? "Choose the active mainnet Native SegWit account in Leather. Previous addresses remain reserved to this resident after replacement. Leather may open behind this window; check its popup/extension icon."
        : "Choose the active mainnet Native SegWit account in Leather. Leather may open behind this window; check its popup/extension icon.",
    );
    try {
      const selected = await getLeatherAddress({ signal: operation.abort.signal });
      if (!isCurrent(operation)) return;
      const challenge = valueOf(
        await beginAgentReceivingProof({
          data: {
            expectedOwnerRef,
            input: {
              registrationId,
              profileId,
              revision: profile.revision,
              address: selected.address,
            },
          },
        }),
      );
      if (!isCurrent(operation)) return;
      if (
        challenge.registrationId !== registrationId ||
        challenge.profileId !== profileId ||
        challenge.residentId !== resident.residentId ||
        challenge.revision !== profile.revision
      )
        throw new RegistryPanelError(
          "invalid",
          "The wallet check did not match this resident's current profile. Refresh owner status.",
        );
      setNote(
        "Review the resident and address in Leather. This signature registers a watch-only draft and does not spend or transfer anything. Leather may open behind this window; check its popup/extension icon.",
      );
      const proof = await signLeatherChallenge(challenge, selected, {
        signal: operation.abort.signal,
      });
      if (!isCurrent(operation)) return;
      const updated = valueOf(
        await finishAgentReceivingProof({
          data: {
            expectedOwnerRef,
            input: { registrationId, profileId, challengeId: challenge.id, ...proof },
          },
        }),
      );
      if (!isCurrent(operation)) return;
      if (
        updated.profileId !== profileId ||
        updated.residentId !== resident.residentId ||
        updated.revision <= profile.revision ||
        updated.address !== selected.address ||
        updated.state !== "draft"
      )
        throw new RegistryPanelError(
          "invalid",
          "The returned profile did not match this wallet check. Refresh owner status.",
        );
      setCopy({
        context,
        value: {
          state: "ready",
          view: {
            ...registered,
            profiles: registered.profiles.map((item) =>
              item.profileId === updated.profileId ? updated : item,
            ),
          },
        },
      });
      setInventory(null);
      setConfirmRetire(null);
      setNote(
        `External address verified for ${resident.name}. The profile stays private and watch only; funding is unpublished.`,
      );
    } catch (cause) {
      failure(cause, operation);
    } finally {
      finish(operation);
    }
  }

  async function refreshInventory(page = 1): Promise<void> {
    if (
      !registered ||
      !profile ||
      profile.state !== "draft" ||
      !profile.address ||
      !expectedOwnerRef
    )
      return;
    const operation = begin("inventory", selectedRole);
    if (!operation) return;
    setNote("Checking the external address's indexed stamp inventory…");
    try {
      const next = valueOf(
        await getAgentReceivingInventory({
          data: {
            expectedOwnerRef,
            input: {
              registrationId: registered.world.registrationId,
              profileId: profile.profileId,
              page,
            },
          },
        }),
      );
      if (!isCurrent(operation)) return;
      if (
        next.profileId !== profile.profileId ||
        next.revision !== profile.revision ||
        next.address !== profile.address
      )
        throw new RegistryPanelError(
          "stale",
          "This address profile changed while checking it. Refresh owner status.",
        );
      setInventory({ context, value: { observation: next, stale: false } });
      setNote("Stamp inventory checked. Bitcoin balance has not been checked.");
    } catch (cause) {
      failure(cause, operation);
    } finally {
      finish(operation);
    }
  }

  async function retire(): Promise<void> {
    if (!registered || !profile || !ownerAccess || !expectedOwnerRef) return;
    const operation = begin("retire", selectedRole);
    if (!operation) return;
    setNote("Retiring this private draft profile…");
    let confirmed = false;
    try {
      valueOf(
        await retireAgentReceivingProfile({
          data: {
            expectedOwnerRef,
            input: {
              registrationId: registered.world.registrationId,
              profileId: profile.profileId,
              revision: profile.revision,
            },
          },
        }),
      );
      if (!isCurrent(operation)) return;
      confirmed = true;
      clearPrivate();
      setCopy({ context, value: { state: "unknown", view: null } });
      const next = valueOf(
        await findAgentWorld({
          data: { expectedOwnerRef, input: { sourceWorldId: world.sourceWorldId } },
        }),
      );
      acceptWorld(next, ownerAccess, operation);
      if (isCurrent(operation))
        setNote(
          "Draft profile retired. Its address remains reserved to this resident. The external wallet and any funds remain with their owner.",
        );
    } catch (cause) {
      if (
        confirmed &&
        isCurrent(operation) &&
        !(
          cause instanceof RegistryPanelError &&
          ["owner-mismatch", "unauthenticated"].includes(cause.code)
        )
      ) {
        setError(true);
        setNote(
          "The profile was retired and its address stays reserved to this resident. Refresh owner status to load its latest record.",
        );
      } else failure(cause, operation);
    } finally {
      finish(operation);
    }
  }

  function close(): void {
    refreshedAccount.current = null;
    signInAttempt.current++;
    invalidate();
    callbacks.current.onClose();
  }
  function observationOwnerFailure(code: RegistryErrorCode, message: string): void {
    if (context !== currentContext.current) return;
    invalidate();
    setBusy(null);
    clearPrivate();
    if (code === "owner-mismatch" || code === "unauthenticated") {
      setPrivateHidden(true);
      setAccess(null);
    } else setCopy({ context, value: { state: "unknown", view: null } });
    setError(true);
    setNote(message.slice(0, 400));
  }
  const held = observation?.observation.holdings;
  const unavailable = (ownerAccess && !ownerAccess.available) || !authEnabled;
  return (
    <aside
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
          Agent wallets
        </h2>
        <button
          ref={closeRef}
          className="btn"
          type="button"
          onClick={close}
          aria-label="Close agent wallets"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mind-body" aria-busy={busy !== null || isPending}>
        <p>
          Private watch-only drafts for a registered copy of your town. Keep using your local town
          while owner tools are unavailable.
        </p>
        <p className="mt-2 text-sm text-muted">
          The game holds no keys. Funding is unpublished; spending and trading are not enabled here.
        </p>
        <section className="mt-4" aria-label="Owner access">
          <h3>Your account</h3>
          {isPending ? (
            <p>Checking your account session…</p>
          ) : privateHidden || ownerPresentationHidden ? (
            <p>
              Private details for this account are hidden. Retry Sign out or refresh owner status
              when you want to reopen them.
            </p>
          ) : ownerReady ? (
            <p>
              Signed in as {realUser?.displayName ?? realUser?.primaryEmail ?? "your account"}. You
              manage this private copy and all its residents.
            </p>
          ) : unavailable ? (
            <p>
              Owner registration needs real sign-in on this server. This preview cannot register an
              owner; your local game remains available.
            </p>
          ) : (
            <p>Sign in to register a private copy and manage its residents' watch-only profiles.</p>
          )}
          {!isPending &&
            !unavailable &&
            !ownerReady &&
            !privateHidden &&
            !ownerPresentationHidden && (
              <div className="mt-3 flex flex-wrap gap-2">
                {GROK_PROVIDERS.map((provider) => (
                  <button
                    key={provider.providerId}
                    className="btn"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void login(provider.providerId)}
                  >
                    Sign in with {provider.label}
                  </button>
                ))}
              </div>
            )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn"
              type="button"
              disabled={busy !== null || isPending}
              onClick={() => void refreshOwner(true)}
            >
              Refresh owner status
            </button>
            {realUser && authEnabled && !gateSession && (
              <button
                className="btn"
                type="button"
                disabled={busy === "sign-out"}
                onClick={() => void logout()}
              >
                Sign out
              </button>
            )}
            {busy && busy !== "sign-in" && busy !== "sign-out" && (
              <button className="btn" type="button" onClick={cancel}>
                Cancel request
              </button>
            )}
          </div>
        </section>
        <p className="mt-3 text-sm" role={error ? "alert" : "status"} aria-live="polite">
          {note}
        </p>
        {ownerReady && copy?.context === context && copy.value.state === "missing" && (
          <section className="mt-5" aria-label="Register a private copy">
            <h3>Register this town privately</h3>
            <p className="mt-2">
              Create a private copy for this account using the town's resident identities. This
              records no claim over other people's copies and changes no local memories or money.
            </p>
            <button
              className="btn mt-3"
              type="button"
              disabled={busy !== null}
              onClick={() => void register()}
            >
              Register private copy
            </button>
          </section>
        )}
        {registered && (
          <>
            <section className="mt-5" aria-label="Private world copy">
              <h3>{registered.world.title}</h3>
              <p className="mt-2">Private copy registered to you.</p>
              <label className="mt-3 block text-sm" htmlFor={residentId}>
                Resident
              </label>
              <select
                id={residentId}
                className="field mt-1 w-full"
                value={selectedRole}
                onChange={(event) => selectResident(event.target.value as AgentId)}
              >
                {world.characters.map((character) => (
                  <option key={character.role} value={character.role}>
                    {character.name}
                    {world.characters.filter((other) => other.name === character.name).length > 1
                      ? ` · ${character.role}`
                      : ""}
                  </option>
                ))}
              </select>
            </section>
            {resident && profile && (
              <section className="mt-5" aria-label="Resident watch-only profile">
                <h3>{resident.name}'s external address</h3>
                {profile.state === "draft" && profile.address ? (
                  <>
                    <p className="mt-2">External wallet · watch-only draft</p>
                    <p className="mt-2 text-sm" style={{ overflowWrap: "anywhere" }}>
                      {profile.address}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Address verified {when(profile.verifiedAt)}. Funding is unpublished.
                    </p>
                  </>
                ) : (
                  <p className="mt-2">
                    {profile.state === "retired"
                      ? "This draft profile was retired. Its previous addresses remain reserved to this resident."
                      : "No external address is linked yet."}
                  </p>
                )}
                <p className="mt-2 text-sm text-muted">
                  Use the active mainnet Native SegWit account in Leather. Switch Leather accounts
                  before linking another resident. An address stays reserved to the same resident
                  after retirement or replacement.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="btn"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void verifyAddress()}
                  >
                    {profile.state === "draft"
                      ? "Replace verified address"
                      : "Verify external address"}
                  </button>
                  {profile.state === "draft" && (
                    <button
                      className="btn"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => setConfirmRetire(profile.profileId)}
                    >
                      Retire draft profile
                    </button>
                  )}
                </div>
                {confirmRetire === profile.profileId && (
                  <div
                    className="mind-actions mt-3"
                    role="group"
                    aria-label="Confirm profile retirement"
                  >
                    <p>
                      Retire {resident.name}'s private watch-only draft? Its address remains
                      reserved to this resident, and the retained record cannot be reassigned to
                      someone else. The external wallet and any funds stay with their owner.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className="btn"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void retire()}
                      >
                        Confirm retire profile
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => setConfirmRetire(null)}
                      >
                        Keep profile
                      </button>
                    </div>
                  </div>
                )}
                {profile.state === "draft" && profile.address && (
                  <section className="mt-5" aria-label="Private watch-only inventory">
                    <h3>Private inventory</h3>
                    <p className="mt-2 text-sm">Bitcoin balance: not checked.</p>
                    <button
                      className="btn mt-3"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void refreshInventory()}
                    >
                      Refresh inventory
                    </button>
                    {!observation && (
                      <p className="mt-2 text-sm text-muted">
                        Refresh to observe indexed stamps at this external address. These
                        observations do not become game money.
                      </p>
                    )}
                    {observation && held && (
                      <>
                        <p className="mt-3 text-sm">
                          {observation.stale
                            ? "Previous observation · refresh failed"
                            : "Last observation"}
                          : {when(observation.observation.observedAt)}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          Indexer block {held.indexedBlock}. Bitcoin confirmation and spendability
                          have not been checked.
                        </p>
                        {held.assets.length === 0 ? (
                          <p className="mt-2">No supported stamps were found on this page.</p>
                        ) : (
                          <ul className="mt-3 space-y-2" style={{ listStyle: "none", padding: 0 }}>
                            {held.assets.map((asset) => (
                              <li className="mind-actions" key={asset.cpid}>
                                <strong>{asset.title || "Untitled stamp"}</strong>
                                {asset.stampNumber === null ? "" : ` · #${asset.stampNumber}`}
                                <br />
                                <span>
                                  Observed quantity {asset.quantity} ·{" "}
                                  {asset.supply === null
                                    ? "Supply unknown"
                                    : `Supply ${asset.supply}`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {held.unsupported > 0 && (
                          <p className="mt-2 text-sm text-muted">
                            {held.unsupported} unsupported{" "}
                            {held.unsupported === 1 ? "asset is" : "assets are"} hidden.
                          </p>
                        )}
                        <div
                          className="mt-3 flex flex-wrap items-center gap-2"
                          role="group"
                          aria-label="Inventory pages"
                        >
                          <button
                            className="btn"
                            type="button"
                            disabled={busy !== null || held.page <= 1}
                            onClick={() => void refreshInventory(held.page - 1)}
                          >
                            Previous
                          </button>
                          <span className="text-sm">
                            Page {held.page} of {Math.max(1, held.totalPages)}
                          </span>
                          <button
                            className="btn"
                            type="button"
                            disabled={busy !== null || held.page >= held.totalPages}
                            onClick={() => void refreshInventory(held.page + 1)}
                          >
                            Next
                          </button>
                        </div>
                      </>
                    )}
                  </section>
                )}
                {expectedOwnerRef && (
                  <AgentDepositObservations
                    key={`${expectedOwnerRef}:${registered.world.registrationId}:${profile.profileId}:${profile.revision}`}
                    expectedOwnerRef={expectedOwnerRef}
                    registrationId={registered.world.registrationId}
                    profileId={profile.profileId}
                    revision={profile.revision}
                    onOwnerFailure={observationOwnerFailure}
                  />
                )}
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
