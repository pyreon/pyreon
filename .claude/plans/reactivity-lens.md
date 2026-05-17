# Reactivity Lens — make reactivity legible at authoring time

**Status:** Phase 0 kill-test → **GO**, and **Phase 1 SHIPPED in this PR**
(funded as a P0 experimental, per explicit user direction; framed
experimental). Spike was not thrown away — it cleared every kill
criterion cheaply, so it was promoted in place with full measurement +
proof + e2e rather than re-built.

## Thesis (unchanged)

Every expensive thing this ecosystem built is *detection of reactivity
mistakes after the fact* (10 doctor gates, MCP `validate`, 66 lint rules,
a huge `anti-patterns.md`). Root cause: **whether code is reactive is
invisible at the moment you write it.** The `@pyreon/compiler` already
computes the precise answer per-expression (it must, for codegen) and
throws it away. The Lens pipes it back to the editor.

## Phase 0 — kill-test verdict (all criteria CLEARED)

- **(a) Extract without forking codegen?** YES. The analysis
  (`isDynamic`/`shouldWrap`/`unwrapAccessor`'s `isReactive`) is pure,
  single-pass, byte-offset-spanned. A ~5-site additive `lens()` push
  alongside the existing `replacements.push`. **Proof:** all 1000
  `@pyreon/compiler` tests pass with the lens code present; an explicit
  `additive` test asserts emitted `code` is byte-identical with the lens
  on vs off, across 6 fixtures.
- **(b) Is the positive "live" claim ever wrong on idiomatic code?** NO,
  by construction. The claim is not an approximation — it is recorded at
  the exact codegen branch (`if (isReactive) emitReactiveTextChild …
  else emitStaticTextChild`). The drift gate proves the lens kind
  matches the emitted `_bind`/`_bindText`/`_rp` token. Real-corpus
  sweep: **177 real `examples/**/*.tsx`, 0 crashes**, sane distribution
  (reactive 349 / static-text 224 / reactive-prop 198 / reactive-attr
  60 / footgun 3). No `reactive` span on a provably-static literal.
- **(c) Per-keystroke budget?** YES. **0.78ms / file average**, 11ms
  worst case (a pathological 1000-row benchmark file) — far inside a
  150ms LSP debounce. Honest caveat: `analyzeReactivity` is ~2× a plain
  transform, but that cost is entirely the *footgun* layer's separate
  TS-API parse (`detectPyreonPatterns`); the compiler-lens itself is
  sub-millisecond. The LSP runs inlay-hint extraction on every request
  and footgun diagnostics on the debounced path.
- **(d) Does it change how authoring feels?** The `formatReactivityLens`
  probe + LSP inlay hints render "live / static / live·prop / hoisted"
  ghost text exactly where the decision happens. Subjective but real:
  the silent rule ("WHERE you read a signal decides reactivity") becomes
  a visible annotation. Honest: this is an LSP-server contract proof,
  not a rendered-in-VSCode screenshot — see "what's NOT proven".

## What shipped (Phase 1)

1. `@pyreon/compiler`: additive opt-in `TransformOptions.reactivityLens`
   → `TransformResult.reactivityLens: ReactivitySpan[]`. 5 instrumented
   codegen-decision sites (reactive text / static text / reactive-prop /
   reactive-attr / hoisted-static). Codegen byte-unchanged when off.
2. `analyzeReactivity(code, file, opts)` + `formatReactivityLens()` —
   merges the structural compiler facts with the EXISTING
   `detectPyreonPatterns` footgun detectors under one taxonomy. Exported
   from `@pyreon/compiler`.
3. `@pyreon/lint` LSP server (the existing rail — no new server):
   `inlayHintProvider` capability + `textDocument/inlayHint` handler
   (structural facts as end-of-span ghost text) + footguns published as
   `pyreon-lens` warning diagnostics.
4. Tests: compiler unit + **drift gate** (bisect-verified-with-restore:
   reverting the `reactive` lens call → `expected +0 to be 1`,
   restored → 12/12); LSP JSON-RPC integration (initialize → didOpen →
   inlayHint round-trip, real compiler, no mocks, 7/7).

## Asymmetric-precision commitment (held)

Positive `reactive*` spans are emitted ONLY where the compiler provably
wrapped/tracked. **Absence of a span is "not asserted", never an
implicit static claim.** `static-text` is the one negative claim and it
is equally high-precision (the literal `else` of the reactive branch).
Footguns are the existing AST detectors, unchanged — the Lens just
unifies the surface.

## What is NOT proven / deliberate follow-ups (honest)

- **Rust-backend parity (Phase 3).** The lens is JS-backend only. ~80%
  of users hit the native binary, which is byte-identical for codegen
  (527 equivalence tests) so the analysis is sound, but the native
  binary does not yet *emit* the sidecar. The LSP path forces the JS
  backend (`transformJSX_JS`) so it is correct today; production
  bundling uses native (lens not consumed there — it's editor-only).
  Rust emit + a map-equivalence test is the next phase.
- **No rendered-editor e2e.** The proof is the LSP JSON-RPC contract +
  the compiler drift gate, not a Playwright-drives-VSCode test. For an
  editor feature the load-bearing contract is "server returns correct
  hints for the keystroke" — that is what is gated. A real-editor visual
  test is out of scope.
- **Manifest / llms.txt / MCP api-reference enrichment deferred.** The
  new `@pyreon/compiler` exports are documented in CLAUDE.md +
  anti-patterns; the manifest-driven doc surfaces are a follow-up (the
  `Docs Sync` gate does not fail on un-manifested new exports).
- **`const {x}=props` body-scope footgun** remains the static layer's
  known cliff (no reliable AST detector — doc-only). The Lens's
  structural `static-text` signal *partially* compensates downstream
  (`<div>{x}</div>` shows "static" when `x` isn't reactive) but does not
  replace a dedicated detector. Not silently expanded into this PR.
- Editor inlay-hint UX polish (debounce tuning, range windowing on
  10k-line files, colour treatment) is a follow-up.

## Sequencing

This is the prevention bet from the strategic analysis. Shipped behind
nothing (user directed P0). Phases 2–4 (richer LSP, Rust parity, VSCode
decoration polish) are independently revertable follow-ups; none are
blockers for the value delivered here.
