import { getSession, sessionDisplay } from "../_auth.js";

export async function onRequestGet(ctx) {
  const session = await getSession(ctx.request, ctx.env);
  if (!session) {
    return Response.json({ ok: false }, { status: 401 });
  }
  return Response.json({ ok: true, session: sessionDisplay(session) });
}
