---
"@pyreon/compiler": minor
---

Add the `signal-in-conditional-uncalled` static detector to `detectPyreonPatterns` — flags a `signal()`/`computed()` used UNCALLED in a truthiness-test position (`{sig ? a : b}`, `sig && x`, `sig || x`, `sig ?? x`, `!sig`, `if (sig)`, `while (sig)`). A signal is a function value — always truthy, never nullish — so the branch is decided once by the function's identity, the reactive read never subscribes, and a later `.set()` never re-evaluates the condition (the real create-zero `counter.tsx` bug, and a class the compiler-fuzz campaign independently surfaced).

The detector is scope-resolved (`resolvesToSignalBinding`) so a boolean parameter or local that merely shares a signal's name is never flagged — validated at zero false positives across all `packages` + `examples` + `docs`. Surfaced via MCP `validate` and `pyreon doctor`; the mechanical auto-fix (`sig` → `sig()`) ships in the companion `@pyreon/lint` rule.
