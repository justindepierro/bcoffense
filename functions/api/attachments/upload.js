/**
 * POST /api/attachments/upload
 * Upload a discussion attachment (markup screenshot or uploaded image) to R2.
 *
 * Accepts multipart/form-data with:
 *   file     — the image blob (JPEG / PNG / WebP, max 8 MB)
 *   type     — "markup" | "image"
 *   playId   — (optional) source play ID for markup type
 *   caption  — (optional) text caption
 *
 * Returns: { ok: true, id, r2_key, url }
 * Errors:  { ok: false, error }
 *
 * Auth: coach or admin only for markup; players may upload images when team
 * settings permit (future toggle — for now also coach/admin only).
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { discussionAttachmentR2Key } from "../../_lib/discussion-attachments.js";
import { validateImagePayload } from "../../_lib/image-media.js";
import { moderateContent } from "../../_lib/moderation.js";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
function uuid() {
  return crypto.randomUUID();
}

function extForType(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  }

  const isStaff = session.role === "coach" || session.role === "admin";
  if (!isStaff) {
    return authJson({ ok: false, error: "Coaches only." }, { status: 403 });
  }

  if (!env.CLIPS) {
    return authJson({ ok: false, error: "Storage not configured." }, { status: 503 });
  }

  // The session middleware resolves this from the authenticated D1 user or
  // the explicitly configured primary staff team. Never create an unscoped
  // attachment key: an attachment ID is later visible in thread responses.
  const teamId = String(session.teamId || "").trim();
  if (!teamId) {
    return authJson({ ok: false, error: "Team access is not configured for this account." }, { status: 503 });
  }

  // ── Parse multipart form ────────────────────────────────────────────────
  let formData;
  try {
    formData = await request.formData();
  } catch (_) {
    return authJson({ ok: false, error: "Invalid multipart form." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return authJson({ ok: false, error: "No file provided." }, { status: 422 });
  }

  const type = String(formData.get("type") || "image").trim();
  const playId = String(formData.get("playId") || "").trim();
  const caption = String(formData.get("caption") || "").slice(0, 500).trim();
  const requestedUploadId = String(formData.get("uploadId") || "").trim();

  if (type !== "markup" && type !== "image") {
    return authJson({ ok: false, error: "type must be 'markup' or 'image'." }, { status: 422 });
  }
  if (requestedUploadId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedUploadId)) {
    return authJson({ ok: false, error: "Invalid upload retry identifier." }, { status: 422 });
  }

  // ── Validate size ───────────────────────────────────────────────────────
  const arrayBuffer = await file.arrayBuffer();
  const sizeBytes = arrayBuffer.byteLength;
  if (sizeBytes > MAX_BYTES) {
    return authJson(
      { ok: false, error: `File too large. Maximum is ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }
  if (sizeBytes < 100) {
    return authJson({ ok: false, error: "File appears to be empty." }, { status: 422 });
  }

  // ── Validate file signature (magic bytes) ───────────────────────────────
  const imageValidation = validateImagePayload(arrayBuffer, file.type || "");
  if (!imageValidation.ok) {
    return authJson(
      { ok: false, error: imageValidation.error },
      { status: 415 },
    );
  }
  const mimeType = imageValidation.contentType;

  // ── Moderate caption text ───────────────────────────────────────────────
  if (caption) {
    const modResult = moderateContent(caption);
    if (modResult.outcome === "block") {
      return authJson(
        { ok: false, error: "Caption contains content that is not allowed." },
        { status: 422 },
      );
    }
  }

  // ── Upload to R2 ────────────────────────────────────────────────────────
  // A client retries a lost response with the same upload ID. R2 writes to
  // this immutable, team-scoped key are idempotent, so flaky mobile networks
  // cannot create a fresh orphan object for each retry.
  const id = requestedUploadId || uuid();
  const ext = extForType(mimeType);
  const r2Key = discussionAttachmentR2Key(teamId, id, ext);
  if (!r2Key) {
    return authJson({ ok: false, error: "Could not prepare team attachment storage." }, { status: 503 });
  }

  try {
    await env.CLIPS.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: mimeType },
      customMetadata: {
        uploadedBy: session.d1UserId || session.username || "",
        teamId,
        type,
        playId,
      },
    });
  } catch (err) {
    console.error("R2 upload failed:", err);
    return authJson({ ok: false, error: "Upload failed. Please try again." }, { status: 502 });
  }

  return withSecurityHeaders(
    authJson({
      ok: true,
      id,
      r2_key: r2Key,
      type,
      caption: caption || null,
      playId: playId || null,
      sizeBytes,
    }),
  );
}
