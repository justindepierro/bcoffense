// playbook-reports-identity.js — Constraint Map + Identity Alignment report engines
// Extracted from playbook-reports.js

function _pbConstraintTerms(play) {
  const terms = [play?.constraint1, play?.constraint2, play?.constraint3]
    .map(_pbSituationClean)
    .filter(Boolean);
  return [...new Set(terms)];
}

function _pbConstraintConcept(play) {
  return (
    _pbSituationClean(play?.basePlay) ||
    _pbSituationClean(play?.play) ||
    _pbSituationClean(play?.type) ||
    "No Concept"
  );
}

function _pbConstraintAddFamily(row, play) {
  const family = _pbBalanceTypeFamily(play);
  row.families[family] = (row.families[family] || 0) + 1;
}

function _pbConstraintAnalyze(source) {
  const conceptMap = new Map();
  const complementMap = new Map();
  let taggedPlays = 0;
  let totalLinks = 0;

  source.forEach((play) => {
    const concept = _pbConstraintConcept(play);
    const terms = _pbConstraintTerms(play);
    if (terms.length) taggedPlays += 1;

    if (!conceptMap.has(concept)) {
      conceptMap.set(concept, {
        name: concept,
        count: 0,
        constraints: new Map(),
        families: { Run: 0, Pass: 0, RPO: 0, Other: 0 },
        examples: [],
      });
    }
    const conceptRow = conceptMap.get(concept);
    conceptRow.count += 1;
    _pbConstraintAddFamily(conceptRow, play);
    if (conceptRow.examples.length < 4 && play?.play) {
      conceptRow.examples.push(play.play);
    }

    terms.forEach((term) => {
      totalLinks += 1;
      conceptRow.constraints.set(
        term,
        (conceptRow.constraints.get(term) || 0) + 1,
      );

      if (!complementMap.has(term)) {
        complementMap.set(term, {
          name: term,
          count: 0,
          concepts: new Map(),
          families: { Run: 0, Pass: 0, RPO: 0, Other: 0 },
        });
      }
      const complementRow = complementMap.get(term);
      complementRow.count += 1;
      complementRow.concepts.set(
        concept,
        (complementRow.concepts.get(concept) || 0) + 1,
      );
      _pbConstraintAddFamily(complementRow, play);
    });
  });

  const conceptRows = Array.from(conceptMap.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  const complementRows = Array.from(complementMap.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  const complementedConcepts = conceptRows.filter((row) => row.constraints.size > 0);
  const gapRows = conceptRows.filter((row) => row.count >= 2 && row.constraints.size === 0);
  const thinRows = conceptRows.filter((row) => row.count >= 4 && row.constraints.size === 1);

  return {
    total: source.length,
    taggedPlays,
    totalLinks,
    conceptRows,
    complementRows,
    complementedConcepts,
    gapRows,
    thinRows,
  };
}

function _pbConstraintSignals(analysis) {
  const signals = [];
  if (!analysis.total) {
    return ["No plays in this scope. Clear filters or import plays to review complements."];
  }
  if (!analysis.totalLinks) {
    return ["No constraint/complement tags found in this scope. Add Constraint 1/2/3 values to map answers."];
  }

  const missing = analysis.total - analysis.taggedPlays;
  if (missing > 0) {
    signals.push(`${missing} play${missing === 1 ? "" : "s"} have no constraint/complement tags.`);
  }
  if (analysis.gapRows.length) {
    const names = analysis.gapRows.slice(0, 3).map((row) => row.name).join(", ");
    signals.push(`${names} need complement tags before they can be checked as families.`);
  }
  if (analysis.thinRows.length) {
    const names = analysis.thinRows.slice(0, 3).map((row) => row.name).join(", ");
    signals.push(`${names} have volume but only one complement answer tagged.`);
  }
  const top = analysis.complementRows[0];
  if (top && _pbBalancePct(top.count, analysis.totalLinks) >= 35) {
    signals.push(`${top.name} accounts for ${_pbBalancePct(top.count, analysis.totalLinks)}% of complement links.`);
  }
  if (!signals.length) {
    signals.push("Constraint tags give the major concepts multiple visible complement answers in this scope.");
  }
  return signals.slice(0, 8);
}

function _pbConstraintChipList(map, className = "pb-constraint-chip") {
  const rows = Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!rows.length) return '<span class="pb-constraint-empty-chip">No complements tagged</span>';
  return rows
    .slice(0, 8)
    .map(([name, count]) => `<span class="${className}">${escapeHtml(name)} <b>${count}</b></span>`)
    .join("");
}

function _pbConstraintRenderConcepts(analysis) {
  if (!analysis.conceptRows.length) {
    return '<div class="pb-balance-empty">No concepts in this scope.</div>';
  }
  return analysis.conceptRows
    .slice(0, 12)
    .map((row) => {
      const pct = _pbBalancePct(row.count, analysis.total);
      const exampleText = row.examples.length
        ? row.examples.map(escapeHtml).join(", ")
        : "No example plays";
      return `
        <div class="pb-constraint-card${row.constraints.size ? "" : " is-gap"}">
          <div class="pb-constraint-card-head">
            <div>
              <strong>${escapeHtml(row.name)}</strong>
              <span>${row.count} play${row.count === 1 ? "" : "s"} • ${pct}%</span>
            </div>
            <div class="pb-balance-tags">${_pbBalanceFamilyTags(row)}</div>
          </div>
          <div class="pb-constraint-chips">
            ${_pbConstraintChipList(row.constraints)}
          </div>
          <div class="pb-constraint-examples">${exampleText}</div>
        </div>
      `;
    })
    .join("");
}

function _pbConstraintRenderComplements(analysis) {
  if (!analysis.complementRows.length) {
    return '<div class="pb-balance-empty">No complement tags in this scope.</div>';
  }
  return analysis.complementRows
    .slice(0, 12)
    .map((row) => {
      const pct = _pbBalancePct(row.count, analysis.totalLinks);
      return `
        <div class="pb-constraint-complement-row">
          <div class="pb-balance-row-main">
            <strong>${escapeHtml(row.name)}</strong>
            <span>${row.count} link${row.count === 1 ? "" : "s"} • ${pct}%</span>
          </div>
          <div class="pb-balance-meter" style="--bar-width:${pct}%"><i></i></div>
          <div class="pb-constraint-chips">
            ${_pbConstraintChipList(row.concepts, "pb-constraint-chip pb-constraint-chip-muted")}
          </div>
        </div>
      `;
    })
    .join("");
}

function _pbConstraintRenderGaps(analysis) {
  const rows = [...analysis.gapRows, ...analysis.thinRows]
    .filter((row, index, arr) => arr.findIndex((item) => item.name === row.name) === index)
    .slice(0, 10);
  if (!rows.length) {
    return '<div class="pb-balance-empty">No high-volume concept complement gaps found.</div>';
  }
  return rows
    .map((row) => {
      const label = row.constraints.size === 0 ? "No complements" : "Thin complement menu";
      return `
        <div class="pb-constraint-gap-row">
          <strong>${escapeHtml(row.name)}</strong>
          <span>${escapeHtml(label)} • ${row.count} plays</span>
        </div>
      `;
    })
    .join("");
}

function openPlaybookConstraintMap() {
  if (!Array.isArray(plays) || plays.length === 0) {
    showToast("Import a playbook CSV first", { duration: 2500, type: "error" });
    return;
  }

  const scope = _pbBalanceScope();
  const analysis = _pbConstraintAnalyze(scope.plays);
  const signals = _pbConstraintSignals(analysis);
  const taggedPct = _pbBalancePct(analysis.taggedPlays, analysis.total);
  const conceptPct = _pbBalancePct(
    analysis.complementedConcepts.length,
    analysis.conceptRows.length,
  );

  document.getElementById("playbookConstraintOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay visible";
  overlay.id = "playbookConstraintOverlay";
  overlay.dataset.action = "closePlaybookConstraintMapOverlay";
  overlay.innerHTML = `
    <div class="custom-modal pb-balance-modal pb-constraint-modal" role="dialog" aria-modal="true" aria-labelledby="playbookConstraintTitle">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">🧩</span>
        <h3 class="custom-modal-title" id="playbookConstraintTitle">Constraint & Complement Map</h3>
        <button class="modal-close" aria-label="Close" data-action="closePlaybookConstraintMap">×</button>
      </div>
      <div class="custom-modal-body pb-balance-body">
        <div class="pb-balance-summary">
          <div class="pb-balance-card">
            <strong>${escapeHtml(scope.label)}</strong>
            <span>${escapeHtml(scope.detail)}</span>
          </div>
          <div class="pb-balance-card">
            <strong>${taggedPct}%</strong>
            <span>Plays Tagged</span>
          </div>
          <div class="pb-balance-card">
            <strong>${conceptPct}%</strong>
            <span>Concepts Covered</span>
          </div>
          <div class="pb-balance-card">
            <strong>${analysis.complementRows.length}</strong>
            <span>Complements</span>
          </div>
          <div class="pb-balance-card">
            <strong>${analysis.gapRows.length + analysis.thinRows.length}</strong>
            <span>Concept Gaps</span>
          </div>
        </div>
        <div class="pb-balance-guidance">
          ${signals.map((signal) => `<div>${escapeHtml(signal)}</div>`).join("")}
        </div>
        <div class="pb-constraint-layout">
          <section class="pb-balance-section pb-constraint-section">
            <div class="pb-balance-section-head">
              <h4>Concept Map</h4>
              <span>Base play to tagged complement answers</span>
            </div>
            <div class="pb-constraint-card-grid">${_pbConstraintRenderConcepts(analysis)}</div>
          </section>
          <section class="pb-balance-section pb-constraint-section">
            <div class="pb-balance-section-head">
              <h4>Complement Usage</h4>
              <span>Where each answer shows up</span>
            </div>
            ${_pbConstraintRenderComplements(analysis)}
          </section>
          <section class="pb-balance-section pb-constraint-section">
            <div class="pb-balance-section-head">
              <h4>Gaps</h4>
              <span>Concepts with no or thin complement tags</span>
            </div>
            ${_pbConstraintRenderGaps(analysis)}
          </section>
        </div>
      </div>
      <div class="custom-modal-actions">
        ${scope.hasFilters ? '<button type="button" class="btn btn-sm" data-action="clearPlaybookConstraintFilters">Clear Playbook Filters</button>' : ""}
        <button type="button" class="btn btn-sm" data-action="closePlaybookConstraintMap">Done</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
}

function closePlaybookConstraintMap() {
  const overlay = document.getElementById("playbookConstraintOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 180);
}

function clearPlaybookConstraintFilters() {
  if (typeof clearFilters === "function") clearFilters();
  closePlaybookConstraintMap();
  requestAnimationFrame(() => openPlaybookConstraintMap());
}

function _pbIdentityVisionTargets() {
  const targets = typeof VISION_2026 !== "undefined"
    ? VISION_2026.repDistribution?.byPicture
    : null;
  return PB_IDENTITY_PICTURES.map((picture) => {
    const target = Number(targets?.[picture.id]);
    return {
      ...picture,
      target: Number.isFinite(target) && target > 0 ? target : picture.fallbackTarget,
    };
  });
}

function _pbIdentityText(play) {
  return [
    play?.type,
    play?.personnel,
    play?.formation,
    play?.formTag1,
    play?.formTag2,
    play?.shift,
    play?.motion,
    play?.protection,
    play?.lineCall,
    play?.play,
    play?.playTag1,
    play?.playTag2,
    play?.basePlay,
    play?.oneWord,
    play?.tempo,
    play?.constraint1,
    play?.constraint2,
    play?.constraint3,
    play?.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
}

function _pbIdentityHasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function _pbIdentityCategory(play) {
  if (typeof categorizePlay !== "function") return {};
  try {
    return categorizePlay(play) || {};
  } catch (err) {
    console.warn("Identity categorize failed:", err);
    return {};
  }
}

function _pbIdentityPicture(play, text, pictureTargets) {
  const visionPicture = typeof getPlayPicture === "function" ? getPlayPicture(play) : null;
  if (visionPicture) return visionPicture;
  const match = pictureTargets.find((picture) => _pbIdentityHasAny(text, picture.keywords));
  return match?.id || "unclassified";
}

function _pbIdentityPlaySignals(play, pictureTargets) {
  const text = _pbIdentityText(play);
  const category = _pbIdentityCategory(play);
  const picture = _pbIdentityPicture(play, text, pictureTargets);
  const type = String(play?.type || "").toLowerCase();

  return {
    text,
    category,
    picture,
    wideZone:
      picture === "wideZone" ||
      _pbIdentityHasAny(text, ["wide zone", "widezone", "worm", "wolf", "split wz", "slice wz"]),
    qbRun:
      Boolean(category.isQBRun) ||
      _pbIdentityHasAny(text, [
        "qb run",
        "quarterback run",
        "keeper",
        "keep",
        "crab",
        "rebel",
        "cavs",
        "bash",
        "power read",
        "zone read",
      ]),
    conflictThrow:
      Boolean(category.isRPO) ||
      type.includes("rpo") ||
      _pbIdentityHasAny(text, [
        "rpo",
        "conflict",
        "golden state",
        "warriors",
        "irish",
        "lucky",
        "gang",
        "hulk",
        "batman",
        "packers",
        "green bay",
        "maverick",
        "laredo",
        "toledo",
      ]),
    movementPass:
      _pbIdentityHasAny(text, ["naked", "boot", "waggle", "sprint", "roll", "texas"]),
    screen:
      Boolean(category.isScreen) ||
      type.includes("screen") ||
      _pbIdentityHasAny(text, [
        "screen",
        "big mac",
        "whopper",
        "rodgers",
        "lamar",
        "michigan",
        "x middle",
        "xmiddle",
        "tunnel",
        "influence",
      ]),
  };
}

function _pbIdentityScorePicture(rows, total) {
  if (!total) return 0;
  let weightedScore = 0;
  let weightTotal = 0;
  rows.forEach((row) => {
    if (!row.target) return;
    const actual = row.count / total;
    const tolerance = Math.max(row.target, 0.12);
    const closeness = Math.max(0, 1 - Math.abs(actual - row.target) / tolerance);
    weightedScore += closeness * row.target;
    weightTotal += row.target;
  });
  return weightTotal ? Math.round((weightedScore / weightTotal) * 100) : 0;
}

function _pbIdentityScoreConstraints(total, taggedPlays, complementCount) {
  if (!total) return 0;
  const taggedShare = taggedPlays / total;
  const complementTarget = Math.max(5, Math.ceil(total / 6));
  const complementShare = Math.min(1, complementCount / complementTarget);
  return Math.round((taggedShare * 0.7 + complementShare * 0.3) * 100);
}

function _pbIdentityScoreSituation(source) {
  if (!source.length || typeof _pbSituationAnalyze !== "function") return 0;
  const situation = _pbSituationAnalyze(source);
  const values = ["down", "distance", "field", "tempo"].map((key) => (
    _pbSituationFillPct(situation, key)
  ));
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function _pbIdentityScoreInstall(source) {
  if (!source.length || typeof getPlayInstallRating !== "function") {
    return { score: null, rated: 0, fullyInstalled: 0 };
  }

  let totalScore = 0;
  let rated = 0;
  let fullyInstalled = 0;
  source.forEach((play) => {
    const rating = getPlayInstallRating(play);
    if (!rating || !rating.maxStars) return;
    rated += 1;
    totalScore += (rating.stars / rating.maxStars) * 100;
    if (rating.stars === rating.maxStars) fullyInstalled += 1;
  });

  return {
    score: rated ? Math.round(totalScore / rated) : null,
    rated,
    fullyInstalled,
  };
}

function _pbIdentityAnalyze(source) {
  const pictureTargets = _pbIdentityVisionTargets();
  const pictureRows = pictureTargets.map((picture) => ({
    id: picture.id,
    label: picture.label,
    target: picture.target,
    count: 0,
    examples: [],
  }));
  const pictureMap = new Map(pictureRows.map((row) => [row.id, row]));
  const stapleRows = PB_IDENTITY_STAPLES.map((staple) => ({
    ...staple,
    count: 0,
    examples: [],
  }));
  const stapleMap = new Map(stapleRows.map((row) => [row.id, row]));
  const complements = new Set();
  let taggedConstraints = 0;
  let unclassified = 0;

  source.forEach((play) => {
    const signals = _pbIdentityPlaySignals(play, pictureTargets);
    const pictureRow = pictureMap.get(signals.picture);
    const playLabel = _pbSituationClean(play?.play || play?.basePlay || play?.type || "Unnamed");

    if (pictureRow) {
      pictureRow.count += 1;
      if (pictureRow.examples.length < 3) pictureRow.examples.push(playLabel);
    } else {
      unclassified += 1;
    }

    const terms = typeof _pbConstraintTerms === "function" ? _pbConstraintTerms(play) : [];
    if (terms.length) taggedConstraints += 1;
    terms.forEach((term) => complements.add(term));

    stapleRows.forEach((staple) => {
      if (!signals[staple.id]) return;
      const row = stapleMap.get(staple.id);
      row.count += 1;
      if (row.examples.length < 3) row.examples.push(playLabel);
    });
  });

  const total = source.length;
  pictureRows.forEach((row) => {
    row.actual = total ? row.count / total : 0;
    row.delta = row.actual - row.target;
  });

  const pictureScore = _pbIdentityScorePicture(pictureRows, total);
  const stapleScore = stapleRows.length
    ? Math.round((stapleRows.filter((row) => row.count > 0).length / stapleRows.length) * 100)
    : 0;
  const constraintScore = _pbIdentityScoreConstraints(total, taggedConstraints, complements.size);
  const situationScore = _pbIdentityScoreSituation(source);
  const install = _pbIdentityScoreInstall(source);
  const scoreParts = [
    { score: pictureScore, weight: 30 },
    { score: stapleScore, weight: 25 },
    { score: constraintScore, weight: 20 },
    { score: situationScore, weight: 15 },
  ];
  if (install.score !== null) scoreParts.push({ score: install.score, weight: 10 });
  const weightTotal = scoreParts.reduce((sum, part) => sum + part.weight, 0);
  const overallScore = weightTotal
    ? Math.round(scoreParts.reduce((sum, part) => sum + part.score * part.weight, 0) / weightTotal)
    : 0;

  return {
    total,
    overallScore,
    pictureScore,
    stapleScore,
    constraintScore,
    situationScore,
    install,
    pictureRows,
    stapleRows,
    taggedConstraints,
    complementCount: complements.size,
    unclassified,
  };
}

function _pbIdentityScoreLabel(score) {
  if (score >= 85) return "Aligned";
  if (score >= 70) return "Workable";
  if (score >= 55) return "Needs Focus";
  return "Off Identity";
}

function _pbIdentitySignals(analysis) {
  const signals = [];
  if (!analysis.total) {
    return ["No plays in this scope. Clear filters or import plays to review identity alignment."];
  }

  const label = _pbIdentityScoreLabel(analysis.overallScore);
  signals.push(`Identity score is ${analysis.overallScore}/100 (${label}).`);

  const missingStaples = analysis.stapleRows.filter((row) => row.count === 0);
  if (missingStaples.length) {
    signals.push(`Missing identity staple${missingStaples.length === 1 ? "" : "s"}: ${missingStaples.map((row) => row.label).join(", ")}.`);
  }

  analysis.pictureRows
    .filter((row) => Math.abs(row.delta) >= 0.08)
    .slice(0, 2)
    .forEach((row) => {
      const actual = _pbBalancePct(row.count, analysis.total);
      const target = Math.round(row.target * 100);
      const direction = row.delta > 0 ? "above" : "below";
      signals.push(`${row.label} is ${actual}% of this scope, ${direction} the ${target}% target.`);
    });

  if (analysis.unclassified > 0) {
    signals.push(`${analysis.unclassified} play${analysis.unclassified === 1 ? "" : "s"} could not be matched to one of the four pictures.`);
  }

  if (_pbBalancePct(analysis.taggedConstraints, analysis.total) < 60) {
    signals.push("Constraint tags are light. Add Constraint 1/2/3 values so the identity has visible answers.");
  }

  if (analysis.situationScore < 70) {
    signals.push("Situation metadata is light. Preferred down, distance, field zone, and tempo improve the score.");
  }

  if (analysis.install.score !== null && analysis.install.score < 70) {
    signals.push("Installation readiness is pulling the identity score down.");
  }

  return signals.slice(0, 8);
}

function _pbIdentityRenderPictures(analysis) {
  if (!analysis.pictureRows.length) {
    return '<div class="pb-balance-empty">No picture data in this scope.</div>';
  }
  return analysis.pictureRows
    .map((row) => {
      const actual = _pbBalancePct(row.count, analysis.total);
      const target = Math.round(row.target * 100);
      const delta = Math.round(row.delta * 100);
      const deltaLabel = delta === 0 ? "On target" : `${delta > 0 ? "+" : ""}${delta} pts`;
      const examples = row.examples.length ? row.examples.map(escapeHtml).join(", ") : "No matched plays";
      return `
        <div class="pb-identity-picture-row">
          <div class="pb-balance-row-main">
            <strong>${escapeHtml(row.label)}</strong>
            <span>${row.count} play${row.count === 1 ? "" : "s"} • ${actual}% actual • ${target}% target</span>
          </div>
          <div class="pb-balance-meter" style="--bar-width:${actual}%"><i></i></div>
          <div class="pb-identity-picture-foot">
            <span class="${Math.abs(delta) >= 8 ? "is-alert" : ""}">${escapeHtml(deltaLabel)}</span>
            <span>${examples}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function _pbIdentityRenderStaples(analysis) {
  return analysis.stapleRows
    .map((row) => {
      const pct = _pbBalancePct(row.count, analysis.total);
      const examples = row.examples.length ? row.examples.map(escapeHtml).join(", ") : "No matching plays";
      return `
        <div class="pb-identity-staple-row${row.count ? "" : " is-missing"}">
          <div>
            <strong>${escapeHtml(row.label)}</strong>
            <span>${escapeHtml(row.description)}</span>
          </div>
          <div class="pb-identity-staple-meta">
            <b>${row.count}</b>
            <span>${pct}%</span>
          </div>
          <div class="pb-identity-examples">${examples}</div>
        </div>
      `;
    })
    .join("");
}

function openPlaybookIdentityAlignment() {
  if (!Array.isArray(plays) || plays.length === 0) {
    showToast("Import a playbook CSV first", { duration: 2500, type: "error" });
    return;
  }

  const scope = _pbBalanceScope();
  const analysis = _pbIdentityAnalyze(scope.plays);
  const signals = _pbIdentitySignals(analysis);
  const constraintPct = _pbBalancePct(analysis.taggedConstraints, analysis.total);
  const installLabel = analysis.install.score === null ? "N/A" : `${analysis.install.score}%`;

  document.getElementById("playbookIdentityOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay visible";
  overlay.id = "playbookIdentityOverlay";
  overlay.dataset.action = "closePlaybookIdentityAlignmentOverlay";
  overlay.innerHTML = `
    <div class="custom-modal pb-balance-modal pb-identity-modal" role="dialog" aria-modal="true" aria-labelledby="playbookIdentityTitle">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">🎯</span>
        <h3 class="custom-modal-title" id="playbookIdentityTitle">Identity Alignment</h3>
        <button class="modal-close" aria-label="Close" data-action="closePlaybookIdentityAlignment">×</button>
      </div>
      <div class="custom-modal-body pb-balance-body">
        <div class="pb-balance-summary">
          <div class="pb-balance-card pb-identity-score-card">
            <strong>${analysis.overallScore}/100</strong>
            <span>${escapeHtml(_pbIdentityScoreLabel(analysis.overallScore))}</span>
          </div>
          <div class="pb-balance-card">
            <strong>${escapeHtml(scope.label)}</strong>
            <span>${escapeHtml(scope.detail)}</span>
          </div>
          <div class="pb-balance-card">
            <strong>${analysis.pictureScore}%</strong>
            <span>Picture Match</span>
          </div>
          <div class="pb-balance-card">
            <strong>${analysis.stapleScore}%</strong>
            <span>Staples Present</span>
          </div>
          <div class="pb-balance-card">
            <strong>${constraintPct}%</strong>
            <span>Constraint Tagged</span>
          </div>
          <div class="pb-balance-card">
            <strong>${escapeHtml(installLabel)}</strong>
            <span>Install Ready</span>
          </div>
        </div>
        <div class="pb-balance-guidance">
          ${signals.map((signal) => `<div>${escapeHtml(signal)}</div>`).join("")}
        </div>
        <div class="pb-identity-layout">
          <section class="pb-balance-section pb-identity-section">
            <div class="pb-balance-section-head">
              <h4>Four-Picture Mix</h4>
              <span>Actual share vs identity target</span>
            </div>
            ${_pbIdentityRenderPictures(analysis)}
          </section>
          <section class="pb-balance-section pb-identity-section">
            <div class="pb-balance-section-head">
              <h4>Identity Staples</h4>
              <span>${analysis.stapleRows.filter((row) => row.count > 0).length} of ${analysis.stapleRows.length} present</span>
            </div>
            ${_pbIdentityRenderStaples(analysis)}
          </section>
          <section class="pb-balance-section pb-identity-section pb-identity-inputs">
            <div class="pb-balance-section-head">
              <h4>Alignment Inputs</h4>
              <span>What feeds the score</span>
            </div>
            <div class="pb-identity-input-grid">
              <div><strong>${analysis.complementCount}</strong><span>Distinct complements</span></div>
              <div><strong>${analysis.situationScore}%</strong><span>Situation metadata</span></div>
              <div><strong>${analysis.unclassified}</strong><span>Unclassified plays</span></div>
              <div><strong>${analysis.install.rated || 0}</strong><span>Install-rated plays</span></div>
            </div>
          </section>
        </div>
      </div>
      <div class="custom-modal-actions">
        ${scope.hasFilters ? '<button type="button" class="btn btn-sm" data-action="clearPlaybookIdentityFilters">Clear Playbook Filters</button>' : ""}
        <button type="button" class="btn btn-sm" data-action="closePlaybookIdentityAlignment">Done</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
}

function closePlaybookIdentityAlignment() {
  const overlay = document.getElementById("playbookIdentityOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 180);
}

function clearPlaybookIdentityFilters() {
  if (typeof clearFilters === "function") clearFilters();
  closePlaybookIdentityAlignment();
  requestAnimationFrame(() => openPlaybookIdentityAlignment());
}
