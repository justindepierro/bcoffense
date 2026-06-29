// ============================================================
// IDENTITY TAB — read-only render of the 2026 offensive vision
//
// Renders VISION_2026 as a print-friendly reference page.
// Visible at all times; content emphasizes vision branding when
// Vision Mode is ON.
// ============================================================

function _idEsc(s) {
  return typeof escapeHtml === "function" ? escapeHtml(String(s)) : String(s);
}

function _idList(items) {
  if (!items || !items.length) return "";
  return (
    "<ul class='id-list'>" +
    items.map((i) => `<li>${_idEsc(i)}</li>`).join("") +
    "</ul>"
  );
}

// Cards collapse into an accordion on phone (review/quick-edit mode); on
// desktop/tablet the collapse class has no visual effect (see identity.css).
let _idCollapseCards = false;

function _idCard(title, bodyHtml, opts = {}) {
  const collapsed = _idCollapseCards;
  const cls = ["id-card", opts.cls || "", collapsed ? "id-card-collapsed" : ""]
    .filter(Boolean)
    .join(" ");
  return `
    <section class="${cls}">
      <button type="button" class="id-card-title" data-action="toggleIdentityCard" aria-expanded="${collapsed ? "false" : "true"}">
        <span class="id-card-title-text">${_idEsc(title)}</span>
        <span class="id-card-chevron" aria-hidden="true">▾</span>
      </button>
      <div class="id-card-body">${bodyHtml}</div>
    </section>
  `;
}

// Toggle a single Identity card open/closed (phone accordion).
function toggleIdentityCard(el) {
  const card = el && el.closest ? el.closest(".id-card") : null;
  if (!card) return;
  const collapsed = card.classList.toggle("id-card-collapsed");
  el.setAttribute("aria-expanded", collapsed ? "false" : "true");
}

function renderIdentity() {
  const root = document.getElementById("identity");
  if (!root) return;
  if (typeof VISION_2026 === "undefined") {
    root.innerHTML =
      "<div class='id-empty'>Vision config not loaded.</div>";
    return;
  }
  const v = VISION_2026;
  const visionOn =
    typeof isVisionMode === "function" && isVisionMode();
  // Collapse cards by default only on phone so the long reference page is
  // scannable; desktop/tablet always render expanded.
  _idCollapseCards = document.body.classList.contains("is-phone-screen");

  const pictures = Object.values(v.pictures || {});
  const picturesHtml = pictures
    .map(
      (p) => `
        <div class="id-picture">
          <h4>${_idEsc(p.name)}</h4>
          ${_idList(p.calls)}
        </div>`,
    )
    .join("");

  const fieldZonesHtml = `
    <table class="id-table">
      <thead><tr><th>Zone</th><th>Range</th></tr></thead>
      <tbody>
        ${(v.fieldZones || [])
      .map(
        (z) =>
          `<tr><td>${_idEsc(z.name)}</td><td>${_idEsc(z.range)}</td></tr>`,
      )
      .join("")}
      </tbody>
    </table>
  `;

  const directionalHtml = `
    <p class="id-note"><strong>Handedness:</strong> ${_idEsc(
    v.directionalRules?.handedness || "right",
  )}</p>
    <table class="id-table">
      <thead><tr><th>Concept</th><th>Call</th></tr></thead>
      <tbody>
        ${Object.entries(v.directionalRules?.gapMap || {})
      .map(
        ([k, val]) =>
          `<tr><td>${_idEsc(k)}</td><td>${_idEsc(val)}</td></tr>`,
      )
      .join("")}
      </tbody>
    </table>
    <p class="id-note id-note-muted">${_idEsc(
        v.directionalRules?.note || "",
      )}</p>
  `;

  const yellow = v.yellow || {};
  const yellowHtml = `
    <p class="id-note"><strong>Bodies:</strong></p>
    <table class="id-table">
      <thead><tr><th>Position</th><th>Player</th></tr></thead>
      <tbody>
        ${Object.entries(yellow.bodies || {})
      .map(
        ([k, val]) =>
          `<tr><td>${_idEsc(k)}</td><td>${_idEsc(val)}</td></tr>`,
      )
      .join("")}
      </tbody>
    </table>
    <p class="id-note"><strong>Yellow Core 6:</strong></p>
    ${_idList(yellow.coreSix)}
    <p class="id-note"><strong>Earned constraints:</strong></p>
    ${_idList(yellow.earnedConstraints)}
    <p class="id-note"><strong>Yellow RPO module:</strong></p>
    ${_idList(yellow.rpoModule)}
    <p class="id-note id-note-muted">${_idEsc(yellow.purpose || "")}</p>
  `;

  const variationHtml = `
    <table class="id-table">
      <thead>
        <tr>
          <th>Base</th><th>Variation</th><th>Earned When</th>
        </tr>
      </thead>
      <tbody>
        ${(v.variationTriggers || [])
      .map(
        (t) =>
          `<tr>
                <td>${_idEsc(t.base)}</td>
                <td>${_idEsc(t.variation)}</td>
                <td>${_idEsc(t.trigger)}</td>
              </tr>`,
      )
      .join("")}
      </tbody>
    </table>
  `;

  const screens = v.screens || {};
  const screensHtml = `
    <p class="id-note"><strong>Double:</strong> ${_idEsc(
    (screens.double || []).join(" / "),
  )}</p>
    <p class="id-note"><strong>Tunnel / Influence:</strong> ${_idEsc(
    (screens.tunnelInfluence || []).join(" / "),
  )}</p>
    <p class="id-note"><strong>Middle:</strong> ${_idEsc(
    (screens.middle || []).join(" / "),
  )}</p>
    <p class="id-note id-note-muted"><strong>Optional:</strong> ${_idEsc(
    (screens.optional || []).join(" / "),
  )}</p>
  `;

  const td = v.thirdDownFamilies || {};
  const thirdDownHtml = `
    <p class="id-note"><strong>Cross / Trail / Railroad:</strong> ${_idEsc(
    (td.crossTrail || []).join(", "),
  )}</p>
    <p class="id-note"><strong>Crow / Mets / Queens:</strong> ${_idEsc(
    (td.crow || []).join(", "),
  )}</p>
    <p class="id-note"><strong>Dagger / Sail / Bench:</strong> ${_idEsc(
    (td.daggerSail || []).join(", "),
  )}</p>
    ${_idList(td.rules)}
  `;

  const rep = v.repDistribution?.byPicture || {};
  const repHtml = `
    <table class="id-table">
      <thead><tr><th>Picture</th><th>Target Reps</th></tr></thead>
      <tbody>
        ${Object.entries(rep)
      .map(
        ([k, val]) =>
          `<tr><td>${_idEsc(k)}</td><td>${Math.round(
            Number(val) * 100,
          )}%</td></tr>`,
      )
      .join("")}
      </tbody>
    </table>
  `;

  const identity = v.identityStatement || {};
  const identityHtml = `
    <p class="id-statement">${_idEsc(identity.who || "")}</p>
    <p class="id-note"><strong>What we major in:</strong></p>
    ${_idList(identity.majorIn)}
    <p class="id-note"><strong>What we refuse to be:</strong></p>
    ${_idList(identity.refuse)}
  `;

  const qbHtml = _idList(v.qbLanguage);
  const checklistHtml = _idList(v.staffChecklist);

  const ip = v.installPlan || {};
  const installHtml = `
    <div class="id-install">
      <div class="id-install-day">
        <h4>Day 1</h4>
        ${_idList(ip.day1)}
      </div>
      <div class="id-install-day">
        <h4>Day 2</h4>
        ${_idList(ip.day2)}
      </div>
      <div class="id-install-day">
        <h4>Day 3</h4>
        ${_idList(ip.day3)}
      </div>
    </div>
  `;

  root.innerHTML = `
    <div class="id-shell ${visionOn ? "id-vision-on" : ""}">
      <header class="id-hero">
        <div>
          <span class="id-eyebrow">Offensive Identity</span>
          <h2 class="id-title">2026 Framework</h2>
          <p class="id-subtitle">${visionOn
      ? "Vision Mode is <strong>ON</strong> — this is the active framework."
      : "Vision Mode is <strong>OFF</strong> — this page is reference only."
    }</p>
        </div>
        <div class="id-hero-actions">
          <button class="btn btn-sm btn-outline" data-action="printIdentity">🖨️ Print</button>
          <button class="btn btn-sm ${visionOn ? "btn-success" : "btn-primary"
    }" data-action="toggleVisionMode">
            ${visionOn ? "🎯 Vision ON" : "🧭 Turn Vision On"}
          </button>
        </div>
      </header>

      <div class="id-grid">
        ${_idCard("Identity Statement", identityHtml, { cls: "id-card-wide" })}
        ${_idCard(
      "The Four Pictures",
      `<div class="id-pictures">${picturesHtml}</div>`,
      { cls: "id-card-wide" },
    )}
        ${_idCard("Field Zones", fieldZonesHtml)}
        ${_idCard("Directional Gap Rules", directionalHtml)}
        ${_idCard("Yellow Personnel", yellowHtml, { cls: "id-card-wide" })}
        ${_idCard("Variation Triggers (earned)", variationHtml, {
      cls: "id-card-wide",
    })}
        ${_idCard("Weekly Screen Module", screensHtml)}
        ${_idCard("3rd Down Pass Families", thirdDownHtml)}
        ${_idCard("QB Language", qbHtml)}
        ${_idCard("Practice Rep Distribution (target)", repHtml)}
        ${_idCard("Camp Install Plan (Day 1–2–3)", installHtml, { cls: "id-card-wide" })}
        ${_idCard("Staff Checklist", checklistHtml, { cls: "id-card-wide" })}
      </div>
    </div>
  `;
}

function printIdentity() {
  // Render fresh, then print. Browser print picks up @media print rules.
  renderIdentity();
  document.body.dataset.printMode = "identity";
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    delete document.body.dataset.printMode;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 60000);
  try {
    window.print();
  } catch (e) {
    cleanup();
    throw e;
  }
}

document.addEventListener("visionmodechange", () => {
  if (currentActiveTab === "identity") renderIdentity();
});
