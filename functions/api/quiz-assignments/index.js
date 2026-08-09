/** GET private assignments; POST creates homework or records a player attempt. */

import { getSessionFromRequest, authJson, withSecurityHeaders } from "../../_lib/auth.js";
import { getTeamId } from "../../_lib/d1-threads.js";
import { hasCoachPermission } from "../../_lib/staff-access.js";
import { RequestBodyError, readBoundedJsonObject } from "../../_lib/request-body.js";
import { createNotificationOutboxDeliveries } from "../../_lib/notification-outbox.js";
import { enqueueNotificationOutboxDeliveries } from "../../_lib/notification-outbox-queue.js";
import {
  archiveQuizAssignment, createQuizAssignment, getAssignmentPlayers, getCoachQuizAssignments,
  getActiveQuizAssignmentRecipientIds, getPendingQuizAssignmentInitialDispatches, getPlayerQuizAssignments, getQuizAssignmentForStaff, isQuizAssignmentStaff,
  markQuizAssignmentOpened, publishQuizAssignment, reconcileQuizAssignmentInitialDispatch, recordLegacyQuizAssignmentPractice, saveQuizAssignmentDraft,
} from "../../_lib/d1-quiz-assignments.js";

// Quiz payloads include a frozen set of up to 60 full play records and
// coach-authored questions. Keep enough headroom for the largest supported
// assignment snapshot, while still placing a firm finite bound before JSON
// parsing can buffer an attacker-controlled body.
const MAX_QUIZ_ASSIGNMENT_BODY_BYTES = 2 * 1024 * 1024;
const MAX_QUIZ_ASSIGNMENT_ACTION_LENGTH = 32;
const REMINDER_EVENT_BUCKET_SECONDS = 5 * 60;
// Each marker recovery performs several D1 reads/writes plus a bounded Queue
// wake-up. Keep a staff-page repair pass below D1 Free's invocation budget;
// the delivery Worker cron continues the same durable backlog automatically.
const INITIAL_DISPATCH_RECONCILE_LIMIT = 3;

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

async function shortEventHash(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].slice(0, 16).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function homeworkEventKey(teamId, assignmentId, eventType, now) {
  const bucket = eventType === "reminded" ? Math.floor(now / REMINDER_EVENT_BUCKET_SECONDS) : "initial";
  const digest = await shortEventHash(`${teamId}\u0000${assignmentId}\u0000${eventType}\u0000${bucket}`);
  return `quiz-homework:${eventType}:${digest}`;
}

function homeworkBodyCopy(assignment) {
  const questionCount = Number(assignment?.items?.length || 0) + Number(assignment?.customQuestions?.length || 0);
  return `${questionCount} question${questionCount === 1 ? "" : "s"}${assignment?.dueAt ? " · check the due date" : ""}`;
}

async function queueHomeworkDelivery(context, teamId, assignment, recipientIds, eventType, bodyCopy, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const title = eventType === "reminded"
    ? `Reminder: ${assignment.title}`
    : `Homework: ${assignment.title}`;
  const storedEventKey = typeof options.eventKey === "string" ? options.eventKey.trim() : "";
  const outbox = await createNotificationOutboxDeliveries(context.env.DB, {
    teamId,
    eventKey: storedEventKey || await homeworkEventKey(teamId, assignment.id, eventType, now),
    deliveryKind: "quiz_homework",
    homeworkAssignmentId: assignment.id,
    homeworkDeliveryEventType: eventType,
    recipientUserIds: recipientIds,
    notification: {
      type: "quiz_homework",
      title,
      body: bodyCopy,
      deepLink: `quiz-assignment:${assignment.id}`,
      tag: `quiz-homework-${assignment.id}`,
    },
    now,
  });
  const queue = await enqueueNotificationOutboxDeliveries(context, context.env, outbox.pendingIds);
  return {
    recipients: outbox.recipientIds.length,
    outboxQueued: Number(queue?.queued || 0) || 0,
    outboxPending: Number(queue?.pending || 0) || 0,
    outboxScheduled: Boolean(queue?.scheduled),
  };
}

async function reconcileInitialHomeworkDelivery(context, teamId, created) {
  const dispatch = created?.initialDispatch;
  if (!dispatch?.eventKey) {
    return {
      recipients: Array.isArray(created?.recipientIds) ? created.recipientIds.length : 0,
      outboxQueued: 0,
      outboxPending: 0,
      outboxScheduled: false,
      recovered: Boolean(created?.recoveredPublish),
    };
  }
  const reconciliation = await reconcileQuizAssignmentInitialDispatch(
    context.env.DB,
    teamId,
    created.assignment.id,
  );
  const queue = await enqueueNotificationOutboxDeliveries(
    context,
    context.env,
    reconciliation.pendingOutboxIds,
  );
  return {
    recipients: Array.isArray(reconciliation.recipientIds)
      ? reconciliation.recipientIds.length
      : (Array.isArray(created?.recipientIds) ? created.recipientIds.length : 0),
    outboxQueued: Number(queue?.queued || 0) || 0,
    outboxPending: Number(queue?.pending || 0) || 0,
    outboxScheduled: Boolean(queue?.scheduled),
    recovered: Boolean(created?.recoveredPublish),
  };
}

async function reconcilePendingHomeworkDispatches(context, teamId) {
  const pending = await getPendingQuizAssignmentInitialDispatches(
    context.env.DB,
    teamId,
    INITIAL_DISPATCH_RECONCILE_LIMIT,
  );
  let reconciled = 0;
  for (const dispatch of pending) {
    try {
      const reconciliation = await reconcileQuizAssignmentInitialDispatch(
        context.env.DB,
        teamId,
        dispatch.assignmentId,
      );
      await enqueueNotificationOutboxDeliveries(context, context.env, reconciliation.pendingOutboxIds);
      reconciled += 1;
    } catch (error) {
      // Preserve the marker. A later staff refresh or a direct retry will
      // attempt the same idempotent stored event again.
      console.error("[quiz-assignment initial dispatch deferred]", {
        assignmentId: dispatch.assignmentId,
        error: String(error?.message || "Outbox reconciliation failed.").slice(0, 160),
      });
    }
  }
  return reconciled;
}

export async function onRequestGet(context) {
  const ctx = await sessionContext(context.request, context.env);
  if (ctx.error) return ctx.error;
  try {
    if (canManageQuizAssignments(ctx.session)) {
      // A direct initial publish can persist before an outbox dependency is
      // temporarily unavailable. Staff GET is a safe, authenticated repair
      // wake-up; each marker carries the original immutable event key.
      await reconcilePendingHomeworkDispatches(context, ctx.teamId);
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
      const bodyCopy = homeworkBodyCopy(assignment);
      const delivery = await queueHomeworkDelivery(context, ctx.teamId, assignment, recipients, "reminded", bodyCopy);
      return withSecurityHeaders(authJson({ ok: true, ...delivery }));
    }
    if (body.action === "save-draft") {
      const saved = await saveQuizAssignmentDraft(context.env.DB, ctx.teamId, ctx.session, body);
      return withSecurityHeaders(authJson({ ok: true, assignment: saved.assignment, recipients: saved.recipientIds.length }));
    }
    const created = body.action === "publish"
      ? await publishQuizAssignment(context.env.DB, ctx.teamId, ctx.session, body)
      : await createQuizAssignment(context.env.DB, ctx.teamId, ctx.session, body);
    const delivery = await reconcileInitialHomeworkDelivery(context, ctx.teamId, created);
    return withSecurityHeaders(authJson({ ok: true, assignment: created.assignment, ...delivery }));
  } catch (err) {
    const message = String(err?.message || "Could not save homework assignment.");
    const status = /Give the homework|Add a play|Choose at least|selected players|unavailable|missing/.test(message) ? 422 : 500;
    if (status === 500) console.error("[POST /api/quiz-assignments]", err);
    return authJson({ ok: false, error: message }, { status });
  }
}
