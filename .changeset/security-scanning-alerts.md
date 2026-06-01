---
"@pyreon/create-zero": patch
---

fix(create-zero): close file-system-race TOCTOU in .env.example merge

Previously `existsSync(envPath) ? await readFile(envPath, …) : ''` had
a race window where the file could be removed/changed between the
existence check and the read. Replaced with try/catch on `readFile`
catching `ENOENT` — atomic; no race window. Semantically equivalent
for the common case (file exists / file missing). Non-ENOENT errors
(permissions, etc.) now propagate explicitly rather than silently
becoming empty content.

Closes CodeQL alert: `js/file-system-race` (high severity, warning level).
