// wristband-logo.js — Wristband logo card feature
// Extracted from wristband-export.js

function _getWbLogoCardSettings() {
  const stored =
    typeof storageManager !== "undefined" && typeof STORAGE_KEYS !== "undefined"
      ? storageManager.get(STORAGE_KEYS.WRISTBAND_LOGO_CARD, {})
      : {};
  const source = stored && typeof stored === "object" ? stored : {};
  const dataUrl =
    typeof source.dataUrl === "string" && source.dataUrl.startsWith("data:image/")
      ? source.dataUrl
      : "";
  const originalDataUrl =
    typeof source.originalDataUrl === "string" && source.originalDataUrl.startsWith("data:image/")
      ? source.originalDataUrl
      : dataUrl;
  const smartDataUrl =
    typeof source.smartDataUrl === "string" && source.smartDataUrl.startsWith("data:image/")
      ? source.smartDataUrl
      : "";
  return {
    dataUrl,
    originalDataUrl,
    smartDataUrl,
    name: String(source.name || "").trim(),
    fit: source.fit === "cover" ? "cover" : "contain",
    smartCenter: source.smartCenter !== false,
    updatedAt: source.updatedAt || "",
  };
}

function _saveWbLogoCardSettings(settings) {
  if (typeof storageManager === "undefined" || typeof STORAGE_KEYS === "undefined") return false;
  const current = _getWbLogoCardSettings();
  const next = {
    ...current,
    ...settings,
    fit: settings?.fit === "cover" ? "cover" : settings?.fit === "contain" ? "contain" : current.fit,
    smartCenter:
      typeof settings?.smartCenter === "boolean" ? settings.smartCenter : current.smartCenter,
    updatedAt: new Date().toISOString(),
  };
  return storageManager.set(STORAGE_KEYS.WRISTBAND_LOGO_CARD, next);
}

function _readWbLogoFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read logo file."));
    reader.readAsDataURL(file);
  });
}

function _loadWbLogoImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load logo image."));
    img.src = dataUrl;
  });
}

function _getWbLogoBackgroundColor(data, width, height) {
  const samples = [
    [0, 0],
    [Math.max(0, width - 1), 0],
    [0, Math.max(0, height - 1)],
    [Math.max(0, width - 1), Math.max(0, height - 1)],
  ];
  const totals = samples.reduce(
    (acc, [x, y]) => {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3] / 255;
      if (alpha < 0.05) return acc;
      acc.r += data[idx] * alpha;
      acc.g += data[idx + 1] * alpha;
      acc.b += data[idx + 2] * alpha;
      acc.weight += alpha;
      return acc;
    },
    { r: 0, g: 0, b: 0, weight: 0 },
  );
  if (totals.weight <= 0) return { r: 255, g: 255, b: 255 };
  return {
    r: totals.r / totals.weight,
    g: totals.g / totals.weight,
    b: totals.b / totals.weight,
  };
}

function _isWbLogoInkPixel(data, idx, bg) {
  const alpha = data[idx + 3];
  if (alpha < 14) return false;
  if (alpha < 245) return true;
  const dr = data[idx] - bg.r;
  const dg = data[idx + 1] - bg.g;
  const db = data[idx + 2] - bg.b;
  return Math.sqrt(dr * dr + dg * dg + db * db) > 42;
}

function _findWbLogoInkBounds(imageData) {
  const { data, width, height } = imageData;
  const bg = _getWbLogoBackgroundColor(data, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      if (!_isWbLogoInkPixel(data, idx, bg)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width, height };
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

function _getWbLogoDisplayDataUrl(settings) {
  if (settings.smartCenter && settings.smartDataUrl) return settings.smartDataUrl;
  return settings.dataUrl || settings.originalDataUrl || "";
}

function _buildWbLogoPrintCard(settings = _getWbLogoCardSettings()) {
  const logoDataUrl = _getWbLogoDisplayDataUrl(settings);
  if (!logoDataUrl) {
    return `<div class="wb-logo-print-card wb-logo-empty-card">
      <span>Upload Logo</span>
    </div>`;
  }
  const fit = settings.fit === "cover" ? "cover" : "contain";
  const name = settings.name || "School logo";
  const smartClass = settings.smartCenter ? " wb-logo-smart-centered" : "";
  return `<div class="wb-logo-print-card wb-logo-fit-${fit}${smartClass}">
    <img src="${escapeHtml(logoDataUrl)}" alt="${escapeHtml(name)}" />
  </div>`;
}

function renderWbLogoCardModal() {
  const settings = _getWbLogoCardSettings();
  const preview = document.getElementById("wbLogoCardPreview");
  const meta = document.getElementById("wbLogoCardMeta");
  if (preview) {
    preview.innerHTML = _buildWbLogoPrintCard(settings);
  }
  if (meta) {
    meta.textContent = settings.dataUrl
      ? `${settings.name || "Saved logo"} ready to print at ${WRISTBAND_PRINT_SIZE_LABEL}.`
      : "No logo uploaded yet.";
  }
  document.querySelectorAll('input[name="wbLogoCardFit"]').forEach((input) => {
    input.checked = input.value === settings.fit;
  });
  const smartToggle = document.getElementById("wbLogoSmartCenter");
  if (smartToggle) smartToggle.checked = settings.smartCenter;
  const hasLogo = Boolean(_getWbLogoDisplayDataUrl(settings));
  ["wbLogoPrintOneBtn", "wbLogoPrintThreeBtn"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !hasLogo;
  });
}

function openWbLogoCardModal() {
  renderWbLogoCardModal();
  _refreshWbLogoSmartDataUrl().catch((err) => {
    console.warn("openWbLogoCardModal smart-center refresh failed:", err);
  });
  const overlay = setWristbandOverlayVisibility(
    "wbLogoCardOverlay",
    true,
    { visibilityClass: "show", openClass: true },
  );
  if (overlay) trapFocus(overlay);
}

function closeWbLogoCardModal() {
  setWristbandOverlayVisibility(
    "wbLogoCardOverlay",
    false,
    { visibilityClass: "show", openClass: true },
  );
}

function setWbLogoCardFit(value) {
  _saveWbLogoCardSettings({ fit: value === "cover" ? "cover" : "contain" });
  renderWbLogoCardModal();
}

function setWbLogoSmartCenter() {
  const smartCenter = Boolean(document.getElementById("wbLogoSmartCenter")?.checked);
  _saveWbLogoCardSettings({ smartCenter });
  renderWbLogoCardModal();
  if (smartCenter) {
    _refreshWbLogoSmartDataUrl({ showToast: true }).catch((err) => {
      console.warn("setWbLogoSmartCenter refresh failed:", err);
    });
  }
}

function _printWbLogoCard(copyMode = "one") {
  const settings = _getWbLogoCardSettings();
  if (!settings.dataUrl) {
    showToast("Upload a logo before printing a logo card.", { type: "warning" });
    openWbLogoCardModal();
    return;
  }

  const printContainer = document.getElementById("playerCardPrint");
  const printContent = document.getElementById("playerCardPrintContent");
  if (!printContainer || !printContent) return;
  const cardHtml = _buildWbLogoPrintCard(settings);
  const pageClass = copyMode === "three" ? "wb-logo-print-page" : "pc-print-single wb-logo-print-page";
  const pageBody =
    copyMode === "three"
      ? `${cardHtml}${cardHtml}${cardHtml}`
      : cardHtml;
  _triggerPlayerPrint(
    printContainer,
    printContent,
    `<div class="pc-print-page ${pageClass}">${pageBody}</div>`,
    "Wristband Logo Card",
    "portrait",
  );
}

function printWbLogoCardOne() {
  _printWbLogoCard("one");
}

function printWbLogoCardThree() {
  _printWbLogoCard("three");
}

function printPlayerCards() {
  // Now routes to printOnePlayerCard for backward compat
  printOnePlayerCard();
}
