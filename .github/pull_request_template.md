## Summary

Explain the motivation and context for this change.

## Changes

- List the key changes introduced.

## Testing

```sh
# Run locally via Docker:
docker compose run --rm test       # unit tests (53 baseline)
docker compose run --rm lint       # eslint
docker compose run --rm coverage   # coverage report
docker compose run --rm e2e        # playwright
```

## Screenshots (optional)

Add before/after screenshots if UI changes were made (Pipeline, Profile, Job Search, Popup home).

## Checklist

- [ ] All CI jobs green (lint → fast → coverage + E2E)
- [ ] Unit tests added/updated for new logic (`tests/*.test.mjs`)
- [ ] No secrets or API keys committed
- [ ] `TASKS.md` updated if this closes or picks up a tracked item
- [ ] UI changes manually verified in the **standalone workspace** (Pipeline, Profile, Job Search)
- [ ] If adding a new job source: registered in `JOB_SOURCES` registry, normalizer unit-tested
- [ ] If changing profile/settings model: `readSettingsForm`, `fillProfileForm`, SW `handleSaveSetup` / `handleSaveSettingsOnly` in sync
