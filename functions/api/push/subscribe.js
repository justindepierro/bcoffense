/**
 * POST /api/push/subscribe
 * Save a Web Push subscription for the authenticated user.
 *
 * Body: PushSubscription JSON { endpoint, keys: { p256dh, auth } }
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { savePushSubscription } from "../../_lib/d1-push.js";

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

  const { endpoint, keys } = body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return authJson(
      { ok: false, error: "Missing endpoint or keys." },
      { status: 422 },
    );
  }

  // Resolve the actual D1 user ID
  // session.d1UserId is set for player accounts; staff accounts use a synthetic internal user
  const userId = session.d1UserId;
  if (!userId) {
    // Staff accounts (coach/admin) don't have D1 user IDs — push is for players only for now
    return withSecurityHeaders(
      authJson({ ok: true, skipped: true, reason: "Staff accounts do not receive push notifications." }),
    );
  }

  const userAgent = request.headers.get("User-Agent") || null;

  try {
    await savePushSubscription(env.DB, userId, { endpoint, keys }, userAgent);
    return withSecurityHeaders(authJson({ ok: true }));
  } catch (err) {
    console.error("[push/subscribe] Error:", err);
    return authJson({ ok: false, error: "Failed to save subscription." }, { status: 500 });
  }
}
