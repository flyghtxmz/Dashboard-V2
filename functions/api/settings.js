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
  nichos: [],
};

function getSettings(raw) {
  try {
    const parsed = JSON.parse(raw);
    return {
      domains: Array.isArray(parsed.domains) ? parsed.domains : DEFAULT_SETTINGS.domains,
      metaAccountId: parsed.metaAccountId || "",
      reportType: parsed.reportType || "Analytical",
      includeAssets: !!parsed.includeAssets,
      nichos: Array.isArray(parsed.nichos) ? parsed.nichos : [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function onRequest({ request, env }) {
  const kv = env.CPA_RULES_KV || env.DASHBOARD_KV;

  if (!kv) {
    return Response.json({ code: "error", message: "KV nao configurado" }, { status: 500 });
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
    const nichos = Array.isArray(body.nichos)
      ? body.nichos.filter((n) => n && typeof n.nome === "string" && n.nome.trim())
          .map((n) => ({
            nome: n.nome.trim(),
            slug: (n.slug || "").trim(),
            paises: Array.isArray(n.paises) ? n.paises.map((p) => String(p).trim()).filter(Boolean) : (n.pais ? [String(n.pais).trim()] : []),
          }))
      : [];

    const settings = { domains, metaAccountId, reportType, includeAssets, nichos };
    await kv.put(KV_KEY, JSON.stringify(settings));
    return Response.json({ code: "success", data: settings });
  }

  return Response.json({ code: "error", message: "Method not allowed" }, { status: 405 });
}
