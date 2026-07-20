/** Private, team-scoped player quiz assignments. */

const MAX_ITEMS = 60;
const STAFF_ROLES = new Set(["admin", "coach", "assistant", "assistant_coach"]);
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
    customQuestions: safeCustomQuestions(parseJsonList(row.custom_questions_json)),
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
      completedAt: recipient.completed_at ? Number(recipient.completed_at) : null,
      bestPercent: Number(recipient.best_percent || 0),
      attemptsCount: Number(recipient.attempts_count || 0),
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
     ORDER BY CASE WHEN r.completed_at IS NULL THEN 0 ELSE 1 END, a.due_at ASC, a.created_at DESC LIMIT 100`,
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

export async function createQuizAssignment(db, teamId, session, input = {}) {
  const title = cleanText(input.title, 120);
  const items = safeItems(input.items);
  const questionTypes = safeQuestionTypes(input.questionTypes);
  const customQuestions = safeCustomQuestions(input.customQuestions);
  const recipientIds = [...new Set((Array.isArray(input.recipientIds) ? input.recipientIds : [])
    .map((id) => cleanText(id, 128)).filter(Boolean))].slice(0, 300);
  if (!title) throw new Error("Give the homework a title.");
  if (!items.length && !customQuestions.length) throw new Error("Add a play or a complete custom question.");
  if (!recipientIds.length) throw new Error("Choose at least one player.");
  const allowed = await db.prepare(
    `SELECT id FROM users WHERE team_id = ? AND role = 'player' AND status = 'active'`,
  ).bind(teamId).all();
  const allowedIds = new Set((allowed.results || []).map((row) => row.id));
  const recipients = recipientIds.filter((id) => allowedIds.has(id));
  if (!recipients.length) throw new Error("None of the selected players are active on this team.");
  const id = crypto.randomUUID();
  const now = nowUnix();
  const mode = ["quick", "full", "job", "diagram"].includes(input.quizMode) ? input.quizMode : "quick";
  const dueAt = cleanUnix(input.dueAt);
  const assignment = {
    id, teamId, title, instructions: cleanText(input.instructions, 800), items,
    questionTypes, customQuestions,
    quizMode: mode, positionKey: cleanText(input.positionKey, 40),
    requiredScore: cleanInt(input.requiredScore, 0, 100), dueAt,
    createdBy: session?.d1UserId || null, now,
  };
  const statements = [db.prepare(
    `INSERT INTO quiz_assignments (id, team_id, title, instructions, items_json, question_types_json, custom_questions_json, source_kind, source_id, quiz_mode, position_key, required_score, due_at, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)`,
  ).bind(id, teamId, title, assignment.instructions || null, JSON.stringify(items), JSON.stringify(questionTypes), JSON.stringify(customQuestions),
    ["playbook", "script", "gameplan"].includes(cleanText(input.sourceKind, 20)) ? cleanText(input.sourceKind, 20) : "playbook", cleanText(input.sourceId, 180) || null, mode,
    assignment.positionKey || null, assignment.requiredScore, dueAt, assignment.createdBy, now, now)];
  for (const userId of recipients) {
    statements.push(db.prepare(
      `INSERT INTO quiz_assignment_recipients (assignment_id, user_id, assigned_by, assigned_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(id, userId, assignment.createdBy, now));
  }
  await db.batch(statements);
  return { assignment, recipientIds: recipients };
}

export async function recordQuizAssignmentAttempt(db, teamId, userId, input = {}) {
  const assignmentId = cleanText(input.assignmentId, 128);
  const attemptId = cleanText(input.attemptId, 160);
  if (!assignmentId || !attemptId) throw new Error("Assignment attempt is missing its identity.");
  const assignment = await db.prepare(
    `SELECT a.id, a.required_score FROM quiz_assignments a
     JOIN quiz_assignment_recipients r ON r.assignment_id = a.id
     WHERE a.id = ? AND a.team_id = ? AND a.status = 'published' AND r.user_id = ? LIMIT 1`,
  ).bind(assignmentId, teamId, userId).first();
  if (!assignment) throw new Error("This homework assignment is unavailable.");
  const percent = cleanInt(input.percent, 0, 100);
  const now = nowUnix();
  const meetsRequirement = percent >= Number(assignment.required_score || 0);
  await db.batch([
    db.prepare(
      `UPDATE quiz_assignment_recipients
       SET started_at = COALESCE(started_at, ?), latest_attempt_id = ?,
         attempts_count = attempts_count + 1,
         best_percent = MAX(best_percent, ?),
         completed_at = CASE WHEN ? THEN COALESCE(completed_at, ?) ELSE completed_at END
       WHERE assignment_id = ? AND user_id = ?`,
    ).bind(now, attemptId, percent, meetsRequirement ? 1 : 0, now, assignmentId, userId),
    db.prepare(
      `INSERT INTO quiz_assignment_delivery_events (id, assignment_id, user_id, event_type, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), assignmentId, userId, meetsRequirement ? "completed" : "attempted", now),
  ]);
  return { assignmentId, percent, completed: meetsRequirement, requiredScore: Number(assignment.required_score || 0) };
}
