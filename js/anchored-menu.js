/* ── Anchored Menu Utility ───────────────────────────────────────
 * Shared positioning for opt-in `.tool-menu` dropdowns.
 *
 * Usage: add `data-anchored` to a `.tool-menu-wrap`. When that wrap
 * opens (via the existing `toggleParentOpen` handler), its `.tool-menu`
 * is switched to `position: fixed` and positioned from the trigger's
 * viewport rect — flipping vertically and clamping horizontally so it
 * never clips against an overflow ancestor or spills off-screen.
 *
 * Honors safe-area insets (--safe-area-* custom properties) and the
 * visual viewport (iPad split-screen / pinch-zoom). Open menus are
 * repositioned on scroll and resize.
 *
 * Phase 11 additions:
 *   #189  IntersectionObserver closes menu when trigger leaves viewport
 *   #191  Focus is restored to the trigger when the menu closes
 *   #192-193  ArrowUp/Down/Home/End keyboard navigation inside open menus
 *   #194  role="menu" / role="menuitem" applied on first open
 *
 * Exposes globals consumed by app-events.js:
 *   positionAnchoredMenu(wrap)   — place the menu for an open wrap
 *   resetAnchoredMenu(wrap)      — clear inline positioning on close
 *   closeAnchoredMenu(wrap)      — close + reset + restore focus (#191)
 * ──────────────────────────────────────────────────────────────── */
(function () {
  const GAP = 6;           // gap between the trigger and its menu
  const MARGIN = 8;         // minimum gap from the viewport edges
  const MIN_MENU_HEIGHT = 120; // never shrink a scrolling menu below this

  function safeInset(name) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function getViewport() {
    const vv = window.visualViewport;
    if (vv) {
      return { left: vv.offsetLeft, top: vv.offsetTop, width: vv.width, height: vv.height };
    }
    return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }

  function _getMenu(wrap) {
    return wrap?._anchoredMenu || wrap?.querySelector(".tool-menu, .more-tools-menu") || null;
  }

  function _portalMenu(wrap, menu) {
    if (!wrap || !menu || menu.parentElement === document.body) return;
    wrap._anchoredMenu = menu;
    menu._anchoredWrap = wrap;
    menu._anchoredHome = wrap;
    document.body.appendChild(menu);
  }

  function _restoreMenu(wrap, menu) {
    if (!wrap || !menu || menu.parentElement === wrap) return;
    wrap.appendChild(menu);
  }

  // ── #194 — ARIA menu semantics ───────────────────────────────────
  function _applyAriaSemantics(wrap) {
    if (wrap._ariaApplied) return;
    wrap._ariaApplied = true;
    const menu = _getMenu(wrap);
    if (menu) menu.setAttribute("role", "menu");
    if (menu) {
      menu.querySelectorAll(":scope > button, :scope > a").forEach((item) => {
        if (!item.hasAttribute("role")) item.setAttribute("role", "menuitem");
      });
    }
  }

  // ── #189 — IntersectionObserver: close when trigger scrolls away ──
  function _watchTriggerVisibility(wrap) {
    if (!("IntersectionObserver" in window)) return;
    const trigger = wrap.querySelector("[data-action='toggleParentOpen']");
    if (!trigger) return;
    if (wrap._intersectionObserver) wrap._intersectionObserver.disconnect();
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting && wrap.classList.contains("open")) {
          closeAnchoredMenu(wrap);
        }
      },
      { threshold: 0 },
    );
    observer.observe(trigger);
    wrap._intersectionObserver = observer;
  }

  function _clearTriggerObserver(wrap) {
    if (wrap._intersectionObserver) {
      wrap._intersectionObserver.disconnect();
      wrap._intersectionObserver = null;
    }
  }

  // ── Core positioning ─────────────────────────────────────────────
  function positionAnchoredMenu(wrap) {
    if (!wrap) return;
    const trigger = wrap.querySelector("[data-action='toggleParentOpen']");
    const menu = _getMenu(wrap);
    if (!trigger || !menu) return;

    _applyAriaSemantics(wrap);
    _portalMenu(wrap, menu);

    // Reset positioning so the menu measures at its natural size.
    menu.style.display = "block";
    menu.style.position = "fixed";
    menu.style.top = "0px";
    menu.style.left = "0px";
    menu.style.right = "auto";
    menu.style.bottom = "auto";
    menu.style.width = "";
    menu.style.maxHeight = "";
    menu.style.overflowY = "";

    const vp = getViewport();
    const minTop = vp.top + Math.max(MARGIN, safeInset("--safe-area-top"));
    const minLeft = vp.left + Math.max(MARGIN, safeInset("--safe-area-left"));
    const maxRight = vp.left + vp.width - Math.max(MARGIN, safeInset("--safe-area-right"));
    const maxBottom = vp.top + vp.height - Math.max(MARGIN, safeInset("--safe-area-bottom"));

    const trg = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let menuW = menuRect.width;
    let menuH = menuRect.height;

    // Clamp width to the available horizontal space.
    const availW = maxRight - minLeft;
    if (menuW > availW) {
      menuW = availW;
      menu.style.width = menuW + "px";
    }

    // Horizontal: align the menu's right edge to the trigger's right edge
    // (matches the legacy `right: 0` default), then clamp into view.
    let left = trg.right - menuW;
    if (left + menuW > maxRight) left = maxRight - menuW;
    if (left < minLeft) left = minLeft;

    // Vertical: prefer below the trigger; flip above when there is more room.
    const spaceBelow = maxBottom - (trg.bottom + GAP);
    const spaceAbove = trg.top - GAP - minTop;
    let top;
    if (menuH <= spaceBelow || spaceBelow >= spaceAbove) {
      top = trg.bottom + GAP;
      const avail = maxBottom - top;
      if (menuH > avail) {
        menu.style.maxHeight = Math.max(MIN_MENU_HEIGHT, avail) + "px";
        menu.style.overflowY = "auto";
      }
    } else {
      let avail = spaceAbove;
      if (menuH > avail) {
        menu.style.maxHeight = Math.max(MIN_MENU_HEIGHT, avail) + "px";
        menu.style.overflowY = "auto";
        menuH = Math.max(MIN_MENU_HEIGHT, avail);
      }
      top = trg.top - GAP - menuH;
    }
    if (top < minTop) top = minTop;

    menu.style.left = Math.round(left) + "px";
    menu.style.top = Math.round(top) + "px";

    // #189 — start watching for trigger leaving viewport
    _watchTriggerVisibility(wrap);
  }

  function resetAnchoredMenu(wrap) {
    if (!wrap) return;
    const menu = _getMenu(wrap);
    if (!menu) return;
    _restoreMenu(wrap, menu);
    menu.style.display = "";
    menu.style.position = "";
    menu.style.top = "";
    menu.style.left = "";
    menu.style.right = "";
    menu.style.bottom = "";
    menu.style.width = "";
    menu.style.maxHeight = "";
    menu.style.overflowY = "";
    _clearTriggerObserver(wrap);
  }

  // ── #191 — Close + reset + restore focus ─────────────────────────
  function closeAnchoredMenu(wrap) {
    if (!wrap) return;
    const trigger = wrap.querySelector("[data-action='toggleParentOpen']");
    wrap.classList.remove("open");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    resetAnchoredMenu(wrap);
    // Restore focus to the trigger that opened the menu
    if (trigger && document.body.contains(trigger)) {
      trigger.focus({ preventScroll: true });
    }
  }

  // ── Reposition open menus on layout changes ───────────────────────
  function repositionOpenAnchoredMenus() {
    document
      .querySelectorAll(".tool-menu-wrap[data-anchored].open, .more-tools-wrap[data-anchored].open")
      .forEach(positionAnchoredMenu);
  }

  // ── #192-193 — Keyboard navigation for open menus ────────────────
  document.addEventListener("keydown", (e) => {
    const openWrap = document.querySelector(".tool-menu-wrap[data-anchored].open, .more-tools-wrap[data-anchored].open");
    if (!openWrap) return;
    const menu = _getMenu(openWrap);
    if (!menu) return;

    // Don't intercept if typing in a field inside the menu
    if (e.target.matches("input, textarea, select")) return;

    const items = Array.from(
      menu.querySelectorAll("button:not([disabled]), a:not([disabled])"),
    ).filter((el) => el.offsetParent !== null); // visible only

    if (items.length === 0) return;

    const focused = document.activeElement;
    const idx = items.indexOf(focused);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = idx < items.length - 1 ? items[idx + 1] : items[0];
      next.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = idx > 0 ? items[idx - 1] : items[items.length - 1];
      prev.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeAnchoredMenu(openWrap);
    } else if (e.key === "Tab") {
      // Let Tab close the menu naturally and continue tabbing
      closeAnchoredMenu(openWrap);
    }
  });

  // ── Expose globals ───────────────────────────────────────────────
  window.positionAnchoredMenu = positionAnchoredMenu;
  window.resetAnchoredMenu = resetAnchoredMenu;
  window.closeAnchoredMenu = closeAnchoredMenu;

  window.addEventListener("resize", repositionOpenAnchoredMenus, { passive: true });
  window.addEventListener("scroll", repositionOpenAnchoredMenus, { passive: true, capture: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", repositionOpenAnchoredMenus, { passive: true });
    window.visualViewport.addEventListener("scroll", repositionOpenAnchoredMenus, { passive: true });
  }
})();
