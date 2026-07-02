/**
 * GET    /api/moderation/terms  — list custom moderation terms for the team
 * POST   /api/moderation/terms  — add a custom term (admin/coach only)
 * DELETE /api/moderation/terms  — remove a custom term
 *
 * Body for POST: { term: string, type: "allowlist"|"blocked", category?: string, severity?: 1-4 }
 * Query for DELETE: ?id=<termId>
 *
 * "allowlist" — adds to the football context allowlist (term is allowed in play descriptions)
 * "blocked"   — increases severity of observed coded language
 *
 * This allows administrators to respond quickly to new slang or coded terms
 * without waiting for a code deployment.
 *
 * Terms should be reviewed regularly (at least monthly) to remove stale entries.
 * Last review date should be recorded in the moderation audit log.
 */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { getTeamId } from "../../_lib/d1-threads.js";

/** Normalize a term for storage (same basic pipeline as moderation.js normalize). */
function normalizeTerm(term) {
  return String(term || "")
    .toLowerCase()
    .replace(/[àáâãäå]/g, "a").replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i").replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
    .replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t").replace(/8/g, "b")
    .replace(/[@!$+|]/g, "")
    .replace(/[\s\-_]/g, "")
    .replace(/(.)\1{2,}/g, "$1$1")
    .trim();
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const session = await getSessionFromRequest(request, env);
  if (!session) return authJson({ ok: false, error: "Authentication required." }, { status: 401 });
  if (session.role !== "coach" && session.role !== "admin") {
    return authJson({ ok: false, error: "Coach access required." }, { status: 403 });
  }
  if (!env.DB) return authJson({ ok: false, error: "Database not configured." }, { status: 503 });

  const teamId = await getTeamId(env.DB, session);

  // ── GET — list terms ───────────────────────────────────────────────────────
  if (request.method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT id, term_display, term_normalized, type, category, severity, created_at
       FROM moderation_custom_terms WHERE team_id = ? ORDER BY created_at DESC LIMIT 200`,
    ).bind(teamId).all();
    return withSecurityHeaders(authJson({ ok: true, terms: rows.results || [] }));
  }

  // ── POST — add term ────────────────────────────────────────────────────────
  if (request.method === "POST") {
    let body = {};
    try {
      const ct = request.headers.get("Content-Type") || "";
      body = ct.includes("application/json") ? await request.json() : Object.fromEntries(await request.formData());
    } catch (_) {
      return authJson({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    const termDisplay = String(body.term || "").trim().slice(0, 80);
    if (!termDisplay) return authJson({ ok: false, error: "Term is required." }, { status: 422 });

    const type = String(body.type || "").trim();
    if (type !== "allowlist" && type !== "blocked") {
      return authJson({ ok: false, error: "type must be 'allowlist' or 'blocked'." }, { status: 422 });
    }

    const termNorm = normalizeTerm(termDisplay);
    if (!termNorm) return authJson({ ok: false, error: "Term normalized to empty string." }, { status: 422 });

    const category = type === "blocked" ? String(body.category || "profanity").trim() : null;
    const severity = type === "blocked" ? Math.min(4, Math.max(1, parseInt(body.severity || 3, 10))) : null;

    // Resolve creator ID
    let createdBy = session.d1UserId || null;
    if (!createdBy) {
      const email = `${session.username}@bcoffense.internal`;
      const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? LIMIT 1").bind(email).first();
      createdBy = user?.id || null;
    }

    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO moderation_custom_terms
         (id, team_id, term_display, term_normalized, type, category, severity, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, teamId, termDisplay, termNorm, type, category, severity, createdBy, now).run();

    return withSecurityHeaders(authJson({
      ok: true,
      term: { id, termDisplay, termNorm, type, category, severity },
    }));
  }

  // ── DELETE — remove term ───────────────────────────────────────────────────
  if (request.method === "DELETE") {
    const termId = url.searchParams.get("id") || "";
    if (!termId) return authJson({ ok: false, error: "id required." }, { status: 400 });
    await env.DB.prepare(
      "DELETE FROM moderation_custom_terms WHERE id = ? AND team_id = ?",
    ).bind(termId, teamId).run();
    return withSecurityHeaders(authJson({ ok: true }));
  }

  return authJson({ ok: false, error: "Method not allowed." }, { status: 405 });
}
