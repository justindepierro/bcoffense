/* media-inventory.js - Cross-media inventory and quiz readiness audit. */

(function () {
  const MEDIA_INVENTORY_SAMPLE_LIMIT = 10;
  const MEDIA_INVENTORY_BLOB_CONCURRENCY = 6;
  let latestMediaInventoryReport = null;

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
    push(_miMediaId(play));
    if (typeof playSignature === "function") push(playSignature(play));
    return out;
  }

  function _miNormalizeLegacyDiagramSourceKey(value) {
    const key = String(value ?? "");
    if (!key || key !== key.trim() || key.length > 1000 || /[\u0000-\u001F\u007F]/.test(key) || key.includes("\\")) return "";
    const prefix = key.startsWith("images/") ? "images/"
      : key.startsWith("media/plays/") ? "media/plays/"
        : "";
    if (!prefix) return "";
    const suffix = key.slice(prefix.length);
    if (!suffix || suffix.startsWith("/") || suffix.endsWith("/") || /(?:^|\/)%2e(?:%2e)?(?:\/|$)/i.test(suffix)) return "";
    if (suffix.split("/").some((segment) => !segment || segment === "." || segment === "..")) return "";
    return key;
  }

  // Historic source-content keys are intentionally excluded here. They can
  // describe a script copy rather than the original play and have already
  // proven capable of pointing one play at another play's diagram. Legacy
  // recovery may only use an exact archived R2 key derived from a stable
  // source ID or unique tag identity.
  function _miSafeLegacyRecoverySourceKeys(play) {
    const out = [];
    const push = (value) => {
      const key = _miNormalizeLegacyDiagramSourceKey(value);
      if (key && !out.includes(key)) out.push(key);
    };
    [
      play?.legacyDiagramSourceKey,
      play?.legacyImageSourceKey,
      play?.diagramSourceKey,
    ].forEach(push);
    [
      play?.playbookId,
      play?.sourcePlayId,
      play?.originalPlayId,
      play?.id,
      _miMediaId(play),
    ].forEach((identity) => {
      const value = String(identity || "").trim();
      if (!value) return;
      // If a migrated record already retains its full source key, preserve it
      // rather than treating it as a fragment.
      if (_miNormalizeLegacyDiagramSourceKey(value)) {
        push(value);
        return;
      }
      push(`images/${value}`);
      push(`media/plays/${value}`);
    });
    if (typeof getPlayIdentityKey === "function") {
      const identity = String(getPlayIdentityKey(play, "tag") || "").trim();
      if (identity) {
        push(`images/${identity}`);
        push(`media/plays/${identity}`);
      }
    }
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

  function _miMediaId(play) {
    if (typeof getPlayMediaId === "function") return String(getPlayMediaId(play) || "").trim();
    return String(play?.mediaId || "").trim();
  }

  function _miBuildMediaReconciliation(playerPlays, diagramInventory, cloudInventory) {
    const expected = new Map();
    _miArray(playerPlays).forEach((play) => {
      const mediaId = _miMediaId(play);
      if (mediaId && !expected.has(mediaId)) expected.set(mediaId, play);
    });
    const cloudObjects = _miArray(cloudInventory?.objects);
    const canonicalMediaIds = new Set(
      cloudObjects.filter((entry) => entry?.kind === "canonical" && entry.mediaId).map((entry) => entry.mediaId),
    );
    const legacyObjects = cloudObjects
      .filter((entry) => entry?.kind !== "canonical")
      .map((entry) => ({
        ...entry,
        sourceKey: _miNormalizeLegacyDiagramSourceKey(entry?.sourceKey || entry?.key),
      }))
      .filter((entry) => entry.sourceKey);
    const localKeys = new Set(_miArray(diagramInventory?.keys).map((key) => String(key || "")));
    const rows = [...expected.entries()].map(([mediaId, play]) => {
      const compatibleKeys = _miPlayImageSigs(play);
      const hasCanonical = canonicalMediaIds.has(mediaId);
      const recoverySourceKeys = new Set(_miSafeLegacyRecoverySourceKeys(play));
      const legacyMatches = legacyObjects.filter((entry) => recoverySourceKeys.has(entry.sourceKey));
      const hasLegacy = legacyMatches.length > 0;
      const hasLocal = compatibleKeys.some((key) => localKeys.has(key));
      const status = hasCanonical ? "canonical" : hasLegacy ? "legacy" : hasLocal ? "local-only" : "missing";
      const detail = status === "canonical"
        ? "Current versioned R2 object found."
        : status === "legacy"
          ? "Recoverable legacy R2 object found; canonical migration is still needed."
          : status === "local-only"
            ? "Diagram exists only in this browser cache and can be recovered/uploaded."
            : "No cloud or local diagram was found for this player-visible play.";
      return {
        mediaId,
        play,
        label: _miPlayLabel(play),
        status,
        detail,
        sourceKey: legacyMatches[0]?.sourceKey || "",
      };
    });
    const counts = rows.reduce((result, row) => {
      result[row.status] += 1;
      return result;
    }, { total: rows.length, canonical: 0, legacy: 0, "local-only": 0, missing: 0 });
    return { rows, counts };
  }

  // A legacy object is eligible for automatic promotion only when its exact
  // historic signature belongs to one current play. We deliberately do not
  // use fuzzy name matching: a wrong diagram is worse than an archived one.
  function _miBuildLegacyRecoveryCandidates(knownPlays, cloudInventory) {
    const cloudObjects = _miArray(cloudInventory?.objects);
    const canonicalIds = new Set(
      cloudObjects.filter((entry) => entry?.kind === "canonical" && entry.mediaId).map((entry) => entry.mediaId),
    );
    const legacyObjects = cloudObjects
      .filter((entry) => entry?.kind !== "canonical")
      .map((entry) => ({
        ...entry,
        sourceKey: _miNormalizeLegacyDiagramSourceKey(entry?.sourceKey || entry?.key),
      }))
      .filter((entry) => entry.sourceKey);
    const sourceMatches = new Map();
    const playMatches = new Map();
    _miArray(knownPlays).forEach((play) => {
      const mediaId = _miMediaId(play);
      if (!mediaId) return;
      const keys = new Set(_miSafeLegacyRecoverySourceKeys(play));
      const matches = legacyObjects.filter((entry) => keys.has(entry.sourceKey));
      if (!matches.length) return;
      matches.forEach((entry) => {
        const ids = sourceMatches.get(entry.sourceKey) || new Set();
        ids.add(mediaId);
        sourceMatches.set(entry.sourceKey, ids);
      });
      if (!canonicalIds.has(mediaId)) playMatches.set(mediaId, { mediaId, play, matches });
    });
    const automatic = [];
    const ambiguous = [];
    playMatches.forEach((candidate) => {
      const safeMatches = candidate.matches
        .filter((entry) => (sourceMatches.get(entry.sourceKey)?.size || 0) === 1)
        .sort((a, b) => {
          const timeA = Date.parse(a.uploadedAt || "") || 0;
          const timeB = Date.parse(b.uploadedAt || "") || 0;
          return timeB - timeA || String(b.sourceKey).localeCompare(String(a.sourceKey));
        });
      if (!safeMatches.length) {
        ambiguous.push({
          ...candidate,
          label: _miPlayLabel(candidate.play),
          detail: "A legacy diagram signature is shared by multiple current plays; it was retained for review.",
        });
        return;
      }
      const newest = safeMatches[0];
      automatic.push({
        ...newest,
        mediaId: candidate.mediaId,
        play: candidate.play,
        matches: candidate.matches,
        label: _miPlayLabel(candidate.play),
        detail: `Newest exact legacy match${newest.uploadedAt ? ` · ${new Date(newest.uploadedAt).toLocaleDateString()}` : ""}.`,
      });
    });
    const matchedSourceCount = sourceMatches.size;
    return {
      automatic: automatic.sort((a, b) => a.label.localeCompare(b.label)),
      ambiguous: ambiguous.sort((a, b) => a.label.localeCompare(b.label)),
      unmatchedSourceCount: Math.max(0, legacyObjects.length - matchedSourceCount),
    };
  }

  async function _miFetchCloudMediaInventory() {
    if (typeof canEditUser === "function" && !canEditUser()) {
      return { available: false, reason: "Coach access is required for cloud inventory." };
    }
    try {
      const response = await fetch("/media/inventory", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        return { available: false, reason: data?.error || "Cloud media inventory is unavailable." };
      }
      return {
        ...data,
        available: true,
        diagrams: {
          ...(data.diagrams || {}),
          objects: _miArray(data?.diagrams?.objects),
        },
        clips: data.clips || {},
      };
    } catch (_err) {
      return { available: false, reason: "Cloud media inventory could not be reached." };
    }
  }

  async function _miFetchScheduledMediaHealth() {
    if (typeof canEditUser === "function" && !canEditUser()) {
      return { available: false, reason: "Coach access is required for scheduled media health." };
    }
    try {
      const response = await fetch("/media/health", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        return { available: false, reason: data?.error || "Scheduled media health is unavailable." };
      }
      return { ...data, available: Boolean(data.available) };
    } catch (_err) {
      return { available: false, reason: "Scheduled media health could not be reached." };
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
    const [diagramInventory, publishReport, cloudMedia, scheduledHealth, outboxHealth] = await Promise.all([
      _miBuildDiagramInventory(knownPlays),
      window.playImages && typeof window.playImages.buildPlayerMediaPublishReport === "function"
        ? window.playImages.buildPlayerMediaPublishReport()
        : Promise.resolve({ publishedScripts, rows: [], counts: {} }),
      _miFetchCloudMediaInventory(),
      _miFetchScheduledMediaHealth(),
      window.mediaUploadOutbox?.getHealth
        ? window.mediaUploadOutbox.getHealth().catch(() => null)
        : Promise.resolve(null),
    ]);
    const cloudDiagrams = cloudMedia.available
      ? { ...cloudMedia.diagrams, available: true }
      : cloudMedia;
    const reconciliation = _miBuildMediaReconciliation(playerPlays, diagramInventory, cloudDiagrams);
    const legacyRecovery = _miBuildLegacyRecoveryCandidates(knownPlays, cloudDiagrams);
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
      knownPlays,
      playerPlayCount: playerPlays.length,
      savedScripts,
      publishedScripts,
      publishReport,
      diagrams: diagramInventory,
      cloudDiagrams,
      cloudMedia,
      scheduledHealth,
      outboxHealth,
      reconciliation,
      legacyRecovery,
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
      const source = row.source || row.sourceKey || "";
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
    const cloudClips = report.cloudMedia?.clips || {};
    const scheduledHealth = report.scheduledHealth || {};
    const scheduled = scheduledHealth.health || {};
    const outboxHealth = report.outboxHealth || {};
    const cloudCounts = cloud.counts || {};
    const diagramIntegrity = cloud.integrity || {};
    const reconciliation = report.reconciliation || { counts: {}, rows: [] };
    const legacyRecovery = report.legacyRecovery || { automatic: [], ambiguous: [], unmatchedSourceCount: 0 };
    const migrationRows = _miArray(reconciliation.rows).filter((row) => row.status !== "canonical");
    const cloudSummary = cloud.available
      ? `${cloudCounts.total || 0} objects · ${cloudCounts.canonical || 0} canonical · ${(cloudCounts["legacy-canonical-key"] || 0) + (cloudCounts["legacy-content"] || 0) + (cloudCounts["legacy-signature"] || 0)} legacy`
      : cloud.reason || "Cloud inventory unavailable.";
    const integrityLabel = !cloud.available
      ? "Unavailable"
      : !diagramIntegrity.available
        ? "Pointer audit unavailable"
        : !diagramIntegrity.complete
          ? "Pointer audit partial"
          : Number(diagramIntegrity.missingObjectCount || 0) || Number(diagramIntegrity.invalidPathCount || 0) || Number(diagramIntegrity.checksumMetadataMismatchCount || 0)
            ? "Needs attention"
            : "D1 ↔ R2 verified";
    const integrityIssues = [
      ..._miArray(diagramIntegrity.missingMediaIds).map((mediaId) => ({
        label: mediaId,
        detail: "Current D1 diagram pointer has no matching immutable R2 object.",
      })),
      ..._miArray(diagramIntegrity.invalidPathMediaIds).map((mediaId) => ({
        label: mediaId,
        detail: "Current D1 diagram pointer is not in the canonical team diagram path.",
      })),
      ..._miArray(diagramIntegrity.checksumMetadataMismatchMediaIds).map((mediaId) => ({
        label: mediaId,
        detail: "The immutable R2 object's checksum metadata differs from its D1 pointer.",
      })),
    ];
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
        ${_miRenderCard(cloud.available && diagramIntegrity.available ? (diagramIntegrity.pointerCount || 0) : "—", "Current D1 pointers")}
        ${_miRenderCard(cloud.available ? (cloudClips.clipCount || 0) : report.clips.clipCount, "Cloud clips")}
        ${_miRenderCard(_miFormatBytes(report.clips.totalBytes), "Clip manifests")}
        ${_miRenderCard(report.quiz.publishedScriptCount, "Player scripts")}
        ${_miRenderCard(report.quiz.uniquePlayerPlayCount, "Quiz source plays")}
        ${_miRenderCard(outboxHealth.pending || 0, outboxHealth.needsAttention ? "Uploads need attention" : "This device uploads")}
      </div>
      <div class="pb-health-guidance">
        This report inventories local diagram blobs, every staff-visible Cloudflare diagram object, every play-video and signal-video manifest, player-visible script readiness, and signal clip gaps. The device outbox retries uploads automatically and calls out anything that needs your attention. Cleanup candidates are local diagram keys that do not match the current playbook or saved scripts on this device.
      </div>
      <section class="pb-health-section">
        <div class="pb-health-section-head">
          <h4>Automatic Cloud Health</h4>
          <span>${_miEscape(scheduledHealth.available ? (scheduled.status === "healthy" ? "Healthy" : "Needs attention") : "Waiting")}</span>
        </div>
        ${scheduledHealth.available ? `
          <div class="pb-health-summary pb-publish-media-summary">
            ${_miRenderCard(`${scheduled.diagramPointerCount || 0}/${scheduled.diagramObjectCount || 0}`, "Verified diagrams")}
            ${_miRenderCard(scheduled.missingClipCount || 0, "Missing clip files")}
            ${_miRenderCard(scheduled.legacyClipManifestCount || 0, "Legacy clip manifests")}
            ${_miRenderCard(scheduled.releaseAgeSeconds < 0 ? "—" : `${Math.floor((scheduled.releaseAgeSeconds || 0) / 60)}m`, "Current release age")}
          </div>
          <div class="pb-health-guidance">Last server check: ${_miEscape(new Date((scheduled.completedAt || 0) * 1000).toLocaleString())}. Cloudflare checks diagrams, clip manifests and bytes, release freshness, and reports real storage mismatches without changing media.</div>
          ${(scheduled.missingDiagramCount || scheduled.invalidDiagramPathCount || scheduled.checksumMismatchCount || scheduled.missingClipCount)
            ? _miRenderPlayRows([
              ..._miArray(scheduled.detail?.missingMediaIds).map((label) => ({ label, detail: "Current diagram pointer is missing its immutable Cloudflare object." })),
              ..._miArray(scheduled.detail?.missingClipIds).map((label) => ({ label, detail: "A clip manifest points to a missing Cloudflare video object." })),
            ], "Cloud health needs attention; refresh after correcting the listed media.")
            : `<div class="pb-health-empty">Automatic server checks are clear. You do not need to run this audit routinely.</div>`}
        ` : `<div class="pb-health-empty">${_miEscape(scheduledHealth.reason || "The first hourly Cloudflare check has not run yet.")}</div>`}
      </section>
      <section class="pb-health-section">
        <div class="pb-health-section-head">
          <h4>Canonical Media Migration</h4>
          <span>${_miEscape(cloud.available ? (cloud.truncated ? "Partial scan" : "Live R2") : "Unavailable")}</span>
        </div>
        <div class="pb-health-guidance">${_miEscape(cloudSummary)}</div>
        ${cloud.available ? `
          <div class="pb-health-summary pb-publish-media-summary">
            ${_miRenderCard(reconciliation.counts.canonical || 0, "Canonical found")}
            ${_miRenderCard(reconciliation.counts.legacy || 0, "Legacy found")}
            ${_miRenderCard(reconciliation.counts["local-only"] || 0, "Local-only")}
            ${_miRenderCard(reconciliation.counts.missing || 0, "Missing")}
          </div>
          <div class="pb-health-section-head" style="margin-top:16px">
            <h4>Canonical Pointer Integrity</h4>
            <span>${_miEscape(integrityLabel)}</span>
          </div>
          ${diagramIntegrity.available ? `
            <div class="pb-health-summary pb-publish-media-summary">
              ${_miRenderCard(diagramIntegrity.pointerCount || 0, "D1 current pointers")}
              ${_miRenderCard(diagramIntegrity.presentPointerCount || 0, "R2 objects present")}
              ${_miRenderCard(diagramIntegrity.complete ? (diagramIntegrity.missingObjectCount || 0) : "—", "Missing pointer bytes")}
              ${_miRenderCard(diagramIntegrity.invalidPathCount || 0, "Noncanonical paths")}
              ${_miRenderCard(diagramIntegrity.checksumMetadataMismatchCount || 0, "Checksum mismatches")}
            </div>
            <div class="pb-health-guidance">This compares every current team D1 diagram pointer with the immutable R2 object list. A partial R2 scan never reports missing bytes as a failure.</div>
            ${_miRenderPlayRows(integrityIssues, "Every current canonical diagram pointer resolves to an immutable R2 object.")}
          ` : `<div class="pb-health-empty">${_miEscape(diagramIntegrity.error || "Current diagram pointers could not be audited.")}</div>`}
          ${_miRenderPlayRows(migrationRows, "Every player-visible call has a canonical cloud diagram object.")}
          ${migrationRows.length > MEDIA_INVENTORY_SAMPLE_LIMIT ? `<div class="pb-health-more">Showing ${MEDIA_INVENTORY_SAMPLE_LIMIT} of ${migrationRows.length} migration items.</div>` : ""}
          ${(typeof isAdminUser === "function" && isAdminUser() && (reconciliation.counts.legacy || 0))
            ? `<div class="pb-health-actions"><button type="button" class="btn btn-sm btn-primary" data-action="openLegacyDiagramRecoveryWizard">Recover archived diagrams</button></div>`
            : ""}
          <div class="pb-health-section-head" style="margin-top:16px">
            <h4>Legacy Diagram Recovery</h4>
            <span>Exact matches only</span>
          </div>
          <div class="pb-health-summary pb-publish-media-summary">
            ${_miRenderCard(legacyRecovery.automatic.length, "Newest exact matches")}
            ${_miRenderCard(legacyRecovery.ambiguous.length, "Needs review")}
            ${_miRenderCard(legacyRecovery.unmatchedSourceCount, "Archived unmatched")}
          </div>
          <div class="pb-health-guidance">Automatic recovery only promotes the newest Cloudflare diagram whose exact archived R2 source key belongs to one current play. Shared and unmatched files stay preserved in the archive.</div>
          ${_miRenderPlayRows(legacyRecovery.automatic, "No additional exact legacy matches are waiting to be promoted.")}
          ${legacyRecovery.automatic.length > MEDIA_INVENTORY_SAMPLE_LIMIT ? `<div class="pb-health-more">Showing ${MEDIA_INVENTORY_SAMPLE_LIMIT} of ${legacyRecovery.automatic.length} exact recovery candidates.</div>` : ""}
          ${(typeof isAdminUser === "function" && isAdminUser() && legacyRecovery.automatic.length)
            ? `<div class="pb-health-actions"><button type="button" class="btn btn-sm" data-action="openLegacyDiagramRecoveryWizard">Review ${legacyRecovery.automatic.length} exact matches</button></div>`
            : ""}
        ` : ""}
      </section>
      <section class="pb-health-section">
        <div class="pb-health-section-head">
          <h4>Cloud Video Recovery</h4>
          <span>${_miEscape(cloud.available ? (cloudClips.truncated ? "Partial scan" : "Live Cloudflare") : "Unavailable")}</span>
        </div>
        ${cloud.available ? `
          <div class="pb-health-summary pb-publish-media-summary">
            ${_miRenderCard(cloudClips.manifestCount || 0, "Video manifests")}
            ${_miRenderCard(cloudClips.playClipCount || 0, "Play videos")}
            ${_miRenderCard(cloudClips.signalClipCount || 0, "Signal videos")}
            ${_miRenderCard(cloudClips.r2ObjectCount || 0, "R2 video objects")}
            ${_miRenderCard(cloudClips.orphanObjectCount || 0, "Unlinked video objects")}
            ${_miRenderCard(_miFormatBytes(cloudClips.totalBytes), "Cloud video storage")}
          </div>
          <div class="pb-health-guidance">These are all Cloudflare video manifests, including assets that are not referenced by the current device's workspace. Unlinked objects are retained for recovery; this report does not delete anything.</div>
        ` : `<div class="pb-health-empty">${_miEscape(report.cloudMedia?.reason || "Cloud video inventory unavailable.")}</div>`}
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
      latestMediaInventoryReport = report;
      const body = document.getElementById("mediaInventoryBody");
      if (body) body.innerHTML = renderMediaInventoryReport(report);
    } catch (err) {
      const body = document.getElementById("mediaInventoryBody");
      if (body) {
        body.innerHTML = `<div class="pb-health-empty">Media inventory could not be checked: ${_miEscape(err?.message || "Unknown error")}</div>`;
      }
    }
  };

  const LEGACY_RECOVERY_PAGE_SIZE = 12;
  let legacyRecoveryState = null;

  function _miRecoveryAssets(report) {
    const exactBySource = new Map(_miArray(report?.legacyRecovery?.automatic)
      .map((item) => [item.sourceKey, item]));
    const assets = _miArray(report?.cloudDiagrams?.objects)
      .filter((item) => item?.kind !== "canonical")
      .map((item) => ({ ...item, sourceKey: _miNormalizeLegacyDiagramSourceKey(item?.key) }))
      .filter((item) => item.sourceKey)
      .map((item) => {
        const exact = exactBySource.get(item.sourceKey) || null;
        return {
          ...item,
          exact,
          proposedMediaId: exact?.mediaId || "",
          proposedLabel: exact?.label || "",
          // A pointer existing for the proposed play is not proof that its
          // bytes match this archive. The explicit checksum analysis decides
          // whether a source is verified-correct or needs comparison.
          canRecover: true,
        };
      })
      .filter((item) => item.canRecover)
      .sort((a, b) => Number(Boolean(b.exact)) - Number(Boolean(a.exact)) || String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")));
    return assets;
  }

  function _miRecoveryPlayLabels(report) {
    const labels = new Map();
    _miArray(report?.knownPlays).forEach((play) => {
      const mediaId = _miMediaId(play);
      if (mediaId && !labels.has(mediaId)) labels.set(mediaId, _miPlayLabel(play));
    });
    return labels;
  }

  function _miRefreshRecoveryAssets() {
    if (!legacyRecoveryState) return;
    const allAssets = _miArray(legacyRecoveryState.allAssets);
    legacyRecoveryState.assets = legacyRecoveryState.duplicateAnalysis && !legacyRecoveryState.showExcluded
      // Only a checksum match to the same permanent media ID is safe to hide.
      // A match owned by a different play is valuable evidence of a historic
      // wrong mapping and must remain visible for manual review.
      ? allAssets.filter((asset) => !asset.verifiedCanonicalTarget && !asset.duplicateArchiveCopy)
      : allAssets;
    legacyRecoveryState.page = 0;
  }

  function _miDuplicateReviewCounts(assets) {
    return _miArray(assets).reduce((counts, asset) => {
      if (asset.verifiedCanonicalTarget) counts.verifiedCorrect += 1;
      if (asset.checksumConflict || asset.targetContentMismatch) counts.conflicts += 1;
      if (asset.duplicateArchiveCopy) counts.duplicateCopies += 1;
      return counts;
    }, { verifiedCorrect: 0, conflicts: 0, duplicateCopies: 0 });
  }

  function _miApplyLegacyDuplicateAnalysis(analysis) {
    if (!legacyRecoveryState || !analysis?.groups) return;
    const state = legacyRecoveryState;
    const labels = _miRecoveryPlayLabels(state.report);
    const canonicalChecksumByMediaId = new Map(
      _miArray(analysis.canonicalDiagrams)
        .map((diagram) => [String(diagram?.mediaId || ""), String(diagram?.checksum || "").toLowerCase()])
        .filter(([mediaId, checksum]) => mediaId && /^[a-f0-9]{64}$/.test(checksum)),
    );
    const assetsBySource = new Map(_miArray(state.allAssets).map((asset) => [asset.sourceKey, asset]));
    const annotations = new Map();
    _miArray(analysis.groups).forEach((group) => {
      const groupSources = _miArray(group?.sources)
        .map((source) => assetsBySource.get(String(source?.sourceKey || "")))
        .filter(Boolean);
      if (!groupSources.length) return;
      const canonicalMediaIds = _miArray(group?.canonicalMediaIds).map((mediaId) => String(mediaId || "")).filter(Boolean);
      const representative = [...groupSources].sort((left, right) => {
        const leftVerified = Number(canonicalMediaIds.includes(String(state.targets.get(left.sourceKey) || left.proposedMediaId || "")));
        const rightVerified = Number(canonicalMediaIds.includes(String(state.targets.get(right.sourceKey) || right.proposedMediaId || "")));
        const leftSuggested = Number(Boolean(state.targets.get(left.sourceKey)));
        const rightSuggested = Number(Boolean(state.targets.get(right.sourceKey)));
        const leftTime = Date.parse(left.uploadedAt || "") || 0;
        const rightTime = Date.parse(right.uploadedAt || "") || 0;
        return rightVerified - leftVerified || rightSuggested - leftSuggested || rightTime - leftTime || left.sourceKey.localeCompare(right.sourceKey);
      })[0];
      groupSources.forEach((asset) => {
        const proposedMediaId = String(state.targets.get(asset.sourceKey) || asset.proposedMediaId || "");
        const verifiedCanonicalTarget = Boolean(proposedMediaId && canonicalMediaIds.includes(proposedMediaId));
        const proposedCanonicalChecksum = canonicalChecksumByMediaId.get(proposedMediaId) || "";
        const targetContentMismatch = Boolean(proposedMediaId && proposedCanonicalChecksum && proposedCanonicalChecksum !== String(group?.checksum || "").toLowerCase());
        const checksumConflict = Boolean(canonicalMediaIds.length && !verifiedCanonicalTarget);
        annotations.set(asset.sourceKey, {
          checksum: String(group?.checksum || ""),
          duplicateGroupSize: groupSources.length,
          canonicalMediaIds,
          canonicalLabels: canonicalMediaIds.map((mediaId) => labels.get(mediaId) || mediaId),
          verifiedCanonicalTarget,
          targetContentMismatch,
          checksumConflict,
          duplicateArchiveCopy: groupSources.length > 1 && asset.sourceKey !== representative?.sourceKey && !checksumConflict && !targetContentMismatch,
        });
      });
    });
    state.allAssets = _miArray(state.allAssets).map((asset) => ({ ...asset, ...(annotations.get(asset.sourceKey) || {}) }));
    state.allAssets.forEach((asset) => {
      if (asset.verifiedCanonicalTarget || asset.checksumConflict || asset.targetContentMismatch || asset.duplicateArchiveCopy) state.selected.delete(asset.sourceKey);
    });
    state.duplicateAnalysis = analysis;
    state.showExcluded = false;
    state.duplicateAnalysisError = "";
    _miRefreshRecoveryAssets();
  }

  async function _miAnalyzeLegacyDuplicateGroups() {
    const state = legacyRecoveryState;
    if (!state || state.analyzingDuplicates) return;
    state.analyzingDuplicates = true;
    state.duplicateAnalysisError = "";
    _miRenderLegacyRecoveryWizard();
    try {
      const response = await fetch("/images/legacy-duplicate-groups", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Archived duplicate analysis could not be completed.");
      _miApplyLegacyDuplicateAnalysis(payload);
      if (payload.truncated && typeof showToast === "function") {
        showToast("Duplicate analysis reached its archive safety limit; only the scanned objects were grouped.", { type: "warning", duration: 6000 });
      }
    } catch (err) {
      state.duplicateAnalysisError = err?.message || "Archived duplicate analysis could not be completed.";
      if (typeof showToast === "function") showToast(state.duplicateAnalysisError, { type: "error", duration: 6000 });
    } finally {
      if (legacyRecoveryState) legacyRecoveryState.analyzingDuplicates = false;
      _miRenderLegacyRecoveryWizard();
    }
  }

  function _miRecoveryPlayCandidates(report) {
    const canonicalIds = new Set(_miArray(report?.cloudDiagrams?.objects)
      .filter((item) => item?.kind === "canonical" && item.mediaId)
      .map((item) => String(item.mediaId)));
    const seen = new Set();
    return _miArray(report?.knownPlays)
      .map((play) => {
        const metadataFields = [
          ["Type", play?.type], ["Personnel", play?.personnel], ["Formation", play?.formation],
          ["Tag", play?.formTag1], ["Tag", play?.formTag2], ["Back", play?.back],
          ["Shift", play?.shift], ["Motion", play?.motion], ["Protection", play?.protection],
          ["Line", play?.lineCall], ["Play tag", play?.playTag1], ["Play tag", play?.playTag2],
          ["Base", play?.basePlay], ["One word", play?.oneWord], ["Situation", play?.preferredSituation],
          ["Tempo", play?.tempo], ["Front", play?.practiceFront], ["Defense", play?.practiceDefense],
          ["Coverage", play?.practiceCoverage], ["Blitz", play?.practiceBlitz],
        ].filter(([, value]) => String(value || "").trim());
        const metadata = metadataFields.map(([label, value]) => `${label}: ${String(value).trim()}`);
        return {
          play,
          mediaId: _miMediaId(play),
          label: _miPlayLabel(play),
          metadata,
          searchText: `${_miPlayLabel(play)} ${metadata.join(" ")}`,
        };
      })
      .filter((item) => item.mediaId && !canonicalIds.has(item.mediaId) && !seen.has(item.mediaId) && seen.add(item.mediaId))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  function _miRecoverySearchText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function _miRecoveryEditDistance(left, right) {
    const a = String(left || "");
    const b = String(right || "");
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let row = 1; row <= a.length; row += 1) {
      let diagonal = previous[0];
      previous[0] = row;
      for (let column = 1; column <= b.length; column += 1) {
        const above = previous[column];
        previous[column] = Math.min(
          previous[column] + 1,
          previous[column - 1] + 1,
          diagonal + (a[row - 1] === b[column - 1] ? 0 : 1),
        );
        diagonal = above;
      }
    }
    return previous[b.length];
  }

  function _miRecoverySearchScore(candidate, query) {
    const normalizedQuery = _miRecoverySearchText(query);
    if (!normalizedQuery) return -1;
    const queryTokens = normalizedQuery.split(" ").filter(Boolean);
    const candidateText = _miRecoverySearchText(`${candidate.searchText || candidate.label} ${candidate.mediaId}`);
    const candidateTokens = candidateText.split(" ").filter(Boolean);
    let score = 0;
    for (const token of queryTokens) {
      if (candidateText.includes(token)) {
        score += 100 + token.length;
        continue;
      }
      const closest = candidateTokens.reduce((best, candidateToken) => {
        const distance = _miRecoveryEditDistance(token, candidateToken);
        return Math.min(best, distance);
      }, Infinity);
      // Short search terms need to be precise; longer terms can tolerate a
      // couple of typos (for example, "Gergia" still finds "Georgia").
      const maxDistance = token.length >= 7 ? 2 : token.length >= 4 ? 1 : 0;
      if (closest > maxDistance) return -1;
      score += 40 + token.length - closest * 8;
    }
    return score;
  }

  function _miSearchRecoveryPlayCandidates(report, query) {
    const matches = _miRecoveryPlayCandidates(report)
      .map((candidate) => ({ candidate, score: _miRecoverySearchScore(candidate, query) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score || a.candidate.label.localeCompare(b.candidate.label));
    return {
      total: matches.length,
      items: matches.map((item) => item.candidate),
    };
  }

  function _miRecoveryPlayOptions(report, selectedMediaId) {
    return _miRecoveryPlayCandidates(report)
      .map((item) => `<option value="${_miEscape(item.mediaId)}"${item.mediaId === selectedMediaId ? " selected" : ""}>${_miEscape(item.label)}</option>`)
      .join("");
  }

  function _miLegacyPreviewUrl(sourceKey) {
    return `/images/legacy-preview?sourceKey=${encodeURIComponent(sourceKey)}`;
  }

  function _miRenderLegacyRecoveryWizard() {
    const body = document.getElementById("legacyDiagramRecoveryBody");
    if (!body || !legacyRecoveryState) return;
    const { report, assets, allAssets, selected, targets, targetQueries, duplicateAnalysis, showExcluded, analyzingDuplicates, duplicateAnalysisError } = legacyRecoveryState;
    const totalPages = Math.max(1, Math.ceil(assets.length / LEGACY_RECOVERY_PAGE_SIZE));
    legacyRecoveryState.page = Math.max(0, Math.min(legacyRecoveryState.page, totalPages - 1));
    const start = legacyRecoveryState.page * LEGACY_RECOVERY_PAGE_SIZE;
    const pageItems = assets.slice(start, start + LEGACY_RECOVERY_PAGE_SIZE);
    const selectedCount = [...selected].filter((sourceKey) => targets.get(sourceKey)).length;
    const duplicateCounts = _miDuplicateReviewCounts(allAssets);
    body.innerHTML = `
      <div class="pb-health-summary pb-recovery-summary">
        ${_miRenderCard(assets.length, duplicateAnalysis ? "Review candidates" : "Archived diagrams")}
        ${_miRenderCard(duplicateAnalysis ? duplicateCounts.verifiedCorrect : _miArray(report?.legacyRecovery?.automatic).length, duplicateAnalysis ? "Verified correct target" : "Unique exact suggestions")}
        ${_miRenderCard(duplicateAnalysis ? duplicateCounts.conflicts : 0, duplicateAnalysis ? "Cross-play checksum conflicts" : "Duplicate analysis")}
        ${_miRenderCard(selectedCount, "Ready to recover")}
      </div>
      <div class="pb-health-guidance">Every card is an archived Cloudflare image. Exact suggestions are preselected, but you can inspect the thumbnail and change or uncheck any mapping. Duplicate analysis hides an image only when its checksum is already attached to that same permanent play. If identical bytes belong to a different play, the card stays visible as a blocked cross-play conflict for review. A recovery copies confirmed bytes into the permanent team store; it never deletes the archive.</div>
      <div class="pb-recovery-toolbar">
        <button type="button" class="btn btn-sm" data-recovery-action="select-exact">Select exact suggestions</button>
        <button type="button" class="btn btn-sm btn-outline" data-recovery-action="clear-selection">Clear selection</button>
        ${duplicateAnalysis ? `<button type="button" class="btn btn-sm" data-recovery-action="toggle-excluded">${showExcluded ? "Hide verified / duplicate copies" : `Show ${Math.max(0, allAssets.length - assets.length)} verified / duplicate copies`}</button>` : `<button type="button" class="btn btn-sm btn-primary" data-recovery-action="analyze-duplicates"${analyzingDuplicates ? " disabled" : ""}>${analyzingDuplicates ? "Analyzing archived bytes…" : "Analyze duplicate archived images"}</button>`}
        <span>Showing ${assets.length ? start + 1 : 0}–${Math.min(start + LEGACY_RECOVERY_PAGE_SIZE, assets.length)} of ${assets.length}${duplicateAnalysis ? ` · ${Number(duplicateAnalysis?.counts?.uniqueGroups || 0)} unique byte groups` : ""}</span>
      </div>
      ${duplicateAnalysisError ? `<div class="pb-health-empty">${_miEscape(duplicateAnalysisError)}</div>` : ""}
      <div class="pb-recovery-grid">
        ${pageItems.map((asset) => {
          const target = targets.get(asset.sourceKey) || "";
          const blocked = Boolean(asset.verifiedCanonicalTarget || asset.checksumConflict || asset.targetContentMismatch || asset.duplicateArchiveCopy);
          const isSelected = !blocked && selected.has(asset.sourceKey) && Boolean(target);
          const query = targetQueries.get(asset.sourceKey) || "";
          const searchResults = query ? _miSearchRecoveryPlayCandidates(report, query) : { total: 0, items: [] };
          return `<article class="pb-recovery-card${asset.exact ? " is-exact" : ""}${asset.verifiedCanonicalTarget || asset.duplicateArchiveCopy ? " is-excluded" : ""}${asset.checksumConflict || asset.targetContentMismatch ? " is-conflict" : ""}">
            <img class="pb-recovery-preview" src="${_miEscape(_miLegacyPreviewUrl(asset.sourceKey))}" alt="Archived diagram preview" loading="lazy">
            <div class="pb-recovery-card-body">
              <label class="pb-recovery-select"><input type="checkbox" data-recovery-select="${_miEscape(asset.sourceKey)}"${isSelected ? " checked" : ""}${blocked ? " disabled" : ""}> Recover this diagram</label>
              <strong>${asset.exact ? "Exact archived match" : "Choose the correct play"}</strong>
              <code title="${_miEscape(asset.sourceKey)}">${_miEscape(asset.sourceKey)}</code>
              ${asset.verifiedCanonicalTarget ? `<div class="pb-recovery-duplicate-note is-canonical">Verified correct target: ${_miEscape(asset.canonicalLabels.join(" · ") || asset.canonicalMediaIds.join(" · "))}</div>` : asset.targetContentMismatch ? `<div class="pb-recovery-duplicate-note is-conflict">Target has a different current diagram · archive suggests ${_miEscape(asset.proposedLabel || asset.proposedMediaId)}</div>` : asset.checksumConflict ? `<div class="pb-recovery-duplicate-note is-conflict">Cross-play checksum conflict · bytes already belong to ${_miEscape(asset.canonicalLabels.join(" · ") || asset.canonicalMediaIds.join(" · "))}${asset.proposedLabel ? `, while this archive suggests ${_miEscape(asset.proposedLabel)}` : ""}</div>` : asset.duplicateArchiveCopy ? `<div class="pb-recovery-duplicate-note">Duplicate archive copy · grouped with ${asset.duplicateGroupSize} identical bytes</div>` : asset.duplicateGroupSize > 1 ? `<div class="pb-recovery-duplicate-note is-primary">Representative of ${asset.duplicateGroupSize} identical archive copies</div>` : ""}
              <label class="pb-recovery-search"><span>Search plays</span><input type="search" data-recovery-target-search="${_miEscape(asset.sourceKey)}" value="${_miEscape(query)}" placeholder="Type a play name or partial call…" autocomplete="off" aria-label="Search plays for this archived diagram"></label>
              ${query ? `<div class="pb-recovery-search-results" role="listbox" aria-label="Play search results">
                <span>${searchResults.total ? `${searchResults.total} fuzzy match${searchResults.total === 1 ? "" : "es"} · all results shown` : "No matching plays"}</span>
                ${searchResults.items.map((item) => `<button type="button" role="option" data-recovery-action="choose-target" data-recovery-source-key="${_miEscape(asset.sourceKey)}" data-recovery-media-id="${_miEscape(item.mediaId)}"><strong>${_miEscape(item.label)}</strong>${item.metadata.length ? `<small>${_miEscape(item.metadata.slice(0, 5).join(" · "))}</small>` : ""}</button>`).join("")}
              </div>` : ""}
              <select data-recovery-target="${_miEscape(asset.sourceKey)}"${blocked ? " disabled" : ""}>
                <option value="">Keep archived / do not map yet</option>
                ${_miRecoveryPlayOptions(report, target)}
              </select>
              <small>${asset.verifiedCanonicalTarget ? "This checksum is verified on the same proposed permanent play, so no recovery is needed." : asset.targetContentMismatch ? "The archive and this play’s current canonical diagram have different bytes. It remains visible for comparison, but automatic recovery is disabled." : asset.checksumConflict ? "Automatic recovery is disabled: identical bytes on a different play are evidence to review, not proof that this play should receive them." : asset.duplicateArchiveCopy ? "Shown for inspection only. Use the representative archive copy if this image is the correct one." : `${asset.exact ? `Suggested: ${_miEscape(asset.proposedLabel)}` : "No safe automatic match was found."} ${query ? "Search uses call, formation, tags, back, motion, protection, base call, one word, situation, and defensive metadata." : ""}`}</small>
            </div>
          </article>`;
        }).join("") || `<div class="pb-health-empty">No unrecovered archived diagrams were found.</div>`}
      </div>
      <div class="pb-recovery-footer">
        <button type="button" class="btn btn-sm" data-recovery-action="previous"${legacyRecoveryState.page === 0 ? " disabled" : ""}>← Previous</button>
        <span>Page ${legacyRecoveryState.page + 1} of ${totalPages}</span>
        <button type="button" class="btn btn-sm" data-recovery-action="next"${legacyRecoveryState.page >= totalPages - 1 ? " disabled" : ""}>Next →</button>
      </div>`;
    const promote = document.getElementById("legacyDiagramRecoveryPromoteBtn");
    if (promote) promote.textContent = selectedCount ? `Recover ${selectedCount} confirmed diagram${selectedCount === 1 ? "" : "s"}` : "Recover selected diagrams";
    const status = document.getElementById("legacyDiagramRecoveryStatus");
    if (status) status.textContent = selectedCount ? `${selectedCount} confirmed mapping${selectedCount === 1 ? "" : "s"} ready.` : "Select a diagram and its correct play to recover it.";
  }

  function _miBindLegacyRecoveryWizard(overlay) {
    overlay.addEventListener("input", (event) => {
      const sourceKey = event.target?.dataset?.recoveryTargetSearch;
      if (!sourceKey || !legacyRecoveryState) return;
      legacyRecoveryState.targetQueries.set(sourceKey, event.target.value || "");
      const cursor = event.target.selectionStart;
      _miRenderLegacyRecoveryWizard();
      const search = [...overlay.querySelectorAll("[data-recovery-target-search]")]
        .find((input) => input.dataset.recoveryTargetSearch === sourceKey);
      if (search) {
        search.focus();
        const position = Number.isInteger(cursor) ? cursor : search.value.length;
        search.setSelectionRange(position, position);
      }
    });
    overlay.addEventListener("change", (event) => {
      const sourceKey = event.target?.dataset?.recoverySelect || event.target?.dataset?.recoveryTarget;
      if (!sourceKey || !legacyRecoveryState) return;
      if (event.target.dataset.recoverySelect) {
        if (event.target.checked && legacyRecoveryState.targets.get(sourceKey)) legacyRecoveryState.selected.add(sourceKey);
        else legacyRecoveryState.selected.delete(sourceKey);
      } else {
        legacyRecoveryState.targets.set(sourceKey, event.target.value || "");
        legacyRecoveryState.targetQueries.delete(sourceKey);
        if (event.target.value) legacyRecoveryState.selected.add(sourceKey);
        else legacyRecoveryState.selected.delete(sourceKey);
      }
      _miRenderLegacyRecoveryWizard();
    });
    overlay.addEventListener("click", (event) => {
      const action = event.target?.closest?.("[data-recovery-action]")?.dataset?.recoveryAction;
      if (!action || !legacyRecoveryState) return;
      if (action === "choose-target") {
        const button = event.target.closest("[data-recovery-action]");
        const sourceKey = String(button?.dataset?.recoverySourceKey || "");
        const mediaId = String(button?.dataset?.recoveryMediaId || "");
        if (!sourceKey || !mediaId) return;
        legacyRecoveryState.targets.set(sourceKey, mediaId);
        legacyRecoveryState.targetQueries.delete(sourceKey);
        legacyRecoveryState.selected.add(sourceKey);
        _miRenderLegacyRecoveryWizard();
        return;
      }
      if (action === "analyze-duplicates") {
        _miAnalyzeLegacyDuplicateGroups();
        return;
      }
      if (action === "toggle-excluded") {
        legacyRecoveryState.showExcluded = !legacyRecoveryState.showExcluded;
        _miRefreshRecoveryAssets();
      }
      if (action === "previous") legacyRecoveryState.page -= 1;
      if (action === "next") legacyRecoveryState.page += 1;
      if (action === "clear-selection") legacyRecoveryState.selected.clear();
      if (action === "select-exact") {
        legacyRecoveryState.assets.filter((asset) => asset.exact && !asset.verifiedCanonicalTarget && !asset.checksumConflict && !asset.targetContentMismatch && !asset.duplicateArchiveCopy && legacyRecoveryState.targets.get(asset.sourceKey))
          .forEach((asset) => legacyRecoveryState.selected.add(asset.sourceKey));
      }
      _miRenderLegacyRecoveryWizard();
    });
  }

  async function _miReadLegacyChecksum(sourceKey) {
    const response = await fetch(_miLegacyPreviewUrl(sourceKey), { credentials: "same-origin", cache: "no-store" });
    const checksum = String(response.headers.get("X-BC-Legacy-Checksum") || "").toLowerCase();
    if (!response.ok || !/^[a-f0-9]{64}$/.test(checksum)) {
      throw new Error("The archived image could not be checksum-verified.");
    }
    return checksum;
  }

  window.openLegacyDiagramRecoveryWizard = async function () {
    if (typeof isAdminUser === "function" && !isAdminUser()) return;
    const report = latestMediaInventoryReport || await buildMediaInventoryReport();
    const assets = _miRecoveryAssets(report);
    const targets = new Map(assets.filter((asset) => asset.proposedMediaId).map((asset) => [asset.sourceKey, asset.proposedMediaId]));
    legacyRecoveryState = {
      report,
      allAssets: assets,
      assets,
      targets,
      targetQueries: new Map(),
      selected: new Set(assets.filter((asset) => asset.proposedMediaId).map((asset) => asset.sourceKey)),
      duplicateAnalysis: null,
      duplicateAnalysisError: "",
      analyzingDuplicates: false,
      showExcluded: false,
      page: 0,
    };
    document.getElementById("legacyDiagramRecoveryOverlay")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "custom-modal-overlay visible";
    overlay.id = "legacyDiagramRecoveryOverlay";
    overlay.dataset.action = "closeLegacyDiagramRecoveryWizardOverlay";
    overlay.innerHTML = `<div class="custom-modal pb-health-modal pb-recovery-modal" role="dialog" aria-modal="true" aria-labelledby="legacyDiagramRecoveryTitle">
      <div class="custom-modal-header"><span class="custom-modal-icon">🗂️</span><h3 class="custom-modal-title" id="legacyDiagramRecoveryTitle">Recover Archived Diagrams</h3><button class="modal-close" aria-label="Close" data-action="closeLegacyDiagramRecoveryWizard">×</button></div>
      <div class="custom-modal-body pb-health-body" id="legacyDiagramRecoveryBody"></div>
      <div class="custom-modal-actions"><span id="legacyDiagramRecoveryStatus" class="pb-health-more"></span><button type="button" class="btn btn-primary btn-sm" id="legacyDiagramRecoveryPromoteBtn" data-action="recoverSelectedLegacyDiagrams">Recover selected diagrams</button><button type="button" class="btn btn-sm" data-action="closeLegacyDiagramRecoveryWizard">Done</button></div>
    </div>`;
    document.body.appendChild(overlay);
    if (typeof trapFocus === "function") trapFocus(overlay);
    _miBindLegacyRecoveryWizard(overlay);
    _miRenderLegacyRecoveryWizard();
  };

  window.closeLegacyDiagramRecoveryWizard = function () {
    document.getElementById("legacyDiagramRecoveryOverlay")?.remove();
    legacyRecoveryState = null;
  };

  window.recoverSelectedLegacyDiagrams = async function () {
    if (!legacyRecoveryState || (typeof isAdminUser === "function" && !isAdminUser())) return;
    const selectedItems = legacyRecoveryState.assets
      .filter((asset) => legacyRecoveryState.selected.has(asset.sourceKey) && legacyRecoveryState.targets.get(asset.sourceKey))
      .map((asset) => ({ sourceKey: asset.sourceKey, mediaId: legacyRecoveryState.targets.get(asset.sourceKey) }));
    if (!selectedItems.length) {
      if (typeof showToast === "function") showToast("Select at least one confirmed diagram mapping first.", { type: "warning" });
      return;
    }
    const proceed = typeof showConfirm === "function"
      ? await showConfirm(`Recover ${selectedItems.length} confirmed diagram${selectedItems.length === 1 ? "" : "s"}? Each archived image will be checksum-verified and copied into canonical Cloudflare storage. The archived originals remain untouched.`, { title: "Recover Diagrams", icon: "🗂️", confirmText: "Recover", cancelText: "Review" })
      : true;
    if (!proceed) return;
    const button = document.getElementById("legacyDiagramRecoveryPromoteBtn");
    if (button) { button.disabled = true; button.textContent = "Verifying archived diagrams…"; }
    try {
      const items = [];
      for (const item of selectedItems) {
        items.push({ ...item, expectedLegacyChecksum: await _miReadLegacyChecksum(item.sourceKey) });
      }
      const results = [];
      for (let index = 0; index < items.length; index += 100) {
        const response = await fetch("/images/migrate-legacy", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: items.slice(index, index + 100) }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Diagram recovery could not be completed.");
        results.push(..._miArray(payload.results));
      }
      const migrated = results.filter((item) => item.status === "migrated").length;
      const skipped = results.length - migrated;
      if (typeof showToast === "function") showToast(`${migrated} diagram${migrated === 1 ? "" : "s"} recovered${skipped ? `; ${skipped} kept for review` : ""}.`, { type: migrated ? "success" : "warning" });
      latestMediaInventoryReport = await buildMediaInventoryReport();
      await window.openLegacyDiagramRecoveryWizard();
    } catch (err) {
      if (typeof showToast === "function") showToast(err?.message || "Diagram recovery could not be completed.", { type: "error" });
      if (button) { button.disabled = false; button.textContent = "Recover selected diagrams"; }
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
