const KV_KEY = "dashboard_settings";

const DEFAULT_SETTINGS = {
  domains: [
    "remediototal.com.br",
    "br.remediototal.com.br",
    "es.remediototal.com.br",
    "intre.remediototal.com.br",
  ],
  metaAccountId: "",
  reportType: "Analytical",
  includeAssets: false,
};

function getSettings(raw) {
  try {
    const parsed = JSON.parse(raw);
    return {
      domains: Array.isArray(parsed.domains) ? parsed.domains : DEFAULT_SETTINGS.domains,
      metaAccountId: parsed.metaAccountId || "",
      reportType: parsed.reportType || "Analytical",
      includeAssets: !!parsed.includeAssets,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function onRequest({ request, env }) {
  const kv = env.DASHBOARD_KV;

  if (!kv) {
    // KV not configured — return defaults so the app still works
    return Response.json({ code: "success", data: { ...DEFAULT_SETTINGS } });
  }

  if (request.method === "GET") {
    const raw = await kv.get(KV_KEY);
    return Response.json({ code: "success", data: raw ? getSettings(raw) : { ...DEFAULT_SETTINGS } });
  }

  if (request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch { /* ignore */ }

    const domains = Array.isArray(body.domains)
      ? body.domains.map((d) => String(d).trim()).filter(Boolean)
      : DEFAULT_SETTINGS.domains;
    const metaAccountId = (body.metaAccountId || "").trim();
    const reportType = body.reportType || "Analytical";
    const includeAssets = !!body.includeAssets;

    const settings = { domains, metaAccountId, reportType, includeAssets };
    await kv.put(KV_KEY, JSON.stringify(settings));
    return Response.json({ code: "success", data: settings });
  }

  return Response.json({ code: "error", message: "Method not allowed" }, { status: 405 });
}
