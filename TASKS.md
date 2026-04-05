---
updated: 2026-04-05 (tracker-and-privacy-planning)
---

# TASKS

## In Progress

- [/] Polish the popup into a true job-workspace view.
  - Priority: P1
  - Context: the tracker is now useful, but the remaining work is mostly fit-and-finish: wider workspace sizing, tighter review loops, and lower-scroll editing.
  - Acceptance Criteria: tracker/profile views feel roomy, the user can manage job context without fighting the popup, and the workspace stays aligned with the local-first/review-first product promise.

- [/] Keep local-first autofill and privacy controls trustworthy.
  - Priority: P1
  - Context: privacy consent, help/reset flows, and profile-adjacent Memory now exist; the next work is tightening clarity and keeping the controls easy to trust.
  - Acceptance Criteria: the privacy story remains explicit, Memory stays easy to review/correct, and reset/delete flows remain one click away.

## Todo

### P1 - High

- [ ] Finish CSV import for prior applications.
  - Priority: P1
  - Context: manual quick-add is now in place, but bulk history import still needs a simple path into the workspace.
  - Acceptance Criteria: CSV import uses a documented schema, validates cleanly, and avoids cluttering the core tracker flow.

### P2 - Medium

- [ ] Start a practical `apply-bot` rebrand pass.
  - Priority: P2
  - Context: the product needs a clearer visual and messaging system, but it should stay grounded in the current MVP goals: local-first autofill, review-first trust, and a real job-workspace feel.
  - Acceptance Criteria: define an achievable naming/branding checklist for popup copy, icons, and docs without derailing the core application workflow.

### P3 - Exploratory

- [ ] Evaluate identity-based profile import paths.
  - Priority: P3
  - Context: Google sign-in, ID.me, or similar identity sources may help bootstrap profile fields later, but only after the local-first and consent-first path is stable.
  - Acceptance Criteria: any future identity import remains optional, explicit-consent based, and does not weaken the current on-device default.

### P4 - Nice to have

- [ ] Run an `axe` / a11y audit on the popup and key application-review flows.
  - Priority: P4
  - Context: the UI is becoming more workspace-like, so keyboard support, labels, alt text, and contrast should get a structured pass.
  - Acceptance Criteria: document the biggest accessibility gaps and land the highest-value fixes without bloating the MVP.

## Done

- [x] Ship the local-first, profile-first autofill baseline.
- [x] Add Gemini model discovery/fallback and deterministic answer generation.
- [x] Keep Docker-only validation green for popup, service worker, and core logic tests.
- [x] Add privacy consent gating and opt-in handling for sensitive demographic fields.
- [x] Add safe Memory for non-sensitive answers plus draft persistence across form rerenders.
- [x] Move Memory controls into `Profile`, add header shortcuts, and make tracker edits/card expansion feel like a real workspace.
- [x] Widen the popup workspace and reduce scroll pressure across tracker, preview, and profile views.
- [x] Add quick manual tracker entry plus current-page / pasted-JD import for job details.

<!--
AGENT INSTRUCTIONS:
1. Keep active items in In Progress and P1-P3 sections.
2. Keep task bullets short and scannable.
3. Move finished work into Done.
-->
