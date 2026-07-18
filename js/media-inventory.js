/* media-inventory.js - Cross-media inventory and quiz readiness audit. */

(function () {
  const MEDIA_INVENTORY_SAMPLE_LIMIT = 10;
  const MEDIA_INVENTORY_BLOB_CONCURRENCY = 6;

  function _miEscape(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[ch]));
  }

  function _miArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function _miStorageGet(key, fallback) {
    try {
      return storageManager.get(key, fallback);
    } catch (_err) {
      return fallback;
    }
  }

  function _miFormatBytes(bytes) {
    const size = Number(bytes || 0);
    if (!size) return "0 KB";
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  function _miPlayLabel(play) {
    return [
      play?.formation,
      play?.motion,
      play?.play,
      play?.playTag1,
      play?.playTag2,
    ].map((part) => String(part || "").trim()).filter(Boolean).join(" ") || "Unnamed play";
  }

  function _miPlaySignature(play) {
    if (!play || typeof play !== "object") return "";
    if (typeof getPlayIdentityKey === "function") {
      const key = getPlayIdentityKey(play, "tag");
      if (key) return String(key);
    }
    if (window.playClips && typeof window.playClips.sigForPlay === "function") {
      const key = window.playClips.sigForPlay(play);
      if (key) return String(key);
    }
    if (typeof playSignature === "function") return String(playSignature(play) || "");
    return JSON.stringify([
      play.personnel || "",
      play.formation || "",
      play.motion || "",
      play.protection || "",
      play.play || "",
      play.playTag1 || "",
      play.playTag2 || "",
    ]);
  }

  function _miIsPlayable(item) {
    return item && typeof item === "object" && !item.isSeparator;
  }

  function _miUniquePlays(playList) {
    const seen = new Set();
    const result = [];
    _miArray(playList).forEach((play) => {
      if (!_miIsPlayable(play)) return;
      const sig = _miPlaySignature(play);
      if (!sig || seen.has(sig)) return;
      seen.add(sig);
      result.push(play);
    });
    return result;
  }

  function _miGetSavedScripts() {
    if (typeof getSavedScripts === "function") return getSavedScripts();
    const raw = _miStorageGet(STORAGE_KEYS.SAVED_SCRIPTS, []);
    return _miArray(raw);
  }

  function _miGetPublishedScripts(savedScripts) {
    if (typeof getPlayerPublishedScripts === "function") return getPlayerPublishedScripts();
    return _miArray(savedScripts).filter((scriptRecord) =>
      scriptRecord?.playerVisible === true ||
      scriptRecord?.playerVisible === "true" ||
      scriptRecord?.playerVisible === 1 ||
      scriptRecord?.playerVisible === "1"
    );
  }

  function _miCurrentPlaybook() {
    return typeof plays !== "undefined" && Array.isArray(plays) ? plays : [];
  }

  function _miCollectKnownPlays(savedScripts, publishedScripts) {
    return _miUniquePlays([
      ..._miCurrentPlaybook(),
      ..._miArray(savedScripts).flatMap((scriptRecord) => _miArray(scriptRecord?.plays)),
      ..._miArray(publishedScripts).flatMap((scriptRecord) => _miArray(scriptRecord?.plays)),
    ]);
  }

  function _miCollectPlayerPlays(publishedScripts) {
    return _miUniquePlays(
      _miArray(publishedScripts).flatMap((scriptRecord) => _miArray(scriptRecord?.plays)),
    );
  }

  function _miPlayImageSigs(play) {
    const out = [];
    const push = (value) => {
      const key = String(value || "").trim();
      if (key && !out.includes(key)) out.push(key);
    };
    const imageApi = window.playImages || {};
    if (typeof imageApi.displaySignaturesForPlay === "function") {
      _miArray(imageApi.displaySignaturesForPlay(play)).forEach(push);
    }
    if (typeof imageApi.signaturesForPlay === "function") {
      _miArray(imageApi.signaturesForPlay(play)).forEach(push);
    }
    if (typeof playSignature === "function") push(playSignature(play));
    return out;
  }

  async function _miReadDiagramBlobs(keys) {
    const imageApi = window.playImages || {};
    const entries = [];
    let cursor = 0;
    async function worker() {
      while (cursor < keys.length) {
        const key = keys[cursor];
        cursor += 1;
        let blob = null;
        try {
          blob = typeof imageApi.get === "function" ? await imageApi.get(key) : null;
        } catch (_err) {
          blob = null;
        }
        entries.push({
          key,
          size: Number(blob?.size || 0),
          type: String(blob?.type || ""),
        });
      }
    }
    const workers = Math.min(MEDIA_INVENTORY_BLOB_CONCURRENCY, Math.max(1, keys.length));
    await Promise.all(Array.from({ length: workers }, worker));
    return entries.sort((a, b) => b.size - a.size);
  }

  async function _miBuildDiagramInventory(knownPlays) {
    const imageApi = window.playImages || {};
    let keys = [];
    if (typeof imageApi.loadKeys === "function") {
      try {
        keys = await imageApi.loadKeys();
      } catch (_err) {
        keys = [];
      }
    }
    keys = _miArray(keys).map((key) => String(key || "").trim()).filter(Boolean);
    const referencedKeys = new Set();
    knownPlays.forEach((play) => _miPlayImageSigs(play).forEach((sig) => referencedKeys.add(sig)));
    const entries = await _miReadDiagramBlobs(keys);
    const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    const orphanKeys = entries
      .filter((entry) => !referencedKeys.has(entry.key))
      .map((entry) => entry.key);
    return {
      keys,
      count: keys.length,
      totalBytes,
      largest: entries.slice(0, MEDIA_INVENTORY_SAMPLE_LIMIT),
      orphanKeys,
      orphanCount: orphanKeys.length,
      referencedCount: keys.length - orphanKeys.length,
    };
  }

  async function _miFetchCloudDiagramInventory() {
    if (typeof canEditUser === "function" && !canEditUser()) {
      return { available: false, reason: "Coach access is required for cloud inventory." };
    }
    try {
      const response = await fetch("/images/inventory", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        return { available: false, reason: data?.error || "Cloud diagram inventory is unavailable." };
      }
      return {
        ...data,
        available: true,
        objects: _miArray(data.objects),
      };
    } catch (_err) {
      return { available: false, reason: "Cloud diagram inventory could not be reached." };
    }
  }

  function _miLoadSignalRecords() {
    const raw = _miStorageGet(STORAGE_KEYS.SIGNALS, []);
    return _miArray(raw)
      .filter((record) => record && typeof record === "object")
      .map((record) => ({
        id: String(record.id || ""),
        componentType: String(record.componentType || ""),
        componentValue: String(record.componentValue || ""),
        compareKey: String(record.compareKey || ""),
        clipKey: String(record.clipKey || ""),
        clipCount: Number(record.clipCount || 0) || 0,
        visibility: String(record.visibility || "published"),
      }))
      .filter((record) => record.clipKey && record.visibility !== "draft");
  }

  async function _miBuildClipInventory(playerPlays, signalRecords) {
    const clipApi = window.playClips || {};
    const playSigs = playerPlays
      .map((play) => typeof clipApi.sigForPlay === "function" ? clipApi.sigForPlay(play) : "")
      .map((sig) => String(sig || "").trim())
      .filter(Boolean);
    const signalSigs = signalRecords.map((record) => record.clipKey);
    const sigs = [...new Set([...playSigs, ...signalSigs])];
    let clipMap = {};
    if (typeof clipApi.listForSigs === "function" && sigs.length) {
      try {
        clipMap = await clipApi.listForSigs(sigs);
      } catch (_err) {
        clipMap = {};
      }
    }
    const clips = [];
    Object.entries(clipMap || {}).forEach(([sig, list]) => {
      _miArray(list).forEach((clip) => {
        clips.push({
          ...clip,
          sig,
          size: Number(clip?.size || 0),
        });
      });
    });
    const totalBytes = clips.reduce((sum, clip) => sum + clip.size, 0);
    const playClipMissing = playerPlays.filter((play) => {
      const sig = typeof clipApi.sigForPlay === "function" ? clipApi.sigForPlay(play) : "";
      return sig && !_miArray(clipMap?.[sig]).length;
    });
    const signalClipMissing = signalRecords.filter((record) => !_miArray(clipMap?.[record.clipKey]).length);
    return {
      sigCount: sigs.length,
      clipCount: clips.length,
      totalBytes,
      largest: clips.sort((a, b) => b.size - a.size).slice(0, MEDIA_INVENTORY_SAMPLE_LIMIT),
      playClipMissing,
      signalRecords,
      signalClipMissing,
    };
  }

  function _miBuildQuizInventory(savedScripts, publishedScripts, playerPlays, publishReport) {
    const rows = _miArray(publishReport?.rows);
    const readinessIssues = rows.filter((row) =>
      row.diagramStatus !== "ready" || !row.hasClip
    );
    const uniquePlayerPlayCount = playerPlays.length;
    const diagramReady = rows.filter((row) => row.diagramStatus === "ready").length;
    const clipReady = rows.filter((row) => row.hasClip).length;
    const readinessPct = rows.length
      ? Math.round(((diagramReady + clipReady) / (rows.length * 2)) * 100)
      : 0;
    return {
      savedScriptCount: savedScripts.length,
      publishedScriptCount: publishedScripts.length,
      uniquePlayerPlayCount,
      readinessPct,
      readinessIssues,
      sourceCount: publishedScripts.length || savedScripts.length,
    };
  }

  async function buildMediaInventoryReport() {
    const savedScripts = _miGetSavedScripts();
    const publishedScripts = _miGetPublishedScripts(savedScripts);
    const knownPlays = _miCollectKnownPlays(savedScripts, publishedScripts);
    const playerPlays = _miCollectPlayerPlays(publishedScripts);
    const [diagramInventory, publishReport, cloudDiagrams] = await Promise.all([
      _miBuildDiagramInventory(knownPlays),
      window.playImages && typeof window.playImages.buildPlayerMediaPublishReport === "function"
        ? window.playImages.buildPlayerMediaPublishReport()
        : Promise.resolve({ publishedScripts, rows: [], counts: {} }),
      _miFetchCloudDiagramInventory(),
    ]);
    const signalRecords = _miLoadSignalRecords();
    const clipInventory = await _miBuildClipInventory(playerPlays, signalRecords);
    const quizInventory = _miBuildQuizInventory(
      savedScripts,
      publishedScripts,
      playerPlays,
      publishReport,
    );
    return {
      generatedAt: new Date().toISOString(),
      playbookPlayCount: _miCurrentPlaybook().filter(_miIsPlayable).length,
      knownPlayCount: knownPlays.length,
      playerPlayCount: playerPlays.length,
      savedScripts,
      publishedScripts,
      publishReport,
      diagrams: diagramInventory,
      cloudDiagrams,
      clips: clipInventory,
      quiz: quizInventory,
    };
  }

  function _miRenderCard(value, label) {
    return `<div class="pb-health-card"><strong>${_miEscape(value)}</strong><span>${_miEscape(label)}</span></div>`;
  }

  function _miRenderLargestFileRows(entries, emptyText) {
    const rows = _miArray(entries).map((entry) => `
      <div class="pb-publish-media-row">
        <div>
          <strong>${_miEscape(_miFormatBytes(entry.size))}</strong>
          <span>${_miEscape(entry.type || entry.contentType || entry.label || "media file")}</span>
          <small>${_miEscape(entry.key || entry.sig || entry.id || "")}</small>
        </div>
      </div>
    `).join("");
    return rows || `<div class="pb-health-empty">${_miEscape(emptyText)}</div>`;
  }

  function _miRenderPlayRows(rows, emptyText) {
    const html = _miArray(rows).slice(0, MEDIA_INVENTORY_SAMPLE_LIMIT).map((row) => {
      const play = row.play || row;
      const detail = row.detail || "";
      const source = row.source || "";
      return `
        <div class="pb-publish-media-row">
          <div>
            <strong>${_miEscape(row.label || _miPlayLabel(play))}</strong>
            <span>${_miEscape(source)}</span>
            ${detail ? `<small>${_miEscape(detail)}</small>` : ""}
          </div>
        </div>
      `;
    }).join("");
    return html || `<div class="pb-health-empty">${_miEscape(emptyText)}</div>`;
  }

  function _miRenderSignalRows(rows, emptyText) {
    const html = _miArray(rows).slice(0, MEDIA_INVENTORY_SAMPLE_LIMIT).map((record) => `
      <div class="pb-publish-media-row">
        <div>
          <strong>${_miEscape(record.componentValue || record.compareKey || record.id || "Signal")}</strong>
          <span>${_miEscape(record.componentType || "signal")} · ${_miEscape(record.clipKey)}</span>
        </div>
      </div>
    `).join("");
    return html || `<div class="pb-health-empty">${_miEscape(emptyText)}</div>`;
  }

  function renderMediaInventoryReport(report) {
    const publishCounts = report.publishReport?.counts || {};
    const totalPlayerRows = _miArray(report.publishReport?.rows).length;
    const mediaReadyPct = totalPlayerRows
      ? Math.round((((publishCounts.ready || 0) + (publishCounts.clipReady || 0)) / (totalPlayerRows * 2)) * 100)
      : 0;
    const scoreClass = mediaReadyPct >= 90
      ? "is-good"
      : mediaReadyPct >= 65
        ? "is-warn"
        : "is-poor";
    const issueRows = _miArray(report.publishReport?.rows)
      .filter((row) => row.diagramStatus !== "ready" || !row.hasClip);
    const cloud = report.cloudDiagrams || {};
    const cloudCounts = cloud.counts || {};
    const cloudKeys = new Set(_miArray(cloud.objects).map((entry) => entry.key));
    const missingCanonicalRows = _miArray(report.publishReport?.rows).filter((row) =>
      row.identityKey && !cloudKeys.has(`images/${row.identityKey}`)
    );
    const cloudSummary = cloud.available
      ? `${cloudCounts.total || 0} objects · ${cloudCounts.canonical || 0} canonical · ${(cloudCounts["legacy-content"] || 0) + (cloudCounts["legacy-signature"] || 0)} legacy`
      : cloud.reason || "Cloud inventory unavailable.";
    return `
      <div class="pb-health-summary pb-publish-media-summary">
        <div class="pb-health-score ${scoreClass}">
          <strong>${mediaReadyPct}%</strong>
          <span>Player media ready</span>
        </div>
        ${_miRenderCard(report.diagrams.count, "Local diagrams")}
        ${_miRenderCard(_miFormatBytes(report.diagrams.totalBytes), "Diagram storage")}
        ${_miRenderCard(report.diagrams.orphanCount, "Cleanup candidates")}
        ${_miRenderCard(cloud.available ? (cloudCounts.total || 0) : "—", "Cloud diagrams")}
        ${_miRenderCard(cloud.available ? (cloudCounts.canonical || 0) : "—", "Canonical cloud keys")}
        ${_miRenderCard(report.clips.clipCount, "Remote clips")}
        ${_miRenderCard(_miFormatBytes(report.clips.totalBytes), "Clip manifests")}
        ${_miRenderCard(report.quiz.publishedScriptCount, "Player scripts")}
        ${_miRenderCard(report.quiz.uniquePlayerPlayCount, "Quiz source plays")}
      </div>
      <div class="pb-health-guidance">
        This report inventories local diagram blobs, the staff-only R2 diagram inventory, remote clip manifests, player-visible script readiness, and signal clip gaps. Cleanup candidates are local diagram keys that do not match the current playbook or saved scripts on this device.
      </div>
      <section class="pb-health-section">
        <div class="pb-health-section-head">
          <h4>Cloud Diagram Inventory</h4>
          <span>${_miEscape(cloud.available ? (cloud.truncated ? "Partial scan" : "Live R2") : "Unavailable")}</span>
        </div>
        <div class="pb-health-guidance">${_miEscape(cloudSummary)}</div>
        ${cloud.available ? `
          <div class="pb-health-guidance">${missingCanonicalRows.length} player-visible call${missingCanonicalRows.length === 1 ? "" : "s"} do not yet have their canonical cloud object. Legacy objects remain available for migration review.</div>
          ${_miRenderPlayRows(missingCanonicalRows, "Every player-visible call has a canonical cloud diagram object.")}
        ` : ""}
      </section>
      <section class="pb-health-section">
        <div class="pb-health-section-head">
          <h4>Player-Visible Readiness</h4>
          <span>${issueRows.length} issues</span>
        </div>
        ${_miRenderPlayRows(issueRows, "Player-visible scripts have ready diagrams and clips.")}
        ${issueRows.length > MEDIA_INVENTORY_SAMPLE_LIMIT ? `<div class="pb-health-more">Showing ${MEDIA_INVENTORY_SAMPLE_LIMIT} of ${issueRows.length} issues.</div>` : ""}
      </section>
      <section class="pb-health-section">
        <div class="pb-health-section-head">
          <h4>Largest Local Diagrams</h4>
          <span>${_miFormatBytes(report.diagrams.totalBytes)}</span>
        </div>
        ${_miRenderLargestFileRows(report.diagrams.largest, "No local diagram blobs found.")}
      </section>
      <section class="pb-health-section">
        <div class="pb-health-section-head">
          <h4>Largest Remote Clips</h4>
          <span>${_miFormatBytes(report.clips.totalBytes)}</span>
        </div>
        ${_miRenderLargestFileRows(report.clips.largest, "No clip manifests found for player-visible plays or signals.")}
      </section>
      <section class="pb-health-section">
        <div class="pb-health-section-head">
          <h4>Signal Clip Gaps</h4>
          <span>${report.clips.signalClipMissing.length} signals</span>
        </div>
        ${_miRenderSignalRows(report.clips.signalClipMissing, "Every published signal record has a playable clip.")}
      </section>
      <section class="pb-health-section">
        <div class="pb-health-section-head">
          <h4>Local Diagram Cleanup Candidates</h4>
          <span>${report.diagrams.orphanCount} keys</span>
        </div>
        ${report.diagrams.orphanKeys.slice(0, MEDIA_INVENTORY_SAMPLE_LIMIT).map((key) => `
          <div class="pb-publish-media-row">
            <div>
              <strong>${_miEscape(key)}</strong>
              <span>Not referenced by current playbook or saved scripts</span>
            </div>
          </div>
        `).join("") || `<div class="pb-health-empty">No unreferenced local diagram keys found.</div>`}
        ${report.diagrams.orphanCount > MEDIA_INVENTORY_SAMPLE_LIMIT ? `<div class="pb-health-more">Showing ${MEDIA_INVENTORY_SAMPLE_LIMIT} of ${report.diagrams.orphanCount} cleanup candidates.</div>` : ""}
      </section>
    `;
  }

  window.openMediaInventoryReport = async function () {
    document.getElementById("mediaInventoryOverlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay visible";
    overlay.id = "mediaInventoryOverlay";
    overlay.dataset.action = "closeMediaInventoryReportOverlay";
    overlay.innerHTML = `
      <div class="custom-modal pb-health-modal pb-media-inventory-modal" role="dialog" aria-modal="true" aria-labelledby="mediaInventoryTitle">
        <div class="custom-modal-header">
          <span class="custom-modal-icon">Audit</span>
          <h3 class="custom-modal-title" id="mediaInventoryTitle">Media Inventory</h3>
          <button class="modal-close" aria-label="Close" data-action="closeMediaInventoryReport">×</button>
        </div>
        <div class="custom-modal-body pb-health-body" id="mediaInventoryBody">
          <div class="pb-health-empty">Checking diagrams, clips, signals, and quiz sources...</div>
        </div>
        <div class="custom-modal-actions">
          <button type="button" class="btn btn-sm" data-action="openMediaInventoryReport">Refresh</button>
          ${(typeof canEditUser === "function" && canEditUser())
        ? `<button type="button" class="btn btn-sm btn-outline" id="miOptimizeClipsBtn" data-action="optimizeAllClips" title="Re-encode older clips (playbook + signals) to a smaller, faster size for player phones">Optimize Clips</button>`
        : ""}
          <button type="button" class="btn btn-sm" data-action="closeMediaInventoryReport">Done</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    if (typeof trapFocus === "function") trapFocus(overlay);
    try {
      const report = await buildMediaInventoryReport();
      const body = document.getElementById("mediaInventoryBody");
      if (body) body.innerHTML = renderMediaInventoryReport(report);
    } catch (err) {
      const body = document.getElementById("mediaInventoryBody");
      if (body) {
        body.innerHTML = `<div class="pb-health-empty">Media inventory could not be checked: ${_miEscape(err?.message || "Unknown error")}</div>`;
      }
    }
  };

  window.closeMediaInventoryReport = function () {
    document.getElementById("mediaInventoryOverlay")?.remove();
  };

  // Admin-only global clip optimizer, invoked from the Media Inventory report.
  // Re-encodes every stored clip (playbook + signals) through the current
  // downscale + bitrate caps, skipping clips that are already small.
  window.optimizeAllClips = async function () {
    if (typeof canEditUser === "function" && !canEditUser()) return;
    const api = window.playClips;
    if (!api || typeof api.recompressAllClips !== "function") {
      if (typeof showToast === "function") {
        showToast("Clip tools are unavailable right now.", { type: "error" });
      }
      return;
    }
    const proceed = typeof showConfirm === "function"
      ? await showConfirm(
        "Optimize every stored clip (playbook + signals)? Each clip is re-encoded in this tab in " +
        "real time, so a large library can take several minutes. Clips that are already small are " +
        "skipped automatically — keep this tab open until it finishes.",
        { title: "Optimize All Clips", icon: "🎬", confirmText: "Start", cancelText: "Not now" },
      )
      : true;
    if (!proceed) return;
    const btn = document.getElementById("miOptimizeClipsBtn");
    const setBtn = (text, disabled) => {
      if (!btn) return;
      btn.textContent = text;
      btn.disabled = Boolean(disabled);
    };
    setBtn("Preparing…", true);
    let result;
    try {
      result = await api.recompressAllClips({
        kind: "all",
        onProgress: (p) => setBtn(`Optimizing ${p.processedSigs}/${p.totalSigs}…`, true),
      });
    } catch (err) {
      setBtn("Optimize Clips", false);
      if (typeof showToast === "function") {
        showToast(err?.message || "Could not optimize clips.", { type: "error" });
      }
      return;
    }
    setBtn("Optimize Clips", false);
    const savedMb = (result.bytesSaved / (1024 * 1024)).toFixed(1);
    const summary = result.recompressed
      ? `Optimized ${result.recompressed} clip${result.recompressed === 1 ? "" : "s"} and saved about ${savedMb} MB. ${result.skipped} already small, ${result.failed} failed.`
      : `Nothing to shrink — ${result.skipped} clip${result.skipped === 1 ? " was" : "s were"} already small, ${result.failed} failed.`;
    if (typeof showModal === "function") {
      showModal(summary, { title: "Clips Optimized", icon: "✅" });
    }
    if (typeof window.openMediaInventoryReport === "function") {
      window.openMediaInventoryReport();
    }
  };

  window.buildMediaInventoryReport = buildMediaInventoryReport;
})();
