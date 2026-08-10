/**
 * POST /api/telemetry
 *
 * Sampled Web Vitals / performance field data from authenticated sessions.
 * No PII: the authenticated session role + coarse device context + numeric
 * vitals only. Fire-and-forget: always returns fast and never disrupts the app.
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../_lib/auth.js";
import { getPrimaryTeamId } from "../_lib/team-context.js";
import { RequestBodyError, readBoundedJsonObject } from "../_lib/request-body.js";

const MAX_TELEMETRY_BODY_BYTES = 4 * 1024;
const MAX_TEXT_LENGTH = 40;
const VALID_RATINGS = new Set(["good", "needs-improvement", "poor"]);

// Clamp to a sane range; anything outside is treated as absent (never trusted).
function numberOrNull(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 100) / 100;
}

function shortText(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, MAX_TEXT_LENGTH).replace(/[^\w .:/-]/g, "");
  return cleaned || null;
}

function ratingOrNull(value) {
  return VALID_RATINGS.has(value) ? value : null;
}

const NO_CONTENT = () => withSecurityHeaders(new Response(null, { status: 204 }));

export async function onRequestPost(context) {
  const { request, env } = context;

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!env.DB) return NO_CONTENT();

  let body;
  try {
    body = await readBoundedJsonObject(request, { maxBytes: MAX_TELEMETRY_BODY_BYTES });
  } catch (err) {
    if (err instanceof RequestBodyError && err.status === 413) {
      return authJson({ ok: false, error: "Telemetry payload too large." }, { status: 413 });
    }
    return authJson({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const v = body && typeof body === "object" ? body : {};
  const lcp = numberOrNull(v.lcp, 0, 600000);
  const inp = numberOrNull(v.inp, 0, 600000);
  const cls = numberOrNull(v.cls, 0, 100);
  const fcp = numberOrNull(v.fcp, 0, 600000);
  const ttfb = numberOrNull(v.ttfb, 0, 600000);

  // An empty beacon (no usable vitals) is accepted but not stored.
  if (lcp === null && inp === null && cls === null && fcp === null && ttfb === null) {
    return NO_CONTENT();
  }

  let teamId = null;
  try {
    teamId = await getPrimaryTeamId(env);
  } catch (_) {
    teamId = null;
  }

  try {
    await env.DB.prepare(
      `INSERT INTO telemetry_vitals
        (received_at, team_id, role, tab, device, connection, nav_type,
         lcp, inp, cls, fcp, ttfb, lcp_rating, inp_rating, cls_rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        Math.floor(Date.now() / 1000),
        teamId,
        shortText(session.role) || "unknown",
        shortText(v.tab),
        shortText(v.device),
        shortText(v.connection),
        shortText(v.navType),
        lcp,
        inp,
        cls,
        fcp,
        ttfb,
        ratingOrNull(v.lcpRating),
        ratingOrNull(v.inpRating),
        ratingOrNull(v.clsRating),
      )
      .run();
  } catch (_) {
    // Telemetry must never disrupt the app; swallow storage errors quietly.
    return NO_CONTENT();
  }

  return NO_CONTENT();
}
