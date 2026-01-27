import { jsonResponse, readJson } from "../_utils.js";

export async function onRequest({ request, env }) {
  const kv = env.CPA_RULES_KV;
  if (!kv) {
    return jsonResponse(500, { error: "CPA_RULES_KV nao configurado" });
  }

  const url = new URL(request.url);
  const accountId = url.searchParams.get("account_id") || "default";
  const key = `rules:${accountId}`;

  if (request.method === "GET") {
    try {
      const raw = await kv.get(key);
      const parsed = raw ? JSON.parse(raw) : {};
      return jsonResponse(200, { code: "success", data: parsed.rules || {} });
    } catch (e) {
      return jsonResponse(500, { error: "Erro ao ler regras", details: e.message });
    }
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    const rules = body?.rules || {};
    try {
      await kv.put(
        key,
        JSON.stringify({
          rules,
          updated_at: new Date().toISOString(),
        })
      );
      return jsonResponse(200, { code: "success", data: rules });
    } catch (e) {
      return jsonResponse(500, {
        error: "Erro ao salvar regras",
        details: e.message,
      });
    }
  }

  if (request.method === "DELETE") {
    try {
      await kv.delete(key);
      return jsonResponse(200, { code: "success" });
    } catch (e) {
      return jsonResponse(500, {
        error: "Erro ao remover regras",
        details: e.message,
      });
    }
  }

  return jsonResponse(405, { error: "Method not allowed" });
}
