---
updated: 2026-04-05 (tracker-and-privacy-planning)
---

# TASKS

## In Progress

- [/] Expand the tracker into a true job-workspace view.
  - Priority: P1
  - Context: the tracker already stores company/title/status and the `Open job` link, but it still hides too much context and takes too much scrolling to reach.
  - Acceptance Criteria: tracker actions move toward the top chrome, cards support status-oriented organization, edits save inline without kicking the user back to the main panel, and the tracker becomes the "downtime" workspace between applications.

- [/] Keep local-first autofill and privacy controls trustworthy.
  - Priority: P1
  - Context: privacy consent and sensitive-field opt-in now exist, but the legal/help surface, scoped memory controls, and clear/reset flows are still missing.
  - Acceptance Criteria: a `?` help entry links to EULA/terms/privacy/GDPR, only relevant memory settings are exposed nearby, and both cache-clear and full reset flows are implemented safely.

## Todo

### P1 - High

- [ ] Store richer job details per application.
  - Priority: P1
  - Context: job records should capture the JD, location, remote flag, employment type (default `Full-time`), salary range, scorecard, verdict, and submitted date so the tracker becomes useful even when the user is not actively filling a page.
  - Acceptance Criteria: scrape from the current page first, fall back to pasted text/manual entry when needed, and keep the raw JD/details local to the extension.

- [ ] Make self-heal memory reviewable and editable.
  - Priority: P1
  - Context: a bad prefill or capture can create a bad remembered value if the user cannot inspect and correct it.
  - Acceptance Criteria: the preview/review UI shows remembered values, lets the user edit/delete them, and keeps those controls adjacent to the relevant privacy/settings surface.

- [ ] Add compact header actions for tracker and help.
  - Priority: P1
  - Context: the main popup currently requires too much scrolling to reach tracker controls.
  - Acceptance Criteria: condensed tracker counts plus a `?` help button live near the top-right header and stay visible from the main screen.

- [ ] Improve tracker editing flow and layout.
  - Priority: P1
  - Context: the current save button works, but the behavior is still clunky for quick review sessions.
  - Acceptance Criteria: tracker cards grow into a larger grid/swimlane-by-status view, inline edits save on blur with a clear success indicator, and the user remains on the tracker screen after edits.

### P2 - Medium

- [ ] Add picker-style job detail import from the current page or pasted JD.
  - Priority: P2
  - Context: most job metadata should be scraped from the page, headings, and reference text before the user has to type anything.
  - Acceptance Criteria: the user can review parsed job details from the current page or pasted JD text before saving them to the tracker.

- [ ] Add manual and CSV import for prior applications.
  - Priority: P2
  - Context: importing historical applications is useful, but CSV handling can get bloated if it lands too early.
  - Acceptance Criteria: manual add works first, and CSV import uses a simple documented schema for bulk history import.

### P3 - Exploratory

- [ ] Evaluate identity-based profile import paths.
  - Priority: P3
  - Context: Google sign-in, ID.me, or similar identity sources may help bootstrap profile fields later, but only after the local-first and consent-first path is stable.
  - Acceptance Criteria: any future identity import remains optional, explicit-consent based, and does not weaken the current on-device default.

## Done

- [x] Ship the local-first, profile-first autofill baseline.
- [x] Add Gemini model discovery/fallback and deterministic answer generation.
- [x] Keep Docker-only validation green for popup, service worker, and core logic tests.
- [x] Add privacy consent gating and opt-in handling for sensitive demographic fields.
- [x] Add self-healing memory for safe non-sensitive answers plus draft persistence across form rerenders.

<!--
AGENT INSTRUCTIONS:
1. Keep active items in In Progress and P1-P3 sections.
2. Keep task bullets short and scannable.
3. Move finished work into Done.
-->
