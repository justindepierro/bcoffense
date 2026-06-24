/* =========================================================================
   Playbook Data Health Center
   Review-only checks for duplicate calls and missing critical play fields.
   ========================================================================= */

const PLAYBOOK_HEALTH_CRITICAL_FIELDS = [
  { key: "type", label: "Play Type" },
  { key: "personnel", label: "Personnel" },
  { key: "formation", label: "Formation" },
  { key: "play", label: "Play Name" },
  { key: "basePlay", label: "Base Play" },
  { key: "preferredDown", label: "Preferred Down" },
  { key: "preferredDistance", label: "Preferred Distance" },
  { key: "preferredFieldPosition", label: "Field Position" },
];

const PLAYBOOK_HEALTH_VOCAB_FIELDS = [
  { key: "formation", label: "Formation", keys: ["formation"] },
  { key: "personnel", label: "Personnel", keys: ["personnel"], spelling: "textOnly" },
  { key: "basePlay", label: "Base Play", keys: ["basePlay"] },
  {
    key: "formationTags",
    label: "Formation Tags",
    keys: ["formTag1", "formTag2"],
    sanitizeKey: "formTag1",
  },
  {
    key: "playTags",
    label: "Play Tags",
    keys: ["playTag1", "playTag2"],
    sanitizeKey: "playTag1",
  },
];

const PLAYBOOK_HEALTH_CATEGORY_DEFAULT_MAX = 10;

const PLAYBOOK_HEALTH_CSV_GROUPS = [
  {
    key: "identity",
    title: "Required identity columns",
    priority: "High",
    fields: ["type", "personnel", "formation", "play"],
    actionKey: "formation",
    threshold: 1,
  },
  {
    key: "routing",
    title: "Call sheet routing columns",
    priority: "High",
    fields: [
      "preferredDown",
      "preferredDistance",
      "preferredFieldPosition",
      "preferredSituation",
      "preferredHash",
    ],
    actionKey: "preferredDown",
    threshold: 0.7,
  },
  {
    key: "concepts",
    title: "Concept and tag columns",
    priority: "Medium",
    fields: ["basePlay", "formTag1", "formTag2", "playTag1", "playTag2"],
    actionKey: "basePlay",
    threshold: 0.45,
  },
  {
    key: "practiceLooks",
    title: "Practice look columns",
    priority: "Low",
    fields: [
      "practiceFront",
      "practiceDefense",
      "practiceCoverage",
      "practiceBlitz",
      "practiceStunt",
    ],
    actionKey: "practiceFront",
    threshold: 0.3,
  },
];

const PLAYBOOK_HEALTH_CSV_VALUE_RULES = [
  {
    key: "preferredDown",
    label: "PreferredDown",
    allowed: ["1", "2", "3", "4"],
    expected: "1, 2, 3, or 4",
  },
  {
    key: "preferredDistance",
    label: "PreferredDistance",
    allowed: ["short", "medium", "long"],
    expected: "Short, Medium, or Long",
  },
  {
    key: "preferredHash",
    label: "PreferredHash",
    allowed: ["left", "middle", "right", "any", "l", "m", "r"],
    expected: "Left, Middle, Right, Any, L, M, or R",
  },
  {
    key: "preferredFieldPosition",
    label: "PreferredFieldPosition",
    allowed: [
      "green",
      "fringe",
      "lo-rz",
      "low red zone",
      "low rz",
      "hi-rz",
      "high red zone",
      "high rz",
      "red zone",
      "goal line",
      "goalline",
      "backed up",
      "backedup",
      "own territory",
      "saigon",
    ],
    expected: "Green, Lo-RZ, Hi-RZ, Goal Line, Backed Up, or Saigon",
  },
  {
    key: "preferredSituation",
    label: "PreferredSituation",
    allowed: ["short yardage", "2 minute", "4 minute", "opener", "openers"],
    expected: "Short Yardage, 2 Minute, 4 Minute, or Openers",
  },
];

function _pbHealthNorm(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function _pbHealthExactKey(play) {
  const hasIdentity = ["formation", "play", "personnel", "type"].some(
    (key) => _pbHealthNorm(play?.[key]),
  );
  if (!hasIdentity) return "";
  if (typeof getPlayIdentityKey === "function") {
    return getPlayIdentityKey(play, "tag", { normalizeCase: true });
  }
  return ["formation", "play", "personnel", "type"]
    .map((key) => _pbHealthNorm(play?.[key]))
    .join("|");
}

function _pbHealthNearKey(play) {
  const formation = _pbHealthNorm(play?.formation);
  const playName = _pbHealthNorm(play?.play);
  if (!formation || !playName) return "";
  return `${formation}|${playName}`;
}

function _pbHealthGroupBy(entries, keyFn) {
  const map = new Map();
  entries.forEach((entry) => {
    const key = keyFn(entry.play);
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(entry);
  });
  return Array.from(map.values()).filter((group) => group.length > 1);
}

function _pbHealthDisplayValue(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function _pbHealthFieldLabel(key) {
  const def = SANITIZE_FIELDS.find((field) => field.key === key);
  return def?.label || key;
}

function _pbHealthVocabEntries(entries, field) {
  const values = [];
  entries.forEach(({ play, index }) => {
    field.keys.forEach((key) => {
      const value = _pbHealthDisplayValue(play?.[key]);
      const norm = _pbHealthNorm(value);
      if (!norm) return;
      values.push({ field, key, value, norm, play, index });
    });
  });
  return values;
}

function _pbHealthDetectCasing(entries) {
  const issues = [];
  PLAYBOOK_HEALTH_VOCAB_FIELDS.forEach((field) => {
    const byNorm = new Map();
    _pbHealthVocabEntries(entries, field).forEach((entry) => {
      if (!byNorm.has(entry.norm)) byNorm.set(entry.norm, []);
      byNorm.get(entry.norm).push(entry);
    });
    byNorm.forEach((items, norm) => {
      const byValue = new Map();
      items.forEach((item) => {
        if (!byValue.has(item.value)) byValue.set(item.value, []);
        byValue.get(item.value).push(item);
      });
      if (byValue.size < 2) return;
      const variants = Array.from(byValue.entries())
        .map(([value, variantItems]) => ({
          value,
          count: variantItems.length,
          items: variantItems,
        }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      issues.push({
        type: "casing",
        field,
        norm,
        count: items.length,
        variants,
      });
    });
  });
  return issues
    .sort((a, b) => b.variants.length - a.variants.length || b.count - a.count)
    .slice(0, 24);
}

function _pbHealthSpellThreshold(value) {
  const len = String(value || "").length;
  if (len <= 4) return 1;
  if (len <= 7) return 2;
  return 3;
}

function _pbHealthUniqueVocabulary(entries, field) {
  const byNorm = new Map();
  _pbHealthVocabEntries(entries, field).forEach((entry) => {
    if (!byNorm.has(entry.norm)) {
      byNorm.set(entry.norm, {
        norm: entry.norm,
        value: entry.value,
        count: 0,
        items: [],
      });
    }
    const bucket = byNorm.get(entry.norm);
    bucket.count += 1;
    bucket.items.push(entry);
    if (entry.value.length < bucket.value.length) bucket.value = entry.value;
  });
  return Array.from(byNorm.values())
    .filter((item) => item.norm.length >= 4)
    .sort((a, b) => a.norm.localeCompare(b.norm));
}

function _pbHealthDetectSpelling(entries) {
  const issues = [];
  PLAYBOOK_HEALTH_VOCAB_FIELDS.forEach((field) => {
    if (field.spelling === false) return;
    const values = _pbHealthUniqueVocabulary(entries, field).filter(
      (item) => field.spelling !== "textOnly" || !/\d/.test(item.norm),
    );
    const byFirst = new Map();
    values.forEach((item) => {
      const first = item.norm.charAt(0);
      if (!byFirst.has(first)) byFirst.set(first, []);
      byFirst.get(first).push(item);
    });

    const fieldIssues = [];
    byFirst.forEach((bucket) => {
      for (let i = 0; i < bucket.length; i += 1) {
        for (let j = i + 1; j < bucket.length; j += 1) {
          const a = bucket[i];
          const b = bucket[j];
          const threshold = Math.min(
            _pbHealthSpellThreshold(a.norm),
            _pbHealthSpellThreshold(b.norm),
          );
          if (Math.abs(a.norm.length - b.norm.length) > threshold) continue;
          if (a.norm.startsWith(b.norm) || b.norm.startsWith(a.norm)) continue;
          const distance = _sanitizeLevenshtein(a.norm, b.norm, threshold);
          if (distance <= 0 || distance > threshold) continue;
          fieldIssues.push({
            type: "spelling",
            field,
            distance,
            count: a.count + b.count,
            values: [a, b],
          });
          if (fieldIssues.length >= 80) break;
        }
        if (fieldIssues.length >= 80) break;
      }
    });

    fieldIssues.sort(
      (a, b) =>
        a.distance - b.distance ||
        b.count - a.count ||
        a.values[0].norm.localeCompare(b.values[0].norm),
    );
    issues.push(...fieldIssues.slice(0, 8));
  });
  return issues.slice(0, 24);
}

function _pbHealthCategoryName(cat) {
  if (!cat) return "";
  if (typeof getCategoryDisplayName === "function") return getCategoryDisplayName(cat);
  return cat.name || cat.id || "";
}

function _pbHealthCategoryPage(cat) {
  if (typeof CALLSHEET_FRONT !== "undefined" && CALLSHEET_FRONT.some((item) => item.id === cat.id)) {
    return "Front";
  }
  if (typeof CALLSHEET_BACK !== "undefined" && CALLSHEET_BACK.some((item) => item.id === cat.id)) {
    return "Back";
  }
  return "Call Sheet";
}

function _pbHealthCategoryIsAuto(cat) {
  if (!cat || cat.custom) return false;
  if (cat.playerSpecific) return true;
  return !cat.manual && Boolean(
    cat.playType ||
    cat.down ||
    cat.distance ||
    cat.position ||
    cat.situation,
  );
}

function _pbHealthCategoryCleanupKey(cat) {
  if (cat?.playerSpecific) return "keyPlayerName1";
  if (cat?.playType) return "type";
  if (cat?.position) return "preferredFieldPosition";
  if (cat?.situation) return "preferredSituation";
  if (cat?.distance) return "preferredDistance";
  if (cat?.down) return "preferredDown";
  return "preferredDown";
}

function _pbHealthCategoryLimit(cat) {
  const savedTarget =
    typeof csTargets !== "undefined" && csTargets && csTargets[cat.id] !== undefined
      ? Number(csTargets[cat.id])
      : 0;
  if (Number.isFinite(savedTarget) && savedTarget > 0) return Math.floor(savedTarget);
  const visionMax =
    typeof VISION_2026 !== "undefined" &&
      VISION_2026?.bucketTargets &&
      Number.isFinite(Number(VISION_2026.bucketTargets.targetMax))
      ? Number(VISION_2026.bucketTargets.targetMax)
      : PLAYBOOK_HEALTH_CATEGORY_DEFAULT_MAX;
  return Math.max(1, Math.floor(visionMax));
}

function _pbHealthCategoryPlayKey(play, index) {
  if (typeof csPlayKey === "function") {
    try {
      const key = csPlayKey(play);
      if (key) return key;
    } catch (_err) {
      // Fall through to the local identity key.
    }
  }
  return _pbHealthExactKey(play) || `row-${index}`;
}

function _pbHealthAnalyzeCategories(entries) {
  const categories =
    typeof CALLSHEET_CATEGORIES !== "undefined" && Array.isArray(CALLSHEET_CATEGORIES)
      ? CALLSHEET_CATEGORIES.filter(_pbHealthCategoryIsAuto)
      : [];
  if (!categories.length) {
    return {
      available: false,
      categories: [],
      coverage: [],
      unused: [],
      overloaded: [],
      unmatchedRows: [],
      issueCount: 0,
      totalPlaced: 0,
    };
  }

  const categoryIds = new Set(categories.map((cat) => cat.id));
  const byCategory = new Map(categories.map((cat) => [cat.id, new Map()]));
  const playerTargets =
    typeof buildPlayerCategoryAutoFillTargets === "function"
      ? buildPlayerCategoryAutoFillTargets(entries, { getPlay: (entry) => entry.play })
      : [];
  const unmatchedRows = [];

  entries.forEach((entry, index) => {
    const targets = new Set();
    if (typeof findMatchingCategories === "function") {
      try {
        findMatchingCategories(entry.play).forEach((id) => targets.add(id));
      } catch (_err) {
        // Ignore a single bad row so the rest of the health report can render.
      }
    }
    (playerTargets[index] || new Set()).forEach((id) => targets.add(id));

    const autoTargets = Array.from(targets).filter((id) => categoryIds.has(id));
    if (!autoTargets.length) {
      unmatchedRows.push(entry);
      return;
    }
    autoTargets.forEach((id) => {
      const bucket = byCategory.get(id);
      if (!bucket) return;
      const key = _pbHealthCategoryPlayKey(entry.play, entry.index);
      if (!bucket.has(key)) bucket.set(key, entry);
    });
  });

  const coverage = categories
    .map((cat) => {
      const items = Array.from((byCategory.get(cat.id) || new Map()).values());
      const limit = _pbHealthCategoryLimit(cat);
      return {
        cat,
        id: cat.id,
        name: _pbHealthCategoryName(cat),
        page: _pbHealthCategoryPage(cat),
        cleanupKey: _pbHealthCategoryCleanupKey(cat),
        items,
        count: items.length,
        limit,
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const unused = coverage
    .filter((item) => item.count === 0 && !item.cat.playerSpecific)
    .sort((a, b) => a.page.localeCompare(b.page) || a.name.localeCompare(b.name));
  const overloaded = coverage
    .filter((item) => item.count > item.limit)
    .sort((a, b) => (b.count - b.limit) - (a.count - a.limit) || b.count - a.count);
  const totalPlaced = coverage.reduce((sum, item) => sum + item.count, 0);

  return {
    available: true,
    categories,
    coverage,
    unused,
    overloaded,
    unmatchedRows,
    issueCount: unused.length + overloaded.length + unmatchedRows.length,
    totalPlaced,
  };
}

function _pbHealthCsvSplitValues(value) {
  if (typeof splitPreferredValues === "function") return splitPreferredValues(value);
  return String(value || "")
    .split(/[,|;\/]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function _pbHealthFieldStats(entries, key) {
  const samples = [];
  let filled = 0;
  entries.forEach((entry) => {
    const value = _pbHealthDisplayValue(entry.play?.[key]);
    if (value) {
      filled += 1;
      if (samples.length < 4) samples.push({ ...entry, value });
    }
  });
  const total = entries.length;
  const missing = Math.max(0, total - filled);
  return {
    key,
    label: _pbHealthFieldLabel(key),
    filled,
    missing,
    total,
    coverage: total ? filled / total : 0,
    samples,
  };
}

function _pbHealthBuildFieldStats(entries) {
  const keys = new Set([
    ...PLAYBOOK_HEALTH_CRITICAL_FIELDS.map((field) => field.key),
    ...PLAYBOOK_HEALTH_CSV_GROUPS.flatMap((group) => group.fields),
    ...PLAYBOOK_HEALTH_CSV_VALUE_RULES.map((rule) => rule.key),
  ]);
  const stats = {};
  keys.forEach((key) => {
    stats[key] = _pbHealthFieldStats(entries, key);
  });
  return stats;
}

function _pbHealthCsvFormatFieldList(fields, stats) {
  return fields
    .map((key) => {
      const stat = stats[key] || { label: _pbHealthFieldLabel(key), missing: 0, total: 0 };
      return `${stat.label} (${stat.missing}/${stat.total} missing)`;
    })
    .join(", ");
}

function _pbHealthCsvInvalidValues(entries) {
  const issues = [];
  PLAYBOOK_HEALTH_CSV_VALUE_RULES.forEach((rule) => {
    const allowed = new Set(rule.allowed);
    const byValue = new Map();
    entries.forEach((entry) => {
      _pbHealthCsvSplitValues(entry.play?.[rule.key]).forEach((value) => {
        if (allowed.has(value)) return;
        if (!byValue.has(value)) {
          byValue.set(value, {
            value,
            count: 0,
            items: [],
          });
        }
        const bucket = byValue.get(value);
        bucket.count += 1;
        if (bucket.items.length < 4) bucket.items.push(entry);
      });
    });
    const values = Array.from(byValue.values())
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, 5);
    if (values.length) {
      issues.push({
        rule,
        fieldKey: rule.key,
        label: rule.label,
        expected: rule.expected,
        values,
        count: values.reduce((sum, item) => sum + item.count, 0),
      });
    }
  });
  return issues;
}

function _pbHealthAnalyzeCsvRecommendations(analysis) {
  const entries = analysis.entries;
  const stats = _pbHealthBuildFieldStats(entries);
  const recommendations = [];
  const addRecommendation = (rec) => {
    recommendations.push({
      priority: "Medium",
      actionType: "field",
      actionKey: "preferredDown",
      actionLabel: "Clean Field",
      fields: [],
      samples: [],
      ...rec,
    });
  };

  const identityMissing = PLAYBOOK_HEALTH_CSV_GROUPS[0].fields.filter(
    (key) => (stats[key]?.missing || 0) > 0,
  );
  if (identityMissing.length) {
    addRecommendation({
      priority: "High",
      title: "Fix required identity columns in the source CSV",
      detail: _pbHealthCsvFormatFieldList(identityMissing, stats),
      actionKey: identityMissing[0],
      actionLabel: "Fix Identity",
      fields: identityMissing,
    });
  }

  PLAYBOOK_HEALTH_CSV_GROUPS.slice(1).forEach((group) => {
    const groupStats = group.fields.map((key) => stats[key]).filter(Boolean);
    const averageCoverage = groupStats.length
      ? groupStats.reduce((sum, stat) => sum + stat.coverage, 0) / groupStats.length
      : 0;
    const emptyFields = groupStats.filter((stat) => stat.filled === 0);
    if (averageCoverage >= group.threshold && emptyFields.length === 0) return;
    const actionLabel = emptyFields.length ? "Add Columns" : "Fill Values";
    const detail = emptyFields.length
      ? `These columns look empty or absent: ${emptyFields.map((stat) => stat.label).join(", ")}.`
      : `${Math.round(averageCoverage * 100)}% average coverage across ${group.fields.length} columns.`;
    addRecommendation({
      priority: group.priority,
      title: `${group.title} need cleanup`,
      detail,
      actionKey: group.actionKey,
      actionLabel,
      fields: group.fields,
    });
  });

  const invalidValueIssues = _pbHealthCsvInvalidValues(entries);
  invalidValueIssues.forEach((issue) => {
    addRecommendation({
      priority: "High",
      title: `Normalize ${issue.label} values`,
      detail: `Expected ${issue.expected}. Found ${issue.count} value${issue.count === 1 ? "" : "s"} that will not route cleanly.`,
      actionKey: issue.fieldKey,
      actionLabel: "Normalize",
      fields: [issue.fieldKey],
      invalidValues: issue.values,
      samples: issue.values.flatMap((value) => value.items).slice(0, 4),
    });
  });

  if (analysis.exactGroups.length) {
    addRecommendation({
      priority: "Medium",
      title: "Remove duplicate rows from the source CSV",
      detail: `${analysis.exactGroups.length} exact duplicate group${analysis.exactGroups.length === 1 ? "" : "s"} found after import.`,
      actionType: "edit",
      actionKey: String(analysis.exactGroups[0][0].index),
      actionLabel: "Review Rows",
      samples: analysis.exactGroups[0].slice(0, 4),
    });
  }

  if (analysis.categoryAnalysis?.unmatchedRows?.length) {
    addRecommendation({
      priority: "High",
      title: "Add routing fields for unrouted plays",
      detail: `${analysis.categoryAnalysis.unmatchedRows.length} play${analysis.categoryAnalysis.unmatchedRows.length === 1 ? "" : "s"} do not land in any auto call sheet category.`,
      actionKey: "preferredDown",
      actionLabel: "Add Routing",
      fields: ["preferredDown", "preferredDistance", "preferredFieldPosition", "type"],
      samples: analysis.categoryAnalysis.unmatchedRows.slice(0, 4),
    });
  }

  if (recommendations.length) {
    addRecommendation({
      priority: "Low",
      title: "Re-export from the BCOffense template after cleanup",
      detail: "Use the offensive template headers so future imports map every column predictably.",
      actionType: "download",
      actionKey: "offense",
      actionLabel: "Template",
    });
  }

  recommendations.sort((a, b) => {
    const rank = { High: 0, Medium: 1, Low: 2 };
    return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
  });

  return {
    stats,
    invalidValueIssues,
    recommendations,
    issueCount: recommendations.filter((rec) => rec.priority !== "Low").length,
  };
}

function _pbHealthAnalyze() {
  const entries = Array.isArray(plays)
    ? plays.map((play, index) => ({ play, index }))
    : [];
  const exactGroups = _pbHealthGroupBy(entries, _pbHealthExactKey);
  const nearGroups = _pbHealthGroupBy(entries, _pbHealthNearKey).filter((group) => {
    const exactKeys = new Set(group.map((entry) => _pbHealthExactKey(entry.play)));
    return exactKeys.size > 1;
  });
  const missingByField = PLAYBOOK_HEALTH_CRITICAL_FIELDS.map((field) => {
    const items = entries.filter(({ play }) => _sanitizeIsEmpty(play, field.key));
    return { ...field, count: items.length, items };
  });
  const missingRows = entries
    .map((entry) => ({
      ...entry,
      fields: PLAYBOOK_HEALTH_CRITICAL_FIELDS.filter((field) =>
        _sanitizeIsEmpty(entry.play, field.key),
      ),
    }))
    .filter((entry) => entry.fields.length > 0);
  const casingGroups = _pbHealthDetectCasing(entries);
  const spellingGroups = _pbHealthDetectSpelling(entries);
  const vocabularyIssues = casingGroups.length + spellingGroups.length;
  const categoryAnalysis = _pbHealthAnalyzeCategories(entries);
  const analysis = {
    entries,
    exactGroups,
    nearGroups,
    missingByField,
    missingRows,
    casingGroups,
    spellingGroups,
    vocabularyIssues,
    categoryAnalysis,
  };
  const csvAnalysis = _pbHealthAnalyzeCsvRecommendations(analysis);
  const exactDuplicateItems = exactGroups.reduce((sum, group) => sum + group.length, 0);
  const nearDuplicateItems = nearGroups.reduce((sum, group) => sum + group.length, 0);
  const score = Math.max(
    0,
    100 -
    exactGroups.length * 10 -
    nearGroups.length * 6 -
    missingRows.length * 3 -
    vocabularyIssues * 4 -
    categoryAnalysis.issueCount * 2 -
    csvAnalysis.issueCount * 2,
  );
  return {
    ...analysis,
    csvAnalysis,
    exactDuplicateItems,
    nearDuplicateItems,
    score,
  };
}

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

function _pbHealthRenderCasingIssue(issue) {
  const sanitizeKey = issue.field.sanitizeKey || issue.field.keys[0];
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
      <button type="button" class="btn btn-xs" data-action="openPlaybookSanitizeField" data-arg="${escapeHtml(sanitizeKey)}">Cleanup</button>
    </div>
    <div class="pb-health-vocab-values">${valueHtml}</div>
    ${_pbHealthRenderVocabSamples(samples)}
  </div>`;
}

function _pbHealthRenderSpellingIssue(issue) {
  const sanitizeKey = issue.field.sanitizeKey || issue.field.keys[0];
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
      <button type="button" class="btn btn-xs" data-action="openPlaybookSanitizeField" data-arg="${escapeHtml(sanitizeKey)}">Cleanup</button>
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

function openPlaybookHealthCleanup() {
  closePlaybookDataHealth();
  openPlaybookSanitize();
}

