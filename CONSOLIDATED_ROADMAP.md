# Consolidated Product Roadmap

This document serves as the master roadmap for the BCOffense application, consolidating all incomplete tasks from previous roadmaps (`ROADMAP_TO_MVP.md`, `ROADMAP_TWO_OMG.md`, `ACTIONS_HUB_ROADMAP.md`, `PRODUCT_ROADMAP.md`).

## Phase 1: Deep Clean, Audit, and Performance Stabilization
Before adding any new features, the codebase must undergo a rigorous audit to ensure stability, reduce technical debt, and prevent regressions.

- [ ] **Global Code Consistency Audit**
  - [ ] Enforce standard formatting across all JS, CSS, and HTML files.
  - [ ] Identify and resolve any conflicting CSS rules, particularly around responsive layouts and modal z-indexes.
  - [ ] Standardize nomenclature (e.g., ensure "Game Week", "Opponent Scout", "Wristband" are used consistently in the UI and variable names).
- [ ] **Error and Bug Hunt**
  - [ ] Review all console warnings and errors during the complete workflow (Import -> Scout -> Plan -> Script -> Wristband -> Call Sheet).
  - [ ] Test all `storageManager` fallback logic (IndexedDB -> localStorage -> RAM) and address any silent failures.
  - [ ] Audit service worker caching to ensure updates are reliably propagated without breaking offline mode.
- [ ] **Workflow Friction Points**
  - [ ] Identify and smooth out any remaining friction points in the primary Game Week workflow.
  - [ ] Consolidate or eliminate redundant UI components that clutter the mobile experience.
- [ ] **Data Model Validation**
  - [ ] Verify that all stable play IDs are correctly tracked and preserved across all modules and handoffs.
  - [ ] Ensure that deleting or updating a play correctly updates downstream artifacts without orphans.

## Phase 2: Completion of Planned Workflow Enhancements
Complete the remaining tasks from the previous Core Workflow and UX Implementation Roadmap.

- [ ] `TODO: MANUAL` — Establish baseline task times for Playbook-to-Call-Sheet workflow.
- [ ] `TODO: OMG ROADMAP` — Add team-level scope and Varsity/JV scope (Requires D1 teams table + multi-team auth).
- [ ] `TODO: MANUAL` — Run manual iPad Safari and installed-web-app testing.
- [ ] `TODO: MANUAL` — Run iPad portrait, landscape, split-screen, and external-display tests.
- [ ] `TODO: MANUAL` — Run phone Safari and Chrome tests.
- [ ] `TODO: MANUAL` — Measure the updated full-workflow task time.
- [ ] `TODO: MANUAL` — Compare clicks, page switches, and duplicate data entry against baseline.
- [ ] `TODO: MANUAL` — Document the final workflow for coaches.
- [ ] `TODO: MANUAL` — Collect coach feedback on terminology and ordering.

## Phase 3: Player Experience and Play Discussion (The "Facebook-Style" Communication Layer)
Implement the communication layer intended to allow players to ask questions and interact with plays.

### 3.1 Architecture, Auth, and Storage Prep
- [ ] **Storage & Infrastructure Audit**
  - [ ] Document current monthly Cloudflare usage, Worker/Pages Functions request volume, and KV reads/writes.
  - [ ] Estimate expected accounts, comments, questions per week, and in-app/push notification volume.
  - [ ] Create a cost worksheet for various user tiers and establish billing alerts/maximum budgets.
- [ ] **Authentication Selection**
  - [ ] Evaluate Better Auth (or fallbacks like Firebase, Supabase, Clerk) for self-hosted D1 auth.
  - [ ] Create a proof-of-concept replacing the custom auth with the selected library.
- [ ] **D1 Database Implementation**
  - [ ] Create preview/staging databases.
  - [ ] Add migration journal, backup/restore documentation.
  - [ ] Create teams table, team memberships table, player profile table, position tables.
  - [ ] Create post edit history table.
  - [ ] Add migration tests.
### 3.2 Player Account Model and Roster Management
- [ ] **Account Model**
  - [ ] Link authenticated player accounts to a roster player record.
  - [ ] Allow one roster player to have at most one active primary account by default.
  - [ ] Support coach-approved account relinking.
  - [ ] Store jersey number, graduation year, active/inactive roster status, secondary positions, team membership.
  - [ ] Support transferring a player between rosters while preserving history.
- [ ] **Roster Workflow**
  - [ ] Allow coaches to bulk invite selected players.
  - [ ] Allow CSV roster import to create pending account records.
  - [ ] Allow coaches to print invitation cards.
  - [ ] Allow coaches to revoke an unused invitation.
  - [ ] Allow coaches to correct a linked email address.
  - [ ] Allow players to claim an existing roster record.
  - [ ] Require coach approval when account claiming is ambiguous.
  - [ ] Prevent two users from claiming the same roster record.
  - [ ] Add roster account-status filter, counts to dash, reminder list, and activation completion percentage.
  - [ ] Add account onboarding instructions, QR-code invitations, direct login URL, and audit logs.
### 3.3 Core Discussion Features (Replies, Visuals, Reactions)
- [ ] **Discussion Logic**
  - [ ] Store source context (Script ID, opponent, week, position context) on posts.
  - [ ] Add unread-count queries without loading complete threads.
  - [ ] Set reply-depth limits.
  - [ ] Allow replies to visual attachments.
  - [ ] Avoid one database query per reply (batch loading).
- [ ] **Visual Attachments**
  - [ ] Allow an uploaded image to be marked up before posting.
  - [ ] Generate optimized previews of uploads.
  - [ ] Allow a coach to present a marked-up answer during film or practice.
- [ ] **Moderation and Limits**
  - [ ] Add daily upload/attachment limits per user.
  - [ ] Allow players to report a visual attachment.
- [ ] **Notifications**
  - [ ] Bundle multiple ordinary player replies.
  - [ ] Show reaction activity inside the application.
  - [ ] Deep-link notifications to exact replies.
### 3.4 Notifications & Analytics
- [ ] **Analytics**
  - [ ] Track visual replies, most-explained plays/positions.
  - [ ] Add a "Most Helpful Visual Explanations" report.
  - [ ] Allow promoting helpful discussions to canonical Playbook notes.

## Phase 4: Large Playbook Performance Track (From PRODUCT_ROADMAP.md)
- [ ] Implement virtualization/lazy loading for massive playbooks to ensure buttery smooth performance on older mobile devices.
- [ ] Optimize filter application logic for heavy playbooks.

## Phase 5: Swipe View Upgrades (From ACTIONS_HUB_ROADMAP.md)
- [ ] **Player-facing action set in swipe view** 
  - Bigger, fewer, "what do I do next" options. Needs design direction for final polish.

## Phase 6: Cloudflare D1 Team and Varsity/JV Management
- [ ] Implement a `teams` table to support multi-team architecture.
- [ ] Segment data by Varsity, JV, and Freshman scoping where appropriate.

## Phase 7: Outstanding Playbook/Module Enhancements
- [ ] **Telestrator Refactor**
  - [ ] Separate reusable drawing-engine logic from presentation-specific UI.
  - [ ] Add explicit annotation modes (Temporary Presentation, Saved Coach Reply, Uploaded Image Markup).

---
*This roadmap replaces the previous dispersed documents. Any new feature requests should be categorized and added to this file.*