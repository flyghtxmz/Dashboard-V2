const API_BASE = "https://office.joinads.me/api/clients-endpoints";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.JOINADS_ACCESS_TOKEN;
  if (!token) {
    res.status(500).json({ error: "JOINADS_ACCESS_TOKEN não configurado" });
    return;
  }

  const { start_date, end_date, domain, sort, limit } = req.query || {};
  const missing = [];
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");
  if (!domain) missing.push("domain[]");

  if (missing.length) {
    res
      .status(400)
      .json({ error: `Parâmetros obrigatórios: ${missing.join(", ")}` });
    return;
  }

  const params = new URLSearchParams();
  params.set("start_date", start_date);
  params.set("end_date", end_date);
  if (Array.isArray(domain)) {
    domain.forEach((d) => params.append("domain[]", d));
  } else {
    params.append("domain[]", domain);
  }
  if (limit) params.set("limit", limit);
  if (sort) params.set("sort", sort);

  try {
    const response = await fetch(`${API_BASE}/top-url?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      res.status(response.status).json({ error: "Erro JoinAds", details: data });
      return;
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      error: "Erro ao consultar JoinAds",
      details: error.message,
    });
  }
};
