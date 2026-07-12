// playbook-analytics-render.js — Data Health report rendering
// Extracted from playbook-analytics.js

function _pbHealthPlayTitle(play) {
  const bits = [
    play?.type,
    play?.personnel ? `${play.personnel} pers` : "",
    play?.formation,
    play?.play,
  ].filter(Boolean);
  return bits.join(" • ") || "Unnamed play";
}

function _pbHealthPlayContext(play) {
  return [
    play?.basePlay ? `Base: ${play.basePlay}` : "",
    play?.preferredDown ? `D${play.preferredDown}` : "",
    play?.preferredDistance,
    play?.preferredFieldPosition,
    play?.oneWord ? `One word: ${play.oneWord}` : "",
  ]
    .filter(Boolean)
    .join(" • ");
}

function _pbHealthRenderGroup(group) {
  const names = group
    .slice(0, 4)
    .map(({ play, index }) => {
      const title = _pbHealthPlayTitle(play);
      const context = _pbHealthPlayContext(play);
      return `<li>
        <button type="button" class="pb-health-play-link" data-action="openPlaybookHealthEdit" data-arg="${index}">
          #${index + 1} ${escapeHtml(title)}
        </button>
        ${context ? `<span>${escapeHtml(context)}</span>` : ""}
      </li>`;
    })
    .join("");
  const remaining = group.length > 4
    ? `<li class="pb-health-more">+${group.length - 4} more matching rows</li>`
    : "";
  return `<div class="pb-health-group">
    <div class="pb-health-group-head">
      <strong>${group.length} related rows</strong>
      <button type="button" class="btn btn-xs" data-action="openPlaybookHealthEdit" data-arg="${group[0].index}">Edit first</button>
    </div>
    <ul>${names}${remaining}</ul>
  </div>`;
}

function _pbHealthRenderGroups(groups, emptyText) {
  if (!groups.length) {
    return `<div class="pb-health-empty">${escapeHtml(emptyText)}</div>`;
  }
  return groups.slice(0, 8).map(_pbHealthRenderGroup).join("") +
    (groups.length > 8
      ? `<div class="pb-health-more">Showing 8 of ${groups.length} groups.</div>`
      : "");
}

function _pbHealthRenderMissing(analysis) {
  const fieldHtml = analysis.missingByField
    .filter((field) => field.count > 0)
    .map(
      (field) => `<button type="button" class="pb-health-field-chip" data-action="openPlaybookSanitizeField" data-arg="${escapeHtml(field.key)}">
        <strong>${field.count}</strong>
        <span>${escapeHtml(field.label)}</span>
      </button>`,
    )
    .join("");
  const rowsHtml = analysis.missingRows
    .slice(0, 8)
    .map(({ play, index, fields }) => {
      const missing = fields.map((field) => field.label).join(", ");
      return `<div class="pb-health-missing-row">
        <div>
          <button type="button" class="pb-health-play-link" data-action="openPlaybookHealthEdit" data-arg="${index}">
            #${index + 1} ${escapeHtml(_pbHealthPlayTitle(play))}
          </button>
          <span>${escapeHtml(missing)}</span>
        </div>
        <button type="button" class="btn btn-xs" data-action="openPlaybookHealthEdit" data-arg="${index}">Edit</button>
      </div>`;
    })
    .join("");

  if (!analysis.missingRows.length) {
    return `<div class="pb-health-empty">No critical fields are missing.</div>`;
  }

  return `
    <div class="pb-health-field-grid">${fieldHtml}</div>
    <div class="pb-health-missing-list">
      ${rowsHtml}
      ${analysis.missingRows.length > 8
      ? `<div class="pb-health-more">Showing 8 of ${analysis.missingRows.length} plays with missing critical fields.</div>`
      : ""}
    </div>`;
}

function _pbHealthRenderVocabSamples(items) {
  const seen = new Set();
  const rows = items
    .filter((item) => {
      const id = `${item.index}:${item.key}:${item.value}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, 4)
    .map((item) => {
      const context = _pbHealthPlayContext(item.play);
      const fieldLabel = _pbHealthFieldLabel(item.key);
      return `<li>
        <button type="button" class="pb-health-play-link" data-action="openPlaybookHealthEdit" data-arg="${item.index}">
          #${item.index + 1} ${escapeHtml(_pbHealthPlayTitle(item.play))}
        </button>
        <span>${escapeHtml(fieldLabel)}: ${escapeHtml(item.value)}${context ? ` • ${escapeHtml(context)}` : ""}</span>
      </li>`;
    })
    .join("");
  return rows ? `<ul>${rows}</ul>` : "";
}

function _pbHealthCleanupArg(fieldKey, values) {
  const payload = {
    fieldKey,
    values: (values || []).map((value) => String(value || "").trim()).filter(Boolean),
  };
  return escapeAttrIfAvailable(encodeURIComponent(JSON.stringify(payload)));
}

function _pbHealthRenderCleanupButtons(issue, values) {
  const fieldKeys = (issue.field.keys || [issue.field.sanitizeKey || issue.field.key])
    .filter(Boolean)
    .filter((key, idx, arr) => arr.indexOf(key) === idx);
  const issueValues = issue.variants || issue.values || [];
  const keysWithItems = fieldKeys.filter((key) =>
    issueValues.some((value) => (value.items || []).some((item) => item.key === key)),
  );
  return (keysWithItems.length ? keysWithItems : [issue.field.sanitizeKey || fieldKeys[0]])
    .map((key) => {
      const label = issue.field.keys && issue.field.keys.length > 1
        ? `Cleanup ${_pbHealthFieldLabel(key)}`
        : "Cleanup";
      return `<button type="button" class="btn btn-xs"
        data-action="openPlaybookSanitizeIssue"
        data-arg="${_pbHealthCleanupArg(key, values)}">${escapeHtml(label)}</button>`;
    })
    .join("");
}

function _pbHealthRenderCasingIssue(issue) {
  const values = issue.variants.map((variant) => variant.value);
  const valueHtml = issue.variants
    .map(
      (variant) => `<span class="pb-health-vocab-chip">
        <span class="pb-health-vocab-label">${escapeHtml(variant.value)}</span>
        <em>${variant.count}</em>
      </span>`,
    )
    .join("");
  const samples = issue.variants.flatMap((variant) => variant.items.slice(0, 2));
  return `<div class="pb-health-vocab-card">
    <div class="pb-health-vocab-head">
      <div>
        <strong>Casing / spacing</strong>
        <span>${escapeHtml(issue.field.label)} has ${issue.variants.length} variants</span>
      </div>
      ${_pbHealthRenderCleanupButtons(issue, values)}
    </div>
    <div class="pb-health-vocab-values">${valueHtml}</div>
    ${_pbHealthRenderVocabSamples(samples)}
  </div>`;
}

function _pbHealthRenderSpellingIssue(issue) {
  const values = issue.values.map((value) => value.value);
  const valueHtml = issue.values
    .map(
      (value) => `<span class="pb-health-vocab-chip">
        <span class="pb-health-vocab-label">${escapeHtml(value.value)}</span>
        <em>${value.count}</em>
      </span>`,
    )
    .join('<span class="pb-health-vocab-vs">vs</span>');
  const samples = issue.values.flatMap((value) => value.items.slice(0, 2));
  return `<div class="pb-health-vocab-card">
    <div class="pb-health-vocab-head">
      <div>
        <strong>Possible spelling mismatch</strong>
        <span>${escapeHtml(issue.field.label)} values are ${issue.distance} edit${issue.distance === 1 ? "" : "s"} apart</span>
      </div>
      ${_pbHealthRenderCleanupButtons(issue, values)}
    </div>
    <div class="pb-health-vocab-values">${valueHtml}</div>
    ${_pbHealthRenderVocabSamples(samples)}
  </div>`;
}

function _pbHealthRenderVocabulary(analysis) {
  if (!analysis.vocabularyIssues) {
    return `<div class="pb-health-empty">No casing or spelling consistency issues found.</div>`;
  }
  const cards = [
    ...analysis.casingGroups.map(_pbHealthRenderCasingIssue),
    ...analysis.spellingGroups.map(_pbHealthRenderSpellingIssue),
  ];
  return `<div class="pb-health-vocab-grid">${cards.join("")}</div>`;
}

function _pbHealthRenderCategorySamples(items) {
  const rows = items
    .slice(0, 4)
    .map(({ play, index }) => {
      const context = _pbHealthPlayContext(play);
      return `<li>
        <button type="button" class="pb-health-play-link" data-action="openPlaybookHealthEdit" data-arg="${index}">
          #${index + 1} ${escapeHtml(_pbHealthPlayTitle(play))}
        </button>
        ${context ? `<span>${escapeHtml(context)}</span>` : ""}
      </li>`;
    })
    .join("");
  const more = items.length > 4
    ? `<li class="pb-health-more">+${items.length - 4} more matching plays</li>`
    : "";
  return rows ? `<ul>${rows}${more}</ul>` : "";
}

function _pbHealthRenderCategoryCard(item, status) {
  const isOverloaded = status === "overloaded";
  const title = isOverloaded ? "Over target" : "Unused auto category";
  const detail = isOverloaded
    ? `${item.count} matched plays / target ${item.limit}`
    : "No imported plays currently route here";
  const actionText = isOverloaded ? "Review Field" : "Fill Field";
  return `<div class="pb-health-category-card ${isOverloaded ? "is-overloaded" : "is-unused"}">
    <div class="pb-health-category-head">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(item.page)} • ${escapeHtml(item.name)}</span>
      </div>
      <button type="button" class="btn btn-xs" data-action="openPlaybookSanitizeField" data-arg="${escapeHtml(item.cleanupKey)}">${escapeHtml(actionText)}</button>
    </div>
    <div class="pb-health-category-meter">
      <strong>${item.count}</strong>
      <span>${escapeHtml(detail)}</span>
    </div>
    ${isOverloaded ? _pbHealthRenderCategorySamples(item.items) : ""}
  </div>`;
}

function _pbHealthRenderUnmatchedCategories(analysis) {
  const rows = analysis.categoryAnalysis.unmatchedRows
    .slice(0, 6)
    .map(({ play, index }) => {
      const context = _pbHealthPlayContext(play);
      return `<div class="pb-health-category-row">
        <div>
          <button type="button" class="pb-health-play-link" data-action="openPlaybookHealthEdit" data-arg="${index}">
            #${index + 1} ${escapeHtml(_pbHealthPlayTitle(play))}
          </button>
          <span>${context ? escapeHtml(context) : "Missing preferred fields or play type routing"}</span>
        </div>
        <button type="button" class="btn btn-xs" data-action="openPlaybookHealthEdit" data-arg="${index}">Edit</button>
      </div>`;
    })
    .join("");
  const more = analysis.categoryAnalysis.unmatchedRows.length > 6
    ? `<div class="pb-health-more">Showing 6 of ${analysis.categoryAnalysis.unmatchedRows.length} unrouted plays.</div>`
    : "";
  if (!rows) return "";
  return `<div class="pb-health-category-card is-unmatched">
    <div class="pb-health-category-head">
      <div>
        <strong>Unrouted plays</strong>
        <span>These plays do not currently land in any auto call sheet category</span>
      </div>
      <button type="button" class="btn btn-xs" data-action="openPlaybookSanitizeField" data-arg="preferredDown">Cleanup</button>
    </div>
    <div class="pb-health-category-list">${rows}${more}</div>
  </div>`;
}

function _pbHealthRenderCategories(analysis) {
  const categoryAnalysis = analysis.categoryAnalysis;
  if (!categoryAnalysis.available) {
    return `<div class="pb-health-empty">Call sheet categories are not ready yet.</div>`;
  }
  if (!categoryAnalysis.issueCount) {
    return `<div class="pb-health-empty">No unused, overloaded, or unrouted category issues found.</div>`;
  }
  const cards = [
    ...categoryAnalysis.overloaded.slice(0, 8).map((item) =>
      _pbHealthRenderCategoryCard(item, "overloaded"),
    ),
    ...categoryAnalysis.unused.slice(0, 8).map((item) =>
      _pbHealthRenderCategoryCard(item, "unused"),
    ),
    _pbHealthRenderUnmatchedCategories(analysis),
  ].filter(Boolean);
  const moreUnused = categoryAnalysis.unused.length > 8
    ? `<div class="pb-health-more">Showing 8 of ${categoryAnalysis.unused.length} unused auto categories.</div>`
    : "";
  const moreOverloaded = categoryAnalysis.overloaded.length > 8
    ? `<div class="pb-health-more">Showing 8 of ${categoryAnalysis.overloaded.length} overloaded categories.</div>`
    : "";
  return `<div class="pb-health-category-grid">${cards.join("")}${moreOverloaded}${moreUnused}</div>`;
}

function _pbHealthRenderCsvAction(rec) {
  if (rec.actionType === "download") {
    return `<button type="button" class="btn btn-xs" data-action="downloadCSVTemplate" data-arg="${escapeHtml(rec.actionKey)}">${escapeHtml(rec.actionLabel)}</button>`;
  }
  if (rec.actionType === "edit") {
    return `<button type="button" class="btn btn-xs" data-action="openPlaybookHealthEdit" data-arg="${escapeHtml(rec.actionKey)}">${escapeHtml(rec.actionLabel)}</button>`;
  }
  return `<button type="button" class="btn btn-xs" data-action="openPlaybookSanitizeField" data-arg="${escapeHtml(rec.actionKey)}">${escapeHtml(rec.actionLabel)}</button>`;
}

function _pbHealthRenderCsvFields(rec, analysis) {
  if (rec.invalidValues?.length) {
    return `<div class="pb-health-csv-values">
      ${rec.invalidValues
        .map(
          (item) => `<span class="pb-health-csv-chip">
            <span class="pb-health-vocab-label">${escapeHtml(item.value)}</span>
            <em>${item.count}</em>
          </span>`,
        )
        .join("")}
    </div>`;
  }
  if (!rec.fields?.length) return "";
  return `<div class="pb-health-csv-values">
    ${rec.fields
      .slice(0, 6)
      .map((key) => {
        const stat = analysis.csvAnalysis.stats[key];
        const label = stat?.label || _pbHealthFieldLabel(key);
        const filled = stat ? `${stat.filled}/${stat.total}` : "";
        return `<span class="pb-health-csv-chip">
          <span class="pb-health-vocab-label">${escapeHtml(label)}</span>
          ${filled ? `<em>${escapeHtml(filled)}</em>` : ""}
        </span>`;
      })
      .join("")}
  </div>`;
}

function _pbHealthRenderCsvRecommendation(rec, analysis) {
  const samples = rec.samples?.length
    ? `<div class="pb-health-csv-samples">${_pbHealthRenderCategorySamples(rec.samples)}</div>`
    : "";
  const priorityClass = rec.priority.toLowerCase();
  return `<div class="pb-health-csv-card is-${escapeHtml(priorityClass)}">
    <div class="pb-health-csv-head">
      <div>
        <strong>${escapeHtml(rec.title)}</strong>
        <span>${escapeHtml(rec.detail)}</span>
      </div>
      <div class="pb-health-csv-actions">
        <span class="pb-health-csv-priority">${escapeHtml(rec.priority)}</span>
        ${_pbHealthRenderCsvAction(rec)}
      </div>
    </div>
    ${_pbHealthRenderCsvFields(rec, analysis)}
    ${samples}
  </div>`;
}

function _pbHealthRenderCsvRecommendations(analysis) {
  if (!analysis.csvAnalysis.recommendations.length) {
    return `<div class="pb-health-empty">No CSV source cleanup recommendations found.</div>`;
  }
  return `<div class="pb-health-csv-grid">
    ${analysis.csvAnalysis.recommendations
      .slice(0, 10)
      .map((rec) => _pbHealthRenderCsvRecommendation(rec, analysis))
      .join("")}
    ${analysis.csvAnalysis.recommendations.length > 10
      ? `<div class="pb-health-more">Showing 10 of ${analysis.csvAnalysis.recommendations.length} CSV recommendations.</div>`
      : ""}
  </div>`;
}

function renderPlaybookDataHealth() {
  const overlay = document.getElementById("playbookDataHealthOverlay");
  if (!overlay) return;
  const body = overlay.querySelector("#playbookDataHealthBody");
  if (!body) return;
  const analysis = _pbHealthAnalyze();
  const total = analysis.entries.length;
  const issueCount =
    analysis.exactGroups.length +
    analysis.nearGroups.length +
    analysis.missingRows.length +
    analysis.vocabularyIssues +
    analysis.categoryAnalysis.issueCount +
    analysis.csvAnalysis.issueCount;
  const scoreClass =
    analysis.score >= 90 ? "is-good" : analysis.score >= 70 ? "is-warn" : "is-poor";

  body.innerHTML = `
    <div class="pb-health-summary">
      <div class="pb-health-score ${scoreClass}">
        <strong>${analysis.score}</strong>
        <span>Health Score</span>
      </div>
      <div class="pb-health-card">
        <strong>${total}</strong>
        <span>Total plays</span>
      </div>
      <div class="pb-health-card">
        <strong>${analysis.exactGroups.length}</strong>
        <span>Exact duplicate groups</span>
      </div>
      <div class="pb-health-card">
        <strong>${analysis.nearGroups.length}</strong>
        <span>Near-duplicate groups</span>
      </div>
      <div class="pb-health-card">
        <strong>${analysis.missingRows.length}</strong>
        <span>Plays missing critical fields</span>
      </div>
      <div class="pb-health-card">
        <strong>${analysis.vocabularyIssues}</strong>
        <span>Vocabulary consistency issues</span>
      </div>
      <div class="pb-health-card">
        <strong>${analysis.categoryAnalysis.issueCount}</strong>
        <span>Category coverage issues</span>
      </div>
      <div class="pb-health-card">
        <strong>${analysis.csvAnalysis.issueCount}</strong>
        <span>CSV cleanup recommendations</span>
      </div>
    </div>
    <div class="pb-health-guidance">
      ${issueCount === 0
      ? "No major playbook data issues found in this pass."
      : "Review the groups below before building scripts, wristbands, call sheets, and game plans."}
    </div>
    <section class="pb-health-section">
      <div class="pb-health-section-head">
        <h4>Exact Duplicates</h4>
        <span>${analysis.exactDuplicateItems} rows</span>
      </div>
      ${_pbHealthRenderGroups(analysis.exactGroups, "No exact duplicate play identities found.")}
    </section>
    <section class="pb-health-section">
      <div class="pb-health-section-head">
        <h4>Near Duplicates</h4>
        <span>${analysis.nearDuplicateItems} rows</span>
      </div>
      ${_pbHealthRenderGroups(analysis.nearGroups, "No near-duplicate formation/play combinations found.")}
    </section>
    <section class="pb-health-section">
      <div class="pb-health-section-head">
        <h4>Missing Critical Fields</h4>
        <span>${analysis.missingRows.length} plays</span>
      </div>
      ${_pbHealthRenderMissing(analysis)}
    </section>
    <section class="pb-health-section">
      <div class="pb-health-section-head">
        <h4>Vocabulary Consistency</h4>
        <span>${analysis.vocabularyIssues} issues</span>
      </div>
      ${_pbHealthRenderVocabulary(analysis)}
    </section>
    <section class="pb-health-section">
      <div class="pb-health-section-head">
        <h4>Category Coverage</h4>
        <span>${analysis.categoryAnalysis.unused.length} unused • ${analysis.categoryAnalysis.overloaded.length} overloaded • ${analysis.categoryAnalysis.unmatchedRows.length} unrouted</span>
      </div>
      ${_pbHealthRenderCategories(analysis)}
    </section>
    <section class="pb-health-section">
      <div class="pb-health-section-head">
        <h4>CSV Import Cleanup</h4>
        <span>${analysis.csvAnalysis.issueCount} source fixes</span>
      </div>
      ${_pbHealthRenderCsvRecommendations(analysis)}
    </section>`;
}

function openPlaybookDataHealth() {
  if (!Array.isArray(plays) || plays.length === 0) {
    showToast("Import a playbook CSV first", { duration: 2500, type: "error" });
    return;
  }
  document.getElementById("playbookDataHealthOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay visible";
  overlay.id = "playbookDataHealthOverlay";
  overlay.dataset.action = "closePlaybookDataHealthOverlay";
  overlay.innerHTML = `
    <div class="custom-modal pb-health-modal" role="dialog" aria-modal="true" aria-labelledby="playbookDataHealthTitle">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">🩺</span>
        <h3 class="custom-modal-title" id="playbookDataHealthTitle">Playbook Data Health</h3>
        <button class="modal-close" aria-label="Close" data-action="closePlaybookDataHealth">×</button>
      </div>
      <div class="custom-modal-body pb-health-body" id="playbookDataHealthBody"></div>
      <div class="custom-modal-actions">
        <button type="button" class="btn btn-sm" data-action="openPlaybookHealthCleanup">Open Cleanup Data</button>
        <button type="button" class="btn btn-sm" data-action="closePlaybookDataHealth">Done</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof trapFocus === "function") trapFocus(overlay);
  renderPlaybookDataHealth();
}

function closePlaybookDataHealth() {
  const overlay = document.getElementById("playbookDataHealthOverlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 180);
}

function openPlaybookHealthEdit(masterIdx) {
  masterIdx = parseInt(masterIdx, 10);
  if (!Array.isArray(plays) || !plays[masterIdx]) return;
  closePlaybookDataHealth();
  if (typeof showTab === "function") showTab("playbook");

  const play = plays[masterIdx];
  let filteredIdx = Array.isArray(filteredPlays) ? filteredPlays.indexOf(play) : -1;
  if (filteredIdx < 0) {
    filteredPlays = [...plays];
    filteredIdx = masterIdx;
    if (typeof PLAYS_PER_PAGE !== "undefined") {
      currentPage = Math.floor(masterIdx / PLAYS_PER_PAGE);
    }
    if (typeof requestRenderPlaybook === "function") requestRenderPlaybook();
  }

  requestAnimationFrame(() => {
    if (typeof openPlayEditor === "function") openPlayEditor(filteredIdx);
  });
}

function openPlaybookSanitizeField(fieldKey) {
  if (!_sanitizeFieldDef(fieldKey)) return;
  closePlaybookDataHealth();
  _sanitizeFieldKey = fieldKey;
  openPlaybookSanitize();
}

function openPlaybookSanitizeIssue(encodedPayload) {
  let payload = null;
  try {
    payload = JSON.parse(decodeURIComponent(String(encodedPayload || "")));
  } catch (_err) {
    payload = null;
  }
  const fieldKey = payload?.fieldKey;
  const values = Array.isArray(payload?.values) ? payload.values : [];
  if (!_sanitizeFieldDef(fieldKey) || !values.length) return;
  closePlaybookDataHealth();
  if (typeof openPlaybookSanitizeFocused === "function") {
    openPlaybookSanitizeFocused(fieldKey, values);
  } else {
    _sanitizeFieldKey = fieldKey;
    openPlaybookSanitize();
  }
}

function openPlaybookHealthCleanup() {
  closePlaybookDataHealth();
  openPlaybookSanitize();
}
