---
"@pyreon/cli": minor
"@pyreon/compiler": minor
"@pyreon/mcp": minor
---

Native (multiplatform / PMTC) build-hazard detection across the doctor + MCP surfaces, so an AI/dev catches code that compiles for web but silently breaks the iOS/Android build.

- **`pyreon doctor --check-native`** (new `native-audit` gate, also in the default fast set) scans `.tsx` files importing `@pyreon/primitives` for two hazards the `swiftc -parse` / `kotlinc`-stub gate can't catch: **web-only-package imports** (`@pyreon/charts`/`flow`/`code`/`dnd`/`document`/`query`/`table`/`virtual` + the CSS-in-JS UI stack — fix: host in `<WebView>` or use `@pyreon/primitives`) and **native-dropped top-level `interface`/`enum`/`class`** (fix: `type X = {…}` / string-literal union / functions). Scoped to multiplatform projects (skips gracefully otherwise); warnings only.
- **MCP `validate`** now runs the same native detector per-snippet (the AI's per-keystroke feedback loop), firing only when the snippet imports `@pyreon/primitives`.
- **`@pyreon/compiler`** exports `auditNative(cwd)` (project scan) + `detectNativePatterns(code, filename)` (snippet) + their types.

Pairs with `get_pattern({ name: "multiplatform" })` and the `@pyreon/primitives` `get_api` entries so an AI has both the reference and the feedback to build a correct multiplatform app one-shot.
