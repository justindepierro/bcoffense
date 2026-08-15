/**
 * Admin-only access manager for D1 coach accounts.
 * Managed coaches receive read-only team study surfaces by default. This panel
 * grants the separate capabilities that can change team data or accounts.
 */

const COACH_ACCESS_GROUPS = [
  ["Read-only workspace", [
    ["tab:dashboard", "Home dashboard", "Published team overview and current releases."],
    ["tab:playbook", "Playbook", "Read the published playbook and diagrams."],
    ["tab:signals", "Signals", "Watch signal clips and study components."],
    ["tab:script", "Practice / swipe study", "Open current practice scripts and swipe view."],
    ["tab:wristband", "Wristband maker", "Open wristband materials without changing them."],
    ["tab:tendencies", "Opponent scout", "Read opponent scouting reports."],
    ["tab:gameplan", "Game plan", "Read the current game-plan board."],
    ["tab:callsheet", "Call sheet", "Read the current call sheet."],
    ["tab:installation", "Installations", "Read install and teaching materials."],
    ["tab:identity", "Offensive identity", "Read the program’s identity materials."],
    ["tab:offensebuilder", "Offense builder", "Open the offense-building reference."],
    ["tab:quiz", "Quiz", "Review team quiz sources and results."],
  ]],
  ["Collaboration", [
    ["feature:comments", "Comments and discussion", "Post and reply in play discussions."],
    ["feature:questions", "Questions", "Ask questions through the team question flow."],
  ]],
  ["Coach tools", [
    ["feature:print", "Print and export", "Create printable coach materials."],
    ["feature:quiz_assignments", "Quiz assignments", "Build and assign player homework."],
    ["feature:manage_players", "Player accounts", "Invite players and manage roster links."],
    ["feature:media_upload", "Diagrams and clips", "Attach and replace media."],
    ["feature:publish_team", "Publish team updates", "Send new player-ready releases."],
    ["feature:edit_workspace", "Edit workspace", "Edit playbook data, scripts, game plans, and settings."],
  ]],
];

const COACH_ACCESS_DEFAULTS = [
  "tab:dashboard", "tab:playbook", "tab:signals", "tab:script", "tab:wristband",
  "tab:tendencies", "tab:gameplan", "tab:callsheet", "tab:installation", "tab:identity",
  "tab:offensebuilder", "tab:quiz",
  "feature:comments", "feature:questions",
];

let coachAccessAccounts = [];
let coachAccessSelectedId = "";
const coachAccessDrafts = new Map();
let coachAccessLoadController = null;

function getCoachAccessOverlay() {
  return document.getElementById("coachAccessOverlay");
}

function isCoachAccessAdmin() {
  return typeof isAdminUser === "function" && isAdminUser();
}

function openCoachAccessManager(trigger) {
  if (!isCoachAccessAdmin()) {
    if (typeof showBlockedToast === "function") showBlockedToast();
    return;
  }
  const overlay = getCoachAccessOverlay();
  if (!overlay) return;
  overlay.classList.add("visible");
  overlay.removeAttribute("inert");
  overlay.removeAttribute("aria-hidden");
  coachAccessDrafts.clear();
  coachAccessSelectedId = "";
  if (typeof openLayer === "function") {
    const panel = overlay.querySelector(".pa-panel");
    const body = overlay.querySelector(".pa-body");
    const closeButton = overlay.querySelector(".pa-close-btn");
    openLayer(overlay, {
      id: "coachAccessOverlay",
      scrollElement: body || panel || overlay,
      blocking: true,
      safeArea: true,
      initialFocus: closeButton || panel || overlay,
      onEscape: () => closeCoachAccessManager(),
      returnFocus: trigger instanceof HTMLElement ? trigger : undefined,
    });
  }
  loadCoachAccessAccounts();
}

function closeCoachAccessManager(options = {}) {
  const overlay = getCoachAccessOverlay();
  if (!overlay) return;
  coachAccessLoadController?.abort();
  coachAccessLoadController = null;
  if (typeof closeLayer === "function") closeLayer("coachAccessOverlay", options);
  overlay.classList.remove("visible");
  overlay.setAttribute("inert", "");
  overlay.setAttribute("aria-hidden", "true");
}

async function loadCoachAccessAccounts() {
  const body = document.getElementById("coachAccessBody");
  const overlay = getCoachAccessOverlay();
  if (!body || !overlay) return;
  coachAccessLoadController?.abort();
  const controller = new AbortController();
  coachAccessLoadController = controller;
  body.innerHTML = '<p class="pa-loading">Loading coach access…</p>';
  try {
    const response = await fetch("/auth/players", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
    if (coachAccessLoadController !== controller || !overlay.classList.contains("visible")) return;
    coachAccessAccounts = (data.players || []).filter((account) => account.role === "coach");
    coachAccessAccounts.forEach((coach) => {
      if (!coachAccessDrafts.has(coach.id)) {
        coachAccessDrafts.set(coach.id, new Set(Array.isArray(coach.permissions) ? coach.permissions : COACH_ACCESS_DEFAULTS));
      }
    });
    if (!coachAccessAccounts.some((coach) => coach.id === coachAccessSelectedId)) {
      coachAccessSelectedId = coachAccessAccounts[0]?.id || "";
    }
    renderCoachAccessManager();
  } catch (error) {
    if (error?.name === "AbortError" || coachAccessLoadController !== controller) return;
    if (!overlay.classList.contains("visible")) return;
    body.innerHTML = `<p class="pa-error">Failed to load coach access: ${escapeHtml(error.message)}</p>`;
  } finally {
    if (coachAccessLoadController === controller) coachAccessLoadController = null;
  }
}

function coachAccessSummary(permissions) {
  const values = Array.from(permissions || []);
  if (values.includes("feature:edit_workspace")) return "Can edit workspace";
  const extraTools = values.filter((key) => key.startsWith("feature:") && !["feature:comments", "feature:questions"].includes(key));
  return extraTools.length ? `View-only + ${extraTools.length} coach tool${extraTools.length === 1 ? "" : "s"}` : "View-only coach";
}

function renderCoachAccessManager() {
  const body = document.getElementById("coachAccessBody");
  if (!body) return;
  const selected = coachAccessAccounts.find((coach) => coach.id === coachAccessSelectedId);
  const list = coachAccessAccounts.length
    ? coachAccessAccounts.map((coach) => {
      const isSelected = coach.id === coachAccessSelectedId;
      const draft = coachAccessDrafts.get(coach.id) || new Set(COACH_ACCESS_DEFAULTS);
      return `<button type="button" class="coach-access-person${isSelected ? " is-selected" : ""}" data-action="selectCoachAccessAccount" data-arg="${escapeAttr(coach.id)}">
        <strong>${escapeHtml(coach.displayName || coach.email)}</strong>
        <span>${escapeHtml(coach.email)}</span>
        <small>${escapeHtml(coachAccessSummary(draft))}</small>
      </button>`;
    }).join("")
    : '<div class="pa-empty">No managed coach accounts yet. Invite your first coach below.</div>';

  const detail = selected ? renderCoachAccessDetail(selected) : `
    <div class="coach-access-empty"><strong>Add a coach when you are ready.</strong><span>They will see the current team workspace without being able to change it.</span></div>`;

  body.innerHTML = `
    <div class="coach-access-intro">
      <strong>Read-only by default</strong>
      <span>Coaches can study the published team workspace. Editing, publishing, media, player administration, and printing still require an explicit grant.</span>
    </div>
    <div class="coach-access-layout">
      <section class="coach-access-list"><div class="coach-access-list-head"><span>Managed coaches</span><button class="btn btn-sm btn-outline" data-action="refreshCoachAccessManager">Refresh</button></div>${list}</section>
      <section class="coach-access-detail">${detail}</section>
    </div>
    ${renderCoachInviteForm()}`;
}

function renderCoachAccessDetail(coach) {
  const permissions = coachAccessDrafts.get(coach.id) || new Set(COACH_ACCESS_DEFAULTS);
  const groups = COACH_ACCESS_GROUPS.map(([label, entries]) => `
    <fieldset class="coach-access-group"><legend>${escapeHtml(label)}</legend>
      ${entries.map(([key, name, description]) => `<label class="coach-access-toggle">
        <input type="checkbox" data-onchange="toggleCoachAccessPermission" data-pass="event" data-coach-id="${escapeAttr(coach.id)}" data-permission="${escapeAttr(key)}"${permissions.has(key) ? " checked" : ""}>
        <span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(description)}</small></span>
      </label>`).join("")}
    </fieldset>`).join("");
  return `<div class="coach-access-detail-head"><div><strong>${escapeHtml(coach.displayName || coach.email)}</strong><span>${escapeHtml(coach.email)}</span></div><span class="coach-access-state">${escapeHtml(coachAccessSummary(permissions))}</span></div>${groups}
    <div class="coach-access-save"><span>Changes take effect on this coach’s next request.</span><button class="btn btn-primary" data-action="saveCoachAccess">Save access</button></div>`;
}

function renderCoachInviteForm() {
  return `<section class="pa-invite-section coach-invite-section">
    <h4 class="pa-invite-heading">Invite a Coach</h4>
    <p>Coaches begin with read-only access to the published team workspace. You can grant specific coach tools after inviting them.</p>
    <div class="pa-invite-form">
      <input type="email" id="coachInviteEmail" class="pa-input" placeholder="Coach email address" autocomplete="off">
      <input type="text" id="coachInviteName" class="pa-input" placeholder="Coach display name" autocomplete="off">
      <button class="btn btn-primary" data-action="submitCoachInvite">Invite coach</button>
    </div>
    <p id="coachInviteStatus" class="pa-invite-status" aria-live="polite"></p>
  </section>`;
}

function selectCoachAccessAccount(id) {
  coachAccessSelectedId = String(id || "");
  renderCoachAccessManager();
}

function toggleCoachAccessPermission(event) {
  const input = event?.target;
  const coachId = String(input?.dataset?.coachId || "");
  const permission = String(input?.dataset?.permission || "");
  if (!coachId || !permission) return;
  const permissions = coachAccessDrafts.get(coachId) || new Set(COACH_ACCESS_DEFAULTS);
  if (input.checked) permissions.add(permission);
  else permissions.delete(permission);
  coachAccessDrafts.set(coachId, permissions);
  const state = document.querySelector(".coach-access-state");
  if (state) state.textContent = coachAccessSummary(permissions);
}

function refreshCoachAccessManager() {
  coachAccessDrafts.clear();
  loadCoachAccessAccounts();
}

async function saveCoachAccess() {
  const coach = coachAccessAccounts.find((candidate) => candidate.id === coachAccessSelectedId);
  if (!coach) return;
  const button = document.querySelector(".coach-access-save .btn");
  if (button) { button.disabled = true; button.textContent = "Saving…"; }
  try {
    const response = await fetch(`/auth/players/${encodeURIComponent(coach.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "set-coach-access", permissions: Array.from(coachAccessDrafts.get(coach.id) || []) }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Unable to save coach access.");
    coach.permissions = data.permissions || [];
    coachAccessDrafts.set(coach.id, new Set(coach.permissions));
    showToast(`Access saved for ${coach.displayName || coach.email}.`, { type: "success", duration: 3000 });
    renderCoachAccessManager();
  } catch (error) {
    showToast(error.message || "Unable to save coach access.", { type: "error", duration: 4200 });
    if (button) { button.disabled = false; button.textContent = "Save access"; }
  }
}

async function submitCoachInvite() {
  const email = document.getElementById("coachInviteEmail")?.value.trim();
  const displayName = document.getElementById("coachInviteName")?.value.trim();
  const status = document.getElementById("coachInviteStatus");
  if (!email || !email.includes("@") || !displayName || !status) {
    if (status) { status.textContent = "Coach name and valid email are required."; status.className = "pa-invite-status pa-invite-status--error"; }
    return;
  }
  status.textContent = "Sending…";
  status.className = "pa-invite-status";
  try {
    const response = await fetch("/auth/players", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ email, displayName, role: "coach" }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Unable to invite coach.");
    document.getElementById("coachInviteEmail").value = "";
    document.getElementById("coachInviteName").value = "";
    status.textContent = data.inviteUrl ? "Coach created. Email is not configured; use the invite link from the account list." : `Invite sent to ${email}.`;
    status.className = "pa-invite-status pa-invite-status--success";
    await loadCoachAccessAccounts();
  } catch (error) {
    status.textContent = error.message || "Network error — try again.";
    status.className = "pa-invite-status pa-invite-status--error";
  }
}
