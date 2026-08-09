/**
 * players-admin.js
 * Coach-only player account management panel.
 *
 * Opens via openPlayersAdmin() — data-action="openPlayersAdmin"
 * Triggered from the Team Settings page.
 */

// ── State ─────────────────────────────────────────────────────────────────────

let _paPlayers = [];
let _paLoadController = null;
let _paRosterFocusId = "";

function normalizePlayerAccountEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizePlayerAccountIdentity(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getPlayerAccountRosterLinkContext() {
  const roster = typeof getTeamRoster === "function" ? getTeamRoster() : [];
  const byAccount = new Map();
  roster.forEach((player) => {
    const account = normalizePlayerAccountEmail(player.accountUsername);
    if (account) byAccount.set(account, player);
  });
  return { roster, byAccount };
}

function formatPlayerAccountRosterLabel(player) {
  const number = String(player?.number || "").trim();
  const name = String(player?.name || "Unnamed player").trim();
  const position = String(player?.primaryPosition || player?.position || "").trim();
  return [number ? `#${number}` : "", name, position].filter(Boolean).join(" · ");
}

function getExactPlayerAccountRosterMatches(players = _paPlayers, roster = getTeamRoster()) {
  const availableRosterByName = new Map();
  roster.filter((player) => !normalizePlayerAccountEmail(player.accountUsername)).forEach((player) => {
    const key = normalizePlayerAccountIdentity(player.name);
    if (!key) return;
    const list = availableRosterByName.get(key) || [];
    list.push(player);
    availableRosterByName.set(key, list);
  });
  const accountNameCounts = new Map();
  players.filter((player) => player.role === "player" && player.status === "active" && player.email).forEach((player) => {
    const key = normalizePlayerAccountIdentity(player.displayName);
    if (key) accountNameCounts.set(key, (accountNameCounts.get(key) || 0) + 1);
  });
  return players.filter((player) => {
    const key = normalizePlayerAccountIdentity(player.displayName);
    return player.role === "player" && player.status === "active" && player.email
      && accountNameCounts.get(key) === 1 && availableRosterByName.get(key)?.length === 1;
  }).map((player) => ({ player, rosterPlayer: availableRosterByName.get(normalizePlayerAccountIdentity(player.displayName))[0] }));
}

function renderPlayerAccountRosterLink(p, context) {
  const account = normalizePlayerAccountEmail(p.email);
  if (p.role !== "player" || !account) {
    return '<div class="pa-roster-link pa-roster-link--not-player"><span>Staff account</span><small>Roster links are for player portal accounts.</small></div>';
  }

  const linkedPlayer = context.byAccount.get(account);
  const options = context.roster.map((rosterPlayer) => {
    const rosterAccount = normalizePlayerAccountEmail(rosterPlayer.accountUsername);
    const belongsToAnotherAccount = rosterAccount && rosterAccount !== account;
    const suffix = belongsToAnotherAccount ? " — linked elsewhere" : "";
    return `<option value="${escapeAttr(rosterPlayer.id)}"${linkedPlayer?.id === rosterPlayer.id ? " selected" : ""}${belongsToAnotherAccount ? " disabled" : ""}>${escapeHtml(`${formatPlayerAccountRosterLabel(rosterPlayer)}${suffix}`)}</option>`;
  }).join("");

  return `
    <label class="pa-roster-link">
      <span>Roster link</span>
      <select data-onchange="linkPlayerAccountToRoster" data-pass="event" data-player-email="${escapeAttr(account)}" aria-label="Roster link for ${escapeHtml(p.displayName || p.email)}">
        <option value="">Not linked to roster</option>
        ${options}
      </select>
      <small>${linkedPlayer ? `Linked to ${escapeHtml(formatPlayerAccountRosterLabel(linkedPlayer))}` : "Connect this login to show the right roster identity in the portal, quizzes, and leaderboards."}</small>
    </label>`;
}

// ── Open / close ──────────────────────────────────────────────────────────────

function openPlayersAdmin(rosterPlayerId = "") {
  const overlay = document.getElementById("playersAdminOverlay");
  if (!overlay) return;
  _paRosterFocusId = String(rosterPlayerId || "").trim();
  overlay.classList.add("visible");
  overlay.removeAttribute("inert");
  overlay.removeAttribute("aria-hidden");
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "playersAdminOverlay",
      scrollElement: overlay.querySelector(".pa-panel") || overlay,
      blocking: true,
      onEscape: () => closePlayersAdmin(),
    });
  }
  loadPlayersAdminList();
}

function closePlayersAdmin(options = {}) {
  const overlay = document.getElementById("playersAdminOverlay");
  if (!overlay) return;
  _paLoadController?.abort();
  _paLoadController = null;
  overlay.classList.remove("visible");
  overlay.setAttribute("inert", "");
  overlay.setAttribute("aria-hidden", "true");
  if (typeof closeLayer === "function") closeLayer("playersAdminOverlay", options);
}

// ── Load & render ─────────────────────────────────────────────────────────────

async function loadPlayersAdminList() {
  const body = document.getElementById("playersAdminBody");
  const overlay = document.getElementById("playersAdminOverlay");
  if (!body || !overlay) return;
  _paLoadController?.abort();
  const controller = new AbortController();
  _paLoadController = controller;
  body.innerHTML = '<p class="pa-loading">Loading player accounts…</p>';

  try {
    const res = await fetch("/auth/players", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Unknown error");
    if (_paLoadController !== controller || !overlay.classList.contains("visible")) return;
    _paPlayers = data.players || [];
    renderPlayersAdminList(_paPlayers, body);
  } catch (err) {
    if (err?.name === "AbortError" || _paLoadController !== controller) return;
    if (!overlay.classList.contains("visible")) return;
    body.innerHTML = `<p class="pa-error">Failed to load players: ${escapeHtml(err.message)}</p>`;
  } finally {
    if (_paLoadController === controller) _paLoadController = null;
  }
}

function renderPlayersAdminList(players, container) {
  const active = players.filter((p) => p.status === "active").length;
  const invited = players.filter((p) => p.status === "invited").length;
  const disabled = players.filter((p) => p.status === "disabled").length;
  const playerAccounts = players.filter((p) => p.role === "player");
  const linkContext = getPlayerAccountRosterLinkContext();
  const linkedAccounts = playerAccounts.filter((p) => linkContext.byAccount.has(normalizePlayerAccountEmail(p.email))).length;
  const exactMatches = getExactPlayerAccountRosterMatches(players, linkContext.roster);
  const focusedRosterPlayer = linkContext.roster.find(
    (player) => String(player.id || "") === _paRosterFocusId,
  );

  const statsHtml = `
    <div class="pa-stats">
      <span class="pa-stat pa-stat--active">✅ ${active} Active</span>
      <span class="pa-stat pa-stat--invited">📨 ${invited} Pending</span>
      ${disabled ? `<span class="pa-stat pa-stat--disabled">🚫 ${disabled} Disabled</span>` : ""}
      <span class="pa-stat pa-stat--links">🔗 ${linkedAccounts}/${linkContext.roster.length} roster links</span>
      ${exactMatches.length ? `<button type="button" class="btn btn-sm btn-outline pa-auto-link" data-action="autoLinkExactPlayerAccounts">Auto-link ${exactMatches.length} exact name${exactMatches.length === 1 ? "" : "s"}</button>` : ""}
    </div>`;

  const listHtml = players.length
    ? players.map((player) => renderPlayerRow(player, linkContext)).join("")
    : '<p class="pa-empty">No player accounts yet. Invite your first player below.</p>';

  setInnerHTML(
    container,
    `${statsHtml}
    ${focusedRosterPlayer ? renderFocusedRosterPlayerLink(focusedRosterPlayer, players, linkContext) : ""}
    <p class="pa-linking-intro">Link each player portal login to one roster record. The roster remains the source of truth for personnel, while the account controls portal identity, quiz credit, and leaderboard names.</p>
    <div class="pa-list">${players.length ? '<div class="pa-list-head" aria-hidden="true"><span>Player account</span><span>Roster link</span><span>Access</span></div>' : ""}${listHtml}</div>
    ${renderInviteForm()}`,
  );
}

function renderFocusedRosterPlayerLink(rosterPlayer, players, context) {
  const currentAccount = normalizePlayerAccountEmail(rosterPlayer.accountUsername);
  const accountOptions = players
    .filter((account) => account.role === "player" && normalizePlayerAccountEmail(account.email))
    .map((account) => {
      const accountEmail = normalizePlayerAccountEmail(account.email);
      const linkedElsewhere = context.byAccount.get(accountEmail);
      const unavailable = linkedElsewhere && linkedElsewhere.id !== rosterPlayer.id;
      const status = account.status === "active" ? "" : ` — ${account.status}`;
      const suffix = unavailable ? " — linked elsewhere" : status;
      return `<option value="${escapeAttr(accountEmail)}"${accountEmail === currentAccount ? " selected" : ""}${unavailable ? " disabled" : ""}>${escapeHtml(`${account.displayName || accountEmail} (${accountEmail})${suffix}`)}</option>`;
    })
    .join("");
  return `<section class="pa-roster-focus" aria-label="Roster account link focus">
    <div>
      <span class="pa-roster-focus__eyebrow">Roster link</span>
      <strong>${escapeHtml(formatPlayerAccountRosterLabel(rosterPlayer))}</strong>
      <small>${currentAccount ? `Currently linked to ${escapeHtml(currentAccount)}.` : "Choose a player portal account to link this roster player."}</small>
    </div>
    <label class="pa-roster-link">
      <span>Player portal account</span>
      <select data-onchange="linkFocusedRosterPlayerAccount" data-pass="event" data-roster-player-id="${escapeAttr(rosterPlayer.id)}" aria-label="Portal account for ${escapeHtml(rosterPlayer.name)}">
        <option value="">Not linked to a portal account</option>
        ${accountOptions}
      </select>
    </label>
    <button type="button" class="btn btn-sm btn-outline" data-action="clearPlayersAdminRosterFocus">Done</button>
  </section>`;
}

function renderPlayerRow(p, linkContext = getPlayerAccountRosterLinkContext()) {
  const statusLabel = { active: "Active", invited: "Pending", disabled: "Disabled" }[p.status] || p.status;
  const statusClass = { active: "pa-badge--active", invited: "pa-badge--invited", disabled: "pa-badge--disabled" }[p.status] || "";

  const lastLogin = p.lastLoginAt
    ? `Last login: ${new Date(p.lastLoginAt * 1000).toLocaleDateString()}`
    : "Never logged in";

  let actions = "";
  if (p.status === "invited") {
    actions = `
      <button class="btn btn-sm pa-action-btn" data-action="playerAdminResend" data-arg="${escapeHtml(p.id)}" title="Resend invite email">Resend</button>
      <button class="btn btn-sm pa-action-btn" data-action="playerAdminCopyLink" data-arg="${escapeHtml(p.id)}" title="Copy invite link">Copy Link</button>`;
  } else if (p.status === "active") {
    actions = `
      <button class="btn btn-sm btn-danger pa-action-btn" data-action="playerAdminDisable" data-arg="${escapeHtml(p.id)}" title="Disable account">Disable</button>`;
  } else if (p.status === "disabled") {
    actions = `
      <button class="btn btn-sm btn-success pa-action-btn" data-action="playerAdminEnable" data-arg="${escapeHtml(p.id)}" title="Reactivate account">Enable</button>`;
  }

  return `
    <div class="pa-row" data-player-id="${escapeHtml(p.id)}">
      <div class="pa-row-info">
        <span class="pa-row-name">${escapeHtml(p.displayName)}</span>
        <span class="pa-row-email">${escapeHtml(p.email)}</span>
        <span class="pa-row-meta">${lastLogin}</span>
      </div>
      ${renderPlayerAccountRosterLink(p, linkContext)}
      <div class="pa-row-actions">
        <span class="pa-badge ${statusClass}">${statusLabel}</span>
        ${actions}
      </div>
    </div>`;
}

function linkPlayerAccountToRoster(event) {
  const select = event?.target;
  const account = normalizePlayerAccountEmail(select?.dataset?.playerEmail);
  const rosterPlayerId = String(select?.value || "").trim();
  if (!select || !account || typeof getTeamRoster !== "function" || typeof saveTeamRoster !== "function") return;

  const roster = getTeamRoster();
  const target = rosterPlayerId ? roster.find((player) => player.id === rosterPlayerId) : null;
  if (rosterPlayerId && !target) {
    renderPlayersAdminList(_paPlayers, document.getElementById("playersAdminBody"));
    return;
  }

  const targetAccount = normalizePlayerAccountEmail(target?.accountUsername);
  if (target && targetAccount && targetAccount !== account) {
    showToast(`${target.name} is already linked to another portal account. Unlink that account first.`, {
      type: "warning",
      duration: 4200,
    });
    renderPlayersAdminList(_paPlayers, document.getElementById("playersAdminBody"));
    return;
  }

  let changed = false;
  roster.forEach((player) => {
    if (normalizePlayerAccountEmail(player.accountUsername) === account && player.id !== rosterPlayerId) {
      player.accountUsername = "";
      changed = true;
    }
  });
  if (target && normalizePlayerAccountEmail(target.accountUsername) !== account) {
    target.accountUsername = account;
    changed = true;
  }

  if (!changed) return;
  saveTeamRoster(roster);
  if (document.getElementById("teamRosterList") && typeof renderTeamSettings === "function") {
    renderTeamSettings();
  }
  renderPlayersAdminList(_paPlayers, document.getElementById("playersAdminBody"));
  showToast(target ? `${target.name} is now linked to ${account}.` : "Roster link removed.", {
    type: "success",
    duration: 2600,
  });
}

function linkFocusedRosterPlayerAccount(event) {
  const select = event?.target;
  const rosterPlayerId = String(select?.dataset?.rosterPlayerId || "").trim();
  const account = normalizePlayerAccountEmail(select?.value);
  if (!select || !rosterPlayerId || typeof getTeamRoster !== "function" || typeof saveTeamRoster !== "function") return;

  const roster = getTeamRoster();
  const target = roster.find((player) => player.id === rosterPlayerId);
  if (!target) return;
  const selectedAccount = account
    ? _paPlayers.find((player) => player.role === "player" && normalizePlayerAccountEmail(player.email) === account)
    : null;
  if (account && !selectedAccount) {
    showToast("That player account is no longer available. Refresh the account list and try again.", {
      type: "warning",
      duration: 3600,
    });
    renderPlayersAdminList(_paPlayers, document.getElementById("playersAdminBody"));
    return;
  }
  const alreadyLinked = account
    ? roster.find((player) => normalizePlayerAccountEmail(player.accountUsername) === account && player.id !== rosterPlayerId)
    : null;
  if (alreadyLinked) {
    showToast(`${account} is already linked to ${alreadyLinked.name}.`, { type: "warning", duration: 3600 });
    renderPlayersAdminList(_paPlayers, document.getElementById("playersAdminBody"));
    return;
  }

  if (normalizePlayerAccountEmail(target.accountUsername) === account) return;
  target.accountUsername = account;
  saveTeamRoster(roster);
  if (document.getElementById("teamRosterList") && typeof renderTeamSettings === "function") {
    renderTeamSettings();
  }
  renderPlayersAdminList(_paPlayers, document.getElementById("playersAdminBody"));
  showToast(account ? `${target.name} is now linked to ${account}.` : `${target.name}'s portal link was removed.`, {
    type: account ? "success" : "info",
    duration: 2800,
  });
}

function clearPlayersAdminRosterFocus() {
  _paRosterFocusId = "";
  const body = document.getElementById("playersAdminBody");
  if (body) renderPlayersAdminList(_paPlayers, body);
}

async function autoLinkExactPlayerAccounts() {
  const roster = getTeamRoster();
  const matches = getExactPlayerAccountRosterMatches(_paPlayers, roster);
  if (!matches.length) {
    showToast("There are no unambiguous exact-name roster matches to link.", { type: "info" });
    return;
  }
  const preview = matches.slice(0, 6).map(({ player, rosterPlayer }) => `• ${rosterPlayer.name} → ${player.email}`).join("\n");
  const more = matches.length > 6 ? `\n• ${matches.length - 6} more` : "";
  const confirmed = typeof showConfirm === "function"
    ? await showConfirm(`Link only exact, unique active-player name matches?\n\n${preview}${more}\n\nNo existing links will be overwritten.`, { title: "Auto-link exact roster matches", icon: "🔗", confirmText: "Link matches" })
    : true;
  if (!confirmed) return;
  matches.forEach(({ player, rosterPlayer }) => { rosterPlayer.accountUsername = normalizePlayerAccountEmail(player.email); });
  saveTeamRoster(roster);
  if (document.getElementById("teamRosterList") && typeof renderTeamSettings === "function") renderTeamSettings();
  renderPlayersAdminList(_paPlayers, document.getElementById("playersAdminBody"));
  showToast(`Linked ${matches.length} roster account${matches.length === 1 ? "" : "s"} from exact names.`, { type: "success" });
}

function renderInviteForm() {
  return `
    <div class="pa-invite-section">
      <h4 class="pa-invite-heading">Invite a Player</h4>
      <div class="pa-invite-form">
        <input type="email" id="paInviteEmail" class="pa-input" placeholder="Email address" autocomplete="off" />
        <input type="text" id="paInviteName" class="pa-input" placeholder="Display name (e.g. Mike Jones)" autocomplete="off" />
        <button class="btn btn-primary" data-action="submitPlayerInvite">Send Invite</button>
      </div>
      <p id="paInviteStatus" class="pa-invite-status" aria-live="polite"></p>
    </div>`;
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function submitPlayerInvite() {
  const emailEl = document.getElementById("paInviteEmail");
  const nameEl = document.getElementById("paInviteName");
  const statusEl = document.getElementById("paInviteStatus");
  if (!emailEl || !nameEl || !statusEl) return;

  const email = emailEl.value.trim();
  const displayName = nameEl.value.trim();

  if (!email || !email.includes("@")) {
    statusEl.textContent = "Valid email required.";
    statusEl.className = "pa-invite-status pa-invite-status--error";
    return;
  }
  if (!displayName) {
    statusEl.textContent = "Display name required.";
    statusEl.className = "pa-invite-status pa-invite-status--error";
    return;
  }

  statusEl.textContent = "Sending…";
  statusEl.className = "pa-invite-status";

  try {
    const res = await fetch("/auth/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, displayName }),
    });
    const data = await res.json();

    if (!data.ok) {
      statusEl.textContent = data.error || "Failed to invite player.";
      statusEl.className = "pa-invite-status pa-invite-status--error";
      return;
    }

    emailEl.value = "";
    nameEl.value = "";

    if (data.inviteUrl) {
      // Email not configured — show copyable link
      statusEl.innerHTML = `Invite link (email not configured): <a href="${escapeHtml(data.inviteUrl)}" target="_blank" rel="noopener">${escapeHtml(data.inviteUrl)}</a>`;
    } else {
      statusEl.textContent = `Invite sent to ${email}!`;
    }
    statusEl.className = "pa-invite-status pa-invite-status--success";

    await loadPlayersAdminList();
  } catch (err) {
    statusEl.textContent = "Network error — try again.";
    statusEl.className = "pa-invite-status pa-invite-status--error";
  }
}

async function playerAdminResend(userId) {
  await _playerAction(userId, "resend", async (data) => {
    if (data.inviteUrl) {
      await showModal(
        `Email not configured. Share this link manually:\n\n${data.inviteUrl}`,
        { title: "Invite Link", icon: "🔗" },
      );
    } else {
      showToast("Invite resent!", { duration: 2500, type: "success" });
    }
  });
}

async function playerAdminCopyLink(userId) {
  await _playerAction(userId, "copy-link", async (data) => {
    if (data.inviteUrl) {
      try {
        await navigator.clipboard.writeText(data.inviteUrl);
        showToast("Invite link copied!", { duration: 2500, type: "success" });
      } catch (_) {
        await showModal(data.inviteUrl, { title: "Copy This Link", icon: "🔗" });
      }
    }
  });
}

async function playerAdminDisable(userId) {
  const ok = await showConfirm(
    "Disable this player's account? They won't be able to log in until re-enabled.",
    { title: "Disable Account", icon: "🚫", confirmText: "Disable", danger: true },
  );
  if (!ok) return;
  await _playerAction(userId, "disable", () => {
    showToast("Account disabled.", { duration: 2500 });
  });
}

async function playerAdminEnable(userId) {
  await _playerAction(userId, "enable", () => {
    showToast("Account enabled.", { duration: 2500, type: "success" });
  });
}

async function _playerAction(userId, action, onSuccess) {
  try {
    const res = await fetch(`/auth/players/${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!data.ok) {
      await showModal(data.error || "Action failed.", { title: "Error", icon: "⚠️" });
      return;
    }
    if (onSuccess) await onSuccess(data);
    await loadPlayersAdminList();
  } catch (_) {
    await showModal("Network error — try again.", { title: "Error", icon: "⚠️" });
  }
}

// ── One-time named administrator bootstrap ──────────────────────────────────
//
// This stays alongside the account-management UI because it is a one-time
// invitation flow, not a new authorization system. The server is the authority
// for whether the current session is the legacy static admin and whether a
// first named administrator can still be created.

let _adminBootstrapStatus = null;
let _adminBootstrapInvite = null;
let _adminBootstrapDraft = { email: "", displayName: "" };
let _adminBootstrapLoadController = null;
let _adminBootstrapSubmitController = null;
let _adminBootstrapSubmitting = false;

function getAdminBootstrapOverlay() {
  return document.getElementById("adminBootstrapOverlay");
}

function isLegacyStaticAdminSession() {
  const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  return user?.role === "admin" && !String(user.d1UserId || "").trim();
}

function adminBootstrapErrorMessage(error, fallback = "Unable to check administrator setup.") {
  const message = String(error?.message || fallback).trim();
  return message || fallback;
}

function getSafeAdminBootstrapInviteUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== "/auth/accept-invite") return "";
    return url.href;
  } catch (_err) {
    return "";
  }
}

function renderAdminBootstrapLoading() {
  const body = document.getElementById("adminBootstrapBody");
  if (!body) return;
  body.innerHTML = '<p class="pa-loading">Checking administrator setup…</p>';
}

function renderAdminBootstrapError(message) {
  const body = document.getElementById("adminBootstrapBody");
  if (!body) return;
  body.innerHTML = `
    <section class="admin-bootstrap-complete">
      <div class="admin-bootstrap-intro">
        <span class="admin-bootstrap-eyebrow">Admin security</span>
        <h4>Administrator setup could not be checked</h4>
        <p>BCOffense did not change any account access.</p>
      </div>
      <p class="admin-bootstrap-notice admin-bootstrap-notice--error" role="alert">${escapeHtml(message)}</p>
      <div class="admin-bootstrap-actions">
        <button type="button" class="btn btn-outline" data-admin-bootstrap="retry">Try again</button>
      </div>
    </section>`;
}

function renderAdminBootstrapComplete() {
  const body = document.getElementById("adminBootstrapBody");
  if (!body || !_adminBootstrapInvite) return;
  const invite = _adminBootstrapInvite;
  const inviteUrl = getSafeAdminBootstrapInviteUrl(invite.inviteUrl);
  const email = String(invite.email || "your email address").trim();
  const delivery = invite.inviteSent
    ? `An invitation was sent to ${email}.`
    : inviteUrl
      ? "An invitation was created. Use the private link below to finish setup."
      : `An invitation was created for ${email}. Check that inbox for the setup link.`;

  body.innerHTML = `
    <section class="admin-bootstrap-complete">
      <div class="admin-bootstrap-intro">
        <span class="admin-bootstrap-eyebrow">Invitation ready</span>
        <h4>Create your personal admin password next</h4>
        <p>${escapeHtml(delivery)} Your current legacy Admin session stays active while you complete this in a separate browser window.</p>
      </div>
      <ol class="admin-bootstrap-steps">
        <li>Open the invitation in a private window or a different browser profile.</li>
        <li>Choose a strong password, then sign in with the new personal account.</li>
        <li>Confirm that the new account opens the full admin workspace.</li>
        <li>Keep the legacy shared Admin login until you deliberately retire it later.</li>
      </ol>
      ${inviteUrl ? `
        <div class="admin-bootstrap-invite-link">
          <strong>Private invitation link</strong>
          <a href="${escapeAttr(inviteUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(inviteUrl)}</a>
          <div><button type="button" class="btn btn-sm btn-outline" data-admin-bootstrap="copy-invite">Copy invitation link</button></div>
        </div>` : ""}
      <p class="admin-bootstrap-notice admin-bootstrap-notice--success">The shared sign-in has not changed. Do not forward an invitation link; it lets its recipient create an administrator password.</p>
      <div class="admin-bootstrap-actions">
        <button type="button" class="btn btn-outline" data-admin-bootstrap="refresh">Check setup again</button>
      </div>
    </section>`;
}

function renderAdminBootstrapSetup() {
  const body = document.getElementById("adminBootstrapBody");
  if (!body) return;
  const email = escapeAttr(_adminBootstrapDraft.email);
  const displayName = escapeAttr(_adminBootstrapDraft.displayName);
  const submitting = _adminBootstrapSubmitting;

  body.innerHTML = `
    <section class="admin-bootstrap-intro">
      <span class="admin-bootstrap-eyebrow">One-time protection</span>
      <h4>Create your personal administrator account</h4>
      <p>This sends an invitation for an individual D1-backed admin login. It does not disable or change the legacy shared Admin sign-in.</p>
    </section>
    <ol class="admin-bootstrap-steps">
      <li>Enter the email address and name you want tied to your personal administrator login.</li>
      <li>Open the invitation yourself and create a new password.</li>
      <li>Test that login before retiring any shared staff credentials.</li>
    </ol>
    <form id="adminBootstrapForm" class="admin-bootstrap-form">
      <div class="admin-bootstrap-form-fields">
        <label for="adminBootstrapEmail">Your email address
          <input id="adminBootstrapEmail" class="pa-input" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" value="${email}" required ${submitting ? "disabled" : ""}>
        </label>
        <label for="adminBootstrapDisplayName">Your display name
          <input id="adminBootstrapDisplayName" class="pa-input" type="text" autocomplete="name" placeholder="e.g. Coach DePierro" value="${displayName}" required ${submitting ? "disabled" : ""}>
        </label>
      </div>
      <div class="admin-bootstrap-form-actions">
        <button type="submit" class="btn btn-primary" ${submitting ? "disabled" : ""}>${submitting ? "Creating invitation…" : "Send my admin invitation"}</button>
        <small>The invitation is for you only. It creates a separate password; it does not use your current shared password.</small>
      </div>
    </form>`;
}

function renderAdminBootstrapReadyStatus() {
  const body = document.getElementById("adminBootstrapBody");
  if (!body) return;
  const legacyStaffEnabled = _adminBootstrapStatus?.legacyStaffEnabled !== false;
  const pendingEmail = String(_adminBootstrapStatus?.pendingInvite?.email || "").trim();
  const hasPendingInvite = Boolean(pendingEmail);
  const submitting = _adminBootstrapSubmitting;
  body.innerHTML = `
    <section class="admin-bootstrap-complete">
      <div class="admin-bootstrap-intro">
        <span class="admin-bootstrap-eyebrow">Named admin ready</span>
        <h4>${hasPendingInvite ? "Your administrator invitation is still pending" : "Your personal administrator account has already been started"}</h4>
        <p>${legacyStaffEnabled
    ? "The legacy shared Admin login is still available as a temporary fallback. Test the personal account before retiring it."
    : "The legacy shared Admin login is no longer enabled."}</p>
      </div>
      ${hasPendingInvite ? `
        <p class="admin-bootstrap-notice">A setup invitation is pending for <strong>${escapeHtml(pendingEmail)}</strong>. If it has not arrived, send a fresh one; the prior link will stop working.</p>` : ""}
      <ol class="admin-bootstrap-steps">
        <li>${hasPendingInvite ? "Open the invitation yourself and set a personal administrator password." : "Sign in with the personal administrator email and password you set from the invitation."}</li>
        <li>Confirm that you can reach Team Settings, admin tools, and recovery controls.</li>
        <li>Keep recovery details in your password manager; do not share personal credentials.</li>
      </ol>
      <div class="admin-bootstrap-actions">
        ${hasPendingInvite ? `<button type="button" class="btn btn-primary" data-admin-bootstrap="resend-pending" ${submitting ? "disabled" : ""}>${submitting ? "Sending invitation…" : "Send a fresh invitation"}</button>` : ""}
        <button type="button" class="btn btn-outline" data-admin-bootstrap="refresh">Check setup again</button>
      </div>
    </section>`;
}

function renderAdminBootstrapAccessNotice() {
  const body = document.getElementById("adminBootstrapBody");
  if (!body) return;
  body.innerHTML = `
    <section class="admin-bootstrap-complete">
      <div class="admin-bootstrap-intro">
        <span class="admin-bootstrap-eyebrow">Admin security</span>
        <h4>This setup is only for the legacy Admin login</h4>
        <p>A named administrator account cannot create another first-admin invitation from this screen.</p>
      </div>
    </section>`;
}

function renderAdminBootstrapBody() {
  if (_adminBootstrapInvite) {
    renderAdminBootstrapComplete();
    return;
  }
  if (_adminBootstrapStatus?.bootstrapRequired === true) {
    renderAdminBootstrapSetup();
    return;
  }
  renderAdminBootstrapReadyStatus();
}

async function loadAdminBootstrapStatus() {
  const overlay = getAdminBootstrapOverlay();
  if (!overlay) return;
  _adminBootstrapLoadController?.abort();
  const controller = new AbortController();
  _adminBootstrapLoadController = controller;
  renderAdminBootstrapLoading();

  try {
    const response = await fetch("/auth/admin-bootstrap", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
    if (_adminBootstrapLoadController !== controller || !overlay.classList.contains("visible")) return;
    _adminBootstrapStatus = data;
    renderAdminBootstrapBody();
  } catch (error) {
    if (error?.name === "AbortError" || _adminBootstrapLoadController !== controller) return;
    if (!overlay.classList.contains("visible")) return;
    renderAdminBootstrapError(adminBootstrapErrorMessage(error));
  } finally {
    if (_adminBootstrapLoadController === controller) _adminBootstrapLoadController = null;
  }
}

function openAdminBootstrap() {
  if (typeof isAdminUser !== "function" || !isAdminUser()) {
    if (typeof showBlockedToast === "function") showBlockedToast();
    return;
  }
  const overlay = getAdminBootstrapOverlay();
  if (!overlay) return;
  overlay.hidden = false;
  overlay.classList.add("visible");
  overlay.removeAttribute("inert");
  overlay.removeAttribute("aria-hidden");
  _adminBootstrapStatus = null;
  _adminBootstrapInvite = null;
  _adminBootstrapDraft = { email: "", displayName: "" };
  _adminBootstrapSubmitting = false;
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "adminBootstrapOverlay",
      scrollElement: overlay.querySelector(".pa-panel") || overlay,
      blocking: true,
      onEscape: () => closeAdminBootstrap(),
    });
  }
  if (!isLegacyStaticAdminSession()) {
    renderAdminBootstrapAccessNotice();
    return;
  }
  loadAdminBootstrapStatus();
}

function closeAdminBootstrap(options = {}) {
  const overlay = getAdminBootstrapOverlay();
  if (!overlay) return;
  _adminBootstrapLoadController?.abort();
  _adminBootstrapSubmitController?.abort();
  _adminBootstrapLoadController = null;
  _adminBootstrapSubmitController = null;
  _adminBootstrapSubmitting = false;
  overlay.classList.remove("visible");
  overlay.setAttribute("inert", "");
  overlay.setAttribute("aria-hidden", "true");
  if (typeof closeLayer === "function") closeLayer("adminBootstrapOverlay", options);
}

async function submitAdminBootstrap(options = {}) {
  const reissuePending = options.reissuePending === true;
  if (_adminBootstrapSubmitting || (!_adminBootstrapStatus?.bootstrapRequired && !reissuePending)) return;
  const emailInput = document.getElementById("adminBootstrapEmail");
  const displayNameInput = document.getElementById("adminBootstrapDisplayName");
  const pendingEmail = String(_adminBootstrapStatus?.pendingInvite?.email || "").trim().toLowerCase();
  const email = reissuePending ? pendingEmail : String(emailInput?.value || "").trim().toLowerCase();
  const displayName = reissuePending ? "" : String(displayNameInput?.value || "").trim();
  _adminBootstrapDraft = { email, displayName };

  if (!email || !email.includes("@") || (!reissuePending && !displayName)) {
    renderAdminBootstrapError("Enter your display name and a valid email address to create an administrator invitation.");
    return;
  }

  const overlay = getAdminBootstrapOverlay();
  if (!overlay || !isLegacyStaticAdminSession()) {
    renderAdminBootstrapAccessNotice();
    return;
  }

  _adminBootstrapSubmitting = true;
  if (reissuePending) renderAdminBootstrapReadyStatus();
  else renderAdminBootstrapSetup();
  const controller = new AbortController();
  _adminBootstrapSubmitController = controller;
  try {
    const response = await fetch("/auth/admin-bootstrap", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reissuePending ? { email } : { email, displayName }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "Unable to create administrator invitation.");
    if (_adminBootstrapSubmitController !== controller || !overlay.classList.contains("visible")) return;
    _adminBootstrapStatus = { ...(_adminBootstrapStatus || {}), bootstrapRequired: false };
    _adminBootstrapInvite = {
      email: data.email || data.user?.email || email,
      inviteSent: data.inviteSent === true || data.emailSent === true,
      inviteUrl: getSafeAdminBootstrapInviteUrl(data.inviteUrl),
    };
    _adminBootstrapDraft = { email: "", displayName: "" };
    renderAdminBootstrapComplete();
  } catch (error) {
    if (error?.name === "AbortError" || _adminBootstrapSubmitController !== controller) return;
    renderAdminBootstrapError(adminBootstrapErrorMessage(error, "Unable to create administrator invitation."));
  } finally {
    if (_adminBootstrapSubmitController === controller) _adminBootstrapSubmitController = null;
    _adminBootstrapSubmitting = false;
  }
}

async function copyAdminBootstrapInvite() {
  const inviteUrl = getSafeAdminBootstrapInviteUrl(_adminBootstrapInvite?.inviteUrl);
  if (!inviteUrl) return;
  try {
    await navigator.clipboard.writeText(inviteUrl);
    showToast("Administrator invitation link copied.", { type: "success", duration: 2800 });
  } catch (_error) {
    await showModal(inviteUrl, { title: "Copy Administrator Invitation", icon: "🔐" });
  }
}

function initAdminBootstrapUi() {
  const trigger = document.getElementById("adminBootstrapTrigger");
  const overlay = getAdminBootstrapOverlay();
  const body = document.getElementById("adminBootstrapBody");
  if (!trigger || !overlay || !body || trigger.dataset.adminBootstrapBound === "true") return;
  trigger.dataset.adminBootstrapBound = "true";

  trigger.addEventListener("click", openAdminBootstrap);
  document.getElementById("adminBootstrapClose")?.addEventListener("click", () => closeAdminBootstrap());
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeAdminBootstrap();
  });
  body.addEventListener("submit", (event) => {
    if (!event.target.matches("#adminBootstrapForm")) return;
    event.preventDefault();
    submitAdminBootstrap();
  });
  body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-bootstrap]");
    if (!button) return;
    const action = button.dataset.adminBootstrap;
    if (action === "retry" || action === "refresh") {
      _adminBootstrapInvite = null;
      _adminBootstrapStatus = null;
      if (isLegacyStaticAdminSession()) loadAdminBootstrapStatus();
      else renderAdminBootstrapAccessNotice();
    } else if (action === "resend-pending") {
      submitAdminBootstrap({ reissuePending: true });
    } else if (action === "copy-invite") {
      copyAdminBootstrapInvite();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAdminBootstrapUi, { once: true });
} else {
  initAdminBootstrapUi();
}
