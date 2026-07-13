/* signals.js - Component-level signal clips for formations, tags, blocking, and motion. */

const SIGNAL_CATEGORIES = [
  { id: "CORE", label: "CORE" },
  { id: "TAGS", label: "TAGS" },
  { id: "BLOCKING", label: "BLOCKING" },
  { id: "MOTIONS", label: "MOTIONS" },
];

const SIGNAL_COMPONENTS = [
  { category: "CORE", componentType: "personnel", label: "Personnel", fields: ["personnel"] },
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

let _sigSelected = null;
let _sigLastRenderToken = 0;

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

function _sigLoadRecords() {
  const raw = storageManager.get(_sigRecordsKey(), []);
  return Array.isArray(raw) ? raw.map(_sigNormalizeRecord).filter(Boolean) : [];
}

function _sigSaveRecords(records) {
  storageManager.set(_sigRecordsKey(), records.map(_sigNormalizeRecord).filter(Boolean));
}

function _sigRecordsMap(records = _sigLoadRecords()) {
  const map = new Map();
  records.forEach((record) => map.set(record.id, record));
  return map;
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

function _sigRenderStats(visibleSummaries) {
  const records = _sigLoadRecords();
  const published = records.filter((record) => record.visibility === "published" && record.clipCount > 0).length;
  const motions = visibleSummaries.filter((item) => item.category === "MOTIONS").length;
  return `
    <div class="signals-stat"><strong>${visibleSummaries.length}</strong><span>Components</span></div>
    <div class="signals-stat"><strong>${published}</strong><span>Published</span></div>
    <div class="signals-stat"><strong>${motions}</strong><span>Motions</span></div>
  `;
}

function _sigRenderCategory(category, summariesByComponent) {
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
        const variantTitle =
          summary.variantCount > 1 ? `${summary.variantCount} spelling variants grouped` : "Canonical match";
        return `
          <button type="button" class="signals-chip${selected ? " is-selected" : ""}${hasClip ? " has-clip" : ""}"
            data-action="openSignalComponent"
            data-arg="${escapeAttr(`${summary.componentType}|${summary.compareKey}`)}"
            title="${escapeAttr(variantTitle)}">
            <span>${escapeHtml(summary.displayValue)}</span>
            <small>${summary.count}</small>
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
  const upload = manage
    ? `
      <div class="signals-upload-row">
        <input id="signalClipFile" type="file" accept="video/*" class="hidden"
          data-onchange="uploadSelectedSignalClip" data-pass="event" />
        <button type="button" class="btn btn-primary" data-action="triggerClick" data-target="signalClipFile">
          Upload Clip
        </button>
        <span class="signals-upload-hint">Max ${SIGNAL_MAX_DURATION_SEC}s</span>
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
      <div id="signalClipList" class="signals-clip-list">
        <div class="signals-clip-loading">Loading clips...</div>
      </div>
      ${editor}
    </div>
  `;
}

async function _sigRenderRemoteClips(summary, record, token) {
  const listEl = document.getElementById("signalClipList");
  if (!listEl || !summary || token !== _sigLastRenderToken) return;
  const sig = _sigClipKey(summary.componentType, summary.compareKey);
  let clips = [];
  try {
    clips =
      window.playClips && typeof window.playClips.listForSig === "function"
        ? await window.playClips.listForSig(sig)
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
  listEl.innerHTML = clips.map((clip) => {
    const meta = [
      clip.duration ? `${clip.duration}s` : "",
      clip.size ? `${(clip.size / (1024 * 1024)).toFixed(1)} MB` : "",
    ].filter(Boolean).join(" / ");
    return `
      <article class="signals-clip">
        <video controls preload="metadata" playsinline src="${escapeAttr(clip.url || "")}"></video>
        <div class="signals-clip-meta">
          <strong>${escapeHtml(clip.label || summary.displayValue)}</strong>
          <span>${escapeHtml(meta || "Signal clip")}</span>
        </div>
        ${manage ? `<button type="button" class="btn btn-sm btn-danger" data-action="deleteSignalClip" data-arg="${escapeAttr(clip.id)}">Delete</button>` : ""}
      </article>
    `;
  }).join("");
}

function renderSignals() {
  const root = document.getElementById("signalsApp");
  if (!root) return;
  const summariesByComponent = _sigSummaries();
  const visibleSummaries = _sigAllVisibleSummaries();
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
    <div class="signals-shell">
      <header class="signals-header page-header-surface">
        <div>
          <p class="signals-eyebrow">Signal Collection</p>
          <h1>Signals</h1>
        </div>
        <div class="signals-stats">${_sigRenderStats(visibleSummaries)}</div>
      </header>
      <div class="signals-layout">
        <main class="signals-category-grid" aria-label="Signal component categories">
          ${SIGNAL_CATEGORIES.map((category) => _sigRenderCategory(category, summariesByComponent)).join("")}
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
  const [componentType, compareKey] = String(arg || "").split("|");
  if (!componentType || !compareKey) return;
  _sigSelected = { componentType, compareKey };
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
  try {
    if (!String(file.type || "").toLowerCase().startsWith("video/")) {
      throw new Error("Choose a video file.");
    }
    const duration = await _sigProbeDuration(file);
    if (duration && duration > SIGNAL_MAX_DURATION_SEC) {
      throw new Error(`Signal clips must be ${SIGNAL_MAX_DURATION_SEC}s or shorter.`);
    }
    const sig = _sigClipKey(summary.componentType, summary.compareKey);
    const label = `${summary.componentLabel}: ${summary.displayValue}`;
    const result = await window.playClips.uploadForSig(sig, file, label, {
      maxDurationSec: SIGNAL_MAX_DURATION_SEC,
      durationGraceSec: 0,
      publishType: "signals",
    });
    _sigUpsertRecord(summary, {
      clipCount: Math.max(1, Number(summary.record?.clipCount || 0) + 1),
      durationMs: duration ? Math.round(duration * 1000) : Number(result.clip?.duration || 0) * 1000,
      visibility: document.getElementById("signalVisibility")?.value || "published",
      notes: document.getElementById("signalNotes")?.value || summary.record?.notes || "",
    });
    if (typeof recordPlayerPublishStatus === "function") {
      recordPlayerPublishStatus("signals", {
        label: `Signal uploaded: ${summary.displayValue}`,
      });
    }
    showToast("Signal clip uploaded", { type: "success", duration: 2200 });
    renderSignals();
  } catch (err) {
    showToast(err?.message || "Signal upload failed.", { type: "error", duration: 4000 });
  }
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

function resolveSignalsForPlay(play) {
  if (!play) return {};
  const records = _sigRecordsMap();
  const result = {};
  SIGNAL_CATEGORIES.forEach((category) => {
    result[category.id] = [];
  });
  SIGNAL_COMPONENTS.forEach((component) => {
    component.fields.forEach((field) => {
      const value = String(play[field] == null ? "" : play[field]).trim();
      if (!value) return;
      const compareKey = _sigCompareValue(value);
      const record = records.get(_sigRecordId(component.componentType, compareKey));
      if (!record || record.visibility !== "published" || record.clipCount <= 0) return;
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

window.SIGNAL_CATEGORIES = SIGNAL_CATEGORIES;
window.SIGNAL_COMPONENTS = SIGNAL_COMPONENTS;
window.initSignals = initSignals;
window.renderSignals = renderSignals;
window.openSignalComponent = openSignalComponent;
window.uploadSelectedSignalClip = uploadSelectedSignalClip;
window.saveSignalDetails = saveSignalDetails;
window.deleteSignalClip = deleteSignalClip;
window.resolveSignalsForPlay = resolveSignalsForPlay;

window.addEventListener("play-clips-changed", (event) => {
  const sig = String(event?.detail?.sig || "");
  if (sig.startsWith("signals/") && document.getElementById("signals")?.classList.contains("active")) {
    renderSignals();
  }
});
