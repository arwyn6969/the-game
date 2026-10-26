interface ImagesBinding {
  info(stream: ReadableStream<Uint8Array>): Promise<{
    format: string;
    width?: number;
    height?: number;
  }>;
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: { width: number; height: number; fit: "pad"; background: string }): {
      output(options: { format: "image/png"; anim: false }): Promise<{ response(): Response }>;
    };
  };
}

/** Keep native image decoding outside the Worker; accept only bounded raster pixels. */
export async function cloudflareStampPng(bytes: Uint8Array, mime: string): Promise<Buffer> {
  const binding = (globalThis as typeof globalThis & { __env__?: { IMAGES?: ImagesBinding } })
    .__env__?.IMAGES;
  if (!binding) throw new Error("The hosted image binding is unavailable");
  const stream = () =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  const info = await binding.info(stream());
  const format = info.format.replace(/^image\//, "").replace(/^jpg$/, "jpeg");
  if (
    `image/${format}` !== mime ||
    !Number.isSafeInteger(info.width) ||
    !Number.isSafeInteger(info.height) ||
    !info.width ||
    !info.height ||
    info.width < 1 ||
    info.height < 1 ||
    info.width > 2048 ||
    info.height > 2048 ||
    info.width * info.height > 4_000_000
  )
    throw new Error("Unsupported stamp artwork dimensions");
  const result = await binding
    .input(stream())
    .transform({ width: 256, height: 256, fit: "pad", background: "transparent" })
    .output({ format: "image/png", anim: false });
  const response = result.response();
  if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "image/png")
    throw new Error("Unsupported transformed stamp artwork");
  const png = Buffer.from(await response.arrayBuffer());
  if (
    png.length < 24 ||
    png.length > 512 * 1024 ||
    !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    png.toString("ascii", 12, 16) !== "IHDR" ||
    png.readUInt32BE(16) !== 256 ||
    png.readUInt32BE(20) !== 256
  )
    throw new Error("Unsupported transformed stamp artwork");
  return png;
}
