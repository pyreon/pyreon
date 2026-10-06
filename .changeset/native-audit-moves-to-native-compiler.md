---
"@pyreon/compiler": minor
"@pyreon/native-compiler": minor
"@pyreon/cli": patch
"@pyreon/mcp": patch
---

Move the multiplatform (PMTC) project audit out of the web compiler and into the native one, and make the web-only package map exist exactly once.

**Breaking (`@pyreon/compiler`, 0.x minor):** `auditNative`, `detectNativePatterns` and the `Native*` types are no longer exported from `@pyreon/compiler/audits`. Import them from the new `@pyreon/native-compiler/audit` subpath instead. The web compiler no longer carries a second generated copy of the web-only package map; `@pyreon/native-compiler` owns it (`src/web-only-packages.ts`) and the parser's import warning and the audit both read that one set. The diagnose catalog gained an entry that names the new location when an importer hits the old one.

**`@pyreon/native-compiler`:** new `./audit` subpath exporting `auditNative` and `detectNativePatterns`. It is deliberately a separate, light entry: it needs only `oxc-parser` and the package map, so it does not pull the Swift/Kotlin emitters. It parses with oxc (what PMTC itself uses); a file oxc cannot parse is skipped, where the previous TypeScript-API parser recovered from syntax errors.

**`@pyreon/cli`:** `pyreon doctor` `native-audit` gate now loads the audit lazily from the optional peer `@pyreon/native-compiler`. When it is not installed the gate SKIPS with an install hint (never a crash, and its category is excluded from the score rather than counted as 100).

**`@pyreon/mcp`:** `validate` loads the native detector lazily from the optional peer. When absent, a snippet that imports `@pyreon/primitives` still gets the React and Pyreon checks, and the response says the native checks were skipped and how to install them.
