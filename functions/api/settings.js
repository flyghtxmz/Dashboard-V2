import { hashPassword, requireSession } from "../_auth.js";
import {
  DEFAULT_SETTINGS,
  getDashboardKv,
  loadSettings,
  normalizeDomain,
  normalizeUserRole,
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
  const result = [];
  const seen = new Set();
  for (const item of Array.isArray(values) ? values : []) {
    const nome = String(item?.nome || "").trim();
    const slug = String(item?.slug || "").trim().toLowerCase();
    if (!nome || !slug) throw new Error("Todo nicho precisa de nome e ID.");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`ID de nicho invalido: ${slug}`);
    }
    if (seen.has(slug)) throw new Error(`ID de nicho duplicado: ${slug}`);
    seen.add(slug);
    result.push({
      id: String(item.id || `niche:${slug}`).trim(),
      nome,
      slug,
      paises: uniqueStrings(
        Array.isArray(item.paises) ? item.paises : item.pais ? [item.pais] : [],
        (value) => String(value || "").trim()
      ),
    });
  }
  return result;
}

function sanitizeUrls(values) {
  const result = [];
  for (const item of Array.isArray(values) ? values : []) {
    const nome = String(item?.nome || "").trim();
    const url = String(item?.url || "").trim();
    if (!nome || !url) throw new Error("Toda URL precisa de nome e endereco.");
    try {
      const parsed = new URL(url);
      if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error("protocol");
    } catch {
      throw new Error(`URL invalida: ${url}`);
    }
    result.push({
      id: String(item.id || crypto.randomUUID()).trim(),
      nome,
      url,
      nicho: item.nicho ? String(item.nicho).trim() : null,
    });
  }
  return result;
}

function sanitizeCommissionPercent(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
  return Math.min(numberValue, 100);
}

export async function sanitizeUsers(values, previousUsers, allowedDomains) {
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

    const role = normalizeUserRole(raw?.role);
    const userDomains = uniqueStrings(raw?.allowedDomains, normalizeDomain).filter((domain) =>
      allowedDomains.has(domain)
    );
    if (role !== "admin" && !userDomains.length) {
      throw new Error(`Selecione ao menos um dominio para ${username}.`);
    }

    normalizedUsers.push({
      id,
      nome,
      username,
      role,
      allowedDomains: role === "admin" ? [] : userDomains,
      commissionPercent: role === "admin" ? 0 : sanitizeCommissionPercent(raw?.commissionPercent),
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

export async function onRequest({ request, env }) {
  const kv = getDashboardKv(env);
  if (!kv) {
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
      const normalizedDomains = domains.length ? domains : [...DEFAULT_SETTINGS.domains];
      const allowedDomainSet = new Set(normalizedDomains);
      const metaAccountId = String(body.metaAccountId || "").trim();
      const metaTaxEnabled = body.metaTaxEnabled !== false;
      const metaTaxRatePercent = Math.min(99.99, Math.max(0, Number(body.metaTaxRatePercent ?? 12.15) || 0));
      const metaTaxEffectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.metaTaxEffectiveDate || ""))
        ? String(body.metaTaxEffectiveDate)
        : DEFAULT_SETTINGS.metaTaxEffectiveDate;
      const metaTaxMode = body.metaTaxMode === "included" ? "included" : "add";
      const reportType = body.reportType || "Analytical";
      const includeAssets = !!body.includeAssets;
      const showMessagesLtvTable = body.showMessagesLtvTable !== false;
      const messagesLtvExtraDays = Array.isArray(body.messagesLtvExtraDays)
        ? body.messagesLtvExtraDays
        : [];
      const nichos = sanitizeNichos(body.nichos);
      const urls = sanitizeUrls(body.urls);
      const nicheSlugs = new Set(nichos.map((item) => item.slug));
      const orphanUrl = urls.find((item) => item.nicho && !nicheSlugs.has(item.nicho));
      if (orphanUrl) throw new Error(`A URL ${orphanUrl.nome} referencia um nicho inexistente.`);
      const users = await sanitizeUsers(body.users, current.users, allowedDomainSet);

      const settings = await saveSettings(env, {
        domains: normalizedDomains,
        metaAccountId,
        metaTaxEnabled,
        metaTaxRatePercent,
        metaTaxEffectiveDate,
        metaTaxMode,
        reportType,
        includeAssets,
        showMessagesLtvTable,
        messagesLtvExtraDays,
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
}
