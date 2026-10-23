import { randomBytes } from "node:crypto";
import { validateP2wpkhAddress, verifyStampProof } from "../stamps/proof.server";
import { listStampHoldings } from "../stamps/stampchain.server";
import { SqlAgentRegistryStore, AgentRegistryStoreError } from "./store.server";
import { assertRealOwnerUser } from "./auth.server";
import { ownerReference, receivingProofMessage } from "./proof.server";
import { AgentObservationStoreError } from "./observation-store.server";
import type {
  ReceivingInventory,
  ReceivingProfile,
  ReceivingProof,
  RegisteredWorldView,
  RegistryErrorCode,
  RegistryResult,
  WorldRegistrationInput,
} from "./types";

export class AgentRegistryError extends Error {
  constructor(
    readonly code: RegistryErrorCode,
    message: string,
  ) {
    super(message);
  }
}
const missing = () =>
  new AgentRegistryError("not-found", "That private registration is unavailable to this account.");
const stale = () =>
  new AgentRegistryError("stale", "This draft changed. Refresh it before trying again.");
const expired = () =>
  new AgentRegistryError("expired", "This address proof expired. Request a new proof.");
type Dependencies = {
  now?: () => number;
  verify?: typeof verifyStampProof;
  list?: typeof listStampHoldings;
};

/** Only a verified account from the HTTP boundary may construct this service. */
export class AgentRegistryService {
  private readonly now: () => number;
  private readonly verify: typeof verifyStampProof;
  private readonly list: typeof listStampHoldings;
  constructor(
    private readonly store: SqlAgentRegistryStore,
    private readonly ownerId: string,
    private readonly origin: string,
    dependencies: Dependencies = {},
  ) {
    assertRealOwnerUser(ownerId);
    this.now = dependencies.now ?? Date.now;
    this.verify = dependencies.verify ?? verifyStampProof;
    this.list = dependencies.list ?? listStampHoldings;
  }
  async find(sourceWorldId: string): Promise<RegisteredWorldView | null> {
    const world = await this.store.findWorld(this.ownerId, sourceWorldId);
    return world ? this.view(world.registrationId) : null;
  }
  async view(registrationId: string): Promise<RegisteredWorldView> {
    const result = await this.store.getWorld(this.ownerId, registrationId);
    if (!result) throw missing();
    return { ownerRef: ownerReference(this.ownerId), ...result };
  }
  async register(input: WorldRegistrationInput): Promise<RegisteredWorldView> {
    const world = await this.store.registerWorld(this.ownerId, input, this.now());
    // Public source IDs are provenance only. A changed imported roster must
    // never remap an existing private receiving profile to a different local.
    if (
      world.residents.length !== input.characters.length ||
      input.characters.some(
        (person) =>
          !world.residents.some(
            (resident) =>
              resident.role === person.role &&
              resident.sourceCharacterId === person.sourceCharacterId,
          ),
      )
    )
      throw new AgentRegistryError(
        "conflict",
        "This private copy was registered with different resident IDs. Restore its source or create an explicit town fork.",
      );
    return this.view(world.registrationId);
  }
  private async profile(registrationId: string, profileId: string): Promise<ReceivingProfile> {
    const profile = await this.store.getProfile(this.ownerId, registrationId, profileId);
    if (!profile) throw missing();
    return profile;
  }
  async begin(input: {
    registrationId: string;
    profileId: string;
    revision: number;
    address: string;
  }): Promise<ReceivingProof> {
    if (!validateP2wpkhAddress(input.address))
      throw new AgentRegistryError("invalid", "Choose a Bitcoin mainnet Native SegWit address.");
    const profile = await this.profile(input.registrationId, input.profileId);
    if (profile.revision !== input.revision) throw stale();
    const now = this.now();
    const draft = {
      id: randomBytes(24).toString("hex"),
      registrationId: input.registrationId,
      residentId: profile.residentId,
      profileId: profile.profileId,
      revision: profile.revision,
      address: input.address,
      expiresAt: now + 5 * 60_000,
    };
    const proof = { ...draft, message: receivingProofMessage(this.ownerId, this.origin, draft) };
    if (!(await this.store.issueProof(this.ownerId, proof, now)))
      throw new AgentRegistryError(
        "rate-limited",
        "Wait a few seconds, then refresh this draft before requesting another proof.",
      );
    return proof;
  }
  async finish(input: {
    registrationId: string;
    profileId: string;
    challengeId: string;
    address: string;
    message: string;
    signature: string;
  }): Promise<ReceivingProfile> {
    const proof = await this.store.consumeProof(
      this.ownerId,
      input.registrationId,
      input.profileId,
      input.challengeId,
      this.now(),
    );
    if (!proof) throw expired();
    if (
      proof.message !== receivingProofMessage(this.ownerId, this.origin, proof) ||
      input.address !== proof.address ||
      input.message !== proof.message ||
      !this.verify(proof.address, proof.message, input.signature)
    )
      throw new AgentRegistryError(
        "invalid",
        "That signature did not match this receiving draft. Request a new proof.",
      );
    const provedAt = this.now();
    if (proof.expiresAt <= provedAt) throw expired();
    const confirmed = await this.store.confirmProof(
      this.ownerId,
      input.registrationId,
      input.profileId,
      proof.id,
      provedAt,
    );
    if (!confirmed)
      throw new AgentRegistryError(
        "conflict",
        "This address is reserved or the draft changed. Refresh and choose a distinct Leather account for each resident.",
      );
    return confirmed;
  }
  async retire(input: {
    registrationId: string;
    profileId: string;
    revision: number;
  }): Promise<null> {
    if (
      !(await this.store.retireProfile(
        this.ownerId,
        input.registrationId,
        input.profileId,
        input.revision,
        this.now(),
      ))
    )
      throw stale();
    return null;
  }
  async inventory(input: {
    registrationId: string;
    profileId: string;
    page?: number;
  }): Promise<ReceivingInventory> {
    const before = await this.profile(input.registrationId, input.profileId);
    if (before.state !== "draft" || !before.address)
      throw new AgentRegistryError(
        "invalid",
        "Verify an external address before checking its stamp inventory.",
      );
    const holdings = await this.list(before.address, input.page ?? 1);
    const current = await this.profile(input.registrationId, input.profileId);
    if (
      current.revision !== before.revision ||
      current.address !== before.address ||
      current.state !== "draft"
    )
      throw stale();
    return {
      profileId: before.profileId,
      revision: before.revision,
      address: before.address,
      observedAt: this.now(),
      holdings,
      btc: "not-checked",
    };
  }
}

export async function registryResult<T>(run: () => Promise<T>): Promise<RegistryResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    if (error instanceof AgentRegistryError)
      return { ok: false, error: error.code, message: error.message };
    if (error instanceof AgentObservationStoreError)
      return {
        ok: false,
        error: error.code,
        message:
          error.code === "stale"
            ? "This private profile changed. Refresh owner status."
            : error.code === "rate-limited"
              ? "Wait before refreshing this address again."
              : "These private observations could not be loaded. Refresh the profile and try again.",
      };
    if (error instanceof AgentRegistryStoreError)
      return {
        ok: false,
        error: error.code,
        message:
          error.code === "limit"
            ? "This account has reached the private-copy limit."
            : "This registration or address conflicts with an existing draft. Refresh before trying again.",
      };
    if (error instanceof Error && error.name === "OwnerAuthenticationError")
      return {
        ok: false,
        error: "unauthenticated",
        message: "Sign in to your game account before managing agent wallets.",
      };
    // Unexpected hosted failures need a trace without logging provider errors,
    // wallet addresses, session tokens or database connection strings.
    if (process.env.GAME_HOSTING_TARGET === "cloudflare" && error instanceof Error)
      console.error("[agent-registry] unexpected failure", {
        name: error.name,
        frames: error.stack
          ?.split("\n")
          .filter((line) => /^\s+at /.test(line))
          .slice(0, 5),
      });
    return {
      ok: false,
      error: "unavailable",
      message: "Agent wallets are unavailable right now. Your local town is still available.",
    };
  }
}
