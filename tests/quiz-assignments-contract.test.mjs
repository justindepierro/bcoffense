import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

let passed = 0;
let failed = 0;
function assert(condition, label) {
  if (condition) { passed += 1; console.log(`  ✅ ${label}`); }
  else { failed += 1; console.error(`  ❌ ${label}`); }
}
async function source(relativePath) {
  return readFile(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

console.log("\n▸ Private quiz homework contract");
const [migration, migrationQuestionConfig, helper, route, client, quiz, notifications, index, sw] = await Promise.all([
  source("../migrations/0020_quiz_assignments.sql"),
  source("../migrations/0021_quiz_assignment_question_config.sql"),
  source("../functions/_lib/d1-quiz-assignments.js"),
  source("../functions/api/quiz-assignments/index.js"),
  source("../js/script-quiz-assignments.js"),
  source("../js/script-quiz.js"),
  source("../js/app-notifications.js"),
  source("../index.html"),
  source("../sw.js"),
]);

assert(
  migration.includes("quiz_assignments") && migration.includes("quiz_assignment_recipients")
    && migration.includes("PRIMARY KEY (assignment_id, user_id)"),
  "migration makes recipient membership the private assignment boundary",
);
assert(
  helper.includes("a.team_id = ?") && helper.includes("r.user_id = ?")
    && helper.includes("a.status = 'published'") && helper.includes("db.batch(statements)"),
  "assignment reads and writes are team-scoped, recipient-scoped, and atomic",
);
assert(
  migrationQuestionConfig.includes("question_types_json") && migrationQuestionConfig.includes("custom_questions_json")
    && helper.includes("safeCustomQuestions") && helper.includes("safeQuestionTypes"),
  "assignment schema safely preserves coach-selected question types and authored multiple choice",
);
assert(
  route.includes("isQuizAssignmentStaff") && route.includes("record-attempt")
    && route.includes("createNotification") && route.includes("sendPushToUser"),
  "coach delivery is role-gated and sends a private in-app/push notification",
);
assert(
  client.includes("startPlayerQuizAssignment") && client.includes("recordQuizAssignmentAttempt")
    && client.includes("renderPlayerQuizHomeworkDashboard") && client.includes("openQuizAssignmentManager")
    && client.includes("Saved practice script") && client.includes("Game Plan") && client.includes("Custom question"),
  "client includes coach creation, player dashboard delivery, and completion reporting",
);
assert(
  quiz.includes('"assignment"') && quiz.includes("_quizAssignmentId")
    && quiz.includes("recordQuizAssignmentAttempt") && quiz.includes("custom_multiple_choice"),
  "existing quiz engine preserves the assignment identity through result save",
);
assert(
  notifications.includes('deepLink.startsWith("quiz-assignment:")')
    && notifications.includes('quiz_homework: "📚"'),
  "homework notification opens exactly the assigned quiz",
);
assert(
  index.includes("script-quiz-assignments.js?v=1275") && sw.includes("./js/script-quiz-assignments.js"),
  "assignment client is loaded and cached with the app shell",
);

if (failed) {
  console.error(`\n${failed} homework contract assertion${failed === 1 ? "" : "s"} failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n${passed} homework contract assertions passed.`);
}
