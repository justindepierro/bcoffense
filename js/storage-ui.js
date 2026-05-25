function createStorageProgressReporter(label) {
  let lastUpdate = 0;
  return (done, total) => {
    if (!total) return;
    const now = Date.now();
    if (done < total && now - lastUpdate < 600) return;
    lastUpdate = now;
    showToast(`${label}: ${done}/${total}`, {
      duration: done >= total ? 1200 : 1800,
    });
  };
}

async function exportCompleteBackup() {
  const backup = storageManager.getAllData();
  let imageCount = 0;
  let imageWarning = "";

  if (window.playImages && typeof window.playImages.exportAll === "function") {
    try {
      showToast("Preparing complete backup...", { duration: 1200 });
      const imageMap = await window.playImages.exportAll({
        onProgress: createStorageProgressReporter("Exporting play images"),
      });
      backup.playImages = imageMap;
      imageCount = Object.keys(imageMap).length;
    } catch (err) {
      console.warn("Image backup export failed:", err);
      imageWarning = "\nImages could not be included in this backup.";
    }
  }

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;

  const date = new Date().toISOString().split("T")[0];
  a.download = `playbook-complete-backup-${date}.json`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const info = storageManager.getStorageInfo();
  const backupSize = storageManager.formatBytes(blob.size);
  showModal(
    `Complete backup exported!\n\nBackup size: ${backupSize}\nItems saved: ${info.itemCount}${imageCount ? `\nImages saved: ${imageCount}` : ""}${imageWarning}`,
    { title: "Backup Complete", icon: "✅" },
  );
}

function importCompleteBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const backup = safeJSONParse(e.target.result, null);
      if (!backup) throw new Error("Invalid JSON");
      const validation = storageManager.validateBackup(backup);
      if (!validation.valid) {
        throw new Error(validation.errors.join(" "));
      }

      if (await storageManager.restoreAllData(backup)) {
        let restoredImages = 0;
        let imageWarning = "";
        if (Object.prototype.hasOwnProperty.call(backup, "playImages")) {
          if (window.playImages && typeof window.playImages.importAll === "function") {
            try {
              restoredImages = await window.playImages.importAll(backup.playImages || {}, {
                replace: true,
                onProgress: createStorageProgressReporter("Restoring play images"),
              });
            } catch (err) {
              console.warn("Image backup import failed:", err);
              imageWarning = "\nPlay images could not be restored.";
            }
          } else {
            imageWarning = "\nPlay image storage is not available in this browser.";
          }
        }
        reloadAppFromStorage();
        await showModal(`Backup restored successfully!${restoredImages ? `\nImages restored: ${restoredImages}` : ""}${imageWarning}\nRefreshing...`, {
          title: "Restored",
          icon: "✅",
        });
        location.reload();
      }
    } catch (err) {
      await showModal("Error reading backup file: " + err.message, {
        title: "Import Error",
        icon: "❌",
      });
    }
  };
  reader.readAsText(file);

  event.target.value = "";
}

async function showStorageInfo() {
  const info = storageManager.getStorageInfo();
  let imageStats = null;
  if (window.playImages && typeof window.playImages.stats === "function") {
    try {
      imageStats = await window.playImages.stats();
    } catch (err) {
      console.warn("Image storage stats failed:", err);
    }
  }

  const friendlyNames = {
    playbook: "Playbook",
    savedScripts: "Saved Scripts",
    savedWristbands: "Saved Wristbands",
    sortPresets: "Sort Presets",
    customSortOrders: "Custom Sort Orders",
    scriptCustomSortOrders: "Script Sort Orders",
    periodTemplates: "Period Templates",
    scriptTemplates: "Script Templates",
    callSheet: "Call Sheet",
    callSheetSettings: "Call Sheet Settings",
    columnVisibility: "Column Visibility",
    playbookState: "Playbook Filter State",
    scriptDisplayOptions: "Script Display Options",
    scriptDraft: "Script Autosave Draft",
    wristbandDraft: "Wristband Autosave Draft",
    gamePlanTemplates: "Game Plan Templates",
  };

  const counts = {};
  try {
    const playbook = storageManager.get(STORAGE_KEYS.PLAYBOOK, []);
    counts.playbook = Array.isArray(playbook) ? playbook.length : 0;

    const scripts = storageManager.get(STORAGE_KEYS.SAVED_SCRIPTS, []);
    counts.savedScripts = Array.isArray(scripts)
      ? scripts.length
      : Object.keys(scripts).length;

    const wristbands = storageManager.get(STORAGE_KEYS.SAVED_WRISTBANDS, []);
    counts.savedWristbands = Array.isArray(wristbands) ? wristbands.length : 0;

    const presets = storageManager.get(STORAGE_KEYS.SORT_PRESETS, {});
    counts.sortPresets =
      typeof presets === "object" ? Object.keys(presets).length : 0;

    const templates = storageManager.get(STORAGE_KEYS.PERIOD_TEMPLATES, []);
    counts.periodTemplates = Array.isArray(templates) ? templates.length : 0;

    const scriptTemplates = storageManager.get(STORAGE_KEYS.SCRIPT_TEMPLATES, []);
    counts.scriptTemplates = Array.isArray(scriptTemplates)
      ? scriptTemplates.length
      : 0;

    const gamePlanTemplates = storageManager.get(STORAGE_KEYS.GAME_PLAN_TEMPLATES, []);
    counts.gamePlanTemplates = Array.isArray(gamePlanTemplates)
      ? gamePlanTemplates.length
      : 0;
  } catch (e) { }

  let itemsHtml = "";
  Object.entries(info.itemSizes).forEach(([key, size]) => {
    const name = friendlyNames[key] || key;
    const sizeStr = storageManager.formatBytes(size);
    const countStr = counts[key] !== undefined ? ` (${counts[key]} items)` : "";
    itemsHtml += `<tr><td class="si-td">${escapeHtml(name)}${escapeHtml(countStr)}</td><td class="si-td si-td-right">${escapeHtml(sizeStr)}</td></tr>`;
  });
  if (imageStats && imageStats.count > 0) {
    itemsHtml += `<tr><td class="si-td">Play Images (${imageStats.count} images)</td><td class="si-td si-td-right">${escapeHtml(imageStats.totalSizeFormatted)}</td></tr>`;
  }

  const pressureClass =
    info.warningLevel === "danger"
      ? "si-pressure-danger"
      : info.warningLevel === "warning"
        ? "si-pressure-warning"
        : "si-pressure-ok";
  const pressureText =
    info.warningLevel === "danger"
      ? "Storage is almost full. Export a backup and clear old data soon."
      : info.warningLevel === "warning"
        ? "Storage is getting full. Export a backup before adding more data."
        : "Storage pressure looks normal.";

  const body = `
    <div class="si-summary">
      <strong>Total Storage Used:</strong> ${escapeHtml(info.totalSizeFormatted)}
      <div class="si-hint">Estimated localStorage budget: ${escapeHtml(info.estimatedQuotaFormatted)}</div>
      <div class="si-pressure ${pressureClass}">${escapeHtml(pressureText)}</div>
    </div>
    <table class="si-table">
      <thead><tr class="si-thead-row"><th class="si-th">Data Type</th><th class="si-th si-th-right">Size</th></tr></thead>
      <tbody>${itemsHtml || '<tr><td colspan="2" class="si-empty">No data stored</td></tr>'}</tbody>
    </table>
    <div class="si-actions">
      <button id="siExportBtn" class="btn btn-primary">📥 Export Backup</button>
      <button id="siClearBtn" class="btn btn-danger">🗑️ Clear All Data</button>
    </div>`;

  showModal(body, { title: "💾 Storage Information", confirmText: "Close" });

  setTimeout(() => {
    document
      .getElementById("siExportBtn")
      ?.addEventListener("click", () => exportBackup());
    document.getElementById("siClearBtn")?.addEventListener("click", async () => {
      const cleared = await storageManager.clearAll();
      if (cleared) location.reload();
    });
  }, 0);
}
