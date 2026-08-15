// functions/clips/manifest.js — Play video clip manifest API (Cloudflare R2 + KV)
//   GET    /clips/manifest?sig=<playSig>            → list clips for a play (any authed role)
//   POST   /clips/manifest?sig=<playSig>            → upload a clip (admin/coach only)
//   DELETE /clips/manifest?sig=<playSig>&id=<id>    → delete a clip (admin/coach only)
//
// Blobs live in the CLIPS R2 bucket. New writes use an exact, team-scoped
// immutable key; older `clips/<uuid>` objects are recovery evidence. A
// per-play manifest is stored in SYNC_KV under a team-scoped key, with a
// primary-team legacy fallback during the transition.

import { authJson } from "../_lib/auth.js";
import { getMediaAccess, getStaffWriteAccess } from "../_lib/media-access.js";
import { readTeamClipManifest, writeTeamClipManifest } from "../_lib/team-workspace.js";

const MAX_CLIP_BYTES = 25 * 1024 * 1024; // 25 MiB hard cap per clip
const MAX_CLIPS_PER_PLAY = 3;
const MAX_SIG_LENGTH = 400;
const MAX_LABEL_LENGTH = 120;
// The client generates one opaque key before its first POST and preserves it
// with the durable media job. Limit this to a compact URL/header-safe shape so
// it can safely participate in an immutable R2 key and never becomes storage
// metadata supplied at arbitrary size.
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;

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

function normalizeSig(value) {
  return String(value || "").trim();
}

function isValidSig(sig) {
  return Boolean(sig) && sig.length <= MAX_SIG_LENGTH;
}

function isReplaceOnlySig(sig) {
  return String(sig || "").trim().startsWith("signals/");
}

function canonicalClipR2Key(teamId, id) {
  return `media/teams/${encodeURIComponent(String(teamId || "").trim())}/clips/${encodeURIComponent(String(id || "").trim())}`;
}

function readIdempotencyKey(request) {
  const key = String(request.headers.get("X-BC-Idempotency-Key") || "").trim();
  if (!key) return { key: "", valid: true };
  return { key, valid: IDEMPOTENCY_KEY_PATTERN.test(key) };
}

// A retry key must resolve to the same immutable media ID even when two tabs
// submit the same durable job at the same time. Scope the digest by team and
// media signature so a key reused in another play can never share an R2
// object with this one.
async function idempotentClipId(teamId, sig, idempotencyKey) {
  const source = JSON.stringify([
    String(teamId || "").trim(),
    String(sig || "").trim(),
    idempotencyKey,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `idem-${hex}`;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function idempotentClipObjectMetadata(entry, teamId, sig) {
  return {
    teamId: String(teamId || "").trim(),
    mediaSig: String(sig || "").trim(),
    idempotencyKey: String(entry?.idempotencyKey || "").trim(),
    checksum: String(entry?.checksum || "").trim().toLowerCase(),
    size: String(Math.max(0, Number(entry?.size || 0) || 0)),
    contentType: String(entry?.contentType || "").trim(),
  };
}

function isMatchingIdempotentClipEntry(entry, expected) {
  return Boolean(
    entry && expected &&
    String(entry.id || "").trim() === String(expected.id || "").trim() &&
    String(entry.r2key || "").trim() === String(expected.r2key || "").trim() &&
    String(entry.idempotencyKey || "").trim() === String(expected.idempotencyKey || "").trim() &&
    String(entry.checksum || "").trim().toLowerCase() === String(expected.checksum || "").trim().toLowerCase() &&
    Number(entry.size || 0) === Number(expected.size || 0) &&
    String(entry.contentType || "").trim() === String(expected.contentType || "").trim()
  );
}

function isMatchingIdempotentClipObject(object, expected, teamId, sig) {
  if (!object || !expected) return false;
  const metadata = object.customMetadata || {};
  const expectedMetadata = idempotentClipObjectMetadata(expected, teamId, sig);
  return Number(object.size || 0) === Number(expected.size || 0) &&
    String(metadata.teamId || "").trim() === expectedMetadata.teamId &&
    String(metadata.mediaSig || "").trim() === expectedMetadata.mediaSig &&
    String(metadata.idempotencyKey || "").trim() === expectedMetadata.idempotencyKey &&
    String(metadata.checksum || "").trim().toLowerCase() === expectedMetadata.checksum &&
    String(metadata.size || "").trim() === expectedMetadata.size &&
    String(metadata.contentType || "").trim() === expectedMetadata.contentType &&
    String(object.httpMetadata?.contentType || "").trim() === expectedMetadata.contentType;
}

async function putIdempotentClipOnce(bucket, entry, teamId, sig, buffer) {
  // R2's conditional PUT is the binary commit guard. A second tab may race us
  // to the same deterministic key, but it can never overwrite the first
  // bytes. The subsequent HEAD is deliberately strict: a known object only
  // becomes reusable when it proves the same team, media signature, retry
  // key, body hash, size, and content type.
  const stored = await bucket.put(entry.r2key, buffer, {
    onlyIf: new Headers({ "If-None-Match": "*" }),
    httpMetadata: { contentType: entry.contentType },
    customMetadata: idempotentClipObjectMetadata(entry, teamId, sig),
  });
  const object = await bucket.head(entry.r2key);
  return {
    created: Boolean(stored),
    object,
    matches: isMatchingIdempotentClipObject(object, entry, teamId, sig),
  };
}

/**
 * R2 deletion is intentionally narrower than manifest mutation. Historic
 * clip entries used `clips/<id>` (or no r2key at all), and those binaries are
 * retained as recovery evidence even after a team-scoped manifest supersedes
 * them. Only a key generated by this exact writer for this exact team/entry
 * may be garbage-collected.
 */
function isCurrentCanonicalClipEntry(entry, teamId) {
  const id = String(entry?.id || "").trim();
  const r2key = String(entry?.r2key || "").trim();
  return Boolean(id && r2key && r2key === canonicalClipR2Key(teamId, id));
}

async function deleteSupersededCanonicalClipObjects(bucket, teamId, entries, activeEntries = []) {
  const activeKeys = new Set((Array.isArray(activeEntries) ? activeEntries : [])
    .map((entry) => String(entry?.r2key || "").trim())
    .filter(Boolean));
  const keys = [...new Set((Array.isArray(entries) ? entries : [])
    .filter((entry) => isCurrentCanonicalClipEntry(entry, teamId))
    .filter((entry) => !activeKeys.has(entry.r2key))
    .map((entry) => entry.r2key))];
  if (!keys.length) return;
  // The manifest update is the commit point. A failed delete leaves a safe
  // orphan for recovery; it must never make an active manifest point at a
  // missing object.
  await Promise.allSettled(keys.map((key) => bucket.delete(key)));
}

async function readManifest(store, env, teamId, sig) {
  return readTeamClipManifest(store, env, teamId, sig);
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
  const access = await getMediaAccess(context.request, context.env, "clip", sig);
  if (!access.ok) return authJson({ ok: false, error: access.error }, { status: access.status });
  const store = getManifestStore(context.env);
  const { entries } = await readManifest(store, context.env, access.teamId, sig);
  return authJson({ ok: true, clips: entries.map(publicClip) });
}

async function uploadClip(context) {
  const access = await getStaffWriteAccess(context.request, context.env);
  if (!access.ok) return authJson({ ok: false, error: access.error }, { status: access.status });

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

  const idempotency = readIdempotencyKey(context.request);
  if (!idempotency.valid) {
    return authJson({ ok: false, error: "Clip upload retry identity is invalid." }, { status: 400 });
  }

  const store = getManifestStore(context.env);
  const { entries, legacy: legacyManifest } = await readManifest(store, context.env, access.teamId, sig);
  const replaceExisting = isReplaceOnlySig(sig);
  if (!idempotency.key && !replaceExisting && entries.length >= MAX_CLIPS_PER_PLAY) {
    return authJson(
      { ok: false, error: `This play already has the maximum of ${MAX_CLIPS_PER_PLAY} clips.` },
      { status: 409 },
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

  const bucket = requireClipBucket(context.env);
  const id = idempotency.key
    ? await idempotentClipId(access.teamId, sig, idempotency.key)
    : crypto.randomUUID();
  const r2key = canonicalClipR2Key(access.teamId, id);
  const label = decodeLabel(context.request.headers.get("X-Clip-Label"));
  const durationHeader = Number(context.request.headers.get("X-Clip-Duration") || 0);

  const entry = {
    id,
    r2key,
    label,
    contentType,
    size: buffer.byteLength,
    duration: Number.isFinite(durationHeader) && durationHeader > 0 ? Math.round(durationHeader) : 0,
    uploadedAt: new Date().toISOString(),
    uploadedBy: access.session.username,
    ...(idempotency.key ? {
      idempotencyKey: idempotency.key,
      checksum: await sha256Hex(buffer),
    } : {}),
  };
  if (!idempotency.key) {
    await bucket.put(r2key, buffer, {
      httpMetadata: { contentType },
    });
    await writeTeamClipManifest(store, access.teamId, sig, replaceExisting ? [entry] : [...entries, entry]);

    if (replaceExisting && entries.length && !legacyManifest) {
      await deleteSupersededCanonicalClipObjects(bucket, access.teamId, entries, [entry]);
    }

    return authJson({ ok: true, clip: publicClip(entry) });
  }

  // A key is not enough authority to reuse a media object. Read and hash the
  // replay body first, then require the manifest and immutable R2 object to
  // prove the same team, signature, key, bytes, size, and content type.
  const prior = entries.find((item) => String(item?.idempotencyKey || "").trim() === idempotency.key);
  if (prior && !isMatchingIdempotentClipEntry(prior, entry)) {
    return authJson({
      ok: false,
      error: "This retry identity belongs to a different clip. Refresh and upload the video again.",
    }, { status: 409 });
  }
  if (!prior && !replaceExisting && entries.length >= MAX_CLIPS_PER_PLAY) {
    return authJson(
      { ok: false, error: `This play already has the maximum of ${MAX_CLIPS_PER_PLAY} clips.` },
      { status: 409 },
    );
  }

  if (prior) {
    const existingObject = await bucket.head(r2key);
    if (existingObject && !isMatchingIdempotentClipObject(existingObject, entry, access.teamId, sig)) {
      return authJson({
        ok: false,
        error: "This retry identity points to different clip data. Refresh and upload the video again.",
      }, { status: 409 });
    }
    if (existingObject) {
      return authJson({ ok: true, clip: publicClip(prior), idempotent: true });
    }
  }

  const objectWrite = await putIdempotentClipOnce(bucket, entry, access.teamId, sig, buffer);
  if (!objectWrite.matches) {
    return authJson({
      ok: false,
      error: objectWrite.object
        ? "This retry identity points to different clip data. Refresh and upload the video again."
        : "Clip storage could not be verified. Retry safely when the connection is stable.",
    }, { status: objectWrite.object ? 409 : 502 });
  }

  if (prior) {
    // The manifest was already committed, but its exact immutable R2 object
    // disappeared. The conditional recreate above restored only matching bytes.
    return authJson({ ok: true, clip: publicClip(prior), idempotent: true, recovered: true });
  }

  if (objectWrite.created) {
    await writeTeamClipManifest(store, access.teamId, sig, replaceExisting ? [entry] : [...entries, entry]);

    if (replaceExisting && entries.length && !legacyManifest) {
      await deleteSupersededCanonicalClipObjects(bucket, access.teamId, entries, [entry]);
    }

    return authJson({ ok: true, clip: publicClip(entry) });
  }

  // Another request created this exact object first. It may already have
  // committed the manifest, or it may have stopped after R2. Re-read once and
  // only publish the verified object when no newer incompatible change exists.
  const latest = await readManifest(store, context.env, access.teamId, sig);
  const latestPrior = latest.entries.find((item) => String(item?.idempotencyKey || "").trim() === idempotency.key);
  if (latestPrior) {
    if (!isMatchingIdempotentClipEntry(latestPrior, entry)) {
      return authJson({
        ok: false,
        error: "This retry identity belongs to a different clip. Refresh and upload the video again.",
      }, { status: 409 });
    }
    return authJson({ ok: true, clip: publicClip(latestPrior), idempotent: true });
  }
  if (latest.entries.some((item) => String(item?.id || "").trim() === id)) {
    return authJson({
      ok: false,
      error: "This retry identity conflicts with an existing clip. Refresh and upload the video again.",
    }, { status: 409 });
  }
  if (replaceExisting && latest.entries.length && !latest.legacy) {
    return authJson({
      ok: false,
      error: "This signal clip changed before the retry could finish. Refresh and upload it again.",
    }, { status: 409 });
  }
  if (!replaceExisting && latest.entries.length >= MAX_CLIPS_PER_PLAY) {
    return authJson(
      { ok: false, error: `This play already has the maximum of ${MAX_CLIPS_PER_PLAY} clips.` },
      { status: 409 },
    );
  }

  await writeTeamClipManifest(
    store,
    access.teamId,
    sig,
    replaceExisting ? [entry] : [...latest.entries, entry],
  );
  return authJson({ ok: true, clip: publicClip(entry), idempotent: true, recovered: true });
}

async function deleteClip(context) {
  const access = await getStaffWriteAccess(context.request, context.env);
  if (!access.ok) return authJson({ ok: false, error: access.error }, { status: access.status });

  const url = new URL(context.request.url);
  const sig = normalizeSig(url.searchParams.get("sig"));
  const id = normalizeSig(url.searchParams.get("id"));
  if (!isValidSig(sig) || !id) {
    return authJson({ ok: false, error: "A play signature and clip id are required." }, { status: 400 });
  }

  const store = getManifestStore(context.env);
  const { entries, legacy: legacyManifest } = await readManifest(store, context.env, access.teamId, sig);
  const target = entries.find((entry) => entry.id === id);
  if (!target) {
    return authJson({ ok: false, error: "Clip not found." }, { status: 404 });
  }

  const remaining = entries.filter((entry) => entry.id !== id);
  await writeTeamClipManifest(store, access.teamId, sig, remaining);

  // Never delete any object reached through a legacy KV manifest. It may be
  // the only recoverable copy while the primary-team migration is incomplete.
  if (!legacyManifest) {
    const bucket = requireClipBucket(context.env);
    await deleteSupersededCanonicalClipObjects(bucket, access.teamId, [target], remaining);
  }

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
