import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request): Promise<Response> {
  const { assertSameSiteRequest, CrossSiteRequestError } =
    await import("../lib/auth/isolation.server");
  try {
    assertSameSiteRequest();
  } catch (error) {
    if (error instanceof CrossSiteRequestError) return new Response("Forbidden", { status: 403 });
    throw error;
  }
  const { auth } = await import("../lib/auth/server");
  return auth.handler(request);
}

/** Same-origin Better Auth endpoint, including top-level OAuth GET callbacks. */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => handle(request),
      POST: ({ request }: { request: Request }) => handle(request),
    },
  },
});
