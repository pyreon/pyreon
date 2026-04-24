---
"@pyreon/compiler": minor
"@pyreon/mcp": minor
"@pyreon/cli": minor
---

Test-environment audit (T2.5.7) — scans every `*.test.ts(x)` under `packages/` for mock-vnode patterns (the PR #197 bug class: tests that construct `{ type, props, children }` literals or a custom `vnode()` helper instead of going through the real `h()` from `@pyreon/core`). Classifies each file as HIGH / MEDIUM / LOW based on the balance of mock literals, helper definitions, helper call-sites, real `h()` calls, and the `@pyreon/core` import.

Scanner lives in `@pyreon/compiler` (`auditTestEnvironment`, `formatTestAudit`) so both `@pyreon/mcp` and `@pyreon/cli` can use it without pulling in each other.

- **MCP**: new `audit_test_environment` tool. Options `minRisk` (default `medium`) and `limit` (default 20). Scans 400+ test files in ~50ms.
- **CLI**: `pyreon doctor --audit-tests` appends the audit output. `--audit-min-risk high|medium|low` to filter. Honors `--json` for machine-readable output.
