export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return {};
  }
}

export function getQuery(request) {
  return new URL(request.url).searchParams;
}

export function getJoinadsToken(env) {
  return env.JOINADS_ACCESS_TOKEN;
}

export function getMetaToken(env) {
  return env.META_ACCESS_TOKEN || env.META_TOKEN;
}

export function getMetaAppId(env) {
  return env.META_APP_ID;
}

export function getMetaAppSecret(env) {
  return env.META_APP_SECRET;
}

export function getMessenleadBaseUrl(env) {
  return env.MESSENLEAD_API_BASE_URL;
}

export function getMessenleadToken(env) {
  return env.MESSENLEAD_API_TOKEN;
}

export async function safeJson(response) {
  try {
    return await response.json();
  } catch (e) {
    return {};
  }
}
