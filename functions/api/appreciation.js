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
  if (!validVisitorId(visitorId) || typeof body?.appreciated !== "boolean") {
    return json({ error: "Send a valid visitor ID and appreciated state." }, 400);
  }

  try {
    const update = body.appreciated
      ? env.DB.prepare(
          "INSERT OR IGNORE INTO appreciations (visitor_id, created_at) VALUES (?, ?)",
        ).bind(visitorId, Math.floor(Date.now() / 1000))
      : env.DB.prepare("DELETE FROM appreciations WHERE visitor_id = ?").bind(visitorId);

    await update.run();
    const cutoff = Math.floor(Date.now() / 1000) - 90;
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
    return json({ error: "Could not save your appreciation." }, 503);
  }
}

export async function onRequest({ request }) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }
}
