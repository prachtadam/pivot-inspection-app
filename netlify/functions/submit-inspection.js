// netlify/functions/submit-test.js

exports.handler = async (event) => {
  try {
    // Only allow POST
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY; // fallback

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error:
            "Missing env vars. Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY fallback).",
        }),
      };
    }

    // Parse body safely
    let data;
    try {
      data = event.body ? JSON.parse(event.body) : {};
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
    }

    // Example insert payload (you can change to match your table columns)
    // If you're already sending the full inspection object, you can just use `data`.
    const payload = data && Object.keys(data).length ? data : { test: true, created_at: new Date().toISOString() };

    const url = `${SUPABASE_URL}/rest/v1/inspections`;

    const insertRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });

    const text = await insertRes.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text; // sometimes Supabase returns empty or non-JSON
    }

    if (!insertRes.ok) {
      return {
        statusCode: insertRes.status,
        body: JSON.stringify({
          error: "Supabase insert failed",
          status: insertRes.status,
          details: json,
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, inserted: json }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err?.message || String(err),
        stack: err?.stack || null,
      }),
    };
  }
};
