// Server-authoritative player quiz UI.
//
// This deliberately stays separate from the local practice quiz engine. The
// server owns the released source snapshot, question order, answer key,
// scoring, and trusted leaderboard write; this client only renders the current
// prompt and sends the player's chosen opaque option id while online.
(function () {
  "use strict";

  const AQZ_SOURCE_TYPES = new Set(["script", "gameplan"]);
  const AQZ_MAX_CHOICES = 8;
  let aqzExpiryTimer = 0;
  let aqzLaunchRefreshTimer = 0;
  let aqzIdSequence = 0;
  const aqzState = {
    session: null,
    question: null,
    feedback: null,
    summary: null,
    launchPending: false,
    answerPending: false,
    completePending: false,
    completeReady: false,
    retryChoiceId: "",
    error: "",
    expired: false,
    media: null,
  };

  function _aqzCleanText(value, max = 240) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  function _aqzIsOnline() {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  }

  function _aqzNamedPlayer() {
    const user = typeof window.getCurrentAuthUser === "function"
      ? window.getCurrentAuthUser()
      : null;
    if (user?.role !== "player" || !String(user?.d1UserId || "").trim()) return null;
    return user;
  }

  function _aqzToast(message, type = "warning") {
    showToast(message, { type, duration: 4200 });
  }

  function _aqzMakeError(message, status = 0, data = null) {
    const error = new Error(_aqzCleanText(message, 320) || "Verified quiz request failed.");
    error.status = Number(status || 0);
    error.data = data;
    return error;
  }

  function _aqzNotifyAuthRequired() {
    window.dispatchEvent(new CustomEvent("bc-auth-session-required", {
      detail: { message: "Your secure session ended. Sign in to continue." },
    }));
  }

  async function _aqzRequest(path, options = {}) {
    if (!_aqzIsOnline()) {
      throw _aqzMakeError("Verified quizzes need an internet connection. Reconnect, then try again.");
    }
    let response;
    try {
      response = await fetch(path, {
        credentials: "same-origin",
        cache: "no-store",
        ...options,
        headers: {
          Accept: "application/json",
          "X-BC-Auth-Mode": "json",
          ...(options.headers || {}),
        },
      });
    } catch (error) {
      throw _aqzMakeError(error?.message || "The verified quiz server could not be reached.");
    }

    let data = null;
    let text = "";
    try {
      text = await response.text();
      data = text ? JSON.parse(text) : null;
    } catch (_error) {
      data = null;
    }
    if (response.status === 401) _aqzNotifyAuthRequired();
    if (!response.ok || data?.ok === false) {
      throw _aqzMakeError(
        data?.error || data?.message || text || `Verified quiz request failed (${response.status}).`,
        response.status,
        data,
      );
    }
    return data && typeof data === "object" ? data : {};
  }

  function _aqzPromptFrom(value) {
    if (typeof value === "string") {
      const text = _aqzCleanText(value, 1200);
      return text ? { kind: "call-recognition", text, personnel: "", formation: "", motion: "", period: "", mediaId: "" } : null;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const text = _aqzCleanText(value.text, 1200) || "What is the call?";
    return {
      kind: _aqzCleanText(value.kind, 80) || "call-recognition",
      text,
      personnel: _aqzCleanText(value.personnel, 120),
      formation: _aqzCleanText(value.formation, 240),
      motion: _aqzCleanText(value.motion, 240),
      period: _aqzCleanText(value.period, 240),
      // A media ID alone is not a URL. It is resolved only through the
      // player media helper, which enforces the normal release authorization.
      mediaId: _aqzCleanText(value.mediaId, 512),
    };
  }

  function _aqzQuestionFrom(value) {
    if (!value || typeof value !== "object") return null;
    const ordinal = Number(value.ordinal);
    const prompt = _aqzPromptFrom(value.prompt);
    const choices = (Array.isArray(value.choices) ? value.choices : [])
      .map((choice) => ({
        id: _aqzCleanText(choice?.id, 160),
        label: _aqzCleanText(choice?.label, 300),
      }))
      .filter((choice) => choice.id && choice.label)
      .slice(0, AQZ_MAX_CHOICES);
    if (!Number.isInteger(ordinal) || ordinal < 1 || !prompt || choices.length < 2) return null;
    return { ordinal, prompt, choices };
  }

  function _aqzSessionFrom(value) {
    if (!value || typeof value !== "object") return null;
    const id = _aqzCleanText(value.id, 180);
    const title = _aqzCleanText(value.title, 200) || "Verified Call Recognition";
    const total = Math.max(0, Math.min(100, Math.floor(Number(value.total) || 0)));
    const expiresAt = _aqzCleanText(value.expiresAt, 80);
    const status = _aqzCleanText(value.status, 48).toLowerCase() || "active";
    const sourceType = _aqzCleanText(value.sourceType, 40).toLowerCase();
    const sourceId = _aqzCleanText(value.sourceId, 240);
    if (!id) return null;
    return {
      id,
      title,
      total,
      expiresAt,
      status,
      sourceType: AQZ_SOURCE_TYPES.has(sourceType) ? sourceType : "",
      sourceId,
    };
  }

  function _aqzAdoptSession(session) {
    if (!session) return;
    aqzState.session = session;
    // A start call may resume an existing server session. Keep the server's
    // source identity so the launcher cannot describe that resume as the
    // currently selected local source when they differ.
    if (session.sourceType && session.sourceId) {
      aqzState.sourceType = session.sourceType;
      aqzState.sourceId = session.sourceId;
    }
  }

  function _aqzRecordedFeedback() {
    // Per-answer correctness is intentionally not presented. The player gets
    // one immutable answer per prompt and receives the trusted score only when
    // the server finalizes the full session.
    return { message: "Answer recorded. Moving to the next question." };
  }

  function _aqzSummaryFrom(value) {
    if (!value || typeof value !== "object") return null;
    const percent = Number(value.percent);
    const correct = Number(value.correct);
    const total = Number(value.total ?? value.totalQuestions);
    const points = Number(value.totalPoints ?? value.points);
    const title = _aqzCleanText(value.title, 200);
    return {
      percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : null,
      correct: Number.isFinite(correct) ? Math.max(0, Math.floor(correct)) : null,
      total: Number.isFinite(total) ? Math.max(0, Math.floor(total)) : null,
      points: Number.isFinite(points) ? Math.max(0, Math.round(points)) : null,
      title,
    };
  }

  function _aqzExpiresAtMs() {
    const value = aqzState.session?.expiresAt || "";
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function _aqzSessionExpired() {
    const expiresAt = _aqzExpiresAtMs();
    return aqzState.expired || (expiresAt > 0 && Date.now() >= expiresAt);
  }

  function _aqzFormatExpiry() {
    const expiresAt = _aqzExpiresAtMs();
    if (!expiresAt) return "Online session";
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return "Session expired";
    const minutes = Math.max(1, Math.ceil(remaining / 60000));
    return `Session expires in about ${minutes} min`;
  }

  function _aqzClearExpiryTimer() {
    if (!aqzExpiryTimer) return;
    window.clearTimeout(aqzExpiryTimer);
    aqzExpiryTimer = 0;
  }

  function _aqzScheduleExpiry() {
    _aqzClearExpiryTimer();
    const expiresAt = _aqzExpiresAtMs();
    if (!expiresAt) return;
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      aqzState.expired = true;
      _aqzRender();
      return;
    }
    aqzExpiryTimer = window.setTimeout(() => {
      aqzState.expired = true;
      aqzState.answerPending = false;
      aqzState.completePending = false;
      _aqzRender();
      _aqzRefreshLauncher();
    }, Math.min(delay + 25, 2147483647));
  }

  function _aqzNewIdempotencyKey() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (globalThis.crypto?.getRandomValues) {
      const bytes = new Uint32Array(4);
      globalThis.crypto.getRandomValues(bytes);
      return Array.from(bytes, (value) => value.toString(16).padStart(8, "0")).join("");
    }
    aqzIdSequence += 1;
    return `aqz-${Date.now()}-${aqzIdSequence}`;
  }

  function _aqzSelectedSource() {
    const selectedType = String(typeof _playerQuizSelectedSource === "string" ? _playerQuizSelectedSource : "").trim().toLowerCase();
    if (!AQZ_SOURCE_TYPES.has(selectedType)) {
      return {
        error: "Choose a published Practice Script or Game Plan above. Signals and homework stay practice-only.",
      };
    }
    if (selectedType === "script") {
      const selectedId = String(_playerQuizSelectedScriptId || document.getElementById("playerQuizScriptSelect")?.value || "").trim();
      const option = _getPlayerQuizScriptOptions().find((entry) =>
        String(entry?.id || "") === selectedId && entry?.playerSelectable,
      );
      if (!option) return { error: "Choose a coach-published Practice Script for a verified quiz." };
      return {
        sourceType: "script",
        sourceId: selectedId,
        label: option.name || "Practice Script",
      };
    }
    const status = _getActiveGamePlanQuizStatus();
    if (!status?.available || !String(status.id || "").trim()) {
      return { error: status?.detail || "The current Game Plan is not ready for a verified quiz." };
    }
    return {
      sourceType: "gameplan",
      sourceId: String(status.id).trim(),
      label: "Game Plan",
    };
  }

  function _aqzCurrentSourceMatches(source) {
    return Boolean(
      aqzState.session &&
      aqzState.session.status === "active" &&
      aqzState.sourceType === source?.sourceType &&
      aqzState.sourceId === source?.sourceId &&
      !_aqzSessionExpired(),
    );
  }

  function _aqzResetState() {
    _aqzClearExpiryTimer();
    aqzState.session = null;
    aqzState.question = null;
    aqzState.feedback = null;
    aqzState.summary = null;
    aqzState.launchPending = false;
    aqzState.answerPending = false;
    aqzState.completePending = false;
    aqzState.completeReady = false;
    aqzState.retryChoiceId = "";
    aqzState.error = "";
    aqzState.expired = false;
    aqzState.media = null;
    delete aqzState.sourceType;
    delete aqzState.sourceId;
  }

  function _aqzOverlay() {
    return document.getElementById("authoritativeQuizOverlay");
  }

  function _aqzOpenOverlay() {
    const overlay = _aqzOverlay();
    if (!overlay) return;
    overlay.classList.remove("hidden");
    openLayer(overlay, {
      id: "authoritativeQuizOverlay",
      scrollElement: "authoritativeQuizCard",
      blocking: true,
    });
  }

  function _aqzCloseOverlay() {
    const overlay = _aqzOverlay();
    if (!overlay) return;
    closeLayer(overlay);
    overlay.classList.add("hidden");
  }

  function _aqzQuestionKey(question = aqzState.question) {
    if (!aqzState.session?.id || !question?.ordinal) return "";
    return `${aqzState.session.id}:${question.ordinal}`;
  }

  function _aqzLoadAuthorizedMedia(question = aqzState.question) {
    const mediaId = _aqzCleanText(question?.prompt?.mediaId, 512);
    const key = _aqzQuestionKey(question);
    if (!mediaId || !key || aqzState.media?.key === key || typeof window.ensurePlayImageUrl !== "function") return;
    aqzState.media = { key, status: "loading", url: "" };
    // `ensurePlayImageUrl` uses the normal player-release image authorization
    // path. Never turn a media ID from the quiz payload into a direct R2 URL.
    Promise.resolve(window.ensurePlayImageUrl({ mediaId }))
      .then((url) => {
        if (_aqzQuestionKey() !== key) return;
        aqzState.media = url
          ? { key, status: "ready", url: String(url) }
          : { key, status: "unavailable", url: "" };
        _aqzRender();
      })
      .catch((error) => {
        console.warn("[authoritative-quiz] authorized diagram unavailable", error);
        if (_aqzQuestionKey() !== key) return;
        aqzState.media = { key, status: "unavailable", url: "" };
        _aqzRender();
      });
  }

  function _aqzRender() {
    const titleEl = document.getElementById("authoritativeQuizTitle");
    const progressEl = document.getElementById("authoritativeQuizProgress");
    const bodyEl = document.getElementById("authoritativeQuizBody");
    if (!bodyEl) return;

    const session = aqzState.session;
    if (titleEl) titleEl.textContent = session?.title || "Verified Call Recognition";
    if (progressEl) {
      progressEl.textContent = aqzState.summary
        ? "Verified"
        : aqzState.question && session?.total
          ? `${aqzState.question.ordinal} / ${session.total}`
          : session
            ? _aqzFormatExpiry()
            : "Online only";
    }

    if (aqzState.launchPending) {
      bodyEl.innerHTML = `
        <div class="aqz-state-card" role="status">
          <span class="aqz-state-card__icon" aria-hidden="true">⏳</span>
          <h3>Preparing your verified quiz</h3>
          <p>The server is locking this released source and building your questions.</p>
        </div>`;
      return;
    }

    if (aqzState.summary) {
      const summary = aqzState.summary;
      const resultParts = [];
      if (summary.correct !== null && summary.total !== null) {
        resultParts.push(`<span><strong>${summary.correct}</strong><small>correct</small></span>`);
        resultParts.push(`<span><strong>${summary.total}</strong><small>questions</small></span>`);
      }
      if (summary.points !== null) resultParts.push(`<span><strong>${summary.points}</strong><small>verified points</small></span>`);
      bodyEl.innerHTML = `
        <div class="aqz-result-card">
          <span class="aqz-result-card__kicker">Server verified</span>
          <div class="aqz-result-card__score">${summary.percent !== null ? `${summary.percent}%` : "Complete"}</div>
          <h3>${escapeHtml(summary.title || session?.title || "Verified Call Recognition")}</h3>
          <p>Your result was scored by the server and is ready for the verified leaderboard.</p>
          ${resultParts.length ? `<div class="aqz-result-card__grid">${resultParts.join("")}</div>` : ""}
          <div class="aqz-result-card__actions">
            <button type="button" class="btn btn-primary" data-action="closeAuthoritativeQuiz">Back to Quiz Center</button>
          </div>
        </div>`;
      return;
    }

    if (_aqzSessionExpired()) {
      bodyEl.innerHTML = `
        <div class="aqz-state-card aqz-state-card--expired" role="alert">
          <span class="aqz-state-card__icon" aria-hidden="true">⌛</span>
          <h3>Verified quiz session expired</h3>
          <p>Verified questions are online-only. Return to Quiz Center to start a new session from a released source.</p>
          <button type="button" class="btn btn-primary" data-action="closeAuthoritativeQuiz">Back to Quiz Center</button>
        </div>`;
      return;
    }

    // A recovered session can have every answer durably recorded without a
    // next prompt to render (for example, after a lost final-answer response
    // or a second browser tab finished the last answer). Keep that state
    // actionable instead of treating it as a missing question.
    if (session && aqzState.completeReady) {
      bodyEl.innerHTML = `
        <div class="aqz-state-card" role="status">
          <span class="aqz-state-card__icon" aria-hidden="true">✓</span>
          <h3>All answers recorded</h3>
          <p>Finish the quiz to receive your server-verified result.</p>
          <button type="button" class="btn btn-success" data-action="completeAuthoritativeQuiz" ${aqzState.completePending ? "disabled" : ""}>${aqzState.completePending ? "Finishing…" : "Finish verified quiz"}</button>
        </div>`;
      return;
    }

    if (!session || !aqzState.question) {
      bodyEl.innerHTML = `
        <div class="aqz-state-card aqz-state-card--error" role="alert">
          <span class="aqz-state-card__icon" aria-hidden="true">!</span>
          <h3>Quiz question unavailable</h3>
          <p>${escapeHtml(aqzState.error || "This verified session did not return a playable question. Return to Quiz Center and try again.")}</p>
          <button type="button" class="btn btn-primary" data-action="closeAuthoritativeQuiz">Back to Quiz Center</button>
        </div>`;
      return;
    }

    const question = aqzState.question;
    const feedback = aqzState.feedback;
    const onlyRetry = aqzState.retryChoiceId;
    const choices = question.choices.map((choice, index) => {
      const retryOnly = onlyRetry && onlyRetry !== choice.id;
      const selected = aqzState.retryChoiceId === choice.id;
      const disabled = aqzState.answerPending || retryOnly || aqzState.completeReady;
      return `
        <button type="button"
          class="aqz-choice${selected ? " is-retry" : ""}"
          data-action="answerAuthoritativeQuiz"
          data-arg="${escapeAttr(choice.id)}"
          ${disabled ? "disabled" : ""}
          aria-label="Choice ${index + 1}: ${escapeAttr(choice.label)}">
          <span class="aqz-choice__index">${String.fromCharCode(65 + index)}</span>
          <span>${escapeHtml(choice.label)}</span>
        </button>`;
    }).join("");
    const prompt = question.prompt;
    const promptDetails = [
      prompt.personnel ? { label: "Personnel", value: prompt.personnel } : null,
      prompt.formation ? { label: "Formation", value: prompt.formation } : null,
      prompt.motion ? { label: "Motion", value: prompt.motion } : null,
      prompt.period ? { label: "Period", value: prompt.period } : null,
    ].filter(Boolean);
    if (prompt.mediaId && aqzState.media?.key !== _aqzQuestionKey(question)) {
      _aqzLoadAuthorizedMedia(question);
    }
    const media = aqzState.media?.key === _aqzQuestionKey(question) ? aqzState.media : null;
    const mediaHtml = media?.status === "ready" && media.url
      ? `<figure class="aqz-media"><img src="${escapeAttr(media.url)}" alt="Authorized released play diagram for this question"></figure>`
      : prompt.mediaId && media?.status === "loading"
        ? `<div class="aqz-media-status" role="status">Checking the authorized diagram…</div>`
        : "";
    const feedbackHtml = feedback
      ? `<div class="aqz-feedback is-recorded" aria-live="polite"><strong>Recorded</strong><span>${escapeHtml(feedback.message)}</span></div>`
      : "";
    const completionHtml = aqzState.completeReady
      ? `<div class="aqz-complete-row"><span>All answers are recorded. Finish to receive your server-verified result.</span><button type="button" class="btn btn-success" data-action="completeAuthoritativeQuiz" ${aqzState.completePending ? "disabled" : ""}>${aqzState.completePending ? "Finishing…" : "Finish verified quiz"}</button></div>`
      : "";
    bodyEl.innerHTML = `
      <div class="aqz-question-card">
        <div class="aqz-question-card__meta">
          <span>Verified Call Recognition</span>
          <small>${escapeHtml(_aqzFormatExpiry())}</small>
        </div>
        <h3>${escapeHtml(prompt.text)}</h3>
        ${promptDetails.length ? `<dl class="aqz-prompt-details">${promptDetails.map((detail) => `<div><dt>${escapeHtml(detail.label)}</dt><dd>${escapeHtml(detail.value)}</dd></div>`).join("")}</dl>` : ""}
        ${mediaHtml}
        <p>This response is checked on the server. You cannot change an answer after it is recorded; your score is revealed only after the full verified quiz is complete.</p>
        ${feedbackHtml}
        <div class="aqz-choice-grid" role="group" aria-label="Answer choices">${choices}</div>
        ${onlyRetry ? `<p class="aqz-retry-note">Connection interrupted. Retry your selected answer when you are back online.</p>` : ""}
        ${completionHtml}
      </div>`;
  }

  function _aqzRefreshLauncher() {
    window.clearTimeout(aqzLaunchRefreshTimer);
    aqzLaunchRefreshTimer = window.setTimeout(() => {
      const button = document.getElementById("authoritativeQuizStartBtn");
      const status = document.getElementById("authoritativeQuizLaunchStatus");
      if (!button || !status) return;
      const namedPlayer = _aqzNamedPlayer();
      const source = namedPlayer ? _aqzSelectedSource() : null;
      const sourceLabel = source?.label || "";
      let message = "Choose a released Practice Script or Game Plan above, then start a server-verified Call Recognition quiz.";
      let disabled = false;
      if (!namedPlayer) {
        message = "Verified quizzes require your named player account. Practice quizzes remain available on this device.";
        disabled = true;
      } else if (!_aqzIsOnline()) {
        message = "Offline: reconnect to start a verified quiz. Local practice quizzes still work offline.";
        disabled = true;
      } else if (source?.error) {
        message = source.error;
        disabled = true;
      } else if (_aqzCurrentSourceMatches(source)) {
        message = `${sourceLabel} has a verified quiz in progress. Resume it to keep answering.`;
      } else if (aqzState.session && aqzState.session.status === "active" && !_aqzSessionExpired()) {
        message = "Finish or let your current verified quiz expire before starting another source.";
        disabled = true;
      } else {
        message = `${sourceLabel} is ready for a server-verified quiz.`;
      }
      button.disabled = disabled;
      button.textContent = _aqzCurrentSourceMatches(source)
        ? "Resume verified quiz"
        : "Start verified quiz";
      status.textContent = message;
    }, 0);
  }

  function _aqzRecoverSession() {
    if (!aqzState.session?.id) return Promise.resolve(false);
    return _aqzRequest(`/api/quiz-sessions/${encodeURIComponent(aqzState.session.id)}`)
      .then((data) => {
        const previousOrdinal = aqzState.question?.ordinal || 0;
        const session = _aqzSessionFrom(data.session || aqzState.session);
        const question = _aqzQuestionFrom(data.question || data.nextQuestion);
        _aqzAdoptSession(session);
        const summary = _aqzSummaryFrom(data.summary || data.session?.result || data.result);
        if (summary || String(session?.status || "").toLowerCase() === "completed") {
          aqzState.summary = summary;
          aqzState.question = null;
          aqzState.completeReady = false;
          _aqzClearExpiryTimer();
          _aqzRender();
          return Boolean(summary);
        }
        if (question) {
          aqzState.question = question;
          aqzState.completeReady = false;
          // A second tab (or a lost response) may already have advanced the
          // session. That old opaque option is no longer meaningful for the
          // new prompt, so do not leave the new choices retry-locked.
          if (previousOrdinal && question.ordinal !== previousOrdinal) {
            aqzState.retryChoiceId = "";
            aqzState.feedback = _aqzRecordedFeedback();
            aqzState.error = "";
          }
        } else if (data.completeReady === true) {
          aqzState.question = null;
          aqzState.completeReady = true;
          aqzState.feedback = _aqzRecordedFeedback();
        } else if (String(session?.status || "").toLowerCase().includes("expired")) {
          aqzState.expired = true;
        }
        _aqzScheduleExpiry();
        _aqzRender();
        return Boolean(question);
      })
      .catch((error) => {
        if (error.status === 401) return false;
        if (error.status === 404 || error.status === 410) aqzState.expired = true;
        aqzState.error = error.message;
        _aqzRender();
        return false;
      });
  }

  async function startAuthoritativePlayerQuiz() {
    if (aqzState.launchPending) return;
    if (typeof window.whenAuthReady === "function") await window.whenAuthReady();
    const player = _aqzNamedPlayer();
    if (!player) {
      _aqzToast("Verified quizzes require a named player account.");
      _aqzRefreshLauncher();
      return;
    }
    if (!_aqzIsOnline()) {
      _aqzToast("Reconnect to the internet before starting a verified quiz.");
      _aqzRefreshLauncher();
      return;
    }
    const source = _aqzSelectedSource();
    if (source.error) {
      _aqzToast(source.error, "info");
      _aqzRefreshLauncher();
      return;
    }
    if (_aqzCurrentSourceMatches(source)) {
      _aqzOpenOverlay();
      _aqzRender();
      return;
    }
    if (aqzState.session && aqzState.session.status === "active" && !_aqzSessionExpired()) {
      _aqzToast("Finish your open verified quiz before starting another source.");
      return;
    }

    _aqzResetState();
    aqzState.launchPending = true;
    aqzState.sourceType = source.sourceType;
    aqzState.sourceId = source.sourceId;
    _aqzOpenOverlay();
    _aqzRender();
    try {
      const data = await _aqzRequest("/api/quiz-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          idempotencyKey: _aqzNewIdempotencyKey(),
        }),
      });
      const session = _aqzSessionFrom(data.session);
      const question = _aqzQuestionFrom(data.question || data.nextQuestion);
      if (!session || !question) {
        throw _aqzMakeError("The verified quiz server did not return a playable session.");
      }
      _aqzAdoptSession(session);
      aqzState.question = question;
      aqzState.expired = String(session.status).includes("expired");
      aqzState.error = "";
      _aqzScheduleExpiry();
    } catch (error) {
      aqzState.error = error.message || "Could not start this verified quiz.";
      aqzState.session = null;
      aqzState.question = null;
      _aqzToast(aqzState.error);
    } finally {
      aqzState.launchPending = false;
      _aqzRender();
      _aqzRefreshLauncher();
    }
  }

  async function answerAuthoritativeQuiz(choiceId) {
    if (aqzState.answerPending || aqzState.completeReady || _aqzSessionExpired()) return;
    const session = aqzState.session;
    const question = aqzState.question;
    const normalizedChoiceId = _aqzCleanText(choiceId, 160);
    if (!session || !question || !question.choices.some((choice) => choice.id === normalizedChoiceId)) return;
    if (aqzState.retryChoiceId && aqzState.retryChoiceId !== normalizedChoiceId) return;
    if (!_aqzIsOnline()) {
      aqzState.retryChoiceId = normalizedChoiceId;
      _aqzRender();
      _aqzToast("Reconnect, then retry your selected answer.");
      return;
    }
    aqzState.answerPending = true;
    aqzState.error = "";
    aqzState.feedback = null;
    _aqzRender();
    try {
      const data = await _aqzRequest(`/api/quiz-sessions/${encodeURIComponent(session.id)}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordinal: question.ordinal, choiceId: normalizedChoiceId }),
      });
      const returnedSession = _aqzSessionFrom(data.session);
      _aqzAdoptSession(returnedSession);
      const returnedSummary = _aqzSummaryFrom(data.summary || data.session?.result || data.result);
      aqzState.feedback = _aqzRecordedFeedback();
      const nextQuestion = _aqzQuestionFrom(data.nextQuestion)
        || (_aqzQuestionFrom(data.question)?.ordinal !== question.ordinal ? _aqzQuestionFrom(data.question) : null);
      aqzState.retryChoiceId = "";
      if (returnedSummary || (data.isComplete === true && String(returnedSession?.status || "").toLowerCase() === "completed")) {
        aqzState.summary = returnedSummary;
        aqzState.question = null;
        aqzState.completeReady = false;
        _aqzClearExpiryTimer();
      } else if (nextQuestion) {
        aqzState.question = nextQuestion;
        aqzState.media = null;
        aqzState.completeReady = false;
      } else if (data.completeReady === true) {
        aqzState.question = null;
        aqzState.media = null;
        aqzState.completeReady = true;
      } else {
        throw _aqzMakeError("The verified quiz server did not return the next question. Retrying will safely recover your session.");
      }
      _aqzScheduleExpiry();
    } catch (error) {
      aqzState.retryChoiceId = normalizedChoiceId;
      aqzState.error = error.message || "Answer could not be recorded.";
      let recovered = false;
      if (error.status === 404 || error.status === 410 || /expired/i.test(aqzState.error)) {
        aqzState.expired = true;
      } else if (error.status === 409) {
        recovered = await _aqzRecoverSession();
      }
      if (!aqzState.expired && !recovered) _aqzToast(aqzState.error);
    } finally {
      aqzState.answerPending = false;
      _aqzRender();
      _aqzRefreshLauncher();
    }
  }

  async function completeAuthoritativeQuiz() {
    if (aqzState.completePending || _aqzSessionExpired() || !aqzState.session?.id) return;
    aqzState.completePending = true;
    aqzState.error = "";
    _aqzRender();
    try {
      const data = await _aqzRequest(`/api/quiz-sessions/${encodeURIComponent(aqzState.session.id)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const summary = _aqzSummaryFrom(data.summary || data.session?.result || data.result);
      if (!summary) throw _aqzMakeError("The verified quiz completed without a trusted result.");
      aqzState.summary = summary;
      _aqzAdoptSession(_aqzSessionFrom(data.session) || { ...aqzState.session, status: "completed" });
      aqzState.question = null;
      aqzState.completeReady = false;
      _aqzClearExpiryTimer();
      if (typeof window.refreshPlayerLeaderboardSummary === "function") {
        void window.refreshPlayerLeaderboardSummary({ quiet: true });
      }
    } catch (error) {
      aqzState.error = error.message || "Verified result could not be completed.";
      if (error.status === 404 || error.status === 410 || /expired/i.test(aqzState.error)) {
        aqzState.expired = true;
      } else if (error.status === 409 || /incomplete/i.test(aqzState.error)) {
        await _aqzRecoverSession();
      }
      if (!aqzState.expired) _aqzToast(aqzState.error);
    } finally {
      aqzState.completePending = false;
      _aqzRender();
      _aqzRefreshLauncher();
    }
  }

  function closeAuthoritativeQuiz() {
    _aqzCloseOverlay();
    _aqzRefreshLauncher();
  }

  function _aqzQueueLaunchRefresh() {
    _aqzRefreshLauncher();
  }

  function _aqzInit() {
    _aqzRefreshLauncher();
    document.addEventListener("click", (event) => {
      const action = event.target instanceof Element
        ? event.target.closest("[data-action]")?.dataset.action
        : "";
      if (["setPlayerQuizSource", "setPlayerQuizScriptSource", "setPlayerQuizMode"].includes(action)) {
        window.setTimeout(_aqzQueueLaunchRefresh, 0);
      }
    });
    window.addEventListener("online", _aqzQueueLaunchRefresh);
    window.addEventListener("offline", _aqzQueueLaunchRefresh);
    window.addEventListener("bc-auth-session-required", _aqzQueueLaunchRefresh);
    if (typeof window.whenAuthReady === "function") {
      void window.whenAuthReady().then(_aqzQueueLaunchRefresh);
    }
  }

  window.startAuthoritativePlayerQuiz = startAuthoritativePlayerQuiz;
  window.answerAuthoritativeQuiz = answerAuthoritativeQuiz;
  window.completeAuthoritativeQuiz = completeAuthoritativeQuiz;
  window.closeAuthoritativeQuiz = closeAuthoritativeQuiz;

  document.addEventListener("DOMContentLoaded", _aqzInit);
})();
