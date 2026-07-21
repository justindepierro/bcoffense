/* signals.js - Component-level signal clips for formations, tags, blocking, and motion. */

const SIGNAL_CATEGORIES = [
  { id: "CORE", label: "CORE" },
  { id: "TAGS", label: "TAGS" },
  { id: "BLOCKING", label: "BLOCKING" },
  { id: "MOTIONS", label: "MOTIONS" },
];

const SIGNAL_COMPONENTS = [
  { category: "CORE", componentType: "personnel", label: "Personnel", fields: ["personnel"], requiresVideo: false, cueLabel: "Verbal / board cue" },
  { category: "CORE", componentType: "formation", label: "Formation", fields: ["formation"] },
  { category: "CORE", componentType: "play", label: "Play Name", fields: ["play"] },
  { category: "CORE", componentType: "basePlay", label: "Base Play", fields: ["basePlay"] },
  { category: "TAGS", componentType: "formTag", label: "Form Tag", fields: ["formTag1", "formTag2"] },
  { category: "TAGS", componentType: "playTag", label: "Play Tag", fields: ["playTag1", "playTag2"] },
  { category: "TAGS", componentType: "oneWord", label: "One Word", fields: ["oneWord"] },
  { category: "BLOCKING", componentType: "protection", label: "Protection", fields: ["protection"] },
  { category: "BLOCKING", componentType: "lineCall", label: "Line Call", fields: ["lineCall"] },
  { category: "BLOCKING", componentType: "back", label: "Back", fields: ["back"] },
  { category: "BLOCKING", componentType: "under", label: "Under", fields: ["under"] },
  { category: "MOTIONS", componentType: "shift", label: "Shift", fields: ["shift"] },
  { category: "MOTIONS", componentType: "motion", label: "Motion", fields: ["motion"] },
];

const SIGNAL_MAX_DURATION_SEC = 5;
const SIGNAL_MAX_BYTES = 25 * 1024 * 1024;
const SIGNAL_MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const SIGNAL_IPHONE_CAPTURE_HINT =
  "iPhone: 1080p HD at 30 fps, 4-5s, Most Compatible/H.264 works best. We optimize before upload when this phone supports it.";

let _sigSelected = null;
let _sigLastRenderToken = 0;
let _sigSelectorState = null;
let _sigClipModalCache = new Map();
let _sigPendingUpload = null;
let _sigManifestReconcilePromise = null;

function _sigCanManage() {
  return typeof canEditUser === "function" ? Boolean(canEditUser()) : false;
}

function _sigRecordsKey() {
  return STORAGE_KEYS.SIGNALS || "signals";
}

function _sigCompareValue(value) {
  if (typeof normalizePlayCompareValue === "function") {
    return normalizePlayCompareValue(value);
  }
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function _sigRecordId(componentType, compareKey) {
  return `${componentType}:${compareKey}`;
}

function _sigClipKey(componentType, compareKey) {
  return `signals/${componentType}/${compareKey}`;
}

function _sigComponentByType(componentType) {
  return SIGNAL_COMPONENTS.find((item) => item.componentType === componentType) || null;
}

function _sigComponentRequiresVideo(componentType) {
  const component = _sigComponentByType(componentType);
  return component?.requiresVideo !== false;
}

function _sigNormalizeRecord(record) {
  if (!record || typeof record !== "object") return null;
  const componentType = String(record.componentType || "").trim();
  const compareKey = String(record.compareKey || "").trim();
  if (!componentType || !compareKey) return null;
  const component = _sigComponentByType(componentType);
  const category = record.category || component?.category || "";
  return {
    id: String(record.id || _sigRecordId(componentType, compareKey)),
    category,
    componentType,
    componentValue: String(record.componentValue || ""),
    compareKey,
    clipKey: String(record.clipKey || _sigClipKey(componentType, compareKey)),
    durationMs: Number(record.durationMs || 0),
    clipCount: Math.max(0, Number(record.clipCount || 0)),
    visibility: record.visibility === "draft" ? "draft" : "published",
    createdBy: String(record.createdBy || ""),
    createdAt: String(record.createdAt || ""),
    updatedAt: String(record.updatedAt || ""),
    notes: String(record.notes || ""),
  };
}

// Short-TTL in-memory cache of normalized signal records. Without it,
// _sigLoadRecords does a storageManager.get (localStorage read + LZ-decompress +
// JSON.parse) and a full .map(normalize).filter() on EVERY call — and
// getSignalCountForPlay is called per row on every playbook/script/presentation
// render. The 1s TTL means all per-row calls within a single synchronous render
// pass share one decode, while external writes (cloud pull / restore) are picked
// up within a second — no explicit invalidation hooks required. _sigSaveRecords
// refreshes the cache immediately so local edits are instant.
let _sigRecordsCache = null;
let _sigRecordsCacheAt = 0;
let _sigRecordsMapCache = null;
const SIG_RECORDS_CACHE_TTL_MS = 1000;

function _sigLoadRecords() {
  if (_sigRecordsCache && Date.now() - _sigRecordsCacheAt < SIG_RECORDS_CACHE_TTL_MS) {
    return _sigRecordsCache;
  }
  const raw = storageManager.get(_sigRecordsKey(), []);
  _sigRecordsCache = Array.isArray(raw) ? raw.map(_sigNormalizeRecord).filter(Boolean) : [];
  _sigRecordsCacheAt = Date.now();
  _sigRecordsMapCache = null;
  return _sigRecordsCache;
}

function _sigSaveRecords(records) {
  const normalized = records.map(_sigNormalizeRecord).filter(Boolean);
  storageManager.set(_sigRecordsKey(), normalized);
  _sigRecordsCache = normalized;
  _sigRecordsCacheAt = Date.now();
  _sigRecordsMapCache = null;
}

// Signal clips and their small workspace records are intentionally separate:
// the clip is committed to team-scoped R2/KV first, then its record is carried
// in the next immutable workspace release. Older uploads (and an interrupted
// browser handoff) can therefore leave a real clip without its matching
// workspace record. Repair that safely from the authoritative clip index on
// staff startup. This is a compact, idempotent metadata migration -- it never
// uploads, deletes, or changes the actual signal video.
async function reconcilePublishedSignalRecords() {
  if (!_sigCanManage()) return false;
  if (_sigManifestReconcilePromise) return _sigManifestReconcilePromise;
  if (!window.playClips || typeof window.playClips.loadIndex !== "function") return false;

  _sigManifestReconcilePromise = (async () => {
    const index = await window.playClips.loadIndex();
    const signalSigs = [...(index instanceof Set ? index : [])]
      .map((sig) => String(sig || "").trim())
      .filter((sig) => sig.startsWith("signals/"));
    if (!signalSigs.length) return false;

    const records = _sigLoadRecords();
    const byId = _sigRecordsMap(records);
    const next = [...records];
    let changed = 0;
    const now = new Date().toISOString();
    const user = typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;

    signalSigs.forEach((sig) => {
      const [, componentType, ...keyParts] = sig.split("/");
      const compareKey = keyParts.join("/");
      if (!componentType || !compareKey || !_sigComponentByType(componentType)) return;
      const summary = _sigFindSummary(componentType, compareKey);
      if (!summary) return;
      const id = _sigRecordId(componentType, compareKey);
      const existing = byId.get(id);
      // Signal manifests are replace-only, so an indexed signal has exactly
      // one current clip. Preserve a coach's draft visibility if they made
      // that explicit; missing historic records become published by default.
      if (Number(existing?.clipCount || 0) > 0) return;
      const record = _sigNormalizeRecord({
        ...(existing || {}),
        id,
        category: summary.category,
        componentType,
        componentValue: summary.displayValue,
        compareKey,
        clipKey: sig,
        clipCount: 1,
        visibility: existing?.visibility || "published",
        createdBy: existing?.createdBy || user?.username || user?.role || "",
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      });
      if (!record) return;
      const indexInRecords = next.findIndex((item) => item.id === id);
      if (indexInRecords >= 0) next[indexInRecords] = record;
      else next.push(record);
      byId.set(id, record);
      changed += 1;
    });

    if (!changed) return false;
    _sigSaveRecords(next);
    if (typeof recordPlayerPublishStatus === "function") {
      recordPlayerPublishStatus("signals", {
        label: `${changed} published signal ${changed === 1 ? "record" : "records"} restored from Cloudflare media`,
      });
    }
    return true;
  })().catch(() => false).finally(() => {
    _sigManifestReconcilePromise = null;
  });
  return _sigManifestReconcilePromise;
}

function _sigScheduleManifestReconciliation() {
  const start = () => {
    // Let authentication and the normal clip-index warmup share the same
    // request before this low-priority historical-repair pass runs.
    setTimeout(() => {
      reconcilePublishedSignalRecords().then((changed) => {
        if (changed && document.getElementById("signals")?.classList.contains("active")) renderSignals();
      }).catch(() => { });
    }, 1100);
  };
  if (typeof window.whenAuthReady === "function") window.whenAuthReady().then(start).catch(() => { });
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

function _sigRecordsMap(records = _sigLoadRecords()) {
  // Reuse the cached Map only for the default (cached-records) path; callers
  // that pass an explicit list always get a fresh Map.
  if (records === _sigRecordsCache && _sigRecordsMapCache) return _sigRecordsMapCache;
  const map = new Map();
  records.forEach((record) => map.set(record.id, record));
  if (records === _sigRecordsCache) _sigRecordsMapCache = map;
  return map;
}

function _sigNormalizeClipList(data) {
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.clips) ? data.clips : [];
}

function _sigFormatMegabytes(bytes) {
  return `${(Number(bytes || 0) / (1024 * 1024)).toFixed(1)} MB`;
}

function _sigUpsertRecord(summary, patch = {}) {
  const records = _sigLoadRecords();
  const id = _sigRecordId(summary.componentType, summary.compareKey);
  const now = new Date().toISOString();
  const index = records.findIndex((record) => record.id === id);
  const existing = index >= 0 ? records[index] : null;
  const user =
    typeof getCurrentAuthUser === "function" ? getCurrentAuthUser() : null;
  const next = _sigNormalizeRecord({
    ...(existing || {}),
    id,
    category: summary.category,
    componentType: summary.componentType,
    componentValue: summary.displayValue,
    compareKey: summary.compareKey,
    clipKey: _sigClipKey(summary.componentType, summary.compareKey),
    visibility: "published",
    createdBy: existing?.createdBy || user?.username || user?.role || "",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    ...patch,
  });
  if (index >= 0) records[index] = next;
  else records.push(next);
  _sigSaveRecords(records);
  return next;
}

function _sigDeleteRecordIfEmpty(recordId, clipsLength) {
  if (clipsLength > 0) return;
  const records = _sigLoadRecords().filter((record) => record.id !== recordId);
  _sigSaveRecords(records);
}

function _sigSummaries() {
  const source = Array.isArray(plays) ? plays : [];
  const records = _sigRecordsMap();
  const byComponent = new Map();

  SIGNAL_COMPONENTS.forEach((component) => {
    const groups = new Map();
    source.forEach((play) => {
      component.fields.forEach((field) => {
        const raw = play?.[field];
        const display = String(raw == null ? "" : raw).trim();
        if (!display) return;
        const compareKey = _sigCompareValue(display);
        if (!compareKey) return;
        if (!groups.has(compareKey)) {
          groups.set(compareKey, {
            category: component.category,
            componentType: component.componentType,
            componentLabel: component.label,
            compareKey,
            displayValue: display,
            count: 0,
            variants: new Map(),
          });
        }
        const group = groups.get(compareKey);
        group.count += 1;
        group.variants.set(display, (group.variants.get(display) || 0) + 1);
      });
    });

    const summaries = [...groups.values()].map((summary) => {
      const readable = [...summary.variants.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
      const record = records.get(_sigRecordId(summary.componentType, summary.compareKey));
      return {
        ...summary,
        displayValue: readable || summary.displayValue,
        variantCount: summary.variants.size,
        record,
      };
    });
    byComponent.set(
      component.componentType,
      summaries.sort((a, b) => b.count - a.count || a.displayValue.localeCompare(b.displayValue)),
    );
  });

  return byComponent;
}

function _sigFindSummary(componentType, compareKey) {
  const groups = _sigSummaries().get(componentType) || [];
  return groups.find((item) => item.compareKey === compareKey) || null;
}

function _sigVisibleForRole(summary) {
  if (_sigCanManage()) return true;
  const record = summary.record;
  return Boolean(record && record.visibility === "published" && Number(record.clipCount || 0) > 0);
}

function _sigAllVisibleSummaries() {
  const all = [];
  _sigSummaries().forEach((items) => {
    items.forEach((item) => {
      if (_sigVisibleForRole(item)) all.push(item);
    });
  });
  return all;
}

function _sigHasPublishedClip(summary) {
  const record = summary?.record;
  return Boolean(record && record.visibility === "published" && Number(record.clipCount || 0) > 0);
}

function _sigGamePlanPlayIdentity(play) {
  if (!play) return "";
  if (play.id) return `id:${play.id}`;
  if (typeof getPlayIdentityKey === "function") {
    return `key:${getPlayIdentityKey(play, "gameplan", { trim: false })}`;
  }
  return `fields:${[play.personnel, play.formation, play.play, play.oneWord].join("|")}`;
}

function _sigActiveGamePlanPlays() {
  const active = [];
  const seen = new Set();
  const add = (play) => {
    const identity = _sigGamePlanPlayIdentity(play);
    if (!identity || seen.has(identity)) return;
    seen.add(identity);
    active.push(play);
  };

  // Read the active board without creating a blank board just because a coach
  // opened Signals. A board play is the most direct definition of "on the
  // Game Plan"; tagged playbook calls are included too while they await routing.
  if (typeof _gpLoadBoards === "function" && typeof _gpActiveOpponentKey === "function") {
    const boards = _gpLoadBoards();
    const board = boards?.[_gpActiveOpponentKey()];
    Object.values(board?.assignments || {}).forEach((assigned) => {
      (Array.isArray(assigned) ? assigned : []).forEach(add);
    });
  }

  const opponent = typeof getGameWeek === "function" ? getGameWeek()?.opponentName : "";
  if (opponent && typeof plays !== "undefined" && Array.isArray(plays)) {
    if (typeof getGamePlanTags === "function" && typeof playSignature === "function") {
      const tagged = new Set(getGamePlanTags()?.[opponent] || []);
      plays.filter((play) => tagged.has(playSignature(play))).forEach(add);
    } else if (typeof isPlayTaggedForOpponent === "function") {
      plays.filter((play) => isPlayTaggedForOpponent(play, opponent)).forEach(add);
    }
  }
  return active;
}

function _sigGamePlanMissingSignalMap() {
  const missing = new Map();
  const records = _sigRecordsMap();
  const gamePlanPlays = _sigActiveGamePlanPlays();

  gamePlanPlays.forEach((play) => {
    const seenForPlay = new Set();
    SIGNAL_COMPONENTS.forEach((component) => {
      if (component.requiresVideo === false) return;
      component.fields.forEach((field) => {
        const value = String(play?.[field] == null ? "" : play[field]).trim();
        const compareKey = _sigCompareValue(value);
        if (!value || !compareKey) return;
        const id = _sigRecordId(component.componentType, compareKey);
        if (seenForPlay.has(id)) return;
        seenForPlay.add(id);
        const record = records.get(id);
        if (record && record.visibility === "published" && Number(record.clipCount || 0) > 0) return;
        const current = missing.get(id) || { playCount: 0, componentType: component.componentType, compareKey };
        current.playCount += 1;
        missing.set(id, current);
      });
    });
  });

  return { gamePlanPlayCount: gamePlanPlays.length, missing };
}

function _sigCanOpenSummaryClip(summary) {
  const record = summary?.record;
  if (!record || !_sigSummaryRequiresVideo(summary) || Number(record.clipCount || 0) <= 0) return false;
  return record.visibility === "published" || _sigCanManage();
}

function _sigShouldOpenClipDirectly() {
  const body = typeof document !== "undefined" ? document.body : null;
  if (
    body?.classList?.contains("shell-tablet") ||
    body?.classList?.contains("shell-ipados") ||
    body?.dataset?.device === "tablet"
  ) {
    return true;
  }
  return Boolean(
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 700px)").matches,
  );
}

function _sigSummaryRequiresVideo(summary) {
  return _sigComponentRequiresVideo(summary?.componentType);
}

function _sigBuildCoverageReport(summariesByComponent) {
  const all = [];
  SIGNAL_COMPONENTS.forEach((component) => {
    if (component.requiresVideo === false) return;
    (summariesByComponent.get(component.componentType) || []).forEach((summary) => {
      all.push({
        ...summary,
        componentLabel: summary.componentLabel || component.label,
        category: summary.category || component.category,
      });
    });
  });
  const covered = all.filter(_sigHasPublishedClip);
  const missing = all.filter((summary) => !_sigHasPublishedClip(summary));
  const drafts = all.filter((summary) => summary.record?.visibility === "draft");
  const categories = SIGNAL_CATEGORIES.map((category) => {
    const items = all.filter((summary) => summary.category === category.id);
    const coveredItems = items.filter(_sigHasPublishedClip);
    return {
      ...category,
      total: items.length,
      covered: coveredItems.length,
      missing: Math.max(0, items.length - coveredItems.length),
    };
  });
  return {
    total: all.length,
    covered: covered.length,
    missing: missing.length,
    drafts: drafts.length,
    categories,
    topMissing: missing
      .sort((a, b) => b.count - a.count || a.displayValue.localeCompare(b.displayValue))
      .slice(0, 8),
  };
}

function _sigRenderCoverageReport(summariesByComponent) {
  if (!_sigCanManage()) return "";
  const report = _sigBuildCoverageReport(summariesByComponent);
  const pct = report.total ? Math.round((report.covered / report.total) * 100) : 0;
  const categoryRows = report.categories
    .map((category) => {
      const categoryPct = category.total
        ? Math.round((category.covered / category.total) * 100)
        : 0;
      return `
        <div class="signals-coverage-row">
          <span>${escapeHtml(category.label)}</span>
          <strong>${categoryPct}%</strong>
          <small>${category.covered}/${category.total} covered</small>
        </div>`;
    })
    .join("");
  const missingRows = report.topMissing
    .map((summary) => `
      <button type="button" class="signals-coverage-missing"
        data-action="openSignalComponent"
        data-arg="${escapeAttr(`${summary.componentType}|${summary.compareKey}`)}">
        <span>
          <strong>${escapeHtml(summary.displayValue)}</strong>
          <small>${escapeHtml(summary.category)} / ${escapeHtml(summary.componentLabel)}</small>
        </span>
        <em>${summary.count} play${summary.count === 1 ? "" : "s"}</em>
      </button>`)
    .join("");

  return `
    <section class="signals-coverage" aria-label="Signal coverage report">
      <div class="signals-coverage-head">
        <div>
          <p class="signals-eyebrow">Coverage Report</p>
          <h2>${pct}% signal coverage</h2>
        </div>
        <div class="signals-coverage-stats">
          <span><strong>${report.covered}</strong> covered</span>
          <span><strong>${report.missing}</strong> missing</span>
          <span><strong>${report.drafts}</strong> drafts</span>
        </div>
      </div>
      <div class="signals-coverage-grid">
        <div class="signals-coverage-categories">${categoryRows}</div>
        <div class="signals-coverage-priority">
          <h3>Most-used missing signals</h3>
          <div class="signals-coverage-missing-list">
            ${missingRows || '<p class="signals-empty-line">Every playbook component has a published signal clip.</p>'}
          </div>
        </div>
      </div>
    </section>`;
}

function _sigRenderStats(visibleSummaries, gamePlanSignalStatus = { missing: new Map() }) {
  const records = _sigLoadRecords();
  const published = records.filter((record) => record.visibility === "published" && record.clipCount > 0).length;
  const motions = visibleSummaries.filter((item) => item.category === "MOTIONS").length;
  const gamePlanGaps = gamePlanSignalStatus?.missing?.size || 0;
  return `
    <div class="signals-stat"><strong>${visibleSummaries.length}</strong><span>Components</span></div>
    <div class="signals-stat"><strong>${published}</strong><span>Published</span></div>
    <div class="signals-stat"><strong>${motions}</strong><span>Motions</span></div>
    ${gamePlanGaps ? `<div class="signals-stat signals-stat-warning"><strong>⚠ ${gamePlanGaps}</strong><span>Game Plan gaps</span></div>` : ""}
  `;
}

function _sigRenderCategory(category, summariesByComponent, gamePlanSignalStatus = { missing: new Map() }) {
  const components = SIGNAL_COMPONENTS.filter((component) => component.category === category.id);
  const body = components
    .map((component) => {
      const summaries = (summariesByComponent.get(component.componentType) || []).filter(_sigVisibleForRole);
      const chips = summaries.map((summary) => {
        const selected =
          _sigSelected &&
          _sigSelected.componentType === summary.componentType &&
          _sigSelected.compareKey === summary.compareKey;
        const hasClip = summary.record && summary.record.clipCount > 0;
        const gamePlanGap = gamePlanSignalStatus.missing.get(
          _sigRecordId(summary.componentType, summary.compareKey),
        );
        const variantTitle =
          summary.variantCount > 1 ? `${summary.variantCount} spelling variants grouped` : "Canonical match";
        const gamePlanTitle = gamePlanGap
          ? ` ⚠ On the active Game Plan in ${gamePlanGap.playCount} play${gamePlanGap.playCount === 1 ? "" : "s"}; no published signal video.`
          : "";
        return `
          <button type="button" class="signals-chip${selected ? " is-selected" : ""}${hasClip ? " has-clip" : ""}${gamePlanGap ? " needs-gameplan-signal" : ""}"
            data-action="openSignalComponent"
            data-arg="${escapeAttr(`${summary.componentType}|${summary.compareKey}`)}"
            title="${escapeAttr(variantTitle + gamePlanTitle)}">
            <span>${escapeHtml(summary.displayValue)}</span>
            <small>${summary.count}</small>
            ${gamePlanGap ? `<em class="signals-gameplan-warning" aria-label="On the active Game Plan with no published signal video" title="On Game Plan: ${gamePlanGap.playCount} play${gamePlanGap.playCount === 1 ? "" : "s"}, no published video">⚠️</em>` : ""}
          </button>
        `;
      }).join("");
      return `
        <section class="signals-component">
          <div class="signals-component-head">
            <h3>${escapeHtml(component.label)}</h3>
            <span>${summaries.length}</span>
          </div>
          <div class="signals-chip-row">
            ${chips || `<div class="signals-empty-line">${_sigCanManage() ? "No playbook values yet." : "No published signals yet."}</div>`}
          </div>
        </section>
      `;
    })
    .join("");

  return `
    <article class="signals-category">
      <header class="signals-category-head">
        <h2>${escapeHtml(category.label)}</h2>
      </header>
      ${body}
    </article>
  `;
}

function _sigRenderDetailSkeleton(summary, record) {
  if (!summary) {
    return `
      <div class="signals-detail-empty">
        <h2>Signals</h2>
        <p>${_sigCanManage() ? "Choose a component chip to manage its signal." : "Choose a published signal to view it."}</p>
      </div>
    `;
  }

  const visibility = record?.visibility || "published";
  const notes = record?.notes || "";
  const manage = _sigCanManage();
  const component = summary ? _sigComponentByType(summary.componentType) : null;
  const requiresVideo = summary ? _sigSummaryRequiresVideo(summary) : true;
  const upload = manage && requiresVideo
    ? `
      <div class="signals-upload-row">
        <input id="signalClipFile" type="file" accept="video/mp4,video/quicktime,video/*" class="hidden"
          data-onchange="uploadSelectedSignalClip" data-pass="event" />
        <button type="button" class="btn btn-primary" data-action="triggerClick" data-target="signalClipFile">
          Upload Clip
        </button>
        <span class="signals-upload-hint">Max ${SIGNAL_MAX_DURATION_SEC}s, ${_sigFormatMegabytes(SIGNAL_MAX_BYTES)}. ${escapeHtml(SIGNAL_IPHONE_CAPTURE_HINT)}</span>
      </div>
    `
    : manage && !requiresVideo
      ? `
        <div class="signals-upload-row signals-upload-row--cue">
          <span class="signals-upload-hint">${escapeHtml(component?.label || "This component")} is handled as a ${escapeHtml(component?.cueLabel || "non-video cue")} and is not counted as a missing signal clip.</span>
        </div>
      `
      : "";
  const editor = manage
    ? `
      <div class="signals-field-grid">
        <label>
          <span>Visibility</span>
          <select id="signalVisibility">
            <option value="published"${visibility === "published" ? " selected" : ""}>Published</option>
            <option value="draft"${visibility === "draft" ? " selected" : ""}>Draft</option>
          </select>
        </label>
        <label class="signals-notes-field">
          <span>Notes</span>
          <textarea id="signalNotes" rows="4">${escapeHtml(notes)}</textarea>
        </label>
      </div>
      <div class="signals-detail-actions">
        <button type="button" class="btn btn-success" data-action="saveSignalDetails">Save Details</button>
      </div>
    `
    : record?.notes
      ? `<div class="signals-player-note">${escapeHtml(record.notes)}</div>`
      : "";

  return `
    <div class="signals-detail-panel">
      <div class="signals-detail-head">
        <span class="signals-detail-kicker">${escapeHtml(summary.category)} / ${escapeHtml(summary.componentLabel)}</span>
        <h2>${escapeHtml(summary.displayValue)}</h2>
        <div class="signals-detail-meta">
          <span>${summary.count} play${summary.count === 1 ? "" : "s"}</span>
          <span>${summary.variantCount} variant${summary.variantCount === 1 ? "" : "s"}</span>
          <span>${record?.visibility === "draft" ? "Draft" : "Published"}</span>
        </div>
      </div>
      ${upload}
      ${requiresVideo ? `
        <div id="signalClipList" class="signals-clip-list">
          <div class="signals-clip-loading">Loading clips...</div>
        </div>
      ` : ""}
      ${editor}
    </div>
  `;
}

async function _sigRenderRemoteClips(summary, record, token) {
  if (summary && !_sigSummaryRequiresVideo(summary)) return;
  const listEl = document.getElementById("signalClipList");
  if (!listEl || !summary || token !== _sigLastRenderToken) return;
  const sig = _sigClipKey(summary.componentType, summary.compareKey);
  let clips = [];
  try {
    clips =
      window.playClips && typeof window.playClips.listForSig === "function"
        ? _sigNormalizeClipList(await window.playClips.listForSig(sig))
        : [];
  } catch (err) {
    listEl.innerHTML = `<div class="signals-clip-empty">Clip list unavailable.</div>`;
    return;
  }
  if (token !== _sigLastRenderToken) return;
  if (record && record.clipCount !== clips.length && _sigCanManage()) {
    _sigUpsertRecord(summary, {
      clipCount: clips.length,
      durationMs: clips[0]?.duration ? Number(clips[0].duration) * 1000 : record.durationMs,
    });
  }
  if (!clips.length) {
    listEl.innerHTML = `<div class="signals-clip-empty">${_sigCanManage() ? "No clip attached yet." : "No published clip available."}</div>`;
    return;
  }
  const manage = _sigCanManage();
  _sigClipModalCache = new Map();
  listEl.innerHTML = clips.map((clip, index) => {
    const meta = [
      clip.duration ? `${clip.duration}s` : "",
      clip.size ? `${(clip.size / (1024 * 1024)).toFixed(1)} MB` : "",
    ].filter(Boolean).join(" / ");
    const cacheKey = `${sig}:${clip.id || index}`;
    _sigClipModalCache.set(cacheKey, {
      clip,
      summary,
      meta,
    });
    return `
      <article class="signals-clip">
        <video loop muted playsinline preload="metadata" disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback" src="${escapeAttr(clip.url || "")}"></video>
        <div class="signals-clip-meta">
          <strong>${escapeHtml(clip.label || summary.displayValue)}</strong>
          <span>${escapeHtml(meta || "Signal clip")}</span>
        </div>
        <button type="button" class="signals-clip-open" data-action="openSignalClipModal" data-arg="${escapeAttr(cacheKey)}">Watch</button>
        ${manage ? `<button type="button" class="btn btn-sm btn-danger" data-action="deleteSignalClip" data-arg="${escapeAttr(clip.id)}">Delete</button>` : ""}
      </article>
    `;
  }).join("");
  _sigConfigureLoopVideos(listEl);
}

function openSignalClipModal(cacheKey) {
  const item = _sigClipModalCache.get(String(cacheKey || ""));
  if (!item?.clip?.url) {
    if (typeof showToast === "function") showToast("Signal clip unavailable.", { type: "warning" });
    return;
  }
  _sigOpenClipModalItem(item);
}

function _sigOpenClipModalItem(item) {
  closeSignalClipModal();
  const clip = item.clip;
  const summary = item.summary || {};
  const title = clip.label || summary.displayValue || "Signal";
  const meta = item.meta || "Signal clip";
  const overlay = document.createElement("div");
  overlay.id = "signalClipModalOverlay";
  overlay.className = "signals-clip-modal-overlay";
  overlay.dataset.action = "closeSignalClipModalOverlay";
  overlay.innerHTML = `
    <div class="signals-clip-modal" role="dialog" aria-modal="true" aria-labelledby="signalClipModalTitle">
      <header class="signals-clip-modal__head">
        <div>
          <span>${escapeHtml(summary.componentLabel || summary.category || "Signal")}</span>
          <h3 id="signalClipModalTitle">${escapeHtml(title)}</h3>
        </div>
        <button type="button" class="signals-clip-modal__close" data-action="closeSignalClipModal" aria-label="Close signal clip">&times;</button>
      </header>
      <video class="signals-clip-modal-video" autoplay loop muted playsinline preload="auto" disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback" src="${escapeAttr(clip.url)}"></video>
      <p class="signals-clip-modal__meta">${escapeHtml(meta)}</p>
    </div>`;
  document.body.appendChild(overlay);
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "signalClipModalOverlay",
      scrollElement: "signalClipModalOverlay",
      blocking: true,
    });
  } else if (typeof trapFocus === "function") {
    trapFocus(overlay);
  }
  _sigConfigureLoopVideos(overlay);
}

async function _sigOpenFirstClipForSummary(summary) {
  if (!_sigCanOpenSummaryClip(summary)) return false;
  const sig = _sigClipKey(summary.componentType, summary.compareKey);
  let clips = [];
  try {
    clips =
      window.playClips && typeof window.playClips.listForSig === "function"
        ? _sigNormalizeClipList(await window.playClips.listForSig(sig))
        : [];
  } catch (_err) {
    return false;
  }
  const clip = clips.find((item) => item?.url);
  if (!clip) return false;
  const meta = [
    clip.duration ? `${clip.duration}s` : "",
    clip.size ? `${(clip.size / (1024 * 1024)).toFixed(1)} MB` : "",
  ].filter(Boolean).join(" / ");
  _sigOpenClipModalItem({
    clip,
    summary,
    meta: meta || "Signal clip",
  });
  return true;
}

function closeSignalClipModal() {
  const overlay = document.getElementById("signalClipModalOverlay");
  if (!overlay) return;
  if (typeof closeLayer === "function") closeLayer(overlay);
  overlay.remove();
}

function _sigSummaryFromArg(arg) {
  const [componentType, compareKey] = String(arg || "").split("|");
  if (!componentType || !compareKey) return null;
  return _sigFindSummary(componentType, compareKey);
}

function closeSignalUploadModal() {
  const overlay = document.getElementById("signalUploadModalOverlay");
  if (!overlay) return;
  if (typeof closeLayer === "function") closeLayer(overlay);
  overlay.remove();
}

function _sigClearPendingUpload() {
  if (_sigPendingUpload?.sourceUrl) {
    try { URL.revokeObjectURL(_sigPendingUpload.sourceUrl); } catch (_err) { }
  }
  if (_sigPendingUpload?.preparedUrl) {
    try { URL.revokeObjectURL(_sigPendingUpload.preparedUrl); } catch (_err) { }
  }
  _sigPendingUpload = null;
}

function closeSignalUploadReviewModal() {
  const overlay = document.getElementById("signalUploadReviewModalOverlay");
  if (overlay) {
    if (typeof closeLayer === "function") closeLayer(overlay);
    overlay.remove();
  }
  _sigClearPendingUpload();
}

function _sigRenderUploadReviewModal() {
  const state = _sigPendingUpload;
  if (!state?.summary) return;
  const existing = document.getElementById("signalUploadReviewModalOverlay");
  const overlay = existing || document.createElement("div");
  overlay.id = "signalUploadReviewModalOverlay";
  overlay.className = "signals-upload-modal-overlay signals-upload-review-overlay";
  overlay.dataset.action = "closeSignalUploadReviewModalOverlay";
  const summary = state.summary;
  const durationText = state.duration
    ? `${state.duration.toFixed(1)}s selected`
    : "Selected clip";
  const sizeText = state.file?.size ? _sigFormatMegabytes(state.file.size) : "";
  const willTrim = state.duration && state.duration > SIGNAL_MAX_DURATION_SEC;
  const stage = state.stage || "source";
  const isProcessing = stage === "processing";
  const isUploading = stage === "uploading";
  const isReady = stage === "ready";
  const activeUrl = isReady || isUploading ? state.preparedUrl : state.sourceUrl;
  const usedOriginalFallback = state.prepared?.processingMode === "original-fallback";
  const headline = isReady
    ? usedOriginalFallback ? "Ready to upload" : "Optimized preview ready"
    : isUploading
      ? "Uploading signal..."
    : isProcessing
      ? "Preparing final clip..."
      : "Review before processing";
  const subcopy = isReady
    ? usedOriginalFallback
      ? `This phone kept the original player-safe file${state.preparedDuration ? `, ${state.preparedDuration.toFixed(1)}s` : ""}. Playback stays muted.`
      : `Audio removed${state.preparedDuration ? `, ${state.preparedDuration.toFixed(1)}s` : ""}. Confirm when this looks right.`
    : willTrim
      ? `This clip is over ${SIGNAL_MAX_DURATION_SEC}s, so the upload will use the first ${SIGNAL_MAX_DURATION_SEC}s.`
      : `This clip is within the ${SIGNAL_MAX_DURATION_SEC}s limit.`;
  overlay.innerHTML = `
    <div class="signals-upload-modal signals-upload-review-modal" role="dialog" aria-modal="true" aria-labelledby="signalUploadReviewTitle">
      <header class="signals-upload-modal__head">
        <div>
          <span>${escapeHtml(summary.category)} / ${escapeHtml(summary.componentLabel)}</span>
          <h3 id="signalUploadReviewTitle">${escapeHtml(summary.displayValue)}</h3>
        </div>
        <button type="button" class="signals-clip-modal__close" data-action="closeSignalUploadReviewModal" aria-label="Close signal upload review">&times;</button>
      </header>
      <div class="signals-upload-review-body">
        <div class="signals-upload-review-meta">
          <strong>${escapeHtml(headline)}</strong>
          <span>${escapeHtml([durationText, sizeText].filter(Boolean).join(" / "))}</span>
          <p>${escapeHtml(subcopy)}</p>
        </div>
        <video class="signals-upload-review-video" src="${escapeAttr(activeUrl || "")}" autoplay loop muted playsinline preload="auto" disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video>
      </div>
      <footer class="signals-upload-modal__actions signals-upload-review-actions">
        ${isUploading
      ? `<button type="button" class="btn btn-primary" disabled>Uploading...</button>`
      : isReady
      ? `<button type="button" class="btn btn-primary" data-action="confirmSignalReviewedUpload">Upload This Clip</button>
             <button type="button" class="btn btn-secondary" data-action="resetSignalUploadReview">Choose Different</button>`
      : `<button type="button" class="btn btn-primary" data-action="processSignalUploadReview"${isProcessing ? " disabled" : ""}>${isProcessing ? "Processing..." : "Preview Final Clip"}</button>
             <button type="button" class="btn btn-secondary" data-action="resetSignalUploadReview"${isProcessing ? " disabled" : ""}>Choose Different</button>`}
      </footer>
    </div>`;
  if (!existing) {
    document.body.appendChild(overlay);
    if (typeof openLayer === "function") {
      openLayer(overlay, {
        id: "signalUploadReviewModalOverlay",
        scrollElement: "signalUploadReviewModalOverlay",
        blocking: true,
      });
    } else if (typeof trapFocus === "function") {
      trapFocus(overlay);
    }
  }
  _sigConfigureLoopVideos(overlay);
}

async function openSignalUploadReviewModal(file) {
  if (!_sigCanManage() || !file || !_sigSelected) return;
  const summary = _sigFindSummary(_sigSelected.componentType, _sigSelected.compareKey);
  if (!summary) return;
  if (!String(file.type || "").toLowerCase().startsWith("video/")) {
    showToast("Choose a video file.", { type: "error", duration: 3000 });
    return;
  }
  if (file.size > SIGNAL_MAX_SOURCE_BYTES) {
    showToast(
      `Signal source is ${_sigFormatMegabytes(file.size)}. Choose a source under ${_sigFormatMegabytes(SIGNAL_MAX_SOURCE_BYTES)}.`,
      { type: "error", duration: 4200 },
    );
    return;
  }
  closeSignalUploadModal();
  closeSignalUploadReviewModal();
  const sourceUrl = URL.createObjectURL(file);
  _sigPendingUpload = {
    file,
    sourceUrl,
    summary,
    duration: await _sigProbeDuration(file),
    stage: "source",
  };
  _sigRenderUploadReviewModal();
}

async function processSignalUploadReview() {
  const state = _sigPendingUpload;
  if (!state?.file || !state.summary) return;
  try {
    state.stage = "processing";
    _sigRenderUploadReviewModal();
    const prepared = await window.playClips.prepareSilentVideoUpload(state.file, {
      maxDurationSec: SIGNAL_MAX_DURATION_SEC,
      durationGraceSec: 0.5,
      trimToMaxDuration: true,
      allowOriginalFallback: true,
      showProcessingToast: false,
      publishType: "signals",
    });
    if (_sigPendingUpload !== state) return;
    if (state.preparedUrl) {
      try { URL.revokeObjectURL(state.preparedUrl); } catch (_err) { }
    }
    state.prepared = prepared;
    state.preparedUrl = URL.createObjectURL(prepared.uploadFile);
    state.preparedDuration = Number(prepared.uploadDuration || prepared.duration || 0);
    state.stage = "ready";
    _sigRenderUploadReviewModal();
  } catch (err) {
    if (_sigPendingUpload === state) {
      state.stage = "source";
      _sigRenderUploadReviewModal();
    }
    showToast(err?.message || "Could not prepare signal clip.", { type: "error", duration: 4500 });
  }
}

function resetSignalUploadReview() {
  const summary = _sigPendingUpload?.summary;
  closeSignalUploadReviewModal();
  if (summary) {
    _sigSelected = { componentType: summary.componentType, compareKey: summary.compareKey };
    openSignalUploadModal(`${summary.componentType}|${summary.compareKey}`);
  }
}

async function confirmSignalReviewedUpload() {
  const state = _sigPendingUpload;
  if (!_sigCanManage() || !state?.prepared || !state.summary) return;
  const summary = state.summary;
  try {
    const sig = _sigClipKey(summary.componentType, summary.compareKey);
    const label = `${summary.componentLabel}: ${summary.displayValue}`;
    state.stage = "uploading";
    _sigRenderUploadReviewModal();
    const result = await window.playClips.uploadPreparedWithRetryForSig(sig, state.prepared, label, {
      publishType: "signals",
      replaceExisting: true,
      outboxMetadata: {
        signal: {
          componentType: summary.componentType,
          compareKey: summary.compareKey,
        },
      },
    });
    _sigSelected = { componentType: summary.componentType, compareKey: summary.compareKey };
    if (result.queued) {
      showToast("Signal clip is safely saved on this phone and will upload automatically when the connection is ready.", { type: "info", duration: 4200 });
      closeSignalUploadReviewModal();
      renderSignals();
      return;
    }
    _sigUpsertRecord(summary, {
      clipCount: 1,
      durationMs: Number(result.clip?.duration || state.preparedDuration || 0) * 1000,
      visibility: "published",
      notes: summary.record?.notes || "",
    });
    if (typeof recordPlayerPublishStatus === "function") {
      recordPlayerPublishStatus("signals", {
        label: `Signal uploaded: ${summary.displayValue}`,
      });
    }
    showToast("Signal clip uploaded", { type: "success", duration: 2200 });
    closeSignalUploadReviewModal();
    renderSignals();
    openSignalUploadModal(`${summary.componentType}|${summary.compareKey}`);
  } catch (err) {
    if (_sigPendingUpload === state) {
      state.stage = "ready";
      _sigRenderUploadReviewModal();
    }
    showToast(err?.message || "Signal upload failed.", { type: "error", duration: 4500 });
  }
}

function openSignalUploadModal(arg) {
  if (!_sigCanManage()) return;
  const summary = _sigSummaryFromArg(arg);
  if (!summary) return;
  _sigSelected = { componentType: summary.componentType, compareKey: summary.compareKey };
  renderSignals();
  if (!_sigSummaryRequiresVideo(summary)) {
    closeSignalUploadModal();
    if (typeof showToast === "function") {
      showToast(`${summary.componentLabel} is handled as a cue, not a video signal.`, {
        type: "info",
        duration: 2600,
      });
    }
    return;
  }
  closeSignalUploadModal();
  const record = _sigRecordsMap().get(_sigRecordId(summary.componentType, summary.compareKey)) || summary.record || null;
  const clipCount = Number(record?.clipCount || 0);
  const argValue = `${summary.componentType}|${summary.compareKey}`;
  const status = clipCount
    ? `${clipCount} clip${clipCount === 1 ? "" : "s"} attached`
    : "No clip attached yet";
  const overlay = document.createElement("div");
  overlay.id = "signalUploadModalOverlay";
  overlay.className = "signals-upload-modal-overlay";
  overlay.dataset.action = "closeSignalUploadModalOverlay";
  overlay.innerHTML = `
    <div class="signals-upload-modal" role="dialog" aria-modal="true" aria-labelledby="signalUploadModalTitle">
      <header class="signals-upload-modal__head">
        <div>
          <span>${escapeHtml(summary.category)} / ${escapeHtml(summary.componentLabel)}</span>
          <h3 id="signalUploadModalTitle">${escapeHtml(summary.displayValue)}</h3>
        </div>
        <button type="button" class="signals-clip-modal__close" data-action="closeSignalUploadModal" aria-label="Close signal upload">&times;</button>
      </header>
      <div class="signals-upload-modal__body">
        <p class="signals-upload-modal__status">${escapeHtml(status)}</p>
        <input id="signalUploadClipFile" type="file" accept="video/mp4,video/quicktime,video/*" class="hidden"
          data-onchange="uploadSelectedSignalClip" data-pass="event" />
        <button type="button" class="btn btn-primary signals-upload-modal__upload" data-action="triggerClick" data-target="signalUploadClipFile">
          Upload Clip
        </button>
        <p class="signals-upload-hint">Max ${SIGNAL_MAX_DURATION_SEC}s. Source up to ${_sigFormatMegabytes(SIGNAL_MAX_SOURCE_BYTES)}; final player clip up to ${_sigFormatMegabytes(SIGNAL_MAX_BYTES)}. ${escapeHtml(SIGNAL_IPHONE_CAPTURE_HINT)}</p>
      </div>
      <footer class="signals-upload-modal__actions">
        ${clipCount ? `<button type="button" class="btn btn-secondary" data-action="watchSignalUploadModalClip" data-arg="${escapeAttr(argValue)}">Watch Current</button>` : ""}
        <button type="button" class="btn btn-secondary" data-action="openSignalComponentDetails" data-arg="${escapeAttr(argValue)}">Details</button>
      </footer>
  </div>`;
  document.body.appendChild(overlay);
  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: "signalUploadModalOverlay",
      scrollElement: "signalUploadModalOverlay",
      blocking: true,
    });
  } else if (typeof trapFocus === "function") {
    trapFocus(overlay);
  }
}

function openSignalComponentDetails(arg) {
  const summary = _sigSummaryFromArg(arg);
  if (!summary) return;
  closeSignalUploadModal();
  _sigSelected = { componentType: summary.componentType, compareKey: summary.compareKey };
  renderSignals();
}

async function watchSignalUploadModalClip(arg) {
  const summary = _sigSummaryFromArg(arg);
  if (!summary) return;
  closeSignalUploadModal();
  const opened = await _sigOpenFirstClipForSummary(summary);
  if (!opened && typeof showToast === "function") {
    showToast("No signal clip is ready yet.", { type: "warning", duration: 2200 });
  }
}

function renderSignals() {
  const root = document.getElementById("signalsApp");
  if (!root) return;
  const summariesByComponent = _sigSummaries();
  const visibleSummaries = _sigAllVisibleSummaries();
  const gamePlanSignalStatus = _sigGamePlanMissingSignalMap();
  if (_sigSelected && !_sigFindSummary(_sigSelected.componentType, _sigSelected.compareKey)) {
    _sigSelected = null;
  }
  if (!_sigSelected && visibleSummaries.length) {
    const firstMotion = visibleSummaries.find((item) => item.category === "MOTIONS");
    const first = firstMotion || visibleSummaries[0];
    _sigSelected = { componentType: first.componentType, compareKey: first.compareKey };
  }
  const selectedSummary = _sigSelected
    ? _sigFindSummary(_sigSelected.componentType, _sigSelected.compareKey)
    : null;
  const selectedRecord = selectedSummary?.record || null;
  _sigLastRenderToken += 1;
  const token = _sigLastRenderToken;

  root.innerHTML = `
    <div class="signals-shell coach-grid-signals-workspace">
      <header class="signals-header page-header-surface app-command-toolbar coach-grid-command-strip">
        <div>
          <p class="signals-eyebrow">Signal Collection</p>
          <h1>Signals</h1>
        </div>
        <div class="signals-stats">${_sigRenderStats(visibleSummaries, gamePlanSignalStatus)}</div>
        ${_sigCanManage() ? `
        <div class="signals-header-actions">
          <button type="button" class="btn btn-sm btn-outline" id="sigRecompressBtn" data-action="recompressSignalClips" title="Re-encode older clips to a smaller, faster size for player phones">Optimize Clips</button>
        </div>` : ""}
      </header>
      ${_sigRenderCoverageReport(summariesByComponent)}
      <div class="signals-layout">
        <main class="signals-category-grid" aria-label="Signal component categories">
          ${SIGNAL_CATEGORIES.map((category) => _sigRenderCategory(category, summariesByComponent, gamePlanSignalStatus)).join("")}
        </main>
        <aside class="signals-detail" aria-label="Signal detail">
          ${_sigRenderDetailSkeleton(selectedSummary, selectedRecord)}
        </aside>
      </div>
    </div>
  `;
  _sigRenderRemoteClips(selectedSummary, selectedRecord, token);
}

function initSignals() {
  renderSignals();
}

function openSignalComponent(arg) {
  const summary = _sigSummaryFromArg(arg);
  if (!summary) return;
  _sigSelected = { componentType: summary.componentType, compareKey: summary.compareKey };
  if (_sigCanManage() && _sigSummaryRequiresVideo(summary)) {
    openSignalUploadModal(arg);
    return;
  }
  if (_sigShouldOpenClipDirectly() && _sigCanOpenSummaryClip(summary)) {
    _sigOpenFirstClipForSummary(summary)
      .then((opened) => {
        if (!opened) renderSignals();
      })
      .catch(() => renderSignals());
    return;
  }
  renderSignals();
}

function _sigProbeDuration(file) {
  return new Promise((resolve) => {
    let settled = false;
    const objectUrl = URL.createObjectURL(file);
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try { URL.revokeObjectURL(objectUrl); } catch (_err) { }
      resolve(value);
    };
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration : 0);
    video.onerror = () => finish(0);
    setTimeout(() => finish(0), 5000);
    video.src = objectUrl;
  });
}

async function uploadSelectedSignalClip(event) {
  if (!_sigCanManage()) return;
  const file = event?.target?.files?.[0];
  if (event?.target) event.target.value = "";
  if (!file || !_sigSelected) return;
  const summary = _sigFindSummary(_sigSelected.componentType, _sigSelected.compareKey);
  if (!summary) return;
  openSignalUploadReviewModal(file);
}

function saveSignalDetails() {
  if (!_sigCanManage() || !_sigSelected) return;
  const summary = _sigFindSummary(_sigSelected.componentType, _sigSelected.compareKey);
  if (!summary) return;
  _sigUpsertRecord(summary, {
    visibility: document.getElementById("signalVisibility")?.value || "published",
    notes: document.getElementById("signalNotes")?.value || "",
  });
  if (typeof recordPlayerPublishStatus === "function") {
    recordPlayerPublishStatus("signals", {
      label: `Signal details updated: ${summary.displayValue}`,
    });
  }
  showToast("Signal details saved", { type: "success", duration: 1800 });
  renderSignals();
}

async function deleteSignalClip(clipId) {
  if (!_sigCanManage() || !_sigSelected || !clipId) return;
  const summary = _sigFindSummary(_sigSelected.componentType, _sigSelected.compareKey);
  if (!summary) return;
  const ok = await showConfirm(`Delete the signal clip for ${escapeHtml(summary.displayValue)}?`, {
    title: "Delete Signal Clip",
    icon: "🎬",
    confirmText: "Delete Clip",
    danger: true,
  });
  if (!ok) return;
  try {
    const sig = _sigClipKey(summary.componentType, summary.compareKey);
    const data = await window.playClips.removeForSig(sig, clipId, { publishType: "signals" });
    const remaining = Array.isArray(data.clips) ? data.clips.length : 0;
    if (remaining) {
      _sigUpsertRecord(summary, { clipCount: remaining });
    } else {
      _sigDeleteRecordIfEmpty(_sigRecordId(summary.componentType, summary.compareKey), remaining);
    }
    showToast("Signal clip deleted", { type: "success", duration: 1800 });
    renderSignals();
  } catch (err) {
    showToast(err?.message || "Could not delete signal clip.", { type: "error", duration: 3500 });
  }
}

// Admin-only pass: re-encode every stored signal clip through the current
// downscale + bitrate caps so clips uploaded before the resolution cap shrink
// to the same fast, player-phone-friendly size as new uploads. Runs in this
// tab (MediaRecorder re-encodes in real time), skips already-small clips, and
// replaces each clip in place via the signals replace-only manifest.
async function recompressSignalClips() {
  if (!_sigCanManage()) return;
  if (!window.playClips || typeof window.playClips.recompressAllClips !== "function") {
    showToast("Clip tools are unavailable right now.", { type: "error" });
    return;
  }
  const records = _sigLoadRecords().filter((record) => Number(record.clipCount || 0) > 0);
  if (!records.length) {
    showModal("There are no signal clips to optimize yet.", {
      title: "Optimize Clips",
      icon: "🎬",
    });
    return;
  }
  const proceed = await showConfirm(
    `Optimize ${records.length} signal clip${records.length === 1 ? "" : "s"}? Each clip is ` +
    "re-encoded in this tab in real time (about its own length), so this can take a few minutes. " +
    "Clips that are already small are skipped automatically — keep this tab open until it finishes.",
    { title: "Optimize Signal Clips", icon: "🎬", confirmText: "Start", cancelText: "Not now" },
  );
  if (!proceed) return;

  const btn = document.getElementById("sigRecompressBtn");
  const setBtn = (text, disabled) => {
    if (!btn) return;
    btn.textContent = text;
    btn.disabled = Boolean(disabled);
  };
  setBtn("Optimizing…", true);

  let result;
  try {
    result = await window.playClips.recompressAllClips({
      kind: "signals",
      onProgress: (p) => setBtn(`Optimizing ${p.processedSigs}/${p.totalSigs}…`, true),
    });
  } catch (err) {
    setBtn("Optimize Clips", false);
    showToast(err?.message || "Could not optimize clips.", { type: "error", duration: 3500 });
    return;
  }

  setBtn("Optimize Clips", false);
  const savedMb = (result.bytesSaved / (1024 * 1024)).toFixed(1);
  const summary = result.recompressed
    ? `Optimized ${result.recompressed} clip${result.recompressed === 1 ? "" : "s"} and saved about ${savedMb} MB. ${result.skipped} already small, ${result.failed} failed.`
    : `Nothing to shrink — ${result.skipped} clip${result.skipped === 1 ? " was" : "s were"} already small, ${result.failed} failed.`;
  showModal(summary, { title: "Clips Optimized", icon: "✅" });
  renderSignals();
}

function resolveSignalsForPlay(play, options = {}) {
  if (!play) return {};
  const opts = options && typeof options === "object" ? options : {};
  const includeDraft = opts.includeDraft === true && _sigCanManage();
  const categoryFilter = new Set(
    (Array.isArray(opts.categories) ? opts.categories : [])
      .map((category) => String(category || "").trim().toUpperCase())
      .filter(Boolean),
  );
  const records = _sigRecordsMap();
  const result = {};
  const seen = new Set();
  SIGNAL_CATEGORIES.forEach((category) => {
    result[category.id] = [];
  });
  SIGNAL_COMPONENTS.forEach((component) => {
    component.fields.forEach((field) => {
      const value = String(play[field] == null ? "" : play[field]).trim();
      if (!value) return;
      const compareKey = _sigCompareValue(value);
      const dedupeKey = `${component.componentType}:${compareKey}`;
      if (seen.has(dedupeKey)) return;
      if (categoryFilter.size && !categoryFilter.has(String(component.category || "").toUpperCase())) return;
      const record = records.get(_sigRecordId(component.componentType, compareKey));
      if (!record || record.clipCount <= 0) return;
      if (record.visibility !== "published" && !includeDraft) return;
      seen.add(dedupeKey);
      result[component.category].push({
        ...record,
        label: component.label,
        field,
        value,
      });
    });
  });
  return result;
}

function _sigFlattenPlayGroups(groups) {
  const records = [];
  SIGNAL_CATEGORIES.forEach((category) => {
    (groups?.[category.id] || []).forEach((record) => {
      records.push({ ...record, groupLabel: category.label });
    });
  });
  return records;
}

function getSignalCountForPlay(play) {
  return _sigFlattenPlayGroups(resolveSignalsForPlay(play)).length;
}

function getSignalAvailabilityForPlay(play) {
  const groups = resolveSignalsForPlay(play);
  const categories = SIGNAL_CATEGORIES.map((category) => {
    const items = groups[category.id] || [];
    return {
      ...category,
      items,
      count: items.length,
    };
  }).filter((category) => category.count > 0);
  return {
    total: categories.reduce((sum, category) => sum + category.count, 0),
    categories,
  };
}

function renderSignalAvailabilityForPlay(play, options = {}) {
  const availability = getSignalAvailabilityForPlay(play);
  if (!availability.total) return "";
  const className = options.className ? ` ${escapeAttr(options.className)}` : "";
  const title = String(options.title || "Signals available").trim();
  const buttonLabel = String(options.buttonLabel || `Watch ${availability.total}`).trim();
  const action = String(options.action || "").trim();
  const argAttr =
    Object.prototype.hasOwnProperty.call(options, "arg") && options.arg != null
      ? ` data-arg="${escapeAttr(options.arg)}"`
      : "";
  const actionButton = action
    ? `<button type="button" class="signal-availability-action" data-action="${escapeAttr(action)}"${argAttr}>${escapeHtml(buttonLabel)}</button>`
    : "";
  const groups = availability.categories
    .map((category) => {
      const labels = category.items
        .slice(0, 3)
        .map(_sigSelectorRecordLabel)
        .filter(Boolean)
        .join(", ");
      const more = category.items.length > 3 ? ` +${category.items.length - 3}` : "";
      return `
        <span class="signal-availability-group">
          <strong>${escapeHtml(category.label)}</strong>
          <em>${category.count}</em>
          <small>${escapeHtml(labels)}${escapeHtml(more)}</small>
        </span>`;
    })
    .join("");

  return `
    <section class="signal-availability${className}" aria-label="Signals available for this play">
      <div class="signal-availability-head">
        <div>
          <span>${escapeHtml(title)}</span>
          <strong>${availability.total} clip${availability.total === 1 ? "" : "s"}</strong>
        </div>
        ${actionButton}
      </div>
      <div class="signal-availability-groups">${groups}</div>
    </section>`;
}

function _sigPlayLabel(play) {
  if (typeof getPlayPresentationPlayLabel === "function") {
    return getPlayPresentationPlayLabel(play);
  }
  return [play?.formation, play?.protection, play?.play].filter(Boolean).join(" ") || "Play";
}

function _sigSelectorRecordLabel(record) {
  return String(record?.value || record?.componentValue || record?.compareKey || "Signal").trim();
}

function _sigRecordToQuizPlay(record) {
  const component = _sigComponentByType(record?.componentType);
  return {
    type: "Signal",
    personnel: record?.category || "",
    formation: component?.label || record?.componentType || "Signal",
    play: _sigSelectorRecordLabel(record),
    notes: record?.notes || "",
  };
}

// Distractor answer values for a signal quiz question. Returns display-value
// strings of the SAME component type (e.g. other formations for a formation
// question) so multiple-choice answers stay believable. Unlike the quiz item
// pool this intentionally includes signals that have no filmed clip yet, giving
// quizzes a much larger, same-category set of wrong answers to choose from.
function getSignalDistractorValues(componentType, excludeCompareKey, options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const type = String(componentType || "").trim();
  if (!type) return [];
  const exclude = String(excludeCompareKey || "").trim().toLowerCase();
  const includeDraft = opts.includeDraft === true && _sigCanManage();
  const limit = Number.isFinite(opts.limit) ? Math.max(0, Math.floor(opts.limit)) : 24;
  const seen = new Set();
  const values = [];
  for (const record of _sigLoadRecords()) {
    if (record.componentType !== type) continue;
    if (record.visibility !== "published" && !includeDraft) continue;
    if (exclude && String(record.compareKey || "").toLowerCase() === exclude) continue;
    const label = _sigSelectorRecordLabel(record);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    values.push(label);
    if (limit && values.length >= limit) break;
  }
  return values;
}

async function getSignalQuizItems(options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const categoryFilter = new Set(
    (Array.isArray(opts.categories) ? opts.categories : [])
      .map((category) => String(category || "").trim().toUpperCase())
      .filter(Boolean),
  );
  const records = _sigLoadRecords()
    .filter((record) => Number(record.clipCount || 0) > 0)
    .filter((record) => record.visibility === "published" || (opts.includeDraft === true && _sigCanManage()))
    .filter((record) => _sigComponentRequiresVideo(record.componentType))
    .filter((record) => !categoryFilter.size || categoryFilter.has(String(record.category || "").toUpperCase()));
  let clipMap = null;
  if (window.playClips && typeof window.playClips.listForSigs === "function") {
    try {
      clipMap = await window.playClips.listForSigs(records.map((record) => record.clipKey));
    } catch (_err) {
      clipMap = null;
    }
  }
  const items = [];
  for (const record of records) {
    const component = _sigComponentByType(record.componentType);
    const category = SIGNAL_CATEGORIES.find((item) => item.id === record.category);
    let clip = null;
    if (clipMap) {
      clip = _sigNormalizeClipList(clipMap[record.clipKey])[0] || null;
    } else if (window.playClips && typeof window.playClips.listForSig === "function") {
      try {
        clip = _sigNormalizeClipList(await window.playClips.listForSig(record.clipKey))[0] || null;
      } catch (_err) {
        clip = null;
      }
    }
    if (opts.requireClip !== false && !clip?.url) continue;
    const value = _sigSelectorRecordLabel(record);
    items.push({
      play: _sigRecordToQuizPlay(record),
      period: category?.label || record.category || "Signals",
      scriptIndex: items.length,
      sourceBox: "signals",
      signalRecord: {
        ...record,
        label: component?.label || record.componentType || "Signal",
        groupLabel: category?.label || record.category || "Signals",
        value,
        clipUrl: clip?.url || "",
        clipId: clip?.id || "",
        clipSig: record.clipKey,
        answerLabel: value,
      },
    });
  }
  return items;
}

function getSignalQuizStats(options = {}) {
  const opts = options && typeof options === "object" ? options : {};
  const categoryFilter = new Set(
    (Array.isArray(opts.categories) ? opts.categories : [])
      .map((category) => String(category || "").trim().toUpperCase())
      .filter(Boolean),
  );
  const records = _sigLoadRecords()
    .filter((record) => Number(record.clipCount || 0) > 0)
    .filter((record) => record.visibility === "published" || (opts.includeDraft === true && _sigCanManage()))
    .filter((record) => _sigComponentRequiresVideo(record.componentType))
    .filter((record) => !categoryFilter.size || categoryFilter.has(String(record.category || "").toUpperCase()));
  const byCategory = SIGNAL_CATEGORIES.map((category) => ({
    ...category,
    count: records.filter((record) => record.category === category.id).length,
  }));
  return {
    total: records.length,
    categories: byCategory,
  };
}

let _sigClipObserver = null;

function _sigActivateLoopVideo(video) {
  video.controls = false;
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.disablePictureInPicture = true;
  video.removeAttribute("controls");
  video.setAttribute("autoplay", "");
  video.setAttribute("loop", "");
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("preload", "auto");
  video.setAttribute("disablepictureinpicture", "");
  video.setAttribute("controlslist", "nodownload noplaybackrate noremoteplayback");
  const attemptPlay = () => {
    const playPromise = typeof video.play === "function" ? video.play() : null;
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => { });
    }
  };
  if (!video.dataset.signalPreviewBound) {
    video.dataset.signalPreviewBound = "true";
    video.addEventListener("loadeddata", attemptPlay);
    video.addEventListener("canplay", attemptPlay);
  }
  if (video.readyState === 0 && video.currentSrc) {
    try { video.load(); } catch (_err) { }
  }
  attemptPlay();
}

function _sigDeactivateLoopVideo(video) {
  try { video.pause(); } catch (_e) { /* ignore */ }
  // Stop buffering an off-screen preview; keeps the shown first frame.
  video.preload = "metadata";
  video.setAttribute("preload", "metadata");
}

function _sigConfigureLoopVideos(root = document) {
  const nodes = root.querySelectorAll?.(".signals-play-video, .signals-clip video, .signals-clip-modal-video, .signals-upload-review-video");
  if (!nodes) return;
  // Grid previews (.signals-clip) are gated behind an IntersectionObserver so
  // only on-screen looping clips download/play — a component can list several,
  // and eager autoplay+preload downloads them all at once on phones/tablets.
  // Single videos (clip modal / selector preview / upload review) play now.
  if (_sigClipObserver) _sigClipObserver.disconnect();
  _sigClipObserver =
    typeof IntersectionObserver === "function"
      ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) _sigActivateLoopVideo(entry.target);
            else _sigDeactivateLoopVideo(entry.target);
          });
        },
        { rootMargin: "200px" },
      )
      : null;
  nodes.forEach((video) => {
    if (video.closest(".signals-clip") && _sigClipObserver) {
      _sigClipObserver.observe(video);
    } else {
      _sigActivateLoopVideo(video);
    }
  });
}

function _sigRenderSelectorPreview(content) {
  const preview = document.getElementById("signalsPlayPreview");
  if (preview) {
    preview.innerHTML = sanitizeHTML(content);
    _sigConfigureLoopVideos(preview);
  }
}

function _sigRenderSelectorShell(play, groups, records, sourceLabel) {
  const playLabel = _sigPlayLabel(play);
  const grouped = SIGNAL_CATEGORIES.map((category) => {
    const items = groups[category.id] || [];
    if (!items.length) return "";
    const chips = items
      .map((record) => `
        <button type="button" class="signals-play-chip" data-action="openSignalClip" data-arg="${escapeHtml(record.id)}">
          <span>${escapeHtml(_sigSelectorRecordLabel(record))}</span>
          <small>${escapeHtml(record.label || record.componentType || "Signal")}</small>
        </button>`)
      .join("");
    return `
      <section class="signals-play-group" aria-label="${escapeHtml(category.label)} signals">
        <h4>${escapeHtml(category.label)}</h4>
        <div class="signals-play-chip-grid">${chips}</div>
      </section>`;
  }).join("");

  return `
    <div id="signalSelectorOverlay" class="signals-play-overlay" data-action="closeSignalSelectorOverlay" role="dialog" aria-modal="true" aria-labelledby="signalsPlayTitle">
      <div class="signals-play-dialog">
        <header class="signals-play-header">
          <div>
            <span class="signals-play-kicker">${escapeHtml(sourceLabel || "Play Signals")}</span>
            <h3 id="signalsPlayTitle">${escapeHtml(playLabel)}</h3>
          </div>
          <button type="button" class="signals-play-close" data-action="closeSignalSelector" aria-label="Close signals">&times;</button>
        </header>
        <div class="signals-play-layout">
          <div class="signals-play-list" aria-label="Signals for this play">
            ${grouped}
          </div>
          <div id="signalsPlayPreview" class="signals-play-preview">
            <div class="signals-play-empty">
              <strong>${records.length} signal${records.length === 1 ? "" : "s"} available</strong>
              <span>Select a component to watch its signal.</span>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function openSignalSelectorForPlay(play, options = {}) {
  const groups = resolveSignalsForPlay(play);
  const records = _sigFlattenPlayGroups(groups);
  if (!records.length) {
    showToast("No published signal clips are attached to this play yet.", {
      type: "info",
      duration: 2200,
    });
    return;
  }
  closeSignalSelector();
  _sigSelectorState = {
    play,
    groups,
    records,
    token: 0,
    selectedId: "",
  };
  const wrapper = document.createElement("div");
  wrapper.innerHTML = sanitizeHTML(
    _sigRenderSelectorShell(play, groups, records, options.sourceLabel),
  );
  document.body.appendChild(wrapper.firstElementChild);
  if (typeof trapFocus === "function") {
    trapFocus(document.getElementById("signalSelectorOverlay"));
  }
  openSignalClip(records[0].id);
}

function closeSignalSelector() {
  const overlay = document.getElementById("signalSelectorOverlay");
  if (overlay) overlay.remove();
  _sigSelectorState = null;
}

async function openSignalClip(recordId) {
  if (!_sigSelectorState) return;
  const record = _sigSelectorState.records.find((item) => item.id === recordId);
  if (!record) return;
  _sigSelectorState.selectedId = recordId;
  _sigSelectorState.token += 1;
  const token = _sigSelectorState.token;
  document.querySelectorAll(".signals-play-chip").forEach((button) => {
    button.classList.toggle("active", button.dataset.arg === recordId);
  });
  _sigRenderSelectorPreview(`
    <div class="signals-play-empty">
      <strong>${escapeHtml(_sigSelectorRecordLabel(record))}</strong>
      <span>Loading signal clip...</span>
    </div>`);

  try {
    if (!window.playClips || typeof window.playClips.listForSig !== "function") {
      throw new Error("Signal video storage is not available.");
    }
    const data = await window.playClips.listForSig(record.clipKey);
    if (!_sigSelectorState || token !== _sigSelectorState.token) return;
    const clips = _sigNormalizeClipList(data);
    const clip = clips[0];
    if (!clip?.url) {
      _sigRenderSelectorPreview(`
        <div class="signals-play-empty">
          <strong>${escapeHtml(_sigSelectorRecordLabel(record))}</strong>
          <span>This signal record has no playable clip right now.</span>
        </div>`);
      return;
    }
    const notes = String(record.notes || "").trim();
    _sigRenderSelectorPreview(`
      <div class="signals-play-video-shell">
        <video class="signals-play-video" src="${escapeHtml(clip.url)}" autoplay loop muted playsinline preload="auto" disablepictureinpicture controlslist="nodownload noplaybackrate noremoteplayback"></video>
        <div class="signals-play-video-meta">
          <strong>${escapeHtml(_sigSelectorRecordLabel(record))}</strong>
          <span>${escapeHtml(record.label || record.componentType || "Signal")}</span>
          ${notes ? `<p>${escapeHtml(notes)}</p>` : ""}
        </div>
      </div>`);
  } catch (err) {
    if (!_sigSelectorState || token !== _sigSelectorState.token) return;
    _sigRenderSelectorPreview(`
      <div class="signals-play-empty signals-play-empty--error">
        <strong>${escapeHtml(_sigSelectorRecordLabel(record))}</strong>
        <span>${escapeHtml(err?.message || "Could not load this signal clip.")}</span>
      </div>`);
  }
}

function openPlaybookSignalSelector(idx) {
  const playIdx = Number.parseInt(idx, 10);
  const source =
    typeof filteredPlays !== "undefined" && Array.isArray(filteredPlays)
      ? filteredPlays
      : typeof plays !== "undefined"
        ? plays
        : [];
  const play = Number.isFinite(playIdx) ? source[playIdx] : null;
  if (!play) return;
  openSignalSelectorForPlay(play, { sourceLabel: "Playbook Signals" });
}

function openScriptSignalSelector(idx) {
  const scriptIdx = Number.parseInt(idx, 10);
  const play = Number.isFinite(scriptIdx) ? script?.[scriptIdx] : null;
  if (!play || play.isSeparator) return;
  openSignalSelectorForPlay(play, { sourceLabel: "Script Signals" });
}

window.SIGNAL_CATEGORIES = SIGNAL_CATEGORIES;
window.SIGNAL_COMPONENTS = SIGNAL_COMPONENTS;
window.initSignals = initSignals;
window.renderSignals = renderSignals;
window.openSignalComponent = openSignalComponent;
window.openSignalUploadModal = openSignalUploadModal;
window.closeSignalUploadModal = closeSignalUploadModal;
window.closeSignalUploadReviewModal = closeSignalUploadReviewModal;
window.processSignalUploadReview = processSignalUploadReview;
window.resetSignalUploadReview = resetSignalUploadReview;
window.confirmSignalReviewedUpload = confirmSignalReviewedUpload;
window.openSignalComponentDetails = openSignalComponentDetails;
window.watchSignalUploadModalClip = watchSignalUploadModalClip;
window.openSignalClipModal = openSignalClipModal;
window.closeSignalClipModal = closeSignalClipModal;
window.uploadSelectedSignalClip = uploadSelectedSignalClip;
window.saveSignalDetails = saveSignalDetails;
window.deleteSignalClip = deleteSignalClip;
window.resolveSignalsForPlay = resolveSignalsForPlay;
window.getSignalCountForPlay = getSignalCountForPlay;
window.getSignalAvailabilityForPlay = getSignalAvailabilityForPlay;
window.renderSignalAvailabilityForPlay = renderSignalAvailabilityForPlay;
window.openSignalSelectorForPlay = openSignalSelectorForPlay;
window.openPlaybookSignalSelector = openPlaybookSignalSelector;
window.openScriptSignalSelector = openScriptSignalSelector;
window.getSignalQuizItems = getSignalQuizItems;
window.getSignalQuizStats = getSignalQuizStats;

window.addEventListener("play-clips-changed", (event) => {
  const sig = String(event?.detail?.sig || "");
  if (sig.startsWith("signals/") && document.getElementById("signals")?.classList.contains("active")) {
    renderSignals();
  }
});

// A connection can drop after the coach has selected a signal.  The durable
// outbox owns the blob until it reaches R2, then this event creates the
// corresponding published signal record.  That keeps player readiness honest:
// queued clips do not look published, and completed clips immediately do.
window.addEventListener("play-clip-uploaded", (event) => {
  const detail = event?.detail || {};
  const signal = detail.metadata?.signal;
  if (!signal?.componentType || !signal?.compareKey) return;
  const summary = _sigFindSummary(signal.componentType, signal.compareKey);
  if (!summary) return;
  _sigUpsertRecord(summary, {
    clipCount: 1,
    durationMs: Number(detail.clip?.duration || 0) * 1000,
    visibility: "published",
    notes: summary.record?.notes || "",
  });
  if (typeof recordPlayerPublishStatus === "function") {
    recordPlayerPublishStatus("signals", { label: `Signal uploaded: ${summary.displayValue}` });
  }
  if (document.getElementById("signals")?.classList.contains("active")) renderSignals();
});

_sigScheduleManifestReconciliation();
