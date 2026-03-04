import { jsonResponse, getQuery, readJson } from "../_utils.js";

function kvKey(account_id) {
  return `media_labels:${account_id}`;
}

export async function onRequest({ request, env }) {
  const kv = env.CPA_RULES_KV || env.DASHBOARD_KV;
  if (!kv) return jsonResponse(500, { error: "KV nao configurado" });

  const params = getQuery(request);
  const account_id = params.get("account_id");
  if (!account_id) return jsonResponse(400, { error: "Parametro obrigatorio: account_id" });

  if (request.method === "GET") {
    const raw = await kv.get(kvKey(account_id));
    return jsonResponse(200, { code: "success", data: raw ? JSON.parse(raw) : {} });
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    const incoming = body?.labels || {};

    // Merge with existing instead of overwriting
    const existing = await kv.get(kvKey(account_id));
    const current = existing ? JSON.parse(existing) : {};
    const merged = { ...current, ...incoming };

    await kv.put(kvKey(account_id), JSON.stringify(merged));
    return jsonResponse(200, { code: "success", data: merged });
  }

  return jsonResponse(405, { error: "Method not allowed" });
}
