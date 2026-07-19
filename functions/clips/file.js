// functions/clips/file.js — Stream a play video clip from R2 with HTTP Range support
//   GET /clips/file?sig=<playSig>&id=<id>   (any authed role; players included)
//
// Looks up the clip in the per-play KV manifest (`clips:<sig>`) to resolve the
// R2 object key + content type, then streams the bytes. Range requests enable
// seeking/scrubbing in the <video> element.

import { authJson } from "../_lib/auth.js";
import { getMediaAccess } from "../_lib/media-access.js";
import { readTeamClipManifest } from "../_lib/team-workspace.js";

const MAX_SIG_LENGTH = 400;

function normalizeSig(value) {
  return String(value || "").trim();
}

function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader || "").trim());
  if (!match) return null;
  const hasStart = match[1] !== "";
  const hasEnd = match[2] !== "";
  if (!hasStart && !hasEnd) return null;

  let start;
  let end;
  if (!hasStart) {
    // Suffix range: last N bytes.
    const suffix = parseInt(match[2], 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = parseInt(match[1], 10);
    end = hasEnd ? parseInt(match[2], 10) : size - 1;
    if (!Number.isFinite(start)) return null;
    if (!Number.isFinite(end) || end >= size) end = size - 1;
  }
  if (start > end || start >= size || start < 0) return { invalid: true, size };
  return { start, end, length: end - start + 1, size };
}

export async function onRequestGet(context) {
  const bucket = context.env && context.env.CLIPS;
  const store = context.env && context.env.SYNC_KV;
  if (!bucket || !store) {
    return authJson({ ok: false, error: "Clip storage is not configured." }, { status: 503 });
  }

  const url = new URL(context.request.url);
  const sig = normalizeSig(url.searchParams.get("sig"));
  const id = normalizeSig(url.searchParams.get("id"));
  if (!sig || sig.length > MAX_SIG_LENGTH || !id) {
    return authJson({ ok: false, error: "A play signature and clip id are required." }, { status: 400 });
  }
  const access = await getMediaAccess(context.request, context.env, "clip", sig);
  if (!access.ok) return authJson({ ok: false, error: access.error }, { status: access.status });

  const { entries } = await readTeamClipManifest(store, context.env, access.teamId, sig);
  const entry = entries.find((item) => item.id === id);
  if (!entry) {
    return authJson({ ok: false, error: "Clip not found." }, { status: 404 });
  }

  const r2key = entry.r2key || `clips/${id}`;
  const head = await bucket.head(r2key);
  if (!head) {
    return authJson({ ok: false, error: "Clip data is missing." }, { status: 404 });
  }

  const size = head.size;
  const contentType = entry.contentType || head.httpMetadata?.contentType || "video/mp4";
  const rangeHeader = context.request.headers.get("Range");
  const baseHeaders = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    // Clip URLs are authorization-gated and not yet content-versioned in the
    // browser. Do not let a shared device retain bytes across sign-out or a
    // team switch; R2/edge still provides the durable performance layer.
    "Cache-Control": "private, no-store",
    "Vary": "Cookie",
  };

  if (rangeHeader) {
    const range = parseRange(rangeHeader, size);
    if (range && range.invalid) {
      return new Response(null, {
        status: 416,
        headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
      });
    }
    if (range) {
      const object = await bucket.get(r2key, {
        range: { offset: range.start, length: range.length },
      });
      if (!object || !object.body) {
        return authJson({ ok: false, error: "Clip data is missing." }, { status: 404 });
      }
      return new Response(object.body, {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
          "Content-Length": String(range.length),
        },
      });
    }
  }

  const object = await bucket.get(r2key);
  if (!object || !object.body) {
    return authJson({ ok: false, error: "Clip data is missing." }, { status: 404 });
  }
  return new Response(object.body, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
