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

  const { adset_id } = req.query || {};
  if (!adset_id) {
    res.status(400).json({ error: "Parametros obrigatorios: adset_id" });
    return;
  }

  try {
    const adsUrl = `${API_BASE}/${encodeURIComponent(
      adset_id
    )}/ads?fields=id,name,status,effective_status&limit=200&access_token=${token}`;
    const ads = await fetchAll(adsUrl);
    res.status(200).json({ code: "success", data: ads });
  } catch (error) {
    res.status(500).json({
      error: "Erro ao consultar ads",
      details: error.details || error.message,
    });
  }
};
