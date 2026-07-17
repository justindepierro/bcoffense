/**
 * players-admin.js
 * Coach-only player account management panel.
 *
 * Opens via openPlayersAdmin() — data-action="openPlayersAdmin"
 * Triggered from the Team Settings page.
 */

// ── State ─────────────────────────────────────────────────────────────────────

let _paPlayers = [];

// ── Open / close ──────────────────────────────────────────────────────────────

function openPlayersAdmin() {
  const overlay = document.getElementById("playersAdminOverlay");
  if (!overlay) return;
  overlay.classList.add("visible");
  overlay.removeAttribute("inert");
  overlay.removeAttribute("aria-hidden");
  if (typeof openLayer === "function") {
    openLayer(overlay, { id: "players-admin", exclusive: false });
  }
  loadPlayersAdminList();
}

function closePlayersAdmin() {
  const overlay = document.getElementById("playersAdminOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  overlay.setAttribute("inert", "");
  overlay.setAttribute("aria-hidden", "true");
  if (typeof closeLayer === "function") closeLayer("players-admin");
}

// ── Load & render ─────────────────────────────────────────────────────────────

async function loadPlayersAdminList() {
  const body = document.getElementById("playersAdminBody");
  if (!body) return;
  body.innerHTML = '<p class="pa-loading">Loading player accounts…</p>';

  try {
    const res = await fetch("/auth/players");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Unknown error");
    _paPlayers = data.players || [];
    renderPlayersAdminList(_paPlayers, body);
  } catch (err) {
    body.innerHTML = `<p class="pa-error">Failed to load players: ${escapeHtml(err.message)}</p>`;
  }
}

function renderPlayersAdminList(players, container) {
  const active = players.filter((p) => p.status === "active").length;
  const invited = players.filter((p) => p.status === "invited").length;
  const disabled = players.filter((p) => p.status === "disabled").length;

  const statsHtml = `
    <div class="pa-stats">
      <span class="pa-stat pa-stat--active">✅ ${active} Active</span>
      <span class="pa-stat pa-stat--invited">📨 ${invited} Pending</span>
      ${disabled ? `<span class="pa-stat pa-stat--disabled">🚫 ${disabled} Disabled</span>` : ""}
    </div>`;

  const listHtml = players.length
    ? players.map(renderPlayerRow).join("")
    : '<p class="pa-empty">No player accounts yet. Invite your first player below.</p>';

  setInnerHTML(
    container,
    `${statsHtml}
    <div class="pa-list">${players.length ? '<div class="pa-list-head" aria-hidden="true"><span>Player</span><span>Player login</span><span>Status</span><span>Actions</span></div>' : ""}${listHtml}</div>
    ${renderInviteForm()}`,
  );
}

function renderPlayerRow(p) {
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
      <div class="pa-row-actions">
        <span class="pa-badge ${statusClass}">${statusLabel}</span>
        ${actions}
      </div>
    </div>`;
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
