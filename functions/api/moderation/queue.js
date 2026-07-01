/**
 * GET  /api/moderation/queue       — coach moderation queue (pending_review posts)
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { getTeamId, getPendingPosts } from "../../_lib/d1-threads.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET") return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (session.role !== "coach" && session.role !== "admin") {
    return authJson({ ok: false, error: "Coach access required." }, { status: 403 });
  }
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const teamId = await getTeamId(env.DB, session);
  const posts = await getPendingPosts(env.DB, teamId);

  return withSecurityHeaders(authJson({
    ok: true,
    posts: posts.map((p) => ({
      id: p.id,
      postType: p.post_type,
      body: p.body,
      authorName: p.author_name,
      authorRole: p.author_role,
      createdAt: p.created_at,
      moderationStatus: p.moderation_status,
      modAction: p.mod_action,
      modReason: p.mod_reason,
      playId: p.play_id,
    })),
    count: posts.length,
  }));
}
