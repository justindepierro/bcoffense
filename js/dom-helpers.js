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
  "autoplay",
  "controls",
  "controlslist",
  "disablepictureinpicture",
  "loop",
  "muted",
  "playsinline",
  "poster",
  "preload",
]);

// Dynamic workbench controls are often built from play data after initial
// page load. Give each anonymous field a stable-in-page identity so browser
// autofill and accessibility tooling can recognize it without changing the
// existing data-action/data-field event contracts.
let bcGeneratedFormFieldId = 0;

function getGeneratedFormFieldToken(field) {
  const raw = [
    field.getAttribute("aria-label"),
    field.getAttribute("placeholder"),
    field.dataset?.field,
    field.dataset?.arg,
    field.dataset?.key,
    field.type,
    field.tagName?.toLowerCase(),
  ].find((value) => String(value || "").trim());
  const normalized = String(raw || "field")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || "field";
}

function hasAssociatedFormFieldLabel(field) {
  if (field.closest?.("label")) return true;
  if (field.labels?.length) return true;
  return Boolean(field.getAttribute("aria-label") || field.getAttribute("aria-labelledby"));
}

function ensureFormFieldIdentity(root = document) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  const fields = [];
  if (root.matches?.("input, select, textarea")) fields.push(root);
  root.querySelectorAll("input, select, textarea").forEach((field) => fields.push(field));
  fields.forEach((field) => {
    // Hidden state carriers are not user-editable form controls. They do not
    // need an accessible label, but retaining their existing id remains useful
    // to the owning feature.
    if (field.type === "hidden") return;
    const token = getGeneratedFormFieldToken(field);
    if (!field.id && !field.name) {
      bcGeneratedFormFieldId += 1;
      field.id = `bc-form-field-${token}-${bcGeneratedFormFieldId}`;
    }
    // Dynamic editor rows are not submitted as native forms, but a stable
    // name prevents browser autofill and DevTools from treating them as
    // anonymous fields. Preserve every explicit author-provided name.
    if (!field.name) field.name = field.id || `bc-form-field-${token}`;
    if (!hasAssociatedFormFieldLabel(field)) {
      field.setAttribute("aria-label", field.getAttribute("placeholder") || `${token.replace(/-/g, " ")} field`);
    }
  });

  const labels = [];
  if (root.matches?.("label")) labels.push(root);
  root.querySelectorAll("label").forEach((label) => labels.push(label));
  labels.forEach((label) => {
    if (label.htmlFor || label.querySelector("input, select, textarea")) return;
    const sibling = label.nextElementSibling;
    if (!sibling?.matches?.("input, select, textarea")) return;
    if (sibling.type === "hidden") return;
    if (!sibling.id && !sibling.name) {
      bcGeneratedFormFieldId += 1;
      sibling.id = `bc-form-field-${bcGeneratedFormFieldId}`;
    }
    label.htmlFor = sibling.id;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  ensureFormFieldIdentity();
  const observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) ensureFormFieldIdentity(node);
    }));
  });
  observer.observe(document.body, { childList: true, subtree: true });
});

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

const LAYER_FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "iframe",
  "object",
  "embed",
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function isLayerFocusCandidate(candidate, layer, options = {}) {
  if (!(candidate instanceof HTMLElement)) return false;
  if (layer && candidate !== layer && !layer.contains(candidate)) return false;
  if (candidate.hidden || candidate.matches("input[type='hidden']")) return false;
  if (candidate.matches("[disabled], [aria-disabled='true']")) return false;
  if (candidate.closest("[hidden], [inert], [aria-hidden='true']")) return false;
  if (!options.allowProgrammatic && candidate.tabIndex < 0) return false;
  return typeof candidate.focus === "function";
}

function getLayerFocusableElements(layer) {
  if (!(layer instanceof HTMLElement)) return [];
  return Array.from(layer.querySelectorAll(LAYER_FOCUSABLE_SELECTOR)).filter((candidate) =>
    isLayerFocusCandidate(candidate, layer),
  );
}

function focusLayerElement(target) {
  if (!(target instanceof HTMLElement) || typeof target.focus !== "function") {
    return false;
  }
  try {
    target.focus({ preventScroll: true });
  } catch (_error) {
    // Older browsers can reject focus options. Keep the focus behavior rather
    // than abandoning a blocking dialog's only reachable control.
    try {
      target.focus();
    } catch (_fallbackError) {
      return false;
    }
  }
  return document.activeElement === target;
}

function resolveLayerInitialFocus(layer, initialFocus) {
  let target = initialFocus;
  if (typeof target === "function") {
    try {
      target = target(layer);
    } catch (_error) {
      target = null;
    }
  }
  if (typeof target === "string") {
    try {
      target =
        (layer.matches?.(target) ? layer : null) ||
        layer.querySelector(target) ||
        document.getElementById(target);
    } catch (_error) {
      // An invalid selector is not a reason to leave a dialog unfocused. The
      // documented fallback sequence below will choose a safe target instead.
      target = document.getElementById(target) || null;
    }
  }
  return isLayerFocusCandidate(target, layer, { allowProgrammatic: true })
    ? target
    : null;
}

function getLayerAutofocusTarget(layer) {
  const candidates = [];
  if (layer.matches?.("[autofocus]")) candidates.push(layer);
  candidates.push(...layer.querySelectorAll("[autofocus]"));
  return candidates.find((candidate) =>
    isLayerFocusCandidate(candidate, layer, { allowProgrammatic: true }),
  ) || null;
}

function getLayerCloseTarget(layer) {
  return getLayerFocusableElements(layer).find((candidate) => {
    const action = String(candidate.dataset?.action || "").toLowerCase();
    const label = String(candidate.getAttribute("aria-label") || "").toLowerCase();
    const title = String(candidate.getAttribute("title") || "").toLowerCase();
    const className = String(candidate.className || "").toLowerCase();
    const text = String(candidate.textContent || "").trim().toLowerCase();
    return (
      candidate.hasAttribute("data-layer-close") ||
      action.startsWith("close") ||
      label.startsWith("close") ||
      title.startsWith("close") ||
      text === "close" ||
      text.startsWith("close ") ||
      /(^|[-_ ])close([-_ ]|$)/.test(className)
    );
  }) || null;
}

function focusInitialLayerTarget(layer, initialFocus) {
  const explicitTarget = resolveLayerInitialFocus(layer, initialFocus);
  const target =
    explicitTarget ||
    getLayerAutofocusTarget(layer) ||
    getLayerCloseTarget(layer) ||
    getLayerFocusableElements(layer)[0] ||
    layer;

  if (target === layer && !layer.hasAttribute("tabindex")) layer.tabIndex = -1;
  if (focusLayerElement(target)) return true;
  if (target === layer) return false;

  // A target can become disabled or hidden between render and focus (for
  // example, while an async dialog section resolves). The layer itself is the
  // final programmatic fallback so Tab still starts inside the dialog.
  if (!layer.hasAttribute("tabindex")) layer.tabIndex = -1;
  return focusLayerElement(layer);
}

function trapFocus(overlay) {
  if (!(overlay instanceof HTMLElement) || overlay.dataset.focusTrapReady === "true") {
    return;
  }
  overlay.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const focusable = getLayerFocusableElements(overlay);
    if (focusable.length === 0) {
      e.preventDefault();
      if (!overlay.hasAttribute("tabindex")) overlay.tabIndex = -1;
      focusLayerElement(overlay);
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (document.activeElement === overlay || !overlay.contains(document.activeElement)) {
      e.preventDefault();
      focusLayerElement(e.shiftKey ? last : first);
      return;
    }
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        focusLayerElement(last);
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      focusLayerElement(first);
    }
  });
  overlay.dataset.focusTrapReady = "true";
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

function hasBlockingAppLayer() {
  return Array.from(activeAppLayers.values()).some((state) => state.blocking);
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
  // Drawers can remain registered while a focused dialog opens above them.
  // Only another *blocking* layer should keep the document locked; otherwise a
  // closed dialog would leave the page frozen behind a nonblocking drawer.
  if (!appLayerBodyLockState || hasBlockingAppLayer()) return;
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

function hasLayerOption(options, name) {
  return Object.prototype.hasOwnProperty.call(options, name);
}

function getLayerReturnFocus(element, options) {
  if (options.returnFocus === false) return null;
  const requested = options.returnFocus;
  if (requested instanceof HTMLElement) {
    return requested.isConnected && requested !== element && !element.contains(requested)
      ? requested
      : null;
  }
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // A newly registered layer must return to the trigger or an underlying
  // layer—not a control already inside itself. This also makes a same-id
  // reopen safe: it can never replace the original trigger with its close
  // button or another internal field.
  return active && active !== element && !element.contains(active) ? active : null;
}

function getLayerScrollElement(options, fallback = null) {
  if (!hasLayerOption(options, "scrollElement")) return fallback;
  return getLayerElement(options.scrollElement) || null;
}

function updateLayerEscapeHandler(state, onEscape, options = {}) {
  const hasEscapeOption = hasLayerOption(options, "onEscape");
  if (!hasEscapeOption && state.escapeHandler) return;
  if (state.escapeHandler) {
    document.removeEventListener("keydown", state.escapeHandler, true);
    state.escapeHandler = null;
  }
  state.onEscape = typeof onEscape === "function" ? onEscape : null;
  if (state.onEscape) {
    state.escapeHandler = (event) => {
      if (event.key !== "Escape" || getActiveLayerState() !== state) return;
      event.preventDefault();
      // A topmost blocking dialog owns Escape completely. Letting this event
      // continue to page-level shortcuts after return focus runs can close an
      // unrelated drawer or move focus away from the dialog's trigger.
      event.stopImmediatePropagation();
      state.onEscape(event);
    };
    document.addEventListener("keydown", state.escapeHandler, true);
  }
  // Legacy surfaces can remain open while they are migrated, but the state is
  // explicit so blocking dialogs are auditable: new dialogs should always
  // provide onEscape rather than relying on an unrelated global listener.
  state.element.dataset.layerEscape = state.onEscape
    ? "managed"
    : state.blocking
    ? "required"
    : "optional";
}

function syncLayerBlockingState(state, blocking) {
  if (state.blocking === blocking) return;
  state.blocking = blocking;
  if (blocking) lockBodyForLayer();
  else unlockBodyForLayer();
}

function syncLayerPresentation(state, options, isNew = false) {
  const { element } = state;
  const safeArea = hasLayerOption(options, "safeArea")
    ? options.safeArea !== false
    : isNew
    ? true
    : element.classList.contains("app-layer-safe-area");
  element.dataset.layerId = state.id;
  element.dataset.layerOpen = "true";
  element.classList.add("app-layer-active");
  element.classList.toggle("app-layer-safe-area", safeArea);

  const shouldTrapFocus = hasLayerOption(options, "trapFocus")
    ? options.trapFocus !== false
    : isNew
    ? true
    : state.trapFocus !== false;
  state.trapFocus = shouldTrapFocus;
  if (shouldTrapFocus) trapFocus(element);
}

function reopenLayer(state, options) {
  if (options.exclusive !== false) {
    Array.from(activeAppLayers.keys()).forEach((activeId) => {
      if (activeId !== state.id) closeLayer(activeId, { returnFocus: false });
    });
  }

  const nextBlocking = hasLayerOption(options, "blocking")
    ? options.blocking !== false
    : state.blocking;
  if (hasLayerOption(options, "returnFocus")) {
    // Preserve the original trigger by default, while honoring the one
    // explicit lifecycle override callers have always been able to make.
    state.returnFocus = options.returnFocus === false
      ? null
      : getLayerReturnFocus(state.element, options) || state.returnFocus;
  }
  state.scrollElement = getLayerScrollElement(options, state.scrollElement);
  syncLayerBlockingState(state, nextBlocking);
  syncLayerPresentation(state, options);
  updateLayerEscapeHandler(state, options.onEscape, options);

  // Map insertion order defines the active top layer. Promote an already-open
  // layer without replacing state.returnFocus or registering another listener.
  activeAppLayers.delete(state.id);
  activeAppLayers.set(state.id, state);

  // Re-rendering an already-open dialog can request a deliberate new target;
  // otherwise preserve the user's current field instead of stealing focus.
  if (hasLayerOption(options, "initialFocus") || options.focusInitial === true) {
    focusInitialLayerTarget(state.element, options.initialFocus);
  }
  return true;
}

function openLayer(layer, options = {}) {
  const element = getLayerElement(layer);
  if (!element) return false;
  const id = getLayerId(element, options);
  const existingState = activeAppLayers.get(id);
  if (existingState && existingState.element === element) {
    return reopenLayer(existingState, options);
  }
  if (existingState) {
    // A dynamic overlay can be removed and rebuilt with the same public id.
    // Tear down the old registration without sending focus to an element that
    // is being immediately replaced.
    closeLayer(id, { returnFocus: false });
  }

  const blocking = options.blocking !== false;
  const state = {
    id,
    element,
    blocking,
    scrollElement: getLayerScrollElement(options),
    returnFocus: getLayerReturnFocus(element, options),
    trapFocus: options.trapFocus !== false,
    onEscape: null,
    escapeHandler: null,
  };

  if (options.exclusive !== false) {
    Array.from(activeAppLayers.keys()).forEach((activeId) => {
      if (activeId !== id) closeLayer(activeId, { returnFocus: false });
    });
  }

  activeAppLayers.set(id, state);
  if (blocking) lockBodyForLayer();
  syncLayerPresentation(state, options, true);
  updateLayerEscapeHandler(state, options.onEscape, options);
  // A blocking dialog must never leave keyboard focus in the locked document.
  // Nonblocking drawers remain opt-in so established contextual workbenches do
  // not unexpectedly steal focus while they are refreshed.
  if (blocking || hasLayerOption(options, "initialFocus") || options.focusInitial === true) {
    focusInitialLayerTarget(element, options.initialFocus);
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
  if (state.escapeHandler) {
    document.removeEventListener("keydown", state.escapeHandler, true);
  }
  state.element.dataset.layerOpen = "false";
  state.element.classList.remove("app-layer-active", "app-layer-safe-area");
  if (options.returnFocus !== false && state.returnFocus?.isConnected) {
    focusLayerElement(state.returnFocus);
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

function showReorderModal(values, opts = {}) {
  const modalId = "_reorderModal";
  const listId = "_reorderList";
  const layerId = "reorder-modal";
  const sourceValues = Array.isArray(values) ? values : [];

  // The helper is intentionally a singleton because every caller supplies an
  // ordered list of labels. Clean up a prior dynamic instance before the new
  // registration so LayerManager never retains a detached dialog of the same
  // public layer id.
  const previous = document.getElementById(modalId);
  if (previous) {
    if (typeof closeLayer === "function") {
      closeLayer(layerId, { returnFocus: false });
    }
    previous.remove();
  }

  _reorderTempOrder = [...sourceValues];
  let closed = false;

  function renderList() {
    return _reorderTempOrder
      .map(
        (val, idx) => `
      <div class="custom-order-item reorder-modal-item" draggable="true" data-idx="${idx}"
           data-drag="reorder" role="listitem">
        <span class="drag-handle" aria-hidden="true">☰</span>
        <span class="order-number" aria-hidden="true">${idx + 1}.</span>
        <span class="order-value">${escapeHtml(val)}</span>
        <span class="reorder-modal-item-actions" aria-label="Move ${escapeAttr(String(val))}">
          <button type="button" class="reorder-modal-move" data-reorder-move="up" data-idx="${idx}"
            aria-label="Move ${escapeAttr(String(val))} up" title="Move up"${idx === 0 ? " disabled" : ""}>▲</button>
          <button type="button" class="reorder-modal-move" data-reorder-move="down" data-idx="${idx}"
            aria-label="Move ${escapeAttr(String(val))} down" title="Move down"${idx === _reorderTempOrder.length - 1 ? " disabled" : ""}>▼</button>
        </span>
      </div>`,
      )
      .join("");
  }

  function close(options = {}) {
    if (closed) return;
    closed = true;
    const el = document.getElementById(modalId);
    // Release the managed layer before removing its dynamic DOM. In a nested
    // Call Sheet/Wristband flow this keeps the parent blocking layer active
    // and restores focus to the opener inside that parent.
    if (typeof closeLayer === "function") {
      closeLayer(layerId, { returnFocus: options.returnFocus !== false });
    }
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
    <div id="${modalId}" class="modal-overlay show reorder-modal-overlay" data-action="_reorderCloseOverlay">
      <div class="modal-content modal-content-xs reorder-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="reorderModalTitle">
        <div class="reorder-modal-header">
          <h3 id="reorderModalTitle" class="modal-title">${escapeHtml(opts.title || "Custom Order")}</h3>
          <button type="button" data-action="_reorderClose" data-layer-close class="reorder-modal-close" aria-label="Close reorder modal">✕</button>
        </div>
        <div class="reorder-modal-body">
          <p class="modal-copy-note">
            ${escapeHtml(opts.note || "Drag values to set your preferred sort order. Top = first.")}
          </p>
          <p class="reorder-modal-move-hint">Drag on desktop or use the arrow buttons to move a row.</p>
          <div id="${listId}" class="custom-order-list" role="list" aria-label="Custom order values">
            ${renderList()}
          </div>
          <p class="sr-only" id="reorderModalAnnouncement" aria-live="polite"></p>
        </div>
        <div class="reorder-modal-actions">
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
    </div>`;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = modalHtml;
  document.body.appendChild(wrapper.firstElementChild);

  const overlay = document.getElementById(modalId);
  const list = document.getElementById(listId);
  const body = overlay?.querySelector(".reorder-modal-body");
  const closeButton = overlay?.querySelector(".reorder-modal-close");
  const announcer = overlay?.querySelector("#reorderModalAnnouncement");
  if (!overlay || !list || !body) return;

  const renderIntoList = () => {
    list.innerHTML = renderList();
    bindDragHandlers();
  };

  const moveItem = (sourceIdx, delta) => {
    const targetIdx = sourceIdx + delta;
    if (
      !Number.isInteger(sourceIdx) ||
      !Number.isInteger(targetIdx) ||
      targetIdx < 0 ||
      targetIdx >= _reorderTempOrder.length
    ) {
      return;
    }
    const [moved] = _reorderTempOrder.splice(sourceIdx, 1);
    _reorderTempOrder.splice(targetIdx, 0, moved);
    _reorderDraggedIdx = targetIdx;
    renderIntoList();
    if (announcer) announcer.textContent = `${moved} moved to position ${targetIdx + 1}.`;

    // Keep the deterministic control focused after the list re-renders so
    // keyboard and switch users can make repeated moves without starting over.
    const movedRow = list.querySelector(`[data-idx="${targetIdx}"]`);
    const continuedMove = movedRow?.querySelector(
      `[data-reorder-move="${delta < 0 ? "up" : "down"}"]:not(:disabled)`,
    );
    const fallbackMove = movedRow?.querySelector(".reorder-modal-move:not(:disabled)");
    if (typeof focusLayerElement === "function") {
      focusLayerElement(continuedMove || fallbackMove);
    } else {
      (continuedMove || fallbackMove)?.focus?.();
    }
  };

  list.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("[data-reorder-move]")
      : null;
    if (!(target instanceof HTMLButtonElement) || target.disabled) return;
    const sourceIdx = parseInt(target.dataset.idx, 10);
    moveItem(sourceIdx, target.dataset.reorderMove === "up" ? -1 : 1);
  });

  const bindDragHandlers = () => {
    list.querySelectorAll("[data-drag='reorder']").forEach((item) => {
      item.addEventListener("dragstart", (event) => {
        if (event.target instanceof Element && event.target.closest("button")) {
          event.preventDefault();
          return;
        }
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
        moveItem(_reorderDraggedIdx, targetIdx - _reorderDraggedIdx);
      });
    });
  };

  bindDragHandlers();

  if (typeof openLayer === "function") {
    openLayer(overlay, {
      id: layerId,
      // Reorder is often launched from an already-open sort editor or cell
      // popup. It must sit above, not replace, that parent layer.
      exclusive: false,
      blocking: true,
      safeArea: true,
      scrollElement: body,
      initialFocus: closeButton || overlay,
      onEscape: () => close(),
      returnFocus: true,
    });
  } else if (typeof trapFocus === "function") {
    trapFocus(overlay);
    closeButton?.focus?.();
    overlay.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    });
  }
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
