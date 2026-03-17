import { hashPassword, requireSession } from "../_auth.js";
import {
  DEFAULT_SETTINGS as BASE_DEFAULT_SETTINGS,
  getDashboardKv,
  loadSettings,
  normalizeDomain,
  normalizeUsername,
  saveSettings,
  toPublicSettings,
} from "../_settings.js";
import { jsonResponse } from "../_utils.js";

function uniqueStrings(values, normalizer = (value) => String(value || "").trim()) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizer(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function sanitizeNichos(values) {
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

function sanitizeUrls(values) {
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

async function sanitizeUsers(values, previousUsers, allowedDomains) {
  const seenUsernames = new Set();
  const previousById = new Map((previousUsers || []).map((item) => [item.id, item]));
  const normalizedUsers = [];

  for (const raw of Array.isArray(values) ? values : []) {
    const username = normalizeUsername(raw?.username);
    const nome = String(raw?.nome || "").trim();
    if (!username || !nome) {
      throw new Error("Todos os usuarios precisam de nome e username.");
    }
    if (seenUsernames.has(username)) {
      throw new Error(`Username duplicado: ${username}`);
    }
    seenUsernames.add(username);

    const id = String(raw?.id || "").trim() || crypto.randomUUID();
    const previous = previousById.get(id) || null;
    const password = String(raw?.password || "");
    let passwordHash = previous?.passwordHash || "";
    let passwordSalt = previous?.passwordSalt || "";
    let passwordAlgo = previous?.passwordAlgo || "";
    let passwordIterations = previous?.passwordIterations || 0;

    if (password) {
      const hashed = await hashPassword(password);
      passwordHash = hashed.hash;
      passwordSalt = hashed.salt;
      passwordAlgo = hashed.algo;
      passwordIterations = hashed.iterations;
    } else if (!previous?.passwordHash) {
      throw new Error(`Defina uma senha para o usuario ${username}.`);
    }

    const userDomains = uniqueStrings(raw?.allowedDomains, normalizeDomain).filter((domain) =>
      allowedDomains.has(domain)
    );
    if (!userDomains.length) {
      throw new Error(`Selecione ao menos um dominio para ${username}.`);
    }

    normalizedUsers.push({
      id,
      nome,
      username,
      role: raw?.role === "editor" ? "editor" : "gestor",
      allowedDomains: userDomains,
      active: raw?.active !== false,
      passwordHash,
      passwordSalt,
      passwordAlgo,
      passwordIterations,
      lastLoginAt: previous?.lastLoginAt || null,
    });
  }

  return normalizedUsers;
}

const KV_KEY = "dashboard_settings";

const DEFAULT_SETTINGS = {
  domains: [
    "remediototal.com.br",
    "br.remediototal.com.br",
    "es.remediototal.com.br",
    "intre.remediototal.com.br",
  ],
  metaAccountId: "",
  reportType: "Analytical",
  includeAssets: false,
  nichos: [],
  urls: [],
};

function getSettings(raw) {
  try {
    const parsed = JSON.parse(raw);
    return {
      domains: Array.isArray(parsed.domains) ? parsed.domains : DEFAULT_SETTINGS.domains,
      metaAccountId: parsed.metaAccountId || "",
      reportType: parsed.reportType || "Analytical",
      includeAssets: !!parsed.includeAssets,
      nichos: Array.isArray(parsed.nichos) ? parsed.nichos : [],
      urls: Array.isArray(parsed.urls) ? parsed.urls : [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function onRequest({ request, env }) {
  const kv2 = getDashboardKv(env);
  if (!kv2) {
    return jsonResponse(500, { code: "error", message: "KV nao configurado" });
  }

  const auth = await requireSession(request, env);
  if (!auth.ok) return auth.response;

  if (request.method === "GET") {
    const settings = await loadSettings(env);
    return jsonResponse(200, {
      code: "success",
      data: toPublicSettings(settings, auth.session),
    });
  }

  if (request.method === "POST") {
    if (auth.session.role !== "admin") {
      return jsonResponse(403, {
        code: "error",
        message: "Somente o administrador pode salvar configuracoes.",
      });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    try {
      const current = await loadSettings(env);
      const domains = uniqueStrings(body.domains, normalizeDomain);
      const normalizedDomains = domains.length ? domains : [...BASE_DEFAULT_SETTINGS.domains];
      const allowedDomainSet = new Set(normalizedDomains);
      const metaAccountId = String(body.metaAccountId || "").trim();
      const reportType = body.reportType || "Analytical";
      const includeAssets = !!body.includeAssets;
      const nichos = sanitizeNichos(body.nichos);
      const urls = sanitizeUrls(body.urls);
      const users = await sanitizeUsers(body.users, current.users, allowedDomainSet);

      const settings = await saveSettings(env, {
        domains: normalizedDomains,
        metaAccountId,
        reportType,
        includeAssets,
        nichos,
        urls,
        users,
      });

      return jsonResponse(200, {
        code: "success",
        data: toPublicSettings(settings, auth.session),
      });
    } catch (error) {
      return jsonResponse(400, {
        code: "error",
        message: error.message || "Erro ao salvar configuracoes.",
      });
    }
  }

  return jsonResponse(405, { code: "error", message: "Method not allowed" });

  const kv = env.CPA_RULES_KV || env.DASHBOARD_KV;

  if (!kv) {
    return Response.json({ code: "error", message: "KV nao configurado" }, { status: 500 });
  }

  if (request.method === "GET") {
    const raw = await kv.get(KV_KEY);
    return Response.json({ code: "success", data: raw ? getSettings(raw) : { ...DEFAULT_SETTINGS } });
  }

  if (request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch { /* ignore */ }

    const domains = Array.isArray(body.domains)
      ? body.domains.map((d) => String(d).trim()).filter(Boolean)
      : DEFAULT_SETTINGS.domains;
    const metaAccountId = (body.metaAccountId || "").trim();
    const reportType = body.reportType || "Analytical";
    const includeAssets = !!body.includeAssets;
    const nichos = Array.isArray(body.nichos)
      ? body.nichos.filter((n) => n && typeof n.nome === "string" && n.nome.trim())
          .map((n) => ({
            nome: n.nome.trim(),
            slug: (n.slug || "").trim(),
            paises: Array.isArray(n.paises) ? n.paises.map((p) => String(p).trim()).filter(Boolean) : (n.pais ? [String(n.pais).trim()] : []),
          }))
      : [];
    const urls = Array.isArray(body.urls)
      ? body.urls.filter((u) => u && typeof u.nome === "string" && u.nome.trim() && typeof u.url === "string" && u.url.trim())
          .map((u) => ({ nome: u.nome.trim(), url: u.url.trim(), nicho: u.nicho || null }))
      : [];

    const settings = { domains, metaAccountId, reportType, includeAssets, nichos, urls };
    await kv.put(KV_KEY, JSON.stringify(settings));
    return Response.json({ code: "success", data: settings });
  }

  return Response.json({ code: "error", message: "Method not allowed" }, { status: 405 });
}
