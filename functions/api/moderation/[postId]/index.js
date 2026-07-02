/**
 * POST /api/moderation/:postId — coach moderation action on a post
 *
 * Body: {
 *   action:      "approve" | "reject" | "warn" | "edit_approve" | "mute" | "account_review"
 *   reason?:     string
 *   editedBody?: string          (required for edit_approve)
 *   muteDays?:   number 1-30     (for mute action; defaults to 1)
 * }
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../../_lib/auth.js";
import { getTeamId, moderatePostAction } from "../../../_lib/d1-threads.js";

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== "POST") return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (session.role !== "coach" && session.role !== "admin") {
    return authJson({ ok: false, error: "Coach access required." }, { status: 403 });
  }
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const postId = String(params.postId || "").trim();
  if (!postId) return authJson({ ok: false, error: "Post ID required." }, { status: 400 });

  let body = {};
  try {
    const ct = request.headers.get("Content-Type") || "";
    body = ct.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
  } catch (_) {
    return authJson({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const action = String(body.action || "").trim();
  const reason = String(body.reason || "").trim() || null;
  const editedBody = body.editedBody ? String(body.editedBody).trim() : null;
  const muteDays = body.muteDays ? parseInt(body.muteDays, 10) : 1;

  if (action === "edit_approve" && !editedBody) {
    return authJson({ ok: false, error: "editedBody is required for edit_approve." }, { status: 400 });
  }

  const moderatorId = await resolveModeratorId(env.DB, session);
  const result = await moderatePostAction(env.DB, postId, action, reason, moderatorId, { editedBody, muteDays });

  if (result.error) return authJson({ ok: false, error: result.error }, { status: 422 });
  return withSecurityHeaders(authJson({ ok: true, newStatus: result.newStatus }));
}

async function resolveModeratorId(db, session) {
  if (session.d1UserId) return session.d1UserId;
  const email = `${session.username}@bcoffense.internal`;
  const existing = await db.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(email).first();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    `INSERT INTO users (id, email, display_name, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  ).bind(id, email, session.label || session.username, session.role, now, now).run();
  return id;
}
