/**
 * Managed coach access policy.
 *
 * Legacy environment-variable `coach` logins retain their existing full staff
 * access. D1-backed coaches are managed accounts: they begin with the player
 * portal surfaces plus collaboration, and only receive additional capability
 * keys when an administrator explicitly grants them.
 */

export const DEFAULT_MANAGED_COACH_PERMISSIONS = Object.freeze([
  "tab:dashboard",
  "tab:playbook",
  "tab:signals",
  "tab:script",
  "tab:wristband",
  "tab:tendencies",
  "tab:gameplan",
  "tab:callsheet",
  "tab:installation",
  "tab:identity",
  "tab:offensebuilder",
  "tab:quizsetup",
  "tab:leaderboard",
  "feature:comments",
  "feature:questions",
]);

export const MANAGED_COACH_PERMISSION_GROUPS = Object.freeze([
  {
    label: "Player-style access",
    permissions: [
      ["tab:dashboard", "Home dashboard"],
      ["tab:playbook", "Playbook"],
      ["tab:signals", "Signals"],
      ["tab:script", "Practice / swipe study"],
      ["tab:leaderboard", "Leaderboard"],
      ["tab:wristband", "Wristband maker"],
      ["tab:tendencies", "Opponent scout"],
      ["tab:gameplan", "Game plan"],
      ["tab:callsheet", "Call sheet"],
      ["tab:installation", "Installations"],
      ["tab:identity", "Offensive identity"],
      ["tab:offensebuilder", "Offense builder"],
      ["tab:quizsetup", "Quiz setup"],
    ],
  },
  {
    label: "Collaboration",
    permissions: [
      ["feature:comments", "Comments and discussion"],
      ["feature:questions", "Questions"],
    ],
  },
  {
    label: "Coach tools",
    permissions: [
      ["feature:print", "Print and export"],
      ["feature:quiz_assignments", "Create and assign quizzes"],
      ["feature:manage_players", "Player accounts and roster links"],
      ["feature:media_upload", "Add diagrams and clips"],
      ["feature:publish_team", "Publish team updates"],
      ["feature:edit_workspace", "Edit playbook, scripts, game plans, and settings"],
    ],
  },
]);

export const MANAGED_COACH_PERMISSION_KEYS = new Set(
  MANAGED_COACH_PERMISSION_GROUPS.flatMap((group) => group.permissions.map(([key]) => key)),
);

export function parseCoachPermissions(value, fallback = DEFAULT_MANAGED_COACH_PERMISSIONS) {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch (_) { parsed = null; }
  }
  const source = Array.isArray(parsed) ? parsed : fallback;
  return [...new Set(source.map((key) => String(key || "").trim()).filter((key) => MANAGED_COACH_PERMISSION_KEYS.has(key)))];
}

export function isManagedCoachSession(session) {
  return session?.role === "coach" && session?.managedCoach === true;
}

export function hasCoachPermission(session, permission) {
  if (session?.role === "admin") return true;
  if (!isManagedCoachSession(session)) return session?.role === "coach";
  return Array.isArray(session.permissions) && session.permissions.includes(permission);
}

export function canManagedCoachWrite(session) {
  return hasCoachPermission(session, "feature:edit_workspace");
}
