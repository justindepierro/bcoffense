// functions/clips/batch-manifest.js — Batch play/signal video clip manifest API
//   POST /clips/batch-manifest { sigs: string[] } → { manifests: { [sig]: clips[] } }
//
// Uses the same KV manifest records as /clips/manifest, but lets quiz launch
// and readiness checks avoid one request per signal component.

import { authJson } from "../_lib/auth.js";
import { getMediaPrincipal } from "../_lib/media-access.js";
import { releaseAllowsClip } from "../_lib/player-release.js";
import { readTeamClipManifest } from "../_lib/team-workspace.js";

const MAX_SIG_LENGTH = 400;
const MAX_BATCH_SIGS = 100;

function normalizeSig(value) {
  return String(value || "").trim();
}

function isValidSig(sig) {
  return Boolean(sig) && sig.length <= MAX_SIG_LENGTH;
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
  const principal = await getMediaPrincipal(context.request, context.env);
  if (!principal.ok) return authJson({ ok: false, error: principal.error }, { status: principal.status });
  const allowedSigs = principal.session?.role === "player"
    ? sigs.filter((sig) => releaseAllowsClip(principal.release, sig))
    : sigs;

  const manifests = {};
  await Promise.all(allowedSigs.map(async (sig) => {
    const { entries } = await readTeamClipManifest(store, context.env, principal.teamId, sig);
    manifests[sig] = entries.map(publicClip);
  }));

  return authJson({
    ok: true,
    count: allowedSigs.length,
    manifests,
  });
}

export async function onRequestGet() {
  return authJson({ ok: false, error: "Use POST with a sigs array." }, { status: 405 });
}
