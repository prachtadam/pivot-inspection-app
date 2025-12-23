exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const body = JSON.parse(event.body || "{}");
    const { inspection_id, kind, filename, contentType, base64 } = body;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
      };
    }

    if (!inspection_id || !kind || !filename || !base64) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing one of: inspection_id, kind, filename, base64" }),
      };
    }

    const BUCKET_CUSTOMER = process.env.REPORTS_BUCKET_CUSTOMER || "inspection-reports-customer";
    const BUCKET_TECH = process.env.REPORTS_BUCKET_TECH || "inspection-reports-tech";
    const bucket = kind === "customer" ? BUCKET_CUSTOMER : kind === "tech" ? BUCKET_TECH : null;

    if (!bucket) {
      return { statusCode: 400, body: JSON.stringify({ error: "kind must be 'customer' or 'tech'" }) };
    }

    const path = `${inspection_id}/${filename}`;

    const bytes = Uint8Array.from(Buffer.from(base64, "base64"));

    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

    const upRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "Content-Type": contentType || "application/pdf",
        "x-upsert": "true",
      },
      body: bytes,
    });

    const upText = await upRes.text();
    if (!upRes.ok) {
      return { statusCode: upRes.status, body: JSON.stringify({ error: "Upload failed", details: upText }) };
    }

    // Optional: store paths back in inspections table if columns exist
    const patch =
      kind === "customer" ? { customer_report_path: path } : { tech_report_path: path };

    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/inspections?id=eq.${inspection_id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
    });

    const patchText = await patchRes.text();
    if (!patchRes.ok) {
      return {
        statusCode: patchRes.status,
        body: JSON.stringify({ ok: true, path, warning: "Uploaded but failed to update row", details: patchText }),
      };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, bucket, path }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err?.message || String(err) }) };
  }
};
