---
'@pyreon/native-cli': minor
---

New command: `pyreon-native symbolicate <report.json>` turns a `useCrashReporter()` report from a release build back into a readable stack.

It finds the build's symbols under `--symbols` (default `./symbols`, where release builds now keep them). It matches the report's R8 map id or dSYM UUID, then runs the standard tool: R8 `retrace` for Android (Android SDK command-line tools, any OS) or `atos` for iOS (Xcode, macOS). `--mapping`, `--dsym` and `--retrace` name a file or tool directly. A mapping or dSYM from a different build is refused with exit 2, because retrace and atos would print a plausible but wrong stack for it.

`build` no longer starts emitted Swift with `#sourceLocation(file: "<App>.tsx", line: 1)`. The emit has no per-line map, so that directive labelled generated line N as `.tsx` line N. Compile errors and symbolicated frames then pointed at unrelated `.tsx` lines. Both targets now start with a `// pyreon-source: <path>` comment, and Swift errors and frames name the generated file at its real line.
