---
'@pyreon/cli': patch
'@pyreon/lint': patch
'@pyreon/atlas': patch
'@pyreon/loom': patch
'@pyreon/mcp': patch
'@pyreon/native-cli': patch
'@pyreon/zero-cli': patch
'@pyreon/create-zero': patch
'@pyreon/create-multiplatform': patch
---

Piped command output is no longer cut off. `pyreon doctor --ci --json | jq` received only the first 64 KiB of the report, because the CLI called `process.exit()` right after printing, and a write to a pipe is asynchronous. The same happened to `pyreon check --json`, `pyreon lint`, `pyreon-lint --format json`, `zero doctor --ci --json`, `pyreon-native` and `atlas` (when a slow reader was still draining after 500 ms). Every command now exits only after stdout and stderr have flushed, and keeps its exit code.

`zero doctor` no longer runs the audit twice. `@pyreon/cli`'s library entry also ran the `pyreon` CLI when it was imported, so `zero doctor` printed two reports and `zero doctor --json` printed two JSON documents. The `pyreon` bin is now `bin/pyreon.js`, and importing `@pyreon/cli` runs nothing.
