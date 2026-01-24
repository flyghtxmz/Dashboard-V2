import { jsonResponse, getQuery, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";

async function fetchAll(url) {
  const results = [];
  let next = url;
  while (next) {
    const res = await fetch(next);
    const json = await safeJson(res);
    if (!res.ok) {
      const err = new Error("Erro Meta");
      err.details = json;
      throw err;
    }
    results.push(...(json.data || []));
    next = json?.paging?.next || null;
  }
  return results;
}

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  if (request.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const params = getQuery(request);
  const account_id = params.get("account_id");
  if (!account_id) {
    return jsonResponse(400, { error: "Parametros obrigatorios: account_id" });
  }

  try {
    const campaignsAllUrl = `${API_BASE}/${encodeURIComponent(
      account_id
    )}/campaigns?fields=id,name,status,effective_status&limit=200&access_token=${token}`;
    const campaigns = await fetchAll(campaignsAllUrl);

    const withAdsets = await Promise.all(
      campaigns.map(async (camp) => {
        const adsetsUrl = `${API_BASE}/${encodeURIComponent(
          camp.id
        )}/adsets?fields=id,name,status,effective_status,daily_budget,lifetime_budget&limit=200&access_token=${token}`;
        const adsets = await fetchAll(adsetsUrl);

        const adsetsWithAds = await Promise.all(
          adsets.map(async (adset) => {
            const adsUrl = `${API_BASE}/${encodeURIComponent(
              adset.id
            )}/ads?fields=id,name,status,effective_status&limit=200&access_token=${token}`;
            const ads = await fetchAll(adsUrl);
            return { ...adset, ads };
          })
        );

        return { ...camp, adsets: adsetsWithAds };
      })
    );

    return jsonResponse(200, { code: "success", data: withAdsets });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao consultar Meta",
      details: error.details || error.message,
    });
  }
}
