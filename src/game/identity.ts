import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { AGENT_IDS } from "./types";
import type {
  Agent,
  AgentId,
  CharacterRef,
  Town,
  TownCharacterIdentity,
  TownIdentityRegistry,
  TownRecordRef,
} from "./types";

export type {
  CharacterRef,
  TownCharacterIdentity,
  TownIdentityRegistry,
  TownRecordRef,
} from "./types";

type IdentityTown = Pick<Town, "identityRegistry"> & Partial<Pick<Town, "agents">>;

const WORLD_ID = /^world_[0-9a-f]{64}$/;
const CHARACTER_ID = /^character_[0-9a-f]{64}$/;

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Reflect.ownKeys(value).every((key) => typeof key === "string" && allowed.has(key))
  );
}

function validAgentIds(ids: readonly AgentId[]): boolean {
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    new Set(ids).size === ids.length &&
    ids.every((id) => (AGENT_IDS as readonly unknown[]).includes(id))
  );
}

function assertAgentIds(ids: readonly AgentId[]): void {
  if (!validAgentIds(ids)) throw new Error("Identity requires a complete, distinct local roster.");
}

function digest(text: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(text)));
}

function randomHex(): string {
  const source = globalThis.crypto;
  if (typeof source?.getRandomValues === "function")
    return bytesToHex(source.getRandomValues(new Uint8Array(32)));
  throw new Error("Secure randomness is unavailable; a new world identity could not be created.");
}

/** Registry checks reject damaged identity rather than assigning a replacement. */
export function validateTownIdentity(
  value: unknown,
  expectedAgentIds: readonly AgentId[],
): value is TownIdentityRegistry {
  try {
    if (
      !validAgentIds(expectedAgentIds) ||
      !record(value) ||
      !exactKeys(
        value,
        ["schemaVersion", "worldId", "rootWorldId", "characters"],
        ["parentWorldId"],
      ) ||
      value.schemaVersion !== 1 ||
      typeof value.worldId !== "string" ||
      !WORLD_ID.test(value.worldId) ||
      typeof value.rootWorldId !== "string" ||
      !WORLD_ID.test(value.rootWorldId) ||
      !record(value.characters) ||
      !exactKeys(value.characters, expectedAgentIds)
    )
      return false;

    const forked = Object.hasOwn(value, "parentWorldId");
    if (forked) {
      if (
        typeof value.parentWorldId !== "string" ||
        !WORLD_ID.test(value.parentWorldId) ||
        value.parentWorldId === value.worldId ||
        value.rootWorldId === value.worldId
      )
        return false;
    } else if (value.rootWorldId !== value.worldId) return false;

    const currentIds = new Set<string>();
    const previousIds = new Set<string>();
    for (const agentId of expectedAgentIds) {
      const character = value.characters[agentId];
      if (
        !record(character) ||
        !exactKeys(
          character,
          ["characterId", "archetypeId", "originWorldId"],
          ["forkedFromCharacterId"],
        ) ||
        typeof character.characterId !== "string" ||
        !CHARACTER_ID.test(character.characterId) ||
        character.archetypeId !== agentId ||
        typeof character.originWorldId !== "string" ||
        !WORLD_ID.test(character.originWorldId) ||
        currentIds.has(character.characterId)
      )
        return false;
      currentIds.add(character.characterId);
      if (forked) {
        if (
          character.originWorldId === value.worldId ||
          typeof character.forkedFromCharacterId !== "string" ||
          !CHARACTER_ID.test(character.forkedFromCharacterId) ||
          previousIds.has(character.forkedFromCharacterId)
        )
          return false;
        previousIds.add(character.forkedFromCharacterId);
      } else if (
        character.originWorldId !== value.worldId ||
        Object.hasOwn(character, "forkedFromCharacterId")
      )
        return false;
    }
    return [...previousIds].every((id) => !currentIds.has(id));
  } catch {
    return false;
  }
}

/** Fresh local worlds have cryptographically random, opaque identifiers. */
export function createTownIdentity(agentIds: readonly AgentId[]): TownIdentityRegistry {
  assertAgentIds(agentIds);
  const worldId = `world_${randomHex()}`;
  const characters = Object.fromEntries(
    agentIds.map((archetypeId) => [
      archetypeId,
      {
        characterId: `character_${randomHex()}`,
        archetypeId,
        originWorldId: worldId,
      },
    ]),
  ) as Record<AgentId, TownCharacterIdentity>;
  const registry: TownIdentityRegistry = {
    schemaVersion: 1,
    worldId,
    rootWorldId: worldId,
    characters,
  };
  if (!validateTownIdentity(registry, agentIds))
    throw new Error("Fresh world identity is invalid.");
  return registry;
}

function canonicalLegacyTown(value: unknown): string {
  if (!record(value)) throw new Error("Legacy identity requires the original town object.");
  const ancestors = new Set<object>();
  function encode(entry: unknown, root = false): string {
    if (entry === null || typeof entry === "string" || typeof entry === "boolean")
      return JSON.stringify(entry);
    if (typeof entry === "number" && Number.isFinite(entry)) return JSON.stringify(entry);
    if (!entry || typeof entry !== "object" || ancestors.has(entry))
      throw new Error("Legacy identity requires finite, acyclic JSON.");
    ancestors.add(entry);
    let encoded: string;
    if (Array.isArray(entry))
      encoded = `[${Array.from(entry, (item) => (item === undefined ? "null" : encode(item))).join(",")}]`;
    else if (record(entry))
      encoded = `{${Object.keys(entry)
        // Runtime optional fields have the same representation as exported JSON.
        .filter((key) => (!root || key !== "identityRegistry") && entry[key] !== undefined)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${encode(entry[key])}`)
        .join(",")}}`;
    else throw new Error("Legacy identity requires plain JSON objects.");
    ancestors.delete(entry);
    return encoded;
  }
  return encode(value, true);
}

/**
 * Identical old snapshots intentionally recover identical provenance. Hash the
 * original parsed town before save validation repairs any narrative or balances.
 * This identifier is reproducible and provides no ownership/authentication proof.
 */
export function legacyTownIdentity(
  originalLegacyValue: unknown,
  agentIds: readonly AgentId[],
): TownIdentityRegistry {
  assertAgentIds(agentIds);
  const worldId = `world_${digest(`the-game:legacy-world:v1\n${canonicalLegacyTown(originalLegacyValue)}`)}`;
  const characters = Object.fromEntries(
    agentIds.map((archetypeId) => [
      archetypeId,
      {
        characterId: `character_${digest(`the-game:legacy-character:v1\n${worldId}\n${archetypeId}`)}`,
        archetypeId,
        originWorldId: worldId,
      },
    ]),
  ) as Record<AgentId, TownCharacterIdentity>;
  const registry: TownIdentityRegistry = {
    schemaVersion: 1,
    worldId,
    rootWorldId: worldId,
    characters,
  };
  if (!validateTownIdentity(registry, agentIds))
    throw new Error("Legacy world identity is invalid.");
  return registry;
}

function requireRegistry(town: IdentityTown): TownIdentityRegistry {
  const ids = town.agents ? town.agents.map((agent) => agent.id) : AGENT_IDS;
  if (!validateTownIdentity(town.identityRegistry, ids))
    throw new Error("The town identity registry is missing or invalid.");
  return town.identityRegistry;
}

export function characterRef(town: IdentityTown, localAgentId: AgentId): CharacterRef {
  const registry = requireRegistry(town);
  if (typeof localAgentId !== "string" || !Object.hasOwn(registry.characters, localAgentId))
    throw new Error("That local character is not in this town.");
  const character = registry.characters[localAgentId];
  return {
    worldId: registry.worldId,
    characterId: character.characterId,
    archetypeId: character.archetypeId,
    originWorldId: character.originWorldId,
  };
}

export function agentByCharacterId(town: Town, characterId: string): Agent | undefined {
  const registry = requireRegistry(town);
  return town.agents.find((agent) => registry.characters[agent.id].characterId === characterId);
}

/** Local record counters are meaningful only inside this world and optional owner. */
export function townRecordRef(
  town: IdentityTown,
  kind: string,
  localId: string,
  optionalOwnerAgentId?: AgentId,
): TownRecordRef {
  const registry = requireRegistry(town);
  if (typeof kind !== "string" || !kind.trim() || typeof localId !== "string" || !localId.trim())
    throw new Error("A record reference requires its kind and local ID.");
  const owner =
    optionalOwnerAgentId === undefined ? undefined : characterRef(town, optionalOwnerAgentId);
  return {
    worldId: registry.worldId,
    kind,
    localId,
    ...(owner ? { ownerCharacterId: owner.characterId } : {}),
  };
}

/**
 * An explicit fork creates different individuals with the same local story.
 * Local role/record references stay world-scoped; a future multiworld importer
 * must remap them. This neither copies nor claims accounts, wallets or assets.
 */
export function forkTown(town: Town): Town {
  const source = requireRegistry(town);
  const copy = structuredClone(town);
  const fork = createTownIdentity(copy.agents.map((agent) => agent.id));
  fork.rootWorldId = source.rootWorldId;
  fork.parentWorldId = source.worldId;
  for (const agent of copy.agents) {
    fork.characters[agent.id].originWorldId = source.characters[agent.id].originWorldId;
    fork.characters[agent.id].forkedFromCharacterId = source.characters[agent.id].characterId;
  }
  if (
    !validateTownIdentity(
      fork,
      copy.agents.map((agent) => agent.id),
    )
  )
    throw new Error("Forked world identity is invalid.");
  copy.identityRegistry = fork;
  return copy;
}
