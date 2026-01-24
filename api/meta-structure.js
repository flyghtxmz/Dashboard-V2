const API_BASE = "https://graph.facebook.com/v24.0";

async function fetchAll(url) {
  const results = [];
  let next = url;
  while (next) {
    const res = await fetch(next);
    const json = await res.json().catch(() => ({}));
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

module.exports = async function handler(req, res) {
  const token = process.env.META_ACCESS_TOKEN || process.env.META_TOKEN;
  if (!token) {
    res.status(500).json({ error: "META_ACCESS_TOKEN nao configurado" });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { account_id } = req.query || {};
  if (!account_id) {
    res.status(400).json({ error: "Parametros obrigatorios: account_id" });
    return;
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

    res.status(200).json({ code: "success", data: withAdsets });
  } catch (error) {
    res.status(500).json({
      error: "Erro ao consultar Meta",
      details: error.details || error.message,
    });
  }
};
