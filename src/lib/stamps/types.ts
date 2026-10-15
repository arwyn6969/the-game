/** Read-only Bitcoin Stamp appearance tools. None of these records grant custody. */
export type StampScope = { worldId: string; characterId: string };
export type StampCrop = { x: number; y: number; size: number };
export type StampHolding = {
  cpid: string;
  stampNumber: number | null;
  quantity: string;
  supply: string | null;
  divisible: boolean;
  locked: boolean;
  title: string;
  mediaUrl: string | null;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | null;
};
export type StampHoldingsPage = {
  assets: StampHolding[];
  page: number;
  totalPages: number;
  total: number;
  unsupported: number;
  indexedBlock: number;
};
export type StampImage = { pngDataUrl: string; contentHash: string };
export type StampAppearance = StampImage &
  StampScope & {
    cpid: string;
    stampNumber: number | null;
    title: string;
    mode: "portrait" | "head";
    crop: StampCrop;
    verifiedAt: number;
    expiresAt: number;
  };
export type StampChallenge = {
  id: string;
  address: string;
  message: string;
  expiresAt: number;
};
export type StampIdentityView = {
  connected: boolean;
  address: string | null;
  proofExpiresAt: number | null;
  appearance: StampAppearance | null;
  holdings: StampHoldingsPage | null;
};
export type StampResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: "unavailable" | "expired" | "invalid" | "not-held" | "unsupported" | "rate-limited";
      message: string;
    };
