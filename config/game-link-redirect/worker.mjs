/** Keep the game and its host-bound sign-in/storage on the existing www origin. */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const gamePath = url.pathname === "/thegame" || url.pathname.startsWith("/thegame/");
    if (url.host !== "arwyn.party") {
      return new Response(request.method === "HEAD" ? null : "Not Found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // The route ends in * to include bare-entry query strings. Leave other
    // matching prefixes with the homepage service that already owns them.
    if (!gamePath) return env.HOMEPAGE.fetch(request);

    // A navigation alias must never replay an auth/API form or request body.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" },
      });
    }

    const path = url.pathname === "/thegame" ? "/thegame/" : url.pathname;
    return new Response(null, {
      status: 307,
      headers: {
        Location: `https://www.arwyn.party${path}${url.search}`,
        "Cache-Control": "no-store",
      },
    });
  },
};
