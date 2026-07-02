const DANGEROUS_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "base",
  "meta",
  "form",
  "style",
]);
// Note: input/select/textarea are intentionally NOT blocked. They are not
// script-execution vectors, and several trusted app panels (play editor,
// readiness panel, etc.) render their form fields through setInnerHTML().
// Script execution is still prevented by stripping <script>/<style>/<iframe>/
// on* handlers and javascript: URLs below.
const ALLOWED_ATTR_PREFIX = ["data-", "aria-"];
const SAFE_ATTRS = new Set([
  "href",
  "src",
  "alt",
  "title",
  "class",
  "id",
  "width",
  "height",
  "colspan",
  "rowspan",
  "type",
  "value",
  "checked",
  "disabled",
  "placeholder",
  "name",
  "target",
  "rel",
  "download",
  "role",
  "for",
  "autocomplete",
  "autofocus",
  "accept",
  "rows",
  "minlength",
  "maxlength",
  "min",
  "max",
  "step",
  "pattern",
  "inputmode",
  "list",
  "selected",
  "multiple",
  "required",
  "readonly",
]);

function sanitizeHTML(html) {
  if (!html) return "";

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);

    const toRemove = [];
    let node = walker.currentNode;
    while (node) {
      if (DANGEROUS_TAGS.has(node.tagName.toLowerCase())) {
        toRemove.push(node);
      } else {
        [...node.attributes].forEach((attr) => {
          const name = attr.name.toLowerCase();
          if (name.startsWith("on")) {
            node.removeAttribute(attr.name);
            return;
          }
          if (
            (name === "href" || name === "src") &&
            attr.value
              .replace(/\s/g, "")
              .toLowerCase()
              .startsWith("javascript:")
          ) {
            node.removeAttribute(attr.name);
            return;
          }
          const allowed =
            SAFE_ATTRS.has(name) ||
            ALLOWED_ATTR_PREFIX.some((prefix) => name.startsWith(prefix));
          if (!allowed) node.removeAttribute(attr.name);
        });
      }
      node = walker.nextNode();
    }
    toRemove.forEach((el) => el.remove());
    return doc.body.innerHTML;
  } catch {
    return String(html).replace(/<[^>]*>/g, "");
  }
}

function setInnerHTML(el, html) {
  if (!el) return;
  el.innerHTML = sanitizeHTML(html);
}

function trapFocus(overlay) {
  overlay.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const focusable = overlay.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

const activeAppLayers = new Map();
let appLayerBodyLockState = null;
let appLayerTouchMoveHandler = null;

function getLayerElement(layer) {
  if (typeof layer === "string") return document.getElementById(layer);
  return layer instanceof HTMLElement ? layer : null;
}

function getLayerId(layer, options = {}) {
  return (
    options.id ||
    layer?.id ||
    layer?.dataset?.layerId ||
    `app-layer-${activeAppLayers.size + 1}`
  );
}

function getActiveLayerState() {
  const states = Array.from(activeAppLayers.values());
  return states[states.length - 1] || null;
}

function preventBackgroundLayerTouch(event) {
  const activeLayer = getActiveLayerState();
  if (!activeLayer) return;
  const scrollElement = activeLayer.scrollElement || activeLayer.element;
  if (scrollElement?.contains?.(event.target)) return;
  event.preventDefault();
}

function lockBodyForLayer() {
  if (appLayerBodyLockState) return;
  appLayerBodyLockState = {
    scrollX: window.scrollX || 0,
    scrollY: window.scrollY || 0,
    bodyTop: document.body.style.top,
    bodyLeft: document.body.style.left,
    scrollOwner: document.body.dataset.scrollOwner || "",
  };
  document.documentElement.style.setProperty(
    "--app-layer-scroll-y",
    `${appLayerBodyLockState.scrollY}px`,
  );
  document.body.style.top = `-${appLayerBodyLockState.scrollY}px`;
  document.body.style.left = `-${appLayerBodyLockState.scrollX}px`;
  document.body.classList.add("app-layer-locked");
  // While a blocking layer is open the layer owns scroll, not the document or
  // workbench panel. Record it so the scroll-ownership contract has one truth.
  document.body.dataset.scrollOwner = "layer";
  appLayerTouchMoveHandler = preventBackgroundLayerTouch;
  document.addEventListener("touchmove", appLayerTouchMoveHandler, {
    passive: false,
  });
}

function unlockBodyForLayer() {
  if (!appLayerBodyLockState || activeAppLayers.size > 0) return;
  const { scrollX, scrollY, bodyTop, bodyLeft, scrollOwner } = appLayerBodyLockState;
  appLayerBodyLockState = null;
  document.body.classList.remove("app-layer-locked");
  document.body.style.top = bodyTop;
  document.body.style.left = bodyLeft;
  if (scrollOwner) document.body.dataset.scrollOwner = scrollOwner;
  else delete document.body.dataset.scrollOwner;
  document.documentElement.style.removeProperty("--app-layer-scroll-y");
  if (appLayerTouchMoveHandler) {
    document.removeEventListener("touchmove", appLayerTouchMoveHandler);
    appLayerTouchMoveHandler = null;
  }
  window.scrollTo(scrollX, scrollY);
}

function openLayer(layer, options = {}) {
  const element = getLayerElement(layer);
  if (!element) return false;
  const id = getLayerId(element, options);
  const blocking = options.blocking !== false;
  const state = {
    id,
    element,
    blocking,
    scrollElement: getLayerElement(options.scrollElement) || null,
    returnFocus:
      options.returnFocus === false
        ? null
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null,
  };

  if (options.exclusive !== false) {
    Array.from(activeAppLayers.keys()).forEach((activeId) => {
      if (activeId !== id) closeLayer(activeId, { returnFocus: false });
    });
  }

  activeAppLayers.set(id, state);
  element.dataset.layerId = id;
  element.dataset.layerOpen = "true";
  element.classList.add("app-layer-active");
  if (options.safeArea !== false) element.classList.add("app-layer-safe-area");
  if (blocking) lockBodyForLayer();
  if (options.trapFocus !== false && !element.dataset.focusTrapReady) {
    trapFocus(element);
    element.dataset.focusTrapReady = "true";
  }
  return true;
}

function closeLayer(layer, options = {}) {
  const element = getLayerElement(layer);
  const id =
    typeof layer === "string"
      ? layer
      : element?.dataset?.layerId || element?.id || "";
  const state = activeAppLayers.get(id);
  if (!state) return false;

  activeAppLayers.delete(id);
  state.element.dataset.layerOpen = "false";
  state.element.classList.remove("app-layer-active", "app-layer-safe-area");
  if (options.returnFocus !== false && state.returnFocus?.isConnected) {
    state.returnFocus.focus();
  }
  unlockBodyForLayer();
  return true;
}

function addLongPress(element, callback, duration) {
  duration = duration || 500;
  let timer = null;
  let startX = 0;
  let startY = 0;

  element.addEventListener(
    "touchstart",
    (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      timer = setTimeout(() => {
        const touch = e.changedTouches[0] || e.touches[0];
        callback({
          clientX: touch.clientX,
          clientY: touch.clientY,
          preventDefault: () => { },
          target: e.target,
        });
      }, duration);
    },
    { passive: true },
  );

  element.addEventListener("touchmove", (e) => {
    if (!timer) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clearTimeout(timer);
      timer = null;
    }
  });

  element.addEventListener("touchend", () => {
    clearTimeout(timer);
    timer = null;
  });
  element.addEventListener("touchcancel", () => {
    clearTimeout(timer);
    timer = null;
  });
}

function showContextMenu(event, menu, selector = ".cs-context-menu") {
  event.preventDefault();
  document.querySelector(selector)?.remove();

  menu.style.position = "fixed";
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  menu.style.visibility = "hidden";
  document.body.appendChild(menu);

  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
    menu.style.visibility = "visible";
  });

  const closeHandler = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 0);
}

let _reorderDraggedIdx = null;
let _reorderTempOrder = null;

function showReorderModal(values, opts) {
  const modalId = "_reorderModal";
  const listId = "_reorderList";
  _reorderTempOrder = [...values];

  function renderList() {
    return _reorderTempOrder
      .map(
        (val, idx) => `
      <div class="custom-order-item" draggable="true" data-idx="${idx}"
           data-drag="reorder">
        <span class="drag-handle">☰</span>
        <span class="order-number">${idx + 1}.</span>
        <span class="order-value">${escapeHtml(val)}</span>
      </div>`,
      )
      .join("");
  }

  function close() {
    const el = document.getElementById(modalId);
    if (el) el.remove();
    _reorderTempOrder = null;
    _reorderDraggedIdx = null;
    if (opts.onClose) opts.onClose();
  }

  window._reorderClose = function (event) {
    if (event && event.target && event.target.id !== modalId) return;
    close();
  };

  window._reorderSave = function () {
    if (_reorderTempOrder && opts.onSave) opts.onSave([..._reorderTempOrder]);
    close();
  };

  window._reorderClear = function () {
    if (opts.onClear) opts.onClear();
    close();
  };

  const modalHtml = `
    <div id="${modalId}" class="modal-overlay show" data-action="_reorderCloseOverlay">
      <div class="modal-content modal-content-xs">
        <div class="modal-header-row">
          <h3 class="modal-title">${opts.title || "Custom Order"}</h3>
          <button data-action="_reorderClose" class="modal-close-btn">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-copy-note">
            ${escapeHtml(opts.note || "Drag values to set your preferred sort order. Top = first.")}
          </p>
          <div id="${listId}" class="custom-order-list">
            ${renderList()}
          </div>
          <div class="modal-action-row-wrap">
            <button data-action="_reorderSave" class="btn btn-primary modal-btn-padded">
              ${escapeHtml(opts.saveLabel || "💾 Save Order")}
            </button>
            ${opts.onClear
      ? `<button data-action="_reorderClear" class="btn btn-secondary modal-btn-padded">
              🗑️ Clear Custom Order
            </button>`
      : ""
    }
            <button data-action="_reorderClose" class="btn modal-btn-padded">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>`;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = modalHtml;
  document.body.appendChild(wrapper.firstElementChild);

  const overlay = document.getElementById(modalId);
  const list = document.getElementById(listId);
  if (!overlay || !list) return;

  const renderIntoList = () => {
    list.innerHTML = renderList();
    bindDragHandlers();
  };

  const bindDragHandlers = () => {
    list.querySelectorAll("[data-drag='reorder']").forEach((item) => {
      item.addEventListener("dragstart", () => {
        _reorderDraggedIdx = parseInt(item.dataset.idx, 10);
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
      });
      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        item.classList.add("drag-over");
      });
      item.addEventListener("dragleave", () => {
        item.classList.remove("drag-over");
      });
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        item.classList.remove("drag-over");
        const targetIdx = parseInt(item.dataset.idx, 10);
        if (
          !Number.isInteger(_reorderDraggedIdx) ||
          !Number.isInteger(targetIdx) ||
          _reorderDraggedIdx === targetIdx
        ) {
          return;
        }
        const [moved] = _reorderTempOrder.splice(_reorderDraggedIdx, 1);
        _reorderTempOrder.splice(targetIdx, 0, moved);
        _reorderDraggedIdx = targetIdx;
        renderIntoList();
      });
    });
  };

  bindDragHandlers();
}

// ============================================================
// Page-Help Persistence (#213)
// Saves <details class="page-help" data-help-key="…"> open/closed
// state per page across sessions using storageManager.
// ============================================================
function initPageHelp() {
  const saved = storageManager.get(STORAGE_KEYS.PAGE_HELP_OPEN, {});
  document.querySelectorAll("details.page-help[data-help-key]").forEach((el) => {
    const key = el.dataset.helpKey;
    if (!key) return;
    // Restore saved state
    if (saved[key] === true) el.open = true;
    // Persist on toggle
    el.addEventListener("toggle", () => {
      const state = storageManager.get(STORAGE_KEYS.PAGE_HELP_OPEN, {});
      state[key] = el.open;
      storageManager.set(STORAGE_KEYS.PAGE_HELP_OPEN, state);
    });
  });
}

/**
 * Force a page-help disclosure open for empty/new states (#214).
 * Called by modules after loading when no data is present.
 * @param {string} key - data-help-key value
 */
function forceOpenPageHelp(key) {
  if (!key) return;
  const state = storageManager.get(STORAGE_KEYS.PAGE_HELP_OPEN, {});
  state[key] = true;
  storageManager.set(STORAGE_KEYS.PAGE_HELP_OPEN, state);
  const disc = document.querySelector(`details.page-help[data-help-key="${key}"]`);
  if (disc) disc.open = true;
}

// ============================================================
// Dev Contract Checks (#282-287)
// Run runContractChecks() in the browser console to validate
// viewport, dropdown, header, grid, touch-target, and overflow.
// ============================================================
function runContractChecks() {
  const results = [];
  const log = (pass, msg) => { results.push({ pass, msg }); };

  // #282: Every open dropdown stays inside viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  document.querySelectorAll(".tool-menu-wrap.open .tool-menu, .more-tools-wrap.open .more-tools-menu").forEach((menu) => {
    const r = menu.getBoundingClientRect();
    const inside = r.left >= 0 && r.right <= vw && r.top >= 0 && r.bottom <= vh;
    log(inside, `#282 dropdown inside viewport: ${menu.id || menu.className.split(" ")[0]} — ${inside ? "PASS" : "FAIL (right=" + Math.round(r.right) + " vw=" + vw + ")"}`);
  });

  // #284: Header stays compact — check #appHeader height ≤ 60px
  const header = document.getElementById("appHeader");
  if (header) {
    const h = header.getBoundingClientRect().height;
    log(h <= 60, `#284 header height ≤ 60px: ${Math.round(h)}px — ${h <= 60 ? "PASS" : "FAIL"}`);
  }

  // #286: All visible buttons ≥ 36px tall (min touch target)
  let smallBtns = 0;
  document.querySelectorAll("button:not([hidden]):not([disabled])").forEach((btn) => {
    const r = btn.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return; // not rendered
    if (r.height < 36) smallBtns++;
  });
  log(smallBtns === 0, `#286 min touch target (36px): ${smallBtns} button(s) below threshold — ${smallBtns === 0 ? "PASS" : "WARN"}`);

  // #287: No page-level horizontal overflow
  const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth;
  log(!overflowX, `#287 no horizontal overflow: scrollWidth=${document.documentElement.scrollWidth} clientWidth=${document.documentElement.clientWidth} — ${!overflowX ? "PASS" : "FAIL"}`);

  // Output
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.group(`BCOffense Contract Checks — ${pass} pass, ${fail} fail`);
  results.forEach((r) => console.log(`${r.pass ? "✅" : "❌"} ${r.msg}`));
  console.groupEnd();
  return { pass, fail, results };
}

/**
 * Dev report: list all visible fixed/absolute floating layers (#8).
 * Run in browser console: reportFloatingLayers()
 */
function reportFloatingLayers() {
  const results = [];
  document.querySelectorAll("*").forEach((el) => {
    const style = window.getComputedStyle(el);
    const pos = style.position;
    if (pos !== "fixed" && pos !== "absolute") return;
    if (style.display === "none" || style.visibility === "hidden") return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    results.push({
      position: pos,
      selector: (el.id ? "#" + el.id : "") + (el.className ? "." + String(el.className).split(" ")[0] : el.tagName.toLowerCase()),
      size: `${Math.round(r.width)}×${Math.round(r.height)}`,
      top: Math.round(r.top),
    });
  });
  console.group(`Floating layers (#8): ${results.length}`);
  results.forEach((r) => console.log(`${r.position}: ${r.selector} — ${r.size} @ top:${r.top}`));
  console.groupEnd();
  return results;
}

/**
 * Dev report: list all elements causing horizontal overflow (#9).
 * Run in browser console: reportHorizontalOverflow()
 */
function reportHorizontalOverflow() {
  const results = [];
  const docWidth = document.documentElement.clientWidth;
  document.querySelectorAll("*").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right > docWidth + 1) {
      results.push({
        selector: (el.id ? "#" + el.id : "") + (el.className ? "." + String(el.className).split(" ")[0] : el.tagName.toLowerCase()),
        overflowBy: Math.round(r.right - docWidth),
      });
    }
  });
  console.group(`Horizontal overflow (#9): ${results.length} element(s)`);
  results.forEach((r) => console.log(`${r.selector} overflows by ${r.overflowBy}px`));
  console.groupEnd();
  return results;
}

// ── Toolbar ResizeObserver (#251) ────────────────────────────
/**
 * Watch all .toolbar-surface elements for overflow and toggle
 * the .toolbar-overflowing class when their content exceeds their width.
 * Called once from app-init.js after DOM bootstrap.
 */
function initToolbarResizeObserver() {
  if (!window.ResizeObserver) return;
  const ro = new ResizeObserver((entries) => {
    entries.forEach(({ target }) => {
      const overflowing = target.scrollWidth > target.clientWidth + 2;
      target.classList.toggle("toolbar-overflowing", overflowing);
    });
  });
  document.querySelectorAll(".toolbar-surface").forEach((el) => ro.observe(el));
}
