export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
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

export async function safeJson(response) {
  try {
    return await response.json();
  } catch (e) {
    return {};
  }
}
