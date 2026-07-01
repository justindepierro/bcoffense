# Play Discussion, Player Accounts, Likes, Questions, and Notifications Roadmap

This roadmap begins after the current core-workflow and responsive-UX roadmap is substantially complete.

## Product Goal

Add a simple, football-focused communication layer that feels like old-school Facebook:

- Players can like plays.
- Players can ask questions from the Playbook or Practice Script.
- Coaches can reply, pin an official answer, and resolve the question.
- Players can indicate that they had the same question.
- Comments remain attached to the canonical Playbook play.
- Coaches can see which plays, positions, and assignments create the most confusion.
- Verified player accounts provide identity, permissions, history, and notifications.
- The system stays inexpensive and uses the existing Cloudflare and GitHub architecture wherever practical.

## Recommended Low-Cost Architecture

**Recommended starting stack**

- Front end and deployment: existing GitHub repository and Cloudflare Pages.
- Server/API: existing Cloudflare Pages Functions or Workers.
- Relational data: Cloudflare D1.
- Existing media: continue using Cloudflare R2.
- Existing high-read or cache data: continue using Cloudflare KV where appropriate.
- Authentication: self-hosted Better Auth on Cloudflare Workers/Pages Functions with D1.
- Abuse protection: Cloudflare Turnstile.
- In-app notifications: D1 notification records.
- Device notifications: standards-based Web Push using the existing service worker and VAPID.
- Email fallback: Resend free tier first, with Brevo evaluated as the higher daily-volume free alternative.
- Source control, pull requests, issues, and CI: GitHub.
- Cloudflare Access: optional protection for staging/admin tools, not the primary player-account system.
- GitHub OAuth: optional only for developers/coaches who already have GitHub accounts; do not require players to create GitHub accounts.

## Cost Guardrails

- Keep the first production version capable of operating on free tiers.
- Do not introduce SMS login in version one.
- Do not use phone-number verification unless a paid budget is approved.
- Do not purchase a commercial notification platform until Web Push and in-app notifications prove insufficient.
- Add usage dashboards and budget alerts before enabling paid Cloudflare services.
- Design all providers behind adapters so email, auth, or push vendors can be replaced later.

# Phase 0 — Product Rules and Scope

- [ ] Confirm that all permanent discussion belongs to the canonical Playbook play ID.
- [ ] Allow Practice Script entries to open the canonical play thread with script context attached.
- [ ] Allow Game Plan entries to open the canonical play thread with opponent and week context attached.
- [ ] Allow Call Sheet entries to open the canonical play thread without creating a duplicate thread.
- [ ] Allow Wristband cells to open the canonical play thread without creating a duplicate thread.
- [ ] Allow Opponent Scout recommendations to link to related Playbook discussions.
- [ ] Define version-one post types: Comment, Question, Coach Clarification, and Announcement.
- [ ] Define version-one reaction types: Like, Helpful, and I Have This Question Too.
- [ ] Define question states: Open, Answered, Resolved, and Reopened.
- [ ] Define which roles may create comments.
- [ ] Define which roles may create questions.
- [ ] Define which roles may create announcements.
- [ ] Define which roles may post official coach clarifications.
- [ ] Define which roles may resolve or reopen questions.
- [ ] Define which roles may pin official answers.
- [ ] Define which roles may lock threads.
- [ ] Define which roles may delete or hide posts.
- [ ] Define whether assistant coaches receive the same moderation permissions as head coaches.
- [ ] Define whether players may reply to other players or only to coaches.
- [ ] Define whether comments can be disabled while questions remain enabled.
- [ ] Define whether likes can be disabled independently.
- [ ] Define whether discussions are enabled team-wide, play-by-play, or script-by-script.
- [ ] Define retention rules for comments, questions, reactions, and notifications.
- [ ] Define what happens to discussion when a play is archived.
- [ ] Define what happens to discussion when a play is permanently deleted.
- [ ] Ensure copying a play does not silently copy the original discussion.
- [ ] Define whether a major play revision starts a new discussion version or continues the same thread.
- [ ] Document features explicitly out of scope for version one.
- [ ] Keep live chat, private messaging, follower systems, public profiles, and social feeds out of scope.
- [ ] Create an architecture decision record for the complete communication system.

# Phase 1 — Current Architecture and Cost Audit

- [ ] Inventory the existing Cloudflare Pages project configuration.
- [ ] Inventory all Pages Functions and Worker routes.
- [ ] Inventory the existing KV namespace and its current data responsibilities.
- [ ] Inventory the existing R2 bucket and its current data responsibilities.
- [ ] Confirm whether a D1 database already exists.
- [ ] Audit the existing custom authentication middleware and cookie/session format.
- [ ] Audit current coach, admin, and player role handling.
- [ ] Audit the existing service worker and notification-related code.
- [ ] Audit GitHub Actions and deployment workflows.
- [ ] Document current monthly Cloudflare usage.
- [ ] Document current Worker and Pages Functions request volume.
- [ ] Document current KV reads, writes, lists, and storage volume.
- [ ] Document current R2 storage and operation volume.
- [ ] Estimate expected player-account count for one team.
- [ ] Estimate expected account count for multiple teams.
- [ ] Estimate expected comments and questions per week.
- [ ] Estimate expected in-app notification volume.
- [ ] Estimate expected Web Push sends per week.
- [ ] Estimate expected transactional email sends per month.
- [ ] Create a cost worksheet for 50, 100, 250, 500, and 1,000 users.
- [ ] Add Cloudflare billing alerts and usage notifications.
- [ ] Define a maximum acceptable monthly operating budget.
- [ ] Require approval before adding any paid third-party dependency.
- [ ] Document free-tier limits that could affect production.
- [ ] Create a provider comparison table and keep it in the repository.

# Phase 2 — Provider Evaluation and Final Selection

- [ ] Evaluate Better Auth as the preferred self-hosted authentication library.
- [ ] Verify Better Auth support for Cloudflare Workers and D1 in the current project structure.
- [ ] Create a proof of concept using Better Auth and a temporary D1 database.
- [ ] Evaluate whether the current custom auth can be safely migrated incrementally.
- [ ] Evaluate Firebase Authentication as a managed fallback option.
- [ ] Evaluate Supabase Auth as a managed fallback option.
- [ ] Evaluate Clerk as a managed fallback option.
- [ ] Evaluate Auth0 as a managed fallback option.
- [ ] Compare free monthly active-user limits for every managed option.
- [ ] Compare email/password support for every option.
- [ ] Compare password-reset support for every option.
- [ ] Compare passkey support for every option.
- [ ] Compare organization/team support for every option.
- [ ] Compare role and permission support for every option.
- [ ] Compare Cloudflare compatibility for every option.
- [ ] Compare vendor lock-in and migration difficulty.
- [ ] Compare privacy and data-processing implications for student users.
- [ ] Reject GitHub OAuth as the required player login method.
- [ ] Consider GitHub OAuth only as an optional coach/developer login.
- [ ] Evaluate Cloudflare Access for staging and private administrative routes.
- [ ] Do not use Cloudflare Access as the primary roster/player account database.
- [ ] Evaluate Resend for account and password-reset email.
- [ ] Evaluate Brevo for higher-volume free transactional email.
- [ ] Compare domain verification and DNS setup for Resend and Brevo.
- [ ] Compare daily and monthly send limits.
- [ ] Compare delivery logs and retention.
- [ ] Choose one initial email provider and create an adapter interface.
- [ ] Evaluate standards-based Web Push as the primary external notification method.
- [ ] Do not buy OneSignal, Firebase Cloud Messaging, or another push platform before testing native Web Push.
- [ ] Document the selected stack and the reasons for every provider choice.

# Phase 3 — Cloudflare D1 Data Foundation

- [ ] Create a production D1 database for relational application data.
- [ ] Create a separate preview or staging D1 database.
- [ ] Add D1 bindings to wrangler configuration.
- [ ] Create a migration directory.
- [ ] Create repeatable D1 schema migrations.
- [ ] Add a migration journal.
- [ ] Create a users table.
- [ ] Create an accounts table if required by the auth library.
- [ ] Create a sessions table.
- [ ] Create a verification tokens table.
- [ ] Create a teams table.
- [ ] Create a team memberships table.
- [ ] Create a roster players table or migrate the existing roster model.
- [ ] Create a player profile table.
- [ ] Create a positions table or normalize the existing position model.
- [ ] Create a player positions join table.
- [ ] Create a play threads table.
- [ ] Create a discussion posts table.
- [ ] Create a question state history table.
- [ ] Create a reactions table.
- [ ] Create a notifications table.
- [ ] Create a push subscriptions table.
- [ ] Create a notification preferences table.
- [ ] Create a moderation actions table.
- [ ] Create a post edit history table.
- [ ] Create an audit events table.
- [ ] Create appropriate foreign keys.
- [ ] Create indexes for team, play, author, state, and creation time.
- [ ] Create uniqueness constraints to prevent duplicate reactions.
- [ ] Create soft-delete fields where historical recovery is required.
- [ ] Add created, updated, deleted, and resolved timestamps.
- [ ] Add migration tests.
- [ ] Add backup and restore documentation.
- [ ] Keep large media and video out of D1.
- [ ] Keep temporary cache-only values in KV rather than D1.
- [ ] Document which data belongs in D1, KV, and R2.

# Phase 4 — Player Account Model

- [x] Create a permanent user ID independent of roster display name.
- [ ] Link each authenticated player account to a roster player record.
- [ ] Allow one roster player to have at most one active primary account by default.
- [ ] Support coach-approved account relinking.
- [x] Store first and last name separately.
- [x] Store preferred display name.
- [ ] Store jersey number.
- [ ] Store graduation year where appropriate.
- [ ] Store active/inactive roster status.
- [x] Store primary position.
- [ ] Store secondary positions.
- [ ] Store team membership.
- [x] Store account role.
- [ ] Store account creation source.
- [x] Store last successful login time.
- [x] Store password-change time.
- [ ] Store account-disabled time and reason.
- [x] Do not store plaintext passwords.
- [x] Do not store plaintext PINs.
- [x] Do not expose internal user IDs in public URLs.
- [x] Create account states: Invited, Active, Disabled, Graduated, and Archived.
- [x] Support deactivating a player without deleting discussion history.
- [ ] Support transferring a player between rosters while preserving history.
- [ ] Support multiple team memberships only if the current product needs it.
- [ ] Add future parent/guardian account support to the deferred list.
- [ ] Add future alumni account support to the deferred list.
- [ ] Document minor-user privacy considerations.
- [ ] Review the account model with school administration before broad rollout.

# Phase 5 — Authentication Implementation

- [x] Integrate the selected authentication library into Cloudflare Pages Functions or Workers.
- [x] Connect authentication storage to D1.
- [x] Preserve existing admin and coach access during migration.
- [x] Create a compatibility layer for existing session checks.
- [x] Use secure, HttpOnly, SameSite cookies.
- [x] Use Secure cookies in production.
- [ ] Rotate session identifiers after login.
- [ ] Rotate session identifiers after privilege changes.
- [ ] Define separate session lengths for players and staff.
- [ ] Allow longer player sessions on trusted personal devices.
- [ ] Keep shorter staff sessions for sensitive administrative access.
- [x] Add email/password player login.
- [x] Add coach-created account invitations.
- [x] Add first-login password creation.
- [x] Add password reset.
- [ ] Add password change.
- [x] Add logout from current device.
- [ ] Add logout from all devices.
- [ ] Add account lockout or rate limiting for repeated failures.
- [ ] Add Cloudflare Turnstile to suspicious or repeated login attempts.
- [ ] Do not force Turnstile on every ordinary login unless abuse requires it.
- [x] Add generic login error messages that do not reveal whether an account exists.
- [ ] Add account-disabled messaging.
- [x] Add expired-invitation handling.
- [x] Add password-strength requirements that remain usable for students.
- [ ] Evaluate passkeys after email/password login is stable.
- [x] Do not add SMS verification in version one.
- [x] Add server-side authorization middleware.
- [ ] Enforce team boundaries on every protected endpoint.
- [x] Enforce role boundaries on every protected endpoint.
- [ ] Add auth integration tests.
- [ ] Add session expiration tests.
- [ ] Add account recovery tests.
- [ ] Add migration and rollback procedures.
- [ ] TODO: Debug end-to-end invite email flow (Player Accounts panel → email arrives → player sets password → logs in).

# Phase 6 — Account Provisioning and Roster Workflow

- [x] Add a coach roster-account management page.
- [x] Allow coaches to see which roster players have accounts.
- [x] Allow coaches to invite one player.
- [ ] Allow coaches to bulk invite selected players.
- [ ] Allow CSV roster import to create pending account records.
- [x] Allow coaches to copy invitation links.
- [ ] Allow coaches to print invitation cards.
- [x] Allow coaches to regenerate an expired invitation.
- [ ] Allow coaches to revoke an unused invitation.
- [x] Allow coaches to disable an account.
- [x] Allow coaches to reactivate an account.
- [x] Allow coaches to reset a player password through a safe recovery workflow.
- [x] Do not allow coaches to view player passwords.
- [ ] Allow coaches to correct a linked email address.
- [ ] Allow players to claim an existing roster record.
- [ ] Require coach approval when account claiming is ambiguous.
- [ ] Prevent two users from claiming the same roster record.
- [ ] Add a roster account-status filter.
- [ ] Add account-status counts to the coach dashboard.
- [ ] Add a reminder list for players who have not activated accounts.
- [ ] Add an activation completion percentage.
- [ ] Add account onboarding instructions optimized for phone screens.
- [ ] Add QR-code invitation support.
- [ ] Add a direct player-login URL.
- [ ] Add account provisioning audit logs.

# Phase 7 — Canonical Play Discussion Model

- [x] Create exactly one default discussion thread per canonical Playbook play.
- [x] Create the thread lazily when the first post is made.
- [x] Store the canonical play ID on every thread.
- [x] Store team ID on every thread.
- [x] Store thread enabled/disabled state.
- [x] Store thread locked/unlocked state.
- [x] Store whether comments are enabled.
- [x] Store whether questions are enabled.
- [x] Store whether reactions are enabled.
- [ ] Allow optional topic threads later without breaking the default thread.
- [ ] Store source context when a post originates from Practice Script.
- [ ] Store script ID when relevant.
- [ ] Store script period ID when relevant.
- [ ] Store opponent ID when relevant.
- [ ] Store game-week ID when relevant.
- [ ] Store position context when relevant.
- [ ] Store play revision identifier when relevant.
- [x] Do not duplicate posts when the thread is surfaced on another page.
- [x] Add canonical thread lookup utilities.
- [x] Add thread counts to play query results efficiently.
- [ ] Add open-question counts to play query results efficiently.
- [ ] Add unread-count queries without loading complete threads.
- [x] Add pagination or cursor loading for long threads.
- [x] Add server-side validation for every post.
- [x] Sanitize user-generated text.
- [x] Prevent HTML and script injection.
- [x] Set reasonable post-length limits.
- [ ] Set reasonable reply-depth limits.
- [x] Keep version one visually flat or one-level threaded.
- [ ] Add discussion model unit tests.

# Phase 8 — Comments and Old-School Feed UI

- [x] Add a Discussion tab to Playbook play detail.
- [ ] Add separate Comments and Questions filters within Discussion.
- [x] Display author name.
- [x] Display author role.
- [ ] Display position when useful.
- [x] Display relative and exact timestamp.
- [x] Display edited status.
- [ ] Display source context such as Tuesday Practice, Period 3.
- [x] Display a simple avatar fallback using initials.
- [x] Do not require profile photos.
- [x] Add a plain text comment composer.
- [x] Add a clear Post button.
- [x] Support keyboard submission without accidental posting.
- [x] Allow players to edit their own recent comments.
- [x] Allow players to delete their own eligible comments.
- [x] Allow coaches to edit their own comments.
- [ ] Preserve edit history for moderation.
- [x] Add Load More for long threads.
- [x] Add empty states.
- [x] Add loading states.
- [x] Add retry states.
- [ ] Add offline submission warning.
- [x] Prevent duplicate submissions during slow requests.
- [ ] Use optimistic UI only when rollback is reliable.
- [ ] Add phone layout.
- [ ] Add iPad layout.
- [ ] Add desktop layout.
- [ ] Meet touch-target and keyboard-accessibility requirements.
- [x] Keep the design visually simple and familiar.

# Phase 8A — Comment and Message Content Moderation

- [x] Create a server-side content-moderation service for comments, questions, replies, and announcements.
- [ ] Do not rely only on a basic profanity blacklist.
- [x] Define moderation categories for profanity, vulgarity, slurs, sexual content, threats, bullying, harassment, self-harm, personal information, and spam.
- [x] Define severity levels: Clear, Warning, Review, and Block.
- [x] Define moderation outcomes: Allow, Warn, Hold for Review, and Block.
- [x] Create a configurable team communication policy.
- [x] Allow administrators to choose whether mild profanity produces a warning or automatic block.
- [x] Always hold or block clear identity-based slurs.
- [x] Always hold or block explicit sexual content involving minors.
- [x] Always hold or block direct threats.
- [x] Create a normalization pipeline before moderation checks.
- [x] Convert text to lowercase for comparison.
- [x] Normalize Unicode characters and visual lookalikes.
- [x] Collapse repeated whitespace.
- [x] Detect letters separated by spaces or punctuation.
- [x] Detect common number-for-letter substitutions.
- [x] Detect punctuation-for-letter substitutions.
- [x] Normalize excessive repeated characters.
- [ ] Detect words split across multiple lines.
- [x] Detect common attempts to bypass the filter.
- [x] Keep the restricted-term rules on the server rather than exposing them in client JavaScript.
- [ ] Encrypt or otherwise restrict access to sensitive moderation configuration.
- [x] Create an extensible restricted-language dictionary.
- [x] Categorize restricted terms rather than storing one undifferentiated list.
- [x] Assign severity values to restricted terms and patterns.
- [x] Support exact-match patterns.
- [x] Support normalized-match patterns.
- [x] Support phrase patterns.
- [ ] Support fuzzy matching for deliberate misspellings.
- [ ] Add safeguards against excessive fuzzy-match false positives.
- [x] Create a football terminology allowlist.
- [x] Add legitimate terms such as blitz, pistol, gun, bomb, kill, smash, crack, trap, naked, bullet, shoot, and execution to context-aware review rules.
- [x] Do not globally allow a football term when the surrounding sentence is threatening or abusive.
- [x] Create context rules for football language.
- [x] Distinguish descriptions of plays from statements directed at a person.
- [x] Detect second-person threatening constructions such as direct threats toward “you.”
- [x] Detect targeted insults using names, roster identities, or tagged users.
- [ ] Detect repeated harassment across multiple posts.
- [x] Detect sexualized comments directed toward another user.
- [x] Detect attempts to reveal phone numbers, addresses, or other personal information.
- [x] Detect spam and repeated-message flooding.
- [x] Apply moderation to edited posts as well as new posts.
- [x] Apply moderation to coach posts and player posts.
- [x] Apply moderation before content becomes publicly visible when severity requires review.
- [x] Allow low-risk messages to publish immediately.
- [x] Show a neutral revision warning for mild or uncertain violations.
- [x] Allow the player to edit and resubmit a warned message.
- [x] Do not reveal the exact blocked-term dictionary to users.
- [x] Add a coach moderation queue.
- [x] Show the original submitted text only to authorized moderators.
- [x] Show detected category.
- [x] Show severity score.
- [ ] Show detected patterns or reasons.
- [x] Show author and source context.
- [ ] Show play, script, opponent, and position context.
- [x] Add Approve action.
- [x] Add Reject action.
- [ ] Add Edit and Approve action for coaches where policy permits.
- [ ] Add Warn User action.
- [ ] Add Lock Thread action.
- [ ] Add Temporary Mute action.
- [ ] Add Account Review action.
- [ ] Require a moderation reason for rejection, muting, or account action.
- [x] Store moderation decisions in an audit table.
- [x] Store moderator identity.
- [x] Store decision timestamp.
- [x] Preserve the submitted message securely for audit purposes where school policy permits.
- [x] Prevent ordinary users from accessing rejected content.
- [ ] Do not automatically create a disciplinary record from one filter match.
- [ ] Track false-positive reversals.
- [ ] Allow administrators to add a term to the football allowlist after review.
- [ ] Allow administrators to increase the severity of newly observed slang or coded language.
- [ ] Add a process for regularly reviewing moderation terms.
- [ ] Add rate limits for repeated blocked submissions.
- [ ] Add escalating cooldowns for repeated bypass attempts.
- [ ] Notify coaches after repeated severe violations.
- [ ] Avoid notifying the entire staff for mild isolated profanity.
- [ ] Add player-facing language explaining that team communication is monitored.
- [ ] Add team communication expectations to account onboarding.
- [ ] Add an acceptable-use acknowledgment.
- [ ] Add privacy language explaining moderation and audit logging.
- [ ] Add unit tests for ordinary football terminology.
- [ ] Add unit tests for profanity.
- [ ] Add unit tests for disguised profanity.
- [ ] Add unit tests for racial and identity-based slurs.
- [ ] Add unit tests for sexual language.
- [ ] Add unit tests for threats.
- [ ] Add unit tests for targeted harassment.
- [ ] Add unit tests for personal-information sharing.
- [ ] Add unit tests for Unicode and punctuation bypasses.
- [ ] Add tests ensuring legitimate football phrases are not falsely blocked.
- [ ] Add tests ensuring threatening uses of football terms are still detected.
- [ ] Add moderation permission tests.
- [ ] Add moderation audit-history tests.
- [ ] Add mobile moderation-queue layouts.
- [ ] Add iPad moderation-queue layouts.
- [ ] Add accessibility labels and status announcements.
- [ ] Add production monitoring for false-positive and false-negative reports.

# Phase 8B — Visual Coach Replies, Reply Trees, Attachments, and Emoji Reactions

# Product Goal

**Allow coaches and authorized staff to answer player questions using:**

- [ ] A normal text reply
- [ ] A marked-up copy of the play
- [ ] An uploaded image
- [ ] A marked-up uploaded image
- [ ] A combination of text and visual explanation

**The discussion interface should use a simple Facebook-style reply tree:**

- [ ] Original comment or question
- [ ] Direct replies underneath it
- [ ] One additional reply level where appropriate
- [ ] Collapsible reply groups
- [ ] Clear coach-answer highlighting
- [ ] Easy emoji reactions

**The feature must reuse the application’s existing telestrator tools wherever practical.**

⸻

# 8B.1 — Reply and Thread Architecture

- [x] Add parent-post support to the discussion-post data model.
- [x] Store parentPostId for replies.
- [x] Store rootPostId for efficient thread retrieval.
- [x] Store reply depth.
- [x] Limit visible reply nesting to a manageable depth.
- [x] Use a maximum of two visual indentation levels.
- [ ] Flatten deeper technical reply chains beneath the nearest supported visual parent.
- [ ] Preserve the complete logical parent relationship in the database.
- [x] Allow replies to comments.
- [x] Allow replies to questions.
- [ ] Allow replies to coach clarifications.
- [ ] Allow replies to visual attachments.
- [x] Prevent replies to deleted or locked posts unless a coach restores them.
- [ ] Allow coaches to lock one reply branch without locking the entire play discussion.
- [x] Add reply-count fields to post summaries.
- [ ] Add efficient thread-query indexes.
- [ ] Avoid one database query per reply.
- [ ] Load root posts and visible replies in batches.
- [x] Paginate large root-level discussions.
- [x] Add Load More Replies for long reply groups.
- [x] Preserve thread order after new replies are submitted.
- [x] Sort replies chronologically by default.
- [ ] Keep the official pinned coach answer above ordinary replies.
- [ ] Allow coaches to pin a reply as the official answer.
- [ ] Allow only one official pinned answer per question by default.
- [ ] Preserve previous pinned-answer history.
- [ ] Add thread architecture tests.

⸻

# 8B.2 — Facebook-Style Discussion Layout

- [x] Display each root comment or question as a clean discussion card.
- [x] Display replies directly beneath the parent post.
- [ ] Use a subtle connector line for reply branches.
- [x] Use modest indentation rather than deeply nested cards.
- [x] Display author name prominently.
- [x] Display author role.
- [ ] Display player position when relevant.
- [x] Display timestamp.
- [x] Display edited status.
- [x] Display question state.
- [ ] Display script and practice context when relevant.
- [x] Highlight official coach replies.
- [ ] Highlight pinned answers.
- [ ] Distinguish coaches from players without relying only on color.
- [x] Add a compact Reply action beneath every eligible post.
- [x] Add a compact React action beneath every eligible post.
- [ ] Add a compact More menu beneath every eligible post.
- [x] Display reaction summary beneath the post.
- [ ] Display the most-used reactions first.
- [x] Show total reply count.
- [x] Add View Replies and Hide Replies controls.
- [ ] Keep replies expanded when the user has actively opened the thread.
- [ ] Preserve expanded-thread state while navigating within the play.
- [x] Use a single-column feed on phones.
- [ ] Use a wider centered feed on tablets.
- [ ] Allow a side-panel discussion layout on desktop.
- [ ] Avoid excessive borders around every reply.
- [ ] Avoid displaying every moderation and editing control permanently.
- [ ] Move secondary controls into a three-dot menu.
- [x] Add skeleton loading states.
- [x] Add empty-thread states.
- [x] Add failed-load retry states.
- [ ] Add accessible thread semantics.

⸻

# 8B.3 — Reply Composer

- [ ] Add a Reply action to comments and questions.
- [ ] Show the author being replied to.
- [ ] Show a short preview of the parent message.
- [x] Allow plain-text replies.
- [x] Allow emoji insertion.
- [ ] Allow a marked-up play attachment.
- [ ] Allow an uploaded image attachment.
- [ ] Allow an uploaded image to be marked up before posting.
- [ ] Allow text and one or more supported attachments in the same reply.
- [x] Preserve an unfinished reply while the composer remains open.
- [ ] Preserve an unfinished reply during device rotation.
- [ ] Warn before closing a composer with unsaved text or markup.
- [x] Add Cancel.
- [x] Add Post Reply.
- [ ] Add Save Draft for coaches as a later enhancement.
- [x] Disable repeated submissions while a reply is uploading.
- [ ] Show upload progress.
- [ ] Show processing state.
- [ ] Show retry after failed upload.
- [x] Prevent accidental duplicate replies.
- [ ] Run text through the Phase 8A moderation system.
- [ ] Scan attachment metadata and file types.
- [ ] Enforce reply-length limits.
- [ ] Enforce attachment-count limits.
- [ ] Add reply-composer tests.

⸻

# 8B.4 — Mark Up This Play

- [ ] Add a Mark Up Play action to the coach reply composer.
- [ ] Open the current canonical play in the existing telestrator.
- [ ] Load the correct play revision.
- [ ] Load the play exactly as the player saw it when the question was asked where possible.
- [ ] Preserve script-specific context when relevant.
- [ ] Do not modify the canonical Playbook drawing.
- [ ] Create an independent reply-annotation document.
- [ ] Store the source play ID.
- [ ] Store the source play revision ID.
- [ ] Store the source script ID when relevant.
- [ ] Store the source opponent and Game Week context when relevant.
- [ ] Allow coaches to draw freehand.
- [ ] Allow coaches to draw arrows.
- [ ] Allow coaches to draw circles.
- [ ] Allow coaches to draw lines.
- [ ] Allow coaches to add text labels.
- [ ] Allow coaches to add position labels.
- [ ] Allow coaches to erase individual marks.
- [ ] Allow Undo.
- [ ] Allow Redo.
- [ ] Allow Clear All.
- [ ] Allow zooming and panning.
- [ ] Support Apple Pencil.
- [ ] Support touch.
- [ ] Support mouse.
- [ ] Support trackpad.
- [ ] Preserve accurate drawing coordinates across screen sizes.
- [ ] Preserve accurate coordinates after rotation.
- [ ] Save annotations as vector data where practical.
- [ ] Generate a display preview for quick thread rendering.
- [ ] Keep the editable vector source for future reopening.
- [ ] Add an optional caption.
- [ ] Add an optional coach explanation beneath the image.
- [ ] Add Preview Reply.
- [ ] Add Post Marked-Up Reply.
- [ ] Add Save and Continue Editing.
- [ ] Add Discard Markup.
- [ ] Confirm before discarding meaningful markup.
- [ ] Restore the coach to the exact discussion thread after posting.
- [ ] Add markup creation tests.
- [ ] Add coordinate-scaling tests.
- [ ] Add Apple Pencil manual testing instructions.

⸻

# 8B.5 — Upload Another Picture

- [ ] Add an Upload Image action to the reply composer.
- [ ] Support JPEG.
- [ ] Support PNG.
- [ ] Support WebP.
- [ ] Consider HEIC conversion for iPhone and iPad uploads.
- [ ] Reject unsupported file types.
- [ ] Validate the actual file signature rather than trusting the extension.
- [ ] Enforce maximum file size.
- [ ] Resize excessively large images.
- [ ] Create an optimized preview.
- [ ] Preserve a reasonable high-resolution original when necessary.
- [ ] Remove unnecessary metadata.
- [ ] Remove location metadata.
- [ ] Correct image orientation.
- [ ] Store uploads in Cloudflare R2.
- [ ] Store attachment metadata in D1.
- [ ] Use protected or signed delivery where required.
- [ ] Do not expose raw R2 administrative URLs.
- [ ] Add an image caption.
- [ ] Add alternative text.
- [ ] Prompt the coach for useful alternative text.
- [ ] Allow the uploaded image to be opened in the telestrator.
- [ ] Allow drawing over an uploaded image.
- [ ] Save the original image separately from the annotation layer.
- [ ] Allow the coach to reset to the unmarked original.
- [ ] Allow image replacement before posting.
- [ ] Add image-upload progress.
- [ ] Add image-upload retry.
- [ ] Add image deletion before posting.
- [ ] Add image security tests.
- [ ] Add mobile camera/photo-library testing.

⸻

# 8B.6 — Visual Reply Attachment Model

- [ ] Create a discussion attachments table.
- [ ] Store attachment ID.
- [ ] Store parent post ID.
- [ ] Store attachment type.
- [ ] Support play_markup.
- [ ] Support uploaded_image.
- [ ] Support annotated_image.
- [ ] Add future support for short video without implementing it yet.
- [ ] Store source R2 object key.
- [ ] Store preview R2 object key.
- [ ] Store annotation document key or annotation JSON.
- [ ] Store source play ID when applicable.
- [ ] Store source play revision ID when applicable.
- [ ] Store width.
- [ ] Store height.
- [ ] Store MIME type.
- [ ] Store byte size.
- [ ] Store caption.
- [ ] Store alternative text.
- [ ] Store uploader ID.
- [ ] Store creation time.
- [ ] Store deletion time.
- [ ] Store moderation status.
- [ ] Store processing status.
- [ ] Add indexes for post and play lookups.
- [ ] Add cascading or guarded deletion rules.
- [ ] Preserve attachments when a post is soft-deleted for moderation.
- [ ] Prevent ordinary users from loading attachments from hidden posts.
- [ ] Add attachment authorization tests.

⸻

# 8B.7 — Viewing Marked-Up Replies

- [ ] Display a compact visual preview within the reply tree.
- [ ] Preserve the play’s aspect ratio.
- [ ] Avoid cropping meaningful football content.
- [ ] Add Tap to Expand.
- [ ] Open the visual reply in a full-screen viewer on phones.
- [ ] Open the visual reply in a large modal or panel on tablets and desktop.
- [ ] Allow zoom.
- [ ] Allow pan.
- [ ] Add Reset View.
- [ ] Display the coach caption.
- [ ] Display the accompanying text reply.
- [ ] Display the source play name.
- [ ] Display source script context where appropriate.
- [ ] Display whether the canonical play has changed since the reply was posted.
- [ ] Add Open Current Play.
- [ ] Add Compare to Current Version as a later enhancement.
- [ ] Allow another coach to reply to the visual explanation.
- [ ] Allow players to react to the visual explanation.
- [ ] Add Helpful reaction prominently.
- [ ] Add download restrictions according to team policy.
- [ ] Do not include private comments in projector mode by default.
- [ ] Allow a coach to present a marked-up answer during film or practice.
- [ ] Add visual-reply accessibility support.

⸻

# 8B.8 — Emoji Reaction Set

Use a curated team reaction set rather than the entire emoji keyboard as the default quick-reaction menu.

Initial reactions:

- [ ] 👍 Thumbs Up
- [ ] 👎 Thumbs Down
- [ ] ❤️ Heart
- [ ] 🏈 Football
- [ ] 🥇 Gold Medal
- [ ] 6️⃣ Six / Touchdown
- [ ] 😀 Happy
- [ ] 💪 Strong
- [ ] ❓ Same Question or Confused, depending on context
- [ ] ✅ Got It
- [x] Add Thumbs Up reaction.
- [x] Add Thumbs Down reaction.
- [x] Add Heart reaction.
- [x] Add Football reaction.
- [x] Add Gold Medal reaction.
- [x] Add Six reaction.
- [x] Add Happy reaction.
- [x] Add Strong reaction.
- [x] Add Got It reaction.
- [x] Retain Helpful as a semantically meaningful reaction.
- [x] Retain I Have This Question Too as a semantically meaningful reaction.
- [ ] Decide whether Same Question uses an emoji or a labeled button.
- [x] Use stable internal reaction keys rather than storing only raw emoji.
- [x] Map each reaction key to a display emoji.
- [x] Store one reaction of each type per user per post.
- [ ] Allow a user to use multiple different reactions on one post only if the product decision permits it.
- [ ] Prefer one selected reaction per user per post for Facebook-style simplicity.
- [x] Allow changing a reaction.
- [x] Allow removing a reaction.
- [x] Show aggregate counts.
- [x] Show the top three reaction types in the compact summary.
- [ ] Open a full reaction breakdown when tapped.
- [ ] Allow authorized coaches to see which users selected each reaction.
- [ ] Decide whether players may see the full list of reacting users.
- [ ] Avoid public negative-reaction leaderboards.
- [ ] Treat Thumbs Down as feedback, not disciplinary evidence.
- [ ] Consider renaming Thumbs Down to Still Confused for player-facing football use.
- [ ] Consider using 😕 for Still Confused.
- [ ] Keep reaction choices configurable by administrators.
- [ ] Do not allow arbitrary custom emoji in version one.
- [x] Add accessible labels for every reaction.
- [ ] Do not rely on emoji appearance alone to communicate meaning.
- [ ] Add reaction unit tests.
- [ ] Add reaction aggregation tests.

⸻

# 8B.9 — Reaction Picker Interface

- [ ] Open the quick reaction picker by tapping or clicking React.
- [ ] Support press-and-hold on touch devices where reliable.
- [ ] Do not require press-and-hold as the only access method.
- [ ] Anchor the picker to the React button using the shared dropdown system.
- [ ] Keep the picker onscreen.
- [ ] Flip above the trigger when needed.
- [ ] Use a bottom sheet on very narrow screens when necessary.
- [ ] Display reactions in an orderly grid.
- [ ] Use large touch targets.
- [ ] Show a tooltip or label for each reaction.
- [ ] Allow keyboard arrow navigation.
- [ ] Close on Escape.
- [ ] Close on outside click.
- [ ] Restore focus to the React button.
- [ ] Show the user’s current reaction.
- [ ] Animate reaction selection subtly.
- [ ] Respect reduced-motion preferences.
- [ ] Use optimistic updates with rollback.
- [ ] Add reaction-picker responsive tests.

⸻

# 8B.10 — Coach Official Answer Workflow

- [ ] Allow a coach to answer with text only.
- [ ] Allow a coach to answer with markup only.
- [ ] Allow a coach to answer with text and markup.
- [ ] Allow a coach to answer with an uploaded image.
- [ ] Allow a coach to mark an uploaded image before posting.
- [ ] Add Mark as Official Answer.
- [ ] Add Pin Answer.
- [ ] Automatically mark the question Answered when an official coach answer is posted.
- [ ] Allow the coach to leave the question open after answering.
- [ ] Allow the coach to mark the question Resolved immediately.
- [ ] Notify the original player.
- [ ] Notify players who selected I Have This Question Too.
- [ ] Notify players assigned to that play only when the coach marks the reply as a team clarification.
- [ ] Avoid notifying the entire team for an ordinary one-player reply.
- [ ] Add Send to Position Group.
- [ ] Add Send to Everyone Assigned to This Play.
- [ ] Add Do Not Send Additional Notification.
- [ ] Add a notification preview before broad distribution.
- [ ] Add official-answer workflow tests.

⸻

# 8B.11 — Telestrator Reuse and Refactoring

- [ ] Audit the existing telestrator implementation.
- [ ] Separate reusable drawing-engine logic from presentation-specific UI.
- [ ] Create a shared telestrator core module.
- [ ] Reuse the same pointer-event system.
- [ ] Reuse drawing primitives.
- [ ] Reuse undo and redo history.
- [ ] Reuse zoom and pan logic.
- [ ] Reuse annotation serialization.
- [ ] Keep Presentation Mode controls separate from Reply Markup controls.
- [ ] Allow different toolbars to use the same drawing engine.
- [ ] Prevent reply markup from inheriting projector-only behavior.
- [ ] Prevent Presentation Mode temporary annotations from being saved as replies accidentally.
- [ ] Add explicit annotation modes:
  - Temporary Presentation
  - Saved Coach Reply
  - Uploaded Image Markup
- [ ] Create shared coordinate-conversion utilities.
- [ ] Create shared resize handling.
- [ ] Create shared export/preview generation.
- [ ] Remove duplicated telestrator code only after regression testing.
- [ ] Add reusable drawing-engine documentation.

⸻

# 8B.12 — Mobile and iPad Experience

- [ ] Make the root discussion feed document-scroll on phones.
- [ ] Avoid nested scrolling inside individual reply cards.
- [ ] Open the reply composer as a bottom sheet on phones.
- [ ] Open visual markup as a full-screen mode on phones.
- [ ] Preserve safe-area spacing.
- [ ] Keep Post and Cancel controls reachable above the keyboard.
- [ ] Keep drawing tools reachable in portrait.
- [ ] Optimize drawing tools for iPad landscape.
- [ ] Use 48-pixel or larger drawing controls on iPad.
- [ ] Support Apple Pencil without accidental page movement.
- [ ] Support finger drawing as a fallback.
- [ ] Allow the coach to hide the drawing toolbar temporarily.
- [ ] Allow full-screen visual viewing.
- [ ] Preserve unsent content during rotation.
- [ ] Keep reaction pickers attached to their trigger.
- [ ] Use an even emoji grid on phones.
- [ ] Avoid oversized discussion page headers.
- [ ] Preserve the compact mobile page-header system.
- [ ] Add screenshots for phone and iPad states.

⸻

# 8B.13 — Moderation of Visual Attachments

- [ ] Apply Phase 8A text moderation to captions and text replies.
- [ ] Do not attempt to rely entirely on automated image moderation.
- [ ] Restrict image uploads to authenticated authorized users.
- [ ] Allow players to upload images only if school policy explicitly permits it.
- [ ] Default version one to coach-only image uploads.
- [ ] Default version one to coach-only telestrator replies.
- [ ] Scan file types and signatures.
- [ ] Remove image metadata.
- [ ] Limit attachment size.
- [ ] Limit attachment frequency.
- [ ] Allow players to report a visual attachment.
- [ ] Allow coaches to hide or remove an attachment.
- [ ] Preserve restricted moderation history.
- [ ] Add attachment moderation status.
- [ ] Add audit logs for deleted attachments.
- [ ] Prevent access to hidden attachment URLs.
- [ ] Add image-upload abuse protections.
- [ ] Review student privacy policy before allowing player image uploads.

⸻

# 8B.14 — Storage and Cost Controls

- [ ] Store uploaded images and generated previews in Cloudflare R2.
- [ ] Store metadata and thread relationships in D1.
- [ ] Keep annotation JSON in D1 only if documents remain small.
- [ ] Store large annotation documents in R2 when appropriate.
- [ ] Generate thumbnails or previews.
- [ ] Avoid loading full-resolution images in the feed.
- [ ] Load the full image only when expanded.
- [ ] Compress uploads.
- [ ] Set maximum image dimensions.
- [ ] Track storage usage by team.
- [ ] Track upload operations.
- [ ] Add per-team attachment limits.
- [ ] Add per-user daily upload limits.
- [ ] Add cleanup for abandoned unfinished uploads.
- [ ] Add cleanup for deleted temporary previews.
- [ ] Preserve attachments required for moderation audit.
- [ ] Add storage usage reporting.
- [ ] Add budget warnings before free-tier limits are approached.
- [ ] Document R2 lifecycle and retention rules.

⸻

# 8B.15 — Notifications

- [ ] Notify the original author when someone replies.
- [ ] Notify a player when a coach posts a visual reply.
- [ ] Label the notification as Coach added a marked-up answer.
- [ ] Notify users who selected I Have This Question Too.
- [ ] Notify users when an official answer is pinned.
- [ ] Notify users when a question is resolved.
- [ ] Bundle multiple ordinary player replies.
- [ ] Do not send push notifications for every emoji reaction.
- [ ] Show reaction activity inside the application.
- [ ] Allow reaction notifications to be disabled.
- [ ] Deep-link notifications to the exact reply.
- [ ] Scroll and focus the relevant reply after opening.
- [ ] Expand the correct reply branch automatically.
- [ ] Add notification deep-link tests.

⸻

# 8B.16 — Analytics

- [ ] Track visual replies separately from text-only replies.
- [ ] Track which plays receive the most marked-up explanations.
- [ ] Track which positions receive the most visual explanations.
- [ ] Track Helpful reactions on coach visual replies.
- [ ] Track Got It reactions.
- [ ] Track Still Confused or Thumbs Down reactions carefully.
- [ ] Do not treat a negative reaction as misconduct.
- [ ] Allow coaches to identify explanations that may need revision.
- [ ] Track whether questions receive follow-up questions after visual replies.
- [ ] Track whether quiz performance improves after coach clarifications.
- [ ] Track whether repeated questions decrease after a pinned visual answer.
- [ ] Add a Most Helpful Visual Explanations report.
- [ ] Allow a helpful visual explanation to be promoted into permanent Playbook coaching notes.
- [ ] Require coach confirmation before promoting discussion content into canonical Playbook content.

⸻

# 8B.17 — Security and Authorization

- [ ] Enforce team boundaries for all attachments.
- [ ] Enforce role permissions for markup creation.
- [ ] Enforce role permissions for image upload.
- [ ] Validate every attachment request server-side.
- [ ] Prevent guessing R2 object identifiers.
- [ ] Use signed or authorized delivery where appropriate.
- [ ] Prevent unauthorized users from accessing archived team attachments.
- [ ] Prevent deleted accounts from creating replies.
- [ ] Preserve historical author attribution after account deactivation.
- [ ] Rate-limit reply creation.
- [ ] Rate-limit image uploads.
- [ ] Rate-limit reaction changes.
- [ ] Prevent malicious SVG uploads.
- [ ] Do not render arbitrary uploaded HTML.
- [ ] Sanitize annotation text labels.
- [ ] Add authorization and security tests.

⸻

# 8B.18 — Testing

- [ ] Test replying to a root comment.
- [ ] Test replying to a question.
- [ ] Test replying to another reply.
- [ ] Test maximum visual nesting.
- [ ] Test collapsed reply branches.
- [ ] Test pinned official answer behavior.
- [ ] Test text-only coach reply.
- [ ] Test play-markup coach reply.
- [ ] Test uploaded-image reply.
- [ ] Test uploaded-image markup.
- [ ] Test attachment upload failure.
- [ ] Test interrupted upload recovery.
- [ ] Test attachment authorization.
- [ ] Test deleted-post attachment protection.
- [ ] Test emoji reaction creation.
- [ ] Test reaction replacement.
- [ ] Test reaction removal.
- [ ] Test duplicate-reaction prevention.
- [ ] Test reaction aggregation.
- [ ] Test notification generation.
- [ ] Test exact-reply deep links.
- [ ] Test telestrator coordinate accuracy.
- [ ] Test play revision references.
- [ ] Test phone portrait.
- [ ] Test phone landscape.
- [ ] Test iPad portrait.
- [ ] Test iPad landscape.
- [ ] Test Apple Pencil manually.
- [ ] Test mouse and trackpad.
- [ ] Test keyboard navigation.
- [ ] Test screen-reader labels.
- [ ] Test reduced-motion mode.
- [ ] Test slow connections.
- [ ] Test offline interruption.
- [ ] Test R2 storage cleanup.
- [ ] Test D1 thread-query performance.

⸻

# 8B.19 — Recommended Release Sequence

**Release 8B.1 — Reply Trees and Reactions**

- [ ] Implement root comments and one-level replies.
- [ ] Implement Facebook-style branch layout.
- [ ] Implement Thumbs Up, Heart, Football, Gold Medal, Six, Happy, Strong, Helpful, and Got It.
- [ ] Implement reaction summaries.
- [ ] Implement pinned coach answers.
- [ ] Implement notification deep links.

**Release 8B.2 — Coach Play Markup**

- [ ] Refactor the existing telestrator into reusable modules.
- [ ] Add Mark Up Play to coach replies.
- [ ] Save annotation data without changing the canonical play.
- [ ] Display visual reply previews.
- [ ] Add full-screen visual viewer.
- [ ] Add Helpful and Got It reactions to visual replies.

**Release 8B.3 — Uploaded Images**

- [ ] Add coach-only image uploads.
- [ ] Store images in R2.
- [ ] Add metadata and attachment records to D1.
- [ ] Allow markup over uploaded images.
- [ ] Add image moderation and authorization.
- [ ] Add storage and cost controls.

**Release 8B.4 — Workflow Intelligence**

- [ ] Connect visual replies to Practice Script.
- [ ] Add Game Week question summaries.
- [ ] Add visual-explanation analytics.
- [ ] Allow promoting a visual answer into permanent Playbook coaching notes.
- [ ] Connect questions and visual replies to assignment quiz analytics.

⸻

**Definition of Done**

**Phase 8B is complete only when:**

- [ ] Replies display in a stable Facebook-style tree.
- [ ] Reply nesting remains readable on phones.
- [ ] Emoji reactions are easy to use and accessible.
- [ ] Coaches can mark up the current play without modifying the canonical diagram.
- [ ] Coaches can upload and mark up another image.
- [ ] Visual replies remain attached to the correct canonical play and question.
- [ ] Attachments are protected by team and role permissions.
- [ ] Images are stored efficiently in R2.
- [ ] Metadata and thread relationships are stored reliably in D1.
- [ ] The telestrator works with Apple Pencil, touch, mouse, and trackpad.
- [ ] Notifications open the exact relevant reply.
- [ ] Moderation applies to reply text and attachment captions.
- [ ] Mobile, iPad, and desktop tests pass.
- [ ] Storage usage and costs can be monitored.

# Phase 9 — Structured Questions and Coach Replies

- [ ] Add an Ask Coach action to Playbook play detail.
- [ ] Add an Ask Coach action to every eligible Practice Script play.
- [ ] Open the question composer without leaving the current page.
- [ ] Automatically include canonical play context.
- [ ] Automatically include script context when launched from Practice Script.
- [ ] Automatically include opponent and week context when available.
- [ ] Automatically include the authenticated player's primary position.
- [ ] Allow the player to change the question position context.
- [ ] Add question categories: Assignment, Technique, Front, Coverage, Motion, Protection, Read, and General.
- [x] Require a clear question body.
- [x] Allow coaches to reply.
- [ ] Allow assistant coaches to reply according to permissions.
- [ ] Mark a question Answered when a coach posts an official reply.
- [x] Allow a coach to mark a question Resolved.
- [ ] Allow a player to request reopening.
- [x] Allow a coach to reopen directly.
- [ ] Store every state transition.
- [x] Display a visible state badge.
- [ ] Allow a coach to pin one official answer.
- [ ] Allow replacing the pinned answer.
- [ ] Preserve the previously pinned answer in history.
- [ ] Allow a coach to add a clarification without changing the original player question.
- [ ] Add a Copy Link action for a question.
- [ ] Add a direct route to a specific question.
- [ ] Enforce authorization on direct question links.
- [ ] Add question lifecycle tests.

# Phase 10 — Likes, Helpful, and Same Question

- [ ] Add Like to canonical Playbook plays.
- [ ] Ensure each user may like a play only once.
- [ ] Allow a user to remove their like.
- [ ] Show aggregate like count.
- [ ] Do not display public popularity leaderboards by default.
- [x] Add Helpful reactions to coach answers.
- [x] Ensure each user may mark an answer Helpful only once.
- [x] Allow a user to remove Helpful.
- [x] Add I Have This Question Too to questions.
- [x] Use the same-question count to help coaches prioritize.
- [x] Do not create duplicate questions when a player selects I Have This Question Too.
- [ ] Allow the reacting player to optionally add private context later as a deferred feature.
- [x] Add reaction endpoints.
- [x] Add reaction permission checks.
- [x] Add optimistic reaction updates with rollback.
- [ ] Add reaction accessibility labels.
- [ ] Add reaction analytics.
- [ ] Add reaction abuse-rate limits.
- [ ] Add reaction unit and integration tests.

# Phase 11 — Practice Script Integration

- [x] Show a compact question/comment indicator on each scripted play.
- [x] Display open-question count.
- [x] Display total comment count.
- [ ] Display whether an official coach clarification exists.
- [ ] Add Ask Coach to the script play action menu.
- [x] Add View Discussion to the script play action menu.
- [x] Open the discussion in a bottom sheet on phone.
- [ ] Open the discussion in a side panel on iPad landscape.
- [ ] Open the discussion in a side panel or modal on desktop.
- [x] Preserve the coach's current script position when opening discussion.
- [ ] Restore focus to the originating play when discussion closes.
- [ ] Attach script, period, and rep context to new questions.
- [ ] Allow coaches to answer without leaving Team Run where practical.
- [ ] Do not let the discussion panel obstruct rep-scoring controls.
- [ ] Add a compact unresolved-question filter to the full script view.
- [ ] Add a Review Questions practice-period generator.
- [ ] Allow coaches to add highly questioned plays to a review period.
- [x] Add tests ensuring script entries reuse canonical threads.

# Phase 12 — Cross-Workflow Integration

- [ ] Surface discussion counts in Game Plan play rows.
- [ ] Surface open questions in Game Plan play detail.
- [ ] Allow Game Plan questions to include opponent context.
- [ ] Surface official clarifications in Game Plan.
- [ ] Surface discussion counts in Call Sheet play detail.
- [ ] Allow Call Sheet to show a warning when a called play has unresolved assignment questions.
- [ ] Keep comments hidden from printed Call Sheets unless explicitly selected.
- [ ] Surface discussion access from Wristband cell detail.
- [ ] Do not place discussion controls in the printed Wristband.
- [ ] Allow Opponent Scout recommendations to link to related play discussions.
- [ ] Allow coaches to ask a staff-only planning question from Opponent Scout as a future extension.
- [ ] Add a Game Week Questions summary card.
- [ ] Show open questions across the active Game Week.
- [ ] Show questions grouped by play.
- [ ] Show questions grouped by position.
- [ ] Show questions grouped by script period.
- [ ] Show official clarifications in Presentation Mode only when enabled.
- [ ] Keep player names and private discussion off projector clean view by default.

# Phase 13 — In-App Notifications

- [x] Create an in-app notification center.
- [x] Add an unread notification badge.
- [x] Create a notification when a coach replies to a player's question.
- [x] Create a notification when a question is marked resolved.
- [ ] Create a notification when a resolved question is reopened.
- [ ] Create a notification when a coach posts a clarification on an assigned play.
- [ ] Create a notification when a player is mentioned only if mentions are later enabled.
- [ ] Create a notification when a new quiz is assigned.
- [ ] Create a notification when a Practice Script is published.
- [x] Allow notification links to open the exact play or question.
- [x] Mark a notification read when opened.
- [x] Allow Mark All Read.
- [ ] Allow deleting or archiving old notifications.
- [x] Paginate notification history.
- [x] Store notifications in D1.
- [x] Do not use KV as the primary notification record.
- [ ] Add notification preference categories.
- [ ] Allow players to mute play-like activity.
- [ ] Do not send a notification for every ordinary Like.
- [ ] Bundle repeated same-question reactions where possible.
- [ ] Add notification deduplication.
- [ ] Add notification retention cleanup.
- [x] Add notification authorization checks.
- [ ] Add notification integration tests.

# Phase 14 — Web Push Notifications

- [x] Audit the existing service worker before adding push.
- [x] Generate VAPID keys and store the private key only as a Cloudflare secret.
- [x] Add a PushManager subscription flow.
- [x] Request notification permission only after explaining the benefit.
- [x] Do not request permission immediately on first page load.
- [x] Require a user gesture before the permission prompt.
- [x] Store push subscriptions in D1.
- [x] Associate each subscription with a user and device.
- [x] Support multiple devices per user.
- [x] Support deleting expired subscriptions.
- [ ] Handle pushsubscriptionchange where supported.
- [x] Add a Cloudflare Worker or Pages Function for sending push.
- [x] Send a push when a coach replies to the player's question.
- [ ] Send a push when a Practice Script is published if enabled.
- [ ] Send a push when a quiz is assigned if enabled.
- [ ] Do not send push for Likes by default.
- [ ] Add quiet-hour preferences.
- [ ] Add per-category push preferences.
- [x] Add unsubscribe controls.
- [ ] Add a test-notification control.
- [ ] Add iOS installed-web-app instructions.
- [x] Detect unsupported browsers gracefully.
- [x] Fall back to in-app notifications when push is unavailable.
- [ ] Rate-limit bulk notification sends.
- [ ] Add push delivery attempt logs without storing unnecessary device details.
- [x] Remove invalid endpoints after permanent delivery failures.
- [ ] Add Web Push tests and manual device test instructions.

# Phase 15 — Email Notifications and Account Mail

- [x] Create a provider-neutral email adapter.
- [x] Implement the selected initial provider.
- [ ] Add domain verification.
- [ ] Configure SPF.
- [ ] Configure DKIM.
- [ ] Configure DMARC with an appropriate starting policy.
- [x] Add invitation email.
- [x] Add password-reset email.
- [ ] Add email-address verification if required.
- [ ] Add account-disabled notice where appropriate.
- [ ] Add coach-reply email as an optional preference.
- [ ] Add weekly unresolved-question digest as a future option.
- [ ] Do not email players for every Like.
- [x] Use text and HTML versions.
- [x] Keep email content concise.
- [ ] Do not expose private team data in subject lines.
- [x] Use expiring, single-use reset tokens.
- [x] Do not log full reset links.
- [ ] Add bounce and complaint handling if the provider exposes it.
- [ ] Add provider failure fallback logging.
- [ ] Add email send limits.
- [ ] Add test-email tooling restricted to administrators.
- [ ] Track monthly send usage.
- [ ] Warn administrators before free-tier limits are reached.
- [ ] Add email integration tests with provider calls mocked.

# Phase 16 — Coach Question Inbox

- [x] Add a Player Questions card to the coach dashboard.
- [x] Show total open questions.
- [x] Show unanswered questions.
- [x] Show answered but unresolved questions.
- [x] Show questions asked today.
- [ ] Show questions by active Game Week.
- [x] Create a dedicated coach question inbox.
- [ ] Filter by team.
- [ ] Filter by player.
- [ ] Filter by position.
- [ ] Filter by play.
- [ ] Filter by script.
- [ ] Filter by opponent.
- [ ] Filter by category.
- [x] Filter by state.
- [x] Sort by newest.
- [x] Sort by oldest unanswered.
- [x] Sort by same-question count.
- [ ] Sort by active Game Week relevance.
- [x] Allow inline coach reply.
- [x] Allow inline resolve.
- [ ] Allow pinning an answer.
- [x] Allow opening full play detail.
- [ ] Allow adding the play to a practice review period.
- [ ] Show response-time metrics carefully without turning them into punitive rankings.
- [x] Add mobile coach inbox layout.
- [ ] Add iPad split-view inbox layout.
- [ ] Add desktop triage layout.

# Phase 17 — Player Portal Communication Area

- [x] Add My Questions to the player portal.
- [x] Show open questions.
- [x] Show coach replies.
- [x] Show resolved questions.
- [ ] Show questions the player marked Same Question.
- [ ] Show unread coach clarifications.
- [ ] Show discussions on assigned plays.
- [ ] Allow filtering by active Practice Script.
- [ ] Allow filtering by Playbook collection.
- [ ] Allow filtering by position.
- [x] Add direct links back to play detail.
- [ ] Add a simple notification-preferences page.
- [ ] Add push-subscription status.
- [ ] Add email-notification status.
- [ ] Add account and password settings.
- [ ] Add session/device management.
- [ ] Add accessible empty states.
- [x] Add phone-first layout.
- [ ] Add installed-iPad web-app layout.

# Phase 18 — Moderation and Safety

- [ ] Allow coaches to hide a post.
- [ ] Allow coaches to delete a post.
- [ ] Prefer soft deletion for moderation history.
- [ ] Allow coaches to lock a thread.
- [ ] Allow coaches to disable comments on a play.
- [ ] Allow coaches to disable questions on a play.
- [ ] Allow coaches to disable reactions on a play.
- [ ] Allow coaches to mute a user temporarily.
- [ ] Allow administrators to disable an account.
- [ ] Allow players to report inappropriate content.
- [ ] Create a moderation queue.
- [ ] Store moderation reason.
- [ ] Store moderator identity.
- [ ] Store moderation timestamp.
- [ ] Preserve original content in restricted audit history when policy permits.
- [ ] Prevent ordinary users from accessing deleted content.
- [ ] Add profanity and abuse safeguards that do not block legitimate football terms.
- [ ] Add posting rate limits.
- [ ] Add repeated-content detection.
- [ ] Add oversized-payload protection.
- [ ] Add link restrictions in version one.
- [ ] Disable file attachments in version one.
- [ ] Add CSRF protections appropriate to the chosen auth architecture.
- [ ] Add XSS and injection tests.
- [ ] Add authorization tests for moderation actions.
- [ ] Create a school-facing acceptable-use policy draft.
- [ ] Create a coach moderation guide.
- [ ] Create a student communication expectations guide.

# Phase 19 — Analytics and Coaching Insight

- [ ] Track total questions per play.
- [ ] Track open questions per play.
- [ ] Track questions per position.
- [ ] Track questions per category.
- [ ] Track same-question reactions.
- [ ] Track average coach response time.
- [ ] Track resolution time.
- [ ] Track recurring questions after a clarification.
- [ ] Identify most-questioned plays.
- [ ] Identify most-questioned positions.
- [ ] Identify most-questioned assignments.
- [ ] Identify scripts with the most unresolved questions.
- [ ] Identify questions created before versus after practice.
- [ ] Identify plays with many quiz misses and many questions.
- [ ] Combine quiz analytics with discussion analytics.
- [ ] Add a Needs Teaching Review signal.
- [ ] Allow coaches to add flagged plays to Practice Script.
- [ ] Allow coaches to create a review period from analytics.
- [ ] Allow coaches to add an official clarification to the play.
- [ ] Do not rank or shame players publicly.
- [ ] Restrict player-level analytics to authorized staff.
- [ ] Add exportable aggregate analytics.
- [ ] Keep historical analytics tied to play and script versions.
- [ ] Add analytics correctness tests.

# Phase 20 — Performance and Scalability

- [ ] Use indexed D1 queries for thread summaries.
- [ ] Do not load full discussion threads in Playbook list views.
- [ ] Return counts and latest-post summaries separately.
- [ ] Paginate long discussions.
- [ ] Batch notification creation when practical.
- [ ] Bundle repetitive notifications.
- [ ] Cache safe aggregate counts briefly where useful.
- [ ] Do not cache private user-specific content publicly.
- [ ] Use KV only for appropriate read-heavy derived data.
- [ ] Use Cloudflare Queues only if notification volume eventually justifies it.
- [ ] Evaluate Durable Objects only for future live rooms or real-time collaboration.
- [ ] Do not add Durable Objects for ordinary asynchronous comments unless required.
- [ ] Add database cleanup jobs.
- [ ] Add expired-session cleanup.
- [ ] Add expired-token cleanup.
- [ ] Add old-notification cleanup.
- [ ] Add invalid push-subscription cleanup.
- [ ] Measure endpoint latency.
- [ ] Measure D1 query counts.
- [ ] Add production error monitoring.
- [ ] Add structured logs without sensitive post bodies where unnecessary.
- [ ] Create load tests for likely team usage.
- [ ] Create a scaling plan for multi-team adoption.

# Phase 21 — Testing Matrix

- [ ] Test player account creation.
- [ ] Test account invitation expiration.
- [ ] Test password reset.
- [ ] Test session renewal.
- [ ] Test disabled accounts.
- [ ] Test team-boundary enforcement.
- [ ] Test player role restrictions.
- [ ] Test coach role restrictions.
- [ ] Test admin role restrictions.
- [ ] Test comment creation.
- [ ] Test comment editing.
- [ ] Test comment deletion.
- [ ] Test question creation.
- [ ] Test coach reply.
- [ ] Test question resolution.
- [ ] Test question reopening.
- [ ] Test pinned answers.
- [ ] Test duplicate reaction prevention.
- [ ] Test Practice Script context.
- [ ] Test canonical-thread reuse across pages.
- [ ] Test notification creation.
- [ ] Test unread counts.
- [ ] Test notification deep links.
- [ ] Test push subscription.
- [ ] Test expired push subscription cleanup.
- [ ] Test email adapter failures.
- [ ] Test moderation.
- [ ] Test rate limiting.
- [ ] Test XSS payload rejection.
- [ ] Test CSRF protections.
- [ ] Test phone layouts at 320, 375, 390, 412, and 430 pixel widths.
- [ ] Test iPad portrait.
- [ ] Test iPad landscape.
- [ ] Test installed Home Screen web-app mode.
- [ ] Test desktop layouts.
- [ ] Test keyboard navigation.
- [ ] Test screen-reader names and states.
- [ ] Test offline and reconnect behavior.
- [ ] Test GitHub-to-Cloudflare preview deployments.
- [ ] Test D1 preview migrations before production migrations.

# Phase 22 — Deployment and Rollout

- [ ] Deploy database and auth foundation behind a feature flag.
- [ ] Enable staff accounts first.
- [ ] Enable a small test group of player accounts.
- [ ] Run a closed comments pilot on a limited Playbook collection.
- [ ] Enable questions before general comments if that provides clearer value.
- [ ] Collect coach feedback.
- [ ] Collect player usability feedback.
- [ ] Review moderation needs after the pilot.
- [ ] Review notification opt-in rates.
- [ ] Review email delivery.
- [ ] Review free-tier usage.
- [ ] Review D1 query volume.
- [ ] Review Worker request volume.
- [ ] Review push delivery failures.
- [ ] Fix pilot issues before team-wide rollout.
- [ ] Enable all player accounts.
- [ ] Enable Practice Script Ask Coach.
- [ ] Enable coach question inbox.
- [ ] Enable in-app notifications.
- [ ] Enable Web Push as opt-in.
- [ ] Keep email replies opt-in except essential account email.
- [ ] Publish player instructions.
- [ ] Publish coach instructions.
- [ ] Create a rollback plan.
- [ ] Create an incident-response contact and procedure.
- [ ] Schedule a post-launch security review.
- [ ] Schedule a post-launch cost review.

# Deferred Phase — Future Enhancements

- [ ] Add passkey login.
- [ ] Add Google or Microsoft school-account login if administration approves.
- [ ] Add verified school-domain account linking.
- [ ] Add private coach-to-player messaging only after policy review.
- [ ] Add diagram markup attached to a coach answer.
- [ ] Add image attachments.
- [ ] Add short video reply attachments stored in R2.
- [ ] Add voice-question transcription.
- [ ] Add live coach-hosted Q&A during film sessions.
- [ ] Add real-time live quiz rooms.
- [ ] Add staff-only discussion threads.
- [ ] Add position-group private discussion.
- [ ] Add weekly question digest.
- [ ] Add intelligent duplicate-question suggestions.
- [ ] Add AI-assisted question categorization only with explicit review.
- [ ] Add AI-assisted answer drafting only as a coach-controlled optional tool.
- [ ] Add multi-team and organization administration.
- [ ] Add parent/guardian notification options only after policy review.

# Current Cost and Platform Notes — June 2026

These notes should be rechecked immediately before implementation because pricing and free-tier limits can change.

- Cloudflare Workers Free currently includes Workers and Pages Functions usage, with a 100,000-request daily limit shared across applicable Worker requests.
- Cloudflare D1 is available on the Free plan. Current free limits include up to 10 databases, 500 MB per database, and 5 GB total account storage.
- Cloudflare R2 currently includes a free tier of 10 GB-month storage, 1 million Class A operations, 10 million Class B operations, and free Internet egress.
- Better Auth announced first-class Cloudflare D1 support in 2026 and is open-source/self-hosted.
- Resend currently lists a free transactional tier of 3,000 emails per month with a 100-email daily limit.
- Brevo currently lists a free tier with 300 email sends per day and includes transactional email.
- Standards-based Web Push can operate through the browser Push API and service worker without paying a per-user notification platform, although backend Worker requests still count toward Cloudflare usage.
- Apple supports Web Push for web apps through service workers; iPhone and iPad users generally need the web app installed to the Home Screen for the intended notification experience.
- GitHub is best used here for repository hosting, pull requests, issues, Actions, and Cloudflare deployment integration. Requiring GitHub OAuth for high-school players would add unnecessary account friction.
- Cloudflare Access is useful for protecting staging environments and staff-only administrative tools, but it should not replace the application's roster, user-profile, team-membership, and player-permission system.

## Recheck Before Coding

- [ ] Recheck Cloudflare Workers pricing and limits.
- [ ] Recheck D1 pricing and limits.
- [ ] Recheck KV pricing and limits.
- [ ] Recheck R2 pricing and limits.
- [ ] Recheck Better Auth Cloudflare support.
- [ ] Recheck Resend free-tier limits.
- [ ] Recheck Brevo free-tier limits.
- [ ] Recheck Apple and Safari Web Push requirements.
- [ ] Recheck GitHub Actions and Cloudflare deployment integration.
- [ ] Update the provider comparison table with the verification date.
