/**
 * POST /api/account/logout-all — invalidate all sessions for the current player.
 *
 * After this call, all existing cookies for this user become invalid.
 * The caller should also clear their own cookie (handled client-side).
 *
 * Requires: active D1 player session
 */

import { getSessionFromRequest, authJson, clearSessionCookie, withSecurityHeaders } from "../../_lib/auth.js";
import { invalidateAllD1Sessions } from "../../_lib/d1-auth.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return withSecurityHeaders(authJson({ ok: false, error: "Authentication required." }, { status: 401 }));
  }
  if (!session.d1UserId) {
    return withSecurityHeaders(authJson({ ok: false, error: "Only player accounts support session management." }, { status: 403 }));
  }

  if (!env.DB) {
    return withSecurityHeaders(authJson({ ok: false, error: "Database unavailable." }, { status: 503 }));
  }

  await invalidateAllD1Sessions(env.DB, session.d1UserId);

  return withSecurityHeaders(
    authJson({ ok: true, message: "All sessions invalidated." }, {
      headers: { "Set-Cookie": clearSessionCookie() },
    }),
  );
}
