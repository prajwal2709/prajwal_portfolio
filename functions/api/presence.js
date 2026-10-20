const ACTIVE_WINDOW_SECONDS = 90;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function validVisitorId(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Stats database is not configured." }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Send a JSON body." }, 400);
  }

  const visitorId = body?.visitor_id;
  if (!validVisitorId(visitorId)) return json({ error: "Invalid visitor ID." }, 400);

  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - ACTIVE_WINDOW_SECONDS;
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO active_visitors (visitor_id, last_seen) VALUES (?, ?) " +
          "ON CONFLICT(visitor_id) DO UPDATE SET last_seen = excluded.last_seen",
      ).bind(visitorId, now),
      env.DB.prepare("DELETE FROM active_visitors WHERE last_seen < ?").bind(cutoff),
    ]);

    const [active, appreciations, appreciated] = await env.DB.batch([
      env.DB.prepare("SELECT COUNT(*) AS count FROM active_visitors WHERE last_seen >= ?").bind(cutoff),
      env.DB.prepare("SELECT COUNT(*) AS count FROM appreciations"),
      env.DB.prepare("SELECT 1 AS liked FROM appreciations WHERE visitor_id = ?").bind(visitorId),
    ]);

    return json({
      active_visitors: active.results[0].count,
      appreciations: appreciations.results[0].count,
      appreciated: appreciated.results.length > 0,
    });
  } catch {
    return json({ error: "Could not load portfolio stats." }, 503);
  }
}

export async function onRequest({ request }) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }
}
