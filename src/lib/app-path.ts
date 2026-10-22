/** Build-time mount point; the Grok build remains at the origin root. */
export const APP_BASE_PATH = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export function appPath(path = "/"): string {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("App paths must be origin-relative");
  return `${APP_BASE_PATH}${path}`;
}
