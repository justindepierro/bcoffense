// POST /images/batch-manifest { sigs } — current diagram metadata in one trip.

import { authJson } from "../_lib/auth.js";
import {
  imageManifestAvailability,
  publicImageManifest,
  resolveImageManifest,
} from "../_lib/image-media.js";
import { getMediaPrincipal } from "../_lib/media-access.js";
import { releaseAllowsDiagram } from "../_lib/player-release.js";

const MAX_SIG_LENGTH = 512;
const MAX_BATCH_SIGS = 100;

function normalizeSig(value) { return String(value || "").trim(); }
function isValidSig(sig) { return Boolean(sig) && sig.length <= MAX_SIG_LENGTH; }

export async function onRequestPost(context) {
  const bucket = context.env && context.env.CLIPS;
  if (!bucket) return authJson({ ok: false, error: "Image storage is not configured." }, { status: 503 });
  let body = null;
  try { body = await context.request.json(); } catch (_err) { /* invalid body becomes empty */ }
  const sigs = [...new Set((Array.isArray(body?.sigs) ? body.sigs : []).map(normalizeSig).filter(isValidSig))]
    .slice(0, MAX_BATCH_SIGS);
  const principal = await getMediaPrincipal(context.request, context.env);
  if (!principal.ok) return authJson({ ok: false, error: principal.error }, { status: principal.status });
  const allowedSigs = principal.session?.role === "player"
    ? sigs.filter((sig) => releaseAllowsDiagram(principal.release, sig))
    : sigs;
  const manifests = {};
  await Promise.all(allowedSigs.map(async (sig) => {
    try {
      const resolved = await resolveImageManifest(context.env, bucket, principal.teamId, sig);
      const available = await imageManifestAvailability(bucket, resolved.manifest);
      manifests[sig] = publicImageManifest(sig, resolved.manifest, {
        legacy: resolved.legacy,
        available,
      });
    } catch (_err) {
      manifests[sig] = { ok: false, sig, published: false, error: "manifest-read-failed" };
    }
  }));
  return authJson({ ok: true, count: allowedSigs.length, manifests });
}

export async function onRequestGet() {
  return authJson({ ok: false, error: "Use POST with a sigs array." }, { status: 405 });
}
