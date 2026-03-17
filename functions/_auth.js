import { jsonResponse } from "./_utils.js";
import {
  extractHostname,
  loadSettings,
  normalizeDomain,
  normalizeUsername,
} from "./_settings.js";

const PASSWORD_ITERATIONS = 120000;
const PASSWORD_ALGO = "pbkdf2-sha256";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;

function base64FromBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesFromBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function parseCookies(header) {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((chunk) => chunk.trim().split("="))
      .filter(([key]) => key)
      .map(([key, ...rest]) => [key.trim(), decodeURIComponent(rest.join("="))])
  );
}

function getAuthSecret(env) {
  return env.AUTH_SECRET || "dashboard-secret-change-me-32ch!";
}

async function signPayload(payloadB64, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return base64FromBytes(new Uint8Array(sigBuf));
}

export async function createSessionToken(payload, env) {
  const payloadB64 = btoa(JSON.stringify(payload));
  const sigB64 = await signPayload(payloadB64, getAuthSecret(env));
  return `${payloadB64}.${sigB64}`;
}

async function verifySessionToken(token, env) {
  if (!token) return null;
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const payloadB64 = token.slice(0, dotIndex);
  const sigB64 = token.slice(dotIndex + 1);

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(getAuthSecret(env)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBytes = bytesFromBase64(sigB64);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;
    const payload = JSON.parse(atob(payloadB64));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function buildAdminSession(payload, env) {
  return {
    kind: "admin",
    role: "admin",
    nome: payload.nome || "Administrador",
    username: payload.username || normalizeUsername(env.AUTH_EMAIL || "admin"),
    email: payload.email || String(env.AUTH_EMAIL || "").trim(),
    allowedDomains: ["*"],
    exp: payload.exp,
  };
}

function buildUserSession(user, payloadExp) {
  return {
    kind: "user",
    id: user.id,
    role: user.role,
    nome: user.nome || user.username,
    username: user.username,
    email: null,
    allowedDomains: Array.isArray(user.allowedDomains) ? user.allowedDomains.map(normalizeDomain) : [],
    exp: payloadExp,
  };
}

export async function getSession(request, env) {
  const cookies = parseCookies(request.headers.get("Cookie"));
  const token = cookies["__session"];
  const payload = await verifySessionToken(token, env);
  if (!payload) return null;

  if (payload.kind === "admin" || payload.role === "admin") {
    const validEmail = String(env.AUTH_EMAIL || "").trim();
    if (!validEmail) return null;
    return buildAdminSession(payload, env);
  }

  const settings = await loadSettings(env);
  const user = settings.users.find(
    (item) =>
      item.active !== false &&
      ((payload.userId && item.id === payload.userId) ||
        (payload.username && item.username === normalizeUsername(payload.username)))
  );
  if (!user) return null;
  return buildUserSession(user, payload.exp);
}

export async function requireSession(request, env, options = {}) {
  const session = await getSession(request, env);
  if (!session) {
    return {
      ok: false,
      response: jsonResponse(401, { code: "error", message: "Sessao invalida ou expirada." }),
    };
  }

  const roles = Array.isArray(options.roles) ? options.roles : null;
  if (roles && !roles.includes(session.role)) {
    return {
      ok: false,
      response: jsonResponse(403, { code: "error", message: "Sem permissao para esta operacao." }),
    };
  }

  return { ok: true, session };
}

export function sessionDisplay(session) {
  return {
    kind: session.kind,
    id: session.id || null,
    role: session.role,
    nome: session.nome,
    username: session.username,
    email: session.email || null,
    allowedDomains: session.role === "admin" ? ["*"] : [...(session.allowedDomains || [])],
  };
}

export function isAdmin(session) {
  return session?.role === "admin";
}

export function filterRequestedDomains(session, domains) {
  const requested = (Array.isArray(domains) ? domains : [domains]).map(normalizeDomain).filter(Boolean);
  if (isAdmin(session)) return requested;
  const allowed = new Set((session?.allowedDomains || []).map(normalizeDomain));
  return requested.filter((domain) => allowed.has(domain));
}

export function canAccessDomain(session, domainOrUrl) {
  if (isAdmin(session)) return true;
  const allowed = new Set((session?.allowedDomains || []).map(normalizeDomain));
  const host = normalizeDomain(extractHostname(domainOrUrl) || domainOrUrl);
  return !!host && allowed.has(host);
}

export function requireDomainAccess(session, domains, options = {}) {
  const requested = (Array.isArray(domains) ? domains : [domains]).map((value) => String(value || "").trim()).filter(Boolean);
  if (!requested.length && options.allowEmpty) {
    return { ok: true, domains: [] };
  }
  if (isAdmin(session)) {
    return { ok: true, domains: requested.map(normalizeDomain) };
  }
  const allowed = filterRequestedDomains(session, requested);
  if (!allowed.length || allowed.length !== requested.length) {
    return {
      ok: false,
      response: jsonResponse(403, {
        code: "error",
        message: "Dominio sem permissao para este usuario.",
      }),
    };
  }
  return { ok: true, domains: allowed };
}

export async function hashPassword(password, saltB64 = null) {
  const salt = saltB64 ? bytesFromBase64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password || "")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PASSWORD_ITERATIONS,
    },
    key,
    256
  );
  return {
    hash: base64FromBytes(new Uint8Array(bits)),
    salt: base64FromBytes(salt),
    algo: PASSWORD_ALGO,
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(password, user) {
  if (!user?.passwordHash || !user?.passwordSalt) return false;
  const hashed = await hashPassword(password, user.passwordSalt);
  return hashed.hash === user.passwordHash;
}
