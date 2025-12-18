// netlify/functions/submit-inspection.js

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY; // fallback if you used SUPABASE_KEY

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return {
        statusCode: 500,
        body: "Missing SUPABASE env vars (need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)",
      };
    }

    const req = JSON.parse(event.body || "{}");

    const customer_name = String(req.customer_name || "").trim();
    const location = String(req.location || "").trim();
    const performed_by = String(req.performed_by || "").trim();

    const duration_minutes = Number.isFinite(Number(req.duration_minutes))
      ? parseInt(req.duration_minutes, 10)
      : 0;

    const customer_report_html = String(req.customer_report_html || "");
    const tech_report_html = String(req.tech_report_html || "");

    if (!customer_name || !location || !performed_by) {
      return {
        statusCode: 400,
        body: "Missing required fields: customer_name, location, performed_by",
      };
    }
    if (!customer_report_html || !tech_report_html) {
      return {
        statusCode: 400,
        body: "Missing report HTML (customer_report_html or tech_report_html)",
      };
    }

    const safe = (s) =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);

    const now = new Date();
    const ts = now
      .toISOString()
      .replace(/[:.]/g, "")
      .slice(0, 15)
      .replace("T", "_");

    const base = `${safe(customer_name)}-${safe(location)}-${ts}`;

    const customer_path = `${safe(customer_name)}/${base}-cstmr-rpt.html`;
    const tech_path = `${safe(customer_name)}/${base}-tch-rpt.html`;

    const encodeStoragePath = (p) =>
      p
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");

    const uploadToBucket = async (bucket, path, content, contentType) => {
      const url =
        `${SUPABASE_URL}/storage/v1/object/` +
        `${encodeURIComponent(bucket)}/` +
        `${encodeStoragePath(path)}?upsert=true`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          "Content-Type": contentType,
        },
        body: content,
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Upload failed (${bucket}): ${res.status} ${t}`);
      }
    };

    // Upload HTML reports to Storage
    await uploadToBucket(
      "customer-reports",
      customer_path,
      customer_report_html,
      "text/html"
    );
    await uploadToBucket("tech-reports", tech_path, tech_report_html, "text/html");

    // Insert inspection record
    const insertPayload = {
      customer_name,
      location,
      performed_by,
      duration_minutes: Number.isFinite(duration_minutes) ? duration_minutes : null,
      customer_report_path: customer_path,
      tech_report_path: tech_path,
    };

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/inspections`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(insertPayload),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text().catch(() => "");
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          status: insertRes.status,
          error: errText,
        }),
      };
    }

    const rows = await insertRes.json().catch(() => []);
    const row = rows?.[0] || null;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        inspection_number: row?.inspection_number ?? null,
        customer_report_path: customer_path,
        tech_report_path: tech_path,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: `Server error: ${err?.message || err}`,
    };
  }
};
