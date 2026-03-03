export async function onRequestPost(ctx) {
  const { request, env } = ctx;

  let body = {};
  try { body = await request.json(); } catch { /* ignore */ }

  const { email = "", password = "" } = body;

  const validEmail    = (env.AUTH_EMAIL    || "").trim();
  const validPassword = (env.AUTH_PASSWORD || "").trim();
  const secret        = env.AUTH_SECRET    || "dashboard-secret-change-me-32ch!";

  if (!validEmail || !validPassword) {
    return Response.json(
      { code: "error", message: "Servidor não configurado. Defina AUTH_EMAIL, AUTH_PASSWORD e AUTH_SECRET nas variáveis de ambiente do Cloudflare Pages." },
      { status: 500 }
    );
  }

  if (email.trim() !== validEmail || password !== validPassword) {
    return Response.json({ code: "error", message: "E-mail ou senha incorretos." }, { status: 401 });
  }

  // Build HMAC-SHA256 signed token: base64(payload).base64(signature)
  const payload   = JSON.stringify({ email: validEmail, exp: Date.now() + 8 * 60 * 60 * 1000 }); // 8 h
  const payloadB64 = btoa(payload);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  const token = `${payloadB64}.${sigB64}`;
  const isSecure = new URL(request.url).protocol === "https:";

  const cookie = [
    `__session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${8 * 60 * 60}`,
    ...(isSecure ? ["Secure"] : []),
  ].join("; ");

  return new Response(JSON.stringify({ code: "success" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie,
    },
  });
}
