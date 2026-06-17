import {
  jsonResponse,
  readJson,
  safeJson,
  getMessenleadBaseUrl,
  getMessenleadToken,
} from "../_utils.js";
import { getSession } from "../_auth.js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const sourceCache = new Map();

function cleanSourceKey(value) {
  return String(value || "").trim();
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function getCachedSource(sourceKey) {
  const cached = sourceCache.get(sourceKey);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
    sourceCache.delete(sourceKey);
    return null;
  }
  return cached.value;
}

function cacheSource(source) {
  if (!source?.sourceKey || !source?.adId) return;
  sourceCache.set(source.sourceKey, {
    cachedAt: Date.now(),
    value: source,
  });
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
  const sourceKeys = Array.from(
    new Set((Array.isArray(body?.sourceKeys) ? body.sourceKeys : []).map(cleanSourceKey).filter(Boolean))
  ).slice(0, 500);

  if (!sourceKeys.length) {
    return jsonResponse(200, { code: "success", sources: [], unresolved: [] });
  }

  const cachedSources = [];
  const missingKeys = [];
  sourceKeys.forEach((sourceKey) => {
    const cached = getCachedSource(sourceKey);
    if (cached) {
      cachedSources.push(cached);
    } else {
      missingKeys.push(sourceKey);
    }
  });

  if (!missingKeys.length) {
    return jsonResponse(200, { code: "success", sources: cachedSources, unresolved: [] });
  }

  try {
    const response = await fetch(`${baseUrl}/api/messenger-attributions/resolve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sourceKeys: missingKeys }),
    });

    const data = await safeJson(response);
    if (!response.ok) {
      return jsonResponse(response.status, { error: "Erro Messenlead", details: data });
    }

    const resolvedSources = Array.isArray(data?.sources) ? data.sources : [];
    resolvedSources.forEach(cacheSource);
    const resolvedKeys = new Set(resolvedSources.map((source) => source.sourceKey).filter(Boolean));
    const unresolved = Array.from(
      new Set([
        ...(Array.isArray(data?.unresolved) ? data.unresolved : []),
        ...missingKeys.filter((sourceKey) => !resolvedKeys.has(sourceKey)),
      ])
    );

    return jsonResponse(200, {
      code: "success",
      sources: [...cachedSources, ...resolvedSources],
      unresolved,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "Erro ao resolver fontes Messenlead",
      details: error.message,
    });
  }
}
