import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

const visitorId = "00000000-0000-4000-8000-000000000001";

function createDb({ failBatch = false, failRun = false } = {}) {
  return {
    prepare(sql) {
      return {
        sql,
        bind(...args) {
          return {
            sql,
            args,
            async run() {
              if (failRun) throw new Error("simulated D1 write error");
              return { success: true };
            },
          };
        },
      };
    },
    async batch(statements) {
      if (failBatch) throw new Error("simulated D1 batch error");
      if (statements[0]?.sql.startsWith("INSERT INTO active_visitors")) return [];
      return [
        { results: [{ count: 2 }] },
        { results: [{ count: 4 }] },
        { results: [] },
      ];
    },
  };
}

function createEnv(options = {}) {
  const fetched = [];
  return {
    fetched,
    env: {
      ...(options.withoutDb ? {} : { DB: createDb(options) }),
      ASSETS: {
        async fetch(request) {
          fetched.push(new URL(request.url).pathname);
          return new Response(`asset:${new URL(request.url).pathname}`);
        },
      },
    },
  };
}

const allowedOrigins = [
  "https://prajwal2709.github.io",
  "https://prajwal-portfolio.pd613868.workers.dev",
];

function post(path, body, origin) {
  const headers = { "Content-Type": "application/json" };
  if (origin) headers.Origin = origin;
  return new Request(`https://portfolio.test${path}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function preflight(path, origin, method = "POST", requestedHeaders = "content-type") {
  return new Request(`https://portfolio.test${path}`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": method,
      "Access-Control-Request-Headers": requestedHeaders,
    },
  });
}

function assertCors(response, origin) {
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  assert.equal(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  assert.equal(response.headers.get("Access-Control-Allow-Headers"), "Content-Type");
  assert.match(response.headers.get("Vary") || "", /(?:^|,\s*)Origin(?:,|$)/i);
}

test("presence and appreciation return their D1-backed results", async () => {
  const { env } = createEnv();
  const presence = await worker.fetch(post("/api/presence", { visitor_id: visitorId }, allowedOrigins[1]), env);
  const appreciation = await worker.fetch(
    post("/api/appreciation", { visitor_id: visitorId, appreciated: true }, allowedOrigins[0]),
    env,
  );

  assert.equal(presence.status, 200);
  assertCors(presence, allowedOrigins[1]);
  assert.deepEqual(await presence.json(), {
    active_visitors: 2,
    appreciations: 4,
    appreciated: false,
  });
  assert.equal(appreciation.status, 200);
  assertCors(appreciation, allowedOrigins[0]);
  assert.deepEqual(await appreciation.json(), {
    active_visitors: 2,
    appreciations: 4,
    appreciated: false,
  });
});

test("CORS preflight accepts both explicitly allowed site origins", async () => {
  for (const origin of allowedOrigins) {
    const { env } = createEnv();
    const response = await worker.fetch(preflight("/api/presence", origin), env);
    assert.equal(response.status, 204);
    assertCors(response, origin);
    assert.equal(await response.text(), "");
  }
});

test("preflight rejects disallowed origins and unsupported requested methods", async () => {
  const { env } = createEnv();
  const disallowed = await worker.fetch(preflight("/api/presence", "https://example.com"), env);
  assert.equal(disallowed.status, 403);
  assert.equal(disallowed.headers.get("Access-Control-Allow-Origin"), null);
  assert.match(disallowed.headers.get("Vary") || "", /Origin/i);

  const unsupported = await worker.fetch(preflight("/api/presence", allowedOrigins[0], "PUT"), env);
  assert.equal(unsupported.status, 405);
  assertCors(unsupported, allowedOrigins[0]);
});

test("requests from disallowed origins are rejected without wildcard CORS", async () => {
  const { env, fetched } = createEnv();
  const response = await worker.fetch(
    post("/api/presence", { visitor_id: visitorId }, "https://example.com"),
    env,
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Origin not allowed." });
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.notEqual(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.deepEqual(fetched, []);
});

test("unsupported methods on API endpoints return 405 without reading assets", async () => {
  const { env, fetched } = createEnv();
  const get = await worker.fetch(new Request("https://portfolio.test/api/presence", { headers: { Origin: allowedOrigins[1] } }), env);
  const put = await worker.fetch(new Request("https://portfolio.test/api/appreciation", { method: "PUT", headers: { Origin: allowedOrigins[1] } }), env);

  assert.equal(get.status, 405);
  assert.equal(put.status, 405);
  assertCors(get, allowedOrigins[1]);
  assertCors(put, allowedOrigins[1]);
  assert.deepEqual(fetched, []);
});

test("invalid JSON or payload returns 400", async () => {
  const { env } = createEnv();
  const malformed = await worker.fetch(post("/api/presence", "{", allowedOrigins[0]), env);
  const invalid = await worker.fetch(post("/api/appreciation", { visitor_id: "bad", appreciated: "yes" }, allowedOrigins[1]), env);

  assert.equal(malformed.status, 400);
  assertCors(malformed, allowedOrigins[0]);
  assert.equal(invalid.status, 400);
  assertCors(invalid, allowedOrigins[1]);
});

test("known API routes report a missing D1 binding instead of falling through", async () => {
  const { env, fetched } = createEnv({ withoutDb: true });
  const presence = await worker.fetch(post("/api/presence", { visitor_id: visitorId }, allowedOrigins[0]), env);
  const appreciation = await worker.fetch(
    post("/api/appreciation", { visitor_id: visitorId, appreciated: true }, allowedOrigins[1]),
    env,
  );

  assert.equal(presence.status, 503);
  assert.equal(appreciation.status, 503);
  assertCors(presence, allowedOrigins[0]);
  assertCors(appreciation, allowedOrigins[1]);
  assert.deepEqual(fetched, []);
});

test("D1 failures become 503 responses without leaking database errors", async () => {
  const presenceEnv = createEnv({ failBatch: true }).env;
  const appreciationEnv = createEnv({ failRun: true }).env;
  const presence = await worker.fetch(post("/api/presence", { visitor_id: visitorId }, allowedOrigins[0]), presenceEnv);
  const appreciation = await worker.fetch(
    post("/api/appreciation", { visitor_id: visitorId, appreciated: true }, allowedOrigins[1]),
    appreciationEnv,
  );

  assert.equal(presence.status, 503);
  assertCors(presence, allowedOrigins[0]);
  assert.deepEqual(await presence.json(), { error: "Could not load portfolio stats." });
  assert.equal(appreciation.status, 503);
  assertCors(appreciation, allowedOrigins[1]);
  assert.deepEqual(await appreciation.json(), { error: "Could not save your appreciation." });
});

test("unknown API paths do not fall through to assets; normal paths do", async () => {
  const { env, fetched } = createEnv();
  const unknownApi = await worker.fetch(new Request("https://portfolio.test/api/unknown"), env);
  const apiRoot = await worker.fetch(new Request("https://portfolio.test/api"), env);
  const home = await worker.fetch(new Request("https://portfolio.test/"), env);

  assert.equal(unknownApi.status, 404);
  assert.equal(apiRoot.status, 404);
  assert.deepEqual(fetched, ["/"]);
  assert.equal(await home.text(), "asset:/");
});

test("favicon.ico is served from the SVG favicon asset", async () => {
  const { env, fetched } = createEnv();
  const response = await worker.fetch(new Request("https://portfolio.test/favicon.ico"), env);

  assert.equal(response.status, 200);
  assert.deepEqual(fetched, ["/favicon.svg"]);
  assert.equal(await response.text(), "asset:/favicon.svg");
});
