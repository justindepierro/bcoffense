// installation-print.js — Smart install report generation and print
// Extracted from installation.js

function generateSmartInstallReport() {
  try {
    if (!plays || plays.length === 0) return null;

    const data = getInstallationData();
    const components = extractComponentsFromPlaybook();

    // ── Step 1: Rate every play ──────────────────────────────────
    const playRatings = plays.map((p) => {
      const rating = getPlayInstallRating(p);
      return { play: p, ...rating };
    });

    // ── Step 2: Classify plays by readiness ──────────────────────
    const gameReady = playRatings.filter(
      (r) => r.maxStars > 0 && r.stars === r.maxStars,
    );
    const nearReady = playRatings.filter(
      (r) =>
        r.maxStars > 0 &&
        r.stars > 0 &&
        r.maxStars - r.stars <= 2 &&
        r.stars < r.maxStars,
    );
    const inProgress = playRatings.filter(
      (r) => r.maxStars > 0 && r.stars > 0 && r.maxStars - r.stars > 2,
    );
    const notStarted = playRatings.filter(
      (r) => r.maxStars > 0 && r.stars === 0,
    );

    // ── Step 3: Score every UNINSTALLED component ────────────────
    const componentScores = [];

    INSTALL_CATEGORIES.forEach((cat) => {
      const allItems = components[cat.id] || [];
      const installed = data.installed[cat.id] || [];

      allItems.forEach((value) => {
        if (installed.includes(value)) return; // skip already installed

        // Find all plays that use this component
        const affectedPlays = playRatings.filter((r) => {
          if (cat.id === "formTag") {
            const tags = [r.play.formTag1, r.play.formTag2]
              .filter(Boolean)
              .map((t) => t.trim());
            return tags.includes(value);
          }
          const v = r.play[cat.field];
          return v && v.trim() === value;
        });

        if (affectedPlays.length === 0) return;

        // ── Dimension 1: Game-ready unlocks ──
        // How many plays would become fully installed if we install this?
        const wouldUnlock = affectedPlays.filter(
          (r) => r.maxStars - r.stars === 1,
        ).length;

        // ── Dimension 2: Near-ready lift ──
        // How many plays are within 2 of done and this helps?
        const wouldLift = affectedPlays.filter(
          (r) => r.maxStars - r.stars === 2,
        ).length;

        // ── Dimension 3: Breadth impact ──
        const breadth = affectedPlays.length;

        // ── Dimension 4: Variety — unique formation+personnel combos unlocked ──
        const combos = new Set();
        affectedPlays.forEach((r) => {
          const combo = `${r.play.formation || "?"}|${r.play.personnel || "?"}`;
          combos.add(combo);
        });
        const variety = combos.size;

        // ── Dimension 5: Run/Pass balance contribution ──
        const runCount = affectedPlays.filter(
          (r) => r.play.type === "Run",
        ).length;
        const passCount = affectedPlays.filter(
          (r) => r.play.type === "Pass",
        ).length;

        // ── Dimension 6: Cluster synergy ──
        // How many plays needing 1-2 more components does this help?
        const clusterPlays = affectedPlays.filter(
          (r) =>
            r.maxStars > 0 && r.maxStars - r.stars <= 2 && r.stars < r.maxStars,
        ).length;

        // ── Composite score (weighted) ──
        const score =
          wouldUnlock * 50 + // Highest priority: finishes plays
          clusterPlays * 20 + // High priority: near-completion synergy
          wouldLift * 15 + // Good: gets plays closer
          breadth * 5 + // Moderate: breadth of impact
          variety * 3; // Modest: variety bonus

        componentScores.push({
          categoryId: cat.id,
          categoryLabel: cat.label,
          icon: cat.icon,
          value,
          score,
          wouldUnlock,
          wouldLift,
          clusterPlays,
          breadth,
          variety,
          runCount,
          passCount,
          affectedPlayNames: affectedPlays
            .slice(0, 8)
            .map((r) => r.play.play || r.play.basePlay || "Unnamed"),
          totalAffected: affectedPlays.length,
        });
      });
    });

    // Sort by composite score desc
    componentScores.sort((a, b) => b.score - a.score);

    // ── Step 4: Build structured sections ────────────────────────

    // Section A: "Game Ready" plays summary
    const gameReadySummary = {
      count: gameReady.length,
      plays: gameReady.map((r) => ({
        name: r.play.play || r.play.basePlay || "Unnamed",
        formation: r.play.formation || "",
        personnel: r.play.personnel || "",
        type: r.play.type || "",
        stars: r.stars,
        maxStars: r.maxStars,
        _play: r.play,
      })),
    };

    // Section B: "One Install Away" — plays needing exactly 1 more component
    const oneAway = playRatings
      .filter((r) => r.maxStars > 0 && r.maxStars - r.stars === 1)
      .map((r) => {
        const missing = r.details.filter((d) => !d.installed);
        return {
          name: r.play.play || r.play.basePlay || "Unnamed",
          formation: r.play.formation || "",
          personnel: r.play.personnel || "",
          type: r.play.type || "",
          stars: r.stars,
          maxStars: r.maxStars,
          missing: missing[0] || null,
        };
      })
      .sort((a, b) => b.maxStars - a.maxStars); // sort by complexity (more stars = more complex play)

    // Section C: "Two Away" — plays needing exactly 2 more
    const twoAway = playRatings
      .filter((r) => r.maxStars > 0 && r.maxStars - r.stars === 2)
      .map((r) => {
        const missing = r.details.filter((d) => !d.installed);
        return {
          name: r.play.play || r.play.basePlay || "Unnamed",
          formation: r.play.formation || "",
          personnel: r.play.personnel || "",
          type: r.play.type || "",
          stars: r.stars,
          maxStars: r.maxStars,
          missing,
        };
      })
      .sort((a, b) => b.maxStars - a.maxStars);

    // Section D: Top priority installs (top 15)
    const topInstalls = componentScores.slice(0, 15);

    // Section E: "Quick wins" — components that unlock the most plays with 1 install
    const quickWins = componentScores
      .filter((c) => c.wouldUnlock >= 1)
      .sort((a, b) => b.wouldUnlock - a.wouldUnlock)
      .slice(0, 10);

    // Section F: "Variety boosters" — components that unlock the most unique combos
    const varietyBoosters = componentScores
      .filter((c) => c.variety >= 2)
      .sort((a, b) => b.variety - a.variety || b.breadth - a.breadth)
      .slice(0, 10);

    // Section G: "Coverage gaps" — categories with lowest install %
    const categoryGaps = INSTALL_CATEGORIES.map((cat) => {
      const allItems = components[cat.id] || [];
      const installed = (data.installed[cat.id] || []).filter((v) =>
        allItems.includes(v),
      );
      return {
        ...cat,
        total: allItems.length,
        installed: installed.length,
        remaining: allItems.length - installed.length,
        pct:
          allItems.length > 0
            ? Math.round((installed.length / allItems.length) * 100)
            : 100,
      };
    })
      .filter((c) => c.total > 0 && c.remaining > 0)
      .sort((a, b) => a.pct - b.pct);

    // Section H: Run/Pass readiness balance
    const readyRuns = gameReady.filter((r) => r.play.type === "Run").length;
    const readyPasses = gameReady.filter((r) => r.play.type === "Pass").length;
    const totalRuns = playRatings.filter((r) => r.play.type === "Run").length;
    const totalPasses = playRatings.filter(
      (r) => r.play.type === "Pass",
    ).length;

    return {
      gameReadySummary,
      oneAway,
      twoAway,
      topInstalls,
      quickWins,
      varietyBoosters,
      categoryGaps,
      balance: { readyRuns, readyPasses, totalRuns, totalPasses },
      totalPlays: plays.length,
      totalGameReady: gameReady.length,
      totalNearReady: nearReady.length,
      totalInProgress: inProgress.length,
      totalNotStarted: notStarted.length,
    };
  } catch (err) {
    console.error("generateSmartInstallReport error:", err);
    return null;
  }
}

function showSmartInstallReport() {
  const report = generateSmartInstallReport();
  if (!report) {
    showModal("No playbook loaded.", { title: "🧠 Smart Install Report" });
    return;
  }

  const { balance } = report;
  const runReadyPct =
    balance.totalRuns > 0
      ? Math.round((balance.readyRuns / balance.totalRuns) * 100)
      : 0;
  const passReadyPct =
    balance.totalPasses > 0
      ? Math.round((balance.readyPasses / balance.totalPasses) * 100)
      : 0;

  let html = `<div class="sir-container">`;

  // ── Print Button ────────────────────────────────────────────
  html += `
    <div class="sir-print-bar">
      <button class="btn btn-sm sir-print-btn" data-action="printSmartInstallReport" title="Print a professional copy of this report">🖨️ Print Report</button>
    </div>`;

  // ── Overview Banner ──────────────────────────────────────────
  html += `
    <div class="sir-overview">
      <div class="sir-ov-stat sir-ov-ready">
        <div class="sir-ov-num">${report.totalGameReady}</div>
        <div class="sir-ov-label">Game Ready</div>
      </div>
      <div class="sir-ov-stat sir-ov-near">
        <div class="sir-ov-num">${report.totalNearReady}</div>
        <div class="sir-ov-label">Near Ready</div>
      </div>
      <div class="sir-ov-stat sir-ov-progress">
        <div class="sir-ov-num">${report.totalInProgress}</div>
        <div class="sir-ov-label">In Progress</div>
      </div>
      <div class="sir-ov-stat sir-ov-none">
        <div class="sir-ov-num">${report.totalNotStarted}</div>
        <div class="sir-ov-label">Not Started</div>
      </div>
    </div>`;

  // ── Run/Pass Balance ─────────────────────────────────────────
  html += `
    <div class="sir-section">
      <div class="sir-section-title">⚖️ Run/Pass Readiness Balance</div>
      <div class="sir-balance">
        <div class="sir-balance-bar">
          <div class="sir-balance-label">Run Ready</div>
          <div class="sir-bar-track">
            <div class="sir-bar-fill sir-bar-run" style="--bar-width:${runReadyPct}%"></div>
          </div>
          <div class="sir-balance-nums">${balance.readyRuns}/${balance.totalRuns} (${runReadyPct}%)</div>
        </div>
        <div class="sir-balance-bar">
          <div class="sir-balance-label">Pass Ready</div>
          <div class="sir-bar-track">
            <div class="sir-bar-fill sir-bar-pass" style="--bar-width:${passReadyPct}%"></div>
          </div>
          <div class="sir-balance-nums">${balance.readyPasses}/${balance.totalPasses} (${passReadyPct}%)</div>
        </div>
      </div>
    </div>`;

  // ── Touch Distribution ───────────────────────────────────────
  if (
    typeof computeTouchAnalysis === "function" &&
    typeof renderTouchAnalysis === "function" &&
    plays &&
    plays.length > 0
  ) {
    const allTouchAnalysis = computeTouchAnalysis(plays);
    // Also compute for game-ready plays only
    const gameReadyPlays =
      report.gameReadySummary && report.gameReadySummary.plays
        ? report.gameReadySummary.plays
          .map((p) => p._play || p)
          .filter((p) => p && p.play)
        : [];
    const gameReadyAnalysis =
      gameReadyPlays.length > 0 ? computeTouchAnalysis(gameReadyPlays) : null;

    if (allTouchAnalysis && Object.keys(allTouchAnalysis.players).length > 0) {
      html += `
        <div class="sir-section">
          <div class="sir-section-title">🏈 Touch Distribution <span class="sir-section-hint">Weighted player usage across your playbook</span></div>
          ${renderTouchAnalysis(allTouchAnalysis, { title: "All Plays", idPrefix: "sir-ta-all" })}
          ${gameReadyAnalysis &&
          Object.keys(gameReadyAnalysis.players).length > 0
          ? renderTouchAnalysis(gameReadyAnalysis, {
            title: "Game Ready Only",
            compact: true,
            idPrefix: "sir-ta-gr",
          })
          : ""
        }
        </div>`;
    }
  }

  // ── Quick Wins ───────────────────────────────────────────────
  if (report.quickWins.length > 0) {
    html += `
      <div class="sir-section">
        <div class="sir-section-title">⚡ Quick Wins <span class="sir-section-hint">Install one thing, unlock game-ready plays</span></div>
        <div class="sir-cards">`;

    report.quickWins.forEach((c) => {
      html += `
          <div class="sir-card sir-card-quickwin">
            <div class="sir-card-head">
              <span class="sir-card-icon">${c.icon}</span>
              <span class="sir-card-value">${escapeHtml(c.value)}</span>
              <span class="sir-card-cat">${c.categoryLabel}</span>
            </div>
            <div class="sir-card-impact">
              <span class="sir-badge sir-badge-unlock">🔓 Unlocks ${c.wouldUnlock} play${c.wouldUnlock !== 1 ? "s" : ""}</span>
              ${c.breadth > c.wouldUnlock ? `<span class="sir-badge sir-badge-breadth">📊 Helps ${c.breadth} total</span>` : ""}
            </div>
            <div class="sir-card-plays">${c.affectedPlayNames.map((n) => escapeHtml(n)).join(", ")}${c.totalAffected > 8 ? ` +${c.totalAffected - 8} more` : ""}</div>
          </div>`;
    });

    html += `</div></div>`;
  }

  // ── One Install Away ─────────────────────────────────────────
  if (report.oneAway.length > 0) {
    html += `
      <div class="sir-section">
        <div class="sir-section-title">🎯 One Install Away <span class="sir-section-hint">${report.oneAway.length} play${report.oneAway.length !== 1 ? "s" : ""} need just 1 more component</span></div>
        <div class="sir-list">`;

    report.oneAway.forEach((p) => {
      const subtitle = [p.personnel, p.formation].filter(Boolean).join(" · ");
      html += `
          <div class="sir-list-row sir-list-oneaway">
            <div class="sir-list-info">
              <div class="sir-list-name">${escapeHtml(p.name)}</div>
              ${subtitle ? `<div class="sir-list-sub">${escapeHtml(subtitle)}</div>` : ""}
            </div>
            <div class="sir-list-stars">${renderStarRating(p.stars, p.maxStars, "sm")}</div>
            ${p.missing ? `<div class="sir-list-missing"><span class="sir-missing-badge">${p.missing.icon} ${escapeHtml(p.missing.value)}</span></div>` : ""}
          </div>`;
    });

    html += `</div></div>`;
  }

  // ── Top Priority Installs ────────────────────────────────────
  if (report.topInstalls.length > 0) {
    html += `
      <div class="sir-section">
        <div class="sir-section-title">📋 Recommended Install Order <span class="sir-section-hint">Prioritized by impact across your playbook</span></div>
        <div class="sir-priority-list">`;

    report.topInstalls.forEach((c, idx) => {
      const tags = [];
      if (c.wouldUnlock > 0) tags.push(`🔓 ${c.wouldUnlock} game-ready`);
      if (c.clusterPlays > 0) tags.push(`🎯 ${c.clusterPlays} near-ready`);
      if (c.variety >= 3) tags.push(`🌐 ${c.variety} combos`);
      if (c.runCount > 0 && c.passCount > 0) tags.push("⚖️ Run+Pass");
      else if (c.runCount > 0) tags.push("🏃 Run");
      else if (c.passCount > 0) tags.push("🎯 Pass");

      html += `
          <div class="sir-priority-row">
            <div class="sir-priority-rank">${idx + 1}</div>
            <div class="sir-priority-info">
              <div class="sir-priority-head">
                <span class="sir-priority-icon">${c.icon}</span>
                <span class="sir-priority-value">${escapeHtml(c.value)}</span>
                <span class="sir-priority-cat">${c.categoryLabel}</span>
              </div>
              <div class="sir-priority-tags">${tags.map((t) => `<span class="sir-tag">${t}</span>`).join("")}</div>
            </div>
            <div class="sir-priority-stat">
              <div class="sir-priority-breadth">${c.breadth} play${c.breadth !== 1 ? "s" : ""}</div>
            </div>
          </div>`;
    });

    html += `</div></div>`;
  }

  // ── Two Away ─────────────────────────────────────────────────
  if (report.twoAway.length > 0) {
    html += `
      <div class="sir-section">
        <div class="sir-section-title">🔜 Two Installs Away <span class="sir-section-hint">${report.twoAway.length} play${report.twoAway.length !== 1 ? "s" : ""} need 2 more</span></div>
        <div class="sir-list">`;

    report.twoAway.slice(0, 20).forEach((p) => {
      const subtitle = [p.personnel, p.formation].filter(Boolean).join(" · ");
      html += `
          <div class="sir-list-row sir-list-twoaway">
            <div class="sir-list-info">
              <div class="sir-list-name">${escapeHtml(p.name)}</div>
              ${subtitle ? `<div class="sir-list-sub">${escapeHtml(subtitle)}</div>` : ""}
            </div>
            <div class="sir-list-stars">${renderStarRating(p.stars, p.maxStars, "sm")}</div>
            <div class="sir-list-missing">${p.missing.map((m) => `<span class="sir-missing-badge">${m.icon} ${escapeHtml(m.value)}</span>`).join("")}</div>
          </div>`;
    });

    if (report.twoAway.length > 20) {
      html += `<div class="sir-list-more">+${report.twoAway.length - 20} more plays</div>`;
    }

    html += `</div></div>`;
  }

  // ── Variety Boosters ─────────────────────────────────────────
  if (report.varietyBoosters.length > 0) {
    html += `
      <div class="sir-section">
        <div class="sir-section-title">🌐 Variety Boosters <span class="sir-section-hint">Add diversity to your game plan</span></div>
        <div class="sir-cards">`;

    report.varietyBoosters.forEach((c) => {
      html += `
          <div class="sir-card sir-card-variety">
            <div class="sir-card-head">
              <span class="sir-card-icon">${c.icon}</span>
              <span class="sir-card-value">${escapeHtml(c.value)}</span>
              <span class="sir-card-cat">${c.categoryLabel}</span>
            </div>
            <div class="sir-card-impact">
              <span class="sir-badge sir-badge-variety">🌐 ${c.variety} unique combos</span>
              <span class="sir-badge sir-badge-breadth">📊 ${c.breadth} plays</span>
            </div>
          </div>`;
    });

    html += `</div></div>`;
  }

  // ── Coverage Gaps ────────────────────────────────────────────
  if (report.categoryGaps.length > 0) {
    html += `
      <div class="sir-section">
        <div class="sir-section-title">📉 Coverage Gaps <span class="sir-section-hint">Categories with the most room to grow</span></div>
        <div class="sir-gaps">`;

    report.categoryGaps.forEach((g) => {
      html += `
          <div class="sir-gap-row">
            <div class="sir-gap-label">${g.icon} ${g.label}</div>
            <div class="sir-gap-bar-wrap">
              <div class="sir-bar-track">
                <div class="sir-bar-fill sir-bar-gap" style="--bar-width:${g.pct}%"></div>
              </div>
            </div>
            <div class="sir-gap-nums">${g.installed}/${g.total} (${g.remaining} left)</div>
          </div>`;
    });

    html += `</div></div>`;
  }

  // ── Game Ready Roster ────────────────────────────────────────
  if (report.gameReadySummary.plays.length > 0) {
    html += `
      <div class="sir-section sir-section-collapsed" id="sirGameReadySection">
        <div class="sir-section-title sir-section-toggle" data-action="toggleSirCollapse">
          ✅ Game Ready Roster <span class="sir-section-hint">${report.gameReadySummary.count} play${report.gameReadySummary.count !== 1 ? "s" : ""} fully installed</span>
          <span class="sir-collapse-icon">▶</span>
        </div>
        <div class="sir-collapsible">
          <div class="sir-list">`;

    report.gameReadySummary.plays.forEach((p) => {
      const subtitle = [p.personnel, p.formation].filter(Boolean).join(" · ");
      const typeClass =
        p.type === "Run"
          ? "sir-type-run"
          : p.type === "Pass"
            ? "sir-type-pass"
            : "";
      html += `
            <div class="sir-list-row sir-list-ready">
              <div class="sir-list-info">
                <div class="sir-list-name">${escapeHtml(p.name)}</div>
                ${subtitle ? `<div class="sir-list-sub">${escapeHtml(subtitle)}</div>` : ""}
              </div>
              <div class="sir-list-stars">${renderStarRating(p.stars, p.maxStars, "sm")}</div>
              ${p.type ? `<span class="sir-type-badge ${typeClass}">${escapeHtml(p.type)}</span>` : ""}
            </div>`;
    });

    html += `</div></div></div>`;
  }

  html += `</div>`; // close .sir-container

  showModal(html, {
    title: "🧠 Smart Installation Report",
    confirmText: "Close",
  });
}

function printSmartInstallReport() {
  const report = generateSmartInstallReport();
  if (!report) return;

  const container = document.getElementById("installReportPrint");
  const content = document.getElementById("installReportPrintContent");
  if (!container || !content) return;

  try {
    showToast("🖨️ Preparing install report…", 2500);

    const { balance } = report;
    const runReadyPct =
      balance.totalRuns > 0
        ? Math.round((balance.readyRuns / balance.totalRuns) * 100)
        : 0;
    const passReadyPct =
      balance.totalPasses > 0
        ? Math.round((balance.readyPasses / balance.totalPasses) * 100)
        : 0;
    const overallReady =
      report.totalPlays > 0
        ? Math.round((report.totalGameReady / report.totalPlays) * 100)
        : 0;
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let html = `
    <div class="sirp">
      <div class="sirp-header">
        <div class="sirp-header-left">
          <div class="sirp-title">Smart Installation Report</div>
          <div class="sirp-date">${dateStr}</div>
        </div>
        <div class="sirp-header-right">
          <div class="sirp-overall">
            <div class="sirp-overall-pct">${overallReady}%</div>
            <div class="sirp-overall-label">Game Ready</div>
          </div>
        </div>
      </div>

      <div class="sirp-stats-row">
        <div class="sirp-stat sirp-stat-ready"><span class="sirp-stat-num">${report.totalGameReady}</span><span class="sirp-stat-label">Game Ready</span></div>
        <div class="sirp-stat sirp-stat-near"><span class="sirp-stat-num">${report.totalNearReady}</span><span class="sirp-stat-label">Near Ready</span></div>
        <div class="sirp-stat sirp-stat-prog"><span class="sirp-stat-num">${report.totalInProgress}</span><span class="sirp-stat-label">In Progress</span></div>
        <div class="sirp-stat sirp-stat-none"><span class="sirp-stat-num">${report.totalNotStarted}</span><span class="sirp-stat-label">Not Started</span></div>
        <div class="sirp-stat"><span class="sirp-stat-num">${report.totalPlays}</span><span class="sirp-stat-label">Total Plays</span></div>
      </div>

      <div class="sirp-balance-row">
        <div class="sirp-balance-item">
          <span class="sirp-balance-label">Run Ready:</span>
          <span class="sirp-balance-bar-wrap"><span class="sirp-balance-fill sirp-fill-run" style="--bar-width:${runReadyPct}%"></span></span>
          <span class="sirp-balance-val">${balance.readyRuns}/${balance.totalRuns} (${runReadyPct}%)</span>
        </div>
        <div class="sirp-balance-item">
          <span class="sirp-balance-label">Pass Ready:</span>
          <span class="sirp-balance-bar-wrap"><span class="sirp-balance-fill sirp-fill-pass" style="--bar-width:${passReadyPct}%"></span></span>
          <span class="sirp-balance-val">${balance.readyPasses}/${balance.totalPasses} (${passReadyPct}%)</span>
        </div>
      </div>`;

    // ── Touch Distribution (Print) ──
    if (
      typeof computeTouchAnalysis === "function" &&
      plays &&
      plays.length > 0
    ) {
      const allTouch = computeTouchAnalysis(plays);
      if (allTouch && Object.keys(allTouch.players).length > 0) {
        const playerRows = Object.values(allTouch.players);
        html += `
        <div class="sirp-section">
          <div class="sirp-section-title">🏈 Touch Distribution — Weighted Player Usage</div>
          <table class="sirp-table">
            <thead><tr><th>Player</th><th>Weighted %</th><th>Points</th><th>Plays</th><th>KP1</th><th>KP2</th><th>KP3</th><th>Primary Rate</th></tr></thead>
            <tbody>`;
        playerRows.forEach((p) => {
          html += `<tr><td><strong>${escapeHtml(p.name)}</strong></td><td class="sirp-center">${p.pct.toFixed(1)}%</td><td class="sirp-center">${Number.isInteger(p.weightedPts) ? p.weightedPts : p.weightedPts.toFixed(1)}</td><td class="sirp-center">${p.flatCount}</td><td class="sirp-center">${p.slots.kp1}</td><td class="sirp-center">${p.slots.kp2}</td><td class="sirp-center">${p.slots.kp3}</td><td class="sirp-center">${p.primaryRate.toFixed(0)}%</td></tr>`;
        });
        html += `</tbody></table>`;

        // Game-ready touch comparison
        const grPlays =
          report.gameReadySummary && report.gameReadySummary.plays
            ? report.gameReadySummary.plays.map((p) => p._play).filter(Boolean)
            : [];
        if (grPlays.length > 0) {
          const grTouch = computeTouchAnalysis(grPlays);
          if (grTouch && Object.keys(grTouch.players).length > 0) {
            html += `
            <div class="sirp-section-subtitle">Game Ready Only</div>
            <table class="sirp-table">
              <thead><tr><th>Player</th><th>Weighted %</th><th>Points</th><th>Plays</th></tr></thead>
              <tbody>`;
            Object.values(grTouch.players).forEach((p) => {
              html += `<tr><td><strong>${escapeHtml(p.name)}</strong></td><td class="sirp-center">${p.pct.toFixed(1)}%</td><td class="sirp-center">${Number.isInteger(p.weightedPts) ? p.weightedPts : p.weightedPts.toFixed(1)}</td><td class="sirp-center">${p.flatCount}</td></tr>`;
            });
            html += `</tbody></table>`;
          }
        }
        html += `</div>`;
      }
    }

    // ── Quick Wins ──
    if (report.quickWins.length > 0) {
      html += `
      <div class="sirp-section">
        <div class="sirp-section-title">⚡ Quick Wins — Install One, Unlock Game-Ready Plays</div>
        <table class="sirp-table">
          <thead><tr><th>Component</th><th>Category</th><th>Unlocks</th><th>Total Impact</th></tr></thead>
          <tbody>`;
      report.quickWins.forEach((c) => {
        html += `<tr><td><strong>${escapeHtml(c.value)}</strong></td><td>${c.icon} ${c.categoryLabel}</td><td class="sirp-center">${c.wouldUnlock}</td><td class="sirp-center">${c.breadth} plays</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ── Recommended Install Order ──
    if (report.topInstalls.length > 0) {
      html += `
      <div class="sirp-section">
        <div class="sirp-section-title">📋 Recommended Install Order — Prioritized by Impact</div>
        <table class="sirp-table">
          <thead><tr><th class="sirp-rank-col">#</th><th>Component</th><th>Category</th><th>Unlocks</th><th>Near-Ready</th><th>Total</th><th>Details</th></tr></thead>
          <tbody>`;
      report.topInstalls.forEach((c, idx) => {
        const tags = [];
        if (c.variety >= 3) tags.push(`${c.variety} combos`);
        if (c.runCount > 0 && c.passCount > 0) tags.push("Run+Pass");
        else if (c.runCount > 0) tags.push("Run");
        else if (c.passCount > 0) tags.push("Pass");
        html += `<tr><td class="sirp-center"><strong>${idx + 1}</strong></td><td><strong>${escapeHtml(c.value)}</strong></td><td>${c.icon} ${c.categoryLabel}</td><td class="sirp-center">${c.wouldUnlock || "-"}</td><td class="sirp-center">${c.clusterPlays || "-"}</td><td class="sirp-center">${c.breadth}</td><td class="sirp-tags-cell">${tags.join(", ") || "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ── One Install Away ──
    if (report.oneAway.length > 0) {
      html += `
      <div class="sirp-section">
        <div class="sirp-section-title">🎯 One Install Away — ${report.oneAway.length} Play${report.oneAway.length !== 1 ? "s" : ""}</div>
        <table class="sirp-table">
          <thead><tr><th>Play</th><th>Personnel</th><th>Formation</th><th>Missing Component</th></tr></thead>
          <tbody>`;
      report.oneAway.forEach((p) => {
        html += `<tr><td><strong>${escapeHtml(p.name)}</strong></td><td>${escapeHtml(p.personnel)}</td><td>${escapeHtml(p.formation)}</td><td>${p.missing ? p.missing.icon + " " + escapeHtml(p.missing.value) : "-"}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ── Two Away ──
    if (report.twoAway.length > 0) {
      html += `
      <div class="sirp-section">
        <div class="sirp-section-title">🔜 Two Installs Away — ${report.twoAway.length} Play${report.twoAway.length !== 1 ? "s" : ""}</div>
        <table class="sirp-table">
          <thead><tr><th>Play</th><th>Personnel</th><th>Formation</th><th>Missing Components</th></tr></thead>
          <tbody>`;
      report.twoAway.forEach((p) => {
        const missingStr = p.missing
          .map((m) => m.icon + " " + escapeHtml(m.value))
          .join(", ");
        html += `<tr><td><strong>${escapeHtml(p.name)}</strong></td><td>${escapeHtml(p.personnel)}</td><td>${escapeHtml(p.formation)}</td><td>${missingStr}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ── Variety Boosters ──
    if (report.varietyBoosters.length > 0) {
      html += `
      <div class="sirp-section">
        <div class="sirp-section-title">🌐 Variety Boosters — Add Diversity to Your Game Plan</div>
        <table class="sirp-table">
          <thead><tr><th>Component</th><th>Category</th><th>Unique Combos</th><th>Total Plays</th></tr></thead>
          <tbody>`;
      report.varietyBoosters.forEach((c) => {
        html += `<tr><td><strong>${escapeHtml(c.value)}</strong></td><td>${c.icon} ${c.categoryLabel}</td><td class="sirp-center">${c.variety}</td><td class="sirp-center">${c.breadth}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ── Coverage Gaps ──
    if (report.categoryGaps.length > 0) {
      html += `
      <div class="sirp-section">
        <div class="sirp-section-title">📉 Coverage Gaps</div>
        <table class="sirp-table">
          <thead><tr><th>Category</th><th>Installed</th><th>Remaining</th><th>Progress</th></tr></thead>
          <tbody>`;
      report.categoryGaps.forEach((g) => {
        html += `<tr><td>${g.icon} <strong>${g.label}</strong></td><td class="sirp-center">${g.installed}/${g.total}</td><td class="sirp-center">${g.remaining}</td><td class="sirp-center">${g.pct}%</td></tr>`;
      });
      html += `</tbody></table></div>`;
    }

    // ── Game Ready Roster ──
    if (report.gameReadySummary.plays.length > 0) {
      html += `
      <div class="sirp-section">
        <div class="sirp-section-title">✅ Game Ready Roster — ${report.gameReadySummary.count} Play${report.gameReadySummary.count !== 1 ? "s" : ""} Fully Installed</div>
        <div class="sirp-roster">`;
      const runs = report.gameReadySummary.plays.filter(
        (p) => p.type === "Run",
      );
      const passes = report.gameReadySummary.plays.filter(
        (p) => p.type === "Pass",
      );
      const other = report.gameReadySummary.plays.filter(
        (p) => p.type !== "Run" && p.type !== "Pass",
      );
      if (runs.length > 0) {
        html += `<div class="sirp-roster-group"><div class="sirp-roster-heading">🏃 Run (${runs.length})</div><div class="sirp-roster-items">${runs.map((p) => `<span class="sirp-roster-item">${escapeHtml(p.name)} <span class="sirp-roster-sub">${escapeHtml(p.formation)}</span></span>`).join("")}</div></div>`;
      }
      if (passes.length > 0) {
        html += `<div class="sirp-roster-group"><div class="sirp-roster-heading">🎯 Pass (${passes.length})</div><div class="sirp-roster-items">${passes.map((p) => `<span class="sirp-roster-item">${escapeHtml(p.name)} <span class="sirp-roster-sub">${escapeHtml(p.formation)}</span></span>`).join("")}</div></div>`;
      }
      if (other.length > 0) {
        html += `<div class="sirp-roster-group"><div class="sirp-roster-heading">Other (${other.length})</div><div class="sirp-roster-items">${other.map((p) => `<span class="sirp-roster-item">${escapeHtml(p.name)} <span class="sirp-roster-sub">${escapeHtml(p.formation)}</span></span>`).join("")}</div></div>`;
      }
      html += `</div></div>`;
    }

    html += `
      <div class="sirp-footer">Generated by BC Offense · ${dateStr}</div>
    </div>`;

    content.innerHTML = html;
    container.classList.remove("hidden");
    document.body.dataset.printMode = "install";

    setupPrintPageStyle(
      "@media print { @page { size: letter portrait; margin: 0.3in; } }",
    );

    setTimeout(() => {
      try {
        const restoreTitle = setPrintTitle("Install-Report");
        window.print();
        restoreTitle();
      } finally {
        container.classList.add("hidden");
        delete document.body.dataset.printMode;
      }
    }, 150);
  } catch (err) {
    console.error("printSmartInstallReport error:", err);
    document.getElementById("installReportPrint")?.classList?.add("hidden");
    delete document.body.dataset.printMode;
    showToast("❌ Error printing install report.", {
      duration: 4000,
      type: "error",
    });
  }
}
