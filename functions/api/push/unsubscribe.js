/**
 * POST /api/push/unsubscribe
 * Remove a Web Push subscription for the authenticated user.
 *
 * Body: { endpoint: string }
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { removePushSubscription } from "../../_lib/d1-push.js";

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });
  }

  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  if (!env.DB) {
    return authJson({ ok: false, error: "Database not configured." }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return authJson({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const { endpoint } = body || {};
  if (!endpoint) {
    return authJson({ ok: false, error: "Missing endpoint." }, { status: 422 });
  }

  const userId = session.d1UserId;
  if (!userId) {
    return withSecurityHeaders(authJson({ ok: true })); // No-op for staff
  }

  try {
    await removePushSubscription(env.DB, userId, endpoint);
    return withSecurityHeaders(authJson({ ok: true }));
  } catch (err) {
    console.error("[push/unsubscribe] Error:", err);
    return authJson({ ok: false, error: "Failed to remove subscription." }, { status: 500 });
  }
}
