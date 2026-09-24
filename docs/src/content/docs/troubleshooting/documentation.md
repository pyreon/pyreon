---
title: "Documentation Mistakes"
description: "Common documentation mistakes in Pyreon and how to fix them."
---

# Documentation Mistakes

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### Demote body headings when a markdown level is structural

`@pyreon/mcp`'s changelog splits versions on `## `. A changeset body with its own `## Title` is indented under a bullet, the parser strips the indent, and the heading becomes a fake version. `demoteBodyHeadings` (`packages/tools/mcp/src/changelog.ts`) demotes h2→h3 and floors at h3. Test with synthetic bodies that plant a heading; a spec over the real CHANGELOG only covers its current state.

---

### Forgetting to update all surfaces

AGENTS.md, docs/, README, llms.txt, llms-full.txt, MCP api-reference must all stay in sync

---

### Outdated examples

Examples must compile and run — no pseudocode in docs

---

### Gating a value while adjacent prose restates it unchecked

The prose is what people follow, so it rots while the gate stays green (the krausest submission README pinned a version twelve minors stale and told readers to run `npm ci` where no lockfile existed). Either gate every surface that restates the value or replace the restatement with a pointer. Match only the exact form that contradicts (`@pkg@^x.y.z`) so historical narrative stays writable. Test: `packages/internals/test-utils/src/tests/krausest-pin-fresh.test.ts`.

---

### Literal backslashes in manifest string values

`renderStringLiteral` in `packages/internals/manifest/src/render.ts` escapes `\` first, then backticks and `${`. If that order is reverted, a value containing `` \` `` closes the template literal early and `api-reference.ts` fails to parse — look for a parse error in a generated region after `bun run gen-docs`.

---

### `<Playground code={…}>` in docs (deprecated)

String-blob code with nested template-literal escaping breaks easily. Use `<Example file="./examples/<topic>/<slug>" />`. `scripts/migrate-playground-to-example.ts` and `scripts/batch-fix-example-types.ts` convert old usages.

---

### `<Example>` components that require `props.shared`

Accept `{ shared?: Signal<T> }` and fall back to a local signal (`const count = props.shared ?? signal(0)`) so the example also works standalone. Reference: `docs/src/examples/reactivity/signals-read-write-react.tsx`.

---

### `as never` casts on accessor-form JSX attributes

Reactive attributes use `attr={() => …}`. If an attr's type in `packages/core/core/src/jsx-runtime.ts` lacks the `| (() => T | undefined)` variant, add it there (as `aria-selected`/`aria-disabled`/`aria-hidden` do) instead of casting at the call site.

---

### SwiftUI presentation modifiers on `EmptyView()` never present

`EmptyView` is not in the render tree, so `.sheet`/`.alert`/`.popover` attached to it are inert, and it still typechecks. PMTC's `<Modal>` anchors to `Color.clear.frame(width: 0, height: 0).sheet(…)`. Compose composes a `Dialog` node and has no such requirement, so check each target on a device when the mechanisms differ. Reference: `packages/native/compiler/src/emit-swift.ts` (Modal); test `examples/native-counter-ios/iosUITests/PyreonCounterUITests.swift`.

---

### Special-case emitters that return before the generic modifier tail

The generic tail turns `data-testid` into `.accessibilityIdentifier` / `Modifier.testTag`. Emitters that return early (`emitSwiftLink`/`emitKotlinLink`, `emitKotlinToggle`, the `<WebView>`/`<ChartWebView>`/`<FlowWebView>` hosts) dropped it, so the element could not be selected in device tests. When writing or touching any special-case emitter, audit which tail responsibilities it skips (test ids, a11y props, layout).
  - Swift wrappers such as `PyreonLink` need `.accessibilityElement(children: .contain)` so the identifier survives flattening and the child stays queryable.
  - A host that lowers some props itself passes them in the tail's `omit` set, from its own handled-prop registry (e.g. `background` is the page's background on a WebView).
  - A handler emitter that special-cases the parameter must still delegate the body to the one generic action emitter; otherwise block-bodied handlers (`onMessage`, `onSelect`, …) lower to empty closures.
  - Keep stubs at fidelity: the kotlinc `Switch` stub lacked `modifier` and rejected the corrected emit.
  - Tests: `canonical-primitives.test.ts`, `flow-webview-native.test.ts`, `chart-webview-native.test.ts`, `webview-reverse-bridge.test.ts` in `packages/native/compiler/src/tests/`.

---

### XCUITest cannot deliver Return or Escape to a simulator app

Nor Backspace or forward-delete, via `onKeyPress` or `.keyboardShortcut`. Before fixing an iOS keyboard path, log what the app receives. Drive Space for activation on iOS and assert Enter/Escape on Android. `XCUIElement.hasFocus` is not a reliable focus signal. If a failure does not match the source, uninstall the stale `.xctrunner` from the simulator and rerun.

---

### Android root activity needs `android:configChanges`

Without it, rotation or a dark-mode switch recreates `MainActivity` and every emitted `remember { mutableStateOf(...) }` resets. Declare `keyboard|keyboardHidden|orientation|screenLayout|screenSize|smallestScreenSize|uiMode`. `ActivityScenario.recreate()` ignores `configChanges`, so test by changing orientation or `UiModeManager.setApplicationNightMode` and asserting the activity instance is unchanged. Test: `packages/zero/create-multiplatform/src/tests/android-config-changes.test.ts`.

---

### Read XCUITest element types and frames off the device

Dump `app.debugDescription` once before writing assertions. A container with `.accessibilityElement(children: .contain)` appears as `otherElements` (so a `<Link>` id is not in `app.buttons`); `<Scroll>` appears as `scrollViews`; `<Toggle>`'s outer element spans the row, so tap `element.switches.firstMatch` rather than `element.tap()`, which lands in label space and does not flip.

---

### Conditional-import predicates must match every call shape

`packages/native/cli/src/build.ts:conditionalKotlinImports` adds an import when emitted Kotlin contains a symbol. Match `/\.foo\s*[({]/`, not `includes('.foo(')`: `<Link>` emits the trailing-lambda form `Modifier.clickable { … }`. The `validate-kotlin` loop concatenates stubs into one unit, so it cannot catch a missing import; only a real Gradle build can. When touching one arm, cross-check the emitter's trailing-lambda surface (`grep -ohE "\.\w+ \{" emit-kotlin.ts`) and avoid over-matching (`combinedClickable` is not `.clickable`). Test: `packages/native/cli/src/tests/build.test.ts`.

---

### A reactive boundary must not rebuild a child it cannot rebuild

A component's sole child is memoized by `_lc`, so `<Show>`'s accessor can return the same `_tpl` NativeItem. Tearing it down disposes its bindings, and remounting the same node does not rebuild them, leaving it permanently stale. `mountReactive` (`packages/core/runtime-dom/src/nodes.ts`) skips teardown when the accessor returns the value already mounted (`===`); it records the value only after teardown and resets the record when a newer generation supersedes the run (counter `runtime.mountReactive.identitySkip`). Test with a second update that keeps the verdict constant, compiled through the real `transformJSX`: `packages/core/runtime-dom/src/tests/show-child-retrack.test.tsx`.

---

### A code generator must typecheck and run its output

String assertions only prove the emitter agrees with itself. `@pyreon/lathe`'s first pass had six bugs its unit suite missed: an `Infer` import that makes PMTC reject a native module; the response generic on `.query<T>()` instead of `useQuery<T>`; no `schema: standardSchema` on the client (so `@pyreon/http` rejects a 200 at runtime); `{ response }` emitted only for bare `$ref`; `x?: T` where the schema infers `x?: T | undefined` under `exactOptionalPropertyTypes`; mock fixtures with a wrong field, imported from the package root.
  - Include a fixture consumer that typechecks and runs the output (`examples/lathe-bookshelf`, `test:e2e:lathe`; `packages/tools/lathe/src/tests/generated-typecheck.test.ts`).
  - Read the target library's exports map and option types (`mock`/`MockRoute` from `@pyreon/http/mock`, `standardSchema` from `@pyreon/http/schema`).
  - Emit any opt-in capability the generated code depends on.
  - Test: `packages/tools/lathe/src/tests/generate.test.ts`.

---

### Order emitted `const` declarations by dependency

`const` is not hoisted, so a model referencing a later one throws `Cannot access 'X' before initialization` on import. Sort topologically with name tie-breaks for byte-identical output; break genuine cycles (including self-references) with `s.lazy(() => X)` on back edges only; a module that inlines rather than imports must carry the transitive closure. Test by evaluating the emitted module, not inspecting its text. Reference: `packages/tools/lathe/src/core/graph.ts`; test `tests/graph.test.ts`.

---

### Emitter allowlists hide everything outside them

A hand-maintained allowlist in an emitter plus a test enumerating it hides everything outside it that falls through to a verbatim emit. In PMTC this shipped `Math.sign`/constants as `Math.x` in Swift, spreads emitting `()` or wrong precedence, helper `.length` as `.count` (graphemes, not UTF-16 units), and a view interpolated into a string.
  - Make the test total over the language surface (a hand-written ECMAScript `Math` member list, not the runtime's), requiring each member to lower and compile or warn by name.
  - Pick the validation rung by what the failure is: name-resolution and arity errors need a typecheck (`swiftc -parse` accepts `Math.sign(-3)`); a different answer needs execution against the web's own result, computed in the test.
  - `min`/`max`/`hypot` are variadic; a single argument is valid.
  - When a shape cannot be lowered faithfully, emit the closest approximation (for `{ ...p, ...q }`, the last source) so misuse fails at its use site, not a silently compiling fall-through.
  - Reference: `packages/native/compiler/src/{math-lowering,spread-lowering,jsx-helper-call}.ts`; tests `native-math-totality`, `native-length-helper-receiver`, `native-object-spread-shapes`, `native-jsx-helper-call` (`.test.ts`).

---

### Every spec-controlled string is an injection surface for a code generator

A spec's `title`, `summary`, `description`, `enum`, parameter names, `pattern` and paths all land in emitted source. Sanitize per lexical context, and apply each sanitizer at every site that reaches that context.
  - Line comment: collapse every line terminator (`\n`, `\r`, U+2028, U+2029) — `safeLineComment`.
  - Block comment: break `*/` as `*\/` — `safeBlockComment`.
  - String literal: escape all four line terminators and C0 controls, round-tripping — `q`.
  - `JSON.stringify` leaves U+2028/U+2029 raw; re-escape before pasting into source — `jsonLiteral`.
  - Regex literal: refuse `/` and all four line terminators (`REGEX_LITERAL_TERMINATOR`); both `emit/schema.ts` and `mockPath` in `emit/mock.ts` go through the escape-aware `regexLiteral`, which must not double-escape `\/`.
  - Parameter names in type position: path names use the same `ident()` normalization as their placeholder; query names are wire names, kept verbatim and quoted.
  - Docs output: escape `|` and newlines in Markdown table cells, strip control characters from double-quoted YAML scalars (`CONTROL_CHARS`), and quote wire names and enum values in fenced usage snippets.
  - Guard on the output: every emitted module must parse and execute, for a spec hostile in every string, without setting an injected global. A grep for regex literals in emitters cannot tell them from path templates.
  - Reference: `packages/tools/lathe/src/emit/{writer,schema,mock,docs}.ts`; tests `tests/injection.test.ts`, `tests/docs-emit.test.ts`, `tests/schema-emit-edges.test.ts`.

---
