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
    description: "The classic town interface",
    motif: "original",
  },
] as const;

export type SkinId = (typeof SKINS)[number]["id"];
export const DEFAULT_SKIN: SkinId = "hobbs-hearth";
export const APPEARANCE_KEY = "the-game-ui-appearance-v1";

export function isSkin(value: unknown): value is SkinId {
  return SKINS.some((skin) => skin.id === value);
}

export function initialAppearance(): { skin: SkinId } {
  if (typeof window === "undefined") return { skin: DEFAULT_SKIN };
  const query = new URLSearchParams(window.location.search);
  const requested = query.get("skin");
  if (isSkin(requested)) return { skin: requested };
  try {
    const stored: unknown = localStorage.getItem(APPEARANCE_KEY);
    if (isSkin(stored)) return { skin: stored };
  } catch {
    // Appearance preferences are optional, including when storage is denied.
  }
  return { skin: DEFAULT_SKIN };
}
