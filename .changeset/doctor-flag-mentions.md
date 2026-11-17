---
"@pyreon/compiler": patch
"@pyreon/vite-plugin": patch
"@pyreon/mcp": patch
"@pyreon/zero-content": patch
"@pyreon/create-zero": patch
---

Messages, docs and template comments that pointed at the removed `pyreon doctor --check-*` / `--audit-tests` flags now name the `--only <gate>` form (for example the islands dev warning and the SSG audit report now say `pyreon doctor --only islands-audit` / `--only ssg-audit`).
