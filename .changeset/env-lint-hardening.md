---
"@pyreon/lint": patch
---

`pyreon/no-private-env-in-client` now catches the destructuring / base-capture leak shapes (`const { X } = process.env`, `const e = import.meta.env`) — the direct-access-only visitor previously missed them — and skips `server/` dirs (parity with `api/`) so legit server code isn't falsely warned.
