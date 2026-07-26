// Explicit team resolution for the transitional single-team deployment.
//
// Do not replace this with `SELECT ... FROM teams LIMIT 1`. The primary team
// pointer is an explicit migration/configuration choice so a future second
// team cannot accidentally inherit another team's media or player release.

const PRIMARY_TEAM_SETTING = "primary_team_id";
// Static staff accounts do not carry a team ID in their signed cookie. Reading
// the one-team setting from D1 for every protected request made an otherwise
// healthy save path needlessly sensitive to a transient lookup failure. Cache
// only a verified, non-empty value for this warm Function isolate; D1 remains
// the source of truth and an explicit environment value always wins.
const PRIMARY_TEAM_CACHE_TTL_MS = 60 * 1000;
let primaryTeamCache = { value: "", expiresAt: 0 };

function cleanTeamId(value) {
  return String(value || "").trim();
}

function requireTeamId(value) {
  const teamId = cleanTeamId(value);
  if (!teamId) throw new Error("A team ID is required for team-scoped storage.");
  return teamId;
}

// KV is globally addressed. Keep every mutable workspace/clip record under a
// stable, encoded team prefix so a correct session check cannot be undone by
// an unscoped storage lookup later in the request path.
export function teamWorkspaceKey(teamId) {
  return `team:${encodeURIComponent(requireTeamId(teamId))}:workspace`;
}

export function teamClipManifestKey(teamId, sig) {
  const cleanSig = String(sig || "").trim();
  if (!cleanSig) throw new Error("A clip signature is required for team-scoped storage.");
  return `team:${encodeURIComponent(requireTeamId(teamId))}:clips:${encodeURIComponent(cleanSig)}`;
}

export function teamClipManifestPrefix(teamId) {
  return `team:${encodeURIComponent(requireTeamId(teamId))}:clips:`;
}

export async function getPrimaryTeamId(env) {
  const configured = cleanTeamId(env?.AUTH_PRIMARY_TEAM_ID);
  if (configured) return configured;
  if (!env?.DB) return "";

  if (primaryTeamCache.value && primaryTeamCache.expiresAt > Date.now()) {
    return primaryTeamCache.value;
  }

  try {
    const row = await env.DB
      .prepare("SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1")
      .bind(PRIMARY_TEAM_SETTING)
      .first();
    const teamId = cleanTeamId(row?.setting_value);
    if (teamId) {
      primaryTeamCache = { value: teamId, expiresAt: Date.now() + PRIMARY_TEAM_CACHE_TTL_MS };
    }
    return teamId;
  } catch (_err) {
    // The migration may not be installed yet. Callers decide whether a missing
    // explicit team is a configuration error or a reason to deny access.
    return "";
  }
}

// Historic R2/KV names predate tenant isolation. They are recovery evidence
// for exactly one explicitly configured team, never a fallback for whichever
// authenticated team happens to ask for them.
export async function isPrimaryTeam(env, teamId) {
  const primaryTeamId = await getPrimaryTeamId(env);
  const candidateTeamId = cleanTeamId(teamId);
  return Boolean(primaryTeamId && candidateTeamId && primaryTeamId === candidateTeamId);
}

export async function resolveSessionTeamId(session, env) {
  const direct = cleanTeamId(session?.teamId);
  if (direct) return direct;

  // A D1 principal must carry its team directly from the users row. Falling
  // back to a shared/default team for a D1 user would break tenant isolation.
  if (session?.d1UserId) return "";
  return getPrimaryTeamId(env);
}
