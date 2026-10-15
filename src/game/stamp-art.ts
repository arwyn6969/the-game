import type { StampAppearance } from "../lib/stamps/types";
import { isStampAppearance } from "../lib/stamps/validation";

const images = new Map<string, { source: string; image: HTMLImageElement; ready: boolean }>();

/** The renderer accepts bounded PNG data only; it never fetches asset URLs. */
export function stampArt(appearance: StampAppearance | null | undefined): HTMLImageElement | null {
  if (
    !isStampAppearance(appearance) ||
    appearance.expiresAt <= Date.now() ||
    typeof Image === "undefined"
  )
    return null;
  const key = appearance.contentHash;
  let entry = images.get(key);
  if (entry && entry.source !== appearance.pngDataUrl) return null;
  if (!entry) {
    const image = new Image();
    entry = { source: appearance.pngDataUrl, image, ready: false };
    const saved = entry;
    image.onload = () => {
      saved.ready = image.naturalWidth === 256 && image.naturalHeight === 256;
    };
    image.src = appearance.pngDataUrl;
    images.set(key, entry);
    if (images.size > 24) images.delete(images.keys().next().value!);
  }
  return entry.ready ? entry.image : null;
}
