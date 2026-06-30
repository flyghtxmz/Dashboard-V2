import {
  jsonResponse,
  readJson,
  safeJson,
  getMessenleadBaseUrl,
  getMessenleadToken,
} from "../_utils.js";
import { getSession } from "../_auth.js";

// O vinculo src_ -> adId definido pelo Messenlead e permanente e deterministico, entao podemos
// memorizar as resolucoes positivas no KV e so consultar o Messenlead pelas src_ novas.
// IMPORTANTE: o Dashboard NUNCA gera src_ aqui; ele apenas guarda a resposta que o Messenlead deu.
const SRC_MAP_KEY = "messenlead:src-adid-map:v1";
// Teto de src_ por chamada ao Messenlead (ele tambem corta em 500). Loteamos para nao truncar.
const MESSENLEAD_BATCH = 500;

function cleanSourceKey(value) {
  return String(value || "").trim();
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getKv(env) {
  return env.CPA_RULES_KV || env.DASHBOARD_KV || null;
}

async function readSrcMap(kv) {
  if (!kv) return {};
  try {
    const raw = await kv.get(SRC_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeSrcMap(kv, map) {
  if (!kv) return;
  try {
    await kv.put(SRC_MAP_KEY, JSON.stringify(map));
  } catch {
    // Cache e best-effort: se a escrita falhar, a proxima carga apenas re-resolve.
  }
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function resolveBatchFromMessenlead(baseUrl, token, keys) {
  const response = await fetch(`${baseUrl}/api/messenger-attributions/resolve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sourceKeys: keys }),
  });
  const data = await safeJson(response);
  if (!response.ok) {
    const err = new Error("Erro Messenlead");
    err.status = response.status;
    err.details = data;
    throw err;
  }
  return {
    sources: Array.isArray(data?.sources) ? data.sources : [],
    unresolved: Array.isArray(data?.unresolved) ? data.unresolved : [],
  };
}

export async function onRequest({ request, env }) {
  const session = await getSession(request, env);
  if (!session) {
    return jsonResponse(401, { code: "error", message: "Sessao invalida ou expirada." });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const baseUrl = normalizeBaseUrl(getMessenleadBaseUrl(env));
  const token = getMessenleadToken(env);
  if (!baseUrl || !token) {
    return jsonResponse(500, {
      error: "MESSENLEAD_API_BASE_URL ou MESSENLEAD_API_TOKEN nao configurado",
    });
  }

  const body = await readJson(request);
  // Sem corte na lista inteira: o teto de 500 e aplicado por LOTE na chamada ao Messenlead.
  const sourceKeys = Array.from(
    new Set((Array.isArray(body?.sourceKeys) ? body.sourceKeys : []).map(cleanSourceKey).filter(Boolean))
  );

  if (!sourceKeys.length) {
    return jsonResponse(200, { code: "success", sources: [], unresolved: [] });
  }

  const kv = getKv(env);
  const srcMap = await readSrcMap(kv);

  // 1) Serve do cache permanente as src_ ja resolvidas antes (vinculo src_->adId e imutavel).
  const cachedSources = [];
  const missingKeys = [];
  for (const sourceKey of sourceKeys) {
    const adId = srcMap[sourceKey];
    if (adId) {
      cachedSources.push({ sourceKey, adId });
    } else {
      missingKeys.push(sourceKey);
    }
  }

  if (!missingKeys.length) {
    return jsonResponse(200, {
      code: "success",
      sources: cachedSources,
      unresolved: [],
      cacheHits: cachedSources.length,
      resolved: 0,
    });
  }

  // 2) Resolve apenas as src_ novas no Messenlead, em lotes de <= 500.
  const resolvedSources = [];
  const unresolvedSet = new Set();
  try {
    for (const batch of chunk(missingKeys, MESSENLEAD_BATCH)) {
      const { sources, unresolved } = await resolveBatchFromMessenlead(baseUrl, token, batch);
      const resolvedInBatch = new Set();
      for (const source of sources) {
        if (source?.sourceKey && source?.adId) {
          resolvedSources.push(source);
          resolvedInBatch.add(source.sourceKey);
        }
      }
      unresolved.forEach((key) => unresolvedSet.add(key));
      batch.forEach((key) => {
        if (!resolvedInBatch.has(key)) unresolvedSet.add(key);
      });
    }
  } catch (error) {
    return jsonResponse(error.status || 500, {
      error: error.message || "Erro ao resolver fontes Messenlead",
      details: error.details || null,
    });
  }

  // 3) Persiste APENAS resolucoes positivas. Nunca cacheia "nao encontrado" (pode resolver depois).
  let changed = false;
  for (const source of resolvedSources) {
    if (source.sourceKey && source.adId && srcMap[source.sourceKey] !== source.adId) {
      srcMap[source.sourceKey] = source.adId;
      changed = true;
    }
    unresolvedSet.delete(source.sourceKey);
  }
  if (changed) await writeSrcMap(kv, srcMap);

  return jsonResponse(200, {
    code: "success",
    sources: [...cachedSources, ...resolvedSources],
    unresolved: Array.from(unresolvedSet),
    cacheHits: cachedSources.length,
    resolved: resolvedSources.length,
  });
}
