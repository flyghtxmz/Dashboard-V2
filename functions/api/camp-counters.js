import { jsonResponse, getQuery, readJson, getMetaToken } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

const TIPO_MAP = {
  OUTCOME_TRAFFIC: "cnl",
  OUTCOME_SALES: "vnd",
  OUTCOME_LEADS: "cad",
  OUTCOME_ENGAGEMENT: "eng",
  OUTCOME_AWARENESS: "rec",
  OUTCOME_APP_PROMOTION: "app",
};

// Extrai o número de um nome no padrão cmp-{nn}-{tipo}-{nicho}
function extractNum(name, tipo, nicho) {
  const re = new RegExp(`^cmp-(\\d+)-${tipo}-${nicho}$`, "i");
  const m = String(name || "").match(re);
  return m ? parseInt(m[1], 10) : null;
}

export async function onRequest({ request, env }) {
  const kv = env.CPA_RULES_KV || env.DASHBOARD_KV;
  if (!kv) return jsonResponse(500, { error: "KV não configurado" });

  const params = getQuery(request);
  const account_id = params.get("account_id");
  if (!account_id) return jsonResponse(400, { error: "account_id obrigatório" });

  const kvKey = `camp_counters:${account_id}`;

  // ── GET: retorna o próximo número para nicho+objetivo ──────────────────────
  if (request.method === "GET") {
    const nicho = params.get("nicho");
    const objective = params.get("objective") || "OUTCOME_TRAFFIC";
    if (!nicho) return jsonResponse(400, { error: "nicho obrigatório" });

    const tipo = TIPO_MAP[objective] || "cmp";

    // 1. Ler contador local do KV
    let counters = {};
    try { counters = JSON.parse(await kv.get(kvKey) || "{}"); } catch { }
    const kvNum = counters[nicho] || 0;

    // 2. Buscar campanhas na Meta para sincronizar
    let metaMax = 0;
    const token = getMetaToken(env);
    if (token) {
      try {
        const act = account_id.startsWith("act_") ? account_id : `act_${account_id}`;
        const t = encodeURIComponent(token);
        const filter = encodeURIComponent(JSON.stringify([{ field: "name", operator: "CONTAIN", value: `cmp-` }]));
        const url = `${API_BASE}/${act}/campaigns?fields=name&filtering=${filter}&limit=500&access_token=${t}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          for (const camp of data.data || []) {
            const n = extractNum(camp.name, tipo, nicho);
            if (n && n > metaMax) metaMax = n;
          }
        }
      } catch { }
    }

    const next = Math.max(kvNum, metaMax) + 1;
    return jsonResponse(200, {
      code: "success",
      next,
      kvNum,
      metaMax,
      nextFormatted: String(next).padStart(2, "0"),
    });
  }

  // ── POST: salva contador após publicação bem-sucedida ─────────────────────
  if (request.method === "POST") {
    const body = await readJson(request);
    const { nicho, num } = body;
    if (!nicho || num == null) return jsonResponse(400, { error: "nicho e num obrigatórios" });

    let counters = {};
    try { counters = JSON.parse(await kv.get(kvKey) || "{}"); } catch { }

    // Só atualiza se o novo número for maior (nunca regride)
    if (!counters[nicho] || num > counters[nicho]) {
      counters[nicho] = num;
      await kv.put(kvKey, JSON.stringify(counters));
    }

    return jsonResponse(200, { code: "success", saved: counters[nicho] });
  }

  return jsonResponse(405, { error: "Método não permitido" });
}
