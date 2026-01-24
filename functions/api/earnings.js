import {
  jsonResponse,
  getQuery,
  getJoinadsToken,
  readJson,
  safeJson,
} from "../_utils.js";

const API_BASE = "https://office.joinads.me/api/clients-endpoints";

export async function onRequest({ request, env }) {
  const token = getJoinadsToken(env);
  if (!token) {
    return jsonResponse(500, { error: "JOINADS_ACCESS_TOKEN nao configurado" });
  }

  const method = request.method || "GET";
  if (method !== "GET" && method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed, use GET or POST" });
  }

  const query = getQuery(request);
  const body = method === "POST" ? await readJson(request) : {};

  const start_date = method === "GET" ? query.get("start_date") : body.start_date;
  const end_date = method === "GET" ? query.get("end_date") : body.end_date;
  const domain = method === "GET" ? query.get("domain") : body.domain;

  const missing = [];
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");
  if (missing.length) {
    return jsonResponse(400, {
      error: `Parametros obrigatorios: ${missing.join(", ")}`,
    });
  }

  const params = new URLSearchParams();
  params.set("start_date", start_date);
  params.set("end_date", end_date);
  if (domain) params.set("domain", domain);

  try {
    const response = await fetch(`${API_BASE}/earnings?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro JoinAds", details: data });
    }

    return jsonResponse(200, data);
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao consultar JoinAds",
      details: error.message,
    });
  }
}
