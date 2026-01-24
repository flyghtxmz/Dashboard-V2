import {
  jsonResponse,
  getQuery,
  getJoinadsToken,
  safeJson,
} from "../_utils.js";

const API_BASE = "https://office.joinads.me/api/clients-endpoints";

export async function onRequest({ request, env }) {
  if (request.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const token = getJoinadsToken(env);
  if (!token) {
    return jsonResponse(500, { error: "JOINADS_ACCESS_TOKEN nao configurado" });
  }

  const params = getQuery(request);
  const start_date = params.get("start_date");
  const end_date = params.get("end_date");
  const sort = params.get("sort");
  const limit = params.get("limit");
  const domains = params.getAll("domain[]");
  const domainAlt = params.getAll("domain");
  const allDomains = domains.length ? domains : domainAlt;

  const missing = [];
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");
  if (!allDomains.length) missing.push("domain[]");
  if (missing.length) {
    return jsonResponse(400, {
      error: `Parametros obrigatorios: ${missing.join(", ")}`,
    });
  }

  const q = new URLSearchParams();
  q.set("start_date", start_date);
  q.set("end_date", end_date);
  allDomains.forEach((d) => q.append("domain[]", d));
  if (limit) q.set("limit", limit);
  if (sort) q.set("sort", sort);

  try {
    const response = await fetch(`${API_BASE}/top-url?${q.toString()}`, {
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
