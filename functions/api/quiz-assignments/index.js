/** GET private assignments; POST creates homework or records a player attempt. */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { getTeamId } from "../../_lib/d1-threads.js";
import { createNotification } from "../../_lib/d1-notifications.js";
import { sendPushToUser } from "../../_lib/d1-push.js";
import {
  createQuizAssignment, getAssignmentPlayers, getCoachQuizAssignments,
  getPlayerQuizAssignments, isQuizAssignmentStaff, recordQuizAssignmentAttempt,
} from "../../_lib/d1-quiz-assignments.js";

async function sessionContext(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return { error: authJson({ ok: false, error: "Authentication required." }, { status: 401 }) };
  if (!env.DB) return { error: authJson({ ok: false, error: "Database not configured." }, { status: 503 }) };
  const teamId = await getTeamId(env.DB, session);
  if (!teamId) return { error: authJson({ ok: false, error: "Team access is not configured." }, { status: 503 }) };
  return { session, teamId };
}

export async function onRequestGet(context) {
  const ctx = await sessionContext(context.request, context.env);
  if (ctx.error) return ctx.error;
  try {
    if (isQuizAssignmentStaff(ctx.session)) {
      const [assignments, players] = await Promise.all([
        getCoachQuizAssignments(context.env.DB, ctx.teamId),
        getAssignmentPlayers(context.env.DB, ctx.teamId),
      ]);
      return withSecurityHeaders(authJson({ ok: true, role: "staff", assignments, players }));
    }
    if (!ctx.session.d1UserId) return authJson({ ok: true, role: "player", assignments: [] });
    const assignments = await getPlayerQuizAssignments(context.env.DB, ctx.teamId, ctx.session.d1UserId);
    return withSecurityHeaders(authJson({ ok: true, role: "player", assignments }));
  } catch (err) {
    console.error("[GET /api/quiz-assignments]", err);
    return authJson({ ok: false, error: "Could not load homework assignments." }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const ctx = await sessionContext(context.request, context.env);
  if (ctx.error) return ctx.error;
  let body = {};
  try { body = await context.request.json(); } catch (_) { return authJson({ ok: false, error: "Invalid JSON." }, { status: 400 }); }
  try {
    if (body.action === "record-attempt") {
      if (ctx.session.role !== "player" || !ctx.session.d1UserId) return authJson({ ok: false, error: "Player access required." }, { status: 403 });
      const result = await recordQuizAssignmentAttempt(context.env.DB, ctx.teamId, ctx.session.d1UserId, body);
      return withSecurityHeaders(authJson({ ok: true, result }));
    }
    if (!isQuizAssignmentStaff(ctx.session)) return authJson({ ok: false, error: "Coach access required." }, { status: 403 });
    const created = await createQuizAssignment(context.env.DB, ctx.teamId, ctx.session, body);
    const bodyCopy = `${created.assignment.items.length} play${created.assignment.items.length === 1 ? "" : "s"}${created.assignment.dueAt ? " · check the due date" : ""}`;
    await Promise.allSettled(created.recipientIds.map(async (userId) => {
      await createNotification(context.env.DB, {
        userId, type: "quiz_homework", title: `Homework: ${created.assignment.title}`,
        body: bodyCopy, deepLink: `quiz-assignment:${created.assignment.id}`,
      });
      await sendPushToUser(context.env, context.env.DB, userId, {
        title: `Homework: ${created.assignment.title}`, body: bodyCopy, url: "/",
        tag: `quiz-homework-${created.assignment.id}`,
      }).catch(() => null);
    }));
    return withSecurityHeaders(authJson({ ok: true, assignment: created.assignment, recipients: created.recipientIds.length }));
  } catch (err) {
    const message = String(err?.message || "Could not save homework assignment.");
    const status = /Give the homework|Add at least|Choose at least|selected players|unavailable|missing/.test(message) ? 422 : 500;
    if (status === 500) console.error("[POST /api/quiz-assignments]", err);
    return authJson({ ok: false, error: message }, { status });
  }
}
