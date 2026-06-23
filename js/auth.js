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

  const AUTH_LOGIN_ROLE_DETAILS = {
    admin: {
      label: "Admin",
      eyebrow: "Full access",
      title: "Admin workspace",
      summary: "Manage playbook imports, cloud backups, staff tools, and every practice workflow.",
      submit: "Enter Admin Workspace",
    },
    coach: {
      label: "Coach",
      eyebrow: "Practice tools",
      title: "Coach workspace",
      summary: "Build scripts, call sheets, wristbands, game plans, and player-ready practice views.",
      submit: "Enter Coach Workspace",
    },
    player: {
      label: "Player",
      eyebrow: "View only",
      title: "Player portal",
      summary: "Open the published practice plan, playbook, wristband, and swipe view without staff controls.",
      submit: "Enter Player Portal",
    },
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
    "switch",
    "open",
    "close",
    "hide",
    "showKeyboard",
    "print",
    "preview",
    "filter",
    "toggleFilter",
    "toggleCollapsible",
    "toggleSir",
    "toggleScript",
    "toggleWb",
    "toggleParent",
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
    /toggleScript/i,
    /toggleWb/i,
    /sort/i,
  ];

  let currentAuthUser = { username: "admin", role: "admin", label: "Admin" };
  let authReady = false;
  let lastBlockedAt = 0;
  const AUTH_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
  const AUTH_SCAN_SELECTOR =
    "[data-action], .tab, input, select, textarea, button, [data-auth-admin-only], [data-auth-edit-only]";
  let authMutationFrame = 0;
  const pendingAuthRoots = new Set();

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

  function getLoginRoleDetails(role) {
    return AUTH_LOGIN_ROLE_DETAILS[role] || AUTH_LOGIN_ROLE_DETAILS.admin;
  }

  function getAuthSessionStorageKey() {
    if (typeof STORAGE_KEYS !== "undefined" && STORAGE_KEYS.AUTH_SESSION) {
      return STORAGE_KEYS.AUTH_SESSION;
    }
    return "authSession";
  }

  function saveStoredAuthUser(user, source = "session") {
    const normalized = normalizeAuthUser(user);
    if (!normalized || !storageManager || typeof storageManager.set !== "function") {
      return;
    }
    storageManager.set(getAuthSessionStorageKey(), {
      user: normalized,
      source,
      savedAt: Date.now(),
    });
  }

  function clearStoredAuthUser() {
    if (!storageManager || typeof storageManager.remove !== "function") return;
    storageManager.remove(getAuthSessionStorageKey());
  }

  function loadStoredAuthUser() {
    if (!storageManager || typeof storageManager.get !== "function") return null;
    const stored = storageManager.get(getAuthSessionStorageKey(), null);
    if (!stored || typeof stored !== "object") return null;
    const normalized = normalizeAuthUser(stored.user);
    if (!normalized) return null;

    // Keep local-dev sessions sticky across refreshes to avoid repeated logins.
    if (isLocalDevHost()) return normalized;

    const savedAt = Number(stored.savedAt || 0);
    if (!Number.isFinite(savedAt) || savedAt <= 0) {
      clearStoredAuthUser();
      return null;
    }
    if (Date.now() - savedAt > AUTH_SESSION_MAX_AGE_MS) {
      clearStoredAuthUser();
      return null;
    }
    return normalized;
  }

  async function fetchAuthSession() {
    try {
      const response = await fetch("/auth/me", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        return { user: null, denied: true, offline: false };
      }
      const data = await response.json();
      return { user: normalizeAuthUser(data.user), denied: false, offline: false };
    } catch (_err) {
      return { user: null, denied: false, offline: true };
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

  function isActionAllowedForRole(action) { return true;
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
      if (el.closest("#pbPrintPanel, .cr-panel")) return true;
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

    applyAuthToTree(document);

    const userBadge = document.getElementById("authUserBadge");
    if (userBadge) {
      const badgeLabel =
        currentAuthUser &&
        (currentAuthUser.label ||
          (currentAuthUser.role
            ? currentAuthUser.role.charAt(0).toUpperCase() + currentAuthUser.role.slice(1)
            : "User"));
      userBadge.textContent = currentAuthUser
        ? `${badgeLabel}: ${currentAuthUser.username}`
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

  function applyAuthToTree(root) {
    if (!root) return;
    if (
      root.nodeType === Node.ELEMENT_NODE &&
      typeof root.matches === "function" &&
      root.matches(AUTH_SCAN_SELECTOR)
    ) {
      applyAuthToElement(root);
    }
    if (typeof root.querySelectorAll !== "function") return;
    root.querySelectorAll(AUTH_SCAN_SELECTOR).forEach((el) => applyAuthToElement(el));
  }

  function queueApplyAuthToPendingRoots() {
    if (authMutationFrame) return;
    authMutationFrame = requestAnimationFrame(() => {
      authMutationFrame = 0;
      pendingAuthRoots.forEach((root) => applyAuthToTree(root));
      pendingAuthRoots.clear();
    });
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
    const initialDetails = getLoginRoleDetails("admin");
    overlay.innerHTML = `
      <div class="auth-login-shell">
        <section class="auth-login-hero" aria-label="Portal overview">
          <div class="auth-login-brand">BCOffense</div>
          <div class="auth-login-hero-kicker">Secure staff and player access</div>
          <h2 id="authLoginHeroTitle">${escapeHtml(initialDetails.title)}</h2>
          <p id="authLoginHeroSummary">${escapeHtml(initialDetails.summary)}</p>
          <div class="auth-login-role-strip" aria-label="Portal roles">
            <span class="auth-login-role-chip">Admin</span>
            <span class="auth-login-role-chip">Coach</span>
            <span class="auth-login-role-chip">Player</span>
          </div>
          <div class="auth-login-highlight-list">
            <div class="auth-login-highlight">
              <strong>Admin control</strong>
              <span>Import data, push backups, and keep staff-only tools locked down.</span>
            </div>
            <div class="auth-login-highlight">
              <strong>Practice operations</strong>
              <span>Jump into scripts, wristbands, game plans, and call sheets after login.</span>
            </div>
            <div class="auth-login-highlight">
              <strong>Player-safe mode</strong>
              <span>Players see the published plan and swipe view without edit controls.</span>
            </div>
          </div>
        </section>
        <form class="auth-login-card" id="authLoginForm" autocomplete="off">
          <div class="auth-login-form-header">
            <div class="auth-login-kicker" id="authLoginRoleEyebrow">${escapeHtml(initialDetails.eyebrow)}</div>
            <h3>Sign in to BCOffense</h3>
            <p id="authLoginRoleSummary">${escapeHtml(initialDetails.summary)}</p>
          </div>
          <div class="auth-login-role-picker" role="group" aria-label="Choose login role">
            ${Object.entries(AUTH_LOGIN_ROLE_DETAILS).map(([role, details]) => `
              <button type="button" class="auth-login-role-option${role === "admin" ? " is-active" : ""}"
                data-login-role="${role}" aria-pressed="${role === "admin" ? "true" : "false"}">
                <span>${escapeHtml(details.label)}</span>
                <small>${escapeHtml(details.eyebrow)}</small>
              </button>
            `).join("")}
          </div>
          <label>
            <span>Username</span>
            <input id="authUsername" type="text" autocomplete="username" autocapitalize="none" spellcheck="false"
              data-auth-allow-input="true" value="admin" required />
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
          <button type="submit" class="btn btn-primary auth-login-submit" id="authLoginSubmit">${escapeHtml(initialDetails.submit)}</button>
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
    const roleSummaryEl = overlay.querySelector("#authLoginRoleSummary");
    const roleEyebrowEl = overlay.querySelector("#authLoginRoleEyebrow");
    const heroTitleEl = overlay.querySelector("#authLoginHeroTitle");
    const heroSummaryEl = overlay.querySelector("#authLoginHeroSummary");
    const setAuthLoginMessage = (text, isStatus = false) => {
      errorEl.textContent = text;
      errorEl.classList.toggle("is-status", isStatus);
    };
    const setSelectedLoginRole = (role, opts = {}) => {
      const details = getLoginRoleDetails(role);
      overlay.querySelectorAll("[data-login-role]").forEach((button) => {
        const active = button.dataset.loginRole === role;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      if (roleEyebrowEl) roleEyebrowEl.textContent = details.eyebrow;
      if (roleSummaryEl) roleSummaryEl.textContent = details.summary;
      if (heroTitleEl) heroTitleEl.textContent = details.title;
      if (heroSummaryEl) heroSummaryEl.textContent = details.summary;
      if (submitEl) submitEl.textContent = details.submit;
      if (opts.fillUsername && usernameEl) usernameEl.value = role;
    };

    overlay.querySelectorAll("[data-login-role]").forEach((button) => {
      button.addEventListener("click", () => {
        setSelectedLoginRole(button.dataset.loginRole, { fillUsername: true });
        passwordEl.focus();
      });
    });

    usernameEl.addEventListener("input", () => {
      const role = usernameEl.value.trim().toLowerCase();
      if (AUTH_LOGIN_ROLE_DETAILS[role]) setSelectedLoginRole(role);
    });

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
        saveStoredAuthUser(
          resolvedUser,
          isLocalDevHost() && (!response.ok || !data.user) ? "local-dev" : "server-login",
        );
        authReady = true;
        overlay.remove();
        applyRoleUi();
        showToast(`Logged in as ${currentAuthUser.label}`, { type: "success" });
        if (!canAccessTab(currentActiveTab)) showTab(getDefaultAuthTab());
        scheduleCloudAutoPull();
      } catch (err) {
        try {
          const fallbackUser = tryLocalDevLogin(
            usernameEl.value.trim().toLowerCase(),
            passwordEl.value,
          );
          if (fallbackUser) {
            currentAuthUser = fallbackUser;
            saveStoredAuthUser(fallbackUser, "local-dev");
            authReady = true;
            overlay.remove();
            applyRoleUi();
            showToast(`Logged in as ${currentAuthUser.label}`, { type: "success" });
            if (!canAccessTab(currentActiveTab)) showTab(getDefaultAuthTab());
            scheduleCloudAutoPull();
            return;
          }
        } catch (_fallbackErr) {
          // Fall through to normal error messaging.
        }
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
    clearStoredAuthUser();
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
    const session = await fetchAuthSession();
    if (session.user) {
      currentAuthUser = session.user;
      saveStoredAuthUser(session.user, "server-session");
    } else {
      const storedUser = loadStoredAuthUser();
      const canUseStored = Boolean(storedUser && (isLocalDevHost() || session.offline));
      if (canUseStored) {
        currentAuthUser = storedUser;
      } else {
        clearStoredAuthUser();
      }
    }

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
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (
            node.nodeType === Node.ELEMENT_NODE ||
            node.nodeType === Node.DOCUMENT_FRAGMENT_NODE
          ) {
            pendingAuthRoots.add(node);
          }
        });
      });
      if (!pendingAuthRoots.size) return;
      queueApplyAuthToPendingRoots();
    });
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
