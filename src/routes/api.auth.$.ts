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
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  let forwarded = request;
  if (
    request.method === "POST" &&
    ["/api/auth/oauth2/link", "/api/auth/link-social"].includes(path)
  ) {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
    if (!session?.user)
      return Response.json(
        { code: "UNAUTHORIZED", message: "Sign in before linking an account." },
        { status: 401, headers: { "cache-control": "private, no-store" } },
      );
    // The generic linker uses its ordinary session middleware. Remove only its
    // short-lived cache so it binds state to the same live cookie/bearer owner.
    const cacheName = (await auth.$context).authCookies.sessionData.name;
    const headers = new Headers(request.headers);
    const cookies = (headers.get("cookie") ?? "")
      .split(";")
      .filter((pair) => {
        const name = pair.trim().split("=", 1)[0];
        return (
          name !== cacheName &&
          !(name.startsWith(`${cacheName}.`) && /^\d+$/.test(name.slice(cacheName.length + 1)))
        );
      })
      .filter((pair) => pair.trim())
      .join(";");
    if (cookies) headers.set("cookie", cookies);
    else headers.delete("cookie");
    forwarded = new Request(request, { headers });
  }
  return auth.handler(forwarded);
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
