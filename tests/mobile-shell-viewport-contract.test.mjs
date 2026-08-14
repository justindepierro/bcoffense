/**
 * Mobile shell viewport contract.
 *
 * Keyboard-driven visual-viewport changes must not reclassify an iPad's
 * hardware class or stable orientation. They must still update usable-height
 * variables and publish a layout event for focused UI to react to.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const shell = await readFile(new URL("../js/app-shell.js", import.meta.url), "utf8");
const responsiveCss = await readFile(new URL("../css/responsive.css", import.meta.url), "utf8");

function between(start, end) {
  const from = shell.indexOf(start);
  const to = shell.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, "could not isolate " + start);
  return shell.slice(from, to);
}

const layoutViewportHelper = between(
  "function getMobileShellLayoutViewport",
  "function getMobileShellVisualViewport",
);
const visualViewportHelper = between(
  "function getMobileShellVisualViewport",
  "function getMobileShellDeviceViewport",
);
const deviceViewportHelper = between(
  "function getMobileShellDeviceViewport",
  "function getStableShellOrientation",
);
const orientationHelper = between(
  "function getStableShellOrientation",
  "function getMobileShellKeyboardInset",
);
const keyboardInsetHelper = between(
  "function getMobileShellKeyboardInset",
  "function syncMobileShellState",
);
const syncShell = between(
  "function syncMobileShellState",
  "function syncMobilePrimaryNav",
);

assert.match(
  layoutViewportHelper,
  /window\.innerWidth \|\| root\?\.clientWidth[\s\S]*?window\.innerHeight \|\| root\?\.clientHeight/,
  "layout geometry comes from the layout viewport rather than visualViewport",
);
assert.doesNotMatch(
  layoutViewportHelper,
  /visualViewport/,
  "the layout viewport helper does not silently use keyboard-shrunken visual geometry",
);
assert.match(
  visualViewportHelper,
  /const viewport = window\.visualViewport;[\s\S]*?width: Math\.round\(viewport\?\.width \|\| layoutViewport\.width \|\| 0\)[\s\S]*?height: Math\.round\(viewport\?\.height \|\| layoutViewport\.height \|\| 0\)/,
  "visual viewport remains independently available with a layout fallback",
);

assert.match(
  deviceViewportHelper,
  /window\.screen\?\.width[\s\S]*?window\.screen\?\.height[\s\S]*?return layoutViewport;/,
  "touch device classification uses stable device geometry with a layout fallback",
);
assert.match(
  orientationHelper,
  /window\.screen\?\.orientation\?\.type[\s\S]*?window\.orientation[\s\S]*?deviceViewport\.width > deviceViewport\.height[\s\S]*?return layoutViewport\.width > layoutViewport\.height/,
  "touch orientation prefers Screen Orientation, then legacy orientation/device geometry, before layout fallback",
);
assert.match(
  syncShell,
  /const layoutViewport = getMobileShellLayoutViewport\(\);[\s\S]*?const visualViewport = getMobileShellVisualViewport\(layoutViewport\);[\s\S]*?const deviceViewport = getMobileShellDeviceViewport\(layoutViewport\);/,
  "shell sync reads layout, visual, and device geometry as separate inputs",
);
assert.match(
  syncShell,
  /const shortSide = Math\.min\(deviceViewport\.width, deviceViewport\.height\);[\s\S]*?const longSide = Math\.max\(deviceViewport\.width, deviceViewport\.height\);[\s\S]*?const isTouchTablet =[\s\S]*?shortSide > 560[\s\S]*?shortSide <= 1024[\s\S]*?longSide <= 1366;/,
  "touch tablet classification is based on stable device sides, not visual viewport shrinkage",
);
assert.match(
  syncShell,
  /const hardwareOrientation = getStableShellOrientation\([\s\S]*?Boolean\(isTouch \|\| isIPadOS\),[\s\S]*?\);/,
  "touch shells request stable hardware orientation instead of inferring it from transient visual dimensions",
);
assert.match(
  syncShell,
  /const isTabletCompactLayout =[\s\S]*?isTouchTablet && hardwareOrientation === "landscape" && width < 821;[\s\S]*?const orientation = isTabletCompactLayout \? "portrait" : hardwareOrientation;/,
  "a narrow Split View/Stage Manager workspace uses a compact tablet layout without changing hardware classification",
);
assert.match(
  syncShell,
  /const layoutProfile = shellTablet[\s\S]*?isTabletCompactLayout[\s\S]*?"tablet-compact"[\s\S]*?`tablet-\$\{orientation\}`/,
  "tablet layout profiles distinguish compact workspace from roomy portrait and landscape shells",
);
assert.match(
  responsiveCss,
  /@media \(max-width: 640px\),\s*\(pointer: coarse\) and \(max-width: 820px\),\s*\(pointer: coarse\) and \(max-height: 640px\) \{[\s\S]*?body\.is-mobile-screen\[data-auth-role="player"\] \.tabs \{[\s\S]*?position: fixed/,
  "the existing player bottom-tab treatment remains scoped to the narrow/coarse or short responsive range",
);
assert.match(
  shell,
  /const STUDY_BOTTOM_NAV_MEDIA_QUERY =\s*"\(max-width: 640px\), \(pointer: coarse\) and \(max-width: 820px\), \(pointer: coarse\) and \(max-height: 640px\)"/,
  "shell tab-height bookkeeping names the same media range as the responsive player bottom navigation",
);
assert.match(
  shell,
  /function usesStudyBottomNavigation\(isStudyPortal, isMobile\) \{[\s\S]*?isStudyPortal \|\| !isMobile[\s\S]*?window\.matchMedia\?\.\(STUDY_BOTTOM_NAV_MEDIA_QUERY\)\?\.matches/,
  "only an active mobile study portal can reserve a fixed bottom tab strip",
);
assert.match(
  syncShell,
  /const playerBottomNavActive = usesStudyBottomNavigation\(isStudyPortal, isMobile\);[\s\S]*?playerBottomNavActive \? "study-bottom-nav" : "study-top-nav"[\s\S]*?--app-tabs-height", `\$\{playerBottomNavActive \? 0 : tabsHeight\}px`[\s\S]*?--player-bottom-nav-height",[\s\S]*?`\$\{playerBottomNavActive \? tabsHeight : 0\}px`/,
  "wide tablet study portals preserve top-tab height while only the actual bottom-nav mode reserves bottom space",
);

function matchesStudyBottomNavMedia({ width, height, coarse = true }) {
  return width <= 640 || (coarse && (width <= 820 || height <= 640));
}

for (const [name, width, height, expected] of [
  ["834x1112 tablet portrait", 834, 1112, false],
  ["1024x1366 tablet portrait", 1024, 1366, false],
  ["1024x768 tablet landscape", 1024, 768, false],
  ["768x1024 coarse tablet", 768, 1024, true],
]) {
  assert.equal(
    matchesStudyBottomNavMedia({ width, height }),
    expected,
    `${name} keeps the intended ${expected ? "bottom" : "top"}-tab study navigation mode`,
  );
}
assert.match(
  syncShell,
  /const staffTabletPanelShell =[\s\S]*?layoutProfile === "tablet-landscape"[\s\S]*?width >= 821[\s\S]*?body\.dataset\.scrollOwner =[\s\S]*?staffTabletPanelShell[\s\S]*?"panel"/,
  "roomy staff tablet landscape reports panel scroll ownership while compact and portrait tablet shells use document scroll",
);

assert.match(
  keyboardInsetHelper,
  /layoutViewport\.height - visualViewport\.height - Math\.max\(0, visualViewport\.offsetTop \|\| 0\)/,
  "keyboard inset is derived from the difference between layout and visual height",
);
assert.match(
  syncShell,
  /const stateKey = \[[\s\S]*?visualWidth,[\s\S]*?visualHeight,[\s\S]*?keyboardInset,[\s\S]*?\]\.join/,
  "a visual-only keyboard change invalidates shell state instead of being ignored",
);
assert.match(
  syncShell,
  /setMobileShellCssVar\(root, "--app-vh", [\s\S]{0,90}?visualHeight \* 0\.01[\s\S]*?setMobileShellCssVar\(root, "--app-vw", [\s\S]{0,90}?visualWidth \* 0\.01[\s\S]*?setMobileShellCssVar\(root, "--app-layout-vh", [\s\S]{0,90}?height \* 0\.01[\s\S]*?setMobileShellCssVar\(root, "--app-keyboard-inset", [\s\S]{0,60}?keyboardInset/,
  "--app-vh stays bound to usable visual height while layout and keyboard values remain explicit",
);

assert.match(
  syncShell,
  /window\.dispatchEvent\(new CustomEvent\("bc:layoutchange", \{[\s\S]*?device: appDevice,[\s\S]*?orientation,[\s\S]*?hardwareOrientation,[\s\S]*?profile: layoutProfile,[\s\S]*?keyboardOpen: isKeyboardOpen,[\s\S]*?keyboardInset,[\s\S]*?layoutViewport: \{ width, height \},[\s\S]*?visualViewport: \{ width: visualWidth, height: visualHeight \}/,
  "a changed shell state emits bc:layoutchange with stable classification and both viewport geometries",
);
assert.match(
  shell,
  /window\.visualViewport\?\.addEventListener\("resize", queueMobileShellStateSync/,
  "visual viewport changes schedule a layout-state sync",
);

console.log("mobile shell viewport contract: stable classification, visual geometry, and layout event verified");
