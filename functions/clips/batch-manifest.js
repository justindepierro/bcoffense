// functions/clips/batch-manifest.js — Batch play/signal video clip manifest API
//   POST /clips/batch-manifest { sigs: string[] } → { manifests: { [sig]: clips[] } }
//
// Uses the same KV manifest records as /clips/manifest, but lets quiz launch
// and readiness checks avoid one request per signal component.

import { authJson } from "../_lib/auth.js";

const MAX_SIG_LENGTH = 400;
const MAX_BATCH_SIGS = 100;

function normalizeSig(value) {
  return String(value || "").trim();
}

function isValidSig(sig) {
  return Boolean(sig) && sig.length <= MAX_SIG_LENGTH;
}

function manifestKey(sig) {
  return `clips:${sig}`;
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

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch (_err) {
    return null;
  }
}

export async function onRequestPost(context) {
  const store = context.env && context.env.SYNC_KV;
  if (!store) {
    return authJson({ ok: false, error: "Clip manifest storage is not configured." }, { status: 503 });
  }

  const body = await readJsonBody(context.request);
  const sigs = [...new Set(
    (Array.isArray(body?.sigs) ? body.sigs : [])
      .map(normalizeSig)
      .filter(isValidSig),
  )].slice(0, MAX_BATCH_SIGS);

  const manifests = {};
  await Promise.all(sigs.map(async (sig) => {
    const value = await store.get(manifestKey(sig), { type: "json" });
    const entries = Array.isArray(value) ? value : [];
    manifests[sig] = entries.map(publicClip);
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
