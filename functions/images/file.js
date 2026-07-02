// functions/images/file.js — Play diagram image storage backed by R2
//   GET    /images/file?sig=<identityKey>   (any authed role including players)
//   PUT    /images/file?sig=<identityKey>   (admin/coach only)
//   DELETE /images/file?sig=<identityKey>   (admin/coach only)
//
// Images are stored in the CLIPS R2 bucket under the key `images/{sig}`.
// The sig must be the content-derived identity key (getPlayIdentityKey "tag"),
// NOT the device-local UUID, ensuring cross-device compatibility.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";

const MAX_SIG_LENGTH = 512;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function r2Key(sig) {
  return `images/${sig}`;
}

export async function onRequestGet(context) {
  const bucket = context.env && context.env.CLIPS;
  if (!bucket) {
    return authJson(
      { ok: false, error: "Image storage is not configured." },
      { status: 503 },
    );
  }

  const url = new URL(context.request.url);
  const sig = (url.searchParams.get("sig") || "").trim();
  if (!sig || sig.length > MAX_SIG_LENGTH) {
    return authJson(
      { ok: false, error: "A valid play signature is required." },
      { status: 400 },
    );
  }

  const object = await bucket.get(r2Key(sig));
  if (!object || !object.body) {
    return new Response(null, { status: 404 });
  }

  const contentType =
    object.httpMetadata?.contentType || "image/jpeg";
  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(object.size),
      "Cache-Control": "private, max-age=604800",
    },
  });
}

export async function onRequestPut(context) {
  const bucket = context.env && context.env.CLIPS;
  if (!bucket) {
    return authJson(
      { ok: false, error: "Image storage is not configured." },
      { status: 503 },
    );
  }

  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || (session.role !== "admin" && session.role !== "coach")) {
    return authJson(
      { ok: false, error: "Only coaches may upload images." },
      { status: 403 },
    );
  }

  const url = new URL(context.request.url);
  const sig = (url.searchParams.get("sig") || "").trim();
  if (!sig || sig.length > MAX_SIG_LENGTH) {
    return authJson(
      { ok: false, error: "A valid play signature is required." },
      { status: 400 },
    );
  }

  const contentType = context.request.headers.get("Content-Type") || "";
  if (!ALLOWED_TYPES.has(contentType)) {
    return authJson(
      { ok: false, error: "Unsupported image type. Use JPEG, PNG, or WebP." },
      { status: 415 },
    );
  }

  const body = await context.request.arrayBuffer();
  if (!body || body.byteLength === 0) {
    return authJson({ ok: false, error: "Empty image body." }, { status: 400 });
  }
  if (body.byteLength > MAX_IMAGE_BYTES) {
    return authJson(
      { ok: false, error: "Image exceeds 8 MB limit." },
      { status: 413 },
    );
  }

  await bucket.put(r2Key(sig), body, { httpMetadata: { contentType } });
  return authJson({ ok: true });
}

export async function onRequestDelete(context) {
  const bucket = context.env && context.env.CLIPS;
  if (!bucket) {
    return authJson(
      { ok: false, error: "Image storage is not configured." },
      { status: 503 },
    );
  }

  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || (session.role !== "admin" && session.role !== "coach")) {
    return authJson(
      { ok: false, error: "Only coaches may delete images." },
      { status: 403 },
    );
  }

  const url = new URL(context.request.url);
  const sig = (url.searchParams.get("sig") || "").trim();
  if (!sig || sig.length > MAX_SIG_LENGTH) {
    return authJson(
      { ok: false, error: "A valid play signature is required." },
      { status: 400 },
    );
  }

  await bucket.delete(r2Key(sig));
  return authJson({ ok: true });
}
