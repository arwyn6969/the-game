import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

// LOCAL SPIKE ONLY: synthetic state, trusted in-process principals, one writer.
// No network endpoint, Town import, auth integration, money or provider calls.
const CLOCK_ID = "clock:single";
const STEP_MS = 1000;
const LEASE_MS = 3000;
const ZERO_HASH = "0".repeat(64);
const clone = (value) => structuredClone(value);

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  throw new Error("Only finite plain JSON is supported.");
}

const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const reject = (code, extra = {}) => ({ ok: false, code, ...extra });
const isId = (value) =>
  typeof value === "string" &&
  /^[a-zA-Z0-9:_-]{1,120}$/.test(value) &&
  !Object.hasOwn(Object.prototype, value);
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const humanController = (sessionId, revision = 1, policyRevision = 0) => ({
  mode: "human",
  revision,
  policyRevision,
  sessionId,
  delegationId: null,
  policy: null,
  lease: null,
});

export function syntheticWorld() {
  return {
    schemaVersion: 1,
    worldId: "world:spike",
    revision: 0,
    clock: { tick: 0, elapsedMs: 0, gameMinute: 480 },
    bounds: { width: 5, height: 5 },
    actors: Object.fromEntries(
      ["alpha", "beta"].map((name, index) => [
        `character:${name}`,
        {
          characterId: `character:${name}`,
          ownerAccountId: `account:${name}`,
          position: { x: 1, y: 1 + index },
          moveCount: 0,
          controller: humanController(`session:${name}`),
        },
      ]),
    ),
    receipts: {},
  };
}

const fields = {
  move: [
    "actionId",
    "worldId",
    "kind",
    "characterId",
    "observedRevision",
    "controllerRevision",
    "policyRevision",
    "leaseId",
    "dx",
    "dy",
  ],
  delegate: [
    "actionId",
    "worldId",
    "kind",
    "characterId",
    "observedRevision",
    "controllerRevision",
    "policyRevision",
    "workerId",
    "durationMs",
  ],
  reclaim: ["actionId", "worldId", "kind", "characterId", "controllerRevision"],
  tick: ["actionId", "worldId", "kind", "tick"],
};

function exactFields(value, keys) {
  return (
    value &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function authorizedActor(state, principal, request) {
  if (request.kind === "tick") {
    return (
      exactFields(principal, ["kind", "clockId"]) &&
      principal.kind === "clock" &&
      principal.clockId === CLOCK_ID
    );
  }
  if (!isId(request.characterId) || !Object.hasOwn(state.actors, request.characterId)) return false;
  const actor = state.actors[request.characterId];
  if (principal.kind === "human") {
    return (
      exactFields(principal, ["kind", "accountId", "sessionId"]) &&
      isId(principal.accountId) &&
      principal.accountId === actor.ownerAccountId &&
      isId(principal.sessionId)
    );
  }
  return (
    exactFields(principal, ["kind", "workerId"]) &&
    principal.kind === "worker" &&
    isId(principal.workerId) &&
    request.kind === "move" &&
    actor.controller.lease?.workerId === principal.workerId
  );
}

function plan(state, principal, request) {
  if (request.kind === "tick") {
    if (!integer(request.tick) || request.tick !== state.clock.tick + 1)
      return reject("STALE_TICK");
    return { kind: "ticked", tick: request.tick };
  }
  const actor = state.actors[request.characterId];
  const controller = actor.controller;
  if (!integer(request.controllerRevision) || request.controllerRevision !== controller.revision)
    return reject("STALE_CONTROLLER");

  // Owner reclaim deliberately does not wait for inference or an up-to-date world view.
  // It still compares controller revision so an old queued tab cannot undo a newer choice.
  if (request.kind === "reclaim") {
    if (principal.kind !== "human") return reject("FORBIDDEN");
    return {
      kind: "controlSet",
      characterId: actor.characterId,
      controller: humanController(
        principal.sessionId,
        controller.revision + 1,
        controller.policyRevision + 1,
      ),
    };
  }
  if (!integer(request.observedRevision) || request.observedRevision !== state.revision)
    return reject("STALE_WORLD");
  if (!integer(request.policyRevision) || request.policyRevision !== controller.policyRevision)
    return reject("STALE_POLICY");

  if (principal.kind === "human") {
    if (controller.mode !== "human" || controller.sessionId !== principal.sessionId)
      return reject("NOT_ACTIVE_CONTROLLER");
  } else {
    if (controller.mode !== "delegated" || request.leaseId !== controller.lease?.leaseId)
      return reject("INVALID_LEASE");
    if (
      state.clock.elapsedMs >= controller.lease.expiresAtMs ||
      state.clock.elapsedMs >= controller.policy.expiresAtMs
    )
      return reject("EXPIRED_DELEGATION");
    if (!controller.policy.actions.includes(request.kind)) return reject("CAPABILITY_DENIED");
  }
  if (request.kind === "delegate") {
    if (principal.kind !== "human") return reject("FORBIDDEN");
    if (
      !isId(request.workerId) ||
      !integer(request.durationMs) ||
      request.durationMs < STEP_MS ||
      request.durationMs > 60_000
    )
      return reject("INVALID_POLICY");
    return {
      kind: "controlSet",
      characterId: actor.characterId,
      controller: {
        mode: "delegated",
        revision: controller.revision + 1,
        policyRevision: controller.policyRevision + 1,
        sessionId: null,
        delegationId: `delegation:${request.actionId}`,
        policy: { actions: ["move"], expiresAtMs: state.clock.elapsedMs + request.durationMs },
        lease: {
          leaseId: `lease:${request.actionId}`,
          workerId: request.workerId,
          expiresAtMs: state.clock.elapsedMs + Math.min(LEASE_MS, request.durationMs),
        },
      },
    };
  }
  if (principal.kind === "human" && request.leaseId !== null) return reject("INVALID_LEASE");
  if (
    !Number.isInteger(request.dx) ||
    !Number.isInteger(request.dy) ||
    Math.abs(request.dx) + Math.abs(request.dy) !== 1
  )
    return reject("INVALID_MOVE");
  const position = { x: actor.position.x + request.dx, y: actor.position.y + request.dy };
  if (
    position.x < 0 ||
    position.x >= state.bounds.width ||
    position.y < 0 ||
    position.y >= state.bounds.height
  )
    return reject("INVALID_MOVE");
  return { kind: "moved", characterId: actor.characterId, position };
}

// Replay applies recorded facts, never re-runs inference or sends external effects.
function applyEvent(state, event) {
  if (event.kind === "moved") {
    state.actors[event.characterId].position = clone(event.position);
    state.actors[event.characterId].moveCount += 1;
  } else if (event.kind === "controlSet") {
    state.actors[event.characterId].controller = clone(event.controller);
  } else if (event.kind === "ticked") {
    if (event.tick !== state.clock.tick + 1) throw new Error("Noncontiguous tick history.");
    state.clock.tick = event.tick;
    state.clock.elapsedMs += STEP_MS;
    state.clock.gameMinute += 1;
    for (const actor of Object.values(state.actors)) {
      const control = actor.controller;
      if (
        control.mode === "delegated" &&
        state.clock.elapsedMs >= Math.min(control.policy.expiresAtMs, control.lease.expiresAtMs)
      ) {
        actor.controller = {
          ...humanController(null, control.revision + 1, control.policyRevision + 1),
          mode: "parked",
        };
      }
    }
  } else throw new Error("Unknown event version; recovery stopped.");
}

function applyRecord(state, record) {
  const { hash, ...body } = record;
  if (
    digest(body) !== hash ||
    record.revision !== state.revision + 1 ||
    Object.hasOwn(state.receipts, record.actionId)
  )
    throw new Error("Invalid or repeated journal record; recovery stopped.");
  applyEvent(state, record.event);
  state.revision = record.revision;
  state.receipts[record.actionId] = {
    actionId: record.actionId,
    fingerprint: record.fingerprint,
    revision: record.revision,
    event: clone(record.event),
  };
  if (digest(state) !== record.stateHash)
    throw new Error("State digest mismatch; recovery stopped.");
}

export class LocalAuthority {
  #directory;
  #lockPath;
  #journalPath;
  #journal;
  #state;
  #closed = false;
  #uncertain = false;
  #views = new Set();
  #afterPersist;

  static open(directory, { afterPersist } = {}) {
    return new LocalAuthority(directory, afterPersist);
  }

  constructor(directory, afterPersist) {
    this.#directory = directory;
    this.#lockPath = join(directory, "writer.lock");
    this.#journalPath = join(directory, "journal.json");
    this.#afterPersist = afterPersist;
    mkdirSync(directory, { recursive: true });
    // Atomic exclusive creation prevents a second process/instance opening the writer.
    // A killed process leaves this lock: recovery requires verified operator intervention.
    const lock = openSync(this.#lockPath, "wx", 0o600);
    try {
      writeFileSync(lock, JSON.stringify({ pid: process.pid }));
      fsyncSync(lock);
    } catch (error) {
      unlinkSync(this.#lockPath);
      throw error;
    } finally {
      closeSync(lock);
    }
    try {
      if (existsSync(this.#journalPath)) {
        this.#journal = JSON.parse(readFileSync(this.#journalPath, "utf8"));
      } else {
        this.#journal = { format: 1, genesis: syntheticWorld(), records: [] };
        this.#persist(this.#journal);
      }
      if (
        this.#journal.format !== 1 ||
        !Array.isArray(this.#journal.records) ||
        canonical(this.#journal.genesis) !== canonical(syntheticWorld())
      )
        throw new Error("Unsupported journal or genesis; recovery stopped.");
      this.#state = clone(this.#journal.genesis);
      let previousHash = ZERO_HASH;
      for (const record of this.#journal.records) {
        if (record.previousHash !== previousHash) throw new Error("Broken journal chain.");
        applyRecord(this.#state, record);
        previousHash = record.hash;
      }
    } catch (error) {
      unlinkSync(this.#lockPath);
      throw error;
    }
  }

  #persist(journal) {
    const temporary = join(this.#directory, `journal-${randomUUID()}.tmp`);
    const file = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(file, JSON.stringify(journal));
      fsyncSync(file);
    } finally {
      closeSync(file);
    }
    try {
      renameSync(temporary, this.#journalPath);
      const directory = openSync(this.#directory, "r");
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }

  snapshot() {
    if (this.#closed || this.#uncertain)
      throw new Error("Writer unavailable; reopen and reconcile.");
    return clone(this.#state);
  }

  get clientCount() {
    return this.#views.size;
  }

  connectView() {
    const view = { snapshot: this.snapshot(), connected: true };
    this.#views.add(view);
    return {
      read: () => {
        if (!view.connected) throw new Error("Client disconnected.");
        if (this.#closed || this.#uncertain) throw new Error("Writer unavailable; reconnect.");
        return clone(view.snapshot);
      },
      disconnect: () => {
        view.connected = false;
        this.#views.delete(view);
      },
    };
  }

  submit(principal, request) {
    if (this.#closed) return reject("CLOSED");
    if (this.#uncertain) return reject("STORAGE_UNCERTAIN");
    let fingerprint;
    try {
      fingerprint = digest({ principal, request });
      principal = clone(principal);
      request = clone(request);
    } catch {
      return reject("INVALID_JSON");
    }
    if (!principal || !request || !Object.hasOwn(fields, request.kind))
      return reject("CAPABILITY_DENIED");
    if (
      !exactFields(request, fields[request.kind]) ||
      !isId(request.actionId) ||
      request.worldId !== this.#state.worldId
    )
      return reject("INVALID_REQUEST");
    if (!authorizedActor(this.#state, principal, request)) return reject("FORBIDDEN");
    const previous = this.#state.receipts[request.actionId];
    if (previous) {
      return previous.fingerprint === fingerprint
        ? reject("DUPLICATE_ACTION", { receipt: clone(previous) })
        : reject("ACTION_ID_CONFLICT");
    }
    const event = plan(this.#state, principal, request);
    if (event.ok === false) return event;
    const draft = clone(this.#state);
    applyEvent(draft, event);
    draft.revision += 1;
    const receipt = { actionId: request.actionId, fingerprint, revision: draft.revision, event };
    draft.receipts[request.actionId] = receipt;
    const body = {
      ...receipt,
      previousHash: this.#journal.records.at(-1)?.hash ?? ZERO_HASH,
      stateHash: digest(draft),
    };
    const record = { ...body, hash: digest(body) };
    const nextJournal = { ...this.#journal, records: [...this.#journal.records, record] };
    try {
      this.#persist(nextJournal);
      // Fault seam: commit is durable but the response/process may disappear here.
      this.#afterPersist?.(clone(record));
    } catch {
      this.#uncertain = true;
      return reject("STORAGE_UNCERTAIN");
    }
    this.#journal = nextJournal;
    this.#state = draft;
    for (const view of this.#views) view.snapshot = clone(draft);
    return { ok: true, receipt: clone(receipt) };
  }

  tick() {
    const tick = this.snapshot().clock.tick + 1;
    return this.submit(
      { kind: "clock", clockId: CLOCK_ID },
      { kind: "tick", worldId: this.#state.worldId, actionId: `tick:${tick}`, tick },
    );
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    for (const view of this.#views) view.connected = false;
    this.#views.clear();
    unlinkSync(this.#lockPath);
  }
}

export function moveIntent(snapshot, characterId, actionId, dx = 1, dy = 0) {
  const controller = snapshot.actors[characterId].controller;
  return {
    kind: "move",
    worldId: snapshot.worldId,
    actionId,
    characterId,
    observedRevision: snapshot.revision,
    controllerRevision: controller.revision,
    policyRevision: controller.policyRevision,
    leaseId: controller.lease?.leaseId ?? null,
    dx,
    dy,
  };
}

export function delegateIntent(snapshot, characterId, actionId, workerId, durationMs = 10_000) {
  const controller = snapshot.actors[characterId].controller;
  return {
    kind: "delegate",
    worldId: snapshot.worldId,
    actionId,
    characterId,
    observedRevision: snapshot.revision,
    controllerRevision: controller.revision,
    policyRevision: controller.policyRevision,
    workerId,
    durationMs,
  };
}

export function reclaimIntent(snapshot, characterId, actionId) {
  return {
    kind: "reclaim",
    worldId: snapshot.worldId,
    actionId,
    characterId,
    controllerRevision: snapshot.actors[characterId].controller.revision,
  };
}
