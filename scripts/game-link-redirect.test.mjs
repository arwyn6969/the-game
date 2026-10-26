import assert from "node:assert/strict";
import test from "node:test";
import worker from "../config/game-link-redirect/worker.mjs";

test("apex game entry and descendants redirect to the fixed www origin", async () => {
  for (const path of ["/thegame", "/thegame/", "/thegame/privacy", "/thegame/assets/a.js"]) {
    const response = await worker.fetch(new Request(`https://arwyn.party${path}`));
    assert.equal(response.status, 307);
    assert.equal(
      response.headers.get("location"),
      `https://www.arwyn.party${path === "/thegame" ? "/thegame/" : path}`,
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(await response.text(), "");
  }
});

test("query strings and encoded descendant paths survive without accepting an external target", async () => {
  const path = "/thegame/a%20b?return=https%3A%2F%2Fevil.example%2F&x=1&x=2&blank=";
  const response = await worker.fetch(new Request(`https://arwyn.party${path}`));
  assert.equal(response.headers.get("location"), `https://www.arwyn.party${path}`);
  assert.equal(new URL(response.headers.get("location")).origin, "https://www.arwyn.party");
});

test("bare game URLs canonicalize the trailing slash before preserving their query", async () => {
  const response = await worker.fetch(
    new Request("https://arwyn.party/thegame?routing=20261026&next=%2Fthegame%2F"),
  );
  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://www.arwyn.party/thegame/?routing=20261026&next=%2Fthegame%2F",
  );
});

test("HTTP and HEAD navigation use the HTTPS www destination with no response body", async () => {
  const response = await worker.fetch(
    new Request("http://arwyn.party/thegame/?routing=20261026", { method: "HEAD" }),
  );
  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://www.arwyn.party/thegame/?routing=20261026",
  );
  assert.equal(await response.text(), "");
});

test("lookalike hosts and canonical www requests cannot enter a redirect loop", async () => {
  for (const url of [
    "https://arwyn.party.evil.example/thegame/",
    "https://evil.example/thegame/",
    "https://arwyn.party:8443/thegame/",
    "https://www.arwyn.party/thegame/",
  ]) {
    const response = await worker.fetch(new Request(url));
    assert.equal(response.status, 404, url);
    assert.equal(response.headers.get("location"), null, url);
  }
});

test("other apex paths forward the original request once and preserve the homepage response", async () => {
  for (const path of [
    "/",
    "/bitcoinart",
    "/thegame-other?x=1",
    "/thegame%2Fprivacy",
    "/thegame/../bitcoinart",
  ]) {
    const request = new Request(`https://arwyn.party${path}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "X-Original": "kept" },
      body: "original body",
    });
    const upstream = new Response("homepage result", {
      status: 418,
      headers: { "X-Homepage": "retained", "Set-Cookie": "existing=retained; Path=/" },
    });
    let calls = 0;
    const response = await worker.fetch(request, {
      HOMEPAGE: {
        async fetch(forwarded) {
          calls += 1;
          assert.equal(forwarded, request);
          assert.equal(forwarded.headers.get("x-original"), "kept");
          assert.equal(await forwarded.text(), "original body");
          return upstream;
        },
      },
    });
    assert.equal(calls, 1);
    assert.equal(response, upstream);
    assert.equal(response.status, 418);
    assert.equal(response.headers.get("x-homepage"), "retained");
    assert.equal(response.headers.get("set-cookie"), "existing=retained; Path=/");
    assert.equal(await response.text(), "homepage result");
  }
});

test("non-navigation methods never redirect or replay an auth/API payload", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const request = new Request("https://arwyn.party/thegame/api/auth/sign-in", {
      method,
      body: method === "OPTIONS" ? undefined : "private=form",
    });
    const response = await worker.fetch(request);
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get("location"), null, method);
    assert.equal(response.headers.get("allow"), "GET, HEAD", method);
    assert.equal(request.bodyUsed, false, method);
  }
});
