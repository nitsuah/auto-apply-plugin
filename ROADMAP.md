---
updated: 2026-04-05 (tracker-workspace-planning)
---

# Roadmap

## 2026 Q1 (Completed)

- [x] Ship the Chrome MV3 extension foundation, profile-first setup flow, and review-first tracker baseline.
- [x] Add Gemini model resilience, Docker validation, privacy consent, and safe draft/self-heal improvements.

## 2026 Q2 (In Progress)

- [/] Turn the tracker into a real job-workspace view with stored JD metadata, location, employment type, salary range, verdict, scorecard fields, and a wider lower-scroll popup layout.
- [x] Move tracker/help actions into the popup header and reduce main-screen scrolling friction.
- [x] Make Memory editable from Profile so users can correct bad captures quickly.
- [x] Add a help/legal surface for EULA, terms, privacy, GDPR, selective cache clear, and full reset/delete-my-info actions.

## 2026 Q3 (Planned)

- [/] Add picker-style job detail capture from the current page or pasted JD text and keep extending it into a stronger import workflow.
- [x] Finish CSV import for previously submitted applications.
- [ ] Start a lightweight `apply-bot` rebrand pass across popup copy, icons, and docs without over-scoping the MVP.

## 2026 Q4 (Exploratory)

- [ ] Explore optional identity-provider imports (Google, ID.me, etc.) for bootstrapping profile data without breaking local-first/privacy guarantees.
- [ ] Revisit deeper job-fit scoring, verdict assistance, and richer tracker analytics after the storage and review foundations are stable.
- [ ] Run a lightweight `axe` / accessibility audit on popup navigation, labels, contrast, and keyboard flow as the workspace UI settles.

## Notes

- Local-first and consent-first remain the product guardrails.
- Scrape from the page or JD before asking the user to type.
- Detailed execution work stays in `TASKS.md`.
