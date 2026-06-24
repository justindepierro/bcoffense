function computeScriptHealthIssues() {
  const issues = [];
  if (!Array.isArray(script) || script.length === 0) return issues;

  let activeSeparatorIndex = -1;
  let activePlayCount = 0;
  let seenInPeriod = null;

  const flushPeriod = () => {
    if (activeSeparatorIndex < 0) return;
    if (activePlayCount === 0) {
      const sep = script[activeSeparatorIndex];
      issues.push({
        severity: "warn",
        type: "empty-period",
        index: activeSeparatorIndex,
        label: `Empty period: ${sep.label || "Period"}`,
      });
    }
  };

  for (let i = 0; i < script.length; i++) {
    const item = script[i];
    if (item.isSeparator) {
      flushPeriod();
      activeSeparatorIndex = i;
      activePlayCount = 0;
      seenInPeriod = new Map();
      if (!item.minutes) {
        issues.push({
          severity: "info",
          type: "no-minutes",
          index: i,
          label: `${item.label || "Period"}: no minutes set`,
        });
      }
      continue;
    }
    activePlayCount += 1;

    if (!item.play && !item.formation && !item.basePlay && !item.oneWord) {
      issues.push({
        severity: "error",
        type: "incomplete",
        index: i,
        label: `Row ${i + 1}: missing play call`,
      });
    }

    if (!item.personnel) {
      issues.push({
        severity: "info",
        type: "no-personnel",
        index: i,
        label: `Row ${i + 1}: no personnel set`,
      });
    }

    const dedupeKey = `${(item.formation || "").trim().toLowerCase()}|${(item.play || "").trim().toLowerCase()}|${(item.oneWord || "").trim().toLowerCase()}`;
    if ((item.play || item.oneWord) && seenInPeriod && seenInPeriod.has(dedupeKey)) {
      issues.push({
        severity: "warn",
        type: "duplicate",
        index: i,
        label: `Row ${i + 1}: duplicate of row ${seenInPeriod.get(dedupeKey) + 1} in this period`,
      });
    } else if (seenInPeriod) {
      seenInPeriod.set(dedupeKey, i);
    }
  }
  flushPeriod();

  return issues;
}

function updateScriptHealthBadge() {
  const btn = document.getElementById("statHealthBtn");
  const valueEl = document.getElementById("statHealth");
  if (!btn || !valueEl) return;
  const issues = computeScriptHealthIssues();
  const count = issues.length;
  if (count === 0) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  valueEl.textContent = String(count);
  const hasError = issues.some((i) => i.severity === "error");
  const hasWarn = issues.some((i) => i.severity === "warn");
  btn.classList.toggle("stat-health-error", hasError);
  btn.classList.toggle("stat-health-warn", !hasError && hasWarn);
  btn.title = `${count} script health issue${count === 1 ? "" : "s"} \u2014 click to review`;
}

async function showScriptHealthIssues() {
  const issues = computeScriptHealthIssues();
  if (issues.length === 0) {
    showToast("No script health issues \u2014 looks good", { type: "success" });
    return;
  }
  const items = issues.map((issue, i) => {
    const icon =
      issue.severity === "error" ? "\u26A0\uFE0F" :
        issue.severity === "warn" ? "\u26A1" : "\u2139\uFE0F";
    return { value: i, label: `${icon} ${issue.label}` };
  });
  const choice = await showListPicker(
    `${issues.length} script health issue${issues.length === 1 ? "" : "s"}`,
    items,
    { title: "Script Health", icon: "\uD83E\uDE7A" },
  );
  if (choice == null) return;
  const issue = issues[Number(choice)];
  if (!issue || issue.index == null) return;
  const target = document.querySelector(`.script-item[data-idx="${issue.index}"], .period-header-wrapper[data-period-index="${issue.index}"]`);
  if (target && typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("script-health-flash");
    setTimeout(() => target.classList.remove("script-health-flash"), 2000);
  }
}

const SCRIPT_KEYBOARD_SHORTCUTS = [
  { keys: "1 \u2013 8", desc: "Switch tabs (Playbook, Script, Wristband, Tendencies, Call Sheet, Installation, Builder, Dashboard)" },
  { keys: "Ctrl/Cmd + Z", desc: "Undo last script change" },
  { keys: "Ctrl/Cmd + Y / Shift+Z", desc: "Redo" },
  { keys: "Ctrl/Cmd + A", desc: "Select all script rows (when focused on script)" },
  { keys: "Ctrl/Cmd + Shift + A", desc: "Clear selection" },
  { keys: "Alt + Shift + C", desc: "Collapse all periods" },
  { keys: "Alt + Shift + E", desc: "Expand all periods" },
  { keys: "Alt + Shift + P", desc: "Apply preferred fields to focused period" },
  { keys: "?", desc: "Open this shortcuts reference" },
  { keys: "Esc", desc: "Close any open overlay" },
];

function showScriptShortcutsModal() {
  if (document.getElementById("scriptShortcutsModal")) return;
  const overlay = document.createElement("div");
  overlay.className = "custom-modal-overlay visible";
  overlay.id = "scriptShortcutsModal";
  const rows = SCRIPT_KEYBOARD_SHORTCUTS
    .map((s) => `<tr><td><kbd>${escapeHtml(s.keys)}</kbd></td><td>${escapeHtml(s.desc)}</td></tr>`)
    .join("");
  // NOTE: cannot use setInnerHTML here — sanitizeHTML strips <button>, which
  // would remove the Close button. All interpolated values above are escaped.
  overlay.innerHTML = `
    <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="scriptShortcutsTitle" style="max-width:560px;">
      <div class="custom-modal-header">
        <span class="custom-modal-icon">\u2328\uFE0F</span>
        <h3 class="custom-modal-title" id="scriptShortcutsTitle">Script Keyboard Shortcuts</h3>
      </div>
      <div class="custom-modal-body">
        <table class="script-shortcuts-table">
          <thead><tr><th>Key</th><th>Action</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="custom-modal-actions">
        <button class="btn btn-primary custom-modal-btn" id="scriptShortcutsCloseBtn">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  trapFocus(overlay);
  const close = () => {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 180);
  };
  overlay.querySelector("#scriptShortcutsCloseBtn")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); close(); }
  });
  overlay.querySelector("#scriptShortcutsCloseBtn")?.focus();
}

