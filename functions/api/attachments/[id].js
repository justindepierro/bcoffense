/**
 * GET /api/attachments/[id]
 * Serve one discussion attachment after proving that its post belongs to the
 * authenticated user's team. R2 key names alone are never authorization.
 */

import { getSessionFromRequest, withSecurityHeaders } from "../../_lib/auth.js";
import {
  isLegacyDiscussionAttachmentKey,
  normalizeDiscussionAttachmentId,
  resolveAuthorizedDiscussionAttachmentKey,
} from "../../_lib/discussion-attachments.js";
import { normalizeImageContentType } from "../../_lib/image-media.js";

function attachmentResponse(message, status) {
  return withSecurityHeaders(new Response(message, {
    status,
    headers: { "Cache-Control": "no-store" },
  }));
}

export async function onRequestGet(context) {
  const { request, env, params } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) return attachmentResponse("Unauthorized", 401);
  if (!env.DB || !env.CLIPS) return attachmentResponse("Storage not configured", 503);

  // Accept the historic optional file extension in the route, but only use the
  // UUID as the database identifier. The stored D1 key decides the exact R2
  // object after ownership has been verified.
  const attachmentId = normalizeDiscussionAttachmentId(params.id);
  if (!attachmentId) return attachmentResponse("Not found", 404);

  const teamId = String(session.teamId || "").trim();
  if (!teamId) return attachmentResponse("Not found", 404);

  const isStaff = session.role === "admin" || session.role === "coach";
  let attachment;
  try {
    // The join is the authorization boundary. It prevents a valid session from
    // using an attachment UUID to fetch an object owned by a post in another
    // team. Players also cannot retrieve an attachment from a hidden/rejected
    // post; staff retain moderation-preview access within their own team.
    attachment = await env.DB.prepare(
      `SELECT a.id, a.r2_key
       FROM post_attachments a
       JOIN discussion_posts p ON p.id = a.post_id
       JOIN play_threads t ON t.id = p.thread_id
       WHERE a.id = ?
         AND t.team_id = ?
         AND p.deleted_at IS NULL
         AND (? = 1 OR p.moderation_status = 'approved')
       LIMIT 1`,
    ).bind(attachmentId, teamId, isStaff ? 1 : 0).first();
  } catch (err) {
    console.error("Attachment authorization lookup failed:", err);
    return attachmentResponse("Attachment service unavailable", 503);
  }

  // A 404 is deliberate: callers must not be able to enumerate attachment IDs
  // or learn whether a cross-team object exists.
  if (!attachment?.r2_key) return attachmentResponse("Not found", 404);

  const r2Key = resolveAuthorizedDiscussionAttachmentKey(teamId, attachmentId, attachment.r2_key);
  if (!r2Key) return attachmentResponse("Not found", 404);

  let object;
  try {
    object = await env.CLIPS.get(r2Key);
  } catch (err) {
    console.error("Attachment R2 read failed:", err);
    return attachmentResponse("Attachment service unavailable", 503);
  }
  if (!object) return attachmentResponse("Not found", 404);

  // Legacy keys were global. Their custom metadata is the additional proof
  // that a pre-namespacing object belongs to this team; if that proof is absent
  // we fail closed and let a coach re-upload it rather than guessing across
  // tenants. New keys are self-scoped by their immutable team path.
  if (
    isLegacyDiscussionAttachmentKey(attachmentId, r2Key)
    && String(object.customMetadata?.teamId || "").trim() !== teamId
  ) {
    return attachmentResponse("Not found", 404);
  }

  // These URLs are identical across browser accounts, so authenticated media
  // must never be retained in the browser HTTP cache after a user signs out or
  // switches teams on a shared device.
  const imageContentType = normalizeImageContentType(object.httpMetadata?.contentType);
  return withSecurityHeaders(new Response(object.body, {
    status: 200,
    headers: {
      // Old attachment objects may carry arbitrary metadata. Serve unknown
      // bytes as a download, never as an executable same-origin document.
      "Content-Type": imageContentType || "application/octet-stream",
      ...(imageContentType ? {} : { "Content-Disposition": "attachment" }),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  }));
}
