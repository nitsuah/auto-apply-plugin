# TASKS
---
updated: 2026-04-05
---

## In Progress

- [ ] Process note: after any significant popup / tracker / profile UI update, refresh the README gallery images in `screenshots/` before wrapping the stopping point.

- [/] Polish the popup into a true job-workspace view.
  - Priority: P1
  - Context: the tracker is now useful, but the remaining work is mostly fit-and-finish: wider workspace sizing, tighter review loops, and lower-scroll editing.
  - Acceptance Criteria: tracker/profile views feel roomy, the user can manage job context without fighting the popup, and the workspace stays aligned with the local-first/review-first product promise.

- [/] Keep local-first autofill and privacy controls trustworthy.
  - Priority: P1
  - Context: privacy consent, help/reset flows, and profile-adjacent Memory now exist; the next work is tightening clarity and keeping the controls easy to trust.
  - Acceptance Criteria: the privacy story remains explicit, Memory stays easy to review/correct, and reset/delete flows remain one click away.

- [/] Start a practical `apply-bot` rebrand pass.
  - Priority: P2
  - Context: the product needs a clearer visual and messaging system, but it should stay grounded in the current MVP goals: local-first autofill, review-first trust, and a real job-workspace feel.
  - Acceptance Criteria: define an achievable naming/branding checklist for popup copy, icons, and docs without derailing the core application workflow.
  - Progress: user-facing copy now shifts toward “Apply Workspace” across the manifest, popup header, primary CTA, tracker label, and README positioning.

## Todo

### P1 - Job Search & ATS Handoff

- [ ] Implement multi-source job search aggregation:
  - Integrate with public job APIs (e.g. Adzuna, USAJobs, or RapidAPI job endpoints) and/or scrape LinkedIn, Indeed, etc.
  - Normalize results to a common schema: title, company, location, salary, remote, url, and ATS/job board link.
  - Show results in the job search panel with clear CTA to "Go to job post" (ATS link preferred).
  - Add logic to extract and highlight ATS/job board links from job listings (when available).
  - If only a generic job board link is available, surface that as the main action.
  - Add a "Save to Tracker" button for each result to capture the job into the user's board.
  - Scrape/parse job post details (salary, remote, etc.) when user lands on the ATS/job board page.
  - Index all captured jobs for fast search/filter in the tracker.
  - (Optional) Add basic deduplication for jobs appearing on multiple boards.

- [ ] Plan for future: OAuth or user sign-in for personalized job search (if API supports it).

#### Acceptance Criteria
- User can search jobs from multiple sources in one panel.
- Each result has a clear "Go to job post" action (ATS link if possible).
- User can save jobs to their tracker with one click.
- Tracker search/indexing is fast and reliable.

### P3 - Exploratory

- [ ] Begin to implement job search results by scraping and searching multiple job pages, starting with LinkedIn and Indeed, etc. and then expanding to a more general multi-site search and alerting capability.
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


<!--
AGENT INSTRUCTIONS:
1. Keep active items in In Progress and P1-P3 sections.
2. Keep task bullets short and scannable.
3. Move finished work into Done.
-->
