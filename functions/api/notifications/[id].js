/**
 * PATCH /api/notifications/:id — mark one notification read
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { markRead } from "../../_lib/d1-notifications.js";

async function resolveUserId(db, session) {
  if (session.d1UserId) return session.d1UserId;
  const email = `${session.username}@bcoffense.internal`;
  const row = await db.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(email).first();
  return row?.id || null;
}

export async function onRequestPatch(context) {
  const { env, params } = context;

  const session = await getSessionFromRequest(context.request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const notifId = String(params.id || "").trim();
  if (!notifId) return authJson({ ok: false, error: "Notification ID required." }, { status: 400 });

  const userId = await resolveUserId(env.DB, session);
  if (!userId) return authJson({ ok: false, error: "User not found." }, { status: 404 });

  await markRead(env.DB, notifId, userId);
  return withSecurityHeaders(authJson({ ok: true }));
}
