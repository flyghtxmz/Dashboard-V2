import {
  SESSION_MAX_AGE_MS,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  hashPassword,
  sessionDisplay,
  verifyPassword,
} from "../_auth.js";
import { loadSettings, normalizeUsername, saveSettings } from "../_settings.js";
import { jsonResponse } from "../_utils.js";

function buildSessionCookie(token, request) {
  const isSecure = new URL(request.url).protocol === "https:";
  return [
    `__session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ...(isSecure ? ["Secure"] : []),
  ].join("; ");
}

function successResponse(session, token, request) {
  return new Response(
    JSON.stringify({ code: "success", session: sessionDisplay(session) }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": buildSessionCookie(token, request),
      },
    }
  );
}

async function loginAdmin(login, password, request, env) {
  const validEmail = String(env.AUTH_EMAIL || "").trim();
  const validPassword = String(env.AUTH_PASSWORD || "").trim();
  if (!validEmail || !validPassword) {
    return null;
  }

  if (normalizeUsername(login) !== normalizeUsername(validEmail) || password !== validPassword) {
    return null;
  }

  const session = {
    kind: "admin",
    role: "admin",
    nome: "Administrador",
    username: normalizeUsername(validEmail),
    email: validEmail,
    allowedDomains: ["*"],
    exp: Date.now() + SESSION_MAX_AGE_MS,
  };
  const token = await createSessionToken(session, env);
  return successResponse(session, token, request);
}

async function migrateLegacyPasswords(settings) {
  let changed = false;
  const users = [];

  for (const user of settings.users) {
    if (user.passwordHash || !user.password) {
      users.push(user);
      continue;
    }

    const hashed = await hashPassword(user.password);
    users.push({
      ...user,
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      passwordAlgo: hashed.algo,
      passwordIterations: hashed.iterations,
    });
    delete users[users.length - 1].password;
    changed = true;
  }

  return changed ? { ...settings, users } : settings;
}

export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const login = String(body.login || body.username || body.email || "").trim();
  const password = String(body.password || "");

  if (!login || !password) {
    return jsonResponse(400, {
      code: "error",
      message: "Informe usuario/e-mail e senha.",
    });
  }

  const adminResponse = await loginAdmin(login, password, request, env);
  if (adminResponse) return adminResponse;

  let settings = await loadSettings(env);
  settings = await migrateLegacyPasswords(settings);

  const user = settings.users.find(
    (item) => item.active !== false && item.username === normalizeUsername(login)
  );

  if (!user || !(await verifyPassword(password, user))) {
    return jsonResponse(401, {
      code: "error",
      message: "Usuario ou senha incorretos.",
    });
  }

  const nextSettings = {
    ...settings,
    users: settings.users.map((item) =>
      item.id === user.id ? { ...item, lastLoginAt: new Date().toISOString() } : item
    ),
  };
  await saveSettings(env, nextSettings);

  const session = {
    kind: "user",
    id: user.id,
    role: user.role,
    nome: user.nome || user.username,
    username: user.username,
    allowedDomains: Array.isArray(user.allowedDomains) ? [...user.allowedDomains] : [],
    exp: Date.now() + SESSION_MAX_AGE_MS,
  };
  const token = await createSessionToken(
    {
      kind: session.kind,
      id: session.id,
      role: session.role,
      nome: session.nome,
      username: session.username,
      userId: user.id,
      exp: session.exp,
    },
    env
  );

  return successResponse(session, token, request);
}
