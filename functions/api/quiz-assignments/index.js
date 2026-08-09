/** GET private assignments; POST creates homework or records a player attempt. */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { getTeamId } from "../../_lib/d1-threads.js";
import { createNotification } from "../../_lib/d1-notifications.js";
import { sendPushToUser } from "../../_lib/d1-push.js";
import { hasCoachPermission } from "../../_lib/staff-access.js";
import { RequestBodyError, readBoundedJsonObject } from "../../_lib/request-body.js";
import {
  archiveQuizAssignment, createQuizAssignment, getAssignmentPlayers, getCoachQuizAssignments,
  getActiveQuizAssignmentRecipientIds, getPlayerQuizAssignments, getQuizAssignmentForStaff, isQuizAssignmentStaff, recordLegacyQuizAssignmentPractice,
  markQuizAssignmentOpened, publishQuizAssignment, recordQuizAssignmentDelivery, saveQuizAssignmentDraft,
} from "../../_lib/d1-quiz-assignments.js";

// Quiz payloads include a frozen set of up to 60 full play records and
// coach-authored questions. Keep enough headroom for the largest supported
// assignment snapshot, while still placing a firm finite bound before JSON
// parsing can buffer an attacker-controlled body.
const MAX_QUIZ_ASSIGNMENT_BODY_BYTES = 2 * 1024 * 1024;
const MAX_QUIZ_ASSIGNMENT_ACTION_LENGTH = 32;

function canManageQuizAssignments(session) {
  return isQuizAssignmentStaff(session) && hasCoachPermission(session, "feature:quiz_assignments");
}

async function sessionContext(request, env) {
  const session = await getSessionFromRequest(request, env);
  if (!session) return { error: authJson({ ok: false, error: "Authentication required." }, { status: 401 }) };
  if (!env.DB) return { error: authJson({ ok: false, error: "Database not configured." }, { status: 503 }) };
  const teamId = await getTeamId(env.DB, session);
  if (!teamId) return { error: authJson({ ok: false, error: "Team access is not configured." }, { status: 503 }) };
  return { session, teamId };
}

function quizAssignmentBodyError(error) {
  if (error instanceof RequestBodyError && error.status === 413) {
    return authJson({ ok: false, error: "Homework request is too large." }, { status: 413 });
  }
  if (error instanceof RequestBodyError && ["invalid_object", "invalid_action"].includes(error.code)) {
    return authJson({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  return authJson({ ok: false, error: "Invalid JSON." }, { status: 400 });
}

async function readQuizAssignmentBody(request) {
  const body = await readBoundedJsonObject(request, { maxBytes: MAX_QUIZ_ASSIGNMENT_BODY_BYTES });
  if (Object.prototype.hasOwnProperty.call(body, "action")) {
    if (typeof body.action !== "string" || body.action.length > MAX_QUIZ_ASSIGNMENT_ACTION_LENGTH) {
      throw new RequestBodyError("Invalid homework action.", 400, "invalid_action");
    }
  }
  return body;
}

export async function onRequestGet(context) {
  const ctx = await sessionContext(context.request, context.env);
  if (ctx.error) return ctx.error;
  try {
    if (canManageQuizAssignments(ctx.session)) {
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
  let body;
  try { body = await readQuizAssignmentBody(context.request); } catch (error) { return quizAssignmentBodyError(error); }
  try {
    if (body.action === "record-practice" || body.action === "record-attempt") {
      if (ctx.session.role !== "player" || !ctx.session.d1UserId) return authJson({ ok: false, error: "Player access required." }, { status: 403 });
      const result = await recordLegacyQuizAssignmentPractice(context.env.DB, ctx.teamId, ctx.session.d1UserId, body);
      return withSecurityHeaders(authJson({ ok: true, result }));
    }
    if (body.action === "record-open") {
      if (ctx.session.role !== "player" || !ctx.session.d1UserId) return authJson({ ok: false, error: "Player access required." }, { status: 403 });
      const result = await markQuizAssignmentOpened(context.env.DB, ctx.teamId, ctx.session.d1UserId, body.assignmentId);
      return withSecurityHeaders(authJson({ ok: true, result }));
    }
    if (!canManageQuizAssignments(ctx.session)) return authJson({ ok: false, error: "Coach quiz access required." }, { status: 403 });
    if (body.action === "archive") {
      const result = await archiveQuizAssignment(context.env.DB, ctx.teamId, body.assignmentId);
      return withSecurityHeaders(authJson({ ok: true, result }));
    }
    if (body.action === "resend") {
      const assignment = await getQuizAssignmentForStaff(context.env.DB, ctx.teamId, body.assignmentId);
      if (assignment.status !== "published") throw new Error("Only active homework can be resent.");
      const activeRecipientIds = new Set(
        await getActiveQuizAssignmentRecipientIds(context.env.DB, ctx.teamId, assignment.id),
      );
      const recipients = (assignment.recipients || [])
        .filter((recipient) => !recipient.completedAt && activeRecipientIds.has(recipient.userId))
        .map((recipient) => recipient.userId);
      if (!recipients.length) throw new Error("Everyone has completed this homework.");
      const bodyCopy = `${assignment.items.length + (assignment.customQuestions?.length || 0)} questions${assignment.dueAt ? " · check the due date" : ""}`;
      await Promise.allSettled(recipients.map(async (userId) => {
        await createNotification(context.env.DB, { userId, type: "quiz_homework", title: `Reminder: ${assignment.title}`, body: bodyCopy, deepLink: `quiz-assignment:${assignment.id}` });
        await sendPushToUser(context.env, context.env.DB, userId, { title: `Reminder: ${assignment.title}`, body: bodyCopy, url: "/", tag: `quiz-homework-${assignment.id}` }).catch(() => null);
      }));
      await recordQuizAssignmentDelivery(context.env.DB, assignment.id, recipients, "reminded");
      return withSecurityHeaders(authJson({ ok: true, recipients: recipients.length }));
    }
    if (body.action === "save-draft") {
      const saved = await saveQuizAssignmentDraft(context.env.DB, ctx.teamId, ctx.session, body);
      return withSecurityHeaders(authJson({ ok: true, assignment: saved.assignment, recipients: saved.recipientIds.length }));
    }
    const created = body.action === "publish"
      ? await publishQuizAssignment(context.env.DB, ctx.teamId, ctx.session, body)
      : await createQuizAssignment(context.env.DB, ctx.teamId, ctx.session, body);
    const questionCount = created.assignment.items.length + (created.assignment.customQuestions?.length || 0);
    const bodyCopy = `${questionCount} question${questionCount === 1 ? "" : "s"}${created.assignment.dueAt ? " · check the due date" : ""}`;
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
    await recordQuizAssignmentDelivery(context.env.DB, created.assignment.id, created.recipientIds, "assigned");
    return withSecurityHeaders(authJson({ ok: true, assignment: created.assignment, recipients: created.recipientIds.length }));
  } catch (err) {
    const message = String(err?.message || "Could not save homework assignment.");
    const status = /Give the homework|Add a play|Choose at least|selected players|unavailable|missing/.test(message) ? 422 : 500;
    if (status === 500) console.error("[POST /api/quiz-assignments]", err);
    return authJson({ ok: false, error: message }, { status });
  }
}
