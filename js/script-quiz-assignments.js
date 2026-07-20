// Private quiz homework: coach selects safe player-visible plays and named
// recipients; D1 is the source of truth for delivery and completion status.

const _quizAssignmentState = {
  assignments: [],
  players: [],
  loading: false,
  loaded: false,
  draft: null,
};

function _quizAssignmentRequest(path, options = {}) {
  return fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      Accept: "application/json",
      "X-BC-Auth-Mode": "json",
      ...(options.headers || {}),
    },
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) throw new Error(data?.error || `Homework request failed (${response.status})`);
    return data;
  });
}

function _isQuizAssignmentStaffClient() {
  const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  return ["admin", "coach", "assistant", "assistant_coach"].includes(String(user?.role || ""));
}

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
    return data;
  } catch (err) {
    if (!options.quiet) showToast(err?.message || "Homework could not be refreshed.", { type: "warning" });
    return null;
  } finally {
    _quizAssignmentState.loading = false;
  }
}

function _quizAssignmentDueLabel(dueAt) {
  if (!dueAt) return "No due date";
  const date = new Date(Number(dueAt) * 1000);
  if (!Number.isFinite(date.getTime())) return "No due date";
  return `Due ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date)}`;
}

function _quizAssignmentPlayerStatus(assignment) {
  const recipient = assignment?.recipient || {};
  if (recipient.completedAt) return { label: `${recipient.bestPercent}% complete`, tone: "done" };
  if (assignment?.dueAt && Number(assignment.dueAt) * 1000 < Date.now()) return { label: "Past due", tone: "late" };
  if (recipient.startedAt) return { label: `In progress · best ${recipient.bestPercent}%`, tone: "progress" };
  return { label: _quizAssignmentDueLabel(assignment?.dueAt), tone: "new" };
}

function renderPlayerQuizHomeworkDashboard() {
  const assignments = _quizAssignmentState.assignments || [];
  if (!assignments.length) return "";
  const open = assignments.filter((assignment) => !assignment?.recipient?.completedAt);
  const visible = (open.length ? open : assignments).slice(0, 4);
  return `
    <section class="player-homework" aria-label="Homework quizzes">
      <div class="player-homework__head">
        <div><span>Coach homework</span><h3>${open.length ? `${open.length} quiz${open.length === 1 ? "" : "zes"} to finish` : "Homework complete"}</h3></div>
        <button type="button" class="btn btn-sm btn-outline" data-action="openPlayerQuizHub">Open quiz center</button>
      </div>
      <div class="player-homework__list">
        ${visible.map((assignment) => {
          const status = _quizAssignmentPlayerStatus(assignment);
          const id = escapeAttr(String(assignment.id));
          return `<article class="player-homework__item player-homework__item--${status.tone}">
            <div><strong>${escapeHtml(assignment.title || "Homework quiz")}</strong>
              <small>${escapeHtml(`${Number(assignment.items?.length || 0)} plays · ${status.label}${assignment.requiredScore ? ` · ${assignment.requiredScore}% required` : ""}`)}</small></div>
            ${assignment.recipient?.completedAt
              ? `<span class="player-homework__complete">Done</span>`
              : `<button type="button" class="btn btn-primary btn-sm" data-action="startPlayerQuizAssignment" data-arg="${id}">Start</button>`}
          </article>`;
        }).join("")}
      </div>
    </section>`;
}

function renderCoachQuizAssignmentsPanel() {
  const assignments = _quizAssignmentState.assignments || [];
  const completed = assignments.reduce((sum, assignment) => sum + (assignment.recipients || []).filter((recipient) => recipient.completedAt).length, 0);
  const assigned = assignments.reduce((sum, assignment) => sum + (assignment.recipients || []).length, 0);
  return `
    <section class="coach-quiz-setup-section coach-quiz-homework">
      <div class="coach-quiz-section-head">
        <div><h3>Private homework</h3><span>${assigned ? `${completed}/${assigned} player assignments complete` : "Send a quiz to one player, a position group, or the full team."}</span></div>
        <div class="coach-quiz-homework__actions"><button type="button" class="btn btn-outline btn-sm" data-action="refreshQuizAssignments">Refresh</button><button type="button" class="btn btn-primary" data-action="openQuizAssignmentManager">+ Assign homework</button></div>
      </div>
      <div class="coach-quiz-homework__grid">
        ${assignments.length ? assignments.slice(0, 8).map((assignment) => {
          const recipients = assignment.recipients || [];
          const done = recipients.filter((recipient) => recipient.completedAt).length;
          return `<article class="coach-quiz-homework-card"><strong>${escapeHtml(assignment.title)}</strong>
            <small>${escapeHtml(`${assignment.items?.length || 0} plays · ${done}/${recipients.length} complete · ${_quizAssignmentDueLabel(assignment.dueAt)}`)}</small>
            <div>${recipients.slice(0, 5).map((recipient) => `<span class="coach-quiz-homework-card__player${recipient.completedAt ? " is-done" : ""}">${escapeHtml(recipient.name)}${recipient.completedAt ? " ✓" : ""}</span>`).join("")}${recipients.length > 5 ? `<span class="coach-quiz-homework-card__player">+${recipients.length - 5}</span>` : ""}</div>
          </article>`;
        }).join("") : `<div class="coach-quiz-empty">No private homework is out. Assign a focused quiz to a player without changing the team quiz source.</div>`}
      </div>
    </section>`;
}

function _quizAssignmentPlayKey(play, index = 0) {
  const signature = typeof playSignature === "function" ? playSignature(play) : "";
  return String(play?._id || play?.id || signature || `${play?.personnel || ""}|${play?.formation || ""}|${play?.play || ""}|${index}`);
}

function _quizAssignmentCall(play) {
  if (typeof _quizPlainCall === "function") return _quizPlainCall(play);
  return [play?.personnel, play?.formation, play?.play].filter(Boolean).join(" ") || "Unnamed play";
}

function _newQuizAssignmentDraft() {
  return {
    title: "", instructions: "", requiredScore: 0, dueAt: "", quizMode: "quick", positionKey: "",
    recipientIds: new Set(), playKeys: new Set(), search: "",
  };
}

function _assignmentCandidatePlays() {
  return (Array.isArray(plays) ? plays : []).filter((play) => play && !play.isSeparator && !play.playerHidden);
}

function _renderQuizAssignmentModal() {
  const overlay = document.getElementById("quizAssignmentOverlay");
  const draft = _quizAssignmentState.draft;
  if (!overlay || !draft) return;
  const searchTokens = String(draft.search || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
  const candidates = _assignmentCandidatePlays().filter((play) => {
    const haystack = `${_quizAssignmentCall(play)} ${play.type || ""} ${play.oneWord || ""} ${play.basePlay || ""}`.toLowerCase();
    return !searchTokens.length || searchTokens.every((token) => haystack.includes(token));
  }).slice(0, 30);
  const positions = typeof _getQuizPositions === "function" ? _getQuizPositions() : [];
  overlay.innerHTML = `<div class="quiz-assignment-modal" role="dialog" aria-modal="true" aria-label="Assign quiz homework">
    <header><div><span>Private homework</span><h2>Send a quiz to players</h2><p>Only selected players receive this work. The original plays and team quiz source stay unchanged.</p></div><button class="modal-close" type="button" data-action="closeQuizAssignmentManager" aria-label="Close">×</button></header>
    <div class="quiz-assignment-form">
      <label>Title<input id="quizAssignmentTitle" value="${escapeAttr(draft.title)}" placeholder="e.g. Lucas — Red Zone Checks" data-oninput="setQuizAssignmentField" data-arg="title" data-pass="value" /></label>
      <label>Instructions<textarea id="quizAssignmentInstructions" placeholder="What should they focus on?" data-oninput="setQuizAssignmentField" data-arg="instructions" data-pass="value">${escapeHtml(draft.instructions)}</textarea></label>
      <div class="quiz-assignment-form__row"><label>Due date<input type="datetime-local" value="${escapeAttr(draft.dueAt)}" data-onchange="setQuizAssignmentField" data-arg="dueAt" data-pass="value" /></label><label>Required score<select data-onchange="setQuizAssignmentField" data-arg="requiredScore" data-pass="value">${[0, 70, 80, 90, 100].map((value) => `<option value="${value}"${Number(draft.requiredScore) === value ? " selected" : ""}>${value ? `${value}%` : "No minimum"}</option>`).join("")}</select></label><label>Focus<select data-onchange="setQuizAssignmentField" data-arg="positionKey" data-pass="value"><option value="">Player default</option>${positions.map((position) => `<option value="${escapeAttr(position.key)}"${draft.positionKey === position.key ? " selected" : ""}>${escapeHtml(position.label)}</option>`).join("")}</select></label></div>
      <section><div class="quiz-assignment-section-head"><h3>Players</h3><button type="button" class="btn btn-sm btn-outline" data-action="toggleAllQuizAssignmentPlayers">${draft.recipientIds.size === _quizAssignmentState.players.length && _quizAssignmentState.players.length ? "Clear all" : "Select all"}</button></div><div class="quiz-assignment-player-grid">${_quizAssignmentState.players.map((player) => `<button type="button" class="quiz-assignment-choice${draft.recipientIds.has(player.id) ? " is-selected" : ""}" data-action="toggleQuizAssignmentRecipient" data-arg="${escapeAttr(player.id)}"><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.position || "Player")}</small></button>`).join("") || "<span>No active player accounts found.</span>"}</div></section>
      <section><div class="quiz-assignment-section-head"><h3>Plays <small>${draft.playKeys.size} selected</small></h3><input value="${escapeAttr(draft.search)}" placeholder="Find plays by call, tag, or family" data-oninput="setQuizAssignmentSearch" data-pass="value" /></div><div class="quiz-assignment-play-list">${candidates.map((play, index) => { const key = _quizAssignmentPlayKey(play, index); return `<button type="button" class="quiz-assignment-play${draft.playKeys.has(key) ? " is-selected" : ""}" data-action="toggleQuizAssignmentPlay" data-arg="${escapeAttr(key)}"><span>${draft.playKeys.has(key) ? "✓" : "+"}</span><strong>${escapeHtml(_quizAssignmentCall(play))}</strong><small>${escapeHtml([play.type, play.oneWord].filter(Boolean).join(" · "))}</small></button>`; }).join("") || "<span class=\"coach-quiz-empty\">No player-visible plays match that search.</span>"}</div></section>
    </div>
    <footer><span>${draft.recipientIds.size} players · ${draft.playKeys.size} plays</span><div><button type="button" class="btn btn-outline" data-action="closeQuizAssignmentManager">Cancel</button><button type="button" class="btn btn-primary" data-action="createQuizAssignment">Assign homework</button></div></footer>
  </div>`;
}

async function openQuizAssignmentManager() {
  if (!_isQuizAssignmentStaffClient()) return;
  if (!_quizAssignmentState.loaded) await refreshQuizAssignments({ quiet: false });
  _quizAssignmentState.draft = _newQuizAssignmentDraft();
  let overlay = document.getElementById("quizAssignmentOverlay");
  if (!overlay) { overlay = document.createElement("div"); overlay.id = "quizAssignmentOverlay"; overlay.className = "overlay quiz-assignment-overlay"; document.body.appendChild(overlay); }
  overlay.classList.remove("hidden");
  _renderQuizAssignmentModal();
  if (typeof openLayer === "function") openLayer(overlay, { id: "quizAssignmentOverlay", scrollElement: "quizAssignmentOverlay", blocking: true });
}

function closeQuizAssignmentManager() {
  const overlay = document.getElementById("quizAssignmentOverlay");
  if (overlay) { if (typeof closeLayer === "function") closeLayer(overlay); overlay.classList.add("hidden"); }
  _quizAssignmentState.draft = null;
}

function setQuizAssignmentField(field, value) { if (_quizAssignmentState.draft) { _quizAssignmentState.draft[field] = value; } }
function setQuizAssignmentSearch(value) { if (_quizAssignmentState.draft) { _quizAssignmentState.draft.search = value; _renderQuizAssignmentModal(); } }
function toggleQuizAssignmentRecipient(id) { const set = _quizAssignmentState.draft?.recipientIds; if (!set) return; set.has(id) ? set.delete(id) : set.add(id); _renderQuizAssignmentModal(); }
function toggleAllQuizAssignmentPlayers() { const draft = _quizAssignmentState.draft; if (!draft) return; if (draft.recipientIds.size === _quizAssignmentState.players.length) draft.recipientIds.clear(); else _quizAssignmentState.players.forEach((player) => draft.recipientIds.add(player.id)); _renderQuizAssignmentModal(); }
function toggleQuizAssignmentPlay(key) { const set = _quizAssignmentState.draft?.playKeys; if (!set) return; set.has(key) ? set.delete(key) : set.add(key); _renderQuizAssignmentModal(); }

async function createQuizAssignment() {
  const draft = _quizAssignmentState.draft;
  if (!draft) return;
  const allPlays = _assignmentCandidatePlays();
  const items = allPlays.filter((play, index) => draft.playKeys.has(_quizAssignmentPlayKey(play, index))).map((play, index) => ({ play, scriptIndex: index }));
  const payload = { title: draft.title, instructions: draft.instructions, requiredScore: draft.requiredScore, dueAt: draft.dueAt, quizMode: draft.quizMode, positionKey: draft.positionKey, recipientIds: [...draft.recipientIds], items };
  try {
    const data = await _quizAssignmentRequest("/api/quiz-assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    closeQuizAssignmentManager();
    await refreshQuizAssignments({ quiet: true });
    showToast(`Homework sent to ${data.recipients} player${data.recipients === 1 ? "" : "s"}.`, { type: "success" });
  } catch (err) { showToast(err?.message || "Homework could not be sent.", { type: "warning" }); }
}

async function startPlayerQuizAssignment(id) {
  if (!_quizAssignmentState.loaded) await refreshQuizAssignments({ quiet: true });
  const assignment = (_quizAssignmentState.assignments || []).find((entry) => String(entry.id) === String(id));
  if (!assignment?.items?.length) { showToast("That homework assignment is not available right now.", { type: "warning" }); return; }
  closePlayerQuizHub();
  startScriptQuiz({ items: assignment.items, sourceType: "assignment", sourceId: assignment.id, assignmentId: assignment.id, title: assignment.title, positionKey: assignment.positionKey || "", positionMode: assignment.positionKey ? "manual" : "primary", mode: assignment.quizMode || "quick" });
}

async function recordQuizAssignmentAttempt(assignmentId, summary) {
  const data = await _quizAssignmentRequest("/api/quiz-assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "record-attempt", assignmentId, attemptId: summary?.id, percent: summary?.percent }) });
  await refreshQuizAssignments({ quiet: true });
  return data?.result || null;
}

// Initial background fetch: homework should appear without a manual refresh.
document.addEventListener("DOMContentLoaded", () => { setTimeout(() => refreshQuizAssignments({ quiet: true }), 600); });
