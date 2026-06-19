(function () {
  const AUTH_ROLE_TABS = {
    admin: [
      "playbook",
      "script",
      "wristband",
      "tendencies",
      "gameplan",
      "callsheet",
      "installation",
      "identity",
      "offensebuilder",
      "dashboard",
    ],
    coach: [
      "playbook",
      "script",
      "wristband",
      "tendencies",
      "gameplan",
      "callsheet",
      "installation",
      "identity",
      "offensebuilder",
      "dashboard",
    ],
    player: ["dashboard", "playbook", "script"],
  };

  const AUTH_ROLE_DEFAULT_TAB = {
    admin: "playbook",
    coach: "playbook",
    player: "dashboard",
  };

  const READ_ONLY_ALLOWED_ACTIONS = new Set([
    "showTab",
    "toggleDarkMode",
    "toggleVisionMode",
    "showKeyboardShortcuts",
    "hideKeyboardShortcuts",
    "reloadPage",
    "backToApp",
    "toggleParentOpen",
    "removeParentOpen",
    "toggleFilterSection",
    "toggleCollapsiblePanel",
    "toggleSirCollapse",
    "closeModal",
    "closeMyPanel",
    "closePlayPreview",
    "closeCellPopup",
    "closeWbHelpOverlay",
    "closeWbHelp",
    "closeWbFindReplaceModal",
    "closeSmartScriptOverlay",
    "closeCallSheetPicker",
    "closeLoadWristbandModal",
    "closeLoadWbToScriptModal",
    "closeCloudSyncModal",
    "openCloudSyncModal",
    "pullCloudBackup",
    "testCloudSyncConnection",
    "clearPbSearch",
    "clearFilters",
    "clearAllFilters",
    "clearAllScriptFilters",
    "clearCsPickerFilters",
    "clearGamePlanFilters",
    "removeFilter",
    "highlightWristbandPlays",
    "switchDisplayTab",
    "switchCard",
    "switchCallSheetPage",
    "toggleColumn",
    "togglePeriodCollapse",
    "toggleCategoryCollapse",
    "collapseAllCategories",
    "expandAllCategories",
    "toggleGamePlanBoxCollapse",
    "collapseAllGamePlanBoxes",
    "expandAllGamePlanBoxes",
    "toggleStatsPanel",
    "toggleTdStats",
    "toggleTaDetail",
    "toggleConstraintDetail",
    "toggleFiltersCollapse",
    "toggleWbFiltersCollapse",
    "toggleMoreFilters",
    "toggleColumnMenu",
    "toggleColumnPanel",
    "toggleQuickToolsMenu",
    "toggleHelpPanel",
    "togglePrintOptionsPanel",
    "toggleScriptDisplayPanel",
    "quickToolHelp",
    "quickToolPrint",
    "quickToolScriptDisplay",
    "quickToolScrollTop",
    "openPrintStudio",
    "openSelectedPlaybookPresentation",
    "openPlaybookPresentation",
    "openScriptPresentation",
    "openPlayReadinessRepModal",
    "openPlayReadinessActionModal",
    "openPlayReadinessPlaybookRepModal",
    "openPlayReadinessPlaybookActionModal",
    "openPlayReadinessPresentationActionModal",
    "showPlayReadinessHistory",
    "showPlayReadinessPlaybookHistory",
    "showPlayReadinessPresentationHistory",
    "quickPlayReadinessScriptScore",
    "quickPlayReadinessPlaybookScore",
    "quickPlayReadinessPresentationScore",
    "updatePlayReadinessReportScore",
    "deletePlayReadinessReport",
    "closePlayReadinessModal",
    "seedPlayReadinessSampleData",
    "loadPublishedPlayerScript",
    "presentPublishedPlayerScript",
    "openPlayerCurrentScriptPresentation",
    "closePlayPresentation",
    "setPlayPresentationMode",
    "setPlayPresentationPosition",
    "togglePlayPresentationPositionLock",
    "movePlayPresentation",
    "openPlaybookSituationCoverage",
    "clearPlaybookSituationFilters",
    "openPlaybookTouchReport",
    "clearPlaybookTouchFilters",
    "openPlaybookConstraintMap",
    "clearPlaybookConstraintFilters",
    "openPlaybookIdentityAlignment",
    "clearPlaybookIdentityFilters",
    "runConstraintCheck",
    "selectTendenciesOpponent",
    "selectPlaybookRow",
    "sortPlaybook",
    "toggleSortDir",
    "copyPlayName",
    "dashOpenCallSheetCategory",
    "showGamePlanBoxInfo",
    "showReadinessModal",
    "showScriptHealthIssues",
    "showSmartInstallReport",
    "showWbShortcutHelp",
    "openGamePlanPrintModal",
    "openGamePlanStats",
    "openGamePlanCoverageMatrix",
    "openGamePlanHealthDetail",
    "openGamePlanTendencyMirror",
    "openGamePlanShortcutsHelp",
    "pbPageNext",
    "pbPagePrev",
    "availPageNext",
    "availPagePrev",
    "goToWizardStep",
    "wizardNext",
    "wizardPrev",
    "cancelWizard",
    "tendenciesGoHome",
    "scrollToTop",
    "jumpToGamePlanBox",
    "filterGamePlanByPlayer",
  ]);

  const ADMIN_ONLY_ACTIONS = new Set([
    "showUpload",
    "exportBackup",
    "importBackup",
    "exportCompleteBackup",
    "importCompleteBackup",
    "saveCloudSyncSettings",
    "pushCloudBackup",
    "handleFileUpload",
  ]);

  const READ_ONLY_ALLOWED_PREFIXES = [
    "close",
    "hide",
    "showKeyboard",
    "print",
    "preview",
    "filter",
    "toggleFilter",
    "toggleCollapsible",
  ];

  const MUTATING_ACTION_PATTERNS = [
    /^(add|autoFill|apply|clear|delete|duplicate|edit|export|import|insert|load|move|open.*(?:Add|CustomOrder|Editor|FindReplace|Layout|Load|Manage|Modal|Move|Picker|Reorder|Sanitize|Smart|Cleanup|Snapshots|Templates)|overwrite|promote|push|remove|rename|reset|reverse|save|select|send|set|sort|swap|toggle|update)/i,
  ];

  const READ_ONLY_INPUT_ALLOW_PATTERNS = [
    /filter/i,
    /search/i,
    /highlight/i,
    /toggleColumn/i,
    /switchDisplayTab/i,
    /updateCount/i,
    /sort/i,
  ];

  let currentAuthUser = null;
  let authReady = false;
  let authApplyTimer = null;
  let lastBlockedAt = 0;

  if (document.body) {
    document.body.classList.add("auth-locked");
  }

  function normalizeAuthUser(user) {
    if (!user || typeof user !== "object") return null;
    const role = String(user.role || "").toLowerCase();
    if (!AUTH_ROLE_TABS[role]) return null;
    return {
      username: String(user.username || role),
      role,
      label: user.label || role.charAt(0).toUpperCase() + role.slice(1),
      loginAt: user.loginAt || "",
      expiresAt: user.expiresAt || "",
    };
  }

  function isLocalDevHost() {
    const host = String(window.location.hostname || "").toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1"
    );
  }

  function tryLocalDevLogin(username, password) {
    if (!isLocalDevHost()) return null;
    const role = String(username || "").trim().toLowerCase();
    if (!AUTH_ROLE_TABS[role]) return null;
    if (!String(password || "").trim()) {
      throw new Error("Enter a password.");
    }
    return normalizeAuthUser({
      username: role,
      role,
      label: role.charAt(0).toUpperCase() + role.slice(1),
      loginAt: new Date().toISOString(),
      expiresAt: "",
    });
  }

  async function fetchAuthSession() {
    try {
      const response = await fetch("/auth/me", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return null;
      const data = await response.json();
      return normalizeAuthUser(data.user);
    } catch (_err) {
      return null;
    }
  }

  function isAdminUser() {
    return currentAuthUser?.role === "admin";
  }

  function canEditUser() {
    return currentAuthUser?.role === "admin" || currentAuthUser?.role === "coach";
  }

  function canAccessTab(tabName) {
    if (!currentAuthUser) return false;
    return (AUTH_ROLE_TABS[currentAuthUser.role] || []).includes(tabName);
  }

  function getDefaultAuthTab() {
    if (!currentAuthUser) return "playbook";
    return AUTH_ROLE_DEFAULT_TAB[currentAuthUser.role] || "playbook";
  }

  function canManageSettings() {
    return isAdminUser();
  }

  function syncPlayerPortalChrome() {
    const isPlayer = currentAuthUser?.role === "player";
    document.body?.classList.toggle("player-portal", isPlayer);
    [
      ["tab-playbook", "Playbook", "Playbook"],
      ["tab-dashboard", "📊 Dashboard", "Home"],
      ["tab-script", "Practice Script Builder", "Practice"],
    ].forEach(([id, defaultLabel, playerLabel]) => {
      const tab = document.getElementById(id);
      if (!tab) return;
      tab.dataset.defaultLabel = tab.dataset.defaultLabel || defaultLabel;
      tab.dataset.playerLabel = tab.dataset.playerLabel || playerLabel;
      const nextLabel = isPlayer ? tab.dataset.playerLabel : tab.dataset.defaultLabel;
      if (tab.textContent.trim() !== nextLabel) tab.textContent = nextLabel;
    });
  }

  function isReadOnlyRole() {
    return Boolean(currentAuthUser && !canEditUser());
  }

  function showBlockedToast() {
    const now = Date.now();
    if (now - lastBlockedAt < 1200) return;
    lastBlockedAt = now;
    const label = currentAuthUser?.label || "This role";
    showToast(`${label} access is view-only. Log in as coach or admin to make changes.`, {
      type: "warning",
      duration: 3000,
    });
  }

  function traceAuthBlocked(reason, el, extra = {}) {
    const actionEl = el instanceof Element ? el.closest("[data-action]") : null;
    const payload = {
      reason,
      action: actionEl?.dataset?.action || "",
      arg: actionEl?.dataset?.arg,
      text: String(actionEl?.textContent || "").trim().slice(0, 80),
      role: currentAuthUser?.role || "none",
      authReady,
      activeTab:
        typeof currentActiveTab !== "undefined"
          ? currentActiveTab
          : document.body?.dataset.activeTab || "",
      ...extra,
    };
    if (typeof traceAppAction === "function") {
      traceAppAction("auth blocked interaction", payload, {}, "warn");
    } else {
      console.warn("[BC auth trace] blocked interaction", payload);
    }
  }

  function actionLooksMutating(action) {
    if (!action) return false;
    if (ADMIN_ONLY_ACTIONS.has(action)) return true;
    if (READ_ONLY_ALLOWED_ACTIONS.has(action)) return false;
    if (READ_ONLY_ALLOWED_PREFIXES.some((prefix) => action.startsWith(prefix))) {
      return false;
    }
    return MUTATING_ACTION_PATTERNS.some((pattern) => pattern.test(action));
  }

  function elementUsesAdminOnlyHandler(el) {
    if (!el?.dataset) return false;
    const handlers = `${el.dataset.action || ""};${el.dataset.oninput || ""};${el.dataset.onchange || ""}`;
    return Array.from(ADMIN_ONLY_ACTIONS).some((action) =>
      new RegExp(`(^|;)\\s*${action}\\s*(;|$)`).test(handlers),
    );
  }

  function isActionAllowedForRole(action) {
    if (!currentAuthUser) return false;
    if (ADMIN_ONLY_ACTIONS.has(action)) return isAdminUser();
    if (canEditUser()) return true;
    return !actionLooksMutating(action);
  }

  function isInputAllowedForRole(el) {
    if (!currentAuthUser) return false;
    if (elementUsesAdminOnlyHandler(el) && !isAdminUser()) return false;
    if (canEditUser()) return true;
    if (el.closest("#authLoginOverlay")) return true;
    if (el.dataset.authAllowInput === "true") return true;
    if (el.closest(".pb-chip-group")) return true;
    if (el.type === "hidden") return true;
    if (el.type === "file") return false;
    if (el.dataset.field || el.dataset.authEditInput === "true") return false;

    const handlers = `${el.dataset.oninput || ""};${el.dataset.onchange || ""}`;
    if (READ_ONLY_INPUT_ALLOW_PATTERNS.some((pattern) => pattern.test(handlers))) {
      return true;
    }

    const id = el.id || "";
    if (/search|filter|sort|highlight/i.test(id)) return true;
    return !el.closest(".panel, #uploadSection, .custom-modal-overlay, .modal-overlay");
  }

  function shouldHideElementForRole(el) {
    if (!currentAuthUser) return false;

    if (el.dataset.authAdminOnly === "true" && !isAdminUser()) return true;
    if (el.dataset.authEditOnly === "true" && !canEditUser()) return true;
    if (elementUsesAdminOnlyHandler(el) && !isAdminUser()) return true;
    if (el.matches("[type='file']") && !canEditUser()) return true;

    const tabName = el.dataset.arg || el.getAttribute("aria-controls");
    if (el.classList.contains("tab") && tabName && !canAccessTab(tabName)) {
      return true;
    }

    const action = el.dataset.action;
    if (action && !isActionAllowedForRole(action)) return true;
    if (action === "triggerClick" && el.dataset.target) {
      const target = document.getElementById(el.dataset.target);
      if (target?.matches("[data-auth-admin-only='true']") && !isAdminUser()) return true;
      if (elementUsesAdminOnlyHandler(target) && !isAdminUser()) return true;
      if (target?.matches("input[type='file']") && !canEditUser()) return true;
    }

    if (currentAuthUser.role === "player") {
      if (el.dataset.authPlayerHide === "true") return true;
      if (el.closest(".pb-print-panel, .cr-panel")) return true;
    }

    return false;
  }

  function applyAuthToElement(el) {
    if (!(el instanceof HTMLElement)) return;

    const hide = shouldHideElementForRole(el);
    if (hide) {
      el.dataset.authHidden = "true";
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    } else if (el.dataset.authHidden === "true") {
      delete el.dataset.authHidden;
      el.hidden = false;
      el.removeAttribute("aria-hidden");
    }

    if (el.matches("input, select, textarea, button")) {
      if (isReadOnlyRole() && !isInputAllowedForRole(el) && !isActionAllowedForRole(el.dataset.action)) {
        el.disabled = true;
        el.dataset.authDisabled = "true";
      } else if (el.dataset.authDisabled === "true") {
        el.disabled = false;
        delete el.dataset.authDisabled;
      }
    }
  }

  function applyRoleUi() {
    if (!document.body) return;
    document.body.classList.toggle("auth-locked", !currentAuthUser);
    ensureLoginOverlayVisible();
    document.body.dataset.authRole = currentAuthUser?.role || "locked";
    document.body.dataset.authCanEdit = canEditUser() ? "true" : "false";
    document.body.dataset.authReadonly = isReadOnlyRole() ? "true" : "false";
    syncPlayerPortalChrome();

    document
      .querySelectorAll("[data-action], .tab, input, select, textarea, button, [data-auth-admin-only], [data-auth-edit-only]")
      .forEach((el) => applyAuthToElement(el));

    const userBadge = document.getElementById("authUserBadge");
    if (userBadge) {
      userBadge.textContent = currentAuthUser
        ? `${currentAuthUser.label}: ${currentAuthUser.username}`
        : "";
      userBadge.hidden = !currentAuthUser;
    }

    const logoutBtn = document.getElementById("authLogoutBtn");
    if (logoutBtn) logoutBtn.hidden = !currentAuthUser;

    if (currentAuthUser && typeof currentActiveTab !== "undefined" && !canAccessTab(currentActiveTab)) {
      showTab(getDefaultAuthTab());
    }
    if (typeof renderDashboard === "function" && currentActiveTab === "dashboard") {
      renderDashboard();
    }

    if (typeof renderPlayerScriptLauncher === "function") {
      renderPlayerScriptLauncher();
    }
    if (typeof requestRenderScript === "function") {
      requestRenderScript();
    }
    if (typeof syncPlayPresentationRoleUi === "function") {
      syncPlayPresentationRoleUi();
    }
    if (typeof queueMobileShellStateSync === "function") {
      queueMobileShellStateSync();
    }
  }

  function scheduleApplyRoleUi() {
    if (authApplyTimer) return;
    authApplyTimer = setTimeout(() => {
      authApplyTimer = null;
      applyRoleUi();
    }, 50);
  }

  function scheduleCloudAutoPull() {
    if (!currentAuthUser) return;
    setTimeout(() => {
      if (typeof autoPullLatestCloudBackup === "function") {
        autoPullLatestCloudBackup();
      }
    }, 700);
  }

  function showLoginOverlay(message = "") {
    document.getElementById("authLoginOverlay")?.remove();
    document.body.classList.add("auth-locked");

    const overlay = document.createElement("div");
    overlay.id = "authLoginOverlay";
    overlay.className = "auth-login-overlay";
    overlay.innerHTML = `
      <div class="auth-login-shell">
        <section class="auth-login-hero" aria-label="Portal overview">
          <div class="auth-login-brand">BCOffense</div>
          <h2>One clean portal for practice, rules, and responsibilities.</h2>
          <p>Log in to open today&apos;s plan, swipe through plays, and stay on the same page as your staff.</p>
          <div class="auth-login-role-strip" aria-label="Portal roles">
            <span class="auth-login-role-chip">Player</span>
            <span class="auth-login-role-chip">Coach</span>
            <span class="auth-login-role-chip">Admin</span>
          </div>
          <div class="auth-login-highlight-list">
            <div class="auth-login-highlight">
              <strong>Today&apos;s Practice</strong>
              <span>Open the published script without digging through staff tools.</span>
            </div>
            <div class="auth-login-highlight">
              <strong>Swipe View</strong>
              <span>Move play to play on a phone or tablet and keep the diagram in view.</span>
            </div>
            <div class="auth-login-highlight">
              <strong>Position Lock</strong>
              <span>Keep your rule pinned to your spot while the staff flips through the script.</span>
            </div>
          </div>
        </section>
        <form class="auth-login-card" id="authLoginForm" autocomplete="off">
          <div class="auth-login-form-header">
            <div class="auth-login-kicker">Team Login</div>
            <h3>Enter your team credentials</h3>
            <p>Use the username and password shared by your staff.</p>
          </div>
          <label>
            <span>Username</span>
            <input id="authUsername" type="text" autocomplete="username" autocapitalize="none" spellcheck="false"
              data-auth-allow-input="true" required />
          </label>
          <label>
            <span>Password</span>
            <div class="auth-login-password-row">
              <input id="authPassword" type="password" autocomplete="current-password" data-auth-allow-input="true"
                required />
              <button type="button" class="auth-password-toggle" id="authPasswordToggle"
                aria-label="Show password" aria-pressed="false">Show</button>
            </div>
          </label>
          <div id="authLoginError" class="auth-login-error${message ? " is-status" : ""}" aria-live="polite">${escapeHtml(message)}</div>
          <button type="submit" class="btn btn-primary auth-login-submit" id="authLoginSubmit">Enter Portal</button>
          <p class="auth-login-help">Need help? Ask a coach or staff member for your login.</p>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    const usernameEl = overlay.querySelector("#authUsername");
    const passwordEl = overlay.querySelector("#authPassword");
    const errorEl = overlay.querySelector("#authLoginError");
    const toggleEl = overlay.querySelector("#authPasswordToggle");
    const submitEl = overlay.querySelector("#authLoginSubmit");
    const formEl = overlay.querySelector("#authLoginForm");
    const setAuthLoginMessage = (text, isStatus = false) => {
      errorEl.textContent = text;
      errorEl.classList.toggle("is-status", isStatus);
    };

    toggleEl?.addEventListener("click", () => {
      const shouldShow = passwordEl.type === "password";
      passwordEl.type = shouldShow ? "text" : "password";
      toggleEl.textContent = shouldShow ? "Hide" : "Show";
      toggleEl.setAttribute("aria-pressed", shouldShow ? "true" : "false");
      toggleEl.setAttribute(
        "aria-label",
        shouldShow ? "Hide password" : "Show password",
      );
      passwordEl.focus();
    });

    formEl.addEventListener("submit", async (e) => {
      e.preventDefault();
      setAuthLoginMessage("Checking login...", true);
      if (submitEl) submitEl.disabled = true;
      try {
        const username = usernameEl.value.trim().toLowerCase();
        const password = passwordEl.value;
        const response = await fetch("/auth/login", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-BC-Auth-Mode": "json",
          },
          body: JSON.stringify({
            username,
            password,
          }),
        });
        const data = await response.json().catch(() => ({}));
        let resolvedUser = null;

        if (response.ok && data.user) {
          resolvedUser = normalizeAuthUser(data.user);
        } else {
          resolvedUser = tryLocalDevLogin(username, password);
          if (!resolvedUser) {
            const endpointHint =
              response.status === 404 && isLocalDevHost()
                ? " Start local auth with `npx wrangler pages dev . --kv=SYNC_KV` or use username admin, coach, or player in localhost fallback mode."
                : "";
            throw new Error(
              (data.error || "Invalid username or password.") + endpointHint,
            );
          }
        }

        currentAuthUser = resolvedUser;
        authReady = true;
        overlay.remove();
        applyRoleUi();
        showToast(`Logged in as ${currentAuthUser.label}`, { type: "success" });
        if (!canAccessTab(currentActiveTab)) showTab(getDefaultAuthTab());
        scheduleCloudAutoPull();
      } catch (err) {
        setAuthLoginMessage(err.message || "Login failed.");
        if (submitEl) submitEl.disabled = false;
        passwordEl.value = "";
        passwordEl.focus();
      }
    });
    requestAnimationFrame(() => usernameEl.focus());
  }

  function ensureLoginOverlayVisible() {
    if (currentAuthUser || !document.body) return;
    if (document.getElementById("authLoginOverlay")) return;
    showLoginOverlay("Secure login required.");
  }

  async function logoutAuth() {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-BC-Auth-Mode": "json" },
      });
    } catch (_err) {
      // Continue with local lockout even if the network is unavailable.
    }
    currentAuthUser = null;
    authReady = true;
    if (typeof resetCloudSyncAutoPull === "function") {
      resetCloudSyncAutoPull();
    }
    applyRoleUi();
    showLoginOverlay("Logged out.");
  }

  function handleBlockedInteraction(e) {
    if (e.target.closest("#authLoginOverlay")) return;

    if (!authReady) {
      traceAuthBlocked("auth-not-ready", e.target);
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (!currentAuthUser) {
      traceAuthBlocked("no-auth-user", e.target);
      e.preventDefault();
      e.stopImmediatePropagation();
      showLoginOverlay();
      return;
    }

    const actionEl = e.target.closest("[data-action]");
    if (actionEl && !isActionAllowedForRole(actionEl.dataset.action)) {
      traceAuthBlocked("action-not-allowed", actionEl, {
        actionLooksMutating: actionLooksMutating(actionEl.dataset.action),
      });
      e.preventDefault();
      e.stopImmediatePropagation();
      showBlockedToast();
      return;
    }

    if (
      (e.type === "input" || e.type === "change") &&
      e.target.matches("input, select, textarea") &&
      !isInputAllowedForRole(e.target)
    ) {
      traceAuthBlocked("input-not-allowed", e.target, {
        inputId: e.target.id || "",
        inputName: e.target.name || "",
      });
      e.preventDefault();
      e.stopImmediatePropagation();
      showBlockedToast();
    }
  }

  async function initServerAuth() {
    currentAuthUser = await fetchAuthSession();
    authReady = true;
    if (!currentAuthUser) {
      showLoginOverlay("Secure login required.");
    }
    applyRoleUi();
    scheduleCloudAutoPull();
  }

  document.addEventListener("click", handleBlockedInteraction, true);
  document.addEventListener("change", handleBlockedInteraction, true);
  document.addEventListener("input", handleBlockedInteraction, true);
  document.addEventListener("submit", handleBlockedInteraction, true);

  document.addEventListener("DOMContentLoaded", () => {
    initServerAuth();
    const observer = new MutationObserver(scheduleApplyRoleUi);
    observer.observe(document.body, { childList: true, subtree: true });
  });

  window.getCurrentAuthUser = () => currentAuthUser;
  window.isAdminUser = isAdminUser;
  window.canEditUser = canEditUser;
  window.canAccessTab = canAccessTab;
  window.getDefaultAuthTab = getDefaultAuthTab;
  window.canManageSettings = canManageSettings;
  window.isActionAllowedForRole = isActionAllowedForRole;
  window.logoutAuth = logoutAuth;
  window.applyRoleUi = applyRoleUi;
})();
