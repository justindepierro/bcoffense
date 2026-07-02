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

const MAX_BYTES        = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES    = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const PREFIX           = "disc-attachments";

function uuid() {
  return crypto.randomUUID();
}

function extForType(mime) {
  if (mime === "image/png")  return "png";
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

  const type    = String(formData.get("type")    || "image").trim();
  const playId  = String(formData.get("playId")  || "").trim();
  const caption = String(formData.get("caption") || "").slice(0, 500).trim();

  if (type !== "markup" && type !== "image") {
    return authJson({ ok: false, error: "type must be 'markup' or 'image'." }, { status: 422 });
  }

  // ── Validate MIME type ──────────────────────────────────────────────────
  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return authJson(
      { ok: false, error: "Unsupported file type. Use JPEG, PNG, or WebP." },
      { status: 415 },
    );
  }

  // ── Validate size ───────────────────────────────────────────────────────
  const arrayBuffer = await file.arrayBuffer();
  const sizeBytes   = arrayBuffer.byteLength;
  if (sizeBytes > MAX_BYTES) {
    return authJson(
      { ok: false, error: `File too large. Maximum is ${MAX_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }
  if (sizeBytes < 100) {
    return authJson({ ok: false, error: "File appears to be empty." }, { status: 422 });
  }

  // ── Upload to R2 ────────────────────────────────────────────────────────
  const id     = uuid();
  const ext    = extForType(mimeType);
  const r2Key  = `${PREFIX}/${id}.${ext}`;

  try {
    await env.CLIPS.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: mimeType },
      customMetadata: {
        uploadedBy: session.userId,
        teamId:     session.teamId || "",
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
      r2_key:  r2Key,
      type,
      caption: caption || null,
      playId:  playId  || null,
      sizeBytes,
    }),
  );
}
