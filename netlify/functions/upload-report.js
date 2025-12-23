exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

    // Two-bucket support (set these in Netlify env vars)
    const BUCKET_CUSTOMER = process.env.REPORTS_BUCKET_CUSTOMER || process.env.REPORTS_BUCKET || "inspection-reports";
    const BUCKET_TECH = process.env.REPORTS_BUCKET_TECH || process.env.REPORTS_BUCKET || "inspection-reports";

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing env vars. Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY fallback)." }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const { inspection_id, kind, filename, contentType, base64 } = body;

    if (!inspection_id || !kind || !filename || !base64) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing fields: inspection_id, kind, filename, base64" }) };
    }
    if (kind !== "customer" && kind !== "tech") {
      return { statusCode: 400, body: JSON.stringify({ error: "kind must be 'customer' or 'tech'" }) };
    }

    const bucket = kind === "customer" ? BUCKET_CUSTOMER : BUCKET_TECH;
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

    // Update inspections row with the path fields (optional; safe if columns exist)
    const patch =
      kind === "customer"
        ? { customer_report_path: `${bucket}/${path}` }
        : { tech_report_path: `${bucket}/${path}` };

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
      // Don't fail the whole request if patch fails; the file is uploaded.
      return { statusCode: 200, body: JSON.stringify({ ok: true, uploaded: { bucket, path }, warning: "Uploaded but failed to update inspections row", details: patchText }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, uploaded: { bucket, path } }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err?.message || String(err) }) };
  }
};
