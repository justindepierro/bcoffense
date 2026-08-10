(function () {
  const AUTH_CORE_PLAYER_TABS = { player: ["dashboard", "playbook", "signals", "script"] };
  const AUTH_ROLE_TABS = {
    admin: [
      "playbook",
      "signals",
      "script",
      "wristband",
      "tendencies",
      "gameplan",
      "callsheet",
      "installation",
      "identity",
      "offensebuilder",
      "quiz",
      "dashboard",
    ],
    coach: [
      "playbook",
      "signals",
      "script",
      "wristband",
      "tendencies",
      "gameplan",
      "callsheet",
      "installation",
      "identity",
      "offensebuilder",
      "quiz",
      "dashboard",
    ],
    player: [...AUTH_CORE_PLAYER_TABS.player, "quiz"],
  };

  const AUTH_ROLE_DEFAULT_TAB = {
    admin: "playbook",
    coach: "playbook",
    player: "dashboard",
  };

  // Managed coaches temporarily use the same focused material browser as
  // players. Additional coach-workspace tabs remain deliberately unavailable
  // until that authoring experience is ready to ship.
  const STUDY_PORTAL_TABS = [...AUTH_CORE_PLAYER_TABS.player, "quiz"];

  // D1-backed coaches can study every coaching surface by default. Workspace
  // editing and staff-management capabilities remain explicit grants.
  const MANAGED_COACH_DEFAULT_PERMISSIONS = [
    "tab:dashboard", "tab:playbook", "tab:signals", "tab:script", "tab:wristband",
    "tab:tendencies", "tab:gameplan", "tab:callsheet", "tab:installation", "tab:identity",
    "tab:offensebuilder", "tab:quiz",
    "feature:comments", "feature:questions",
  ];
  const MANAGED_COACH_ACTION_PERMISSIONS = {
    openPlayersAdmin: "feature:manage_players",
    submitPlayerInvite: "feature:manage_players",
    playerAdminResend: "feature:manage_players",
    playerAdminCopyLink: "feature:manage_players",
    playerAdminDisable: "feature:manage_players",
    playerAdminEnable: "feature:manage_players",
    autoLinkExactPlayerAccounts: "feature:manage_players",
    openQuizAssignmentManager: "feature:quiz_assignments",
    openQuizAssignmentForSource: "feature:quiz_assignments",
    assignQuizHomework: "feature:quiz_assignments",
    saveQuizAssignmentDraft: "feature:quiz_assignments",
    createQuizAssignment: "feature:quiz_assignments",
    editQuizAssignmentDraft: "feature:quiz_assignments",
    resendQuizAssignment: "feature:quiz_assignments",
    archiveQuizAssignment: "feature:quiz_assignments",
    openSignalUploadModal: "feature:media_upload",
    openPlayDiagramHealthEdit: "feature:media_upload",
    openPublishMediaModal: "feature:media_upload",
    publishPlayerMedia: "feature:publish_team",
    publishTeamWorkspace: "feature:publish_team",
  };

  function getAuthLoginVariant() {
    const width =
      window.innerWidth ||
      document.documentElement?.clientWidth ||
      window.visualViewport?.width ||
      1024;
    const body = document.body;
    if (body?.classList.contains("is-phone-screen") || width <= 640) {
      return "mobile";
    }
    if (
      body?.classList.contains("shell-tablet") ||
      body?.classList.contains("is-tablet-screen") ||
      (body?.classList.contains("is-mobile-screen") && width <= 1100) ||
      width <= 1024
    ) {
      return "tablet";
    }
    return "desktop";
  }

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
    "openPlayerPortal",
    "openPlayerNotificationSettings",
    "closePlayerPortal",
    "toggleNotifDrawer",
    "markAllNotifsRead",
    "loadMoreNotifs",
    "retryNotifs",
    "enablePushNotifications",
    "disablePushNotifications",
    "subscribeToPlayerNotifications",
    "ppFilter",
    "retryPlayerPortal",
    "loadMorePlayerPortal",
    "pportOpenDiscussion",
    "refreshPlayerTeamApp",
    "installPlayerA2HS",
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
    "clearPbSearch",
    "clearFilters",
    "clearAllFilters",
    "applyPlayerPlaybookFilter",
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
    "toggleScriptReadinessPanel",
    "quickToolHelp",
    "quickToolPrint",
    "quickToolScriptDisplay",
    "quickToolScrollTop",
    "openPrintStudio",
    "openSelectedPlaybookPresentation",
    "openPlaybookPresentation",
    "openPlayerPlaybookFilters",
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
    "loadPublishedPlayerScript",
    "presentPublishedPlayerScript",
    "openPlayerCurrentScriptPresentation",
    "openPlayerQuizHub",
    "openPlayerQuizHubForScript",
    "openPlayerQuizHubForCurrentScript",
    "closePlayerQuizHub",
    "startAuthoritativePlayerQuiz",
    "answerAuthoritativeQuiz",
    "completeAuthoritativeQuiz",
    "closeAuthoritativeQuiz",
    "setPlayerQuizPosition",
    "setPlayerQuizPositionMode",
    "setPlayerQuizMode",
    "setPlayerQuizSource",
    "toggleSignalGameCategory",
    "setPlayerQuizScriptSource",
    "startPlayerQuizHubScript",
    "startPlayerQuizHubSelection",
    "startRecommendedPlayerQuiz",
    "startPlayerQuizHubGamePlan",
    "startPlayerQuizHubSignals",
    "startPlayerScriptQuiz",
    "startScriptQuiz",
    "closeScriptQuiz",
    "closeScriptQuizToHub",
    "closeScriptQuizToPractice",
    "resumeScriptQuiz",
    "saveAndCloseScriptQuiz",
    "endScriptQuiz",
    "resumePlayerQuizDraft",
    "discardPlayerQuizDraft",
    "setPlayerLeaderboardView",
    "setSignalLeaderboardMode",
    "toggleScriptQuizShuffle",
    "revealScriptQuizAnswer",
    "answerScriptQuizChoice",
    "nextScriptQuizPlay",
    "prevScriptQuizPlay",
    "closePlayPresentation",
    "closePlayerPlaybookFilters",
    "setPlayPresentationMode",
    "setPlayPresentationPosition",
    "togglePlayPresentationPositionLock",
    "movePlayPresentation",
    "togglePresentationDiscussion",
    "openPresentationDiscussion",
    "openPlayPresentationSignals",
    "closePresentationDiscussion",
    "retryPresentationDiscussion",
    "askPresentationQuestion",
    "discAskCoachQuestion",
    "discToggleQCategory",
    "submitDiscPost",
    "loadMoreDiscussion",
    "setDiscFilter",
    "toggleDiscReaction",
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
    "openCloudSyncModal",
    "saveCloudSyncSettings",
    "pushCloudBackup",
    "pullCloudBackup",
    "testCloudSyncConnection",
    "syncPlayImagesToCloud",
    "handleFileUpload",
  ]);

  // Player devices consume a signed, read-only release. They never own the
  // team workspace, so backup/export/storage controls must stay unavailable
  // even if an old menu clone or a stale cached node is still present.
  const PLAYER_DATA_MANAGEMENT_ACTIONS = new Set([
    "exportPlaybookCSV",
    "exportBackup",
    "importBackup",
    "exportCompleteBackup",
    "importCompleteBackup",
    "showStorageInfo",
    "openCloudSyncModal",
    "saveCloudSyncSettings",
    "pushCloudBackup",
    "pullCloudBackup",
    "testCloudSyncConnection",
    "syncPlayImagesToCloud",
    "retryWorkspaceSyncWork",
    "showUpload",
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
    /toggleWb/i,
    /sort/i,
  ];

  let currentAuthUser = null;
  let authReady = false;
  let authReadyResolved = false;
  let resolveAuthReadyPromise;
  const authReadyPromise = new Promise((resolve) => {
    resolveAuthReadyPromise = resolve;
  });
  let lastBlockedAt = 0;
  const AUTH_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
  const AUTH_SCAN_SELECTOR =
    "[data-action], .tab, input, select, textarea, button, [data-auth-admin-only], [data-auth-edit-only], [data-auth-player-hide]";
  let authMutationFrame = 0;
  const pendingAuthRoots = new Set();
  let authFetchBoundaryInstalled = false;
  let authSessionRecoverySignaled = false;
  let accountSecuritySubmitting = false;
  let accountSecurityRequestGeneration = 0;
  let accountSecurityAbortController = null;

  if (document.body) {
    document.body.classList.add("auth-locked");
  }

  function resolveAuthReady() {
    if (authReadyResolved) return;
    authReadyResolved = true;
    if (typeof resolveAuthReadyPromise === "function") {
      resolveAuthReadyPromise(currentAuthUser);
    }
  }

  function isProtectedSameOriginRequest(input) {
    try {
      const rawUrl = input instanceof Request ? input.url : input?.url || input;
      const url = new URL(String(rawUrl || ""), window.location.href);
      if (url.origin !== window.location.origin) return false;
      return ["/admin/", "/api/", "/clips/", "/images/", "/media/", "/player/", "/sync/", "/workspace/"]
        .some((prefix) => url.pathname.startsWith(prefix));
    } catch (_err) {
      return false;
    }
  }

  // Every protected server route already validates the HttpOnly session cookie.
  // This small boundary gives every caller the same deterministic response when
  // that cookie expires, including older feature code that predates the shared
  // media and player-release clients. Authentication endpoints themselves are
  // intentionally excluded so an invalid login remains an inline form error.
  function installAuthFetchBoundary() {
    if (authFetchBoundaryInstalled || typeof window.fetch !== "function") return;
    authFetchBoundaryInstalled = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function authenticatedFetch(input, init) {
      const response = await nativeFetch(input, init);
      if (
        response?.status === 401 &&
        currentAuthUser &&
        !authSessionRecoverySignaled &&
        isProtectedSameOriginRequest(input)
      ) {
        authSessionRecoverySignaled = true;
        window.dispatchEvent(new CustomEvent("bc-auth-session-required", {
          detail: { message: "Your secure session ended. Sign in to continue." },
        }));
      }
      return response;
    };
  }

  function normalizeAuthUser(user) {
    if (!user || typeof user !== "object") return null;
    const role = String(user.role || "").toLowerCase();
    if (!AUTH_ROLE_TABS[role]) return null;
    return {
      username: String(user.username || role),
      role,
      label: user.label || role.charAt(0).toUpperCase() + role.slice(1),
      // The server derives both fields from the signed/validated principal.
      // Keep them on the browser auth model so a cached player release can be
      // tied to the exact team and player who is signed in.
      teamId: String(user.teamId || "").trim(),
      d1UserId: String(user.d1UserId || "").trim(),
      loginAt: user.loginAt || "",
      expiresAt: user.expiresAt || "",
      managedCoach: role === "coach" && user.managedCoach === true,
      permissions: role === "coach" && user.managedCoach === true
        ? [...new Set((Array.isArray(user.permissions) ? user.permissions : MANAGED_COACH_DEFAULT_PERMISSIONS)
          .map((key) => String(key || "").trim()).filter(Boolean))]
        : [],
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
    const _sessionMaxAge = normalized.role === "player" ? 7 * 24 * 60 * 60 * 1000 : AUTH_SESSION_MAX_AGE_MS;
    if (Date.now() - savedAt > _sessionMaxAge) {
      clearStoredAuthUser();
      return null;
    }
    return normalized;
  }

  async function fetchAuthSession() {
    const controller =
      typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), 3500)
      : 0;
    try {
      // Reuse the request warmed in index.html's <head> when available so the
      // round-trip overlaps script parsing instead of running after it.
      const warmed = window.__bcAuthMePrefetch;
      window.__bcAuthMePrefetch = null;
      let response;
      if (warmed) {
        response = controller
          ? await Promise.race([
              warmed,
              new Promise((_, reject) => {
                controller.signal.addEventListener("abort", () =>
                  reject(new DOMException("Aborted", "AbortError")),
                );
              }),
            ])
          : await warmed;
      } else {
        response = await fetch("/auth/me", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller?.signal,
        });
      }
      if (!response.ok) {
        return { user: null, denied: true, offline: false };
      }
      const data = await response.json();
      return { user: normalizeAuthUser(data.user), denied: false, offline: false };
    } catch (err) {
      return {
        user: null,
        denied: false,
        offline: true,
        timedOut: err?.name === "AbortError",
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function isAdminUser() {
    return currentAuthUser?.role === "admin";
  }

  function isManagedCoachUser() {
    return currentAuthUser?.role === "coach" && currentAuthUser?.managedCoach === true;
  }

  function hasManagedCoachPermission(permission) {
    if (!isManagedCoachUser()) return currentAuthUser?.role === "coach" || isAdminUser();
    return currentAuthUser.permissions.includes(permission);
  }

  function canEditUser() {
    return currentAuthUser?.role === "admin" ||
      (currentAuthUser?.role === "coach" && (!isManagedCoachUser() || hasManagedCoachPermission("feature:edit_workspace")));
  }

  function canAccessTab(tabName) {
    if (!currentAuthUser) return false;
    if (isManagedCoachUser()) {
      return STUDY_PORTAL_TABS.includes(tabName) &&
        hasManagedCoachPermission(`tab:${tabName}`);
    }
    return (AUTH_ROLE_TABS[currentAuthUser.role] || []).includes(tabName);
  }

  function getDefaultAuthTab() {
    if (!currentAuthUser) return "playbook";
    if (isManagedCoachUser()) {
      return (AUTH_ROLE_TABS.coach || []).find((tab) => canAccessTab(tab)) || "playbook";
    }
    return AUTH_ROLE_DEFAULT_TAB[currentAuthUser.role] || "playbook";
  }

  function canManageSettings() {
    return isAdminUser();
  }

  function syncPlayerPortalChrome() {
    const isPlayer = currentAuthUser?.role === "player";
    // Managed coaches are study-first for now. They use the same calm,
    // load-and-study surfaces as players; admin retains the unfinished live
    // coach-mode/editor workflow on phones and tablets.
    const isStudyPortal = isPlayer || isManagedCoachUser();
    document.body?.classList.toggle("player-portal", isStudyPortal);
    document.body?.classList.toggle("coach-study-portal", isManagedCoachUser());
    const dashboardTab = document.getElementById("tab-dashboard");
    const playbookTab = document.getElementById("tab-playbook");
    const tabStrip = playbookTab?.parentElement;
    const utilitiesWrap = document.querySelector(".tabs-utilities");
    const utilitiesMenu = utilitiesWrap?.querySelector(".tabs-utilities-menu");
    if (dashboardTab && tabStrip && utilitiesMenu) {
      if (isStudyPortal) {
        dashboardTab.classList.add("tab");
        dashboardTab.setAttribute("role", "tab");
        dashboardTab.setAttribute("aria-controls", "dashboard");
        dashboardTab.dataset.shortLabel = "Home";
        tabStrip.insertBefore(dashboardTab, playbookTab);
      } else {
        dashboardTab.classList.remove("tab");
        dashboardTab.setAttribute("role", "menuitem");
        dashboardTab.removeAttribute("aria-controls");
        delete dashboardTab.dataset.shortLabel;
        utilitiesMenu.insertBefore(dashboardTab, utilitiesMenu.firstElementChild);
      }
    }
    if (utilitiesWrap) utilitiesWrap.hidden = isStudyPortal;
    // Study-first coaches can use the same personal questions inbox as players.
    const portalBtn = document.getElementById("playerPortalBtn");
    if (portalBtn) portalBtn.hidden = !isStudyPortal;
    [
      ["tab-playbook", "Playbook", "Playbook"],
      ["tab-signals", "Signals", "Signals"],
      ["tab-dashboard", "📊 Dashboard", "Home"],
      ["tab-script", "Practice Script Builder", "Practice"],
      ["tab-quiz", "Quiz", "Quiz"],
    ].forEach(([id, defaultLabel, playerLabel]) => {
      const tab = document.getElementById(id);
      if (!tab) return;
      tab.dataset.defaultLabel = tab.dataset.defaultLabel || defaultLabel;
      tab.dataset.playerLabel = tab.dataset.playerLabel || playerLabel;
      const nextLabel = isStudyPortal ? tab.dataset.playerLabel : tab.dataset.defaultLabel;
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
    const copy = isManagedCoachUser()
      ? "Your coach access is view-only. Ask an administrator to grant that tool."
      : `${label} access is view-only. Log in as coach or admin to make changes.`;
    showToast(copy, {
      type: "warning",
      duration: 3000,
    });
  }

  function getAccountSecurityOverlay() {
    return document.getElementById("accountSecurityOverlay");
  }

  function hasPersonalAccount() {
    return Boolean(currentAuthUser?.d1UserId);
  }

  function setAccountSecurityStatus(message = "", type = "") {
    const status = document.getElementById("accountSecurityStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", type === "error");
    status.classList.toggle("is-success", type === "success");
  }

  function setAccountSecuritySubmitting(isSubmitting) {
    accountSecuritySubmitting = Boolean(isSubmitting);
    const submit = document.getElementById("accountSecuritySubmit");
    if (submit) submit.disabled = accountSecuritySubmitting;
  }

  // Closing and reopening this form must create a fresh async boundary. A
  // password response from an earlier dialog can otherwise reset fields or
  // overwrite the status of the newly opened dialog.
  function invalidateAccountSecurityRequest() {
    accountSecurityRequestGeneration += 1;
    const controller = accountSecurityAbortController;
    accountSecurityAbortController = null;
    setAccountSecuritySubmitting(false);
    controller?.abort();
  }

  function isCurrentAccountSecurityRequest(generation) {
    return (
      generation === accountSecurityRequestGeneration &&
      hasPersonalAccount() &&
      getAccountSecurityOverlay()?.classList.contains("visible")
    );
  }

  function syncAccountSecurityUi() {
    document.querySelectorAll("#accountSecurityHeaderTrigger, #accountSecurityMenuItem").forEach((trigger) => {
      trigger.hidden = !hasPersonalAccount();
    });
    const overlay = getAccountSecurityOverlay();
    if (!hasPersonalAccount()) {
      if (overlay?.classList.contains("visible")) {
        closeAccountSecurity({ returnFocus: false });
      } else {
        invalidateAccountSecurityRequest();
      }
    }
  }

  function openAccountSecurity() {
    if (!hasPersonalAccount()) {
      showToast("Password changes are available through personal BCOffense accounts.", {
        type: "warning",
        duration: 3500,
      });
      return false;
    }
    const overlay = getAccountSecurityOverlay();
    if (!overlay) return false;
    const form = document.getElementById("accountSecurityForm");
    invalidateAccountSecurityRequest();
    form?.reset();
    setAccountSecurityStatus();
    overlay.classList.add("visible");
    overlay.removeAttribute("inert");
    overlay.setAttribute("aria-hidden", "false");
    if (typeof openLayer === "function") {
      openLayer(overlay, {
        id: "accountSecurityOverlay",
        scrollElement: overlay.querySelector(".pa-panel") || overlay,
        blocking: true,
        onEscape: () => closeAccountSecurity(),
      });
    }
    requestAnimationFrame(() => document.getElementById("accountSecurityCurrentPassword")?.focus());
    return true;
  }

  function closeAccountSecurity(options = {}) {
    const overlay = getAccountSecurityOverlay();
    invalidateAccountSecurityRequest();
    if (!overlay) return;
    document.getElementById("accountSecurityForm")?.reset();
    setAccountSecurityStatus();
    overlay.classList.remove("visible");
    overlay.setAttribute("inert", "");
    overlay.setAttribute("aria-hidden", "true");
    if (typeof closeLayer === "function") closeLayer("accountSecurityOverlay", options);
  }

  async function submitAccountSecurityPassword(event) {
    event.preventDefault();
    if (accountSecuritySubmitting || !hasPersonalAccount()) return;

    const currentPassword = String(document.getElementById("accountSecurityCurrentPassword")?.value || "");
    const newPassword = String(document.getElementById("accountSecurityNewPassword")?.value || "");
    const confirmPassword = String(document.getElementById("accountSecurityConfirmPassword")?.value || "");
    if (newPassword !== confirmPassword) {
      setAccountSecurityStatus("The new passwords do not match.", "error");
      document.getElementById("accountSecurityConfirmPassword")?.focus();
      return;
    }
    if (newPassword.length < 10 || newPassword.length > 128) {
      setAccountSecurityStatus("Your new password must be between 10 and 128 characters.", "error");
      document.getElementById("accountSecurityNewPassword")?.focus();
      return;
    }

    const requestGeneration = ++accountSecurityRequestGeneration;
    const controller =
      typeof AbortController === "function" ? new AbortController() : null;
    accountSecurityAbortController = controller;
    setAccountSecuritySubmitting(true);
    setAccountSecurityStatus("Updating password…");
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
        signal: controller?.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to update your password.");
      }
      if (!isCurrentAccountSecurityRequest(requestGeneration)) return;
      document.getElementById("accountSecurityForm")?.reset();
      setAccountSecurityStatus("Password updated. Other signed-in devices have been signed out.", "success");
    } catch (error) {
      if (!isCurrentAccountSecurityRequest(requestGeneration) || error?.name === "AbortError") return;
      setAccountSecurityStatus(String(error?.message || "Unable to update your password."), "error");
    } finally {
      if (!isCurrentAccountSecurityRequest(requestGeneration)) return;
      if (accountSecurityAbortController === controller) {
        accountSecurityAbortController = null;
      }
      setAccountSecuritySubmitting(false);
    }
  }

  function initAccountSecurityUi() {
    document.getElementById("accountSecurityForm")?.addEventListener("submit", submitAccountSecurityPassword);
    syncAccountSecurityUi();
  }

  function closeAboutBCOffense() {
    document.getElementById("aboutBCOffenseOverlay")?.remove();
  }

  function closeBCOffenseTerms() {
    document.getElementById("bcOffenseTermsOverlay")?.remove();
  }

  function openBCOffenseTerms() {
    closeAboutBCOffense();
    closeBCOffenseTerms();
    const overlay = document.createElement("div");
    overlay.id = "bcOffenseTermsOverlay";
    overlay.className = "modal-overlay about-bcoffense-overlay";
    overlay.dataset.action = "closeBCOffenseTermsOverlay";
    overlay.innerHTML = `
      <section class="modal-content modal-content-sm about-bcoffense-modal" role="dialog" aria-modal="true" aria-labelledby="bcOffenseTermsTitle">
        <div class="modal-header">
          <div>
            <div class="about-bcoffense-kicker">Private team software</div>
            <h2 id="bcOffenseTermsTitle">Terms of Use</h2>
          </div>
          <button type="button" class="modal-close" data-action="closeBCOffenseTerms" aria-label="Close Terms of Use">&times;</button>
        </div>
        <div class="about-bcoffense-body about-bcoffense-terms">
          <p><strong>Effective: 2026.</strong> By accessing or using BCOffense, you agree to these Terms of Use.</p>
          <h3>1. Authorized use</h3>
          <p>BCOffense is a private workspace for Burke Catholic Football. Access is limited to people authorized by the team or the copyright owner, and only for legitimate team operations, coaching, player study, and related football activities.</p>
          <h3>2. Accounts and security</h3>
          <p>Keep your sign-in credentials private. Do not share accounts, attempt to access another user’s information, or bypass access controls. Report suspected unauthorized access promptly.</p>
          <h3>3. Team data and media</h3>
          <p>Practice plans, playbook information, player assignments, video, diagrams, signals, and related materials are confidential team materials. Use them only within the authorized team context and do not publish, forward, download for outside use, or disclose them without permission.</p>
          <h3>4. Ownership and restrictions</h3>
          <p>BCOffense and its original software, design, documentation, and content are protected by copyright and other applicable law. You may not copy, modify, reverse engineer, sell, sublicense, redistribute, or create a competing product from any part of BCOffense without prior written permission from Justin DePierro.</p>
          <h3>5. Availability and changes</h3>
          <p>BCOffense is provided for private team use. Features, access, and availability may change, be suspended, or be removed as needed for security, maintenance, or team operations.</p>
          <h3>6. Questions</h3>
          <p>For permission requests, access questions, or concerns about these terms, contact <a href="mailto:jdepierro@burkecatholic.org">jdepierro@burkecatholic.org</a>.</p>
          <p class="about-bcoffense-legal-note">These Terms of Use describe the current private-use policy and are not a substitute for legal advice. Consider attorney review before offering BCOffense outside the team.</p>
        </div>
        <footer class="about-bcoffense-footer">© 2026 Justin DePierro. All rights reserved.</footer>
      </section>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    overlay.querySelector("[data-action='closeBCOffenseTerms']")?.focus();
  }

  function openAboutBCOffense() {
    closeAboutBCOffense();
    const overlay = document.createElement("div");
    overlay.id = "aboutBCOffenseOverlay";
    overlay.className = "modal-overlay about-bcoffense-overlay";
    overlay.dataset.action = "closeAboutBCOffenseOverlay";
    overlay.innerHTML = `
      <section class="modal-content modal-content-sm about-bcoffense-modal" role="dialog" aria-modal="true" aria-labelledby="aboutBCOffenseTitle">
        <div class="modal-header">
          <div>
            <div class="about-bcoffense-kicker">Private team workspace</div>
            <h2 id="aboutBCOffenseTitle">About BCOffense</h2>
          </div>
          <button type="button" class="modal-close" data-action="closeAboutBCOffense" aria-label="Close About BCOffense">&times;</button>
        </div>
        <div class="about-bcoffense-body">
          <p>BCOffense is a private football operations workspace built for Burke Catholic Football.</p>
          <p>It brings the team playbook, practice preparation, game planning, player study, and secure publishing workflow into one protected system.</p>
          <h3>Built for</h3>
          <ul>
            <li>Playbook organization, diagrams, clips, and signals</li>
            <li>Practice scripts, player assignments, wristbands, and call sheets</li>
            <li>Game plans, opponent tendencies, and game-week preparation</li>
            <li>Player-ready study materials, quizzes, and published practice plans</li>
            <li>Secure team workspace sync, protected media, and recovery tools</li>
          </ul>
          <div class="about-bcoffense-notice">
            <strong>Private use notice</strong>
            <span>This software is maintained for Burke Catholic Football. It is not offered for public sale, redistribution, copying, or reuse without written permission from the copyright holder.</span>
          </div>
          <p class="about-bcoffense-contact">Questions or permissions: <a href="mailto:jdepierro@burkecatholic.org">jdepierro@burkecatholic.org</a></p>
          <button type="button" class="auth-login-about-btn" data-action="openBCOffenseTerms">Read Terms of Use</button>
        </div>
        <footer class="about-bcoffense-footer">© 2026 Justin DePierro. All rights reserved.</footer>
      </section>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    overlay.querySelector("[data-action='closeAboutBCOffense']")?.focus();
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
    if (currentAuthUser.role === "player" && PLAYER_DATA_MANAGEMENT_ACTIONS.has(action)) return false;
    if (ADMIN_ONLY_ACTIONS.has(action)) return isAdminUser();
    if (isManagedCoachUser()) {
      const requiredPermission = MANAGED_COACH_ACTION_PERMISSIONS[action];
      if (requiredPermission) return hasManagedCoachPermission(requiredPermission);
      if (action === "submitDiscPost" || action === "submitDiscReply" || action === "deleteDiscPost" || action === "loadMoreDiscussion" || action === "loadMoreDiscReplies") {
        return hasManagedCoachPermission("feature:comments");
      }
      if (/question|ask/i.test(action)) return hasManagedCoachPermission("feature:questions");
      if (canEditUser()) return true;
      return !actionLooksMutating(action);
    }
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
    if (
      tabName &&
      (el.classList.contains("tab") || el.dataset.action === "showTab") &&
      !canAccessTab(tabName)
    ) {
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

    if (currentAuthUser.role === "player" || isManagedCoachUser()) {
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

  let _applyRoleUiRafId = null;
  function applyRoleUi() {
    if (!document.body) return;
    document.body.classList.toggle("auth-locked", !currentAuthUser);
    removeLoginOverlayIfAuthenticated();
    ensureLoginOverlayVisible();
    document.body.dataset.authRole = currentAuthUser?.role || "locked";
    document.body.dataset.authCanEdit = canEditUser() ? "true" : "false";
    document.body.dataset.authReadonly = isReadOnlyRole() ? "true" : "false";
    document.body.dataset.authManagedCoach = isManagedCoachUser() ? "true" : "false";
    document.body.dataset.authStudyPortal =
      currentAuthUser?.role === "player" || isManagedCoachUser() ? "true" : "false";
    syncPlayerPortalChrome();

    // Item 50: apply (or clear) player portal accent color
    if (currentAuthUser?.role === "player") {
      const _branding = storageManager.get(STORAGE_KEYS.PLAYER_PORTAL_BRANDING, {});
      if (_branding?.accent) {
        document.documentElement.style.setProperty("--color-primary", _branding.accent);
      } else {
        document.documentElement.style.removeProperty("--color-primary");
      }
    } else {
      document.documentElement.style.removeProperty("--color-primary");
    }

    // Item 41: defer expensive DOM scan to one rAF per state change
    if (_applyRoleUiRafId) cancelAnimationFrame(_applyRoleUiRafId);
    _applyRoleUiRafId = requestAnimationFrame(() => {
      _applyRoleUiRafId = null;
      applyAuthToTree(document);
    });

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

    const overflowAccount = document.getElementById("headerOverflowAccount");
    if (overflowAccount) {
      const acctLabel =
        currentAuthUser &&
        (currentAuthUser.label ||
          (currentAuthUser.role
            ? currentAuthUser.role.charAt(0).toUpperCase() + currentAuthUser.role.slice(1)
            : "User"));
      overflowAccount.textContent = currentAuthUser
        ? `${acctLabel}: ${currentAuthUser.username}`
        : "";
      overflowAccount.hidden = !currentAuthUser;
    }
    const overflowLogout = document.getElementById("headerOverflowLogout");
    if (overflowLogout) overflowLogout.hidden = !currentAuthUser;

    const logoutBtn = document.getElementById("authLogoutBtn");
    if (logoutBtn) logoutBtn.hidden = !currentAuthUser;
    syncAccountSecurityUi();

    if (currentAuthUser && typeof currentActiveTab !== "undefined" && !canAccessTab(currentActiveTab)) {
      showTab(getDefaultAuthTab());
    }
    if (typeof requestRenderDashboard === "function" && currentActiveTab === "dashboard") {
      requestRenderDashboard();
    }

    if (typeof renderPlayerScriptLauncher === "function") {
      renderPlayerScriptLauncher();
    }
    if (typeof filterPlays === "function") {
      filterPlays();
    } else if (typeof requestRenderPlaybook === "function") {
      requestRenderPlaybook();
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
    if (typeof ensureMobileStartupSurface === "function") {
      ensureMobileStartupSurface();
    }

    // Show/hide bell and start notification polling when logged in
    const bellBtn = document.getElementById("notifBellBtn");
    if (bellBtn) bellBtn.hidden = !currentAuthUser;
    if (currentAuthUser && typeof initNotifications === "function") {
      initNotifications({ deferFirstPoll: currentAuthUser.role === "player" });
    }
    if (currentAuthUser && typeof initPushNotifications === "function") {
      initPushNotifications();
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

  function removeLoginOverlayIfAuthenticated() {
    if (!currentAuthUser) return;
    const overlay = document.getElementById("authLoginOverlay");
    if (!overlay) return;
    overlay.setAttribute("aria-hidden", "true");
    overlay.inert = true;
    overlay.remove();
  }

  // The blocking bootstrap owner is app-init (cold authenticated start) or
  // completeAuthenticatedLogin (credentials entered in the app). This queue is
  // deliberately post-paint only: it provides a quiet player-release freshness
  // recheck and a guarded staff revalidation without competing with that first
  // workspace decision.
  function scheduleCloudAutoPull() {
    if (!currentAuthUser) return;
    const queueStartupTask =
      window.appStartup && typeof window.appStartup.queueTask === "function"
        ? window.appStartup.queueTask
        : null;
    if (
      currentAuthUser.role === "player" &&
      typeof schedulePlayerTeamUpdateCheck === "function"
    ) {
      if (queueStartupTask) {
        queueStartupTask("player-team-refresh", () => schedulePlayerTeamUpdateCheck({ delay: 700, startup: true }), {
          delay: 1000,
          priority: 40,
        });
      } else {
        schedulePlayerTeamUpdateCheck({ delay: 1200, startup: true });
      }
      return;
    }
    const runAutoPull = () => {
      if (typeof autoPullLatestCloudBackup === "function") {
        return autoPullLatestCloudBackup();
      }
      return false;
    };
    if (queueStartupTask) {
      queueStartupTask("cloud-auto-pull", runAutoPull, {
        delay: 900,
        priority: 30,
      });
    } else {
      setTimeout(runAutoPull, 700);
    }
  }

  function showLoginOverlay(message = "", opts = {}) {
    document.getElementById("authLoginOverlay")?.remove();
    document.body.classList.add("auth-locked");
    const _loginVariant = getAuthLoginVariant();

    const teamName = (() => {
      try {
        const key = typeof STORAGE_KEYS !== "undefined" ? STORAGE_KEYS.TEAM_NAME : "teamName";
        return (storageManager?.get?.(key, "") || "").trim() || "BCOffense";
      } catch (_e) { return "BCOffense"; }
    })();
    const overlay = document.createElement("div");
    overlay.id = "authLoginOverlay";
    overlay.className = `auth-login-overlay auth-login-overlay--${_loginVariant}`;
    overlay.dataset.loginVariant = _loginVariant;
    overlay.innerHTML = `
      <div class="auth-login-shell" data-login-variant="${escapeAttr(_loginVariant)}">
        <section class="auth-login-hero" aria-label="Portal overview">
          <div class="auth-login-brand">${escapeHtml(teamName)}</div>
          <div class="auth-login-hero-kicker">Secure staff and player access</div>
          <h2>Team workspace</h2>
          <p>One secure sign-in for staff tools, player practice views, scripts, wristbands, and game-day planning.</p>
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
        <form class="auth-login-card" id="authLoginForm" autocomplete="on">
          <div class="auth-login-phone-brand">
            <div class="auth-login-brand">${escapeHtml(teamName)}</div>
            <div class="auth-login-kicker">Sign in to your portal</div>
          </div>
          ${opts.statusMsg ? `<div class="auth-login-logout-msg">${escapeHtml(opts.statusMsg)}</div>` : ""}
          <div class="auth-login-form-header">
            <div class="auth-login-kicker">Secure team access</div>
            <h3>Sign in to BCOffense</h3>
            <p>Your account determines the workspace and access available to you.</p>
          </div>
          <div class="auth-login-bootstrap" aria-live="polite">
            <span class="auth-login-bootstrap__spinner" aria-hidden="true"></span>
            <strong id="authLoginBootstrapTitle">Preparing your team workspace</strong>
            <span id="authLoginBootstrapDetail">Checking your authorized team data before opening the app.</span>
          </div>
          <label>
            <span>Email or username</span>
            <input id="authUsername" type="text" autocomplete="username" autocapitalize="none" spellcheck="false"
              enterkeyhint="next" data-auth-allow-input="true" required />
          </label>
          <label>
            <span>Password</span>
            <div class="auth-login-password-row">
              <input id="authPassword" type="password" autocomplete="current-password" data-auth-allow-input="true"
                enterkeyhint="go" required />
              <button type="button" class="auth-password-toggle" id="authPasswordToggle"
                aria-label="Show password" aria-pressed="false"><svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
            </div>
          </label>
          <div id="authLoginError" class="auth-login-error${opts.messageIsStatus ? " is-status" : ""}" aria-live="assertive" role="alert">${escapeHtml(message)}</div>
          <button type="submit" class="btn btn-primary auth-login-submit" id="authLoginSubmit">Sign In</button>
          <p class="auth-login-help">Need help? Ask a coach or staff member for your login.</p>
          <div class="auth-login-legal-links">
            <button type="button" class="auth-login-about-btn" data-action="openAboutBCOffense">About BCOffense</button>
            <span aria-hidden="true">•</span>
            <button type="button" class="auth-login-about-btn" data-action="openBCOffenseTerms">Terms of Use</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    const _animateOut = () => new Promise(r => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { r(); return; }
      const shell = overlay.querySelector(".auth-login-shell");
      if (!shell) { r(); return; }
      shell.style.animation = "authShellOut 0.18s ease-in both";
      setTimeout(r, 160);
    });
    const usernameEl = overlay.querySelector("#authUsername");
    const passwordEl = overlay.querySelector("#authPassword");
    const errorEl = overlay.querySelector("#authLoginError");
    const toggleEl = overlay.querySelector("#authPasswordToggle");
    const submitEl = overlay.querySelector("#authLoginSubmit");
    const formEl = overlay.querySelector("#authLoginForm");
    const focusController =
      typeof AbortController === "function" ? new AbortController() : null;
    const focusSignal = focusController ? { signal: focusController.signal } : {};
    let focusScrollTimer = 0;
    const cleanupLoginFocusTracking = () => focusController?.abort();
    const ensureAuthFocusedControlVisible = () => {
      const active = document.activeElement;
      if (!overlay.isConnected || !overlay.contains(active)) return;
      if (!active.matches?.("input, textarea, select")) return;
      window.clearTimeout(focusScrollTimer);
      focusScrollTimer = window.setTimeout(() => {
        active.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: "smooth",
        });
      }, 90);
    };
    const syncAuthKeyboardState = () => {
      const viewport = window.visualViewport;
      const keyboardOpen =
        Boolean(viewport) &&
        window.innerHeight - viewport.height > 80 &&
        viewport.width <= 900;
      overlay.classList.toggle("is-keyboard-open", keyboardOpen);
      ensureAuthFocusedControlVisible();
    };
    const setAuthLoginMessage = (text, isStatus = false) => {
      errorEl.textContent = text;
      errorEl.classList.toggle("is-status", isStatus);
      ensureAuthFocusedControlVisible();
    };
    const completeAuthenticatedLogin = async (user, source) => {
      currentAuthUser = user;
      authSessionRecoverySignaled = false;
      saveStoredAuthUser(user, source);
      authReady = true;

      // The signed-in account, not a role tab chosen before authentication,
      // decides both the destination and the authorized data source. Keep the
      // login surface up until that source has been checked so a new/shared
      // browser cannot briefly open an empty local workspace.
      const loadingTitle = user.role === "player"
        ? "Preparing your published practice plan"
        : "Preparing your team workspace";
      const loadingDetail = user.role === "player"
        ? "Checking the latest coach-published practice before opening the player view."
        : "Loading your authorized plays, scripts, media, game plans, and team settings.";
      overlay.classList.add("is-bootstrap-loading");
      overlay.setAttribute("aria-busy", "true");
      usernameEl.disabled = true;
      passwordEl.disabled = true;
      toggleEl && (toggleEl.disabled = true);
      submitEl && (submitEl.disabled = true);
      const bootstrapTitle = overlay.querySelector("#authLoginBootstrapTitle");
      const bootstrapDetail = overlay.querySelector("#authLoginBootstrapDetail");
      if (bootstrapTitle) bootstrapTitle.textContent = loadingTitle;
      if (bootstrapDetail) bootstrapDetail.textContent = loadingDetail;
      setAuthLoginMessage(loadingDetail, true);
      if (user.role === "player") {
        storageManager?.preparePlayerDeviceForUser?.(user);
      }
      if (typeof autoPullLatestCloudBackup === "function") {
        await autoPullLatestCloudBackup({ timeoutMs: 14 * 1000, bootstrap: true });
      }

      await _animateOut();
      cleanupLoginFocusTracking();
      overlay.remove();
      applyRoleUi();
      if (typeof applyPendingRestoredStartupTab === "function") {
        applyPendingRestoredStartupTab();
      }
      // A mobile browser may have suspended Swipe View and lost its secure
      // cookie. Reopen the same authorized packet only after the fresh
      // workspace check and successful sign-in have completed.
      if (typeof restorePlayPresentationResume === "function") {
        restorePlayPresentationResume();
      }
      requestAnimationFrame(() => {
        document.querySelector(".tab[aria-selected='true'], .tab.active, .tabs .tab")?.focus({ preventScroll: true });
      });
      if (currentAuthUser.role !== "player") {
        showToast(`Logged in as ${currentAuthUser.label}`, { type: "success" });
      }
      if (!canAccessTab(currentActiveTab)) showTab(getDefaultAuthTab());
    };
    usernameEl.addEventListener("input", () => {
      setAuthLoginMessage("");
    });

    passwordEl.addEventListener("input", () => {
      setAuthLoginMessage("");
    });

    usernameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        passwordEl.focus();
      }
    });

    const _eyeOpen = '<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const _eyeOff = '<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    toggleEl?.addEventListener("click", () => {
      const shouldShow = passwordEl.type === "password";
      passwordEl.type = shouldShow ? "text" : "password";
      toggleEl.innerHTML = shouldShow ? _eyeOff : _eyeOpen;
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
      if (submitEl) {
        submitEl.disabled = true;
        submitEl.classList.add("is-loading");
      }
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

        await completeAuthenticatedLogin(
          resolvedUser,
          isLocalDevHost() && (!response.ok || !data.user) ? "local-dev" : "server-login",
        );
      } catch (err) {
        try {
          const fallbackUser = tryLocalDevLogin(
            usernameEl.value.trim().toLowerCase(),
            passwordEl.value,
          );
          if (fallbackUser) {
            await completeAuthenticatedLogin(fallbackUser, "local-dev");
            return;
          }
        } catch (_fallbackErr) {
          // Fall through to normal error messaging.
        }
        setAuthLoginMessage(err.message || "Login failed.");
        if (submitEl) {
          submitEl.disabled = false;
          submitEl.classList.remove("is-loading");
        }
        passwordEl.value = "";
        passwordEl.focus();
      }
    });
    overlay.addEventListener("focusin", ensureAuthFocusedControlVisible, focusSignal);
    window.visualViewport?.addEventListener("resize", syncAuthKeyboardState, {
      passive: true,
      ...focusSignal,
    });
    window.visualViewport?.addEventListener("scroll", syncAuthKeyboardState, {
      passive: true,
      ...focusSignal,
    });
    syncAuthKeyboardState();
    requestAnimationFrame(() => usernameEl.focus());
  }

  function ensureLoginOverlayVisible() {
    if (currentAuthUser || !document.body) return;
    if (document.getElementById("authLoginOverlay")) return;
    showLoginOverlay("", {
      statusMsg: "Sign in to continue.",
      messageIsStatus: true,
    });
  }

  async function logoutAuth() {
    try {
      const response = await fetch("/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "X-BC-Auth-Mode": "json", Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error("The secure sign-out request was not accepted.");
      }
      // Confirm the cookie has actually been cleared before leaving the
      // workspace. A visual-only lock is not a logout, especially on a shared
      // coach device.
      const verification = await fetch("/auth/me", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (verification.status !== 401) {
        throw new Error("Could not confirm secure sign-out. Please try again.");
      }
    } catch (err) {
      showToast(err?.message || "Could not securely sign out. Check your connection and try again.", {
        type: "error",
        persistent: true,
      });
      return false;
    }
    currentAuthUser = null;
    if (typeof clearPlayPresentationResume === "function") {
      clearPlayPresentationResume();
    }
    clearStoredAuthUser();
    authReady = true;
    if (typeof resetCloudSyncAutoPull === "function") {
      resetCloudSyncAutoPull();
    }
    applyRoleUi();
    showLoginOverlay("", {
      statusMsg: "Signed out. Team data remains safely locked on this device until an authorized sign-in.",
      messageIsStatus: true,
    });
    return true;
  }

  // Protected API clients dispatch this event when the server has definitively
  // rejected the current cookie. Keep that recovery in one place so an expired
  // session becomes one clear sign-in state instead of a cascade of failed
  // media, notification, and leaderboard requests.
  function handleExpiredServerSession(message = "Your secure session ended. Sign in to continue.") {
    if (!authReady || (!currentAuthUser && document.getElementById("authLoginOverlay"))) return;
    if (typeof capturePlayPresentationResume === "function") {
      capturePlayPresentationResume();
    }
    currentAuthUser = null;
    clearStoredAuthUser();
    if (typeof resetCloudSyncAutoPull === "function") {
      resetCloudSyncAutoPull();
    }
    applyRoleUi();
    showLoginOverlay("", { statusMsg: message, messageIsStatus: true });
  }

  window.addEventListener("bc-auth-session-required", (event) => {
    handleExpiredServerSession(event?.detail?.message);
  });

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
    if (typeof setStartupLoadingMessage === "function") {
      setStartupLoadingMessage("Checking secure session...");
    }
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
        currentAuthUser = null;
        clearStoredAuthUser();
      }
    }

    authReady = true;
    if (!currentAuthUser) {
      showLoginOverlay("", {
        statusMsg: session.timedOut
          ? "Session check took too long. Sign in to continue."
          : "Sign in to unlock this device.",
        messageIsStatus: true,
      });
    }
    applyRoleUi();
    if (typeof applyPendingRestoredStartupTab === "function") {
      applyPendingRestoredStartupTab();
    }
    scheduleCloudAutoPull();
    resolveAuthReady();
  }

  document.addEventListener("click", handleBlockedInteraction, true);
  document.addEventListener("change", handleBlockedInteraction, true);
  document.addEventListener("input", handleBlockedInteraction, true);
  document.addEventListener("submit", handleBlockedInteraction, true);

  document.addEventListener("DOMContentLoaded", () => {
    installAuthFetchBoundary();
    initAccountSecurityUi();
    // Item 39: hide auth loading skeleton once auth resolves
    const _authSkeleton = document.getElementById("authLoadingSkeleton");
    initServerAuth().finally(() => {
      resolveAuthReady();
      if (_authSkeleton) {
        _authSkeleton.classList.add("is-done");
        setTimeout(() => (_authSkeleton.hidden = true), 320);
      }
    });
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

  window.whenAuthReady = () =>
    authReady ? Promise.resolve(currentAuthUser) : authReadyPromise;
  window.getCurrentAuthUser = () => currentAuthUser;
  window.isAdminUser = isAdminUser;
  window.canEditUser = canEditUser;
  window.canAccessTab = canAccessTab;
  window.getDefaultAuthTab = getDefaultAuthTab;
  window.canManageSettings = canManageSettings;
  window.isActionAllowedForRole = isActionAllowedForRole;
  window.logoutAuth = logoutAuth;
  window.applyRoleUi = applyRoleUi;
  window.openAboutBCOffense = openAboutBCOffense;
  window.closeAboutBCOffense = closeAboutBCOffense;
  window.openBCOffenseTerms = openBCOffenseTerms;
  window.closeBCOffenseTerms = closeBCOffenseTerms;
  window.openAccountSecurity = openAccountSecurity;
  window.closeAccountSecurity = closeAccountSecurity;
})();
