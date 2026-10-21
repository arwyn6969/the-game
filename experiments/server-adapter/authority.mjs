import { randomUUID } from "node:crypto";
import { SnapshotStore, canonical, copy, digest, jsonCopy } from "./store.mjs";
import { ENGINE_SOURCE } from "./engine.mjs";

export const OWNER = Object.freeze({
  kind: "human",
  accountId: "account:adapter-owner",
  sessionId: "session:initial",
});
export const CLOCK = Object.freeze({ kind: "system", service: "clock" });
export const NPC_WORKER = Object.freeze({ kind: "system", service: "fake-npc" });
export const AVATAR_WORKER = Object.freeze({ kind: "worker", workerId: "worker:avatar" });
const denied = (code, extra = {}) => ({ ok: false, code, ...extra });
const isId = (value) =>
  typeof value === "string" &&
  /^[a-zA-Z0-9:_-]{1,150}$/.test(value) &&
  !Object.hasOwn(Object.prototype, value);
const safeInteger = (value) => Number.isSafeInteger(value) && value >= 0;
const exact = (value, keys) =>
  value &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const samePrincipal = (a, b) => canonical(a) === canonical(b);
const humanControl = (sessionId, revision = 1, policyRevision = 0) => ({
  mode: "human",
  sessionId,
  revision,
  policyRevision,
  delegationId: null,
  lease: null,
  policy: null,
});
const common = ["requestId", "worldId", "kind"];
const playerFields = ["actorId", "observedRevision", "controllerRevision", "policyRevision"];
const fields = {
  quote: [...common, ...playerFields, "target", "quoteId"],
  tick: [...common, "tick"],
  delegate: [...common, ...playerFields, "workerId", "durationMs"],
  reclaim: [...common, "actorId", "controllerRevision"],
  "queue-avatar": [...common, ...playerFields, "leaseId"],
  "complete-job": [...common, "jobId", "output"],
};

function initialState(engine, raw) {
  if (typeof raw !== "string") throw new Error("Explicit synthetic import bytes required");
  const report = engine.save.readTownFile(raw);
  const worldId = `server-world:${randomUUID()}`;
  const town = report.status === "ready" ? report.town : null;
  return jsonCopy({
    format: 1,
    engineSource: ENGINE_SOURCE,
    worldId,
    revision: 0,
    admission: report.status === "ready" ? "ready" : "rejected",
    sourceImport: {
      raw,
      digest: digest(raw),
      status: report.status,
      reason: report.reason ?? null,
    },
    town,
    members: town
      ? Object.fromEntries(
          engine.types.AGENT_IDS.map((role) => [
            role,
            {
              role,
              characterId: `server-character:${digest({ worldId, role })}`,
              ownerAccountId: role === "player" ? OWNER.accountId : null,
              authority: role === "player" ? "player-controller" : "simulation",
              portable: engine.identity.characterRef(town, role),
            },
          ]),
        )
      : {},
    controller: humanControl(OWNER.sessionId),
    clock: { ticks: 0, elapsedMs: 0 },
    receipts: {},
    outbox: {},
  });
}

function validateState(engine, state) {
  if (state.format !== 1 || state.engineSource !== ENGINE_SOURCE)
    throw new Error("Unsupported adapter/engine version");
  if (state.sourceImport.digest !== digest(state.sourceImport.raw))
    throw new Error("Import bytes mismatch");
  if (state.admission === "rejected") {
    if (state.town !== null || Object.keys(state.members).length)
      throw new Error("Rejected import admitted state");
    return;
  }
  if (
    state.admission !== "ready" ||
    state.town.version !== 2 ||
    state.town.agents.length !== engine.types.AGENT_IDS.length
  )
    throw new Error("Invalid Town roster");
  const roles = state.town.agents.map((agent) => agent.id);
  if (
    new Set(roles).size !== roles.length ||
    !engine.types.AGENT_IDS.every((role) => roles.includes(role))
  )
    throw new Error("Fixed roster changed");
  if (!engine.identity.validateTownIdentity(state.town.identityRegistry, engine.types.AGENT_IDS))
    throw new Error("Invalid portable identities");
  if (Object.keys(state.members).length !== engine.types.AGENT_IDS.length)
    throw new Error("Invalid membership");
  for (const role of engine.types.AGENT_IDS) {
    const member = state.members[role];
    if (
      member?.role !== role ||
      member.characterId !== `server-character:${digest({ worldId: state.worldId, role })}` ||
      member.ownerAccountId !== (role === "player" ? OWNER.accountId : null) ||
      member.authority !== (role === "player" ? "player-controller" : "simulation") ||
      canonical(member.portable) !== canonical(engine.identity.characterRef(state.town, role))
    )
      throw new Error("Synthetic membership changed");
  }
  const issues = engine.economy.auditEconomy(state.town);
  if (issues.length) throw new Error(`Economy audit: ${issues.join("; ")}`);
  // Existing import validation is allowed to normalize this THROWAWAY copy only.
  const validation = engine.save.readTownFile(JSON.stringify({ version: 2, town: state.town }));
  if (validation.status !== "ready") throw new Error(`Town validation: ${validation.reason}`);
}

function ownsPlayer(state, principal) {
  return (
    exact(principal, ["kind", "accountId", "sessionId"]) &&
    principal.kind === "human" &&
    principal.accountId === state.members.player.ownerAccountId &&
    isId(principal.sessionId)
  );
}

function authorized(state, principal, request) {
  if (request.kind === "tick") return samePrincipal(principal, CLOCK);
  if (request.kind === "complete-job") {
    const job = Object.hasOwn(state.outbox, request.jobId) ? state.outbox[request.jobId] : null;
    if (!job) return false;
    return job.scope === "npc"
      ? samePrincipal(principal, NPC_WORKER)
      : exact(principal, ["kind", "workerId"]) &&
          principal.kind === "worker" &&
          principal.workerId === job.workerId;
  }
  if (request.actorId !== state.members.player.characterId) return false;
  if (request.kind === "queue-avatar")
    return (
      exact(principal, ["kind", "workerId"]) &&
      principal.kind === "worker" &&
      principal.workerId === state.controller.lease?.workerId
    );
  return ownsPlayer(state, principal);
}

function controllerError(state, principal, request) {
  const control = state.controller;
  if (!safeInteger(request.controllerRevision) || request.controllerRevision !== control.revision)
    return "STALE_CONTROLLER";
  if (request.kind === "reclaim") return null;
  if (!safeInteger(request.observedRevision) || request.observedRevision !== state.revision)
    return "STALE_WORLD";
  if (!safeInteger(request.policyRevision) || request.policyRevision !== control.policyRevision)
    return "STALE_POLICY";
  if (principal.kind === "human")
    return control.mode === "human" && principal.sessionId === control.sessionId
      ? null
      : "NOT_ACTIVE_CONTROLLER";
  if (control.mode !== "delegated" || request.leaseId !== control.lease?.id) return "INVALID_LEASE";
  if (state.clock.elapsedMs >= Math.min(control.lease.expiresAtMs, control.policy.expiresAtMs))
    return "EXPIRED_DELEGATION";
  return null;
}

function scopeMatches(job, result, engine) {
  if (!result || result.kind !== job.kind || result.mind !== "offline") return false;
  const allowed = job.agents ?? (job.kind === "talk" ? [job.a, job.b] : engine.types.NPC_IDS);
  if (allowed.some((role) => !engine.types.NPC_IDS.includes(role))) return false;
  if (result.kind === "plan")
    return Array.isArray(result.plans) && result.plans.every((plan) => allowed.includes(plan.id));
  if (result.kind === "reflect")
    return (
      Array.isArray(result.agents) && result.agents.every((agent) => allowed.includes(agent.id))
    );
  return (
    result.kind === "talk" &&
    result.a === job.a &&
    result.b === job.b &&
    Array.isArray(result.lines) &&
    result.lines.every((line) => allowed.includes(line.speaker))
  );
}

export class EngineAuthority {
  #engine;
  #store;
  #state;
  #fault;
  #views = new Set();
  #closed = false;
  #uncertain = false;

  constructor(directory, engine, { raw, fault } = {}) {
    this.#engine = engine;
    this.#fault = fault;
    this.#store = new SnapshotStore(directory, {
      initialize: () => initialState(engine, raw),
      fault,
    });
    try {
      this.#state = this.#store.read();
      if (raw !== undefined && raw !== this.#state.sourceImport.raw)
        throw new Error("IMPORT_CONFLICT: existing world cannot be overwritten");
      validateState(engine, this.#state);
    } catch (error) {
      this.#store.close();
      throw error;
    }
  }

  snapshot() {
    if (this.#closed || this.#uncertain)
      throw new Error("Authority unavailable; reopen and reconcile");
    return copy(this.#state);
  }

  connectView() {
    const view = { snapshot: this.snapshot(), connected: true };
    this.#views.add(view);
    return {
      read: () => {
        if (!view.connected) throw new Error("Disconnected view");
        this.snapshot();
        return copy(view.snapshot);
      },
      disconnect: () => {
        view.connected = false;
        this.#views.delete(view);
      },
    };
  }

  get clientCount() {
    return this.#views.size;
  }
  stats() {
    return this.#store.stats();
  }
  exportPortable() {
    return this.#engine.save.exportTown(copy(this.snapshot().town));
  }

  #apply(draft, principal, request, pending) {
    const engine = this.#engine;
    const nextRevision = draft.revision + 1;
    if (request.kind === "tick") {
      if (!safeInteger(request.tick) || request.tick !== draft.clock.ticks + 1)
        return { reject: "STALE_TICK" };
      const engineJob = engine.sim.stepMinute(draft.town, true);
      draft.clock.ticks = request.tick;
      draft.clock.elapsedMs += 1000;
      if (
        draft.controller.mode === "delegated" &&
        draft.clock.elapsedMs >=
          Math.min(draft.controller.lease.expiresAtMs, draft.controller.policy.expiresAtMs)
      ) {
        draft.controller = {
          ...humanControl(null, draft.controller.revision + 1, draft.controller.policyRevision + 1),
          mode: "parked",
        };
        for (const job of Object.values(draft.outbox))
          if (job.scope === "avatar" && job.status === "pending") job.status = "cancelled";
      }
      if (engineJob)
        pending.push({
          id: `job:${request.requestId}`,
          scope: "npc",
          status: "pending",
          originRequestId: request.requestId,
          observedRevision: nextRevision,
          observation: jsonCopy(draft.town),
          engineJob,
        });
      return { ok: true, code: "TICKED", jobId: engineJob ? `job:${request.requestId}` : null };
    }
    if (request.kind === "complete-job") return this.#complete(draft, request);
    const error = controllerError(draft, principal, request);
    if (error) return { reject: error };
    if (request.kind === "reclaim") {
      draft.controller = humanControl(
        principal.sessionId,
        draft.controller.revision + 1,
        draft.controller.policyRevision + 1,
      );
      for (const job of Object.values(draft.outbox))
        if (job.scope === "avatar" && job.status === "pending") job.status = "cancelled";
      return { ok: true, code: "RECLAIMED" };
    }
    if (request.kind === "delegate") {
      if (
        !isId(request.workerId) ||
        !safeInteger(request.durationMs) ||
        request.durationMs < 1000 ||
        request.durationMs > 60_000
      )
        return { reject: "INVALID_POLICY" };
      const control = draft.controller;
      draft.controller = {
        mode: "delegated",
        revision: control.revision + 1,
        policyRevision: control.policyRevision + 1,
        sessionId: null,
        delegationId: `delegation:${request.requestId}`,
        policy: { actions: ["move"], expiresAtMs: draft.clock.elapsedMs + request.durationMs },
        lease: {
          id: `lease:${request.requestId}`,
          workerId: request.workerId,
          expiresAtMs: draft.clock.elapsedMs + Math.min(3000, request.durationMs),
        },
      };
      return { ok: true, code: "DELEGATED" };
    }
    if (request.kind === "queue-avatar") {
      pending.push({
        id: `job:${request.requestId}`,
        scope: "avatar",
        status: "pending",
        originRequestId: request.requestId,
        observedRevision: nextRevision,
        observation: jsonCopy(draft.town),
        workerId: principal.workerId,
        actorId: request.actorId,
        controller: copy(draft.controller),
      });
      return { ok: true, code: "QUEUED", jobId: `job:${request.requestId}` };
    }
    if (!engine.types.AGENT_IDS.includes(request.target) || typeof request.quoteId !== "string")
      return { reject: "INVALID_QUOTE" };
    const result = engine.effects.applyPlayerAction(draft.town, request.target, request.quoteId);
    return result.ok
      ? { ok: true, code: "PLAYER_ACTION", reply: result.reply }
      : { reject: "ENGINE_REJECTED", reply: result.reply };
  }

  #complete(draft, request) {
    const job = draft.outbox[request.jobId];
    if (job.status !== "pending") return { reject: `JOB_${job.status.toUpperCase()}` };
    const rejectJob = (code) => {
      job.status = "rejected";
      job.result = { ok: false, code };
      return job.result;
    };
    if (job.scope === "avatar") {
      const control = draft.controller;
      if (
        control.mode !== "delegated" ||
        control.revision !== job.controller.revision ||
        control.policyRevision !== job.controller.policyRevision ||
        control.lease?.id !== job.controller.lease.id ||
        control.lease.workerId !== job.workerId ||
        draft.clock.elapsedMs >= Math.min(control.policy.expiresAtMs, control.lease.expiresAtMs)
      )
        return rejectJob("STALE_CONTROLLER");
    }
    if (job.observedRevision !== draft.revision) return rejectJob("STALE_JOB");
    const output = request.output;
    if (job.scope === "npc") {
      if (
        !exact(output, ["kind", "result"]) ||
        output.kind !== "npc" ||
        !scopeMatches(job.engineJob, output.result, this.#engine)
      )
        return { reject: "INVALID_JOB_OUTPUT" };
      this.#engine.effects.applyResult(draft.town, copy(output.result));
    } else {
      if (
        !exact(output, ["kind", "dx", "dy"]) ||
        output.kind !== "move" ||
        !Number.isInteger(output.dx) ||
        !Number.isInteger(output.dy) ||
        Math.abs(output.dx) + Math.abs(output.dy) !== 1
      )
        return { reject: "INVALID_MOVE" };
      const player = draft.town.agents.find((agent) => agent.id === "player");
      const next = { x: player.tile.x + output.dx, y: player.tile.y + output.dy };
      if (
        !this.#engine.world.walkable(next.x, next.y) ||
        draft.town.agents.some(
          (agent) => agent.id !== "player" && agent.tile.x === next.x && agent.tile.y === next.y,
        )
      )
        return { reject: "INVALID_MOVE" };
      player.tile = next;
      player.path = [];
      player.face = output.dx > 0 ? "e" : output.dx < 0 ? "w" : output.dy > 0 ? "s" : "n";
    }
    job.status = "completed";
    job.result = { ok: true, code: "JOB_APPLIED", appliedTownDigest: digest(jsonCopy(draft.town)) };
    return job.result;
  }

  submit(principal, request) {
    if (this.#closed || this.#uncertain) return denied("UNAVAILABLE");
    if (this.#state.admission !== "ready") return denied("IMPORT_REJECTED");
    let fingerprint;
    try {
      fingerprint = digest({ principal, request });
      principal = copy(principal);
      request = copy(request);
    } catch {
      return denied("INVALID_JSON");
    }
    if (
      !principal ||
      !request ||
      typeof request.kind !== "string" ||
      !Object.hasOwn(fields, request.kind)
    )
      return denied("CAPABILITY_DENIED");
    if (
      !exact(request, fields[request.kind]) ||
      !isId(request.requestId) ||
      request.worldId !== this.#state.worldId
    )
      return denied("INVALID_REQUEST");
    if (request.kind === "complete-job" && !isId(request.jobId)) return denied("INVALID_REQUEST");
    if (!authorized(this.#state, principal, request)) return denied("FORBIDDEN");
    const previous = this.#state.receipts[request.requestId];
    if (previous)
      return previous.fingerprint === fingerprint
        ? denied("DUPLICATE_REQUEST", { receipt: copy(previous) })
        : denied("REQUEST_ID_CONFLICT");
    const draft = copy(this.#state);
    const pending = [];
    let outcome;
    try {
      outcome = this.#apply(draft, principal, request, pending);
      if (outcome.reject)
        return denied(outcome.reject, outcome.reply ? { reply: outcome.reply } : {});
      this.#fault?.("after-engine");
      validateState(this.#engine, draft);
      draft.revision += 1;
      const beforeCommands = new Set(
        this.#state.town.economy?.commandReceipts.map((receipt) => receipt.id) ?? [],
      );
      const beforeTransactions = new Set(
        this.#state.town.economy?.transactions.map((item) => item.id) ?? [],
      );
      draft.receipts[request.requestId] = {
        requestId: request.requestId,
        fingerprint,
        revision: draft.revision,
        outcome,
        quoteId: request.kind === "quote" ? request.quoteId : null,
        townDigest: digest(jsonCopy(draft.town)),
        engineCommandIds: (draft.town.economy?.commandReceipts ?? [])
          .filter((receipt) => !beforeCommands.has(receipt.id))
          .map((receipt) => receipt.id),
        transactionIds: (draft.town.economy?.transactions ?? [])
          .filter((item) => !beforeTransactions.has(item.id))
          .map((item) => item.id),
      };
      this.#fault?.("after-receipt");
      for (const job of pending) draft.outbox[job.id] = job;
      this.#fault?.("after-outbox");
    } catch (error) {
      return denied("DRAFT_FAILED", { reason: error.message });
    }
    const committed = jsonCopy(draft);
    try {
      this.#store.commit(committed);
    } catch {
      this.#uncertain = true;
      return denied("STORAGE_UNCERTAIN");
    }
    this.#state = committed;
    for (const view of this.#views) view.snapshot = copy(committed);
    return { ...copy(outcome), receipt: copy(committed.receipts[request.requestId]) };
  }

  fakeOutput(jobId) {
    const job = this.snapshot().outbox[jobId];
    if (!job || job.scope !== "npc") throw new Error("Expected a synthetic NPC job");
    return jsonCopy({
      kind: "npc",
      result: this.#engine.offline.offlineResult(copy(job.observation), copy(job.engineJob)),
    });
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    for (const view of this.#views) view.connected = false;
    this.#views.clear();
    this.#store.close();
  }
}

export function playerIntent(state, kind, requestId, payload = {}) {
  return {
    kind,
    requestId,
    worldId: state.worldId,
    actorId: state.members.player.characterId,
    ...(kind === "reclaim"
      ? {}
      : { observedRevision: state.revision, policyRevision: state.controller.policyRevision }),
    controllerRevision: state.controller.revision,
    ...payload,
  };
}
export const tickIntent = (state) => ({
  kind: "tick",
  requestId: `tick:${state.clock.ticks + 1}`,
  worldId: state.worldId,
  tick: state.clock.ticks + 1,
});
export const completionIntent = (state, jobId, output, requestId = `complete:${jobId}`) => ({
  kind: "complete-job",
  requestId,
  worldId: state.worldId,
  jobId,
  output,
});
