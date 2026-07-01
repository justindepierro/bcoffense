/**
 * POST /api/posts/:postId/react
 * Toggle a reaction on a post. Body: { reaction_key: "thumbs_up"|"football"|"same_question"|"helpful" }
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../../_lib/auth.js";
import { toggleReaction } from "../../../_lib/d1-threads.js";

export async function onRequestPost(context) {
  const { request, env, params } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const postId = String(params.postId || "").trim();
  if (!postId) return authJson({ ok: false, error: "Post ID required." }, { status: 400 });

  // D1 user ID is required to react (staff get synthetic IDs from thread creation)
  const userId = await resolveUserId(env.DB, session);
  if (!userId) return authJson({ ok: false, error: "Account required to react." }, { status: 403 });

  let body = {};
  try {
    const ct = request.headers.get("Content-Type") || "";
    body = ct.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
  } catch (_) {
    return authJson({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const reactionKey = String(body.reaction_key || "").trim();
  if (!reactionKey) return authJson({ ok: false, error: "reaction_key required." }, { status: 422 });

  const result = await toggleReaction(env.DB, postId, userId, reactionKey);
  if (result.error) return authJson({ ok: false, error: result.error }, { status: 422 });

  return withSecurityHeaders(authJson({ ok: true, added: result.added, reactions: result.reactions }));
}

async function resolveUserId(db, session) {
  if (session.d1UserId) return session.d1UserId;
  const email = `${session.username}@bcoffense.internal`;
  const existing = await db.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(email).first();
  return existing?.id || null;
}
