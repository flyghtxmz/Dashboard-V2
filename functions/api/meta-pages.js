import { jsonResponse, getMetaToken, safeJson } from "../_utils.js";

const API_BASE = "https://graph.facebook.com/v24.0";
const PAGE_FIELDS = "id,name,category,instagram_business_account{id,name,username}";
const BUSINESS_FIELDS = "id,name";
const PERMISSION_FIELDS = "permission,status";
const MAX_META_PAGES = 100;
const MAX_BUSINESSES = 50;

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
      const sourceNames = new Set([...(previous.sources || []), source.label || source.name].filter(Boolean));
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

function buildGraphUrl(path, token, fields = PAGE_FIELDS, limit = 200) {
  const params = new URLSearchParams({
    fields,
    limit: String(limit),
    access_token: token,
  });
  return `${API_BASE}/${path}?${params.toString()}`;
}

function graphFailure(source, error, extra = {}) {
  return {
    source,
    status: error?.status || 500,
    message: error?.message || "Falha ao consultar a Meta",
    ...extra,
  };
}

async function mapSettledWithConcurrency(items, mapper, concurrency = 6) {
  const rows = Array.isArray(items) ? items : [];
  const results = new Array(rows.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: "fulfilled", value: await mapper(rows[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), rows.length) }, () => worker())
  );
  return results;
}

export async function fetchBusinessMetaPages(token, fetchImpl = fetch) {
  let businessResult;
  try {
    businessResult = await fetchAllMetaPages(
      buildGraphUrl("me/businesses", token, BUSINESS_FIELDS, 100),
      fetchImpl
    );
  } catch (error) {
    return {
      businesses: [],
      businessesFetched: 0,
      truncated: false,
      sources: [],
      failures: [graphFailure("portfolios empresariais", error)],
    };
  }

  const allBusinesses = businessResult.rows
    .filter((business) => String(business?.id || "").trim())
    .map((business) => ({
      id: String(business.id).trim(),
      name: String(business?.name || business.id).trim(),
    }));
  const businesses = allBusinesses.slice(0, MAX_BUSINESSES);
  const pageRequests = businesses.flatMap((business) => [
    {
      name: "portfolio_owned",
      label: `Portfolio proprio: ${business.name}`,
      business,
      url: buildGraphUrl(`${encodeURIComponent(business.id)}/owned_pages`, token),
    },
    {
      name: "portfolio_client",
      label: `Portfolio cliente: ${business.name}`,
      business,
      url: buildGraphUrl(`${encodeURIComponent(business.id)}/client_pages`, token),
    },
  ]);
  const settled = await mapSettledWithConcurrency(
    pageRequests,
    async (source) => ({
      ...source,
      ...(await fetchAllMetaPages(source.url, fetchImpl)),
    }),
    6
  );
  const sources = settled
    .filter((item) => item.status === "fulfilled")
    .map((item) => item.value);
  const failures = settled
    .map((item, index) => ({ item, source: pageRequests[index] }))
    .filter(({ item }) => item.status === "rejected")
    .map(({ item, source }) =>
      graphFailure(source.label, item.reason, {
        business_id: source.business.id,
        business_name: source.business.name,
      })
    );

  return {
    businesses,
    businessesFetched: businessResult.pagesFetched,
    truncated: businessResult.truncated || allBusinesses.length > MAX_BUSINESSES,
    sources,
    failures,
  };
}

export async function fetchMetaPermissions(token, fetchImpl = fetch) {
  const result = await fetchAllMetaPages(
    buildGraphUrl("me/permissions", token, PERMISSION_FIELDS, 200),
    fetchImpl
  );
  return Object.fromEntries(
    result.rows
      .map((row) => [String(row?.permission || "").trim(), String(row?.status || "").trim()])
      .filter(([permission]) => permission)
  );
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

  const [settled, businessDiscovery, permissionDiscovery] = await Promise.all([
    Promise.allSettled(
      requests.map(async (source) => ({ ...source, ...(await fetchAllMetaPages(source.url)) }))
    ),
    fetchBusinessMetaPages(token),
    fetchMetaPermissions(token)
      .then((permissions) => ({ checked: true, permissions, error: null }))
      .catch((error) => ({ checked: false, permissions: {}, error: graphFailure("permissoes", error) })),
  ]);
  const successful = settled
    .filter((item) => item.status === "fulfilled")
    .map((item) => item.value)
    .concat(businessDiscovery.sources);
  const failures = settled
    .map((item, index) => ({ item, source: requests[index].name }))
    .filter(({ item }) => item.status === "rejected")
    .map(({ item, source }) => graphFailure(source, item.reason))
    .concat(businessDiscovery.failures)
    .concat(permissionDiscovery.error ? [permissionDiscovery.error] : []);

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
        label: source.label || source.name,
        rows: source.rows.length,
        pages_fetched: source.pagesFetched,
        truncated: source.truncated,
        business_id: source.business?.id || null,
        business_name: source.business?.name || null,
      })),
      businesses: {
        total: businessDiscovery.businesses.length,
        pages_fetched: businessDiscovery.businessesFetched,
        truncated: businessDiscovery.truncated,
      },
      permissions_checked: permissionDiscovery.checked,
      permissions: permissionDiscovery.permissions,
      warnings: failures,
    },
  });
}
