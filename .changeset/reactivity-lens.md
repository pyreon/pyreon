---
'@pyreon/compiler': minor
'@pyreon/lint': minor
---

**Reactivity Lens (experimental)** — surface the compiler's already-computed reactivity analysis back to the author at the source.

Pyreon's #1 silent footgun: whether code is reactive is invisible at the moment you write it. The compiler ALREADY decides this per-expression for codegen and discards the analysis. The Lens pipes it back.

- `@pyreon/compiler`: additive opt-in `TransformOptions.reactivityLens` → `TransformResult.reactivityLens: ReactivitySpan[]` (emitted code byte-identical with it on/off; all existing compiler tests pass unchanged). New exports `analyzeReactivity()` / `formatReactivityLens()` + `ReactivityKind` / `ReactivitySpan` / `ReactivityFinding` types. `analyzeReactivity` merges the structural compiler facts with the existing `detectPyreonPatterns` footgun detectors under one taxonomy.
- `@pyreon/lint`: the existing `--lsp` server gains an `inlayHintProvider` + `textDocument/inlayHint` handler rendering `live` / `static` / `live·prop` / `hoisted` ghost-text at each reactive/baked-once expression; footguns publish as `pyreon-lens` warning diagnostics. Adds a `@pyreon/compiler` dependency.

JS-backend only (native Rust sidecar parity is a follow-up). The positive "this is live" claim is a faithful record of the codegen branch, not a heuristic — drift-gated + bisect-verified.
