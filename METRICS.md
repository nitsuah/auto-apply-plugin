# Metrics

## Core Metrics

| Metric        | Value |
| ------------- | ----- |
| Code Coverage | 89.29% lines |
| Build Time    | 3.44s |
| Bundle Size   | 619.78KB |
| Test Files    | 13 (9 unit + 4 Playwright e2e) |
| Test Cases    | 107 (93 unit + 14 Playwright e2e) |
| Other coverage | 89.29% lines / 67.00% branches / 85.69% functions |

## Health

| Metric        | Value  |
| ------------- | ------ |
| Open Issues   | unknown |
| PR Turnaround | unknown |
| Skipped Tests | 0      |
| Lint Status   | pass (Docker Node 20 Alpine, `npm run lint`, 2026-05-24) |
| Latest Validation | Native (cloud audit agent, Docker unavailable): `npm run test:coverage` (`node --experimental-test-coverage --test`) 98 pass / 0 fail, 89.29% lines / 67.00% branches / 85.69% functions (2026-09-04). Playwright e2e not run this cycle (no browser/Docker validation performed). |
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
