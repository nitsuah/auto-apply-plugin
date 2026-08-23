# Metrics

## Core Metrics

| Metric        | Value |
| ------------- | ----- |
| Code Coverage | 88.31% |
| Build Time    | 3.44s |
| Bundle Size   | 619.78KB |
| Test Files    | 12 (8 unit + 4 Playwright e2e) |
| Test Cases    | 90 (77 unit + 13 Playwright e2e) |
| Other coverage | 88.31% statements / 63.75% branches / 84.13% functions | 

## Health

| Metric        | Value  |
| ------------- | ------ |
| Open Issues   | unknown |
| PR Turnaround | unknown |
| Skipped Tests | 0      |
| Lint Status   | pass (Docker Node 20 Alpine, `npm run lint`, 2026-05-24) |
| Latest Validation | Docker Node 20 Alpine + Playwright Noble image: lint pass, `npm test` 77 pass / 0 fail, Playwright 13 pass / 0 fail (2026-08-22) |
| Lockfile Sync | pass (`npm ci` succeeds in clean container, 2026-05-24) |
| Health Score  | 92/100 |


## How to Update

All commands run inside Docker — no local Node required.

### Build test image
```bash
docker build --target test -t auto-apply-plugin:test .
```

### Lint
```bash
docker run --rm auto-apply-plugin:test npm run lint
```

### Tests
```bash
docker run --rm auto-apply-plugin:test npm test
```

### Coverage
```bash
docker run --rm auto-apply-plugin:test npm run test:coverage
```

### Playwright e2e
```bash
docker build --target e2e -t auto-apply-plugin:e2e .
docker run --rm auto-apply-plugin:e2e npm run test:e2e
```

### docker-compose shortcuts
```bash
docker compose run --rm lint
docker compose run --rm test
docker compose run --rm coverage
docker compose run --rm e2e
```
