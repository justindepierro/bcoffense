function getScriptTimelinePeriodColor(separator) {
  const color = (separator?.color || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : UI_COLORS.periodDefault;
}

function getScriptTimelinePeriodPlays(separatorIndex) {
  const periodPlays = [];
  for (let index = separatorIndex + 1; index < script.length; index++) {
    const item = script[index];
    if (item?.isSeparator) break;
    if (item) periodPlays.push(item);
  }
  return periodPlays;
}

function getTopScriptTimelineBuckets(periodPlays, field, fallbackLabel, maxItems = 2) {
  const counts = new Map();
  periodPlays.forEach((play) => {
    const value = String(play?.[field] || "").trim() || fallbackLabel;
    counts.set(value, (counts.get(value) || 0) + (parseInt(play?.reps, 10) || 1));
  });

  return Array.from(counts, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, maxItems);
}

function splitScriptTimelineValues(value) {
  return String(value || "")
    .split(/[;,/|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatScriptTimelineDown(down) {
  const normalized = String(down || "").trim();
  const suffixMap = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" };
  return suffixMap[normalized] || normalized;
}

function getScriptTimelineSituationLabels(play) {
  const labels = [];
  const situations = splitScriptTimelineValues(play?.preferredSituation);
  const downs = splitScriptTimelineValues(play?.preferredDown);
  const distances = splitScriptTimelineValues(play?.preferredDistance);
  const fieldPositions = splitScriptTimelineValues(play?.preferredFieldPosition);

  situations.forEach((situation) => labels.push(situation));

  if (downs.length && distances.length) {
    downs.forEach((down) => {
      distances.forEach((distance) => {
        labels.push(`${formatScriptTimelineDown(down)} ${distance}`);
      });
    });
  } else if (downs.length) {
    downs.forEach((down) => labels.push(`${formatScriptTimelineDown(down)} Down`));
  } else if (distances.length) {
    distances.forEach((distance) => labels.push(distance));
  }

  fieldPositions.forEach((fieldPosition) => labels.push(fieldPosition));

  return labels.length ? Array.from(new Set(labels)) : ["No situation"];
}

function getTopScriptTimelineSituations(periodPlays, maxItems = 3) {
  const counts = new Map();
  periodPlays.forEach((play) => {
    const reps = parseInt(play?.reps, 10) || 1;
    getScriptTimelineSituationLabels(play).forEach((label) => {
      counts.set(label, (counts.get(label) || 0) + reps);
    });
  });

  return Array.from(counts, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, maxItems);
}

function getScriptTimelinePlayFamily(play) {
  const type = String(play?.type || "").trim().toLowerCase();
  if (type.includes("run")) return "run";
  if (["pass", "quick", "screen", "play action"].some((token) => type.includes(token))) {
    return "pass";
  }
  return "other";
}

function buildScriptTimelineBalance(periodPlays) {
  const balance = { runReps: 0, passReps: 0, otherReps: 0, totalReps: 0 };

  periodPlays.forEach((play) => {
    const reps = parseInt(play?.reps, 10) || 1;
    const family = getScriptTimelinePlayFamily(play);
    balance.totalReps += reps;
    if (family === "run") balance.runReps += reps;
    else if (family === "pass") balance.passReps += reps;
    else balance.otherReps += reps;
  });

  if (balance.totalReps > 0) {
    balance.runPct = Math.round((balance.runReps / balance.totalReps) * 100);
    balance.passPct = Math.round((balance.passReps / balance.totalReps) * 100);
    balance.otherPct = Math.max(0, 100 - balance.runPct - balance.passPct);
  } else {
    balance.runPct = 0;
    balance.passPct = 0;
    balance.otherPct = 0;
  }

  return balance;
}

function buildScriptTimelinePeriods(renderContext) {
  const periodStatsMap = renderContext?.periodStatsBySeparatorIndex || buildPeriodStatsMap(script);
  const periods = [];

  script.forEach((item, index) => {
    if (!item?.isSeparator) return;

    const periodPlays = getScriptTimelinePeriodPlays(index);
    const stats = getPeriodStats(index, periodStatsMap);
    const balance = buildScriptTimelineBalance(periodPlays);
    const personnelVisibility =
      typeof getPeriodPersonnelVisibilityState === "function"
        ? getPeriodPersonnelVisibilityState(index)
        : { total: periodPlays.length, visible: periodPlays.length, mode: "shown" };
    periods.push({
      id: item.id,
      index,
      label: item.label || "Period",
      notes: item.notes || "",
      color: getScriptTimelinePeriodColor(item),
      minutes: parseInt(item.minutes, 10) || 0,
      playCount: stats.playCount,
      reps: stats.periodReps,
      runCount: stats.runCount,
      passCount: stats.passCount,
      hideProtection: Boolean(item.hideProtection),
      personnelVisibility,
      ...balance,
      tempoLoad: getTopScriptTimelineBuckets(periodPlays, "tempo", "No tempo"),
      personnelLoad: getTopScriptTimelineBuckets(periodPlays, "personnel", "No personnel"),
      situationLoad: getTopScriptTimelineSituations(periodPlays),
    });
  });

  return periods;
}

function renderScriptTimelineLoadChips(label, buckets, emptyLabel) {
  if (!buckets.length) {
    return `<span class="script-timeline-chip script-timeline-chip--muted">${escapeHtml(emptyLabel)}</span>`;
  }

  return buckets
    .map(
      (bucket) =>
        `<span class="script-timeline-chip"><span>${escapeHtml(label)}</span> ${escapeHtml(bucket.label)} <strong>${bucket.count}</strong></span>`,
    )
    .join("");
}

function renderScriptTimelineBalance(period) {
  if (!period.totalReps) {
    return '<span class="script-timeline-balance script-timeline-balance--empty">No run/pass balance yet</span>';
  }

  return `
    <span class="script-timeline-balance" aria-label="Run pass balance by reps">
      <span class="script-timeline-balance-row">
        <span><strong>Run ${period.runPct}%</strong> ${period.runReps} reps</span>
        <span><strong>Pass ${period.passPct}%</strong> ${period.passReps} reps</span>
      </span>
      <span class="script-timeline-balance-meter" aria-hidden="true">
        <span class="script-timeline-balance-run" style="width: ${period.runPct}%"></span>
        <span class="script-timeline-balance-pass" style="width: ${period.passPct}%"></span>
        <span class="script-timeline-balance-other" style="width: ${period.otherPct}%"></span>
      </span>
    </span>`;
}

function renderScriptTimelineActions(period) {
  const label = period.label || "Period";
  const protectionLabel = period.hideProtection ? "Prot Off" : "Prot On";
  const protectionTitle = period.hideProtection
    ? `Show protection for ${label}`
    : `Hide protection for ${label}`;
  const personnelState = period.personnelVisibility || { total: 0, visible: 0, mode: "empty" };
  const personnelLabel = personnelState.mode === "shown"
    ? "Pers On"
    : personnelState.mode === "hidden"
      ? "Pers Off"
      : personnelState.mode === "mixed"
        ? "Pers Mix"
        : "Pers";
  const personnelTitle = personnelState.mode === "shown"
    ? `Hide personnel for all ${personnelState.total} plays in ${label}`
    : personnelState.mode === "hidden"
      ? `Show personnel for all ${personnelState.total} plays in ${label}`
      : personnelState.mode === "mixed"
        ? `Show personnel for all plays in ${label}; ${personnelState.visible} of ${personnelState.total} are currently shown`
        : `No plays in ${label} yet`;

  const actions = [
    ["duplicatePeriod", "Dup", `Duplicate ${label}`],
    ["savePeriodAsTemplate", "Save", `Save ${label} as a template`],
    [
      "togglePeriodProtection",
      protectionLabel,
      protectionTitle,
      period.hideProtection ? " is-active" : "",
    ],
    [
      "togglePeriodPersonnelVisibility",
      personnelLabel,
      personnelTitle,
      personnelState.mode === "shown" ? " is-active" : personnelState.mode === "mixed" ? " is-mixed" : "",
      !personnelState.total,
    ],
    ["printPeriod", "Print", `Print ${label}`],
  ];

  return `
    <span class="script-timeline-actions" aria-label="${escapeHtml(label)} timeline actions">
      ${actions
      .map(
        ([action, actionLabel, title, activeClass = "", disabled = false]) => `
        <button type="button" class="script-timeline-action${activeClass}" data-action="${action}" data-arg="${period.index}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"${disabled ? " disabled" : ""}>
          ${escapeHtml(actionLabel)}
        </button>`,
      )
      .join("")}
    </span>`;
}

function renderScriptTimeline(renderContext) {
  const timelineEl = document.getElementById("scriptTimeline");
  if (!timelineEl) return;

  const periods = buildScriptTimelinePeriods(renderContext);
  if (periods.length <= 1) {
    timelineEl.hidden = true;
    timelineEl.innerHTML = "";
    return;
  }

  const summary = renderContext?.renderSummary || buildScriptRenderSummary(script);
  const totalTime = summary.totalTime || periods.reduce((sum, period) => sum + period.minutes, 0);
  const totalReps = summary.totalReps || periods.reduce((sum, period) => sum + period.reps, 0);
  const hasTimedPlan = totalTime > 0;
  const periodLabel = periods.length === 1 ? "period" : "periods";
  const timeLabel = totalTime ? `${totalTime} min` : "No time set";
  const repLabel = `${totalReps} reps`;

  timelineEl.hidden = false;
  timelineEl.innerHTML = `
    <div class="script-timeline-head">
      <div>
        <h4>Practice Timeline</h4>
        <p>${periods.length} ${periodLabel} • ${repLabel} • ${timeLabel}</p>
      </div>
      <span class="script-timeline-hint">Tap a period to jump</span>
    </div>
    <div class="script-timeline-track">
      ${periods
      .map((period) => {
        const loadTotal = hasTimedPlan ? totalTime : totalReps;
        const loadBasis = hasTimedPlan ? period.minutes : period.reps;
        const loadPct = loadTotal > 0 && loadBasis > 0
          ? Math.min(100, Math.max(5, Math.round((loadBasis / loadTotal) * 100)))
          : 0;
        const ariaLabel =
          `${period.label}, ${period.playCount} plays, ${period.reps} reps, ` +
          `${period.minutes || 0} minutes, ${period.runPct}% run and ${period.passPct}% pass by reps. ` +
          `Top situations: ${period.situationLoad.map((bucket) => bucket.label).join(", ")}. Jump to period or drag to reorder.`;
        const noteHtml = period.notes
          ? `<span class="script-timeline-note">${escapeHtml(period.notes)}</span>`
          : "";
        const periodId = escapeHtml(String(period.id));

        return `
        <article class="script-timeline-card" draggable="true" data-drag="periodStart" data-idx="${period.index}" data-period-id="${periodId}" data-period-drop-id="${periodId}" style="--period-color: ${period.color}; --period-load: ${loadPct}%;" aria-label="${escapeHtml(ariaLabel)}">
          <span class="script-timeline-color" aria-hidden="true"></span>
          <span class="script-timeline-card-main">
            <button type="button" class="script-timeline-jump" data-action="jumpToPeriod" data-arg="${periodId}" title="Jump to ${escapeHtml(period.label)}">
              <span class="script-timeline-title">${escapeHtml(period.label)}</span>
            </button>
            <span class="script-timeline-meta">${period.playCount} plays • ${period.reps} reps • ${period.minutes || 0} min</span>
          </span>
          ${renderScriptTimelineActions(period)}
          <span class="script-timeline-split">
            <span><strong>${period.runCount}</strong> Run</span>
            <span><strong>${period.passCount}</strong> Pass</span>
          </span>
          ${renderScriptTimelineBalance(period)}
          <span class="script-timeline-load" aria-hidden="true"><span></span></span>
          <span class="script-timeline-situations">
            ${period.playCount
            ? renderScriptTimelineLoadChips("Situation", period.situationLoad, "Situation not set")
            : '<span class="script-timeline-chip script-timeline-chip--muted">Situation not set</span>'}
          </span>
          <span class="script-timeline-chips">
            ${period.playCount
            ? renderScriptTimelineLoadChips("Tempo", period.tempoLoad, "Tempo not set") +
            renderScriptTimelineLoadChips("Personnel", period.personnelLoad, "Personnel not set")
            : '<span class="script-timeline-chip script-timeline-chip--muted">No plays yet</span>'}
          </span>
          ${noteHtml}
        </article>`;
      })
      .join("")}
    </div>
  `;
}

function refreshScriptTimeline() {
  if (!document.getElementById("scriptTimeline")) return;
  scriptDerivedUiSignature = buildScriptDerivedUiSignature(script);
  renderScriptTimeline({
    periodStatsBySeparatorIndex: buildPeriodStatsMap(script),
    renderSummary: buildScriptRenderSummary(script),
  });
}
