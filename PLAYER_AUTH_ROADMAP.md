# Player Auth + Mobile Portal — 50-Point Roadmap

> **Goal:** Login and player portal should feel as fast and intuitive as Instagram, Snapchat, Kahoot, Canvas, and Google Drive on mobile and iPad.
> 
> **Legend:** ✅ Done · 🔄 In Progress · ⬜ Not Started

---

## TIER 1 — Critical Friction (Blocking / Confusing)
*These block players from logging in or cause visible confusion. Fix first.*

- [x] **1. Remove `autocomplete="off"` from the login form** — blocks iCloud Keychain, 1Password, and Chrome autofill. Change `<form>` to `autocomplete="on"`. Players on mobile should be able to save credentials.
- [x] **2. Clear username pre-fill of `"admin"`** — username field defaults to `value="admin"`. Players must delete it before typing. Empty it on load (or default to blank on mobile).
- [x] **3. Add `enterkeyhint="next"` on username, `enterkeyhint="go"` on password** — shows the correct action key on mobile keyboards. Missing entirely.
- [x] **4. Wire Enter key: username → password field** — no `keydown` handler chains fields. Players hit Return on username and nothing happens. Focus password on Enter in username field.
- [x] **5. Clear error message on new input** — red error stays visible while the user types a retry. Each `input` event on username/password should clear the error immediately.
- [x] **6. Replace "Show/Hide" text button with eye SVG icon** — the plain text button looks like a 2010 link. Replace with show/hide eye SVG icons matching iOS/Android native patterns.
- [x] **7. Add a visible loading spinner on submit** — `"Checking login..."` text change is invisible on mobile. Add a CSS spinner inside the submit button; disable pointer-events on the form during fetch.
- [x] **8. Add login card entrance animation** — overlay appears hard-cut. Add `opacity: 0→1` + `translateY(12px)→0` on `.auth-login-shell` mount. 200ms ease-out.
- [x] **9. Add `touch-action: manipulation` to role picker buttons** — `.auth-login-role-option` buttons lack this. 300ms tap delay on some Android browsers.
- [x] **10. Fix `aria-live="polite"` → `"assertive"` on the error container** — errors announced politely won't interrupt VoiceOver/TalkBack. Auth errors need `assertive`.

---

## TIER 2 — Login UX / Consumer App Feel

- [x] **11. "Player Login" one-tap shortcut** — all 3 roles shown to everyone. Add a "I'm a Player →" button at the bottom that collapses the form to password-only and pre-selects player role. Players should never see "Admin" or "Coach" options first.
- [x] **12. Extend player session to 7 days** — `AUTH_SESSION_MAX_AGE_MS` is 12 hours. Players re-login every morning at camp. Player role: 7 days. Admin/Coach: keep at 12 hours.
- [x] **13. Fix "Logged out" shown in error slot** — `showLoginOverlay("Logged out.")` routes to the red error element. Show logout/status messages in a separate muted-color status slot.
- [x] **14. Replace hero pane with compact brand block on phone** — on 480px phones the hero is redundant and forces scroll. Replace with just team name + logo centered above the form card. Zero extra scroll.
- [x] **15. Add success animation on login** — `overlay.remove()` is a hard cut. Add scale-up + fade-out on `.auth-login-shell` (150ms) before removal. Confirms "that worked."
- [x] **16. Dark mode support on login card** — `.auth-login-card` is always `rgba(255,255,255,0.98)` regardless of `data-theme="dark"`. Apply dark theme tokens to the card form.
- [x] **17. `?role=player` URL parameter pre-selection** — support `?role=player` to pre-select player role and hide admin/coach buttons. Coaches send players a direct link.
- [x] **18. Show team name on login screen** — pulls `STORAGE_KEYS.TEAM_NAME` and shows "Welcome to [Team Name]" instead of the hardcoded "BCOffense" brand block.
- [x] **19. Focus management after login** — after `overlay.remove()`, focus floats. Move focus to the first tab button or main heading for keyboard/VoiceOver users.
- [x] **20. `@supports (backdrop-filter)` guard** — `backdrop-filter: blur(10px)` runs unconditionally. Wrap in `@supports` to prevent compositing cost on iPhone SE and older Android.

---

## TIER 3 — Player Portal First Screen

- [x] **21. Personalized greeting on player dashboard** — hero shows "Player Portal" eyebrow with no name. Add time-of-day greeting: "Good morning — here's today's plan."
- [x] **22. "NEW" badge on Script tab when fresh practice published** — when `featuredScript.date === today` and player hasn't loaded it yet, show a red dot on the Script tab. Every social app does this.
- [x] **23. Replace Unicode tab icons with SVG** — `⌂` `□` `▶` render differently per platform. Replace with inline SVGs (house, clipboard/list, play) for consistency.
- [x] **24. Pressed/spring animation on player tab buttons** — add `transform: scale(0.92)` on `:active` with spring-back transition. No active state feedback currently.
- [x] **25. Active indicator pill on player tab bar** — current active tab only has background change. Add a 3px `::after` pill marker below the icon, like iOS native tab bar.
- [x] **26. Clamp team name font size in hero** — `font-size: 2.75rem` for team name overflows on phones. Change to `clamp(1.5rem, 5vw, 2.75rem)`.
- [x] **27. Single-column card grid on small phones** — `.player-home-grid` is 2-col at all sizes. Cards are ~163px wide on 375px phones. Go single-column at ≤480px.
- [x] **28. Increase quick-action button padding** — 3-column quick actions on phones are too narrow. Set `min-height: 82px` + more horizontal padding for comfortable thumb use.
- [x] **29. Empty state illustration when no script published** — plain text "Waiting on a published practice" looks broken. Add a styled empty-state block with a simple CSS illustration or icon.
- [x] **30. Show last-updated timestamp on script cards** — show "Updated 2h ago" using `savedAt` from the record. Players need to know if the coach changed the plan after they loaded it.

---

## TIER 4 — Mobile-Native Interactions

- [x] **31. Swipe-to-navigate between player tabs** — add `touchstart/touchmove/touchend` on `#mainApp` that switches tabs on horizontal swipe above a velocity threshold.
- [x] **32. Haptic feedback via Vibration API** — `navigator.vibrate(5)` on tab switch, primary CTA tap, and errors. No-op on iOS, fires on Android/Chrome. Makes the app feel native.
- [x] **33. Refresh player data on Page Visibility resume** — `visibilitychange → document.visibilityState === 'visible'` triggers `renderPlayerDashboardHome()`. Prevents stale "Today's Practice."
- [x] **34. PWA "Add to Home Screen" prompt for players** — capture `beforeinstallprompt`, show a friendly banner after first successful player login. iOS shows manual "Share → Add" hint.
- [x] **35. `overscroll-behavior: none` on player body** — iOS rubber-band shows white page under the bottom tab bar. Set on `body.is-mobile-screen[data-auth-role="player"]`.
- [x] **36. Disable horizontal scroll on player panels** — players accidentally trigger horizontal scroll in the playbook table. Add `overflow-x: hidden` + `touch-action: pan-y` on player panels.
- [x] **37. Sticky "Today's Practice" mini banner** — hero scrolls away. Add a `position: sticky` compact banner (64px) that appears after the hero scrolls past, keeping "Open Practice" CTA always visible.
- [x] **38. Pull-to-refresh for script list** — detect downward pull from scroll top via touch events, call `renderPlayerDashboardHome()`. Matches Google Drive, Canvas, and every mobile app.

---

## TIER 5 — Performance & Architecture

- [x] **39. Loading skeleton during `initServerAuth()`** — auth-locked body shows raw HTML for 500–2000ms during `/auth/me` fetch. Show a pulsing skeleton screen during this window.
- [x] **40. Cache `/auth/me` in SW for 30 seconds** — called on every page load, blocks app unlock over slow connections. SW should cache with a short `max-age` so PWA re-opens are instant.
- [x] **41. Debounce `applyRoleUi()` to one rAF per state change** — scans full DOM for `[data-auth-player-hide]` etc. on every auth state change. Gate with `requestAnimationFrame`.
- [x] **42. Defer player dashboard render to `requestIdleCallback`** — `renderPlayerDashboardHome()` runs during initial tab load. Defer it so tab transition animation isn't blocked.
- [x] **43. `content-visibility: auto` on player script cards** — `.player-home-script-item` cards extend below fold. Add `contain: layout style paint; content-visibility: auto` to the list items.
- [x] **44. Narrow the auth MutationObserver scope** — currently watches all of `document.body` with `subtree: true`. Narrow to `#mainApp` to avoid firing on every toast/modal insertion.
- [x] **45. `will-change: transform` on player quick-action hover** — these are primary CTAs with transform transitions but no `will-change`. Add it scoped to `@media (hover: hover)` only.

---

## TIER 6 — Coach-to-Player Features

- [ ] **46. Coach "message of the day" field** — add a short message to the script save flow. Displayed in a styled callout at the top of the player dashboard. Like Remind / TeamSnap announcements.
- [ ] **47. Web Push notifications when practice published** — SW `push` event + backend subscription endpoint. "New practice posted: [name] — 24 plays." Mark as Phase 2 (requires backend work).
- [ ] **48. Player "I'm Ready" confirmation** — single-tap "Ready ✓" on player home stamps a `localStorage` timestamp. Coach dashboard shows who confirmed. Like Kahoot's join screen.
- [ ] **49. Offline fallback indicator for players** — `navigator.onLine` + `'online'/'offline'` events. Show "You're offline — last loaded practice is still available" banner instead of blank/broken state.
- [ ] **50. Team branding customization for player portal** — coach sets accent color, logo URL, and welcome message in team settings. Stored in 2 new `STORAGE_KEYS`. Player portal uses these for login screen, tab bar accent, and dashboard hero.

---

## Implementation Order

```
Tier 1 (items 1–10)   → Critical friction  — implement now
Tier 2 (items 11–20)  → Login UX           — next sprint
Tier 3 (items 21–30)  → Player home        — next sprint
Tier 4 (items 31–38)  → Mobile native      — after Tier 3
Tier 5 (items 39–45)  → Performance        — parallel with Tier 3/4
Tier 6 (items 46–50)  → New features       — Phase 2
```

**Files most affected:**
- `js/auth.js` — items 1–13, 17–20, 39–41, 44
- `css/components.css` — items 6, 8, 9, 16, 20
- `css/responsive.css` — items 23–28, 35–36
- `css/dashboard.css` — items 26–29, 37
- `js/dashboard-render.js` — items 21, 22, 29, 30, 42
- `sw.js` — item 40
- `index.html` — item 34
