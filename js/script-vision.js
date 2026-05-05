// ============================================================
// SCRIPT VISION PANEL — practice rep distribution by Picture
//
// Visible only when Vision Mode is ON. Shows the % of plays in
// the current script[] grouped by the Four Pictures, vs. the
// VISION_2026.repDistribution.byPicture targets.
// ============================================================

(function _injectScriptVisionPanel() {
  document.addEventListener("DOMContentLoaded", () => {
    const scriptPanel = document.getElementById("script");
    if (!scriptPanel) return;
    if (document.getElementById("visionRepPanel")) return;
    const panel = document.createElement("div");
    panel.id = "visionRepPanel";
    panel.className = "vision-rep-panel hidden";
    panel.setAttribute("aria-live", "polite");
    // Insert just after the script-header-panel
    const header = scriptPanel.querySelector(".script-header-panel");
    if (header && header.parentNode) {
      header.parentNode.insertBefore(panel, header.nextSibling);
    } else {
      scriptPanel.insertBefore(panel, scriptPanel.firstChild);
    }
  });
})();

// Map a play to one of the four pictures using familyMap entries that
// carry a `picture` tag (added by vision-mode familyMap extension).
function _scriptPictureOf(play) {
  if (typeof _activeFamilyMap !== "function") return null;
  const text = [play.play, play.basePlay, play.playTag1, play.playTag2, play.formation, play.notes]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const map = _activeFamilyMap();
  for (const e of map) {
    if (!e.picture) continue;
    if (e.keywords.some((kw) => text.includes(kw))) return e.picture;
  }
  return null;
}

function renderScriptVisionPanel() {
  const panel = document.getElementById("visionRepPanel");
  if (!panel) return;
  const on = typeof isVisionMode === "function" && isVisionMode();
  if (!on || typeof VISION_2026 === "undefined") {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }
  const list = Array.isArray(window.script) ? window.script : [];
  const total = list.length;
  if (total === 0) {
    panel.classList.remove("hidden");
    panel.innerHTML = `
      <div class="vrp-shell">
        <div class="vrp-title">🎯 Vision Pulse</div>
        <div class="vrp-empty">Add plays to see Picture distribution vs. 2026 targets.</div>
      </div>`;
    return;
  }
  const targets = VISION_2026.repDistribution?.byPicture || {};
  const labels = {
    wideZone: "Wide Zone",
    pullers: "Pullers/Counter",
    downhill: "Downhill/ISO",
    antiFront: "Anti-front",
  };
  const counts = { wideZone: 0, pullers: 0, downhill: 0, antiFront: 0, _other: 0 };
  list.forEach((p) => {
    const pic = _scriptPictureOf(p);
    if (pic && counts[pic] !== undefined) counts[pic]++;
    else counts._other++;
  });
  const rowsHtml = Object.keys(labels)
    .map((key) => {
      const cnt = counts[key];
      const pct = total ? Math.round((cnt / total) * 100) : 0;
      const target = Math.round(((targets[key] ?? 0) || 0) * 100);
      const drift = pct - target;
      let driftHtml = "";
      if (target > 0) {
        const cls =
          Math.abs(drift) <= 5
            ? "vrp-ok"
            : Math.abs(drift) <= 12
              ? "vrp-warn"
              : "vrp-err";
        driftHtml = `<span class="vrp-drift ${cls}">${drift > 0 ? "+" : ""}${drift}%</span>`;
      }
      const fillPct = Math.min(100, pct);
      const targetPct = Math.min(100, target);
      return `
        <div class="vrp-row" title="${cnt} of ${total} plays">
          <div class="vrp-row-label">${labels[key]}</div>
          <div class="vrp-bar">
            <div class="vrp-bar-fill" style="width:${fillPct}%"></div>
            ${target > 0 ? `<div class="vrp-bar-target" style="left:${targetPct}%"></div>` : ""}
          </div>
          <div class="vrp-row-stats">
            <span class="vrp-pct">${pct}%</span>
            <span class="vrp-count">${cnt}/${total}</span>
            ${driftHtml}
          </div>
        </div>`;
    })
    .join("");
  const otherPct = total ? Math.round((counts._other / total) * 100) : 0;
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div class="vrp-shell">
      <div class="vrp-title">
        🎯 Vision Pulse
        <span class="vrp-sub">${total} plays · target reps by Picture</span>
      </div>
      <div class="vrp-rows">${rowsHtml}</div>
      ${counts._other ? `<div class="vrp-foot">Unclassified: ${counts._other} (${otherPct}%) — tag with a picture concept (Worm/Wolf, Rebel, Hulk, Toledo, etc.)</div>` : ""}
    </div>`;
}

// Hook into script renders + vision toggle + tab show
document.addEventListener("visionmodechange", renderScriptVisionPanel);
document.addEventListener("DOMContentLoaded", () => {
  // Patch renderScript to also refresh the panel after each render
  if (typeof window.renderScript === "function" && !window._renderScriptVisionWrapped) {
    const _orig = window.renderScript;
    window.renderScript = function _renderScriptWithVision() {
      const out = _orig.apply(this, arguments);
      try {
        renderScriptVisionPanel();
      } catch (_e) {
        /* no-op */
      }
      return out;
    };
    window._renderScriptVisionWrapped = true;
  }
  renderScriptVisionPanel();
});
