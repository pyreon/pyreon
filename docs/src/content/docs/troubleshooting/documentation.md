---
title: "Documentation Mistakes"
description: "Common documentation mistakes in Pyreon and how to fix them."
---

# Documentation Mistakes

> **Generated** from `.claude/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### Forgetting to update all surfaces

CLAUDE.md, docs/, README, llms.txt, llms-full.txt, MCP api-reference must all stay in sync

---

### Outdated examples

Examples must compile and run — no pseudocode in docs

---

### A gate on a machine-readable value, with adjacent prose restating that value UNCHECKED

gating only the machine half relocates the rot instead of stopping it — the prose is what a human actually follows, so it drifts silently while the gate stays green. Shipped instance: `contrib/krausest/pyreon-keyed`'s pin-freshness gate (#2398/#2400) asserted `package.json` pinned the current workspace version, while `README-SUBMISSION.md` one directory over kept saying `@pyreon/*@^0.38.0` — twelve minors stale, and 0.38 predates the `remove` fast path (#2288) + the anchor-registry retained fix (#2003). A submitter trusting the README would have published an independent benchmark number for a Pyreon materially worse than shipped, under our own name — the exact outcome the gate existed to prevent. The same file's step 3 told them to run `npm ci` in a directory with no committed lockfile, which hard-fails (`EUSAGE`), so the first build command in the instructions could not run at all. **Rule: when you gate a value, either (a) gate every surface that restates it, or (b) delete the restatement and point at the single source of truth. Prose beside a gated value is not documentation of the gate — it is an ungated second copy.** Prefer gating the DOC when the doc is the human-facing artifact (a submission checklist, a runbook, an install guide): a stale doc there costs more than a stale constant. Design the doc-side check to police contradiction, not vocabulary — match only the spelled-out `@pkg@^x.y.z` form so historical narrative ("was staged at ^0.38.0") stays writable, and target the exact broken command rather than banning a string that is legitimate elsewhere (the fork-ROOT `npm ci` is correct — upstream commits a lock). Reference: `packages/internals/test-utils/src/tests/krausest-pin-fresh.test.ts` (the two README specs, bisect-verified).

---

### Literal backslashes in manifest `summary` / `mistakes` / `example` string VALUES

(caught in the styler manifest migration, PR after #624; **renderer FIXED in PR #1442**): `@pyreon/manifest`'s `renderStringLiteral` historically escaped `` ` `` → `` \` `` and `${` → `\${` but NOT literal backslashes. A manifest string whose resolved value contained a literal `\` (e.g. ` ``` `bash in a CodeGroup example body) serialized to `\\\`` in the generated file = (escaped backslash)(RAW backtick) → premature template-literal close in `api-reference.ts` → tsc parse failure. **The renderer now escapes `\` FIRST** (before backticks + `${`), so the bug class is structurally closed. Reference: `packages/internals/manifest/src/render.ts:renderStringLiteral` (post-fix). Symptom guide for the historical shape (still relevant if someone reverts): after `bun run gen-docs`, `bunx oxlint packages/tools/mcp/src/api-reference.ts` — a parse error in the freshly-generated region (not the hand-written ones) is this bug.

---

### `<Playground code={` … `}>` in docs (deprecated)

iframe-sandboxed string-blob code with nested template-literal escape passes — the exact shape behind PR #1434's `'\n'` double-unescape `SyntaxError`. **Migrated wholesale in PR #1448** (36 instances across 30 docs-zero pages → `<Example file="./examples/<topic>/<slug>" />`). For new docs always use `<Example>`. The legacy VitePress `docs/` site retains `<Playground>` until it's fully cut over to docs-zero. **Reusable migration tooling**: `scripts/migrate-playground-to-example.ts` (parses + extracts + rewrites) + `scripts/batch-fix-example-types.ts` (iterative TS strict-mode fixup). **Don't author new `<Playground>` calls** — the value prop ("type-checked, refactor-safe, cross-mount signal-share") is structurally absent. Enforced by `pyreon/no-playground-in-docs` lint rule.

---

### `<Example>` example components that hard-require `props.shared`

every example component MUST accept `{ shared?: Signal<T> }` and fall back to a local signal — `const count = props.shared ?? signal(0)`. Without that fallback, the example breaks when used WITHOUT `share` (i.e., as a standalone single demo). The contract is "bridgeable, not require-bridged." Reference: `docs/src/examples/reactivity/signals-read-write-react.tsx` for the canonical shape.

---

### `as never` casts on accessor-form JSX attribute values

(fixed at the root in PR #1442): the canonical Pyreon pattern for reactive attributes is `attr={() => sigCall() === target ? 'value' : undefined}`. Several attrs in `@pyreon/core`'s JSX types declared the static-value union but missed the function-accessor variant — `aria-current`, etc. Consumer code had to write `(() => …) as never` to silence the type error. **Fix the root cause** in `packages/core/core/src/jsx-runtime.ts` by adding `| (() => UnionOfStaticTypes | undefined)` to the attr's type, matching the shape used by `aria-selected`, `aria-disabled`, `aria-hidden`. Audit every accessor-supported attr to ensure the function variant is present.

---

### A SwiftUI presentation modifier (`.sheet`/`.alert`/`.popover`) anchored to `EmptyView()` never presents — and it typechecks clean, so only a device catches it

(the PMTC `<Modal>` instance, 2026-07). PMTC lowered `<Modal open onClose>` to `EmptyView().sheet(isPresented: …) { … }`. `EmptyView` contributes NOTHING to the render tree, so there is no view in the hierarchy for SwiftUI to anchor the presentation to and the modifier is **silently inert**: tapping the open button produced no sheet, no dialog, and no modal body anywhere in the XCUITest accessibility dump. The emit was valid Swift and passed `swiftc -typecheck` throughout, so every gate below R4 (snapshot, parse, typecheck-against-stubs) was green while one of the 15 canonical primitives did not work at all on iOS. **Fix: anchor to a REAL but layout-neutral view** — `Color.clear.frame(width: 0, height: 0).sheet(…)`. `Color.clear` is a genuine view (valid anchor); the zero frame keeps it from shifting the surrounding stack. **General rule: a SwiftUI modifier whose effect is a PRESENTATION needs a host that actually renders; `EmptyView()` is not one. Any emitter that attaches behaviour to a synthesized host must attach it to something that participates in layout.** **The asymmetry is the lesson for multi-target emit**: Compose reaches the same primitive by COMPOSING a node (`if (open) { Dialog(onDismissRequest = …) { … } }`), which has no anchoring requirement and was correct all along — so this bug existed on exactly one target. When two targets reach a primitive through different mechanisms (a modifier vs a composed node), a per-target DEVICE check is the only thing that settles it; the same family as "`<Inline>` is a non-wrapping Compose Row but a shrinking SwiftUI HStack". Bisect-verified on a real simulator (revert to `EmptyView()` → `test_modalPresentsAndDismisses` fails; restore → passes). Reference: `packages/native/compiler/src/emit-swift.ts` (Modal emit) + `examples/native-counter-ios/iosUITests/PyreonCounterUITests.swift`.

---

### A SPECIAL-CASE emitter that returns before the generic modifier tail silently drops `data-testid`, making the element structurally UNASSERTABLE

(the PMTC `<Link>` instance, 2026-07). Most primitives flow through a generic emit path whose tail turns `data-testid` into `.accessibilityIdentifier` (Swift) / `Modifier.testTag` (Compose). `<Link>` had its own emitter (`emitSwiftLink` / `emitKotlinLink`) that built `PyreonLink(to) { children }` and returned EARLY — so the identifier was discarded on BOTH targets and the element could not be selected by XCUITest or `onNodeWithTag` at all. This is very likely why `Link` sat in the capability matrix's "not individually asserted" list for so long: **you cannot write an assertion against an element you cannot select**, so the doc recorded a symptom whose cause was an emit gap. **General rule: whenever you add a special-case emitter for a tag, audit which generic-tail responsibilities it now skips — test identifiers, a11y props, layout modifiers — because each omission is invisible in the emit (the code looks right) and surfaces only as "we never asserted that one".** Swift additionally needs `.accessibilityElement(children: .contain)` here, because `PyreonLink` WRAPS its label and SwiftUI flattens a plain wrapper out of the accessibility tree (same trap as `VStack`/`ScrollView`); `.contain` rather than `.combine` keeps the child label individually queryable. Device-read shape: `Other identifier: 'home-link-about'` containing `Button label: 'About via Link'`. Bisect-verified on a real simulator. Reference: `emit-swift.ts:emitSwiftLink` + `emit-kotlin.ts:emitKotlinLink` + the `canonical-primitives.test.ts` "carries the identifier" specs.

---

### XCUITest element TYPE and tap POINT must be read off the device, not guessed — three of four new device assertions failed for query reasons, not product reasons

(2026-07). Writing device assertions against an assumed accessibility shape produces failures that look exactly like product bugs and bury the real one. Measured shapes from a live simulator dump: (1) a container carrying `.accessibilityElement(children: .contain)` surfaces as **`otherElements`**, NOT as the child's type — so a `<Link>`'s identifier is on an `Other` wrapping the `Button`, and `app.buttons[id]` misses it; (2) `<Scroll>` surfaces as **`scrollViews`**, not `otherElements`; (3) `<Toggle>` lowers to `Toggle("", isOn:)` whose OUTER element spans the full row (measured 402pt) while the real control occupies only the trailing ~63pt — so `element.tap()` hits the row centre, lands in dead label space, and **silently does not flip** (the state text stays put and the failure reads as "the binding never wrote the signal"); tap `element.switches.firstMatch` instead. **General rule: before asserting, dump `app.debugDescription` once and read the element types, identifiers and frames. A device test built on a guessed shape is worse than none — it manufactures failures that mask genuine ones.** Same family as "read the API before probing it".

---

### A content-keyed conditional-import predicate written against ONE call shape misses the other — `.foo(` vs `.foo { }`

(the PMTC Kotlin `clickable` instance, 2026-07). `packages/native/cli/src/build.ts:conditionalKotlinImports` adds an `import` when the emitted Kotlin CONTAINS a symbol, because Kotlin star-imports are single-package and androidx symbols live in sub-packages the header doesn't cover. The `clickable` arm tested `emitted.includes('.clickable(')` — the shape `<Press>` emits. But `<Link>` emits a TRAILING LAMBDA, `Modifier.clickable { navigate() }`, which contains no `.clickable(` at all, so the import was never added and the first `<Link>` in an Android example failed `gradle assembleDebug` with `Unresolved reference 'clickable'`. **Every pre-merge gate stayed green**: the `validate-kotlin` loop CONCATENATES the stubs into the same compilation unit, so it resolves the symbol with or without an import and is structurally incapable of catching a missing one — only the real device build can. **Rule: any predicate that matches emitted SYNTAX must cover every call shape the emitter can produce for that symbol. In Kotlin that means both `foo(` and `foo {` for anything callable with a trailing lambda — use `/\.foo\s*[({]/`, not `includes('.foo(')`.** Audit the sibling arms when you touch one: the emitter's trailing-lambda surface is enumerable (`grep -ohE "\.\w+ \{" emit-kotlin.ts`), and cross-checking it against the paren-keyed predicates is a 30-second check that bounds the whole class (it found `.clickable` was the ONLY gap — `.alpha`/`.background`/`.border`/`.clip`/`.combinedClickable` are paren-only in the emit, and `.semantics {`/`.clearAndSetSemantics {` were already brace-keyed). Watch over-matching in the other direction too: `combinedClickable` capitalises the C, so `.clickable` is not a substring of it and the widened regex must not start pulling a dead import — pinned by its own spec. Bisect-verified. Reference: `packages/native/cli/src/build.ts` + `tests/build.test.ts` ("TRAILING-LAMBDA form").

---
