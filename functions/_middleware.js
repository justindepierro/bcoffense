import {
  authJson,
  getSessionFromRequest,
  isAuthRoute,
  renderLoginPage,
  withSecurityHeaders,
} from "./_lib/auth.js";
import { canManagedCoachWrite, hasCoachPermission, isManagedCoachSession } from "./_lib/staff-access.js";

function isUnsafeMethod(method) {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

function canManagedCoachUseWriteRoute(session, pathname) {
  // Account/session and device subscription work are personal, not workspace
  // editing. Keep them usable for every managed coach.
  if (pathname === "/auth/logout" || pathname.startsWith("/api/account/") || pathname.startsWith("/api/push/")) return true;

  // Collaboration is deliberately available in the default coach profile.
  if (pathname.startsWith("/api/questions")) return hasCoachPermission(session, "feature:questions");
  if (pathname.startsWith("/api/quiz-assignments")) return hasCoachPermission(session, "feature:quiz_assignments");
  if (pathname.startsWith("/api/plays/") && pathname.endsWith("/like")) return hasCoachPermission(session, "feature:comments");
  if (pathname.startsWith("/api/threads/") && !pathname.includes("/manage") && !pathname.includes("/official")) {
    return hasCoachPermission(session, "feature:comments");
  }
  if (pathname.startsWith("/api/posts/") && !pathname.includes("/official")) return hasCoachPermission(session, "feature:comments");
  if (pathname === "/api/notifications/broadcast") return hasCoachPermission(session, "feature:publish_team");
  if (pathname.startsWith("/api/notifications/") && !pathname.includes("/broadcast")) return true;

  return canManagedCoachWrite(session);
}

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
    if (isManagedCoachSession(session) && isUnsafeMethod(method) && !canManagedCoachUseWriteRoute(session, url.pathname)) {
      return authJson(
        { ok: false, error: "This coach account is view-only for that action. Ask an administrator to grant access." },
        { status: 403 },
      );
    }
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
