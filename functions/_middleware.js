import {
  authJson,
  getSessionFromRequest,
  isAuthRoute,
  renderLoginPage,
  withSecurityHeaders,
} from "./_lib/auth.js";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const request = context.request;

  // CSRF defense-in-depth: reject cross-origin state-changing requests before
  // they reach any handler. SameSite=Lax already blocks cross-site cookies on
  // these methods; this is a second layer that also covers the auth routes.
  // Only enforced when an Origin header is present (browsers always send it on
  // POST/PUT/DELETE/PATCH), so same-origin tooling without Origin is unaffected.
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) {
      return withSecurityHeaders(
        authJson({ ok: false, error: "Cross-origin request blocked." }, { status: 403 }),
      );
    }
  }

  if (isAuthRoute(url.pathname) || url.pathname.startsWith("/cdn-cgi/")) {
    return withSecurityHeaders(await context.next());
  }

  const session = await getSessionFromRequest(context.request, context.env);
  if (session) {
    return withSecurityHeaders(await context.next());
  }

  const acceptsHtml = (context.request.headers.get("Accept") || "").includes("text/html");
  if (context.request.method === "GET" && acceptsHtml) {
    return renderLoginPage({ next: `${url.pathname}${url.search}` });
  }

  return authJson(
    { ok: false, error: "Authentication required." },
    { status: 401 },
  );
}
