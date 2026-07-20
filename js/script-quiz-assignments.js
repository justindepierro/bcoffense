// Private quiz homework. D1 is the delivery source of truth; the coach builds
// one focused assignment from an immutable snapshot of a script, game plan, or
// selected Playbook plays.

const _quizAssignmentState = { assignments: [], players: [], loading: false, loaded: false, draft: null };
const QUIZ_ASSIGNMENT_QUESTION_TYPES = [
  ["responsibility", "My responsibility"],
  ["diagram", "What play is this diagram?"],
  ["signal", "What signal belongs to this?"],
  ["call", "What is the call?"],
  ["play_from_rule", "Which play owns this rule?"],
];

function _quizAssignmentRequest(path, options = {}) {
  return fetch(path, { credentials: "same-origin", ...options, headers: { Accept: "application/json", "X-BC-Auth-Mode": "json", ...(options.headers || {}) } })
    .then(async (response) => { const data = await response.json().catch(() => ({})); if (!response.ok || data?.ok === false) throw new Error(data?.error || `Homework request failed (${response.status})`); return data; });
}
function _isQuizAssignmentStaffClient() { const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null; return ["admin", "coach", "assistant", "assistant_coach"].includes(String(user?.role || "")); }

async function refreshQuizAssignments(options = {}) {
  if (_quizAssignmentState.loading) return null;
  _quizAssignmentState.loading = true;
  try {
    const data = await _quizAssignmentRequest("/api/quiz-assignments");
    _quizAssignmentState.assignments = Array.isArray(data.assignments) ? data.assignments : [];
    _quizAssignmentState.players = Array.isArray(data.players) ? data.players : [];
    _quizAssignmentState.loaded = true;
    if (typeof renderPlayerDashboardHome === "function" && !_isQuizAssignmentStaffClient()) renderPlayerDashboardHome();
    if (typeof _renderPlayerQuizHub === "function" && document.getElementById("playerQuizHubOverlay")?.classList.contains("hidden") === false) _renderPlayerQuizHub();
    if (_isQuizAssignmentStaffClient() && document.getElementById("coachQuizSetupPage")?.offsetParent !== null && typeof renderCoachQuizSetupPage === "function") renderCoachQuizSetupPage();
    if (_quizAssignmentState.draft && document.getElementById("quizAssignmentOverlay")?.classList.contains("hidden") === false) _renderQuizAssignmentModal();
    return data;
  } catch (err) { if (!options.quiet) showToast(err?.message || "Homework could not be refreshed.", { type: "warning" }); return null; }
  finally { _quizAssignmentState.loading = false; }
}

function _quizAssignmentDueLabel(dueAt) { if (!dueAt) return "No due date"; const date = new Date(Number(dueAt) * 1000); return Number.isFinite(date.getTime()) ? `Due ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date)}` : "No due date"; }
function _quizAssignmentPlayerStatus(assignment) { const recipient = assignment?.recipient || {}; if (recipient.completedAt) return { label: `${recipient.bestPercent}% complete`, tone: "done" }; if (assignment?.dueAt && Number(assignment.dueAt) * 1000 < Date.now()) return { label: "Past due", tone: "late" }; if (recipient.startedAt) return { label: `In progress · best ${recipient.bestPercent}%`, tone: "progress" }; return { label: _quizAssignmentDueLabel(assignment?.dueAt), tone: "new" }; }

function renderPlayerQuizHomeworkDashboard() {
  const assignments = _quizAssignmentState.assignments || []; if (!assignments.length) return "";
  const open = assignments.filter((assignment) => !assignment?.recipient?.completedAt); const visible = (open.length ? open : assignments).slice(0, 4);
  return `<section class="player-homework" aria-label="Homework quizzes"><div class="player-homework__head"><div><span>Coach homework</span><h3>${open.length ? `${open.length} quiz${open.length === 1 ? "" : "zes"} to finish` : "Homework complete"}</h3></div><button type="button" class="btn btn-sm btn-outline" data-action="openPlayerQuizHub">Open quiz center</button></div><div class="player-homework__list">${visible.map((assignment) => { const status = _quizAssignmentPlayerStatus(assignment); const id = escapeAttr(String(assignment.id)); return `<article class="player-homework__item player-homework__item--${status.tone}"><div><strong>${escapeHtml(assignment.title || "Homework quiz")}</strong><small>${escapeHtml(`${Number(assignment.items?.length || 0) + Number(assignment.customQuestions?.length || 0)} questions · ${status.label}${assignment.requiredScore ? ` · ${assignment.requiredScore}% required` : ""}`)}</small></div>${assignment.recipient?.completedAt ? `<span class="player-homework__complete">Done</span>` : `<button type="button" class="btn btn-primary btn-sm" data-action="startPlayerQuizAssignment" data-arg="${id}">Start</button>`}</article>`; }).join("")}</div></section>`;
}

function renderCoachQuizAssignmentsPanel() {
  const assignments = _quizAssignmentState.assignments || [];
  const recipients = assignments.flatMap((assignment) => assignment.recipients || []);
  const completed = recipients.filter((recipient) => recipient.completedAt).length;
  const started = recipients.filter((recipient) => recipient.startedAt && !recipient.completedAt).length;
  const overdue = assignments.reduce((count, assignment) => count + ((assignment.dueAt && Number(assignment.dueAt) * 1000 < Date.now()) ? (assignment.recipients || []).filter((recipient) => !recipient.completedAt).length : 0), 0);
  const average = completed ? Math.round(recipients.filter((recipient) => recipient.completedAt).reduce((sum, recipient) => sum + Number(recipient.bestPercent || 0), 0) / completed) : 0;
  return `<section class="coach-quiz-setup-section coach-quiz-homework"><div class="coach-quiz-section-head"><div><h3>Private homework</h3><span>${recipients.length ? `${completed}/${recipients.length} player assignments complete` : "Send a quiz to a player, position, roster tag, or the full team."}</span></div><div class="coach-quiz-homework__actions"><button type="button" class="btn btn-outline btn-sm" data-action="refreshQuizAssignments">Refresh</button><button type="button" class="btn btn-primary" data-action="openQuizAssignmentManager">+ Assign homework</button></div></div>${assignments.length ? `<div class="coach-quiz-homework-report"><span><b>${assignments.length}</b><small>active assignments</small></span><span><b>${completed}/${recipients.length}</b><small>complete</small></span><span><b>${started}</b><small>in progress</small></span><span class="${overdue ? "is-attention" : ""}"><b>${overdue}</b><small>past due</small></span><span><b>${average || "—"}${average ? "%" : ""}</b><small>avg. completed score</small></span></div>` : ""}<div class="coach-quiz-homework__grid">${assignments.length ? assignments.slice(0, 8).map((assignment) => { const assignmentRecipients = assignment.recipients || []; const done = assignmentRecipients.filter((recipient) => recipient.completedAt).length; const count = Number(assignment.items?.length || 0) + Number(assignment.customQuestions?.length || 0); const late = assignment.dueAt && Number(assignment.dueAt) * 1000 < Date.now() && done < assignmentRecipients.length; return `<article class="coach-quiz-homework-card${late ? " is-late" : ""}"><strong>${escapeHtml(assignment.title)}</strong><small>${escapeHtml(`${count} questions · ${done}/${assignmentRecipients.length} complete · ${_quizAssignmentDueLabel(assignment.dueAt)}`)}</small><div>${assignmentRecipients.slice(0, 5).map((recipient) => `<span class="coach-quiz-homework-card__player${recipient.completedAt ? " is-done" : ""}">${escapeHtml(recipient.name)}${recipient.completedAt ? " ✓" : ""}</span>`).join("")}${assignmentRecipients.length > 5 ? `<span class="coach-quiz-homework-card__player">+${assignmentRecipients.length - 5}</span>` : ""}</div><button type="button" class="btn btn-sm btn-outline" data-action="openQuizAssignmentDetails" data-arg="${escapeAttr(assignment.id)}">Manage</button></article>`; }).join("") : `<div class="coach-quiz-empty">No private homework is out. Assign a focused quiz without changing the team quiz source.</div>`}</div></section>`;
}

function _quizAssignmentPlayKey(play, index = 0) { const signature = typeof playSignature === "function" ? playSignature(play) : ""; return String(play?._id || play?.id || signature || `${play?.personnel || ""}|${play?.formation || ""}|${play?.play || ""}|${index}`); }
function _quizAssignmentCall(play) { return typeof _quizPlainCall === "function" ? _quizPlainCall(play) : [play?.personnel, play?.formation, play?.play].filter(Boolean).join(" ") || "Unnamed play"; }
function _assignmentCandidatePlays() { return (Array.isArray(plays) ? plays : []).filter((play) => play && !play.isSeparator && !play.playerHidden); }
function _newQuizAssignmentDraft() { return { title: "", instructions: "", requiredScore: 0, dueAt: "", quizMode: "quick", positionKey: "", recipientIds: new Set(), playKeys: new Set(), search: "", sourceKind: "playbook", sourceId: "", questionTypes: new Set(["responsibility", "diagram", "signal", "call"]), customQuestions: [], selectedGroup: "", frozenItems: null, frozenSourceLabel: "" }; }
function _getQuizAssignmentTemplates() { const raw = typeof storageManager !== "undefined" ? storageManager.get(STORAGE_KEYS.QUIZ_ASSIGNMENT_TEMPLATES, []) : []; return (Array.isArray(raw) ? raw : []).filter((template) => template && template.id && template.name).slice(0, 30); }
function _quizAssignmentTemplatePayload(draft) { return { id: `quiz-template-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: "", title: String(draft.title || "").slice(0, 120), instructions: String(draft.instructions || "").slice(0, 800), requiredScore: Number(draft.requiredScore || 0), quizMode: String(draft.quizMode || "quick"), positionKey: String(draft.positionKey || ""), questionTypes: [...(draft.questionTypes || [])], customQuestions: (draft.customQuestions || []).map((question) => ({ prompt: String(question.prompt || ""), options: [...(question.options || [])], correctIndex: Number(question.correctIndex || 0) })), updatedAt: Date.now() }; }
function _applyQuizAssignmentTemplate(draft, template) { if (!draft || !template) return; draft.title = String(template.title || ""); draft.instructions = String(template.instructions || ""); draft.requiredScore = Number(template.requiredScore || 0); draft.quizMode = String(template.quizMode || "quick"); draft.positionKey = String(template.positionKey || ""); draft.questionTypes = new Set(Array.isArray(template.questionTypes) ? template.questionTypes : []); draft.customQuestions = (Array.isArray(template.customQuestions) ? template.customQuestions : []).map((question, index) => ({ prompt: String(question.prompt || ""), options: Array.isArray(question.options) ? [...question.options] : ["", "", "", ""], correctIndex: Number(question.correctIndex || 0), id: `template-${Date.now()}-${index}` })); }
function _quizAssignmentSources(kind) { if (kind === "script") return typeof _getCoachQuizScriptSources === "function" ? _getCoachQuizScriptSources() : []; if (kind === "gameplan") return typeof _getCoachQuizGamePlanSources === "function" ? _getCoachQuizGamePlanSources() : []; return []; }
function _quizAssignmentSource(draft) { return _quizAssignmentSources(draft.sourceKind).find((source) => String(source.id) === String(draft.sourceId)) || null; }
function _quizAssignmentSourceItems(draft) { if (Array.isArray(draft?.frozenItems)) return draft.frozenItems; if (draft.sourceKind === "playbook") { const all = _assignmentCandidatePlays(); return all.filter((play, index) => draft.playKeys.has(_quizAssignmentPlayKey(play, index))).map((play, index) => ({ play, scriptIndex: index })); } const source = _quizAssignmentSource(draft); return (source?.plays || []).filter((play) => play && !play.isSeparator && !play.playerHidden).map((play, index) => ({ play, period: play.period || "", scriptIndex: index, sourceBox: source?.title || "" })); }
function _normalizeQuizAssignmentIdentity(value = "") { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function _quizAssignmentRosterLinks() { const roster = typeof getTeamRoster === "function" ? getTeamRoster() : []; const remote = _quizAssignmentState.players || []; return remote.map((user) => { const email = String(user.email || "").toLowerCase(); const emailName = email.split("@")[0]; const rosterPlayerId = String(user.rosterPlayerId || "").trim(); const local = (rosterPlayerId ? roster.find((entry) => String(entry.id || "").trim() === rosterPlayerId) : null) || roster.find((entry) => { const account = String(entry.accountUsername || "").toLowerCase(); return (account && (account === email || account === emailName)) || _normalizeQuizAssignmentIdentity(entry.name) === _normalizeQuizAssignmentIdentity(user.name); }); return { ...user, position: String(user.position || local?.primaryPosition || local?.position || "").trim(), tags: Array.isArray(local?.tags) ? local.tags : [], roster: local || null }; }); }
function _quizAssignmentGroups() { const linked = _quizAssignmentRosterLinks(); const groups = new Map(); linked.forEach((player) => { const position = String(player.position || "").trim(); if (position) groups.set(`position:${position}`, { key: `position:${position}`, label: position, ids: [...(groups.get(`position:${position}`)?.ids || []), player.id] }); (player.tags || []).forEach((tag) => { const clean = String(tag || "").trim(); if (!clean) return; const key = `tag:${clean.toLowerCase()}`; groups.set(key, { key, label: `#${clean.replace(/^#/, "")}`, ids: [...(groups.get(key)?.ids || []), player.id] }); }); }); return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label)); }

function _quizAssignmentUniquePlays(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).map((item) => item?.play || item).filter((play, index) => {
    if (!play) return false;
    const key = _quizAssignmentPlayKey(play, index).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function _quizAssignmentFocus(draft) {
  const positions = typeof _getQuizPositions === "function" ? _getQuizPositions() : [];
  const selected = positions.find((position) => position.key === draft?.positionKey);
  const defaultPosition = typeof _getQuizPosition === "function" ? _getQuizPosition() : null;
  return selected || defaultPosition || { key: "", label: "Player default" };
}

function _quizAssignmentHasDiagram(play) {
  return Boolean(window.playImages && typeof window.playImages.hasForPlay === "function" && window.playImages.hasForPlay(play));
}

function _quizAssignmentSignalLabels(play) {
  if (typeof _quizSignalRecordsForPlay !== "function") return [];
  return _quizSignalRecordsForPlay(play).map((record) => {
    if (typeof _quizSignalAnswerLabel === "function") return _quizSignalAnswerLabel(record);
    return record?.label || record?.value || "";
  }).map((label) => String(label || "").trim()).filter(Boolean);
}

function _quizAssignmentCustomQuestionHealth(questions = []) {
  const total = Array.isArray(questions) ? questions.length : 0;
  const valid = (Array.isArray(questions) ? questions : []).filter((question) => {
    const options = (question?.options || []).map((option) => String(option || "").trim()).filter(Boolean);
    const correct = Number(question?.correctIndex || 0);
    return Boolean(String(question?.prompt || "").trim()) && options.length >= 2 && Boolean(options[correct]);
  }).length;
  return { total, valid, invalid: total - valid };
}

// This is deliberately conservative. The player quiz can still show study cards,
// but homework only sends selected question types that have enough distinct source
// material for a fair choice-based question.
function getQuizAssignmentSourceHealth(draft = _quizAssignmentState.draft) {
  const playsForHealth = _quizAssignmentUniquePlays(_quizAssignmentSourceItems(draft));
  const focus = _quizAssignmentFocus(draft);
  const calls = new Set();
  const rules = new Set();
  const signals = new Set();
  let playsWithRule = 0;
  let playsWithDiagram = 0;
  let playsWithSignal = 0;

  playsForHealth.forEach((play) => {
    const call = _quizAssignmentCall(play).trim();
    if (call) calls.add(call.toLowerCase());
    const rule = String(focus.key ? play?.[focus.key] || "" : "").trim();
    if (rule) {
      playsWithRule += 1;
      rules.add(rule.toLowerCase());
    }
    if (_quizAssignmentHasDiagram(play)) playsWithDiagram += 1;
    const labels = _quizAssignmentSignalLabels(play);
    if (labels.length) playsWithSignal += 1;
    labels.forEach((label) => signals.add(label.toLowerCase()));
  });

  const typeHealth = {
    responsibility: {
      eligible: playsWithRule,
      ready: rules.size >= 4,
      detail: rules.size >= 4
        ? `${playsWithRule} plays · ${rules.size} distinct ${focus.label || "player"} rules`
        : `Needs 4 distinct ${focus.label || "player"} rules; found ${rules.size}`,
    },
    diagram: {
      eligible: playsWithDiagram,
      ready: playsWithDiagram > 0 && calls.size >= 2,
      detail: playsWithDiagram
        ? `${playsWithDiagram} diagrams · ${calls.size} distinct call choices`
        : "No attached diagrams in this source",
    },
    signal: {
      eligible: playsWithSignal,
      ready: signals.size >= 2,
      detail: signals.size >= 2
        ? `${playsWithSignal} plays · ${signals.size} distinct published signals`
        : `Needs 2 distinct published signals; found ${signals.size}`,
    },
    call: {
      eligible: playsForHealth.length,
      ready: calls.size >= 2,
      detail: calls.size >= 2 ? `${calls.size} distinct calls` : "Needs 2 distinct calls",
    },
    play_from_rule: {
      eligible: playsWithRule,
      ready: playsWithRule > 0 && calls.size >= 2,
      detail: playsWithRule && calls.size >= 2
        ? `${playsWithRule} rules across ${calls.size} calls`
        : "Needs a player rule and 2 distinct calls",
    },
  };
  const selectedTypes = [...(draft?.questionTypes || [])].filter((type) => typeHealth[type]);
  const invalidTypes = selectedTypes.filter((type) => !typeHealth[type].ready);
  const readyTypes = selectedTypes.filter((type) => typeHealth[type].ready);
  const custom = _quizAssignmentCustomQuestionHealth(draft?.customQuestions);
  const issues = [];
  if (!playsForHealth.length && !custom.valid) issues.push("Choose a source play or add a complete custom question.");
  if (!selectedTypes.length && !custom.valid) issues.push("Choose at least one question type or add a complete custom question.");
  if (invalidTypes.length) issues.push(`Fix or turn off: ${invalidTypes.map((type) => QUIZ_ASSIGNMENT_QUESTION_TYPES.find((entry) => entry[0] === type)?.[1] || type).join(", ")}.`);
  if (custom.invalid) issues.push(`Finish or remove ${custom.invalid} incomplete custom question${custom.invalid === 1 ? "" : "s"}.`);
  return {
    plays: playsForHealth.length,
    calls: calls.size,
    focus,
    typeHealth,
    selectedTypes,
    readyTypes,
    invalidTypes,
    custom,
    issues,
    ready: !issues.length,
  };
}

function _renderQuizAssignmentSourceHealth(health) {
  const labels = new Map(QUIZ_ASSIGNMENT_QUESTION_TYPES);
  const selected = health.selectedTypes.length
    ? health.selectedTypes.map((type) => {
      const item = health.typeHealth[type];
      return `<article class="quiz-assignment-health__item${item.ready ? " is-ready" : " is-needs"}"><div><strong>${escapeHtml(labels.get(type) || type)}</strong><span>${item.ready ? "Ready" : "Needs attention"}</span></div><small>${escapeHtml(item.detail)}</small></article>`;
    }).join("")
    : `<div class="quiz-assignment-health__empty">Choose a question type to see whether this source can support it.</div>`;
  return `<aside id="quizAssignmentHealth" class="quiz-assignment-health${health.ready ? " is-ready" : " is-needs"}" aria-live="polite"><div class="quiz-assignment-health__head"><div><span>Question health</span><strong>${health.ready ? "Ready to send" : "Needs a quick fix"}</strong></div><small>${health.plays} plays · ${health.calls} distinct calls · ${escapeHtml(health.focus.label || "Player default")} focus</small></div><div class="quiz-assignment-health__grid">${selected}</div>${health.issues.length ? `<div class="quiz-assignment-health__issues">${health.issues.map((issue) => `<span>• ${escapeHtml(issue)}</span>`).join("")}${health.readyTypes.length ? `<button type="button" class="btn btn-sm btn-outline" data-action="useQuizAssignmentReadyQuestionTypes">Use only ready question types</button>` : ""}</div>` : `<p class="quiz-assignment-health__hint">Every selected question type has enough source material for player-facing multiple-choice questions.</p>`}</aside>`;
}

function _quizAssignmentCanSubmit(draft, health = getQuizAssignmentSourceHealth(draft)) {
  return Boolean(health.ready && draft?.recipientIds?.size && String(draft?.title || "").trim());
}

function _syncQuizAssignmentSubmitState(health = getQuizAssignmentSourceHealth()) {
  const draft = _quizAssignmentState.draft;
  if (!draft) return;
  const canSubmit = _quizAssignmentCanSubmit(draft, health);
  const button = document.querySelector('[data-action="createQuizAssignment"]');
  if (button) {
    button.disabled = !canSubmit;
    button.title = health.ready
      ? (draft.recipientIds.size ? (String(draft.title || "").trim() ? "" : "Add a homework title first.") : "Choose at least one recipient.")
      : health.issues.join(" ");
  }
  const count = document.getElementById("quizAssignmentReadyCount");
  if (count) count.textContent = `${draft.recipientIds.size} players · ${_quizAssignmentSourceItems(draft).length + health.custom.valid} ready questions`;
}

function refreshQuizAssignmentSourceHealth() {
  const draft = _quizAssignmentState.draft;
  const healthNode = document.getElementById("quizAssignmentHealth");
  if (!draft) return;
  const health = getQuizAssignmentSourceHealth(draft);
  if (healthNode) healthNode.outerHTML = _renderQuizAssignmentSourceHealth(health);
  _syncQuizAssignmentSubmitState(health);
}

function _renderQuizAssignmentModal() {
  const overlay = document.getElementById("quizAssignmentOverlay"); const draft = _quizAssignmentState.draft; if (!overlay || !draft) return;
  const positions = typeof _getQuizPositions === "function" ? _getQuizPositions() : []; const source = _quizAssignmentSource(draft); const sourceItems = _quizAssignmentSourceItems(draft); const rosterPlayers = _quizAssignmentRosterLinks(); const groups = _quizAssignmentGroups(); const templates = _getQuizAssignmentTemplates();
  const searchTokens = String(draft.search || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
  const candidates = _assignmentCandidatePlays().filter((play) => { const haystack = `${_quizAssignmentCall(play)} ${play.type || ""} ${play.oneWord || ""} ${play.basePlay || ""}`.toLowerCase(); return !searchTokens.length || searchTokens.every((token) => haystack.includes(token)); }).slice(0, 80);
  const sourceOptions = draft.sourceKind === "playbook" ? "" : _quizAssignmentSources(draft.sourceKind).map((entry) => `<option value="${escapeAttr(entry.id)}"${String(draft.sourceId) === String(entry.id) ? " selected" : ""}>${escapeHtml(entry.title)} · ${entry.plays?.length || 0} plays</option>`).join("");
  const sourceTabs = `<div class="quiz-assignment-source-tabs">${[["playbook", "Selected Playbook plays"], ["script", "Saved practice script"], ["gameplan", "Game Plan"]].map(([kind, label]) => `<button type="button" class="quiz-assignment-source-tab${draft.sourceKind === kind ? " is-selected" : ""}" data-action="setQuizAssignmentSource" data-arg="${kind}">${label}</button>`).join("")}</div>`;
  let sourcePicker = "";
  if (draft.sourceKind === "playbook") {
    const playOptions = candidates.map((play, index) => { const key = _quizAssignmentPlayKey(play, index); return `<button type="button" class="quiz-assignment-play${draft.playKeys.has(key) ? " is-selected" : ""}" data-action="toggleQuizAssignmentPlay" data-arg="${escapeAttr(key)}"><span>${draft.playKeys.has(key) ? "✓" : "+"}</span><strong>${escapeHtml(_quizAssignmentCall(play))}</strong><small>${escapeHtml([play.type, play.oneWord].filter(Boolean).join(" · "))}</small></button>`; }).join("") || `<span class="coach-quiz-empty">No player-visible plays match that search.</span>`;
    sourcePicker = `<div class="quiz-assignment-section-head quiz-assignment-section-head--compact"><span>Select the exact plays below. Your selection is frozen into this assignment.</span><input value="${escapeAttr(draft.search)}" placeholder="Find plays" data-oninput="setQuizAssignmentSearch" data-pass="value" /></div><div class="quiz-assignment-play-list">${playOptions}</div>`;
  } else {
    sourcePicker = `<label class="quiz-assignment-source-select">${draft.sourceKind === "script" ? "Saved script" : "Game Plan"}<select data-onchange="setQuizAssignmentSourceId" data-pass="value"><option value="">Choose a source</option>${sourceOptions}</select></label>`;
    if (source) sourcePicker += `<div class="quiz-assignment-source-summary"><strong>${escapeHtml(source.title)}</strong><span>${escapeHtml(`${source.plays?.length || 0} plays${source.periodCount ? ` · ${source.periodCount} periods` : ""}`)}</span></div>`;
  }
  const sourceHealth = getQuizAssignmentSourceHealth(draft);
  const sourceSection = Array.isArray(draft.frozenItems)
    ? `<div class="quiz-assignment-source-summary"><strong>${escapeHtml(draft.frozenSourceLabel || "Previous assignment snapshot")}</strong><span>${sourceItems.length} copied plays · source stays unchanged</span><button type="button" class="btn btn-sm btn-outline" data-action="clearQuizAssignmentFrozenSource">Change source</button></div>`
    : `${sourceTabs}${sourcePicker}`;
  overlay.dataset.action = "closeQuizAssignmentManagerOverlay";
  overlay.innerHTML = `<div class="quiz-assignment-modal" role="dialog" aria-modal="true" aria-label="Assign quiz homework"><header><div><span>Private homework</span><h2>Build a player assignment</h2><p>Pick a source, choose exactly who receives it, and add coach-written multiple choice when you need it.</p></div><button class="modal-close" type="button" data-action="closeQuizAssignmentManager" aria-label="Close">×</button></header><div class="quiz-assignment-form">
    <section class="quiz-assignment-step"><div class="quiz-assignment-section-head"><div><span>1 · Source</span><h3>What should they study?</h3></div><strong>${sourceItems.length} plays</strong></div>${sourceSection}${_renderQuizAssignmentSourceHealth(sourceHealth)}</section>
    <section class="quiz-assignment-step"><div class="quiz-assignment-section-head"><div><span>2 · Recipients</span><h3>Who gets this homework?</h3></div>${rosterPlayers.length ? `<button type="button" class="btn btn-sm btn-outline" data-action="toggleAllQuizAssignmentPlayers">${draft.recipientIds.size === rosterPlayers.length ? "Clear all" : "Select all"}</button>` : ""}</div>${rosterPlayers.length ? `${groups.length ? `<div class="quiz-assignment-group-chips"><span>Quick groups</span>${groups.map((group) => `<button type="button" class="quiz-assignment-group-chip${group.ids.every((id) => draft.recipientIds.has(id)) ? " is-selected" : ""}" data-action="toggleQuizAssignmentRecipientGroup" data-arg="${escapeAttr(group.key)}">${escapeHtml(group.label)} <small>${group.ids.length}</small></button>`).join("")}</div>` : `<p class="quiz-assignment-hint">Add roster <b>#tags</b> in Team Settings to make reusable custom homework groups.</p>`}<div class="quiz-assignment-player-grid">${rosterPlayers.map((player) => `<button type="button" class="quiz-assignment-choice${draft.recipientIds.has(player.id) ? " is-selected" : ""}" data-action="toggleQuizAssignmentRecipient" data-arg="${escapeAttr(player.id)}"><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position || "Player")}${player.tags?.length ? ` · ${escapeHtml(player.tags.map((tag) => `#${String(tag).replace(/^#/, "")}`).join(" "))}` : ""}${player.roster ? "" : " · roster link needed"}</small></button>`).join("")}</div>` : `<div class="coach-quiz-empty"><strong>Player accounts could not be loaded.</strong><span>Homework can only be sent to active player portal accounts. Refresh the list or open Player Accounts &amp; Roster Links to resolve access.</span><div><button type="button" class="btn btn-sm btn-outline" data-action="refreshQuizAssignments">Refresh accounts</button><button type="button" class="btn btn-sm btn-outline" data-action="openPlayersAdmin">Open player accounts</button></div></div>`}</section>
    <section class="quiz-assignment-step"><div class="quiz-assignment-section-head"><div><span>3 · Questions</span><h3>Choose what to ask</h3></div><strong>${draft.customQuestions.length} custom</strong></div><div class="quiz-assignment-question-types">${QUIZ_ASSIGNMENT_QUESTION_TYPES.map(([type, label]) => `<button type="button" class="quiz-assignment-question-type${draft.questionTypes.has(type) ? " is-selected" : ""}" data-action="toggleQuizAssignmentQuestionType" data-arg="${type}">${escapeHtml(label)}</button>`).join("")}</div><div class="quiz-assignment-custom-head"><div><strong>Coach-written multiple choice</strong><small>Add questions with your own wording and answers.</small></div><button type="button" class="btn btn-sm btn-outline" data-action="addQuizAssignmentCustomQuestion">+ Custom question</button></div>${draft.customQuestions.map((question, index) => `<article class="quiz-assignment-custom-question"><div><strong>Custom ${index + 1}</strong><button type="button" class="btn btn-link btn-sm" data-action="removeQuizAssignmentCustomQuestion" data-arg="${escapeAttr(question.id)}">Remove</button></div><input value="${escapeAttr(question.prompt)}" placeholder="Question" data-oninput="setQuizAssignmentCustomQuestionField" data-arg="${escapeAttr(`${question.id}:prompt`)}" data-pass="value" />${[0, 1, 2, 3].map((choiceIndex) => `<label><input value="${escapeAttr(question.options[choiceIndex] || "")}" placeholder="Answer option ${choiceIndex + 1}" data-oninput="setQuizAssignmentCustomQuestionField" data-arg="${escapeAttr(`${question.id}:option:${choiceIndex}`)}" data-pass="value" /><input type="radio" name="quiz-custom-${escapeAttr(question.id)}"${Number(question.correctIndex) === choiceIndex ? " checked" : ""} data-onchange="setQuizAssignmentCustomQuestionField" data-arg="${escapeAttr(`${question.id}:correct`)}" data-pass="value" value="${choiceIndex}" aria-label="Correct answer" /></label>`).join("")}</article>`).join("")}</section>
    <section class="quiz-assignment-step"><div class="quiz-assignment-section-head"><div><span>4 · Details</span><h3>Set the expectation</h3></div><button type="button" class="btn btn-sm btn-outline" data-action="saveQuizAssignmentTemplate">Save as template</button></div>${templates.length ? `<div class="quiz-assignment-template-row"><span>Reusable templates</span>${templates.map((template) => `<button type="button" class="quiz-assignment-template" data-action="applyQuizAssignmentTemplate" data-arg="${escapeAttr(template.id)}">${escapeHtml(template.name)}</button>`).join("")}</div>` : `<p class="quiz-assignment-hint">Save a template for your standard homework instructions, question mix, and score target.</p>`}<label>Title<input value="${escapeAttr(draft.title)}" placeholder="e.g. Red zone homework" data-oninput="setQuizAssignmentField" data-arg="title" data-pass="value" /></label><label>Instructions<textarea placeholder="What should they focus on?" data-oninput="setQuizAssignmentField" data-arg="instructions" data-pass="value">${escapeHtml(draft.instructions)}</textarea></label><div class="quiz-assignment-form__row"><label>Due date<input type="datetime-local" value="${escapeAttr(draft.dueAt)}" data-onchange="setQuizAssignmentField" data-arg="dueAt" data-pass="value" /></label><label>Required score<select data-onchange="setQuizAssignmentField" data-arg="requiredScore" data-pass="value">${[0, 70, 80, 90, 100].map((value) => `<option value="${value}"${Number(draft.requiredScore) === value ? " selected" : ""}>${value ? `${value}%` : "No minimum"}</option>`).join("")}</select></label><label>Focus<select data-onchange="setQuizAssignmentField" data-arg="positionKey" data-pass="value"><option value="">Player default</option>${positions.map((position) => `<option value="${escapeAttr(position.key)}"${draft.positionKey === position.key ? " selected" : ""}>${escapeHtml(position.label)}</option>`).join("")}</select></label></div></section>
  </div><footer><span id="quizAssignmentReadyCount">${draft.recipientIds.size} players · ${sourceItems.length + sourceHealth.custom.valid} ready questions</span><div><button type="button" class="btn btn-outline" data-action="closeQuizAssignmentManager">Cancel</button><button type="button" class="btn btn-primary" data-action="createQuizAssignment"${_quizAssignmentCanSubmit(draft, sourceHealth) ? "" : " disabled"} title="${escapeAttr(sourceHealth.ready ? (draft.recipientIds.size ? (String(draft.title || "").trim() ? "" : "Add a homework title first.") : "Choose at least one recipient.") : sourceHealth.issues.join(" "))}">Assign homework</button></div></footer></div>`;
}

async function openQuizAssignmentManager(seed = null) { if (!_isQuizAssignmentStaffClient()) return; const refreshed = await refreshQuizAssignments({ quiet: false }); if (!refreshed && !_quizAssignmentState.loaded) return; _quizAssignmentState.draft = seed || _newQuizAssignmentDraft(); let overlay = document.getElementById("quizAssignmentOverlay"); if (!overlay) { overlay = document.createElement("div"); overlay.id = "quizAssignmentOverlay"; overlay.className = "overlay quiz-assignment-overlay hidden"; document.body.appendChild(overlay); } overlay.classList.remove("hidden"); _renderQuizAssignmentModal(); if (typeof openLayer === "function") openLayer(overlay, { id: "quizAssignmentOverlay", scrollElement: "quizAssignmentOverlay", blocking: true }); }
function openQuizAssignmentForSource(arg) { const [kind, rawId] = String(arg || "").split("|"); const sourceKind = ["script", "gameplan"].includes(kind) ? kind : "playbook"; const sourceId = rawId ? decodeURIComponent(rawId) : ""; const source = _quizAssignmentSources(sourceKind).find((entry) => String(entry.id) === sourceId); const draft = _newQuizAssignmentDraft(); draft.sourceKind = sourceKind; draft.sourceId = sourceId; draft.title = source?.title ? `${source.title} homework` : ""; openQuizAssignmentManager(draft); }
function closeQuizAssignmentManager() { const overlay = document.getElementById("quizAssignmentOverlay"); if (overlay) { if (typeof closeLayer === "function") closeLayer(overlay); overlay.classList.add("hidden"); } _quizAssignmentState.draft = null; }
function setQuizAssignmentField(field, value) { const draft = _quizAssignmentState.draft; if (!draft) return; draft[field] = value; if (field === "positionKey") _renderQuizAssignmentModal(); else refreshQuizAssignmentSourceHealth(); }
function setQuizAssignmentSearch(value) { if (_quizAssignmentState.draft) { _quizAssignmentState.draft.search = value; _renderQuizAssignmentModal(); } }
function setQuizAssignmentSource(kind) { const draft = _quizAssignmentState.draft; if (!draft) return; draft.frozenItems = null; draft.frozenSourceLabel = ""; draft.sourceKind = ["playbook", "script", "gameplan"].includes(kind) ? kind : "playbook"; draft.sourceId = ""; _renderQuizAssignmentModal(); }
function clearQuizAssignmentFrozenSource() { const draft = _quizAssignmentState.draft; if (!draft) return; draft.frozenItems = null; draft.frozenSourceLabel = ""; draft.sourceKind = "playbook"; _renderQuizAssignmentModal(); }
function setQuizAssignmentSourceId(value) { if (_quizAssignmentState.draft) { _quizAssignmentState.draft.sourceId = value; _renderQuizAssignmentModal(); } }
function toggleQuizAssignmentRecipient(id) { const set = _quizAssignmentState.draft?.recipientIds; if (!set) return; set.has(id) ? set.delete(id) : set.add(id); _renderQuizAssignmentModal(); }
function toggleAllQuizAssignmentPlayers() { const draft = _quizAssignmentState.draft; if (!draft) return; const ids = _quizAssignmentState.players.map((player) => player.id); if (draft.recipientIds.size === ids.length) draft.recipientIds.clear(); else ids.forEach((id) => draft.recipientIds.add(id)); _renderQuizAssignmentModal(); }
function toggleQuizAssignmentRecipientGroup(key) { const draft = _quizAssignmentState.draft; const group = _quizAssignmentGroups().find((entry) => entry.key === key); if (!draft || !group) return; const selected = group.ids.every((id) => draft.recipientIds.has(id)); group.ids.forEach((id) => selected ? draft.recipientIds.delete(id) : draft.recipientIds.add(id)); _renderQuizAssignmentModal(); }
function toggleQuizAssignmentPlay(key) { const set = _quizAssignmentState.draft?.playKeys; if (!set) return; set.has(key) ? set.delete(key) : set.add(key); _renderQuizAssignmentModal(); }
function toggleQuizAssignmentQuestionType(type) { const types = _quizAssignmentState.draft?.questionTypes; if (!types) return; types.has(type) ? types.delete(type) : types.add(type); _renderQuizAssignmentModal(); }
function useQuizAssignmentReadyQuestionTypes() { const draft = _quizAssignmentState.draft; if (!draft) return; const health = getQuizAssignmentSourceHealth(draft); draft.questionTypes = new Set(health.readyTypes); _renderQuizAssignmentModal(); }
function addQuizAssignmentCustomQuestion() { const draft = _quizAssignmentState.draft; if (!draft) return; draft.customQuestions.push({ id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, prompt: "", options: ["", "", "", ""], correctIndex: 0 }); _renderQuizAssignmentModal(); }
function removeQuizAssignmentCustomQuestion(id) { const draft = _quizAssignmentState.draft; if (!draft) return; draft.customQuestions = draft.customQuestions.filter((question) => question.id !== id); _renderQuizAssignmentModal(); }
function setQuizAssignmentCustomQuestionField(arg, value) { const [id, field, index] = String(arg || "").split(":"); const question = _quizAssignmentState.draft?.customQuestions.find((entry) => entry.id === id); if (!question) return; if (field === "prompt") question.prompt = value; else if (field === "option") question.options[Number(index)] = value; else if (field === "correct") question.correctIndex = Number(value); refreshQuizAssignmentSourceHealth(); }
async function saveQuizAssignmentTemplate() { const draft = _quizAssignmentState.draft; if (!draft) return; const name = typeof showPrompt === "function" ? await showPrompt("Name this reusable homework template.", draft.title || "Homework template", { title: "Save Quiz Template", icon: "📚", placeholder: "e.g. Friday film check", confirmText: "Save template" }) : ""; if (!name?.trim()) return; const template = _quizAssignmentTemplatePayload(draft); template.name = String(name).trim().slice(0, 80); const existing = _getQuizAssignmentTemplates().filter((entry) => entry.name.toLowerCase() !== template.name.toLowerCase()); existing.unshift(template); storageManager.set(STORAGE_KEYS.QUIZ_ASSIGNMENT_TEMPLATES, existing.slice(0, 30)); _renderQuizAssignmentModal(); showToast(`Saved “${template.name}” as a homework template.`, { type: "success" }); }
function applyQuizAssignmentTemplate(id) { const draft = _quizAssignmentState.draft; const template = _getQuizAssignmentTemplates().find((entry) => String(entry.id) === String(id)); if (!draft || !template) return; _applyQuizAssignmentTemplate(draft, template); _renderQuizAssignmentModal(); }

function _quizAssignmentById(id) { return (_quizAssignmentState.assignments || []).find((assignment) => String(assignment.id) === String(id)) || null; }
function _quizAssignmentRecipientLabel(recipient) { if (recipient.completedAt) return `${recipient.bestPercent}% complete`; if (recipient.startedAt) return `In progress · best ${recipient.bestPercent}%`; return recipient.lastRemindedAt ? "Reminder sent" : "Not started"; }
function _quizAssignmentSeed(assignment, mode = "duplicate") {
  const draft = _newQuizAssignmentDraft();
  draft.title = mode === "followup" ? `Follow-up — ${assignment.title}` : `Copy — ${assignment.title}`;
  draft.instructions = assignment.instructions || "";
  draft.requiredScore = Number(assignment.requiredScore || 0);
  draft.quizMode = assignment.quizMode || "quick";
  draft.positionKey = assignment.positionKey || "";
  draft.questionTypes = new Set(assignment.questionTypes || []);
  draft.customQuestions = (assignment.customQuestions || []).map((question, index) => ({ ...question, id: `copy-${Date.now()}-${index}`, options: [...(question.options || [])] }));
  draft.frozenItems = (assignment.items || []).map((item) => ({ ...item, play: { ...(item.play || {}) } }));
  draft.frozenSourceLabel = `${mode === "followup" ? "Follow-up from" : "Copy of"} ${assignment.title}`;
  (assignment.recipients || []).filter((recipient) => mode !== "followup" || !recipient.completedAt).forEach((recipient) => draft.recipientIds.add(recipient.userId));
  return draft;
}
function _renderQuizAssignmentDetails(assignment) {
  const recipients = assignment.recipients || [];
  const complete = recipients.filter((recipient) => recipient.completedAt).length;
  const started = recipients.filter((recipient) => recipient.startedAt && !recipient.completedAt).length;
  const unfinished = recipients.length - complete;
  const questions = Number(assignment.items?.length || 0) + Number(assignment.customQuestions?.length || 0);
  const typeLabels = (assignment.questionTypes || []).map((type) => QUIZ_ASSIGNMENT_QUESTION_TYPES.find((entry) => entry[0] === type)?.[1] || type);
  return `<div class="quiz-assignment-detail-modal" role="dialog" aria-modal="true" aria-label="Homework assignment details"><header><div><span>Homework assignment</span><h2>${escapeHtml(assignment.title)}</h2><p>${escapeHtml(assignment.instructions || "No coach instructions added.")}</p></div><button class="modal-close" type="button" data-action="closeQuizAssignmentDetails" aria-label="Close">×</button></header><div class="quiz-assignment-detail-body"><div class="quiz-assignment-detail-stats"><span><b>${questions}</b><small>questions</small></span><span><b>${complete}/${recipients.length}</b><small>complete</small></span><span><b>${started}</b><small>in progress</small></span><span><b>${unfinished - started}</b><small>not started</small></span></div><section><div class="quiz-assignment-section-head"><div><span>Assignment preview</span><h3>What players see</h3></div><span>${escapeHtml(_quizAssignmentDueLabel(assignment.dueAt))}</span></div><div class="quiz-assignment-detail-preview"><strong>${escapeHtml(`${assignment.items?.length || 0} play questions`)}</strong>${typeLabels.length ? `<span>${escapeHtml(typeLabels.join(" · "))}</span>` : ""}${assignment.customQuestions?.length ? `<span>${assignment.customQuestions.length} coach-written multiple choice</span>` : ""}</div></section><section><div class="quiz-assignment-section-head"><div><span>Recipients</span><h3>Completion and follow-up</h3></div><span>${assignment.requiredScore ? `${assignment.requiredScore}% required` : "Completion required"}</span></div><div class="quiz-assignment-recipient-list">${recipients.map((recipient) => `<article class="quiz-assignment-recipient${recipient.completedAt ? " is-complete" : recipient.startedAt ? " is-started" : ""}"><div><strong>${escapeHtml(recipient.name)}</strong><small>${escapeHtml(_quizAssignmentRecipientLabel(recipient))}${recipient.notificationCount ? ` · ${recipient.notificationCount} sent` : ""}</small></div><b>${recipient.completedAt ? "✓" : recipient.startedAt ? "…" : "—"}</b></article>`).join("") || "<span class=\"coach-quiz-empty\">No recipient records are available.</span>"}</div></section></div><footer><div><button type="button" class="btn btn-outline" data-action="duplicateQuizAssignment" data-arg="${escapeAttr(assignment.id)}">Duplicate</button><button type="button" class="btn btn-outline" data-action="followUpQuizAssignment" data-arg="${escapeAttr(assignment.id)}" ${unfinished ? "" : "disabled"}>Follow up</button></div><div><button type="button" class="btn btn-outline" data-action="resendQuizAssignment" data-arg="${escapeAttr(assignment.id)}" ${unfinished ? "" : "disabled"}>Resend unfinished</button><button type="button" class="btn btn-danger" data-action="archiveQuizAssignment" data-arg="${escapeAttr(assignment.id)}">Archive</button></div></footer></div>`;
}
function openQuizAssignmentDetails(id) { const assignment = _quizAssignmentById(id); if (!assignment) return; let overlay = document.getElementById("quizAssignmentDetailsOverlay"); if (!overlay) { overlay = document.createElement("div"); overlay.id = "quizAssignmentDetailsOverlay"; overlay.className = "overlay quiz-assignment-overlay hidden"; document.body.appendChild(overlay); } overlay.dataset.action = "closeQuizAssignmentDetailsOverlay"; overlay.innerHTML = _renderQuizAssignmentDetails(assignment); overlay.classList.remove("hidden"); if (typeof openLayer === "function") openLayer(overlay, { id: "quizAssignmentDetailsOverlay", scrollElement: "quizAssignmentDetailsOverlay", blocking: true }); }
function closeQuizAssignmentDetails() { const overlay = document.getElementById("quizAssignmentDetailsOverlay"); if (overlay) { if (typeof closeLayer === "function") closeLayer(overlay); overlay.classList.add("hidden"); } }
function duplicateQuizAssignment(id) { const assignment = _quizAssignmentById(id); if (!assignment) return; closeQuizAssignmentDetails(); openQuizAssignmentManager(_quizAssignmentSeed(assignment)); }
function followUpQuizAssignment(id) { const assignment = _quizAssignmentById(id); if (!assignment) return; closeQuizAssignmentDetails(); openQuizAssignmentManager(_quizAssignmentSeed(assignment, "followup")); }
async function resendQuizAssignment(id) { const assignment = _quizAssignmentById(id); if (!assignment) return; const unfinished = (assignment.recipients || []).filter((recipient) => !recipient.completedAt).length; if (!unfinished) return; const confirmed = typeof showConfirm === "function" ? await showConfirm(`Send a reminder to ${unfinished} unfinished player${unfinished === 1 ? "" : "s"}?`, { title: "Resend homework" }) : true; if (!confirmed) return; try { const data = await _quizAssignmentRequest("/api/quiz-assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resend", assignmentId: id }) }); await refreshQuizAssignments({ quiet: true }); closeQuizAssignmentDetails(); showToast(`Reminder sent to ${data.recipients} player${data.recipients === 1 ? "" : "s"}.`, { type: "success" }); } catch (err) { showToast(err?.message || "Homework reminder could not be sent.", { type: "warning" }); } }
async function archiveQuizAssignment(id) { const assignment = _quizAssignmentById(id); if (!assignment) return; const confirmed = typeof showConfirm === "function" ? await showConfirm(`Archive “${assignment.title}”? Players will no longer be able to open it, but their result history is retained.`, { title: "Archive homework", confirmText: "Archive", danger: true }) : true; if (!confirmed) return; try { await _quizAssignmentRequest("/api/quiz-assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive", assignmentId: id }) }); await refreshQuizAssignments({ quiet: true }); closeQuizAssignmentDetails(); showToast("Homework archived. Player history was preserved.", { type: "success" }); } catch (err) { showToast(err?.message || "Homework could not be archived.", { type: "warning" }); } }

async function createQuizAssignment() {
  const draft = _quizAssignmentState.draft; if (!draft) return; const health = getQuizAssignmentSourceHealth(draft); if (!String(draft.title || "").trim()) { showToast("Give the homework a title before sending it.", { type: "warning" }); return; } if (!draft.recipientIds.size) { showToast("Choose at least one player before sending homework.", { type: "warning" }); return; } if (!health.ready) { showToast(health.issues[0] || "Fix the question health before sending homework.", { type: "warning" }); return; } const items = _quizAssignmentSourceItems(draft); const customQuestions = draft.customQuestions.map((question) => ({ prompt: question.prompt, options: question.options, correctIndex: question.correctIndex }));
  const payload = { title: draft.title, instructions: draft.instructions, requiredScore: draft.requiredScore, dueAt: draft.dueAt, quizMode: draft.quizMode, positionKey: draft.positionKey, recipientIds: [...draft.recipientIds], items, questionTypes: [...draft.questionTypes], customQuestions, sourceKind: draft.sourceKind, sourceId: draft.sourceId };
  try { const data = await _quizAssignmentRequest("/api/quiz-assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); closeQuizAssignmentManager(); await refreshQuizAssignments({ quiet: true }); showToast(`Homework sent to ${data.recipients} player${data.recipients === 1 ? "" : "s"}.`, { type: "success" }); }
  catch (err) { showToast(err?.message || "Homework could not be sent.", { type: "warning" }); }
}
async function startPlayerQuizAssignment(id) { if (!_quizAssignmentState.loaded) await refreshQuizAssignments({ quiet: true }); const assignment = (_quizAssignmentState.assignments || []).find((entry) => String(entry.id) === String(id)); const items = Array.isArray(assignment?.items) ? assignment.items.slice() : []; const customItems = (assignment?.customQuestions || []).map((customQuestion, index) => ({ play: { _id: `assignment-custom-${assignment.id}-${index}`, play: "Coach question" }, scriptIndex: items.length + index, customQuestion })); if (!items.length && !customItems.length) { showToast("That homework assignment is not available right now.", { type: "warning" }); return; } try { await _quizAssignmentRequest("/api/quiz-assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "record-open", assignmentId: assignment.id }) }); } catch (_) { /* A quiz can still run offline; its scored attempt is retried by the normal player sync path. */ } closePlayerQuizHub(); startScriptQuiz({ items: [...items, ...customItems], sourceType: "assignment", sourceId: assignment.id, assignmentId: assignment.id, title: assignment.title, positionKey: assignment.positionKey || "", positionMode: assignment.positionKey ? "manual" : "primary", mode: assignment.quizMode || "quick", questionTypes: assignment.questionTypes || [] }); }
async function recordQuizAssignmentAttempt(assignmentId, summary) { const data = await _quizAssignmentRequest("/api/quiz-assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "record-attempt", assignmentId, attemptId: summary?.id, percent: summary?.percent }) }); await refreshQuizAssignments({ quiet: true }); return data?.result || null; }
document.addEventListener("DOMContentLoaded", () => { setTimeout(() => refreshQuizAssignments({ quiet: true }), 600); });
