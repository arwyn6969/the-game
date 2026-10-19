import { SqlAgentRegistryStore } from "./store.server";
import { SqlAgentObservationStore } from "./observation-store.server";
import { EsploraObservationReader } from "./esplora-observer.server";
import { observeCounterparty } from "./counterparty-observer.server";
import { AgentRegistryError } from "./service.server";
import { assertRealOwnerUser } from "./auth.server";
import type { ChainFetchOptions } from "./chain-http.server";
import type { ObservationScan, ReceivingObservations } from "./observations";

export type ObservationInput = {
  registrationId: string;
  profileId: string;
  revision: number;
  address?: string;
  addressPage?: number;
};
type Dependencies = {
  now?: () => number;
  reader?: (options: ChainFetchOptions) => EsploraObservationReader;
  counterparty?: typeof observeCounterparty;
  timeoutMs?: number;
};
const stale = () =>
  new AgentRegistryError(
    "stale",
    "This profile changed. Refresh owner status before checking observations.",
  );

/** Explicit private observation only; no payment instructions, balances or transaction builder. */
export class AgentReceivingObservationService {
  constructor(
    private readonly registry: Pick<SqlAgentRegistryStore, "getProfile">,
    private readonly observations: Pick<SqlAgentObservationStore, "load" | "claim" | "complete">,
    private readonly ownerId: string,
    private readonly dependencies: Dependencies = {},
  ) {
    assertRealOwnerUser(ownerId);
  }

  async load(input: ObservationInput): Promise<ReceivingObservations> {
    return this.observations.load(
      this.ownerId,
      input.registrationId,
      input.profileId,
      input.revision,
      input.address,
      input.addressPage ?? 1,
    );
  }
  async refresh(input: ObservationInput): Promise<ReceivingObservations> {
    const view = await this.load(input);
    if (!view.address)
      throw new AgentRegistryError(
        "invalid",
        "Verify an external address before observing incoming events.",
      );
    const now = this.dependencies.now ?? Date.now;
    const lease = await this.observations.claim(
      this.ownerId,
      input.registrationId,
      input.profileId,
      input.revision,
      view.address,
      now(),
    );
    if (!lease) {
      const current = await this.registry.getProfile(
        this.ownerId,
        input.registrationId,
        input.profileId,
      );
      if (!current || current.revision !== input.revision) throw stale();
      throw new AgentRegistryError(
        "rate-limited",
        "Wait 30 seconds before refreshing this address again.",
      );
    }
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const reader = this.dependencies.reader?.(options) ?? new EsploraObservationReader(options);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const results: { bitcoin: ObservationScan | null; counterparty: ObservationScan | null } = {
      bitcoin: null,
      counterparty: null,
    };
    const work = async () => {
      const anchor = await reader.tip();
      const [btc, cp] = await Promise.allSettled([
        reader.bitcoin(view.address!, lease.known, anchor),
        (this.dependencies.counterparty ?? observeCounterparty)(
          view.address!,
          lease.known,
          anchor,
          reader.canonicalHash,
          options,
        ),
      ]);
      await reader.assertAnchor(anchor);
      return {
        bitcoin: btc.status === "fulfilled" ? btc.value : null,
        counterparty: cp.status === "fulfilled" ? cp.value : null,
      };
    };
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          controller.abort();
          reject(new Error("Observation deadline exceeded."));
        },
        Math.min(this.dependencies.timeoutMs ?? 25_000, 25_000),
      );
    });
    try {
      Object.assign(results, await Promise.race([work(), deadline]));
    } catch {
      /* Unavailable or moving canonical evidence keeps previous observations. */
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
    if (
      !(await this.observations.complete(
        this.ownerId,
        input.registrationId,
        input.profileId,
        input.revision,
        view.address,
        lease.token,
        results,
        now(),
      ))
    )
      throw stale();
    return this.load({ ...input, address: view.address });
  }
}
