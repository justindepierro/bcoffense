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
    player: ["playbook", "dashboard", "script", "wristband", "callsheet"],
  };

  const AUTH_ROLE_DEFAULT_TAB = {
    admin: "playbook",
    coach: "playbook",
    player: "playbook",
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
    "loadPublishedPlayerScript",
    "presentPublishedPlayerScript",
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

  function isReadOnlyRole() {
    return Boolean(currentAuthUser && !isAdminUser());
  }

  function showBlockedToast() {
    const now = Date.now();
    if (now - lastBlockedAt < 1200) return;
    lastBlockedAt = now;
    const label = currentAuthUser?.label || "This role";
    showToast(`${label} access is view-only. Log in as admin to make changes.`, {
      type: "warning",
      duration: 3000,
    });
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

  function isActionAllowedForRole(action) {
    if (!currentAuthUser) return false;
    if (isAdminUser()) return true;
    return !actionLooksMutating(action);
  }

  function isInputAllowedForRole(el) {
    if (!currentAuthUser) return false;
    if (isAdminUser()) return true;
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
    if (isAdminUser()) return false;

    if (el.dataset.authAdminOnly === "true") return true;
    if (el.dataset.authEditOnly === "true") return true;
    if (el.matches("[type='file']")) return true;

    const tabName = el.dataset.arg || el.getAttribute("aria-controls");
    if (el.classList.contains("tab") && tabName && !canAccessTab(tabName)) {
      return true;
    }

    const action = el.dataset.action;
    if (action && !isActionAllowedForRole(action)) return true;
    if (action === "triggerClick" && el.dataset.target) {
      const target = document.getElementById(el.dataset.target);
      if (target?.matches("input[type='file'], [data-auth-admin-only='true']")) return true;
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
    document.body.dataset.authRole = currentAuthUser?.role || "locked";
    document.body.dataset.authCanEdit = isAdminUser() ? "true" : "false";
    document.body.dataset.authReadonly = isReadOnlyRole() ? "true" : "false";

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

    if (typeof renderPlayerScriptLauncher === "function") {
      renderPlayerScriptLauncher();
    }
    if (typeof syncPlayPresentationRoleUi === "function") {
      syncPlayPresentationRoleUi();
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
      <form class="auth-login-card" id="authLoginForm" autocomplete="off">
        <div class="auth-login-brand">BCOffense</div>
        <h2>Team Login</h2>
        <p>Sign in to view your role-specific workspace.</p>
        <label>
          <span>Username</span>
          <input id="authUsername" type="text" autocomplete="username" data-auth-allow-input="true" required />
        </label>
        <label>
          <span>Password</span>
          <input id="authPassword" type="password" autocomplete="current-password" data-auth-allow-input="true" required />
        </label>
        <div id="authLoginError" class="auth-login-error" aria-live="polite">${escapeHtml(message)}</div>
        <button type="submit" class="btn btn-primary">Log In</button>
      </form>
    `;
    document.body.appendChild(overlay);
    const usernameEl = overlay.querySelector("#authUsername");
    const passwordEl = overlay.querySelector("#authPassword");
    const errorEl = overlay.querySelector("#authLoginError");
    overlay.querySelector("#authLoginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.textContent = "Checking login...";
      try {
        const response = await fetch("/auth/login", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-BC-Auth-Mode": "json",
          },
          body: JSON.stringify({
            username: usernameEl.value.trim().toLowerCase(),
            password: passwordEl.value,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.user) {
          throw new Error(data.error || "Invalid username or password.");
        }
        currentAuthUser = normalizeAuthUser(data.user);
        authReady = true;
        overlay.remove();
        applyRoleUi();
        showToast(`Logged in as ${currentAuthUser.label}`, { type: "success" });
        if (!canAccessTab(currentActiveTab)) showTab(getDefaultAuthTab());
        scheduleCloudAutoPull();
      } catch (err) {
        errorEl.textContent = err.message || "Login failed.";
        passwordEl.value = "";
        passwordEl.focus();
      }
    });
    requestAnimationFrame(() => usernameEl.focus());
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
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    if (!currentAuthUser) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showLoginOverlay();
      return;
    }

    const actionEl = e.target.closest("[data-action]");
    if (actionEl && !isActionAllowedForRole(actionEl.dataset.action)) {
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
  window.canAccessTab = canAccessTab;
  window.getDefaultAuthTab = getDefaultAuthTab;
  window.canManageSettings = canManageSettings;
  window.isActionAllowedForRole = isActionAllowedForRole;
  window.logoutAuth = logoutAuth;
  window.applyRoleUi = applyRoleUi;
})();
