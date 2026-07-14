// functions/clips/manifest.js — Play video clip manifest API (Cloudflare R2 + KV)
//   GET    /clips/manifest?sig=<playSig>            → list clips for a play (any authed role)
//   POST   /clips/manifest?sig=<playSig>            → upload a clip (admin/coach only)
//   DELETE /clips/manifest?sig=<playSig>&id=<id>    → delete a clip (admin/coach only)
//
// Blobs live in the CLIPS R2 bucket (key: clips/<uuid>). A per-play manifest is
// stored in SYNC_KV under key `clips:<sig>` as a JSON array of clip metadata.

import { authJson, getSessionFromRequest } from "../_lib/auth.js";

const MAX_CLIP_BYTES = 25 * 1024 * 1024; // 25 MiB hard cap per clip
const MAX_CLIPS_PER_PLAY = 3;
const MAX_SIG_LENGTH = 400;
const MAX_LABEL_LENGTH = 120;

function getClipBucket(env) {
  return env && env.CLIPS;
}

function requireClipBucket(env) {
  const bucket = getClipBucket(env);
  if (!bucket) throw new Error("Clip storage (R2) is not configured.");
  return bucket;
}

function getManifestStore(env) {
  const store = env && env.SYNC_KV;
  if (!store) throw new Error("Clip manifest storage (KV) is not configured.");
  return store;
}

function manifestKey(sig) {
  return `clips:${sig}`;
}

function normalizeSig(value) {
  return String(value || "").trim();
}

function isValidSig(sig) {
  return Boolean(sig) && sig.length <= MAX_SIG_LENGTH;
}

function isReplaceOnlySig(sig) {
  return String(sig || "").trim().startsWith("signals/");
}

async function readManifest(store, sig) {
  const value = await store.get(manifestKey(sig), { type: "json" });
  return Array.isArray(value) ? value : [];
}

async function writeManifest(store, sig, entries) {
  if (!entries.length) {
    await store.delete(manifestKey(sig));
    return;
  }
  await store.put(manifestKey(sig), JSON.stringify(entries));
}

function publicClip(entry) {
  return {
    id: entry.id,
    label: entry.label || "",
    contentType: entry.contentType || "video/mp4",
    size: entry.size || 0,
    duration: entry.duration || 0,
    uploadedAt: entry.uploadedAt || "",
    uploadedBy: entry.uploadedBy || "",
  };
}

function decodeLabel(raw) {
  if (!raw) return "";
  let value = String(raw);
  try {
    value = decodeURIComponent(value);
  } catch (_err) {
    /* keep raw on malformed encoding */
  }
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, MAX_LABEL_LENGTH);
}

async function listClips(context) {
  const url = new URL(context.request.url);
  const sig = normalizeSig(url.searchParams.get("sig"));
  if (!isValidSig(sig)) {
    return authJson({ ok: false, error: "A valid play signature is required." }, { status: 400 });
  }
  const store = getManifestStore(context.env);
  const entries = await readManifest(store, sig);
  return authJson({ ok: true, clips: entries.map(publicClip) });
}

async function uploadClip(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || (session.role !== "admin" && session.role !== "coach")) {
    return authJson(
      { ok: false, error: "Only admin or coach can upload clips." },
      { status: 403 },
    );
  }

  const url = new URL(context.request.url);
  const sig = normalizeSig(url.searchParams.get("sig"));
  if (!isValidSig(sig)) {
    return authJson({ ok: false, error: "A valid play signature is required." }, { status: 400 });
  }

  const contentType = (context.request.headers.get("Content-Type") || "").split(";")[0].trim();
  if (!contentType.startsWith("video/")) {
    return authJson({ ok: false, error: "Clip must be a video file." }, { status: 415 });
  }

  const contentLength = Number(context.request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_CLIP_BYTES) {
    return authJson(
      { ok: false, error: "Clip is larger than the 25 MiB limit." },
      { status: 413 },
    );
  }

  const buffer = await context.request.arrayBuffer();
  if (!buffer.byteLength) {
    return authJson({ ok: false, error: "Clip file is empty." }, { status: 400 });
  }
  if (buffer.byteLength > MAX_CLIP_BYTES) {
    return authJson(
      { ok: false, error: "Clip is larger than the 25 MiB limit." },
      { status: 413 },
    );
  }

  const store = getManifestStore(context.env);
  const entries = await readManifest(store, sig);
  const replaceExisting = isReplaceOnlySig(sig);
  if (!replaceExisting && entries.length >= MAX_CLIPS_PER_PLAY) {
    return authJson(
      { ok: false, error: `This play already has the maximum of ${MAX_CLIPS_PER_PLAY} clips.` },
      { status: 409 },
    );
  }

  const bucket = requireClipBucket(context.env);
  const id = crypto.randomUUID();
  const r2key = `clips/${id}`;
  const label = decodeLabel(context.request.headers.get("X-Clip-Label"));
  const durationHeader = Number(context.request.headers.get("X-Clip-Duration") || 0);

  await bucket.put(r2key, buffer, {
    httpMetadata: { contentType },
  });

  const entry = {
    id,
    r2key,
    label,
    contentType,
    size: buffer.byteLength,
    duration: Number.isFinite(durationHeader) && durationHeader > 0 ? Math.round(durationHeader) : 0,
    uploadedAt: new Date().toISOString(),
    uploadedBy: session.username,
  };
  await writeManifest(store, sig, replaceExisting ? [entry] : [...entries, entry]);

  if (replaceExisting && entries.length) {
    await Promise.allSettled(
      entries.map((oldEntry) => bucket.delete(oldEntry.r2key || `clips/${oldEntry.id}`)),
    );
  }

  return authJson({ ok: true, clip: publicClip(entry) });
}

async function deleteClip(context) {
  const session = await getSessionFromRequest(context.request, context.env);
  if (!session || (session.role !== "admin" && session.role !== "coach")) {
    return authJson(
      { ok: false, error: "Only admin or coach can delete clips." },
      { status: 403 },
    );
  }

  const url = new URL(context.request.url);
  const sig = normalizeSig(url.searchParams.get("sig"));
  const id = normalizeSig(url.searchParams.get("id"));
  if (!isValidSig(sig) || !id) {
    return authJson({ ok: false, error: "A play signature and clip id are required." }, { status: 400 });
  }

  const store = getManifestStore(context.env);
  const entries = await readManifest(store, sig);
  const target = entries.find((entry) => entry.id === id);
  if (!target) {
    return authJson({ ok: false, error: "Clip not found." }, { status: 404 });
  }

  const bucket = requireClipBucket(context.env);
  await bucket.delete(target.r2key || `clips/${id}`);
  const remaining = entries.filter((entry) => entry.id !== id);
  await writeManifest(store, sig, remaining);

  return authJson({ ok: true, clips: remaining.map(publicClip) });
}

export async function onRequestGet(context) {
  return listClips(context);
}

export async function onRequestPost(context) {
  return uploadClip(context);
}

export async function onRequestDelete(context) {
  return deleteClip(context);
}
