const DANGEROUS_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "base",
  "meta",
  "form",
  "input",
  "textarea",
  "select",
  "style",
]);
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
