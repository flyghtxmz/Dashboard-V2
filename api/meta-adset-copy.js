const API_BASE = "https://graph.facebook.com/v24.0";

module.exports = async function handler(req, res) {
  const token = process.env.META_ACCESS_TOKEN || process.env.META_TOKEN;
  if (!token) {
    res.status(500).json({ error: "META_ACCESS_TOKEN nao configurado" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { adset_id, status_option } = req.body || {};
  if (!adset_id) {
    res.status(400).json({ error: "Parametros obrigatorios: adset_id" });
    return;
  }

  try {
    const params = new URLSearchParams();
    params.set("deep_copy", "true");
    if (status_option) params.set("status_option", status_option);
    params.set("access_token", token);

    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(adset_id)}/copies`,
      {
        method: "POST",
        body: params,
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      res.status(response.status).json({ error: "Erro Meta", details: data });
      return;
    }
    const newId =
      data?.copied_adset_id || data?.id || data?.copied_id || null;
    res.status(200).json({ code: "success", data, new_adset_id: newId });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Erro ao duplicar conjunto", details: error.message });
  }
};
