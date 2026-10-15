import { randomBytes, createHash } from "node:crypto";
import { buildStampChallenge, validateP2wpkhAddress, verifyStampProof } from "./proof.server";
import { listStampHoldings, findStampHolding } from "./stampchain.server";
import { loadStampImage } from "./media.server";
import { SqlStampStore } from "./store.server";
import { isStampAppearance } from "./validation";
import type {
  StampAppearance,
  StampChallenge,
  StampCrop,
  StampIdentityView,
  StampResult,
  StampScope,
} from "./types";

export const STAMP_PROOF_MS = 15 * 60_000;
export const STAMP_APPEARANCE_MS = 2 * 60_000;

export class StampIdentityError extends Error {
  constructor(
    readonly code: Exclude<StampResult<never>, { ok: true }>["error"],
    message: string,
  ) {
    super(message);
  }
}
const expired = () =>
  new StampIdentityError("expired", "Connect your wallet again to refresh its proof.");
const unavailable = () =>
  new StampIdentityError(
    "unavailable",
    "Stamp identities are unavailable right now. Your town is still available.",
  );
const disconnected = (): StampIdentityView => ({
  connected: false,
  address: null,
  proofExpiresAt: null,
  appearance: null,
  holdings: null,
});

export function stampSessionHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type Dependencies = {
  now?: () => number;
  list?: typeof listStampHoldings;
  find?: typeof findStampHolding;
  image?: typeof loadStampImage;
  verify?: typeof verifyStampProof;
};

/** A private, read-only wallet proof session. It never registers game ownership. */
export class StampIdentityService {
  private readonly now: () => number;
  private readonly list: typeof listStampHoldings;
  private readonly find: typeof findStampHolding;
  private readonly image: typeof loadStampImage;
  private readonly verify: typeof verifyStampProof;
  constructor(
    private readonly store: SqlStampStore,
    private readonly sessionHash: string,
    private readonly origin: string,
    dependencies: Dependencies = {},
  ) {
    this.now = dependencies.now ?? Date.now;
    this.list = dependencies.list ?? listStampHoldings;
    this.find = dependencies.find ?? findStampHolding;
    this.image = dependencies.image ?? loadStampImage;
    this.verify = dependencies.verify ?? verifyStampProof;
  }
  async begin(scope: StampScope, address: string): Promise<StampChallenge> {
    if (!validateP2wpkhAddress(address))
      throw new StampIdentityError(
        "unsupported",
        "This connection supports a mainnet Native SegWit address from Leather.",
      );
    const now = this.now();
    const challenge = buildStampChallenge({
      id: randomBytes(24).toString("hex"),
      address,
      scope,
      origin: this.origin,
      expiresAt: now + 5 * 60_000,
    });
    await this.store.cleanup(now, 100);
    if (!(await this.store.issue(this.sessionHash, scope, challenge, now)))
      throw new StampIdentityError(
        "rate-limited",
        "Please wait a few seconds before requesting another wallet proof.",
      );
    return challenge;
  }
  async finish(input: {
    scope: StampScope;
    challengeId: string;
    address: string;
    message: string;
    signature: string;
  }): Promise<StampIdentityView> {
    const now = this.now();
    const challenge = await this.store.consume(
      this.sessionHash,
      input.scope,
      input.challengeId,
      now,
    );
    if (!challenge) throw expired();
    if (
      challenge.address !== input.address ||
      challenge.message !== input.message ||
      !this.verify(challenge.address, challenge.message, input.signature)
    )
      throw new StampIdentityError(
        "invalid",
        "That signature did not match this wallet proof. Request a new proof to try again.",
      );
    const provedAt = this.now();
    if (challenge.expiresAt <= provedAt) throw expired();
    if (
      !(await this.store.prove(
        this.sessionHash,
        input.scope,
        challenge.id,
        challenge.address,
        provedAt + STAMP_PROOF_MS,
        provedAt,
      ))
    )
      throw expired();
    return this.view(input.scope, 1);
  }
  private async linked(scope: StampScope) {
    const row = await this.store.get(this.sessionHash, scope, this.now());
    if (!row?.address || !row.proofExpiresAt || row.proofExpiresAt <= this.now()) throw expired();
    return row as typeof row & { address: string; proofExpiresAt: number };
  }
  async view(scope: StampScope, page = 1): Promise<StampIdentityView> {
    const row = await this.store.get(this.sessionHash, scope, this.now());
    if (!row?.address || !row.proofExpiresAt || row.proofExpiresAt <= this.now())
      return disconnected();
    const holdings = await this.list(row.address, page);
    let appearance: StampAppearance | null = null;
    if (row.appearance && isStampAppearance(row.appearance)) {
      const asset =
        holdings.assets.find((asset) => asset.cpid === row.appearance!.cpid) ??
        (await this.find(row.address, row.appearance.cpid));
      if (asset)
        appearance = {
          ...row.appearance,
          verifiedAt: this.now(),
          expiresAt: Math.min(row.proofExpiresAt, this.now() + STAMP_APPEARANCE_MS),
        };
      // A historical choice is retained privately, but is not displayed as a
      // current holding. A stale observation must not clear a newer choice.
    }
    // A disconnect/new proof during a remote read cannot revive the old state.
    const current = await this.store.get(this.sessionHash, scope, this.now());
    if (
      current?.address !== row.address ||
      current.proofExpiresAt !== row.proofExpiresAt ||
      current.proofExpiresAt <= this.now() ||
      current.appearanceRevision !== row.appearanceRevision ||
      JSON.stringify(current.appearance) !== JSON.stringify(row.appearance)
    )
      return disconnected();
    return {
      connected: true,
      address: row.address,
      proofExpiresAt: row.proofExpiresAt,
      appearance,
      holdings,
    };
  }
  async preview(scope: StampScope, cpid: string) {
    const row = await this.linked(scope);
    const asset = await this.find(row.address, cpid);
    if (!asset)
      throw new StampIdentityError("not-held", "That stamp is no longer available in this wallet.");
    const image = await this.image(asset);
    const current = await this.linked(scope);
    if (current.address !== row.address || current.proofExpiresAt !== row.proofExpiresAt)
      throw expired();
    return image;
  }
  async choose(
    scope: StampScope,
    cpid: string,
    mode: "portrait" | "head",
    crop: StampCrop,
  ): Promise<StampAppearance> {
    const row = await this.linked(scope);
    const asset = await this.find(row.address, cpid);
    if (!asset)
      throw new StampIdentityError("not-held", "That stamp is no longer available in this wallet.");
    const image = await this.image(asset);
    const now = this.now();
    if (row.proofExpiresAt <= now) throw expired();
    const appearance: StampAppearance = {
      ...image,
      ...scope,
      cpid: asset.cpid,
      stampNumber: asset.stampNumber,
      title: asset.title,
      mode,
      crop,
      verifiedAt: now,
      expiresAt: Math.min(row.proofExpiresAt, now + STAMP_APPEARANCE_MS),
    };
    if (!isStampAppearance(appearance))
      throw new StampIdentityError("unsupported", "That stamp could not be prepared for display.");
    if (
      !(await this.store.setAppearance(
        this.sessionHash,
        scope,
        row.address,
        appearance,
        now,
        row.proofExpiresAt,
        row.appearanceRevision,
      ))
    )
      throw expired();
    return appearance;
  }
  async clearAppearance(scope: StampScope) {
    await this.store.clearAppearance(this.sessionHash, scope, this.now());
    return null;
  }
  async disconnect(scope: StampScope) {
    await this.store.clear(this.sessionHash, scope);
    return null;
  }
}

export async function stampResult<T>(run: () => Promise<T>): Promise<StampResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    const failure = error instanceof StampIdentityError ? error : unavailable();
    return { ok: false, error: failure.code, message: failure.message };
  }
}
