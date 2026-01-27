import { jsonResponse, readJson } from "../_utils.js";

function toBasicToken(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export async function onRequest({ request }) {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const body = await readJson(request);
  const {
    site_url,
    auth_user,
    auth_pass,
    new_username,
    new_email,
    new_password,
  } = body || {};

  if (!site_url || !auth_user || !auth_pass || !new_username || !new_email) {
    return jsonResponse(400, {
      error:
        "Parametros obrigatorios: site_url, auth_user, auth_pass, new_username, new_email",
    });
  }

  let baseUrl;
  try {
    const parsed = new URL(site_url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return jsonResponse(400, { error: "URL invalida (use http/https)." });
    }
    baseUrl = parsed.origin;
  } catch (e) {
    return jsonResponse(400, { error: "URL invalida." });
  }

  const endpoint = `${baseUrl.replace(/\/+$/g, "")}/wp-json/emergencia/v1/criar-admin`;

  try {
    const authToken = toBasicToken(`${auth_user}:${auth_pass}`);
    const payload = {
      username: new_username,
      email: new_email,
    };
    if (new_password) {
      payload.password = new_password;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${authToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return jsonResponse(res.status, {
        error: "Erro WordPress",
        details: data,
      });
    }
    return jsonResponse(200, { code: "success", data });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao criar admin",
      details: error.message,
    });
  }
}
