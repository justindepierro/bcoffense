/**
 * GET /api/threads/:playId/replies?parentId=:id&cursor=:cursor&limit=:n
 * Load more replies for a specific root post.
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../../_lib/auth.js";
import { getTeamId, getPostReplies } from "../../../_lib/d1-threads.js";

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== "GET") return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const url = new URL(request.url);
  const rootPostId = url.searchParams.get("parentId") || "";
  const afterId = url.searchParams.get("cursor") || null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 50);

  if (!rootPostId) return authJson({ ok: false, error: "parentId required." }, { status: 400 });

  const userId = session.d1UserId || null;
  const { replies, hasMore } = await getPostReplies(env.DB, rootPostId, { limit, afterId, userId });

  return withSecurityHeaders(authJson({
    ok: true,
    replies: replies.map((r) => ({
      id: r.id,
      postType: r.post_type,
      body: r.body,
      questionState: r.question_state,
      authorId: r.author_id,
      authorName: r.author_name,
      authorRole: r.author_role,
      createdAt: r.created_at,
      editedAt: r.edited_at || null,
      parentPostId: r.parent_post_id || null,
      rootPostId: r.root_post_id || null,
      depth: r.depth || 0,
      reactions: r.reactions || [],
    })),
    hasMore,
  }));
}
