import { getSession, sessionDisplay } from "../_auth.js";

function parseCookies(header) {
  return Object.fromEntries(
    (header || "")
      .split(";")
      .map((c) => c.trim().split("="))
      .filter(([k]) => k)
      .map(([k, ...v]) => [k.trim(), decodeURIComponent(v.join("="))])
  );
}

export async function onRequestGet(ctx) {
  const session = await getSession(ctx.request, ctx.env);
  if (!session) {
    return Response.json({ ok: false }, { status: 401 });
  }
  return Response.json({ ok: true, session: sessionDisplay(session) });

  const { request, env } = ctx;
  const secret = env.AUTH_SECRET || "dashboard-secret-change-me-32ch!";

  const cookies = parseCookies(request.headers.get("Cookie"));
  const token   = cookies["__session"];

  if (!token) return Response.json({ ok: false }, { status: 401 });

  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) return Response.json({ ok: false }, { status: 401 });

  const payloadB64 = token.slice(0, dotIndex);
  const sigB64     = token.slice(dotIndex + 1);

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    const valid    = await crypto.subtle.verify(
      "HMAC", key, sigBytes, new TextEncoder().encode(payloadB64)
    );

    if (!valid) return Response.json({ ok: false }, { status: 401 });

    const payload = JSON.parse(atob(payloadB64));

    if (!payload.exp || payload.exp < Date.now()) {
      return Response.json({ ok: false, reason: "expired" }, { status: 401 });
    }

    return Response.json({ ok: true, email: payload.email });
  } catch {
    return Response.json({ ok: false }, { status: 401 });
  }
}
