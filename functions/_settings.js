export const SETTINGS_KEY = "dashboard_settings";

export const DEFAULT_SETTINGS = {
  domains: [
    "remediototal.com.br",
    "br.remediototal.com.br",
    "es.remediototal.com.br",
    "intre.remediototal.com.br",
  ],
  metaAccountId: "",
  metaTaxEnabled: true,
  metaTaxRatePercent: 12.15,
  metaTaxEffectiveDate: "2026-01-01",
  metaTaxMode: "add",
  reportType: "Analytical",
  includeAssets: false,
  showMessagesLtvTable: true,
  messagesLtvExtraDays: [],
  nichos: [],
  urls: [],
  users: [],
};

export function getDashboardKv(env) {
  return env.CPA_RULES_KV || env.DASHBOARD_KV || null;
}

export function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeDomain(value) {
  return String(value || "").trim().toLowerCase();
}

export function extractHostname(value) {
  try {
    if (!value) return "";
    const raw = String(value).trim();
    if (!raw) return "";
    const normalized = raw.includes("://") ? raw : `https://${raw}`;
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function uniqueStrings(values, normalizer = (value) => String(value || "").trim()) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizer(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeNichos(values) {
  return Array.isArray(values)
    ? values
        .filter((item) => item && typeof item.nome === "string" && item.nome.trim())
        .map((item) => ({
          nome: item.nome.trim(),
          slug: String(item.slug || "").trim(),
          paises: uniqueStrings(
            Array.isArray(item.paises) ? item.paises : item.pais ? [item.pais] : [],
            (value) => String(value || "").trim()
          ),
        }))
    : [];
}

function normalizeUrls(values) {
  return Array.isArray(values)
    ? values
        .filter(
          (item) =>
            item &&
            typeof item.nome === "string" &&
            item.nome.trim() &&
            typeof item.url === "string" &&
            item.url.trim()
        )
        .map((item) => ({
          id: String(item.id || "").trim(),
          nome: item.nome.trim(),
          url: item.url.trim(),
          nicho: item.nicho ? String(item.nicho).trim() : null,
        }))
    : [];
}

function normalizeUsers(values) {
  return Array.isArray(values)
    ? values
        .filter((item) => item && typeof item.username === "string" && item.username.trim())
        .map((item) => ({
          id: String(item.id || "").trim(),
          nome: String(item.nome || "").trim(),
          username: normalizeUsername(item.username),
          role: item.role === "editor" ? "editor" : "gestor",
          allowedDomains: uniqueStrings(item.allowedDomains, normalizeDomain),
          commissionPercent: normalizeCommissionPercent(item.commissionPercent),
          active: item.active !== false,
          passwordHash: String(item.passwordHash || "").trim(),
          passwordSalt: String(item.passwordSalt || "").trim(),
          passwordAlgo: String(item.passwordAlgo || "").trim(),
          passwordIterations: Number(item.passwordIterations) || 0,
          lastLoginAt: item.lastLoginAt ? String(item.lastLoginAt) : null,
        }))
    : [];
}

function normalizeMessagesLtvExtraDays(values) {
  const allowed = new Set([4, 5, 6, 7]);
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => Number(value))
        .filter((value) => allowed.has(value))
    )
  ).sort((a, b) => a - b);
}

function normalizeCommissionPercent(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
  return Math.min(numberValue, 100);
}

export function normalizeSettings(raw) {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw || {};
    return {
      domains: uniqueStrings(parsed.domains, normalizeDomain).length
        ? uniqueStrings(parsed.domains, normalizeDomain)
        : [...DEFAULT_SETTINGS.domains],
      metaAccountId: String(parsed.metaAccountId || "").trim(),
      metaTaxEnabled: parsed.metaTaxEnabled !== false,
      metaTaxRatePercent: Math.min(99.99, Math.max(0, Number(parsed.metaTaxRatePercent ?? 12.15) || 0)),
      metaTaxEffectiveDate: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.metaTaxEffectiveDate || ""))
        ? String(parsed.metaTaxEffectiveDate)
        : DEFAULT_SETTINGS.metaTaxEffectiveDate,
      metaTaxMode: parsed.metaTaxMode === "included" ? "included" : "add",
      reportType: parsed.reportType || "Analytical",
      includeAssets: !!parsed.includeAssets,
      showMessagesLtvTable: parsed.showMessagesLtvTable !== false,
      messagesLtvExtraDays: normalizeMessagesLtvExtraDays(parsed.messagesLtvExtraDays),
      nichos: normalizeNichos(parsed.nichos),
      urls: normalizeUrls(parsed.urls),
      users: normalizeUsers(parsed.users),
    };
  } catch {
    return { ...DEFAULT_SETTINGS, domains: [...DEFAULT_SETTINGS.domains], users: [] };
  }
}

export async function loadSettings(env) {
  const kv = getDashboardKv(env);
  if (!kv) return { ...DEFAULT_SETTINGS, domains: [...DEFAULT_SETTINGS.domains], users: [] };
  const raw = await kv.get(SETTINGS_KEY);
  return raw ? normalizeSettings(raw) : { ...DEFAULT_SETTINGS, domains: [...DEFAULT_SETTINGS.domains], users: [] };
}

export async function saveSettings(env, settings) {
  const kv = getDashboardKv(env);
  if (!kv) throw new Error("KV nao configurado");
  const normalized = normalizeSettings(settings);
  await kv.put(SETTINGS_KEY, JSON.stringify(normalized));
  return normalized;
}

export function toPublicUser(user) {
  return {
    id: user.id,
    nome: user.nome,
    username: user.username,
    role: user.role,
    allowedDomains: uniqueStrings(user.allowedDomains, normalizeDomain),
    commissionPercent: normalizeCommissionPercent(user.commissionPercent),
    active: user.active !== false,
    lastLoginAt: user.lastLoginAt || null,
  };
}

export function filterUrlsByDomains(urls, allowedDomains) {
  if (!Array.isArray(allowedDomains) || !allowedDomains.length) return [];
  const allowed = new Set(allowedDomains.map(normalizeDomain));
  return (Array.isArray(urls) ? urls : []).filter((item) => {
    const host = extractHostname(item.url);
    return host && allowed.has(normalizeDomain(host));
  });
}

export function toPublicSettings(settings, session) {
  const normalized = normalizeSettings(settings);
  const isAdmin = session?.role === "admin";
  const allowedDomains = isAdmin
    ? normalized.domains
    : normalized.domains.filter((domain) =>
        (session?.allowedDomains || []).map(normalizeDomain).includes(normalizeDomain(domain))
      );

  return {
    domains: allowedDomains,
    metaAccountId: normalized.metaAccountId,
    metaTaxEnabled: normalized.metaTaxEnabled,
    metaTaxRatePercent: normalized.metaTaxRatePercent,
    metaTaxEffectiveDate: normalized.metaTaxEffectiveDate,
    metaTaxMode: normalized.metaTaxMode,
    reportType: normalized.reportType,
    includeAssets: normalized.includeAssets,
    showMessagesLtvTable: normalized.showMessagesLtvTable,
    messagesLtvExtraDays: normalized.messagesLtvExtraDays,
    nichos: normalized.nichos,
    urls: isAdmin ? normalized.urls : filterUrlsByDomains(normalized.urls, allowedDomains),
    users: isAdmin ? normalized.users.map(toPublicUser) : [],
  };
}
