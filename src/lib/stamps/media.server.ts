import { createHash } from "node:crypto";
import { approvedStampMedia, boundedStampFetch } from "./stampchain.server";
import type { StampFetchOptions } from "./stampchain.server";
import type { StampHolding, StampImage } from "./types";

const MAX_CACHE_ENTRIES = 64;
const MAX_INPUT_PIXELS = 4_000_000;
const MAX_INPUT_SIDE = 2048;
const MAX_IN_FLIGHT = 8;
const images = new Map<string, Readonly<StampImage>>();
const pending = new Map<string, Promise<StampImage>>();

function imageMagic(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/png")
    return (
      bytes.length >= 8 &&
      Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  if (mime === "image/jpeg")
    return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" &&
    Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP"
  );
}

async function decodeImage(asset: StampHolding, options: StampFetchOptions): Promise<StampImage> {
  const approved = approvedStampMedia(asset.mediaUrl, asset.mediaType);
  if (!approved) throw new Error("This stamp does not have supported raster artwork.");
  const { bytes, mime } = await boundedStampFetch(approved.url, [approved.mime], options);
  if (!imageMagic(bytes, mime))
    throw new Error("The stamp artwork does not match its raster file type.");
  try {
    if (process.env.GAME_HOSTING_TARGET === "cloudflare") {
      const { cloudflareStampPng } = await import("./cloudflare-image.server");
      const png = await cloudflareStampPng(bytes, mime);
      return {
        pngDataUrl: `data:image/png;base64,${png.toString("base64")}`,
        contentHash: createHash("sha256").update(png).digest("hex"),
      };
    }
    const { default: sharp } = await import("sharp");
    const decoder = sharp(bytes, {
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: false,
      page: 0,
      pages: 1,
      failOn: "warning",
      sequentialRead: true,
    });
    const metadata = await decoder.metadata();
    const expected = mime === "image/jpeg" ? "jpeg" : mime === "image/webp" ? "webp" : "png";
    if (
      metadata.format !== expected ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > MAX_INPUT_SIDE ||
      metadata.height > MAX_INPUT_SIDE ||
      metadata.width * metadata.height > MAX_INPUT_PIXELS
    )
      throw new Error("Unsupported stamp artwork dimensions.");
    // Sharp discards source metadata by default. Only newly encoded PNG pixels leave this boundary.
    const png = await decoder
      .rotate()
      .resize({
        width: 256,
        height: 256,
        fit: "contain",
        kernel: sharp.kernel.nearest,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return {
      pngDataUrl: `data:image/png;base64,${png.toString("base64")}`,
      contentHash: createHash("sha256").update(png).digest("hex"),
    };
  } catch {
    throw new Error("The stamp artwork could not be decoded within the supported image limits.");
  }
}

/** The process cache contains sanitized public pixels only, never wallets or proofs. */
export async function loadStampImage(
  asset: StampHolding,
  options: StampFetchOptions = {},
): Promise<StampImage> {
  const approved = approvedStampMedia(asset.mediaUrl, asset.mediaType);
  if (!approved) throw new Error("This stamp does not have supported raster artwork.");
  const key = `${approved.url}\n${approved.mime}`;
  const cached = images.get(key);
  if (cached) {
    images.delete(key);
    images.set(key, cached);
    return { ...cached };
  }
  const existing = pending.get(key);
  if (existing) return { ...(await existing) };
  if (pending.size >= MAX_IN_FLIGHT)
    throw new Error("Stamp artwork is busy. Please try again shortly.");
  const work = decodeImage(asset, options);
  pending.set(key, work);
  try {
    const image = await work;
    images.set(key, Object.freeze({ ...image }));
    while (images.size > MAX_CACHE_ENTRIES) images.delete(images.keys().next().value!);
    return { ...image };
  } finally {
    pending.delete(key);
  }
}
