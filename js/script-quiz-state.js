// Script Quiz state and immutable runtime configuration.
// Loaded before script-quiz.js so the runtime remains global-scope compatible.

let _quizPlays = [];     // [{ play, period }]
let _quizIndex = 0;
let _quizShuffled = false;
let _quizRevealed = false;
let _quizAnswers = new Map();
let _quizChoiceCache = new Map();
let _quizCurrentChoices = [];
let _quizCurrentQuestion = null;
let _quizScore = 0;
let _quizStreak = 0;
let _quizBestStreak = 0;
let _quizBasePlays = [];
let _quizSourceType = "script";
let _quizSourceId = "";
let _quizSourceWeight = 1;
let _quizTitle = "Play Quiz";
// A private D1 homework assignment may use the same quiz engine as a script.
// Keep the assignment identity separate from sourceId so result recording stays
// explicit and cannot accidentally mark a normal script quiz as homework.
let _quizAssignmentId = "";
// Assignment authors can narrow a quiz without changing a player's normal
// personal quiz preferences.
let _quizAllowedQuestionTypes = [];
let _quizMode = "quick";
let _quizSignalCategories = [];
let _quizSignalMultiplier = 1;
let _playerQuizSelectedMode = "quick";
let _playerQuizSelectedSource = "script";
let _quizPositionKey = "respQ";
let _quizPositionMode = "primary";
let _quizFinished = false;
let _quizSavedAttemptId = "";
let _quizExitSummaryOpen = false;
// Preserve the player's intentional destination when the quiz overlay closes.
// Without this, a script-backed quiz can fall through to the coach Script tab.
let _quizReturnDestination = "stay";
// Standard question feedback uses a short delayed transition. Keep its handle
// so pausing, closing, navigating, or starting another quiz cancels it.
let _quizStandardAdvanceTimer = 0;
let _quizTimerId = 0;
let _quizTimeLimitMs = 0;
let _quizStartedAt = 0;
let _quizFinishedAt = 0;
let _quizRoundTimerId = 0;
let _quizRoundQuestionKey = "";
let _quizRoundStartedAt = 0;
let _quizRoundClipUntil = 0;
let _quizRoundAnswerUntil = 0;
let _quizRoundPhase = "";

const SCRIPT_QUIZ_CHOICE_COLORS = ["blue", "red", "gold", "green"];
const SIGNAL_SPRINT_DURATION_MS = 100000;
const SIGNAL_SPRINT_TARGET_REPS = 100;
const SIGNAL_BATTLE_CLIP_MS = 5000;
const SIGNAL_BATTLE_ANSWER_MS = 6000;
const SIGNAL_BATTLE_TARGET_REPS = 20;
const SIGNAL_HEAT_CHECK_TARGET_REPS = 200;
const SIGNAL_QUIZ_CORRECT_ADVANCE_MS = 90;
const SIGNAL_QUIZ_WRONG_FEEDBACK_MS = 420;
const SIGNAL_QUIZ_HEAT_MISS_FINISH_MS = 520;
const SIGNAL_QUIZ_PRELOAD_WINDOW = 3;
// Standard quizzes show a brief result moment, then advance every scored answer.
// Leaving misses in place looked like a dead answer button on a phone.
// How many of the most-plausible (similarity-ranked) distractors to keep as the
// candidate window before randomly choosing 3. Small enough that wrong answers
// stay believable look-alikes, large enough that repeated quizzes still vary.
const QUIZ_DISTRACTOR_WINDOW = 8;
const QUIZ_DIAGRAM_PRELOAD_WINDOW = 4;
const QUIZ_MEDIA_PREP_TIMEOUT_MS = 650;
const QUIZ_PLANNER_RECENT_TYPES_WINDOW = 4;
const QUIZ_PLANNER_HISTORY_WINDOW = 40;
const SIGNAL_GAME_CATEGORY_OPTIONS = [
  { id: "CORE", label: "Core" },
  { id: "TAGS", label: "Tags" },
  { id: "BLOCKING", label: "Blocking" },
  { id: "MOTIONS", label: "Motions" },
];
const SIGNAL_GAME_DEFAULT_SETTINGS = {
  categories: SIGNAL_GAME_CATEGORY_OPTIONS.map((category) => category.id),
  eligibleCategories: SIGNAL_GAME_CATEGORY_OPTIONS.map((category) => category.id),
  minClipCount: 2,
  includeDraftForStaff: false,
};
const PLAYER_QUIZ_WEEKLY_GOAL = 1000;
const PLAYER_QUIZ_BASE_CORRECT_POINTS = 10;
const PLAYER_QUIZ_STREAK_STEP_POINTS = 1;
const PLAYER_QUIZ_MAX_STREAK_BONUS = 4;
const PLAYER_QUIZ_MIN_BONUS_ANSWERS = 5;
const _quizSignalPreloadCache = new Map();
let _quizMediaPrepToken = 0;
let _quizLaunchStartedAt = 0;
let _quizFirstQuestionVisibleRecorded = false;
const PLAYER_QUIZ_SOURCE_WEIGHTS = {
  script: 1,
  gameplan: 1.25,
  signal: 1,
};
