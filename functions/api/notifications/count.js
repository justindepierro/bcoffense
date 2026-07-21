/**
 * GET /api/notifications/count — unread count only (lightweight poll)
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { countUnread, ensureNotificationUser } from "../../_lib/d1-notifications.js";

export async function onRequestGet(context) {
  const { env } = context;

  const session = await getSessionFromRequest(context.request, env);
  if (!session) return authJson({ ok: false, unread: 0 }, { status: 401 });
  if (!env.DB) return authJson({ ok: true, unread: 0 });

  const userId = await ensureNotificationUser(env.DB, session);
  const unread = userId ? await countUnread(env.DB, userId) : 0;

  return withSecurityHeaders(authJson({ ok: true, unread }));
}
