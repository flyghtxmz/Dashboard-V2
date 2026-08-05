import { jsonResponse, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";
const PAGE_FIELDS = "id,name,category,instagram_business_account{id,name,username}";
const MAX_META_PAGES = 100;

function normalizeAccountId(value) {
  const id = String(value || "").trim();
  if (!id) return "";
  return id.startsWith("act_") ? id : `act_${id}`;
}

function isSafeGraphNextUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "graph.facebook.com";
  } catch {
    return false;
  }
}

export async function fetchAllMetaPages(initialUrl, fetchImpl = fetch) {
  const rows = [];
  let nextUrl = initialUrl;
  let pagesFetched = 0;

  while (nextUrl && pagesFetched < MAX_META_PAGES) {
    const response = await fetchImpl(nextUrl, { headers: { Accept: "application/json" } });
    const payload = await safeJson(response);
    if (!response.ok) {
      const error = new Error(payload?.error?.message || "Erro Meta ao listar paginas");
      error.status = response.status;
      error.details = payload;
      throw error;
    }
    if (Array.isArray(payload?.data)) rows.push(...payload.data);
    pagesFetched += 1;
    const candidate = payload?.paging?.next;
    nextUrl = candidate && isSafeGraphNextUrl(candidate) ? candidate : null;
  }

  return {
    rows,
    pagesFetched,
    truncated: Boolean(nextUrl),
  };
}

export function mergeMetaPages(sources) {
  const merged = new Map();
  for (const source of Array.isArray(sources) ? sources : []) {
    for (const raw of Array.isArray(source?.rows) ? source.rows : []) {
      const id = String(raw?.id || "").trim();
      if (!id) continue;
      const previous = merged.get(id) || {};
      const sourceNames = new Set([...(previous.sources || []), source.name].filter(Boolean));
      merged.set(id, {
        ...previous,
        id,
        name: String(raw?.name || previous.name || id).trim(),
        category: String(raw?.category || previous.category || "").trim(),
        instagram_business_account: raw?.instagram_business_account || previous.instagram_business_account || null,
        sources: [...sourceNames],
      });
    }
  }
  return [...merged.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }) || a.id.localeCompare(b.id)
  );
}

function buildGraphUrl(path, token) {
  const params = new URLSearchParams({
    fields: PAGE_FIELDS,
    limit: "200",
    access_token: token,
  });
  return `${API_BASE}/${path}?${params.toString()}`;
}

export async function onRequest({ request, env }) {
  const token = getMetaToken(env);
  if (!token) {
    return jsonResponse(500, { error: "META_ACCESS_TOKEN nao configurado" });
  }

  if (request.method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const accountId = normalizeAccountId(new URL(request.url).searchParams.get("account_id"));
  const requests = [
    { name: "gerenciada", url: buildGraphUrl("me/accounts", token) },
    ...(accountId
      ? [{ name: "promovivel", url: buildGraphUrl(`${encodeURIComponent(accountId)}/promote_pages`, token) }]
      : []),
  ];

  const settled = await Promise.allSettled(
    requests.map(async (source) => ({ ...source, ...(await fetchAllMetaPages(source.url)) }))
  );
  const successful = settled
    .filter((item) => item.status === "fulfilled")
    .map((item) => item.value);
  const failures = settled
    .map((item, index) => ({ item, source: requests[index].name }))
    .filter(({ item }) => item.status === "rejected")
    .map(({ item, source }) => ({
      source,
      status: item.reason?.status || 500,
      message: item.reason?.message || "Falha ao consultar a Meta",
    }));

  if (!successful.length) {
    return jsonResponse(failures[0]?.status || 500, {
      code: "error",
      error: "Erro ao listar paginas",
      details: failures,
    });
  }

  const pages = mergeMetaPages(successful);
  return jsonResponse(200, {
    code: "success",
    data: pages,
    meta: {
      total: pages.length,
      account_id: accountId || null,
      sources: successful.map((source) => ({
        name: source.name,
        rows: source.rows.length,
        pages_fetched: source.pagesFetched,
        truncated: source.truncated,
      })),
      warnings: failures,
    },
  });
}
