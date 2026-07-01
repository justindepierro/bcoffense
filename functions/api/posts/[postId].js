/**
 * PATCH  /api/posts/:postId  — edit post body, or set question state (action: "resolve"|"reopen")
 * DELETE /api/posts/:postId  — soft-delete post
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { editPost, deletePost, setQuestionState } from "../../_lib/d1-threads.js";
import { notifyOnQuestionResolved } from "../../_lib/d1-notifications.js";

export async function onRequest(context) {
  const { request, env, params } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const postId = String(params.postId || "").trim();
  if (!postId) return authJson({ ok: false, error: "Post ID required." }, { status: 400 });

  // ── DELETE — soft delete ──────────────────────────────────────────────────
  if (request.method === "DELETE") {
    const result = await deletePost(env.DB, postId, session);
    if (result.error) return authJson({ ok: false, error: result.error }, { status: 403 });
    return withSecurityHeaders(authJson({ ok: true }));
  }

  // ── PATCH — edit body or set question state ───────────────────────────────
  if (request.method === "PATCH") {
    let body = {};
    try {
      const ct = request.headers.get("Content-Type") || "";
      body = ct.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
    } catch (_) {
      return authJson({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    // Question state action (resolve / reopen)
    if (body.action === "resolve" || body.action === "reopen") {
      const newState = body.action === "resolve" ? "resolved" : "reopened";
      const result = await setQuestionState(env.DB, postId, newState, session);
      if (result.error) return authJson({ ok: false, error: result.error }, { status: 403 });

      // Notify question author when resolved (fire-and-forget)
      if (newState === "resolved") {
        const resolverName = session.label || session.username;
        // Look up the play_id via thread relationship
        const threadRow = await env.DB
          .prepare(
            `SELECT t.play_id FROM discussion_posts p
             JOIN play_threads t ON t.id = p.thread_id
             WHERE p.id = ? LIMIT 1`,
          )
          .bind(postId).first();
        if (threadRow?.play_id) {
          notifyOnQuestionResolved(env.DB, postId, resolverName, threadRow.play_id).catch(() => { });
        }
      }

      return withSecurityHeaders(authJson({ ok: true, questionState: result.questionState }));
    }

    const result = await editPost(env.DB, postId, body.body, session);
    if (result?.error) return authJson({ ok: false, error: result.error }, { status: 403 });
    return withSecurityHeaders(
      authJson({
        ok: true,
        post: {
          id: result.id,
          body: result.body,
          editedAt: result.edited_at,
        },
      }),
    );
  }

  return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });
}
