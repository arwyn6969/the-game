export const SKINS = [
  {
    id: "plaza-cream",
    name: "Plaza Cream",
    description: "Floating conversation windows · a clear action dock",
    motif: "bubble",
  },
  {
    id: "hobbs-hearth",
    name: "Hobbs Hearth",
    description: "A resident sidebar · generous central windows",
    motif: "rail",
  },
  {
    id: "library-ink",
    name: "Library Ink",
    description: "A tool sidebar · a spacious reading desk",
    motif: "desk",
  },
  {
    id: "original",
    name: "Original",
    description: "The existing interface for comparison",
    motif: "original",
  },
] as const;

export type SkinId = (typeof SKINS)[number]["id"];
export const APPEARANCE_KEY = "the-game-ui-appearance-v1";

export function isSkin(value: unknown): value is SkinId {
  return SKINS.some((skin) => skin.id === value);
}

export function initialAppearance(): { preview: boolean; skin: SkinId } {
  if (typeof window === "undefined") return { preview: false, skin: "original" };
  const query = new URLSearchParams(window.location.search);
  if (query.get("uiPreview") !== "1") return { preview: false, skin: "original" };
  const requested = query.get("skin");
  if (isSkin(requested)) return { preview: true, skin: requested };
  try {
    const stored: unknown = localStorage.getItem(APPEARANCE_KEY);
    if (isSkin(stored)) return { preview: true, skin: stored };
  } catch {
    // Appearance preferences are optional, including when storage is denied.
  }
  return { preview: true, skin: "plaza-cream" };
}
