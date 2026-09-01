---
'@pyreon/store': patch
'@pyreon/state-tree': patch
'@pyreon/native-compiler': patch
---

Correct four documentation claims that contradicted the shipped code

- **`dehydrateStores`'s `@example` taught an XSS.** It showed a bare `JSON.stringify` interpolated into an inline `<script>`, and store state is by definition user data. Framework code is clean — every embed site routes through a script-safe serializer — but this example propagates into `llms.txt` and the MCP api reference, so an assistant reproduces it. A doc is a call site. It now shows the escaping (the `<` class plus U+2028/U+2029) and says why.
- **`canonical-primitives.ts` — the file the codebase treats as the single source of truth on the question — said 6 of 16 primitives were wired and named the rest as falling through to generic emit.** All 16 are wired: 15 have a dedicated per-target emit function and `Inline` deliberately shares `Stack`'s with a row default. It also listed nine names as ten and labelled a five-item group as four.
- **`@pyreon/state-tree`'s README said live model instances "self-register".** `registerInstance` has no caller outside its own tests, so `getActiveModels()` returns `[]` forever and the snippet as written could never work. Registration is explicit by design — only the caller can name an instance — which is what the function's own docstring already said. The README now matches, and notes that the registry holds `WeakRef`s so registering never keeps an instance alive.
- **The multiplatform matrix scored crash reporting `0.0 / "ABSENT — no vocabulary at all. No useCrashReporter"`** while `useCrashReporter()` shipped, was exported from `@pyreon/hooks`, and was wired in both emitters. The row is 0.2 now with an honest account: capture, persistence, and next-launch rehydration exist on all three platforms and the emit auto-starts them, but there is no device test on either target, symbolication is absent, and signal/NDK crashes are out of v1 scope. The matrix gate only checks that the headline equals the column sum, so it is structurally unable to catch a row that misdescribes itself.
