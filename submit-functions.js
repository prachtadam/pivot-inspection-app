// netlify/functions/submit-inspection.js
// One clean endpoint: creates an inspection record (Inspection # starts at 100),
// stores BOTH reports into separate Supabase Storage buckets, and updates the row.

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return { statusCode: 500, body: "Missing SUPABASE env vars" };
    }

    const req = JSON.parse(event.body || "{}");

    const customer_name = (req.customer_name || "").toString().trim();
    const location = (req.location || "").toString().trim();
    const performed_by = (req.performed_by || "").toString().trim();

    const duration_minutes = Number.isFinite(req.duration_minutes)
      ? req.duration_minutes
      : parseInt(req.duration_minutes || "0", 10);

    let customer_report_html = (req.customer_report_html || "").toString();
    let tech_report_html = (req.tech_report_html || "").toString();

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

    // 1) Insert row first to get inspection_number
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/inspections`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        customer_name,
        location,
        performed_by,
        duration_minutes: Number.isFinite(duration_minutes) ? duration_minutes : null,
      }),
    });

    if (!insertRes.ok) {
      const t = await insertRes.text();
      throw new Error(`DB insert failed: ${insertRes.status} ${t}`);
    }

    const rows = await insertRes.json();
    const row = rows?.[0];
    const inspection_number = row?.inspection_number;

    // Replace placeholder in TECH report (keeps HTML format stable)
    if (inspection_number != null) {
      tech_report_html = tech_report_html.replace(
        /__INSPECTION_NUMBER__/g,
        String(inspection_number)
      );
    }

    // 2) Build paths (organized + searchable)
    const now = new Date();
    const ts = now
      .toISOString()
      .replace(/[:.]/g, "")
      .slice(0, 15)
      .replace("T", "_"); // YYYY-MM-DD_HHMMSS

    const base = `${inspection_number || "x"}-${safe(customer_name)}-${safe(
      location
    )}-${ts}`;

    const customer_path = `${safe(customer_name)}/${base}-cstmr-rpt.html`;
    const tech_path = `${safe(customer_name)}/${base}-tch-rpt.html`;

    const uploadToBucket = async (bucket, path, content, contentType) => {
      const url =
        `${SUPABASE_URL}/storage/v1/object/` +
        `${encodeURIComponent(bucket)}/` +
        path +
        `?upsert=true`;

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
        const t = await res.text();
        throw new Error(`Upload failed (${bucket}): ${res.status} ${t}`);
      }
    };

    // 3) Upload both reports
    await uploadToBucket(
      "customer-reports",
      customer_path,
      customer_report_html,
      "text/html"
    );
    await uploadToBucket("tech-reports", tech_path, tech_report_html, "text/html");

    // 4) Patch row with storage paths
    if (row?.id) {
      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/inspections?id=eq.${row.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customer_report_path: customer_path,
            tech_report_path: tech_path,
          }),
        }
      );
      if (!patchRes.ok) {
        const t = await patchRes.text();
        throw new Error(`DB patch failed: ${patchRes.status} ${t}`);
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        inspection_number: inspection_number ?? null,
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
