// netlify/functions/submit-inspection.js

exports.handler = async (event) => {
  try {
    // Only allow POST
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error:
            "Missing env vars. Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        }),
      };
    }

    // Parse JSON body
    let data;
    try {
      data = event.body ? JSON.parse(event.body) : {};
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
    }

    // TEMP: insert whatever you send (we’ll adjust after we see your table requirements)
    const payload =
     const payload = data && Object.keys(data).length ? data : {};


    // IMPORTANT: table name here (we can change later if needed)
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
      json = text;
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
