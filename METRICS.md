# Metrics

## Core Metrics

| Metric        | Value |
| ------------- | ----- |
| Code Coverage | 63.72% |
| Build Time    | 3.44s |
| Bundle Size   | 619.78KB |
| Test Files    | 2 |
| Test Cases    | 22 |

## Health

| Metric        | Value  |
| ------------- | ------ |
| Open Issues   | unknown |
| PR Turnaround | unknown |
| Skipped Tests | 0      |
| Lint Status   | pass (Docker Node 20 Alpine: `npm install` + `npm run lint`, 2026-05-21) |
| Latest Validation | Docker Node 20 Alpine: syntax checks pass + `npm test` 22 pass / 0 fail; `node --test tests/*.mjs` 23 pass / 0 fail (2026-05-21) |
| Lockfile Sync | warning (`npm ci` fails in clean container; package-lock out of sync with package.json) |
| Health Score  | 78/100 |

<!--
AGENT INSTRUCTIONS:
This file tracks project health metrics using a structured table format.

CRITICAL FORMAT REQUIREMENTS:
1. Use EXACTLY these section names: "## Core Metrics", "## Health"
2. Metrics MUST be in markdown table format with "| Metric | Value |" headers
3. Keep metric names and values on single lines
4. Common metric names for parsing: "Code Coverage", "Build Time", "Bundle Size"
5. Health metrics: "Open Issues", "PR Turnaround", "Skipped Tests", "Health Score"

PARSEABLE METRIC NAMES (case-insensitive):
- "Code Coverage" or "Coverage" → Extracted for health score calculation
- "Test Files", "Test Cases" → Testing metrics
- "Build Time" → Performance metric
- "Bundle Size" → Performance metric
- "Open Issues" → Health indicator
- "Health Score" → Overall health

When updating:
1. Update values based on latest code analysis or CI/CD outputs
2. "Code Coverage": Percentage of code covered by tests (e.g., "87.5%")
3. "Build Time": Time taken for build process (e.g., "6.2s")
4. "Bundle Size": Size of production assets (e.g., "245KB")
5. Ensure values are accurate and reflect current codebase state
6. Add custom metrics as new table rows in appropriate sections
-->
