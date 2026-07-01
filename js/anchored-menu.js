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
 * Exposes two globals consumed by app-events.js:
 *   positionAnchoredMenu(wrap)  — place the menu for an open wrap
 *   resetAnchoredMenu(wrap)     — clear inline positioning on close
 * ──────────────────────────────────────────────────────────────── */
(function () {
  const GAP = 6; // gap between the trigger and its menu
  const MARGIN = 8; // minimum gap from the viewport edges
  const MIN_MENU_HEIGHT = 120; // never shrink a scrolling menu below this

  function safeInset(name) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(
      name,
    );
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function getViewport() {
    const vv = window.visualViewport;
    if (vv) {
      return {
        left: vv.offsetLeft,
        top: vv.offsetTop,
        width: vv.width,
        height: vv.height,
      };
    }
    return {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  function positionAnchoredMenu(wrap) {
    if (!wrap) return;
    const trigger = wrap.querySelector("[data-action='toggleParentOpen']");
    const menu = wrap.querySelector(".tool-menu");
    if (!trigger || !menu) return;

    // Reset positioning so the menu measures at its natural size.
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
    const maxRight =
      vp.left + vp.width - Math.max(MARGIN, safeInset("--safe-area-right"));
    const maxBottom =
      vp.top + vp.height - Math.max(MARGIN, safeInset("--safe-area-bottom"));

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
  }

  function resetAnchoredMenu(wrap) {
    if (!wrap) return;
    const menu = wrap.querySelector(".tool-menu");
    if (!menu) return;
    menu.style.position = "";
    menu.style.top = "";
    menu.style.left = "";
    menu.style.right = "";
    menu.style.bottom = "";
    menu.style.width = "";
    menu.style.maxHeight = "";
    menu.style.overflowY = "";
  }

  function repositionOpenAnchoredMenus() {
    document
      .querySelectorAll(".tool-menu-wrap[data-anchored].open")
      .forEach(positionAnchoredMenu);
  }

  window.positionAnchoredMenu = positionAnchoredMenu;
  window.resetAnchoredMenu = resetAnchoredMenu;

  window.addEventListener("resize", repositionOpenAnchoredMenus, {
    passive: true,
  });
  window.addEventListener("scroll", repositionOpenAnchoredMenus, {
    passive: true,
    capture: true,
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener(
      "resize",
      repositionOpenAnchoredMenus,
      { passive: true },
    );
    window.visualViewport.addEventListener(
      "scroll",
      repositionOpenAnchoredMenus,
      { passive: true },
    );
  }
})();
