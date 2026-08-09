/** Private, team-scoped player quiz assignments. */

import { createNotificationOutboxDeliveries } from "./notification-outbox.js";

const MAX_ITEMS = 60;
const MAX_RECIPIENTS = 300;
const STAFF_ROLES = new Set(["admin", "coach", "assistant", "assistant_coach"]);
const PUBLISHED_SOURCE_KINDS = new Set(["playbook", "script", "gameplan"]);
const QUIZ_MODES = new Set(["quick", "full", "job", "diagram"]);
const PLAY_FIELDS = new Set([
  "_id", "id", "type", "personnel", "formation", "formTag1", "formTag2", "under", "back",
  "shift", "motion", "protection", "lineCall", "play", "playTag1", "playTag2", "basePlay",
  "oneWord", "practiceFront", "practiceDefense", "practiceCoverage", "practiceBlitz", "practiceStunt",
  "respQ", "respT", "respH", "respY", "respZ", "respX", "respLT", "respLG", "respC", "respRG", "respRT", "respRB", "respTE", "respWR", "respNotes",
  "playerNotes", "notes", "playerHidden", "diagramKey", "diagramMediaId", "mediaId",
]);

function cleanText(value, max = 500) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanInt(value, min = 0, max = 100) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : min;
}

function cleanUnix(value) {
  if (!value) return null;
  const parsed = typeof value === "number" ? value : Date.parse(String(value));
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed > 100000000000 ? parsed / 1000 : parsed);
}

function nowUnix() { return Math.floor(Date.now() / 1000); }

function cleanRecipientIds(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((id) => cleanText(id, 128)).filter(Boolean))].slice(0, MAX_RECIPIENTS);
}

function cleanPublishedSourceKind(value) {
  const kind = cleanText(value, 20);
  return PUBLISHED_SOURCE_KINDS.has(kind) ? kind : "playbook";
}

function cleanQuizMode(value) {
  const mode = cleanText(value, 20);
  return QUIZ_MODES.has(mode) ? mode : "quick";
}

// Object key order is not meaningful in incoming JSON. Canonicalizing the
// immutable published payload means an interrupted publish can be retried
// safely without accepting a changed assignment as the same dispatch.
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publishedAssignmentInput(teamId, session, input, id, now) {
  return {
    id, teamId,
    title: cleanText(input.title, 120),
    instructions: cleanText(input.instructions, 800),
    items: safeItems(input.items),
    questionTypes: safeQuestionTypes(input.questionTypes),
    customQuestions: safeCustomQuestions(input.customQuestions),
    sourceKind: cleanPublishedSourceKind(input.sourceKind),
    sourceId: cleanText(input.sourceId, 180) || null,
    quizMode: cleanQuizMode(input.quizMode),
    positionKey: cleanText(input.positionKey, 40),
    requiredScore: cleanInt(input.requiredScore, 0, 100),
    dueAt: cleanUnix(input.dueAt),
    createdBy: session?.d1UserId || null,
    now,
  };
}

async function initialDispatchFor(assignment, requestedRecipientIds) {
  const eventKey = `quiz-homework:assigned:${await sha256Hex(`${assignment.teamId}\u0000${assignment.id}`)}`;
  const payloadFingerprint = await sha256Hex(stableJson({
    assignmentId: assignment.id,
    teamId: assignment.teamId,
    title: assignment.title,
    instructions: assignment.instructions,
    items: assignment.items,
    questionTypes: assignment.questionTypes,
    customQuestions: assignment.customQuestions,
    sourceKind: assignment.sourceKind,
    sourceId: assignment.sourceId,
    quizMode: assignment.quizMode,
    positionKey: assignment.positionKey,
    requiredScore: assignment.requiredScore,
    dueAt: assignment.dueAt,
    recipientIds: [...requestedRecipientIds].sort(),
  }));
  return { assignmentId: assignment.id, teamId: assignment.teamId, eventKey, payloadFingerprint };
}

function initialDispatchStatement(db, dispatch, now) {
  return db.prepare(
    `INSERT INTO quiz_assignment_initial_notification_dispatches
      (assignment_id, team_id, event_key, payload_fingerprint, state, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
  ).bind(
    dispatch.assignmentId,
    dispatch.teamId,
    dispatch.eventKey,
    dispatch.payloadFingerprint,
    now,
    now,
  );
}

function mapInitialDispatch(row) {
  if (!row) return null;
  return {
    assignmentId: row.assignment_id,
    teamId: row.team_id,
    eventKey: row.event_key,
    state: row.state,
    outboxPersistedAt: row.outbox_persisted_at ? Number(row.outbox_persisted_at) : null,
  };
}

function safePlay(input) {
  if (!input || typeof input !== "object" || input.playerHidden === true) return null;
  const play = {};
  for (const [key, value] of Object.entries(input)) {
    if ((!PLAY_FIELDS.has(key) && !/^resp[A-Z][A-Za-z0-9]*$/.test(key)) || typeof value !== "string") continue;
    play[key] = cleanText(value, 600);
  }
  if (!cleanText(play.play || play.oneWord || play._id || play.id, 180)) return null;
  return play;
}

function safeItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).slice(0, MAX_ITEMS).map((item, index) => {
    const play = safePlay(item?.play || item);
    if (!play) return null;
    const key = cleanText(play._id || play.id || `${play.personnel}|${play.formation}|${play.play}|${index}`, 700).toLowerCase();
    if (!key || seen.has(key)) return null;
    seen.add(key);
    return {
      play,
      period: cleanText(item?.period, 160),
      scriptIndex: cleanInt(item?.scriptIndex, 0, 10000),
      sourceBox: cleanText(item?.sourceBox, 120),
      positionKey: cleanText(item?.positionKey, 40),
    };
  }).filter(Boolean);
}

const QUESTION_TYPES = new Set(["responsibility", "diagram", "signal", "call", "play_from_rule"]);

function safeQuestionTypes(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((type) => cleanText(type, 40)).filter((type) => QUESTION_TYPES.has(type)))];
}

function safeCustomQuestions(value) {
  return (Array.isArray(value) ? value : []).slice(0, 20).map((question) => {
    const prompt = cleanText(question?.prompt, 320);
    const options = (Array.isArray(question?.options) ? question.options : []).map((option) => cleanText(option, 180)).filter(Boolean).slice(0, 4);
    const correctIndex = cleanInt(question?.correctIndex, 0, Math.max(0, options.length - 1));
    if (!prompt || options.length < 2 || !options[correctIndex]) return null;
    return { prompt, options, correctIndex };
  }).filter(Boolean);
}

// Drafts deliberately keep incomplete coach-written questions so a coach can
// leave the builder and finish their wording later. Published homework still
// goes through safeCustomQuestions above.
function safeDraftCustomQuestions(value) {
  return (Array.isArray(value) ? value : []).slice(0, 20).map((question) => ({
    prompt: cleanText(question?.prompt, 320),
    options: [0, 1, 2, 3].map((index) => cleanText(question?.options?.[index], 180)),
    correctIndex: cleanInt(question?.correctIndex, 0, 3),
  }));
}

function parseItems(value) {
  try { return safeItems(JSON.parse(value || "[]")); } catch (_) { return []; }
}

function parseJsonList(value, fallback = []) {
  try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed : fallback; } catch (_) { return fallback; }
}

function mapAssignment(row, recipient = {}) {
  const dueAt = row.due_at ? Number(row.due_at) : null;
  return {
    id: row.id,
    title: row.title,
    instructions: row.instructions || "",
    items: parseItems(row.items_json),
    questionTypes: safeQuestionTypes(parseJsonList(row.question_types_json)),
    customQuestions: row.status === "draft"
      ? safeDraftCustomQuestions(parseJsonList(row.custom_questions_json))
      : safeCustomQuestions(parseJsonList(row.custom_questions_json)),
    quizMode: row.quiz_mode || "quick",
    positionKey: row.position_key || "",
    requiredScore: Number(row.required_score || 0),
    dueAt,
    status: row.status,
    createdAt: Number(row.created_at || 0),
    recipient: recipient.user_id ? {
      userId: recipient.user_id,
      name: recipient.display_name || "Player",
      assignedAt: Number(recipient.assigned_at || 0),
      startedAt: recipient.started_at ? Number(recipient.started_at) : null,
      // Historic client-reported attempt data was never verified server-side.
      // Until authoritative quiz sessions exist, it must not appear as an
      // assignment score or completion state to either players or staff.
      completedAt: null,
      bestPercent: 0,
      verificationState: "authoritative-session-required",
      attemptsCount: 0,
      lastRemindedAt: recipient.last_reminded_at ? Number(recipient.last_reminded_at) : null,
      notificationCount: Number(recipient.notification_count || 0),
    } : null,
  };
}

export function isQuizAssignmentStaff(session) {
  return STAFF_ROLES.has(String(session?.role || ""));
}

export async function getAssignmentPlayers(db, teamId) {
  const result = await db.prepare(
    `SELECT id, display_name, first_name, last_name, email, roster_player_id
     FROM users WHERE team_id = ? AND role = 'player' AND status = 'active'
     ORDER BY display_name COLLATE NOCASE LIMIT 300`,
  ).bind(teamId).all();
  return (result.results || []).map((row) => ({
    id: row.id,
    name: row.display_name || `${row.first_name || ""} ${row.last_name || ""}`.trim() || "Player",
    // Player position lives in the canonical team roster/workspace record.
    // Do not select a non-existent users.primary_position column here: older and
    // current production databases intentionally do not carry that duplicate.
    position: "",
    email: row.email || "",
    rosterPlayerId: row.roster_player_id || "",
  }));
}

export async function getCoachQuizAssignments(db, teamId) {
  const assignments = await db.prepare(
    `SELECT * FROM quiz_assignments WHERE team_id = ? AND status != 'archived'
     ORDER BY created_at DESC LIMIT 100`,
  ).bind(teamId).all();
  const ids = (assignments.results || []).map((row) => row.id);
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const recipients = await db.prepare(
    `SELECT r.*, u.display_name FROM quiz_assignment_recipients r
     JOIN users u ON u.id = r.user_id
     WHERE r.assignment_id IN (${placeholders}) ORDER BY u.display_name COLLATE NOCASE`,
  ).bind(...ids).all();
  const byAssignment = new Map();
  for (const recipient of recipients.results || []) {
    const list = byAssignment.get(recipient.assignment_id) || [];
    list.push(mapAssignment({ items_json: "[]" }, recipient).recipient);
    byAssignment.set(recipient.assignment_id, list);
  }
  return (assignments.results || []).map((row) => ({ ...mapAssignment(row), recipients: byAssignment.get(row.id) || [] }));
}

export async function getPlayerQuizAssignments(db, teamId, userId) {
  const result = await db.prepare(
    `SELECT a.*, r.user_id, r.assigned_at, r.started_at, r.completed_at, r.best_percent, r.attempts_count, u.display_name
     FROM quiz_assignment_recipients r
     JOIN quiz_assignments a ON a.id = r.assignment_id
     JOIN users u ON u.id = r.user_id
     WHERE r.user_id = ? AND a.team_id = ? AND a.status = 'published'
     ORDER BY a.due_at ASC, a.created_at DESC LIMIT 100`,
  ).bind(userId, teamId).all();
  return (result.results || []).map((row) => mapAssignment(row, row));
}

export async function getQuizAssignmentForStaff(db, teamId, assignmentId) {
  const id = cleanText(assignmentId, 128);
  if (!id) throw new Error("Homework assignment is missing.");
  const row = await db.prepare(
    `SELECT * FROM quiz_assignments WHERE id = ? AND team_id = ? LIMIT 1`,
  ).bind(id, teamId).first();
  if (!row) throw new Error("Homework assignment is unavailable.");
  const recipients = await db.prepare(
    `SELECT r.*, u.display_name FROM quiz_assignment_recipients r
     JOIN users u ON u.id = r.user_id
     WHERE r.assignment_id = ? ORDER BY u.display_name COLLATE NOCASE`,
  ).bind(id).all();
  return { ...mapAssignment(row), recipients: (recipients.results || []).map((recipient) => mapAssignment({ items_json: "[]" }, recipient).recipient) };
}

/**
 * Re-check the current account boundary immediately before a staff resend.
 *
 * Assignment recipient rows are historical: a player may have been disabled,
 * moved to another team, or had their account role changed after the original
 * homework was published. Delivery must use the present users row rather than
 * treating that old recipient record as ongoing authorization.
 */
export async function getActiveQuizAssignmentRecipientIds(db, teamId, assignmentId) {
  const id = cleanText(assignmentId, 128);
  if (!id) return [];
  const result = await db.prepare(
    `SELECT r.user_id
     FROM quiz_assignment_recipients r
     JOIN quiz_assignments a ON a.id = r.assignment_id
     JOIN users u ON u.id = r.user_id
     WHERE r.assignment_id = ?
       AND a.team_id = ?
       AND u.team_id = ?
       AND u.role = 'player'
       AND u.status = 'active'
     ORDER BY r.assigned_at ASC
     LIMIT 300`,
  ).bind(id, teamId, teamId).all();
  return [...new Set((result.results || []).map((row) => cleanText(row.user_id, 128)).filter(Boolean))];
}

/**
 * The marker is written in the same transaction as `status = 'published'`.
 * Its pending state is deliberately durable until an inbox/outbox fan-out has
 * committed, so a later request can reconcile an interrupted notification
 * without changing the published assignment itself.
 */
export async function getQuizAssignmentInitialDispatch(db, teamId, assignmentId) {
  const id = cleanText(assignmentId, 128);
  if (!id) return null;
  const row = await db.prepare(
    `SELECT d.assignment_id, d.team_id, d.event_key, d.payload_fingerprint,
            d.state, d.outbox_persisted_at
       FROM quiz_assignment_initial_notification_dispatches d
       JOIN quiz_assignments a ON a.id = d.assignment_id
      WHERE d.assignment_id = ?
        AND d.team_id = ?
        AND a.team_id = ?
        AND a.status = 'published'
      LIMIT 1`,
  ).bind(id, teamId, teamId).first();
  return mapInitialDispatch(row);
}

export async function getPendingQuizAssignmentInitialDispatches(db, teamId = null, limit = 25) {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 25)));
  const scopedTeamId = cleanText(teamId, 180);
  const teamScope = scopedTeamId
    ? "AND d.team_id = ? AND a.team_id = ?"
    : "";
  const bindings = scopedTeamId
    ? [scopedTeamId, scopedTeamId, boundedLimit]
    : [boundedLimit];
  const result = await db.prepare(
    `SELECT d.assignment_id, d.team_id, d.event_key, d.payload_fingerprint,
            d.state, d.outbox_persisted_at
       FROM quiz_assignment_initial_notification_dispatches d
       JOIN quiz_assignments a ON a.id = d.assignment_id
      WHERE a.status = 'published'
        ${teamScope}
        AND d.state = 'pending'
      ORDER BY d.created_at ASC
      LIMIT ?`,
  ).bind(...bindings).all();
  return (result.results || []).map(mapInitialDispatch).filter(Boolean);
}

/** Mark after (not before) the matching D1 outbox transaction has committed. */
export async function markQuizAssignmentInitialDispatchPersisted(db, teamId, assignmentId, eventKey, now = nowUnix()) {
  const id = cleanText(assignmentId, 128);
  const key = cleanText(eventKey, 240);
  if (!id || !key) return false;
  const timestamp = Math.max(0, Math.floor(Number(now) || nowUnix()));
  const result = await db.prepare(
    `UPDATE quiz_assignment_initial_notification_dispatches
        SET state = 'outbox_persisted',
            outbox_persisted_at = COALESCE(outbox_persisted_at, ?),
            updated_at = ?
      WHERE assignment_id = ?
        AND team_id = ?
        AND event_key = ?`,
  ).bind(timestamp, timestamp, id, teamId, key).run();
  return Number(result?.meta?.changes || result?.changes || 0) === 1;
}

function homeworkDispatchBody(assignment) {
  const questionCount = Number(assignment?.items?.length || 0) + Number(assignment?.customQuestions?.length || 0);
  return `${questionCount} question${questionCount === 1 ? "" : "s"}${assignment?.dueAt ? " · check the due date" : ""}`;
}

/**
 * Reconcile exactly one durable initial-publish marker. This helper owns only
 * D1 state: callers publish its returned opaque IDs to Queue using their own
 * binding. If fan-out fails, the marker remains pending; if the final marker
 * update fails after fan-out, replaying the stored event key is idempotent.
 */
export async function reconcileQuizAssignmentInitialDispatch(db, teamId, assignmentId, now = nowUnix()) {
  const dispatch = await getQuizAssignmentInitialDispatch(db, teamId, assignmentId);
  if (!dispatch) return { state: "missing", assignmentId: cleanText(assignmentId, 128) };
  if (dispatch.state === "outbox_persisted") {
    return { state: "outbox_persisted", assignmentId: dispatch.assignmentId, pendingOutboxIds: [] };
  }
  const assignment = await getQuizAssignmentForStaff(db, teamId, dispatch.assignmentId);
  const recipientIds = await getActiveQuizAssignmentRecipientIds(db, teamId, assignment.id);
  const outbox = await createNotificationOutboxDeliveries(db, {
    teamId,
    eventKey: dispatch.eventKey,
    deliveryKind: "quiz_homework",
    homeworkAssignmentId: assignment.id,
    homeworkDeliveryEventType: "assigned",
    recipientUserIds: recipientIds,
    notification: {
      type: "quiz_homework",
      title: `Homework: ${assignment.title}`,
      body: homeworkDispatchBody(assignment),
      deepLink: `quiz-assignment:${assignment.id}`,
      tag: `quiz-homework-${assignment.id}`,
    },
    now,
  });
  await markQuizAssignmentInitialDispatchPersisted(db, teamId, assignment.id, dispatch.eventKey, now);
  return {
    state: "outbox_persisted",
    assignmentId: assignment.id,
    recipientIds: outbox.recipientIds,
    pendingOutboxIds: outbox.pendingIds,
  };
}

export async function archiveQuizAssignment(db, teamId, assignmentId) {
  const id = cleanText(assignmentId, 128);
  const now = nowUnix();
  const result = await db.prepare(
    `UPDATE quiz_assignments SET status = 'archived', archived_at = ?, updated_at = ?
     WHERE id = ? AND team_id = ? AND status != 'archived'`,
  ).bind(now, now, id, teamId).run();
  if (!Number(result.meta?.changes || 0)) throw new Error("Homework assignment is unavailable or already archived.");
  return { id, archivedAt: now };
}

export async function recordQuizAssignmentDelivery(db, assignmentId, recipientIds, eventType = "assigned") {
  const ids = [...new Set((Array.isArray(recipientIds) ? recipientIds : []).map((id) => cleanText(id, 128)).filter(Boolean))].slice(0, 300);
  if (!ids.length) return 0;
  const now = nowUnix();
  const type = eventType === "reminded" ? "reminded" : "assigned";
  const statements = [];
  ids.forEach((userId) => {
    statements.push(db.prepare(
      `INSERT INTO quiz_assignment_delivery_events (id, assignment_id, user_id, event_type, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), assignmentId, userId, type, now));
    if (type === "reminded") {
      statements.push(db.prepare(
        `UPDATE quiz_assignment_recipients
         SET last_reminded_at = ?, notification_count = notification_count + 1
         WHERE assignment_id = ? AND user_id = ?`,
      ).bind(now, assignmentId, userId));
    }
  });
  await db.batch(statements);
  return ids.length;
}

export async function markQuizAssignmentOpened(db, teamId, userId, assignmentId) {
  const id = cleanText(assignmentId, 128);
  if (!id) throw new Error("Homework assignment is missing its identity.");
  const assignment = await db.prepare(
    `SELECT a.id FROM quiz_assignments a
     JOIN quiz_assignment_recipients r ON r.assignment_id = a.id
     WHERE a.id = ? AND a.team_id = ? AND a.status = 'published' AND r.user_id = ? LIMIT 1`,
  ).bind(id, teamId, userId).first();
  if (!assignment) throw new Error("This homework assignment is unavailable.");
  const now = nowUnix();
  await db.batch([
    db.prepare(
      `UPDATE quiz_assignment_recipients
       SET started_at = COALESCE(started_at, ?)
       WHERE assignment_id = ? AND user_id = ?`,
    ).bind(now, id, userId),
    db.prepare(
      `INSERT INTO quiz_assignment_delivery_events (id, assignment_id, user_id, event_type, created_at)
       VALUES (?, ?, ?, 'opened', ?)`,
    ).bind(crypto.randomUUID(), id, userId, now),
  ]);
  return { id, startedAt: now };
}

export async function createQuizAssignment(db, teamId, session, input = {}, options = {}) {
  const requestedRecipientIds = cleanRecipientIds(input.recipientIds);
  if (!requestedRecipientIds.length) throw new Error("Choose at least one player.");
  const allowed = await db.prepare(
    `SELECT id FROM users WHERE team_id = ? AND role = 'player' AND status = 'active'`,
  ).bind(teamId).all();
  const allowedIds = new Set((allowed.results || []).map((row) => row.id));
  const recipients = requestedRecipientIds.filter((id) => allowedIds.has(id));
  if (!recipients.length) throw new Error("None of the selected players are active on this team.");
  // The browser assigns a UUID immediately before its first publish request.
  // Retaining it here makes a response-loss retry resolve to the same durable
  // publish marker rather than creating a second assignment.
  const requestedId = cleanText(options.assignmentId ?? input.assignmentId, 128);
  const id = requestedId || crypto.randomUUID();
  const now = nowUnix();
  const assignment = publishedAssignmentInput(teamId, session, input, id, now);
  if (!assignment.title) throw new Error("Give the homework a title.");
  if (!assignment.items.length && !assignment.customQuestions.length) throw new Error("Add a play or a complete custom question.");
  if (!assignment.questionTypes.length && !assignment.customQuestions.length) throw new Error("Choose a question type or add a complete custom question.");
  const initialDispatch = await initialDispatchFor(assignment, requestedRecipientIds);
  const statements = [db.prepare(
    `INSERT INTO quiz_assignments (id, team_id, title, instructions, items_json, question_types_json, custom_questions_json, source_kind, source_id, quiz_mode, position_key, required_score, due_at, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)`,
  ).bind(id, teamId, assignment.title, assignment.instructions || null, JSON.stringify(assignment.items), JSON.stringify(assignment.questionTypes), JSON.stringify(assignment.customQuestions),
    assignment.sourceKind, assignment.sourceId, assignment.quizMode,
    assignment.positionKey || null, assignment.requiredScore, assignment.dueAt, assignment.createdBy, now, now)];
  for (const userId of recipients) {
    statements.push(db.prepare(
      `INSERT INTO quiz_assignment_recipients (assignment_id, user_id, assigned_by, assigned_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(id, userId, assignment.createdBy, now));
  }
  // The marker is part of the publish transaction, not a follow-up best
  // effort write. A later reconciliation can safely create its outbox rows.
  statements.push(initialDispatchStatement(db, initialDispatch, now));
  await db.batch(statements);
  return {
    assignment: { ...assignment, status: "published" },
    recipientIds: recipients,
    initialDispatch: { ...initialDispatch, state: "pending", outboxPersistedAt: null },
  };
}

async function validRecipientIds(db, teamId, value) {
  const requested = cleanRecipientIds(value);
  if (!requested.length) return [];
  const allowed = await db.prepare(
    `SELECT id FROM users WHERE team_id = ? AND role = 'player' AND status = 'active'`,
  ).bind(teamId).all();
  const allowedIds = new Set((allowed.results || []).map((row) => row.id));
  return requested.filter((id) => allowedIds.has(id));
}

function draftAssignmentInput(teamId, session, input, id, now) {
  return {
    id, teamId,
    title: cleanText(input.title, 120) || "Untitled homework",
    instructions: cleanText(input.instructions, 800),
    items: safeItems(input.items),
    questionTypes: safeQuestionTypes(input.questionTypes),
    customQuestions: safeDraftCustomQuestions(input.customQuestions),
    sourceKind: ["playbook", "script", "gameplan"].includes(cleanText(input.sourceKind, 20)) ? cleanText(input.sourceKind, 20) : "playbook",
    sourceId: cleanText(input.sourceId, 180) || null,
    quizMode: ["quick", "full", "job", "diagram"].includes(input.quizMode) ? input.quizMode : "quick",
    positionKey: cleanText(input.positionKey, 40),
    requiredScore: cleanInt(input.requiredScore, 0, 100),
    dueAt: cleanUnix(input.dueAt),
    createdBy: session?.d1UserId || null,
    now,
  };
}

export async function saveQuizAssignmentDraft(db, teamId, session, input = {}) {
  const requestedId = cleanText(input.assignmentId, 128);
  const id = requestedId || crypto.randomUUID();
  const now = nowUnix();
  if (requestedId) {
    const current = await db.prepare(
      `SELECT id, status FROM quiz_assignments WHERE id = ? AND team_id = ? LIMIT 1`,
    ).bind(id, teamId).first();
    if (!current || current.status !== "draft") throw new Error("Only an unsent draft can be updated here.");
  }
  const assignment = draftAssignmentInput(teamId, session, input, id, now);
  const recipients = await validRecipientIds(db, teamId, input.recipientIds);
  const statements = [db.prepare(
    `INSERT INTO quiz_assignments (id, team_id, title, instructions, items_json, question_types_json, custom_questions_json, source_kind, source_id, quiz_mode, position_key, required_score, due_at, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, instructions = excluded.instructions, items_json = excluded.items_json,
       question_types_json = excluded.question_types_json, custom_questions_json = excluded.custom_questions_json,
       source_kind = excluded.source_kind, source_id = excluded.source_id, quiz_mode = excluded.quiz_mode,
       position_key = excluded.position_key, required_score = excluded.required_score, due_at = excluded.due_at,
       updated_at = excluded.updated_at`,
  ).bind(id, teamId, assignment.title, assignment.instructions || null, JSON.stringify(assignment.items), JSON.stringify(assignment.questionTypes), JSON.stringify(assignment.customQuestions), assignment.sourceKind, assignment.sourceId, assignment.quizMode, assignment.positionKey || null, assignment.requiredScore, assignment.dueAt, assignment.createdBy, now, now),
  db.prepare(`DELETE FROM quiz_assignment_recipients WHERE assignment_id = ?`).bind(id)];
  recipients.forEach((userId) => statements.push(db.prepare(
    `INSERT INTO quiz_assignment_recipients (assignment_id, user_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?)`,
  ).bind(id, userId, assignment.createdBy, now)));
  await db.batch(statements);
  return { assignment: { ...assignment, status: "draft", customQuestions: assignment.customQuestions }, recipientIds: recipients };
}

export async function publishQuizAssignment(db, teamId, session, input = {}) {
  const draftId = cleanText(input.assignmentId, 128);
  if (!draftId) return createQuizAssignment(db, teamId, session, input);
  const existing = await db.prepare(
    `SELECT id, status FROM quiz_assignments WHERE id = ? AND team_id = ? LIMIT 1`,
  ).bind(draftId, teamId).first();
  if (!existing) return createQuizAssignment(db, teamId, session, input, { assignmentId: draftId });
  if (!["draft", "published"].includes(existing.status)) throw new Error("Homework draft is unavailable.");

  const requestedRecipientIds = cleanRecipientIds(input.recipientIds);
  const now = nowUnix();
  const assignment = publishedAssignmentInput(teamId, session, input, draftId, now);
  if (!assignment.title) throw new Error("Give the homework a title.");
  if (!assignment.items.length && !assignment.customQuestions.length) throw new Error("Add a play or a complete custom question.");
  if (!assignment.questionTypes.length && !assignment.customQuestions.length) throw new Error("Choose a question type or add a complete custom question.");
  if (!requestedRecipientIds.length) throw new Error("Choose at least one player.");

  const initialDispatch = await initialDispatchFor(assignment, requestedRecipientIds);
  if (existing.status === "published") {
    // An interrupted request may be retried, but only with the exact same
    // normalized immutable payload captured in the atomic publish marker.
    // This is deliberately not a general edit path for published homework.
    const existingDispatch = await db.prepare(
      `SELECT assignment_id, team_id, event_key, payload_fingerprint, state, outbox_persisted_at
         FROM quiz_assignment_initial_notification_dispatches
        WHERE assignment_id = ? AND team_id = ? LIMIT 1`,
    ).bind(draftId, teamId).first();
    if (!existingDispatch || existingDispatch.payload_fingerprint !== initialDispatch.payloadFingerprint) {
      throw new Error("Homework is already published and cannot be changed.");
    }
    const persistedRecipients = await db.prepare(
      `SELECT user_id FROM quiz_assignment_recipients
        WHERE assignment_id = ? ORDER BY assigned_at ASC LIMIT ?`,
    ).bind(draftId, MAX_RECIPIENTS).all();
    return {
      assignment: { ...assignment, status: "published" },
      recipientIds: (persistedRecipients.results || []).map((row) => cleanText(row.user_id, 128)).filter(Boolean),
      initialDispatch: mapInitialDispatch(existingDispatch),
      recoveredPublish: true,
    };
  }

  const recipients = await validRecipientIds(db, teamId, input.recipientIds);
  if (!recipients.length) throw new Error("Choose at least one player.");
  const statements = [db.prepare(
    `UPDATE quiz_assignments SET title = ?, instructions = ?, items_json = ?, question_types_json = ?, custom_questions_json = ?,
      source_kind = ?, source_id = ?, quiz_mode = ?, position_key = ?, required_score = ?, due_at = ?, status = 'published', updated_at = ?
     WHERE id = ? AND team_id = ? AND status = 'draft'`,
  ).bind(assignment.title, assignment.instructions || null, JSON.stringify(assignment.items), JSON.stringify(assignment.questionTypes), JSON.stringify(assignment.customQuestions),
    assignment.sourceKind, assignment.sourceId,
    assignment.quizMode, assignment.positionKey || null, assignment.requiredScore, assignment.dueAt, now, draftId, teamId),
  db.prepare(`DELETE FROM quiz_assignment_recipients WHERE assignment_id = ?`).bind(draftId)];
  recipients.forEach((userId) => statements.push(db.prepare(
    `INSERT INTO quiz_assignment_recipients (assignment_id, user_id, assigned_by, assigned_at) VALUES (?, ?, ?, ?)`,
  ).bind(draftId, userId, assignment.createdBy, now)));
  statements.push(initialDispatchStatement(db, initialDispatch, now));
  await db.batch(statements);
  return {
    assignment: { ...assignment, status: "published" },
    recipientIds: recipients,
    initialDispatch: { ...initialDispatch, state: "pending", outboxPersistedAt: null },
  };
}

/**
 * Legacy browser quiz summaries are practice-only. They have no signed server
 * question flow, so client-provided attempt IDs and percentages cannot update
 * best_percent, latest_attempt_id, attempts_count, or completed_at.
 */
export async function recordLegacyQuizAssignmentPractice(db, teamId, userId, input = {}) {
  const assignmentId = cleanText(input.assignmentId, 128);
  if (!assignmentId) throw new Error("Homework assignment is missing its identity.");
  const assignment = await db.prepare(
    `SELECT a.id, a.required_score FROM quiz_assignments a
     JOIN quiz_assignment_recipients r ON r.assignment_id = a.id
     WHERE a.id = ? AND a.team_id = ? AND a.status = 'published' AND r.user_id = ? LIMIT 1`,
  ).bind(assignmentId, teamId, userId).first();
  if (!assignment) throw new Error("This homework assignment is unavailable.");
  const now = nowUnix();
  await db.batch([
    db.prepare(
      `UPDATE quiz_assignment_recipients
       SET started_at = COALESCE(started_at, ?)
       WHERE assignment_id = ? AND user_id = ?`,
    ).bind(now, assignmentId, userId),
    db.prepare(
      `INSERT INTO quiz_assignment_delivery_events (id, assignment_id, user_id, event_type, created_at)
       SELECT ?, ?, ?, 'attempted', ?
       WHERE NOT EXISTS (
         SELECT 1 FROM quiz_assignment_delivery_events
          WHERE assignment_id = ? AND user_id = ? AND event_type = 'attempted'
       )`,
    ).bind(crypto.randomUUID(), assignmentId, userId, now, assignmentId, userId),
  ]);
  return {
    assignmentId,
    practiceOnly: true,
    verified: false,
    completed: false,
    requiredScore: Number(assignment.required_score || 0),
  };
}

// Retain the former helper export for any in-flight code, while making its
// behavior safe until the authoritative session work is shipped.
export async function recordQuizAssignmentAttempt(db, teamId, userId, input = {}) {
  return recordLegacyQuizAssignmentPractice(db, teamId, userId, input);
}
