// functions/images/batch-manifest.js — Batch published diagram status checks
//   POST /images/batch-manifest { sigs: string[] } → { manifests: { [sig]: status } }
//
// Returns metadata without streaming image bodies so player quiz/readiness
// paths can decide what to load without N one-at-a-time manifest requests.

import { authJson } from "../_lib/auth.js";

const MAX_SIG_LENGTH = 512;
const MAX_BATCH_SIGS = 100;

function normalizeSig(value) {
  return String(value || "").trim();
}

function isValidSig(sig) {
  return Boolean(sig) && sig.length <= MAX_SIG_LENGTH;
}

function r2Key(sig) {
  return `images/${sig}`;
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (_err) {
    return null;
  }
}

function publicImageStatus(sig, object) {
  if (!object) {
    return { ok: true, sig, published: false };
  }
  return {
    ok: true,
    sig,
    published: true,
    size: object.size || 0,
    contentType: object.httpMetadata?.contentType || "image/jpeg",
    uploadedAt: object.uploaded ? new Date(object.uploaded).toISOString() : "",
  };
}

export async function onRequestPost(context) {
  const bucket = context.env && context.env.CLIPS;
  if (!bucket) {
    return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });
  }

  const body = await readJsonBody(context.request);
  const sigs = [...new Set(
    (Array.isArray(body?.sigs) ? body.sigs : [])
      .map(normalizeSig)
      .filter(isValidSig),
  )].slice(0, MAX_BATCH_SIGS);

  const manifests = {};
  await Promise.all(sigs.map(async (sig) => {
    const object = await bucket.head(r2Key(sig));
    manifests[sig] = publicImageStatus(sig, object);
  }));

  return authJson({
    ok: true,
    count: sigs.length,
    manifests,
  });
}

export async function onRequestGet() {
  return authJson({ ok: false, error: "Use POST with a sigs array." }, { status: 405 });
}
