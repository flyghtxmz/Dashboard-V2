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

  const { adset_id, status_option, rename_strategy, rename_options, number_of_copies, include_creative } =
    req.body || {};
  if (!adset_id) {
    res.status(400).json({ error: "Parametros obrigatorios: adset_id" });
    return;
  }

  try {
    const params = new URLSearchParams();
    params.set("deep_copy", "true");
    if (status_option) params.set("status_option", status_option);
    if (rename_strategy) params.set("rename_strategy", rename_strategy);
    if (rename_options) {
      params.set("rename_options", JSON.stringify(rename_options));
    }
    if (number_of_copies) params.set("number_of_copies", String(number_of_copies));
    if (include_creative !== undefined && include_creative !== null) {
      params.set("include_creative", include_creative ? "true" : "false");
    }
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
