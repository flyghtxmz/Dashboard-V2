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

  const { object_id, name } = req.body || {};
  if (!object_id || !name) {
    res.status(400).json({ error: "Parametros obrigatorios: object_id, name" });
    return;
  }

  try {
    const params = new URLSearchParams();
    params.set("name", name);
    params.set("access_token", token);

    const response = await fetch(
      `${API_BASE}/${encodeURIComponent(object_id)}`,
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
    res.status(200).json({ code: "success", data });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Erro ao renomear", details: error.message });
  }
};
