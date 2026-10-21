import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export const copy = (value) => structuredClone(value);
export const jsonCopy = (value) => JSON.parse(JSON.stringify(value));
export function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  throw new Error("Expected finite plain JSON");
}
export const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const validHash = (hash) => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash);

// Single LOCAL writer; immutable full-state records and an atomically replaced HEAD.
// HEAD is the commit point. Orphan records after a failed write are never replayed.
export class SnapshotStore {
  #directory;
  #head = null;
  #state;
  #closed = false;
  #uncertain = false;
  #fault;

  constructor(directory, { initialize, fault } = {}) {
    this.#directory = directory;
    this.#fault = fault;
    mkdirSync(directory, { recursive: true });
    const lock = openSync(join(directory, "writer.lock"), "wx", 0o600);
    try {
      writeFileSync(lock, JSON.stringify({ pid: process.pid }));
      fsyncSync(lock);
    } finally {
      closeSync(lock);
    }
    try {
      if (existsSync(join(directory, "HEAD"))) this.#load();
      else {
        if (readdirSync(directory).some((name) => name !== "writer.lock"))
          throw new Error(
            "Missing HEAD with retained store evidence; preserve all bytes for manual recovery",
          );
        if (!initialize) throw new Error("A new store needs an explicit import");
        const initial = initialize();
        if (initial.revision !== 0) throw new Error("Invalid genesis revision");
        this.#write(initial, false);
      }
    } catch (error) {
      this.close();
      throw error;
    }
  }

  #syncDirectory() {
    const fd = openSync(this.#directory, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }

  #load() {
    const head = JSON.parse(readFileSync(join(this.#directory, "HEAD"), "utf8"));
    if (!validHash(head.hash) || !Number.isSafeInteger(head.revision) || head.revision < 0)
      throw new Error("Invalid HEAD; preserve bytes for recovery");
    let hash = head.hash;
    let expected = head.revision;
    let current;
    const seen = new Set();
    while (hash !== null) {
      if (!validHash(hash) || seen.has(hash)) throw new Error("Invalid record chain");
      seen.add(hash);
      const record = JSON.parse(readFileSync(join(this.#directory, `${hash}.json`), "utf8"));
      if (
        digest(record) !== hash ||
        record.format !== 1 ||
        record.revision !== expected ||
        record.state.revision !== expected
      )
        throw new Error("Invalid snapshot record");
      if (current === undefined) current = record.state;
      hash = record.previous;
      expected -= 1;
    }
    if (expected !== -1) throw new Error("Incomplete snapshot chain");
    this.#head = head;
    this.#state = current;
  }

  #write(state, inject) {
    const record = {
      format: 1,
      revision: state.revision,
      previous: this.#head?.hash ?? null,
      state,
    };
    const hash = digest(record);
    const bytes = canonical(record);
    const path = join(this.#directory, `${hash}.json`);
    if (existsSync(path)) {
      if (readFileSync(path, "utf8") !== bytes)
        throw new Error("Content-addressed record mismatch");
    } else {
      const file = openSync(path, "wx", 0o600);
      try {
        writeFileSync(file, bytes);
        fsyncSync(file);
      } finally {
        closeSync(file);
      }
    }
    this.#syncDirectory();
    if (inject) this.#fault?.("after-record-sync");
    const head = { hash, revision: state.revision };
    const temporary = join(this.#directory, `HEAD-${randomUUID()}.tmp`);
    const file = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(file, canonical(head));
      fsyncSync(file);
    } finally {
      closeSync(file);
    }
    try {
      if (inject) this.#fault?.("before-head-rename");
      renameSync(temporary, join(this.#directory, "HEAD"));
      this.#syncDirectory();
      if (inject) this.#fault?.("after-head-sync");
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    this.#head = head;
    this.#state = copy(state);
  }

  read() {
    if (this.#closed || this.#uncertain) throw new Error("Store unavailable; reopen and reconcile");
    return copy(this.#state);
  }

  commit(state) {
    if (this.#closed || this.#uncertain) throw new Error("Store unavailable");
    if (state.revision !== this.#state.revision + 1) throw new Error("Noncontiguous commit");
    try {
      this.#write(state, true);
    } catch (error) {
      this.#uncertain = true;
      throw error;
    }
  }

  stats() {
    const records = readdirSync(this.#directory).filter((name) =>
      /^[a-f0-9]{64}\.json$/.test(name),
    );
    return {
      physicalRecords: records.length,
      committedRevisions: (this.#head?.revision ?? -1) + 1,
      latestRecordBytes: this.#head
        ? statSync(join(this.#directory, `${this.#head.hash}.json`)).size
        : 0,
      totalRecordBytes: records.reduce(
        (total, name) => total + statSync(join(this.#directory, name)).size,
        0,
      ),
    };
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    unlinkSync(join(this.#directory, "writer.lock"));
  }
}
