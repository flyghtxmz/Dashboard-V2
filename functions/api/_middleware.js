import { requireSession } from "../_auth.js";

const PUBLIC_PATHS = new Set([
  "/api/auth-login",
  "/api/auth-check",
  "/api/auth-logout",
  "/api/cpa-run",
]);

const ADMIN_OR_GESTOR_PATHS = new Set([
  "/api/camp-counters",
  "/api/domains",
  "/api/earnings",
  "/api/key-value",
  "/api/key-value-country",
  "/api/media-labels",
  "/api/messenlead-resolve",
  "/api/meta-campaign-create",
  "/api/meta-insights",
  "/api/meta-media",
  "/api/meta-pages",
  "/api/meta-pixels",
  "/api/super-filter",
  "/api/top-url",
]);

const OPEN_SESSION_PATHS = new Set([
  "/api/settings",
]);

function isAdminOnlyPath(pathname) {
  return pathname.startsWith("/api/meta-") || pathname === "/api/cpa-rules" || pathname === "/api/wp-create-admin";
}

export async function onRequest(context) {
  const pathname = new URL(context.request.url).pathname;

  if (PUBLIC_PATHS.has(pathname)) {
    return context.next();
  }

  if (OPEN_SESSION_PATHS.has(pathname)) {
    const auth = await requireSession(context.request, context.env);
    return auth.ok ? context.next() : auth.response;
  }

  if (ADMIN_OR_GESTOR_PATHS.has(pathname)) {
    const auth = await requireSession(context.request, context.env, {
      roles: ["admin", "gestor"],
    });
    return auth.ok ? context.next() : auth.response;
  }

  if (isAdminOnlyPath(pathname)) {
    const auth = await requireSession(context.request, context.env, {
      roles: ["admin"],
    });
    return auth.ok ? context.next() : auth.response;
  }

  return context.next();
}
