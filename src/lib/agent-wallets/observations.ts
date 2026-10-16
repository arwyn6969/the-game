export type ChainAnchor = { height: number; hash: string };
export type ObservationProtocol = "bitcoin" | "counterparty";
export type TransferObservation = {
  eventId: string;
  protocol: ObservationProtocol;
  txid: string;
  eventIndex: number;
  source: string | null;
  destination: string;
  asset: string;
  /** Integer satoshis for BTC; raw protocol base units for Counterparty. */
  quantity: string;
  block: ChainAnchor | null;
};
export type KnownObservation = TransferObservation & {
  state: "pending" | "confirmed" | "reorged" | "unknown";
  firstObservedAt: number;
  lastObservedAt: number;
  wasReorged: boolean;
};
export type ObservationScan = {
  protocol: ObservationProtocol;
  anchor: ChainAnchor;
  indexedHeight: number;
  historyComplete: boolean;
  mempoolComplete: boolean;
  events: TransferObservation[];
  /** Only positive canonical-block mismatch evidence may populate this list. */
  orphanedEventIds: string[];
};
export type ObservationSource = {
  protocol: ObservationProtocol;
  status: "not-checked" | "ready" | "partial" | "unavailable";
  observedAt: number | null;
  attemptedAt: number | null;
  anchor: ChainAnchor | null;
  indexedHeight: number | null;
  historyComplete: boolean;
  mempoolComplete: boolean;
};
export type WatchedAddress = { address: string; verifiedAt: number; current: boolean };
export type ReceivingObservations = {
  ownerRef: string;
  registrationId: string;
  profileId: string;
  revision: number;
  address: string | null;
  addresses: WatchedAddress[];
  addressPage: number;
  addressPages: number;
  sources: ObservationSource[];
  events: KnownObservation[];
  hasMoreEvents: boolean;
  fundingPublished: false;
};
