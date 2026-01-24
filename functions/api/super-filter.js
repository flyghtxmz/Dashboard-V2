import {
  jsonResponse,
  getJoinadsToken,
  readJson,
  safeJson,
} from "../_utils.js";

const API_BASE = "https://office.joinads.me/api/clients-endpoints";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const token = getJoinadsToken(env);
  if (!token) {
    return jsonResponse(500, { error: "JOINADS_ACCESS_TOKEN nao configurado" });
  }

  const body = await readJson(request);
  const { start_date, end_date } = body || {};
  const missing = [];
  if (!start_date) missing.push("start_date");
  if (!end_date) missing.push("end_date");
  if (missing.length) {
    return jsonResponse(400, {
      error: `Parametros obrigatorios: ${missing.join(", ")}`,
    });
  }

  const payload = { ...body };
  if (payload.domain && !Array.isArray(payload.domain)) {
    payload.domain = [payload.domain];
  }
  if (!payload.group) {
    payload.group = [];
  }

  try {
    const response = await fetch(`${API_BASE}/super-filter`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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
