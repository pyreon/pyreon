---
title: Multi-Platform Pyreon
---

# Multi-Platform Pyreon

> **Status:** PMTC (Pyreon Multi-Target Compiler) is **experimental — demo-quality, self-rated 66/100, not production-ready.** The 15-primitive canonical vocabulary spans all three targets — every primitive has a real web DOM runtime AND emits SwiftUI + Jetpack Compose. **Be precise about what "validated" means**, because the layers differ sharply in strength:
> - **(1) Per-PR gate — SYNTAX + STUB TYPE-CHECK.** `swiftc -parse` (syntax, accepts unresolved types) runs on every emit; `kotlinc` type-resolves against Compose **stubs**; and `swiftc -typecheck` type-resolves against SwiftUI+PyreonRuntime **stubs** (`swift-stubs.ts`, the Swift sibling of `kotlin-stubs.ts`) — the stubs' generic constraints mirror the real SDK EXACTLY (`animation<V: Equatable>`, so a `[Todo]` value is correctly REJECTED) so this catches the type-corruption class that pure `-parse` waves through. **Scope caveat:** the stub `-typecheck` covers the 2 example apps + 35 of 37 compiler fixtures (canonical primitives + common modifiers + i18n/machine/permissions/link/webview + the rx fixtures + the router-hook surface `PyreonRouter`/`useNavigate`/`useParams` + the `PyreonForm` binding surface + the two SMALL `@Observable` fixtures `tier2-store`/`tier2-state-tree` via marker-protocol stubs and a guaranteed `import Observation`; only the 2 LARGE `@Observable` showcase apps remain, M-gate.1f); the gate has already earned its keep by SURFACING real emitter bugs that were then FIXED so the emitted native code actually compiles (rx `.first`/`.last`/`.min`/`.average` now infer Optional/Double bindings; a null-returning component now emits `EmptyView()` not `body { nil }`; a top-level object-shape `interface` is now SYNTHESIZED into a struct/data-class, same as a `type` alias). The 4 still-excluded fixtures are the `@Observable` service surface (`showcase-finance`/`showcase-tasks`/`tier2-store`/`tier2-state-tree` — each emits an `@Observable` class with no `import Observation`, which the Linux stub build can't resolve once `import SwiftUI` — its usual transitive provider — is stripped; unblocking them needs the harness to guarantee `import Observation` plus `PyreonStoreProtocol`/`PyreonModelProtocol`/`PyreonAuth`/`PyreonDatabase`/`PyreonFetch` stubs) and still reach only `-parse` per-PR until then — see the silent-failure cliff below.
> - **(2) Real-toolchain BUILD of the four example apps** — `xcodebuild` (full Swift compile) + `gradle assembleDebug` — via the `native-device` workflow (auto-runs on native-path PRs; conclusion advisory until the 14-green-nightly streak gate passes). This is the only place type-checking against the REAL SDK (not stubs) happens, and only for those apps.
> - **(3) Launch + interaction UI smokes** — XCUITest (iOS Simulator) + Compose-instrumented-test (Android Emulator). Strong for the **Tasks/Counter/Router** examples (login validation, store mutation, typed-params nav, content-asserted fetch, Suspense/ErrorBoundary all assert real behaviour); **launch-only for TodoMVC**; **absent for native-analytics**.
>
> Layers 2–3 now run **automatically on every PR that touches the native pipeline** (`packages/native/**` / `examples/native-*/**`, via the workflow's fail-closed `changes` job — the repo is public, so the macOS runner is free; the `native-device` label remains the manual opt-in for path-external changes) plus the nightly schedule. Their conclusion is still **advisory** (not in branch protection): the encoded promotion gate is `bun scripts/check-native-device-streak.ts` — 14 consecutive green nightlies — and the workflow shape is now required-check-safe by construction (job-level skips, no trigger-level path filter), so passing the streak gate makes promotion a pure branch-protection change. So "it compiles" on a PR means "the syntax parsed," not "it builds + runs on a device." Treat native output as demo-grade until the device gate is required.

## The pitch

Write your app once. Run it on the web, iOS, and Android — each rendered with the platform's native primitives. (Web runs live today; iOS/Android are emitted as SwiftUI/Compose and build cleanly for the example apps — read "What runs on native" and the validation Status above for the honest scope, including which packages are web-only.)

```tsx
// examples/native-todomvc-ios/src/TodoApp.tsx — single source, three targets
import { signal, computed } from '@pyreon/reactivity'
import { useStorage } from '@pyreon/storage'
import { Stack, Inline, Text, Field, Button } from '@pyreon/primitives'

export function TodoApp() {
  const todos = useStorage<Todo[]>('todos', [])
  const draft = signal('')

  return (
    <Stack gap="md">
      <Field
        value={draft}
        onChangeText={(text) => draft.set(text)}
        placeholder="What needs to be done?"
      />
      <For each={todos} by={(t) => t.id}>
        {(t) => (
          <Inline gap="sm">
            <Text>{t.text}</Text>
            <Button onPress={() => /* ... */}>Remove</Button>
          </Inline>
        )}
      </For>
    </Stack>
  )
}
```

This single file compiles to:

- **Web** via `@pyreon/runtime-dom` — `<Stack>` becomes `<div style="display:flex;flex-direction:column">`, `<Field>` becomes `<input>`, etc.
- **iOS** via PMTC → SwiftUI — `<Stack>` becomes `VStack`, `<Field>` becomes `TextField("", text: $draft)`, etc.
- **Android** via PMTC → Jetpack Compose — `<Stack>` becomes `Column`, `<Field>` becomes `TextField(value, onValueChange)`, etc.

Same source. Three idiomatic outputs (web rendered live; iOS/Android emitted as SwiftUI/Compose — see the validation reality in the Status note above).

## What runs on native — and what's web-only (read this first)

**PMTC compiles your component *source* — the 15 canonical primitives, `signal`/`computed`/`effect`, and a fixed set of hooks — to SwiftUI/Compose. It does NOT transpile npm packages to native.** So a package runs on iOS/Android only if it is pure reactive logic **with a Swift/Kotlin runtime port** the compiler recognizes. Anything bound to the DOM, a `<canvas>`, the CSSOM, or a JS-only rendering vendor is **web-only by architecture** — no compiler setting changes that.

**✅ Runs on web + iOS + Android today** (real runtime ports + compiler emit):

- `@pyreon/reactivity` (signal/computed/effect), `@pyreon/primitives` (the 15 canonical primitives)
- `@pyreon/store`, `@pyreon/machine`, `@pyreon/state-tree`, `@pyreon/i18n`, `@pyreon/permissions`
- `@pyreon/form` (validated forms — **device-proven**), `@pyreon/storage` (platform-storage backend)
- the native `@pyreon/router` port (`useNavigate`/`useParams`/`useLoaderData`, nested routes, `beforeEnter`)
- the **subset** of `@pyreon/hooks` with ports: `useFetch`, `useOnline`/`useNetworkStatus`, `useAppState`, `useClipboard`, `useColorScheme`

**❌ Web-only by design** (a hard DOM/canvas/vendor dependency the compiler has no path for — these will NOT be *native-rendered* as SwiftUI/Compose; PMTC can't compile echarts/CodeMirror/elkjs/etc. But several CAN be **hosted in a `<WebView>`** — see the bridge escape hatch right after this table):

| Package | Blocking dependency |
|---|---|
| `@pyreon/flow` | `elkjs` layout engine + SVG/CSS-transform pan-zoom + DOM pointer events |
| `@pyreon/charts` | `echarts` (renders to `<canvas>`) |
| `@pyreon/code` | CodeMirror 6 (DOM editor) + a `<canvas>` minimap |
| `@pyreon/dnd` | `@atlaskit/pragmatic-drag-and-drop` (HTML5 drag events on `HTMLElement`) |
| `@pyreon/document` / `@pyreon/document-primitives` | pdfmake/docx/exceljs/pptxgenjs + `Blob`/`document` download |
| `@pyreon/query` | TanStack Query core + SSE/WebSocket hooks (use **`useFetch`** for simple data on native) |
| `@pyreon/table` / `@pyreon/virtual` | TanStack headless cores bound to DOM cells / scroll containers |
| `@pyreon/hotkeys` | `window` keyboard listeners |
| `@pyreon/elements`, `@pyreon/styler`, `@pyreon/rocketstyle`, `@pyreon/coolgrid`, `@pyreon/kinetic`, `@pyreon/unistyle`, `@pyreon/ui-core`, `@pyreon/ui-components` | the web CSS-in-JS / DOM stack (Layer 3b) — native apps use `@pyreon/primitives` (Layer 3a) instead |

**🌉 Escape hatch — host a web-only component in a `<WebView>` (the bridge).** The "❌" packages can't be *native-rendered*, but a `<WebView>` embeds a real browser engine (WKWebView on iOS, Android WebView), so the web component runs *inside* it — echarts' canvas, flow's elkjs+SVG, CodeMirror, a document preview. The bridge is **bidirectional**:

- **Forward** — `data={metrics()}` is pushed into the page as `window.__pyreonData` (+ a `pyreondata` event) so the hosted component updates live, no reload.
- **Reverse** — the page calls `window.pyreonPostMessage(payload)` → your native `onMessage={(m) => …}` closure.

```tsx
// examples/native-analytics — a chart hosted natively, both directions:
<WebView html={CHART_HTML} data={metrics()} onMessage={(m) => selected.set(m)} />
```

This is the **right** answer for charts / diagrams / code editors / doc previews (you wouldn't reimplement echarts in SwiftUI anyway). Caveats: it's a hosted web view (web look-and-feel, not native widgets), pays WebView boot + bundle weight (echarts ~1 MB), and is best for self-contained *panes* — not your whole app. The bridge runtime (`PyreonWebView.swift`/`.kt`) is real + `swift build`-clean and `native-analytics` demonstrates it, but a chart-in-WebView **device** test isn't in the nightly gate yet (the mechanism is proven; the on-device run isn't CI-gated). For your core app UI (nav/forms/lists/layout) use the native primitives; reach for the WebView only for the rich web-island pieces.

**📦 Shipping a local viz bundle — `<WebView src="…">` + the `web/` staging step.** Inline `html=` embeds a self-contained string; for a multi-file bundle (an `index.html` + its `chart.js`/`chart.css`), use `<WebView src="chart.html">` and drop the files in a `web/` directory at your project root. The scaffold's build scripts run `pyreon-native stage-web`, which copies that flat bundle into the exact app location each runtime resolves `src` against — iOS `WebContent/` (an XcodeGen `type: group` → the files flatten to the app bundle's resource root, found by `Bundle.main.url(forResource:)`) and Android `assets/` (served at `file:///android_asset/`). This keeps the whole bundle on-device (no remote fetch — the policy-safe path Apple 4.2 / Google's webview policy prefer) and lets `chart.html`'s relative `<script src="chart.js">` resolve. **v1 is flat-only** — a nested subdirectory is skipped with a build warning (the shipped Swift runtime resolves `src` by bare name with no `subdirectory:`; nested support is a runtime follow-up), and the on-device *render* rides the same nightly device rung as the rest of iOS — the staging **layout** itself is unit-locked, but "the WKWebView actually paints the staged file" is device-gated, not CI-proven.

**🟡 Logic could port, but no native runtime exists yet:** `@pyreon/rx`, `@pyreon/validate`, `@pyreon/validation`, `@pyreon/url-state`, `@pyreon/toast` (the store is pure-logic; the `<Toaster>` renderer is DOM), and `@pyreon/sync`'s engine-neutral core (the Yjs engine + IndexedDB/WebSocket transports are web/Node-only).

### The supported-TypeScript-surface ceiling (and the silent-failure cliff)

PMTC compiles a **deliberately narrow, declarative subset** of TypeScript in component bodies: signal/computed/effect declarations, typed props, the canonical-primitive JSX, `<For>`/`<Show>`, `if`/ternary control flow, array/string method calls, and two `type`-alias shapes (string-literal union → enum, object literal → struct/data class). Inside that lane it emits real, idiomatic SwiftUI/Compose.

**Outside that lane the failure mode is sometimes *silent*, sometimes a named warning — the silent-drop surface is shrinking.** `Map`/`Set`/`Date` and generics in logic are dropped or mis-emitted — some still with no warning. **Imperative control-flow *statements* at a component-body top level — `for` / `for…of` / `for…in` / `while` / `do…while` / `switch` / `try` / `throw`, and an *imperative* `if` (a mutating body) — now fail with a NAMED warning pointing at the escape hatch (move the logic into a helper function that takes parameters — loops + `switch` DO lower there — compute the value with array methods `.map`/`.reduce`/`.filter`, or render conditionally/iteratively in JSX via `<Show>` / `<For>`), no longer a silent drop that left the render on stale values.** **An EARLY-RETURN conditional render — `if (cond) return <JSX>` (optionally `else return <JSX>`, and chained: `if (a) return <A>; if (b) return <B>; return <C>`) — now LOWERS: it folds to a ternary the emitter emits as a native result-builder conditional view — a SwiftUI `@ViewBuilder` **`if cond { A } else { B }`** (NOT the `? :` operator, which swiftc rejects between DIFFERENT view types: `sizeClass == "regular" ? HStack {…} : VStack {…}` fails "result values in '? :' expression have mismatching types `HStack<Text>` and `VStack<Text>`" — the adaptive **Stack↔Inline** case), Compose `if (cond) A else B`. Both a DIRECT view-branch ternary (`sizeClass() === 'regular' ? <Inline> : <Stack>` — the size-class-driven adaptive-layout idiom) and the folded early-return lower this way, verified to `swiftc -typecheck` + `kotlinc` (imperative control flow can't sit in a SwiftUI `var body` result builder — only a conditional VIEW can — so this is the one control-flow shape that lowers directly in a component body). A VALUE ternary (`cond ? "a" : "b"`) stays a `? :` expression. Pre-fix the `if` was dropped (rendered only the fallthrough branch), or — with an `else`-return and no fallthrough — the WHOLE component was skipped.** `instanceof`/`in` already warn. (Destructuring of locals is now lane-precise: **flat** `const {a} = obj` / `const [a, b] = xs` LOWER; **nested / rest / default** patterns — `const {a:{b}} = o`, `const {a, ...r}`, `const [a, ...r]`, `const {a = 1}` — now fail with a NAMED warning pointing at the escape hatch, no longer a silent drop. `try`/`throw` and `class`/`new` already emit a named "unsupported" warning. A **top-level pure-logic helper function** — `function dbl(x: number): number { return x * 2 }`, the L1 "shared pure logic" layer — is now **EMITTED** at file scope as a native `func` / `fun` (reusing the same function emitter store methods use), where before it was *silently misclassified as a component* and mis-emitted as a broken `struct dbl: View` (its value params dropped, the body referencing an unbound name → a cryptic `cannot find 'x' in scope`). A call `computed(() => dbl(21))` infers the helper's return type (a `helperReturns` registry threaded into the computeds pre-inference), so the Swift computed annotates `Int`, not `Any` (`String(dbl(21))` typechecks). The classifier is narrow — only a function that takes value parameters and returns no JSX (a function OF ITS INPUTS) is a helper, so a no-param `function C() { …; return out }` component-returning-a-value emits unchanged, and a component (return resolves to JSX — directly or through a `cond ? <A/> : <B/>` / `&&` root) is never misread. BOTH declaration forms are recognized: a `function dbl(){}` AND a top-level ARROW-CONST `const dbl = (x: number) => x * 2` (`tryHelperFnFromArrowConst` routes the arrow-const into the same `helperFns` path — before, it fell through to a mis-scoped `private let dbl = { x in … }` closure + `Any`, a silent uncompilable mis-emit); a JSX-returning arrow-const (a component), a no-param arrow-const, and a plain module const (`const APP = '1.0'`) fall through unchanged. A helper with NO return-type annotation (`function dbl(x: number) { return x * 2 }`) also emits — its return type is INFERRED from the body (`refineHelperReturns` seeds the params + walks for the first `return`, reusing the same `inferReturnType` util the emitters use for un-annotated function signatures), so the emit signature AND the call-site `helperReturns` registry both get the real type. A helper with a FRACTIONAL body (`function scale(x: number) { return x * 1.5 }`, `x / 2`, `Math.sqrt(x)`) also emits: `emitSwiftFunction` seeds the helper's `Int` params into the coercion ctx (the same `_activeInferCtx.locals` the element-callback coercion uses) so `x * 1.5` → `Double(x) * 1.5`, and `refineHelperReturns` refines the `number` return `Int` → `Double` so the signature matches (Kotlin auto-promotes Int×Double, needing only the Double return). Division lowers to `Double(x) / Double(2)` (JS-fractional 4.5, not integer 4). ONE shape keeps a NAMED warning (deferred, never a broken emit): a GENERIC helper (`function first<T>(…)` — the native IR can't represent `<T>`); a body whose type still can't be inferred (an untyped param the return depends on) also warns + is dropped. The emit + call-site inference are proven on both real toolchains (`swiftc -typecheck` + `kotlinc`). A JSX **spread on a canonical primitive** — `<Stack {...cfg()}>` — now fails with a NAMED warning too (its layout props were *silently dropped* before: a runtime prop-bag can't apply to a static SwiftUI view / Compose composable, so pass props explicitly — `<Stack gap="md">`); a spread on a USER component still expands against its declared props.) (Recently CLOSED — these now LOWER and are no longer dropped/mis-emitted: **template literals** `` `Hi ${name}` `` → native interpolation; **`for…of`/`while`/`switch`** + **reassignment** (`t = t + x`, `+=`) + **multi-declarator**; **optional chaining** `a?.b` (member); **object destructuring of locals** `const {a} = obj` (body-local + hook-result, e.g. `const { data } = useFetch(url)`); **untyped object / array-of-object signals** → a synthesized struct *with a precise type annotation* (`signal({x:1})` / `signal([{id:1,name:"a"}])` emitted a broken `Any` annotation on Swift, now an inferred struct/`[Struct]`); **nested-array signals** (`signal([[1,2],[3,4]])` / `[[[1]]]` / `[["a"]]`) — `inferTypeFromInitial` had scalar-array + flat-object-array cases but NO array-OF-arrays case, so a grid/matrix signal degraded to `Any` (the value `[[1,2],…]` was valid Swift but the annotation failed swiftc, and a downstream `grid()[0][1]` then also degraded). Now recurses into the element (`[[Int]]` / `[[[Int]]]` / `[[String]]`); a fractional leaf flags EVERY nested integer literal float (`[[1.5],[2]]` → `[[Double]] = [[1.5], [2.0]]`) so Kotlin's `List<List<Double>>` accepts it. Swift-only in effect — Kotlin infers `List<List<…>>` on its own; **`.sort` + chained array-method element inference** (`[...xs()].sort(cmp).slice(0, n)` — `.sort` was inferred `Any`, breaking the chained `.slice`); **`.flatMap` result-type inference** — `.flatMap` already EMITTED natively (`arr.flatMap({…})` on both targets), but `inferType` had no case, so the computed typed `Any` on Swift and a chained `.length` failed. Now `arr.flatMap(x => [E])` flattens one level → `[E]` (the callback's ARRAY body type ITSELF, unlike `.map(x => [E]) → [[E]]`). This surfaced a sibling array-literal homogeneity bug: `n * 2` returned `{ number, float: false }` while a bare `n` returned `{ number }`, so `[n, n * 2]` was treated as heterogeneous → `unknown` → `[Any]`; fixed to follow the "float ONLY when true" convention (a non-float result is now byte-identical to `{ number }`), which ALSO fixes any array literal mixing a value + arithmetic (`[a, a * 2]`). (Swift-only — Kotlin infers on its own. A `String()`-constructor body + the `Int * Double` coercion are separate pre-existing gaps.) **seedless `.reduce(fn)`** — JS's no-initial-value reduce (`arr.reduce((a, b) => …)` seeds the accumulator with the FIRST element) had no Swift lowering: the bare `arr.reduce({…})` bound to `reduce(into:)` ("missing argument for parameter 'into'"). Now lowers to `arr.dropFirst().reduce(arr[0], fn)` (Kotlin's 1-arg `.reduce {…}` already matches JS). The lowering names the receiver TWICE, so it only fires when the receiver is RE-READABLE (identifier / signal / store read, via `isReReadableExpr`); a receiver with a chained method call (`filter(…)`) that would re-run work emits a NAMED build-failing warning + defers. The seedless result type is the array's ELEMENT type (JS seeds with `arr[0]`), so the max idiom `(a, b) => a > b ? a : b` infers correctly instead of `Any`. **object-literal → declared-struct inference** — a computed RETURNING an object literal (`() => ({ x, y })`), or a `.reduce` with an OBJECT accumulator (`reduce((a, b) => ({ sum, count }), { sum: 0, count: 0 })`), now infers the DECLARED struct whose field-set matches the literal (mirroring the emit's `_structFieldsToName` first-wins lookup) instead of degrading the computed to `Any` — so a downstream `out().sum` / `out().x` field read resolves (was Swift "value of type 'Any' has no member 'sum'"). A literal matching NO declared `type X = { … }` stays `Any` (the emit synthesizes an anonymous struct for it, but inference can't name that without the emitter's per-run registry — a follow-up). **field access on an inline object literal** (`({ count: nums().length, label: s() }).count`) — a partial answer to the naming follow-up just above: an INLINE object literal infers `unknown` (there is deliberately no general object-literal inference case — a nameless literal has no struct NAME for an annotation), so `({…}).count` degraded the computed to `Any` — the emit `(__Obj0(…)).count` is a valid Int EXPRESSION, but the `Any` annotation fails swiftc once consumed (`String(out())`). Now the FIELD'S type resolves directly from the literal's own fields (unwrapping the `paren` node `({…})` wraps it in) → `out: Int` / `String` / `Double`, WITHOUT the struct name (a field access needs the field type, not the name). A SPREAD literal (`{ ...base, y }`) bails (stays `Any`); the intermediate-const form (`const o = {…}; return o.count`) is a separate multi-statement-dataflow gap. **field access on a TERNARY of two object literals** (`(cond ? { v: 1 } : { v: 2 }).v`) — completes the field-access-on-object-producing-expr class the inline-object-literal case opened: a TERNARY operand also infers `unknown`, so `(cond ? {v:1} : {v:2}).v` degraded the computed to `Any` even though both branches synthesize the SAME struct (emit `(cond ? __Obj0(v:1) : __Obj0(v:2)).v`, a valid Int expression). Now the field's type resolves from a branch (paren-unwrapping each), gated on the field existing in BOTH branches → `out: Int` / `String`; a MIXED ternary (`cond ? {v:1} : {w:2}`, different fields) bails to `Any`. **intermediate-const object-field access** (`const o = { count: nums().length }; return o.count` inside a computed) — the COMMON `const o = compute(); return o.field` shape. `findFirstReturnExpr` already seeds a computed body's locals into the infer ctx, but an object-literal initializer infers `unknown` (the no-nameless-object-annotation rule), so `o` was seeded `unknown` and `o.count` couldn't resolve → the computed degraded to `Any`. Now object-literal consts are ALSO recorded in `ctx.objectLocals` (name → the literal), and the member case resolves `o.count` from the recorded fields → `out: Int` / `String` — WITHOUT changing `o`'s own type in `locals`, so a bare `return o` (whole local object) is UNCHANGED (still `Any`, not a new tuple emit). Only a FIELD access newly resolves. **`Object.keys()` / `Object.values()` over a known object shape** — keys → a static key array (`["a","b"]` / `listOf("a","b")`), NOW including a DECLARED-struct arg (`Object.keys(p())` where `p: signal<P>` — the typeRef resolution gap that made the dominant real shape degrade-warn); values → a static member-access array (`[p.a, p.b]` / `listOf(p.a, p.b)`, field order = declaration order) gated on ALL field types identical (JS's mixed values array has no native analog) + a re-readable receiver (named once per field). `.entries`, mixed shapes, chained receivers, and non-struct args keep the typed-empty degrade + NAMED warning — never the old silently-uncompilable `Object.keys(...)`; **Int×Double coercion inside an element-callback body** — Swift has no implicit Int→Double conversion, so `nums().map(x => x * 1.5)` (an Int-array param × a fractional literal) emitted a bare `x * 1.5` INSIDE the closure → "cannot convert value of type 'Int' to expected argument type 'Double'". Component-scope coercion (`n * 1.5` → `Double(n) * 1.5`) already worked, but an element-callback PARAM is neither a signal nor a const, so inside the closure it inferred `unknown` and the coercion never fired. Now the emit binds a `.map`/`.filter`/`.forEach`/`.find`/`.some`/`.every`/`.flatMap` callback's first param to the receiver's element type while emitting the closure, so `+`/`-`/`*` on that param coerce (`Double(x) * 1.5` / `- 0.5` / `+ 0.5`) — including inside a filter predicate; nested/sibling closures each see their own element type (restore via try/finally). (Swift-only — Kotlin auto-promotes Int×Double arithmetic. A `.flatMap` whose body is itself a `.map` still infers `Any` — a separate flatMap-of-map inference gap.); **2-param index-callback Int×Double + mixed-comparison coercion** — completes the element-callback coercion family: the 2-param `(el, idx)` form lowers through the separate `enumerated()` path, which skipped the element-type scoping, so `.map((x, i) => x * 1.5)` emitted the bare `x * 1.5` ("cannot convert value of type 'Int' to expected argument type 'Double'"); the indexed-closure emit now binds the element param to the receiver's element type + the index param to Int (try/finally-restored). Fixing that exposed the sibling gap: Swift also requires same-type operands for COMPARISONS (`x * 1.5 > i` failed at `Double > Int`), so the comparison emit now coerces the Int side when exactly one operand is Double — non-literal operands only (Swift self-types integer literals in a Double context, so `> 2` stays bare and every existing emit is byte-identical); enum/string/bool comparisons untouched (`numericFloatness` returns 'other'). (Swift-only — Kotlin allows Int↔Double comparison + auto-promotes arithmetic.) **ternary empty-array branch unification** — `cond ? [x] : []` (the conditional filter-map idiom, esp. as a `.flatMap` body: `nums().flatMap(x => x > 1 ? [x] : [])`) and the mirrored `cond ? [] : [x]` degraded the whole ternary to `Any` (a bare `[]` carries no element type → `unknown` → the branch-kind equality check failed), breaking any typed consumer. The ternary inference now unifies to the array branch's type when the OTHER branch's expr is an untyped empty array LITERAL (never on a mere `unknown` type); both emits already compiled under the unified annotation (Swift types `[]` bidirectionally from context; Kotlin's `listOf()` is `List<Nothing>`, a subtype) — an inference-only fix; mixed-type ternaries (`cond ? 1 : "x"`) still degrade honestly. **`Date.now()`** — emitted VERBATIM on both targets (a clean-parse silent mis-emit: Swift "cannot call value of non-function type 'Date'" — Foundation's `Date` resolves as a TYPE; Kotlin "unresolved reference 'Date'"). Now lowers to epoch-ms as a DOUBLE (Swift `Date().timeIntervalSince1970 * 1000` / Kotlin `System.currentTimeMillis().toDouble()`) — Double because ms-since-epoch (~1.7e12) OVERFLOWS Kotlin's 32-bit Int (PMTC's `number`→Int default) and Double is exact below 2^53; the float inference composes with the Int×Double coercion (`Date.now() - start()`) and the Math return-type work (`Math.floor(Date.now()/1000)` → Int). Other `Date.*` statics (`Date.parse`, …) → a NAMED build-failing warning; `new Date()` already warns via the class/new path. KNOWN pre-existing limit (general, tracked): `.set(<float expr>)` into an Int-typed signal (`signal<number>(0)` + `start.set(Date.now())` — the stopwatch shape; same for `price.set(1.5)`) fails LOUD with a native type error — write-site float-WIDENING of the signal's declared type is the next inference gap. **`<For by={(x) => x}>` identity keying** — the `by` resolver only understood the member shape (`(i) => i.id`) and SILENTLY fell back to `.id` for everything else, so an identity key over a plain string list (`<For each={names} by={(n) => n}>` — the tags/subjects shape) emitted the uncompilable `ForEach(names, id: \.id)` / `key = { it.id }` with zero warnings. Identity now lowers to `id: \.self` (String/Int are Hashable) / `key = { it }`; member keys unchanged; any OTHER by-shape (computed keys) emits a NAMED build-failing warning — never silent. Surfaced by the StatsPage device example (the realistic-app discovery pattern, 6th instance); the example now rides the auto-firing device gate in `examples/native-tasks` exercising this sprint's vocabulary end-to-end on real toolchains (Object.keys/values over a declared struct, seeded reduce, Double division, the filter-map idiom, 2-param indexed Int×Double + mixed comparison). **the idiom-sweep canary + its five first-run finds** — a permanent regression corpus (`native-idiom-sweep.test.ts`) asserts common JS idioms are LOUD-OR-TYPECHECKS on BOTH targets (a warning-free emit must pass real `swiftc -typecheck` AND `kotlinc` — a Swift-clean / Kotlin-broken emit, or vice-versa, can no longer slip through; a future silent MIS-emit regression fails the canary before shipping). It also locks a statement-context corpus (handler bodies): `a ||= b` / `a &&= b` / `a ??= b` stay LOUD because a naive parse-time desugar to `a = a || b` is UNSOUND — JS `||`/`&&` are truthiness ops over any type, but Swift/Kotlin `||`/`&&` are `Bool`-only, so `n &&= 5` → `n = n && 5` fails both toolchains (a faithful lowering needs type-aware emitter gating, not a parse desugar). Its first run caught five SILENT fails, all fixed: `arr.join(sep)` on a NON-String array (Swift `joined(separator:)` is [String]-only — now element-type-aware, mapping `String.init` first); `arr.lastIndexOf(x)` (now `lastIndex(of:) ?? -1`, indexOf's mirror; non-array receivers warn NAMED); `arr.flat()` (the emit existed but no inference case → `Any` — now array-of-array → inner array); `Number.isInteger(x)` (raw emit failed BOTH targets — now Int arg → `true`, Double → the parenthesized remainder check, unknown → NAMED warning; infers boolean); `Math.max(...arr)`/`Math.min(...arr)` (the SPREAD form bypassed the fixed-arity mapping on BOTH targets — now the collection max()/min() with JS's empty-array sentinel analog: Int.min/Int.max for Int arrays, ±infinity for Double). **Kotlin default WebSocket transport (OkHttp)** — `PyreonWebSocket`'s Android side previously required a HOST-SUPPLIED transport (`connect(register: (WebSocketHandlers) -> WebSocketSender)` — the documented URLSession-vs-no-JDK-socket asymmetry). The runtime now ships `PyreonWebSocketOkHttp.kt`: a `connect(url: String)` extension wiring a shared OkHttp client's `WebSocketListener` into the container's pure state machine (`onOpen/onMessage/onFailure/onClosed` → the reactive fields) + a `WebSocketSender` (`send`/`close(1000)`), matching Swift's `connect(to: URL)` one-for-one. The extension is the ONLY runtime source importing okhttp3 (the core container stays dependency-free per its design contract); every Android example's gradle gains the okhttp dep (the srcDir compiles all runtime sources); the per-service kotlinc verify gains an okhttp3 stub set mirroring the real 4.x surface EXACTLY (typecheck-only — the semantic proof is the device build with real OkHttp, which the auto-firing device gate runs on the PR). UNBLOCKS: the compiler flipping Android's `ws.connect()` from the named transport warning to the faithful `connect(url)` emit, and lifecycle AUTO-START on both targets (a synthesized `onMount(connect)`) — both land with the onMount-lowering PR once it merges. **`!x`/`!!x` truthiness + `isNaN` + two loud-guard conversions** (idiom-sweep batch 2 — five more SILENT fails): `!x` on a non-Boolean is JS truthiness negation ("type 'Int' cannot be used as a boolean") and `!!x` was doubly broken (juxtaposed unary is a Swift parse error) — both now lower by the arg's inferred type on BOTH targets (number → `== 0`/`!= 0`, string → isEmpty/non-empty, boolean verbatim, optional → nil/null check; unknown stays raw-loud). `isNaN(x)`: Int arg → statically `false`, Double → the native `.isNaN`/`.isNaN()`, infers boolean. String `.at(i)` (the ARRAY lowering emitted uncompilable garbage on a String — Swift String indices aren't Int; Kotlin getOrNull yields Char?) → gated to arrays + a NAMED warning on strings. A multi-statement `.sort` comparator (silently dropped via the block-body sentinel; Swift's `< 0` Bool conversion can't wrap a block) → NAMED warning both targets, expression bodies unchanged. **`onMount(fn)` lifecycle lowering** — THE documented lifecycle escape hatch ("call `.start()`/`.connect()` from an onMount") was a SILENT drop: the component-body walker only handled declarations + return, so `onMount(() => ws.connect())` compiled clean with zero warnings and did nothing on device (the worst class: silent + documented). Now lowers to SwiftUI `.onAppear { … }` on the stable-identity ZStack host (the fetch-arc `.task` trap applies to `.onAppear` too) / Compose `LaunchedEffect(Unit) { … }`. Companions: `ws.connect()` (0-arg TS surface) threads the `useWebSocket(url)` decl's url into Swift's `connect(to: URL(string: …)!)`; on Kotlin it emits a NAMED warning + the loud raw call (the runtime's `connect(register:)` needs a HOST-SUPPLIED transport — the default-OkHttp-transport is the tracked follow-up, after which compiler AUTO-START becomes a synthesized onMount). A returned cleanup fn → NAMED warning (mount body still emitted; unmount cleanup is v2). **`await hook.method()` in an `async` event handler (M4.5)** — an async-RESULT service call awaited inside `onPress={async () => { const ok = await bio.authenticate('…'); status.set(ok ? 'ok' : 'denied') }}` now LOWERS (before, any `await` in a component was a named "use `useFetch`" warning that DROPPED the call): a synchronous SwiftUI/Compose action slot can't `await`, so the handler body is wrapped in a native async scope — SwiftUI `Button { Task { let ok = await bio.authenticate('…'); … } }`, Compose `onClick = { pyreonAsyncScope.launch { val ok = bio.authenticate('…'); … } }` with a composable-top `val pyreonAsyncScope = rememberCoroutineScope()` hoisted once (a Kotlin suspend call carries NO `await` keyword — the coroutine provides the context) — so the post-`await` statements run when the async result resolves. A SYNC handler is untouched (no `Task`/`launch` wrap). The first async-result consumer is `useBiometrics()` (recognized natively → `@State private var bio = PyreonBiometrics()` / `remember { PyreonBiometrics() }`; iOS `LAContext` biometrics-gate runtime ships, and the `@pyreon/hooks` web hook now ships too (`useBiometrics()` — web feature-detects `PublicKeyCredential` + resolves false, a real WebAuthn assertion needs a server challenge; the Android `BiometricPrompt`/`FragmentActivity` runtime is a follow-up, the v1 scaffold resolves false). Proven on both real toolchains — `swiftc -typecheck` (the `Task { await … }` shape) + `kotlinc` (the `scope.launch { … }` shape) — AND now DEVICE-PROVEN (M3.5): the shared counter's Unlock button awaits the gate; on an UNENROLLED Simulator/emulator it resolves false with NO prompt (biometrics-only policy, `canEvaluatePolicy` guard), so the observable outcome flips `Lock: idle` → `Lock: denied`, and the iOS XCUITest + Android Compose test assert that flip — proving the async scope RUNS at runtime (the post-`await` re-render fired), not just compiles. Any OTHER bare component-body statement (bare `effect(...)`, stray calls) now warns NAMED — the whole silent-expression-statement class is closed. **component-body top-level reassignment** (`let a = 1; a = 5;` / `a += 2` / `a++` at the component top level) — completes the above: a reassignment is an `ExpressionStatement` whose expression is an `AssignmentExpression`/`UpdateExpression` (NOT a `CallExpression`), so it fell past the bare-call warn branch into the intentional no-op drop meant for harmless `void x` discards → a REAL mutating reassignment was silently dropped (the render used the initial value). Now a NAMED warning: a component body emits declarations + the return JSX, not setup-time statements — components run ONCE (compute the final value directly with `const x = …`, or use a signal). Harmless `void x` / bare-ref / unary / logical discards stay silent (only genuine reassignments warn — the documented over-eager-regression guard holds). **component props via a NAMED local type** — `type CardProps = { qty: number; label?: string }` + `function Card(props: CardProps)` (the DOMINANT component shape) parsed to EMPTY props with NO warning: the emitted component declared no stored properties (Swift) / parameters (Kotlin) while its body referenced them bare and call sites passed args — uncompilable on BOTH targets (only the INLINE annotation `props: { … }` and destructured-inline shapes worked). A pre-pass now registers every local object-shape type alias and the props annotation resolves it regardless of declaration order (destructured NAMED refs too); an UNRESOLVABLE ref (imported type, interface) fails with a NAMED warning instead of the silent garbage emit. FOUR sibling gaps closed in the same class: (1) **optional fields dropped `?` everywhere** — `label?: string` now parses as the union-with-undefined convention, so structs/data-classes emit `var label: String? = nil` / `var label: String? = null` and component props `var label: String? = nil` / `label: String? = null`, the explicit default making the memberwise/named-arg parameter OMITTABLE (`<Card qty={2}/>` compiles; before, the field emitted REQUIRED and every omitting site failed); (2) **Swift call-site arg order** — JSX attrs emitted in AUTHOR order, but Swift's memberwise init hard-errors out of DECLARATION order (`argument 'qty' must precede argument 'label'`) — args now re-sort against the target's declared props (the old spread spec had CODIFIED an uncompilable order); (3) **props never seeded inference** — a computed over `props.qty` (member form) or a bare destructured prop annotated `Any` on Swift, breaking `String(total())`/arithmetic; both read shapes now resolve the declared prop type; (4) **bare optional in Text rendered `Optional(x)` (Swift debug description) / literal `null` (Kotlin)** where JSX renders EMPTY — an optional-typed interpolation now emits `\((x).map { "\($0)" } ?? "")` / `${x ?: ""}` (a `??`-collapsed read keeps the plain byte-shape). Whole-app emit proven by real `swiftc -typecheck` (multi-component + omitted optionals + out-of-order attrs). Known follow-ups: an optional inside a TEMPLATE literal still renders the raw value; a FUNCTION-typed field still derives Codable/@Serializable (uncompilable — the optional-callback-prop arc). **function-typed struct fields** — a declared type carrying a callback (`type RowActions = { label: string; onDone: () => void }`) emitted `struct RowActions: Codable` — closures aren't Codable, a HARD swiftc error ("does not conform to protocol 'Decodable'") — and `@Serializable data class` — the kotlinx serialization plugin rejects function properties on the REAL Compose build while the kotlinc validate STUBS mask it (a device-gate-only red). The conformance is now GATED: any field containing a function (directly, in a union branch, or as an array element — `typeContainsFunction`) drops `: Codable` / `@Serializable` (named structs AND synthesized anon-object data classes); function-free structs are byte-identical. Faithful, not a limitation: a type carrying functions can't JSON-round-trip in any language. TWO siblings in the same class: `(() => void) | undefined` hit the parser's unknown default (TSParenthesizedType was unhandled) → the whole union silently degraded to `Any?` (compiles for assignment, uncompilable the moment the callback is CALLED) — parens now unwrap; and with that fixed, the optional-function emit needed PARENS on both targets — a bare `() -> Void?` / `(Int) -> Unit?` is a function RETURNING an optional, not an optional function; now `(() -> Void)?` / `((Int) -> Unit)?`. Gated + parenthesized shapes proven by real `swiftc -typecheck` (construction + `cb?()` invocation). The `fn?.()` optional-CALL lowering builds on this optional-type preservation and lands as its follow-up (see below). **sweep batch 4 — dynamic a11y/testids, enum switches, JSON, destructured callback params** — four finds, three fully SILENT. (1) A template-literal (or ANY dynamic) value in `data-testid` / `accessibilityLabel` — the a11y/e2e-critical shape inside For rows (`data-testid={``row-${i}``}`) — was silently DROPPED on both targets (the modifier emits read static-only): both native slots accept dynamic string exprs, so it now lowers — Swift `.accessibilityIdentifier("row-\(n)")` / `.accessibilityLabel("item \(n)")`, Compose `.testTag("row-${n}")` / `semantics { contentDescription = … }`; templates splice natively, any other expr string-interpolates (JS coercion); static values byte-identical incl. the container `.contain` gate. (2) A `switch` over an ENUM-typed subject emitted raw STRING case labels — `case "busy":` against a `Status` enum is a swiftc type error, `"busy" ->` in a `when` a kotlinc incompatible-types error — with zero warnings; case labels now map through the existing active-enum context (`case .busy:` / `Status.busy ->`; labels only — case BODIES keep string literals; non-enum switches byte-identical). (3) `JSON.parse`/`JSON.stringify` emitted VERBATIM — `JSON` doesn't exist natively, an unresolved reference with no warning — now a NAMED build-failing warning (a Codable/kotlinx serialization bridge is the tracked follow-up, gated on the function-field conformance PR). (4) A DESTRUCTURED callback parameter (`.map(([k, v]) => k)` / `({ id }) =>`) emitted a closure over UNBOUND names — now a NAMED warning (take a plain param, read fields/indices), and the tuple-type annotation warning now names the fix (use an object type) instead of the generic "Unknown type annotation". Dynamic-attr + enum-switch shapes proven by real `swiftc -typecheck`. **regex literals** (`/pat/flags`) — a JS construct with no native form (Swift uses `Regex`/`.firstMatch(of:)`, Kotlin `Regex(...)`; neither has `/…/` literal syntax + `.match`/`.test`/regex-`.replace`), so `s.match(/x/)` / `/x/.test(s)` / `.replace(/x/g, …)` emitted the raw `/…/` VERBATIM on both targets — uncompilable, with ZERO warnings (a silent-drop the opening list above didn't even name). Faithful regex lowering (flags, capture groups, differing match APIs) is a tracked follow-up; for now the silent mis-emit is a NAMED warning + a safe `""` fallback (never the uncompilable verbatim regex). A STRING-arg `.replace("x", …)` is a separate path — unaffected. **computed object keys** (`{ [k]: v }`) — a computed-key property carries the key EXPRESSION, not a static name, but the object parser matched an identifier-keyed computed prop via `p.key?.name` and used the VARIABLE NAME as the struct field: `{ [k]: 1 }` (k a var) emitted `__Obj0(k: 1)` and a downstream `o.a` / `o[k]` read missed — a clean-PARSE mis-emit (`swiftc -parse` accepts it; only `-typecheck` / device catches the wrong field). A native struct/data-class needs static field names, so a computed key has no faithful lowering → now a NAMED warning (never the silent wrong field); static keys + object spreads are untouched. **call-argument spreads** (`f(...args)` / `o.h(...args)`) — DISTINCT from the array-literal / object spreads above (those lower): a spread ARGUMENT in a call reached the expr emitter's `case 'spread'` fallthrough and degraded to the bare argument, silently passing the whole array/list as ONE scalar arg (`f(xs)`) — uncompilable, since Swift/Kotlin calls take a fixed argument list (no variadic spread), with ZERO warnings. Now a NAMED warning at the EMITTER — the correct layer, because the parser can't distinguish a call-arg spread from an array-ELEMENT spread (both are `SpreadElement`), so the disambiguating context only exists downstream where every faithful consumer (array-concat, object partial-update, `Math.max`/`Math.min`) has already extracted its spread. Those consumers are untouched. **dynamic `disabled` on `<Field>` / `<Toggle>`** — the disable-a-form-control-during-submit shape (`disabled={busy()}`). `<Button>` was fixed (Round-1 audit) to use the shared `swiftDisabledModifier`/`kotlinEnabledArg` helper, but `<Field>` + `<Toggle>` still read `disabled` via `readStaticAttr` (static-only) — so a DYNAMIC value was SILENTLY DROPPED on both targets (the control stayed enabled/interactive regardless). All three now route through the shared helper: `disabled` is a runtime boolean (not a compile-time token), so a dynamic value lowers directly — Swift `.disabled(busy)`, Compose `enabled = !busy` — no warning. Static byte-identical (`.disabled(true)` / `enabled = false`). Proven by real `swiftc -typecheck` + `kotlinc`. **dynamic `placeholder` on `<Field>`** — a reactive hint (`placeholder={hint()}`, or `placeholder={terse() ? "Search" : "Search products by name…"}`) read `placeholder` STATIC-only (the same `readStaticAttr`/`readStaticAttrKotlin` class as disabled/color), so a dynamic value was SILENTLY DROPPED — Swift fell back to `""`, Compose omitted the `placeholder =` arg entirely (the field rendered no hint). UNLIKE the compile-time token props (gap/color/align/level), a placeholder is a RUNTIME String — SwiftUI's `TextField(_:text:)` accepts a `LocalizedStringKey` (literal) OR a `StringProtocol` (runtime String), and Compose's `Text(text: String)` takes any runtime String — so like the Image dims, a dynamic value lowers DIRECTLY with no warning (both a signal read and a two-literal ternary): Swift `TextField(hint, text: $draft)` / `TextField(terse ? "Search" : "…", text: $draft)`, Compose `placeholder = { Text(hint) }` / `placeholder = { Text(if (terse) "Search" else "…") }`. Static byte-identical (`TextField("name", …)` / `Text("name")`). Proven by real `swiftc -typecheck` + `kotlinc`. **dynamic `kind` on `<Field>` (show/hide-password toggle)** — `kind="password"` renders a masked field (Swift `SecureField`, Compose `visualTransformation = PasswordVisualTransformation()`); the DYNAMIC toggle `kind={reveal() ? "text" : "password"}` read `kind` STATIC-only, so it SILENTLY fell back to the PLAIN field on both targets — the password rendered in CLEARTEXT regardless of the toggle (a SECURITY silent-drop, worse than a dropped modifier). On Swift `kind` switches the VIEW TYPE (SecureField vs TextField are distinct types, so a bare ternary of the two won't typecheck), so the branches are erased through `AnyView` into ONE well-typed conditional the modifier chain still binds to: `(reveal ? AnyView(TextField(ph, text: $draft)) : AnyView(SecureField(ph, text: $draft)))`; Compose keeps ONE `TextField` and toggles the parameter: `visualTransformation = if (reveal) VisualTransformation.None else PasswordVisualTransformation()`. A ternary of two literal kinds where one branch is "password" lowers; a fully-dynamic (non-ternary) kind → a NAMED warning + a plain-field fallback. Static byte-identical. This ALSO closed a latent STATIC-password device-build bug: no example had used `kind="password"`, so `PasswordVisualTransformation` (in `androidx.compose.ui.text.input`, outside the unconditional import set) shipped UNIMPORTED — masked by the kotlinc validate stub (validate-green / gradle-red); the CLI now conditionally imports it + `VisualTransformation`, and the stub mirrors the real base-type surface. Proven by real `swiftc -typecheck` + `kotlinc`. **dynamic styling-attr values (`gap`/`padding(X/Y)`/`background`/`radius`)** — a non-static value in a styling attr SILENTLY dropped the WHOLE modifier on both targets with zero warnings (`gap={dense() ? "sm" : "lg"}` emitted a bare `VStack {` / `Column {` — the binary-density idiom just lost its spacing). Styling tokens resolve at COMPILE time (the numeric forms are token INDICES on the 4px scale, not pixels — a runtime number can't map), so the faithful dynamic form is a **ternary of two literal tokens**: both branches compile-resolve and the condition emits natively — Swift `VStack(spacing: (dense ? 8 : 16))` / `.padding((dense ? 4 : 12))` / `.background((dense ? Color(…) : Color(…)))`, Compose `Arrangement.spacedBy((if (dense) 8 else 16).dp)` etc. (shared IR classification + per-emitter emit; conditions run through the optional-truthiness-aware condition helpers). Any OTHER dynamic value (a signal read, an arbitrary expression) now fails with a NAMED per-attr warning pointing at the two supported forms — never the silent drop. Static values are byte-identical. Ternary shapes proven by real `swiftc -typecheck` (spacing/padding/background/cornerRadius). **dynamic Icon `color`/`size` styling** — the state-driven icon (`<Icon color={active() ? "primary" : "muted"}>`) read its `color`/`size` STATIC-only, so a dynamic value SILENTLY dropped the modifier (no `.foregroundColor`/`.imageScale` on Swift, no `tint`/`.size` on Compose, zero warnings) — the same class as the gap/padding gap above, on the Icon primitive. Now routed through the same `swiftStylingValue`/`kotlinStylingValue` ternary-of-two-literal-tokens machinery: static byte-identical, a ternary of two literal tokens → a native conditional (Swift `.foregroundColor((on ? Color(…) : Color(…)))` / `.imageScale((on ? .large : .small))`, Compose `tint = (if (on) … else …)` / `.size((if (on) 24.dp else 16.dp))`), any other dynamic value → a NAMED per-attr warning (never the silent drop). Ternary shapes proven by real `swiftc -typecheck` + `kotlinc`. **dynamic Image `width`/`height` (runtime pixels)** — Image dims are RAW pixels, not compile-time tokens, so UNLIKE the token props (gap/color/align) a dynamic dim isn't a "ternary of tokens" — it's a runtime numeric. Pre-fix the emit read them STATIC-only, so ANY dynamic dim (a ternary OR a signal read) SILENTLY dropped the `.frame` / `.width` modifier. Now ANY dynamic value lowers to the runtime numeric — Swift `.frame(width: CGFloat(<expr>))` (SwiftUI's `.frame(width:)` takes `CGFloat?`; an Int/Double runtime value or an Int-literal ternary needs the explicit init), Compose `Modifier.width((<expr>).dp)` (the `.dp` extension applies to Int/Double) — NO warning (a pixel dim IS a runtime value, so `width={size()}` lowers rather than warning; the token props still warn on a fully-dynamic value because a compile-time token can't map to one). Static byte-identical. Ternary + signal shapes proven by real `swiftc -typecheck` + `kotlinc`. **dynamic Stack/Layer `align`** — cross-axis alignment lives in the container CONSTRUCTOR arg (`VStack(alignment:)` / `Column(horizontalAlignment =)` / `ZStack(alignment:)` / `Box(contentAlignment =)`), not the modifier chain, and it read STATIC-only — so a dynamic value (`align={rtl() ? "end" : "start"}`) SILENTLY dropped the alignment (a bare `VStack {` / `Column {`, zero warnings). Now routed through the same `swiftStylingValue`/`kotlinStylingValue` ternary-of-two-literal-tokens machinery: static byte-identical, a ternary → a native conditional INSIDE the constructor arg (Swift `VStack(alignment: (rtl ? .trailing : .leading))` / `ZStack(alignment: (rtl ? .topLeading : .bottomTrailing))`, Compose `Column(horizontalAlignment = (if (rtl) Alignment.End else Alignment.Start))` / `Box(contentAlignment = (if (rtl) Alignment.TopStart else Alignment.BottomEnd))`), any other dynamic value → a NAMED warning (never the silent drop). Ternary shapes proven by real `swiftc -typecheck` + `kotlinc`. **dynamic Heading `level`** — the level maps to a font/typography size; a DYNAMIC level (`level={compact() ? 3 : 1}`) SILENTLY DEFAULTED to level 1 (`typeof levelRaw === 'number' ? … : 1`) — a silent MIS-emit (the heading rendered largeTitle regardless, not a drop). The level is a compile-time token (a font-map index), so the faithful dynamic form is a ternary of two literal levels — each branch resolves to its font/style — Swift `.font((compact ? .title2 : .largeTitle)).bold()`, Compose `style = (if (compact) MaterialTheme.typography.h6 else MaterialTheme.typography.h4)`; a fully-dynamic level warns NAMED + falls back to largeTitle/h4 (the map isn't runtime-indexable). Routed through the same `swiftStylingValue`/`kotlinStylingValue` machinery. Static byte-identical. Ternary shapes proven by real `swiftc -typecheck` + `kotlinc`. **dynamic Heading `color`** — a state-driven heading (`color={err() ? "danger" : "text"}`) read `color` STATIC-only, so a dynamic value SILENTLY dropped the `.foregroundColor` (Swift) / `color =` (Compose) — the same `readStaticAttr` class as Icon color. Now routed through `swiftStylingValue`/`kotlinStylingValue`: static byte-identical, a ternary of two literal tokens → a native conditional (Swift `.foregroundColor((err ? Color(…) : Color(…)))`, Compose `color = (if (err) Color(…) else Color(…))`), any other dynamic value → a NAMED warning (never the silent drop). Ternary shapes proven by real `swiftc -typecheck` + `kotlinc`. **`break`/`continue`, labeled loops, and the comma-operator handler body** — `break` and `continue` statements warn-DROPPED, a SEMANTIC mis-emit (the emitted loop ran EVERY iteration where JS would exit/skip — a `for…of` with `if (x === 3) break` summed ALL elements, not the JS prefix); a LABELED loop (`outer: for … break outer`, the standard nested-scan idiom) dropped the WHOLE handler body ("Unsupported statement: LabeledStatement"). Both targets support all of it natively, so it now lowers faithfully: Swift `outer: for … { break outer / continue outer }`, Kotlin `outer@ for … { break@outer / continue@outer }`, plain `break`/`continue` verbatim; the switch-case fall-through strip now removes only UNLABELED breaks (a `break outer` inside a case exits the enclosing loop — real semantics, previously stripped). A labeled NON-loop statement warns by name. And the comma-operator ARROW body — `onPress={() => (a.set(1), b.set(2))}`, the compact multi-write handler — emitted a `("")` junk body dropping BOTH writes; in statement position the sequence value is discarded, so each sub-expression now lowers to its own statement (arrow bodies AND block statement position; VALUE-position sequences still warn). Labeled/plain loop-control proven by real `swiftc -typecheck`. **C-style `for` + `do…while`** — completing the loop vocabulary: EVERY `ForStatement` and `DoWhileStatement` warn-dropped the WHOLE loop (the do-while residue was semantically wrong — post-loop reads saw initial values). The canonical COUNT-loop (`for (let i = 0; i < n; i++)`, `<=`, or `i += k` with a positive literal step) now lowers to a native RANGE — Swift `for i in 0..<n` / `1...n` / `stride(from:to:by:)`, Kotlin `for (i in 0 until n)` / `1..n` / `step k` — chosen over a while-desugar because ranges keep `break`/`continue` semantics intact (the desugar skips the update on `continue` → infinite loop). Non-canonical shapes (decrement, non-literal step, a counter REASSIGNED in the body — Swift's range binding is immutable, checked by an AST walk) warn by NAME with the rewrite hint. `do…while` maps directly: Swift `repeat { } while` / Kotlin `do { } while ( )`. Range + repeat shapes proven by real `swiftc -typecheck`. **`String(x)` / `Boolean(x)` coercion constructors as values** — `String(x)`'s emit was already valid on both targets, but with no inference case the RESULT typed `Any`, degrading any typed consumer (`["v", String(n())]` → `[Any]` → a chained `.length` failed Swift); it now infers `string` (the array stays `[String]`). `Boolean(x)` was doubly broken — no inference AND no emit mapping (the raw `Boolean(n)` fails BOTH targets: Swift "cannot find 'Boolean' in scope", Kotlin "unresolved reference") — and now lowers by the arg's inferred type, JS-exact for scalars: bool → identity, number → `!= 0`, string → non-empty, optional number/string → inner-value check (`(x ?? 0) != 0` — JS `Boolean(undefined)`=`Boolean(0)`=false), other optionals → presence (`!= nil`/`!= null`, matching the optional-truthiness condition lowering). An unresolvable arg type keeps the raw emit + a NAMED build-failing warning (never a silent drop). NaN edge documented (no native analog — same simplification the `parseInt ?? 0` mapping makes). **write-site float widening** — JS has ONE number type; PMTC splits Int/Double from the declared generic + initializer, so `signal<number>(0)` declared Int even when every WRITE was fractional: `price.set(1.5)` / `price.update(v => v + 0.5)` emitted an Int `@State`/`mutableStateOf(0)` receiving a Double (a loud native type error on both targets). `widenFloatSignals` now walks the whole component IR (a generic structural walk — no node-kind enumeration, no missable shapes) for `.set`/`.update` writes against Int-typed number signals; a float-inferring written value widens the DECLARED type to Double and an integer-literal initializer emits `0.0` (Kotlin's `mutableStateOf(0)` carries no annotation — the initializer IS the type there); runs to fixpoint (`b.set(1.5); a.set(b())` widens both). Int-written signals stay Int; a write the pass can't prove float keeps the loud native error (fail-safe, never silent truncation). Composes with the `Date.now()` lowering: `signal<number>(0)` + `start.set(Date.now())` — the stopwatch shape — widens once both land. **optional index `a?.[i]` (safe-index)** — the optional COMPUTED link was chain-bailed to the `""` fallback (a chained `find(...)?.tags?.[0] ?? "none"` even COMPILED with a semantically wrong value — always `""`). JS returns undefined out-of-bounds (and nil-propagates an optional receiver), so it now lowers to the guarded idioms: Swift `(a.indices.contains(i) ? a[i] : nil)` — both operands named twice so both must be re-readable (scalar literals now count) + the receiver non-optional; other Swift shapes emit the nil-propagating subscript + a NAMED warning (OOB traps, the warning says so). Kotlin `getOrNull(i)` composes on EVERY shape (single-eval — chained receivers need no guard; optional-link receivers get `?.getOrNull` via the syntactic `exprHasOptionalLink` check, since the type layer doesn't wrap optional-member results in a union). The optional form infers `element | undefined` so `?? fallback` collapses (#1957); a bare `a?.[0]` annotates `Int?`. `fn?.()` (optional call) now lowers too (see below). **Map/Set collection vocabulary** — `new Map/Set` were warn-dropped to the `""` sentinel, breaking the accumulator + dedup idioms. Now lowered end-to-end: `new Map<K,V>()` → `[K: V]()`/`mutableMapOf`, `new Set<T>()`/`new Set(arr)` → `Set<T>()`/`Set(arr)` · `mutableSetOf`/`.toMutableSet()`; `m.set(k,v)` → `m[k] = v` (the SIGNAL-set rewrite is now gated to ONE argument — a 2-arg `.set` is never a signal write); `m.get(k)` → `m[k]` (`V?` both targets — faithful to JS's `V | undefined`, infers the union so `?? fallback` collapses); `has`/`delete`/`add`/`clear`/`.size` map per target (Swift `[k] != nil`/`removeValue`/`insert`/`removeAll`/`.count`; Kotlin `containsKey`/`remove`/`add`/`clear`/`.size`). Swift collection LOCALS force `var` (subscript-assign + insert are mutating; the reassignment tracker only sees `=`). Bare `new Map()` (no generics) + other `new X()` keep NAMED warnings. SIBLING FIND (8th instance): the dedup idiom exposed the PLAIN 1-param multi-statement callback silently dropping its body (the block-body sentinel — the indexed path was fixed in #1954, the plain path never was): Swift now emits the block; Kotlin emits return-free blocks and NAMED-warns on return-bearing bodies (labeled-return call-site wiring is the tracked follow-up — previously a SILENT drop). **Kotlin labeled-return plain callbacks** — a bare `return` inside a Kotlin lambda is prohibited (it targets the enclosing function); the labeled `return@<method>` form is required and only the CALL SITE knows the emitted method name. The indexed (2-param) path has had this since #1954; the PLAIN (1-param) path never did — a multi-statement predicate (`filter(x => { if (cond) return false; return x > 0 })`) silently dropped its body. Now wired at the plain call sites — filter/map/forEach/flatMap/find/findLast (same-name labels) + some→`any` / every→`all` (their emitted Kotlin names) — via `emitKotlinPlainCallback`, reusing the indexed path's labeled-body machinery with a 1-param head; expression bodies + indexed callbacks unchanged. SIBLING FIND (9th): the forEach ACCUMULATE idiom (`let acc = 0; nums().forEach(x => { acc = acc + x })`) exposed the mutability tracker missing reassignments inside CALLBACK arrows (it walked statement bodies, never expression trees) — the outer `let acc` stayed immutable ("'val' cannot be reassigned"); a generic structural walk now finds every nested arrow's statements (over-marking → a harmless never-mutated-var warning). **the Swift optional-chain propagation bug** (idiom-sweep batch 3, + three companions): the member emit propagated `?.` down chains (`a?.b.c` → `a?.b?.c`) — correct for Kotlin (which REQUIRES it) but WRONG for Swift: after the first `?.` Swift auto-propagates, and a redundant `?.` on a chain-unwrapped NON-optional field is an ERROR — `find(...)?.name?.length ?? 0` (the master-detail field-length shape) was a SILENT fail, and the codified `p?.addr?.city` spec was itself broken, masked by an emit-shape-only assertion with NO Swift compile proof (the missing-rung lesson: every codified emit needs a compile proof on BOTH targets). Swift now emits `?.` only on the first optional link (genuinely-optional mid-chain fields keep it via the declared-union check); Kotlin unchanged. Companions: switch-in-computed now infers its case-return type (`findFirstReturnExpr` never entered switch/loop bodies → `Any`); `num.toString()` → Swift `String(x)`; a DESTRUCTURED callback param (`({name}) => …`) warns NAMED (was silently filtered → unbound names; the binding prelude is a tracked follow-up). **optional call `f?.()` (invoke-if-present)** — the last optional-chaining shape to lower (member `a?.b` and index `a?.[i]` already did). Invoking a function-typed prop/field only when non-nil — `props.onDone?.()`, `props.fmt?.(5)` — used to warn-fall-back (the "index/call" explicit-guard diagnostic); it now lowers faithfully: Swift `f?(args)` (the optional-function field type `(() -> Void)?` already parenthesizes, so `f?()` is valid) / Kotlin `f?.invoke(args)` (a nullable functional type is invoked via `?.invoke` — a bare `f()` is a type error). The callee is a MEMBER (a function-typed prop/field), so the Swift emit short-circuited in the generic member-call branch BEFORE the bare-identifier tail — that branch dropped the `?` (emitting `onDone()`, invoking a nil closure at runtime); fixed to mirror the tail's optional lowering. Kotlin routes both callee shapes through one tail (already correct — this locks the Swift parity). Handler + computed-value shapes proven by real `swiftc -typecheck` + `kotlinc`. Closes the optional-chaining class — no optional shape (member / index / call) warns anymore. **fractional/Double math** — `signal<number>(9.99)` now emits `var price: Double = 9.99`, not `Int`; **`**`/bitwise** operators; **`Math.*`** functions; **`?? ` optional-collapse inference** — the idiomatic optional-consumption shape `opt ?? fallback` (`nums().at(-1) ?? 0`, `.find(…) ?? def`, `data() ?? []`) now infers the NON-optional result type (`Int`, not `Int?`), so consuming it (`String(out())`, arithmetic, a typed position) no longer fails Swift's "value of optional type 'Int?' must be unwrapped". The bug was a JS `??` used on the two inferred types — but `inferType` never returns null, so it ALWAYS kept the LEFT's optional branch; the fix unwraps the left's optional (`unwrapOptionalType`) and falls back to the fallback's type. `.at()` itself already lowered — the SIBLING `?? ` inference was the real bug (root-caused from an `.at()` probe). **`Array.from` / `Array.isArray`** — `Array.from(x)` → Swift `Array(x)` / Kotlin `x.toList()` (shallow copy); `Array.from(x, fn)` → `x.map(fn)` (the map form, lowered via a shared `.map`-rewrite so the callback element-type inference is reused); `Array.isArray(x)` → the literal `true` (a typed source IS statically an array). Both had NO native `Array` member — the generic emit was uncompilable (`no member from` / `Element could not be inferred`, verified). The `Array.from({ length: n }, (_, i) => expr)` numeric-RANGE form NOW lowers → Swift `(0..<n).map { i in expr }` / Kotlin `(0 until n).map { i -> expr }` (index-map form). The always-`undefined` element param can't map to a native value, so a callback that REFERENCES it (guarded by `exprReferencesIdent`), the 1-arg `{ length: n }` form (no callback), and block-body callbacks stay a NAMED build-failing warning (never a silent drop); **`Math.*` computed RETURN-TYPE** — a computed RETURNING a `Math.*` call had no inference case, so it typed `Any` on Swift (`private var pageCount: Any { ceil(…) }`) and a downstream `String(pageCount())` / arithmetic / `page() < pageCount()` failed ("no exact matches in call to initializer" / "cannot convert 'Any' to 'Int'"). Now inferred by JS semantics: `ceil`/`floor`/`round`/`trunc` are INTEGER-VALUED (page counts / indices) → Int, and the Swift emit wraps the Double free-function result `Int(ceil(Double(x)))` so it stays an Int usable in `page < pageCount` and prints "4" not "4.0" (inferring Double — matching the old `ceil(Double(x))` emit — was a HALF-fix, `Int < Double` then failed); `sqrt`/`pow` + the trig/log/exp free functions → Double; `abs` preserves the arg's numeric type; `min`/`max` return the args' common type. `inferMathCall` (infer-type.ts) is the shared inference; Kotlin's `derivedStateOf` infers on its own (and allows Int↔Double comparison) so it needed no change — a realistic paginated DATA-TABLE now compiles end-to-end both targets. **`as` cast + typed-empty array** — TS type-operators in expression position (`x as T`, `x satisfies T`, `x!`) now PARSE (unwrap to the inner expression) instead of hitting the parser's `unsupportedExpr` fallback, which emitted the literal string `""` (so `[] as number[]` — the idiomatic typed-empty seed for a `.reduce` with an ARRAY accumulator — mis-emitted as `""`: Swift failed loudly, Kotlin FALSE-PASSED via `"" + listOf(x)` coercing to a String). An EMPTY array carries no element type, so `[] as T[]` threads the cast's element type onto the array IR → a typed-empty emit (`[Int]()` / `emptyList<Int>()`) + inference `[T]`, so an array-accumulator reduce (`reduce((a, b) => [...a, …], [] as T[])`) compiles + types correctly on both targets. **array-literal spreads** — `[...a, ...b]` / `[...a, 9]` / `[9, ...a]` / `[...a, 9, ...b]` (any spread count / position; merge-arrays + the add-to-list idiom) now lower to a parenthesised native concat — Swift `(a + b)` / `(a + [9])`, Kotlin `(a + b)` / `(a + listOf(9))`, with the `()` so a method on the literal binds to the whole concat (`[...a, ...b].map { … }` → `(a + b).map { … }`). Pre-fix only a single LEADING spread emitted, MULTI-spread wrapped the 2nd arg (`a + [b]` / `a + listOf(b)` → a type error), and nothing was parenthesised (`[...a, 9].length` → `a + [9].count`, binding `.count` to the tail); the add-to-list `set([...items(), x])` happened to work (single leading spread, bare arg) so the bug hid until a 2nd spread or a chained method; **negative-index `.slice`** — `arr.slice(-m)` (last m) / `arr.slice(0, -n)` (drop last n) now lower to the native count-from-the-end methods (Swift `suffix(m)` / `dropLast(n)`, Kotlin `takeLast(m)` / `dropLast(n)`); the existing front-counting slice (`dropFirst`/`prefix` · `drop`/`take`) explicitly bailed on a unary-minus arg so the raw `.slice(-1)` survived → "no member 'slice'". The COMBOS now lower too: `slice(s, -n)` (positive-literal start) → Swift `dropFirst(s).dropLast(n)` / Kotlin `drop(s).dropLast(n)`, and `slice(-m, -n)` → `suffix(m).dropLast(n)` / `takeLast(m).dropLast(n)` (the native ops clamp like JS, so no bounds guard is needed). A NON-literal (variable) start with a negative end can't be proven front-anchored, so it still falls through — an honest follow-up.) **2-param array-method callbacks** — `arr.map((el, idx) => …)` / `arr.forEach((el, idx) => …)` (the index form, ubiquitous for enumeration) lowered the bare 2-arg closure (`{ x, i in … }` / `{ x, i -> … }`) which both targets reject (Swift "expects 1 argument, but 2 were used"; Kotlin "cannot infer type parameter R"); now lowers to the index-aware native variant — Swift `enumerated().map { (idx, el) in … }` / `.forEach`, Kotlin `mapIndexed { idx, el -> … }` / `forEachIndexed`, both **index-FIRST** so the params bind swapped from JS's `(el, idx)`; 1-param callbacks fall through unchanged; **the array PREDICATE methods with a 2-param index callback** — `.filter`/`.some`/`.every`/`.findIndex` `((el, idx) => …)` — completing the family #1934 began: a 2-param arrow is still ONE argument, so the pre-existing `if (args.length === 1)` 1-arg branch fired first and emitted the bare 2-param closure both compilers reject ("expects 1 argument, but 2 were used" / Kotlin "argument type mismatch"); the shared `indexedArrayCallback` gate is now checked BEFORE the 1-arg branch and lowers to the index-aware native form — `.filter` → Swift `enumerated().filter{ (i,x) in … }.map{ $0.element }` / Kotlin `filterIndexed{ i,x -> … }`; `.some` → Swift `enumerated().contains(where:{ (i,x) in … })` / Kotlin `withIndex().any{ (i,x) -> … }`; `.every` → Swift `enumerated().allSatisfy{ (i,x) in … }` / Kotlin `withIndex().all{ (i,x) -> … }`; `.findIndex` → Swift `enumerated().first(where:{ (i,x) in … })?.offset ?? -1` / Kotlin `withIndex().firstOrNull{ (i,x) -> … }?.index ?: -1` (all index-FIRST, params swapped from JS, matching the map/forEach convention; 1-param forms unchanged); **a component-level value-const (`const pageSize = 2` / `const steps = ["a","b","c"]`) referenced from a COMPUTED or a HANDLER** (Swift-only — Kotlin's const `val`, `derivedStateOf` computed and handler lambdas share the Composable body). Two sub-gaps: (a) TYPE — value-consts were never seeded into the inference ctx, so a computed referencing one inferred `Any` and Swift emitted `private var x: Any { … }`, breaking a downstream `String(x())` ("no exact matches in call to initializer"); most visible for a FLOAT const (`const factor = 2.5`) where the binary otherwise types `Int` but the emit is `Double(…) * (2.5)` → "cannot convert Double to Int". Fixed by a persistent `valueConsts` map in `InferenceCtx` (populated in `buildInferenceCtx`, checked in `inferType`'s identifier case). (b) SCOPE — a value-const emits as a body-local `let` in the ViewBuilder, which a `private func` handler AND an inline handler closure both sit OUTSIDE (`if step < steps.length` → "cannot find 'steps' in scope"); fixed by inlining value-consts into handler bodies (the same inline the computed path already uses). A REASSIGNED binding (`let nextId = 1; nextId++`) is excluded from inlining (`collectMutatedComponentVars`) — substituting its initial value would emit the broken `(1) += 1` — so it stays body-local, read by name. A realistic WIZARD (array-const in a computed + two handlers) now compiles both targets. NOTE a realistic paginated DATA-TABLE additionally needs `Math.ceil(…)` to infer a numeric type instead of `Any` (a separate `Math.*`-return-type gap — deferred); **JS truthiness on an OPTIONAL value in a condition** — `const t = todos.find(…)` used as `t ? a : b` / `{t && <X/>}` / `<Show when={t}>` / `if (t)` / `while (t)`, AND the NEGATED `!t` form — now lowers to an explicit `t != nil` / `!t → t == nil` (Swift) and `t != null` / `!t → t == null` (Kotlin) at **every** condition site (the bare optional, and `!optional` itself, were rejected as a non-Bool condition — a clean-parse but uncompilable *silent* mis-emit). The `if`/`while` STATEMENT positions lower any optional condition — inline (`if (todos.find(…))`), component-level (`if (optionalComputed())`), AND **handler-LOCAL** (`const t = …find(…); if (t)`): a handler / function body's `const`/`let` types are now seeded into the infer ctx during statement emission (`seedHandlerLocals`, wired into all THREE statement-body emit paths — inline handlers, named `const onTap` arrow decls, AND computed bodies; the computed-body path was the last hole — a MULTI-computed app emits each computed against a SHARED infer ctx that retains the LAST computed's locals, so a `summary` computed's `const found = todos().find(...)` read as `unknown` and `found ?` stayed un-lowered). A companion fix lowers the find-then-field idiom `opt ? opt.prop : else` to optional-chaining on **BOTH** targets — Swift `(opt?.prop ?? else)`, Kotlin `(opt?.prop ?: else)` (`optionalMemberTernary`, matching any cond structurally-equal to the then-branch's member object — a bare identifier, a computed-READ `selected()`, or a member chain). Neither target narrows the optional in a ternary then-branch the JS way: Swift rejects `opt != nil ? opt.prop : …` ("value of optional type 'T?' must be unwrapped"); Kotlin smart-casts a bare-`val` local but NOT a `selected()` read (a `by remember { derivedStateOf }` DELEGATED property — "smart cast … impossible … delegated property"), the dominant master-detail shape (`const selected = computed(() => items().find(…))`). A third companion resolves the member-ternary's TYPE: member access on `selected()`'s `T | undefined` union missed the field lookup, so `detailQty = computed(() => selected() ? selected().qty : 0)` inferred `Any` and `String(detailQty())` failed ("no exact matches in call to initializer") — `unwrapOptionalType` unwraps the union to its non-nullish branch so the field type resolves (→ `Int`). With all of these, BOTH a **realistic TodoMVC-shape CRUD app** (`signal<Todo[]>`, draft / nextId, find-then-field `summary`, index-callback `labels`, add / toggle / remove handlers, Field / Button) AND a **realistic master-detail app** (a `selected` computed over `.find`, two computed-read detail-field ternaries, a `total` reduce, select / bump handlers) compile end-to-end through real `swiftc -typecheck` AND `kotlinc` (the first realistic multi-feature components proven on both targets). **The optional-truthiness class is now fully closed** — every condition site, both forms, all binding scopes. See the supported-surface tables below for the exact set.) The per-PR validation gate is `swiftc -parse` (syntax-only — it does **not** typecheck) + `kotlinc` against Compose **stubs**, so it cannot catch this class of type-level corruption; the full real-compiler build only runs for the example apps in the **advisory** `native-device` workflow. **Treat native PMTC as demo-quality** (the project self-rates it **66/100**): write components in the restricted declarative style, keep data-structure manipulation in pure-logic helpers, and verify on a real Simulator/Emulator before trusting native output.

## Architecture overview

Pyreon's multi-platform story is built on a **four-layer model**. Code in lower layers is reused unchanged across platforms; code in higher layers gets per-platform implementations behind a shared API.

```text
Layer 4: <NativeIOS> / <NativeAndroid> / <Web>  (escape hatches, opt-in)
Layer 3b: @pyreon/elements                       (web-only rich primitives)
Layer 3a: @pyreon/primitives                     (canonical multi-platform primitives)
Layer 2: useStorage / useRouter / useFetch       (ServiceBackend pattern)
Layer 1: useDebounce / useToggle / ...           (pure-logic hooks, 100% shared)
Layer 0: signal / computed / effect              (reactive core, 100% shared)
```

### Layer 0 — Reactive core (100% shared)

`signal()`, `computed()`, `effect()`, `batch()`, `onCleanup()` — these are the same on every platform. PMTC maps them to `@State` / `@Observable` on iOS and `mutableStateOf` / `derivedStateOf` on Android. On web they're native Pyreon.

### Layer 1 — Pure-logic hooks (100% shared)

Custom hooks composed entirely of signals + business logic. `useDebounce`, `useToggle`, `usePrevious`, `useControllableState` — no DOM, no platform APIs. They work identically on every target.

### Layer 2 — Platform-abstracted services

Services with a shared API surface + per-platform implementation. Established by `@pyreon/storage`:

```ts
// Same code on all three platforms
import { useStorage } from '@pyreon/storage'
const todos = useStorage<Todo[]>('todos', [])
```

Behind the scenes:

- **Web**: backed by `localStorage` via `@pyreon/storage`
- **iOS**: backed by UserDefaults via `@PyreonAppStorage` (from `@pyreon/native-runtime-swift`)
- **Android**: backed by an in-memory or DataStore backend via `rememberPyreonStorage` (from `@pyreon/native-runtime-kotlin`)

The PMTC compiler rewrites `useStorage<T>('key', default)` to the platform-native one-liner on iOS / Android. On web it stays as the standard `@pyreon/storage` call.

Same pattern extends to: `@pyreon/router` (iOS NavigationStack + Android NavHost runtimes are Phase C), network fetching, permissions, lifecycle hooks.

### Layer 3 — UI primitives (the architectural fork)

Two separate primitive layers serve different needs:

#### Layer 3a: `@pyreon/primitives` — canonical multi-platform

The cross-platform vocabulary. 15 semantic primitives designed for **fundamentally the easiest DX** across all three targets:

| Category | Primitives |
|----------|-----------|
| Layout | `<Stack>`, `<Inline>`, `<Layer>`, `<Scroll>`, `<Spacer>` |
| Content | `<Text>`, `<Heading>`, `<Image>`, `<Icon>` |
| Interaction | `<Button>`, `<Press>`, `<Link>` |
| Input | `<Field>`, `<Toggle>`, `<Modal>` |
| Control flow | `<For>`, `<Show>`, `<Match>`, `<Switch>`, `<Suspense>`, `<ErrorBoundary>`, `<Dynamic>`, `<Portal>` (existing, unchanged) |

Designed for cross-platform from scratch. Semantic names (`<Stack>` not `<View>` / `<VStack>` / `<div>`). One canonical event name per concept (`onPress` everywhere). Tokens-first styling (`padding={4}` resolves via theme).

#### Layer 3b: `@pyreon/elements` — web-only rich

The existing web primitive layer (`Element`, `Text`, `List`, `Overlay`, `Portal`). Built on rocketstyle + styler + unistyle — rich responsive props, extendCss, full DOM-coupled styling. **Stays as-is. Web-only.**

Cross-platform apps use `@pyreon/primitives`. Web-only apps that need rocketstyle's rich features use `@pyreon/elements`. The two coexist — no naming collision because imports are explicit.

### Layer 4 — Platform escape hatches

When the canonical vocabulary doesn't reach (Apple Pencil gestures, AR scenes, Android intents, browser-specific APIs), drop into platform-specific code via explicit wrappers:

```tsx
<NativeIOS>
  {/* iOS-only SwiftUI JSX — Compose + web targets ignore this */}
</NativeIOS>
```

## Canonical primitive vocabulary (Layer 3a)

### Layout

| Primitive | Web | iOS | Android |
|-----------|-----|-----|---------|
| `<Stack direction?="column"\|"row" gap? align? justify?>` | `<div style="display:flex">` | `VStack` / `HStack` | `Column` / `Row` |
| `<Inline gap?>` (sugar for `<Stack direction="row">`) | flex row | `HStack` | `Row` |
| `<Layer>` (z-stack) | `position:relative` + abs | `ZStack` | `Box` |
| `<Scroll axis?>` | `overflow:auto` | `ScrollView` | `Column(verticalScroll)` |
| `<Spacer />` | `flex:1` | `Spacer()` | `Spacer(weight=1)` |

### Content

| Primitive | Web | iOS | Android |
|-----------|-----|-----|---------|
| `<Text>` | `<span>` | `Text` | `Text` |
| `<Heading level={1\|...6}>` | `<h1>`..`<h6>` | `Text(.font(...))` | `Text(style=...)` |
| `<Image src alt fit?>` | `<img>` | `Image` / `AsyncImage` | `AsyncImage` |
| `<Icon name>` | `<svg>` | `Image(systemName:)` | `Icon` |

### Interaction

| Primitive | Web | iOS | Android |
|-----------|-----|-----|---------|
| `<Button onPress>` (styled CTA) | `<button>` | `Button` | `Button` |
| `<Press onPress>` (un-styled wrapper) | `<div onClick role=button>` | `Button { }` no chrome | `Box(clickable)` |
| `<Link to external?>` (router-agnostic) | `<a href>` + SPA-nav when `init({ navigate })` is wired | `NavigationLink` | `Box(clickable + navigate)` |

### Input

| Primitive | Web | iOS | Android |
|-----------|-----|-----|---------|
| `<Field value onChangeText kind?>` | `<input>` | `TextField` / `SecureField` | `TextField` |
| `<Toggle value onChange>` | `<input type=checkbox>` | `Toggle` | `Switch` |
| `<Modal open onClose>` | `<dialog>` | `.sheet(isPresented:)` | `Dialog` |

## Event model

One canonical event name per concept; the compiler maps it to the platform-native handler:

| Concept | Pyreon canonical | Web | iOS | Android |
|---------|------------------|-----|-----|---------|
| Tap | `onPress` | `onClick` | `action:` | `onClick =` |
| Long press | `onLongPress` | polyfill | `.onLongPressGesture` | `combinedClickable(onLongClick)` |
| Text change | `onChangeText` | `onInput` | text binding | `onValueChange` |
| Submit | `onSubmit` | form `onSubmit` | `.onSubmit { }` | `keyboardActions onDone` |
| Focus / blur | `onFocus` / `onBlur` | same | `.focused()` | `onFocusChanged` |
| Appear / disappear | `onAppear` / `onDisappear` | `IntersectionObserver` | `.onAppear` | `LaunchedEffect` |

Hover events are deferred (mobile platforms don't have hover).

Handlers may be **multi-statement** — `onPress={() => { a.set(1); b.set(2) }}` emits every statement (including `if` blocks) into the native closure on both targets. (Earlier the compiler silently kept only the first statement.) A single-expression handler (`onPress={() => a.set(1)}`) keeps the compact one-line form.

## Style system (v1)

**Tokens-first.** No raw pixels in cross-platform code.

| Prop | Type | Resolves to |
|------|------|-------------|
| `padding`, `margin`, `gap` | `number` (theme.space index) OR `"sm" \| "md" \| "lg"` | Web: inline `style` px; iOS: `.padding()`; Android: `Modifier.padding()` |
| `color` | `"text" \| "surface" \| "primary" \| ...` (theme key) | Per-platform color resolution |
| `background` | theme key | Per-platform background |
| `align` | `"start" \| "center" \| "end"` | Per-platform alignment |
| `justify` | `"start" \| "center" \| "end" \| "between"` | Per-platform main-axis |
| `radius` | `"none" \| "sm" \| "md" \| "lg" \| "full"` | Per-platform corner radius |

**No responsive props in v1.** Web has media queries, iOS has size classes, Android has configuration changes — unifying these as per-primitive responsive *props* is a multi-week design problem deferred to a future arc. Apps that need responsive web layouts use `@pyreon/elements` directly (it has full responsive prop support). The one adaptive primitive that HAS landed is the `useSizeClass()` READ hook (M2.2) — a single `'compact' | 'regular'` signal that lowers to iOS `@Environment(\.horizontalSizeClass)` / Android `LocalConfiguration` width / web `matchMedia` — so shared code can branch on width today; the size-class-driven *layout* primitive (Stack↔Inline) is the M2.2b follow-up.

**No animation primitives in v1.** Same reasoning.

**Escape hatch.** `<NativeIOS style={...}>` / `<Web className="...">` for per-platform overrides when the canonical style system doesn't reach.

## Per-platform import resolution

The DX-critical question: how does `import { Stack } from '@pyreon/primitives'` resolve on each target?

- **Web**: `@pyreon/primitives` is a real npm package with real implementations. `Stack` is a `ComponentFn` that renders DOM. Standard module resolution.
- **iOS / Android (via PMTC)**: The PMTC compiler INTERCEPTS JSX with `<Stack>` etc. at compile time and emits platform-native code BEFORE the runtime is involved. The import is type-anchor only — the JSX never calls into `@pyreon/primitives`'s runtime.

The same source file works on all three targets. The compiler-side handling for each target is different but the developer doesn't see it.

## Migration

`@pyreon/primitives` is a NEW package. Adding it breaks nothing.

Existing PMTC source using SwiftUI-flavored names (`<VStack>`, `<HStack>`, `<TextField>`) continues to work via the existing per-target emit. The TodoMVC migration to canonical vocabulary is Phase E — a deliberate, additive port. After migration is proven, deprecation warnings land on SwiftUI-flavored tags. Removal happens in a major-version bump LATER.

## Current state + roadmap

The 5-phase implementation roadmap:

Foundation rollout (A–E):

| Phase | Scope | Status |
|-------|-------|--------|
| **A** | Architectural foundation: canonical primitives package + web runtimes | ✅ Done — **all 15** primitives have web DOM runtimes |
| **B** | PMTC compiler emit for iOS + Android (extends `canonical-primitives.ts` table) | ✅ iOS (Swift) **15/15**; Android (Compose) emit completing via the P2.2 series |
| **C** | `@pyreon/native-router-{swift,kotlin}` runtime adapters + routes emit (path + component) | ✅ Done |
| **D** | Web target for PMTC + `examples/native-todomvc-web/` consuming the shared source | ✅ Done |
| **E** | TodoMVC migration to canonical vocab — closes the cross-platform contract | ✅ Done |

ONE `TodoApp.tsx` source → THREE example apps (web, iOS, Android), all typecheck-clean.

### Beyond the foundation — toward production-grade

The vocabulary is multiplatform; the road to shipping real production apps continues:

| Step | Scope | Status |
|------|-------|--------|
| Real-device CI | Compile the full apps on real Xcode/Gradle (`native-device` workflow), then boot Simulator/Emulator + assert render | 🟡 build gate + iOS XCUITest + Android Compose-instrumented-test landed (opt-in `native-device` label); promote to required once green across nightly runs |
| Router matching | **redirects**, `:param*` splat, `:param?` optional, `*`/`(.*)` whole-route **wildcard 404**, leading/trailing-slash tolerance | ✅ landed (see [Native routing](#native-routing)) |
| Router parity (advanced) | per-route **guards** (`beforeEnter`), **nested routes** (layout-wrapping), `useParams` **destructuring**, loader-data runtime (`useLoaderData`), per-route **loader auto-emit**, **global** `beforeEach`/`afterEach` guards, **throw-redirect** pattern | ✅ guards, nested routes, `useParams` destructure, `loaderData`/`useLoaderData` runtime, **global guards** (#1108), **`router.redirect()` re-entry-safe throw-pattern** (#1109), and **per-route `loader` auto-emit** (v1 — zero-param expression-body loaders; see note) all landed |
| Data + forms | `useFetch` / `useForm` / `usePermissions` / `useOnline` / `useClipboard` / `useColorScheme` as per-service native runtime ports (runtime + emit) | ✅ six hooks landed — **`useForm` v2 is device-proven** (validators + runtime Field bindings + submit gating; the tasks login's error-path smoke); **`useFetch` is device-proven end-to-end** (the tasks Quotes screen fetches + decodes + renders a real HTTP fixture on the CI Simulator/Emulator; web runs the same call through `@pyreon/hooks`); `usePermissions` incl. web-parity `can.not`; `useOnline`; `useClipboard`; **`useColorScheme` emit-only (no runtime port) but now DEVICE-PROVEN (dark mode, M2.5 — the counter renders `Theme: {colorScheme}` and its iOS XCUITest asserts "Theme: light"/"Theme: dark" track the live Simulator appearance)**. `useValidation` planned |
| Compiler diagnostics | Surface silent-drop shapes as parser warnings instead of failing-silent at runtime | ✅ Round-1 (#1094 — `Icon`/`Image`/`Link` missing required props) + Round-2 (#1099 — `Press` without `onPress`, `Link prefetch={…}` on native, `Stack/Inline/Layer align="<typo>"`) landed; both routes ship as `result.warnings`, emit shape unchanged |
| Lifecycle | `<Transition>` + `<TransitionGroup>` (landed); `<Suspense>` / `<ErrorBoundary>` (real semantics, Phase 2); `<KeepAlive>` | ✅ transitions + **real `<Suspense>` / `<ErrorBoundary>`** — both compile to an INLINE conditional in the component body (Swift `Group { if <pending/errored> { fallback } else { children } }`, Kotlin `if (…) { … } else { … }`) reading every `useFetch` container's `isPending` / `error` in that component: Suspense shows its fallback until the fetched data settles, ErrorBoundary swaps to its fallback when a container rejects (the realistic native error surface — SwiftUI/Compose have no try/catch around view construction). The read is inline (not passed to a wrapper) so SwiftUI Observation / Compose recomposition tracks it; on iOS the body wraps in a concrete `ZStack` so the fetch `.task` attaches to a stable host (a transparent `Group` makes SwiftUI cancel+restart the task on every flip → the fetch never settles). Device-proven (the tasks Lifecycle screen: good-fetch content + a deliberately-failing fetch's ErrorBoundary fallback both render on a real Simulator). `<KeepAlive>` stays a graceful pass-through (cache semantics inert; the hardest of the three). |
| DX | `pyreon create-multiplatform` scaffold (✅), asset pipeline | 🟡 scaffold landed **and produces buildable, launchable native apps end-to-end** — the four `@pyreon/native-*` runtimes wire in as SPM (iOS) / Gradle `srcDir` (Android) deps so the emitted `import PyreonRuntime` / `com.pyreon.runtime.*` resolve; proven scaffold → emit → `gradle assembleDebug` / `xcodebuild` → install → **launch (RUNNING)** on both an Android emulator and an iOS Simulator (#1570, which fixed eight project-wiring bugs a real local build surfaced that compile-only validation could not — web-entry-skip, `--kotlin-package`, serialization-plugin version, `ComponentActivity`, SPM `../` paths, source-path nesting, `App.swift` collision, `SwiftUI.App` shadow). **image asset pipeline landed** (`pyreon-native assets` — the shared `assets/` dir materializes to `Assets.xcassets` / `res/drawable-*` density buckets / `public/assets`, and `<Image src="name.png">` dispatches bundled-vs-remote per target; device-proven via the tasks branded header); SF-Symbols/Material icon mapping + fonts are the next arc |

> **Loader auto-emit — v1 landed (zero-param, expression-body).** A
> route's `loader: () => <expr>` now compiles to a runtime
> `PyreonRouteLoader` host wrapping the route's component: its `.task`
> (SwiftUI) / `LaunchedEffect` (Compose) fires the loader ONCE on the
> route's appear and stores the result via `router.setLoaderData(<active
> path>, …)`, where the already-shipped `useLoaderData<T>()` reads it
> (keyed by the runtime active path, so it matches for both literal and
> `:param` routes; the home route keys by its literal path = `currentPath`
> at launch). The store is guarded (`loaderData[path] == nil`) so
> re-renders never re-run it. Realistic native loader bodies are **signal
> / store reads** (`() => globalCache()`) and **sync expressions**
> (`() => buildInitialData()`); both emit correctly.
>
> **Still deferred** (each leaves `loader` undefined + WARNS, so the route
> renders with no loader rather than mis-emitting): a **param-using**
> loader (`(ctx) => fetchUser(ctx.params.id)` — `ctx` has no value source
> in the load closure yet), a **block-body** loader (`() => { … }` — needs
> statement emit), and a truly-**async** body (`async () => await
> fetch(…)` — no `await` lowering / typed-decode generic, the `useFetch<T>`
> territory). `ctx.params` threading + async-loader decode are the next
> arc; until then, fetch-style loaders populate `loaderData` from native
> code (or via a `useFetch` container) as before.

## Production capability matrix (weighted, rung-labeled)

**This table is the denominator for every "N% of usages" claim.** Real
mobile/tablet apps decompose into the weighted usage categories below
(weights = editorial judgment of a typical app's surface, documented so
they can be argued with). Each row states its **verification rung** —
**R1** emit · **R2** `swiftc`/`kotlinc` typecheck · **R3** unit/spec ·
**R4** local simulator/emulator build+run · **R5** the nightly device
gate (XCUITest + Compose `connectedCheck`) — and the **fraction of the
category with an ASSERTED behavior at R4+** (exercised-but-never-asserted
counts as 0; strictness is the point). Coverage numbers are recomputed
whenever a row changes; do not edit the totals without recomputing.

| Category | Weight | R4+ fraction | Rung + evidence |
| --- | --- | --- | --- |
| Core UI & layout (15 primitives) | 10 | 0.8 | R5 — Stack/Text/Button/Field/Press/List/Image/Icon asserted across the 4 device apps; Modal/Toggle/Scroll/Link not individually asserted |
| Lists & keyed rendering | 8 | 0.7 | R5 — todomvc list mutations asserted; 10k-row perf unmeasured |
| Navigation & routing | 8 | 0.8 | R5 — nav, typed params, guards, loaders asserted (router-demo); deep links absent |
| State (signals/computed/stores) | 9 | 1.0 | R5 — counter increment + store mutation asserted both platforms; **`createMachine` state transition device-asserted (M2.6)** — the counter's Toggle button drives an `off`→`on` transition that re-renders on both platforms (iOS `PyreonMachine` is `@Observable`, Compose `mutableStateOf`), proving a Tier-2 state machine actually transitions + reacts on-device, not just compiles. Row already at 1.0 (state machines are a state construct), so this deepens the evidence without moving the fraction |
| Forms & validation | 6 | 0.5 | R5 partial — useForm v2 device-proven (validators, bindings, submit gating); arrays/dynamic fields absent |
| Networking (fetch/ws/http) | 8 | 0.5 | fetch R5 (success + error path asserted); websocket/http-verbs R2 |
| Storage (kv/secure/db) | 7 | 0.3 | kv persistence ASSERTED (M1.2a): iOS terminate+relaunch (R4, local Simulator pass) + Android activity-recreation (proven by the PR device run / nightly); secure-storage + database still R2 |
| Auth | 5 | 0.3 | gate/login flow R5; real IdP token flow R1–R2 |
| Platform APIs (haptics/share/link/notifs/camera/biometrics/files/deep links/lifecycle) | 10 | 0.6 | clipboard/geolocation/push/payments/permissions/**haptics**/**share**/**link**/**notifs** exist at R2+. **share** (`useShare()`, M3.2) + **link** (`useLinking()`, M3.2b) each reach a **BEHAVIORAL R4** (XCUITest asserts the share sheet appears / the app leaves the foreground on `UIApplication.shared.open`). **haptics** (`useHaptics()`, M3.1) + **notifs** (`useNotifications()`, M3.3 — LOCAL notifications, iOS UNUserNotificationCenter / Android NotificationManager+channel+POST_NOTIFICATIONS) each reach a **NON-BEHAVIORAL R4** (the tap fires the call without crashing; haptics have no observable UI on the Simulator, and a notification's permission-prompt + auto-dismissing banner make a reliable springboard assert infeasible — so the honest ceiling is build+run+tap-no-crash). Android: `Intent.createChooser(ACTION_SEND)` / `Intent.ACTION_VIEW` / `NotificationManagerCompat`. **biometrics** (`useBiometrics()`, M3.5) reaches a **BEHAVIORAL R4 on the deterministic path** — the counter's Unlock button awaits `bio.authenticate(...)` inside an `async` handler that PMTC wraps in a native `Task`/coroutine scope (the M4.5 async-lowering, the FIRST async-result service); on an unenrolled Simulator/emulator the gate resolves false with NO prompt (`canEvaluatePolicy` guard), so the observable outcome flips `Lock: idle` → `Lock: denied` (iOS XCUITest + Android Compose test assert it), proving the async scope RUNS on-device + the post-`await` re-render fires — but the biometric SUCCESS path (enrolled → unlocked) and the Android real `BiometricPrompt`/`FragmentActivity` runtime are follow-ups (the Kotlin v1 scaffold resolves false). **camera/photo-picker** (`useImagePicker()`, M3.4) reaches a **BEHAVIORAL R4 on iOS** — the counter's Pick Photo button awaits `picker.pick()` in an `async` handler (the second async-result service, riding the same M4.5 lowering); the XCUITest taps it, asserts the system `PHPickerViewController` PRESENTS, dismisses it, and asserts `Photo: idle` → `Photo: cancelled`, proving the picker presented AND its async result flowed back across the dismissal into a re-render. Needs NO photo-library permission on either platform (both system pickers run out of process). The Android emit is REAL, not a scaffold (`rememberLauncherForActivityResult` + `PickVisualMedia` + a `CompletableDeferred` callback→suspend bridge), but its device test asserts **registration + render only** — `PickVisualMedia` launches a separate system activity the Compose test framework cannot drive or dismiss, so the pick ROUND TRIP is iOS-proven only. Picking a real asset (vs cancelling) is not device-asserted on either platform. files/deep-links/lifecycle ABSENT |
| Animations & transitions | 6 | 0.3 | **`<Transition show>` device-proven (M2.7)** — the counter's Toggle Box flips a signal and the animated child ("Animated Box") shows/hides through the platform animation path (iOS `.transition(.opacity)` on an `if show` gate + `.animation(.default, value:)` on a stable ZStack; Android `AnimatedVisibility(visible = show)`); the device gate asserts it disappears then reappears (`waitForNonExistence` / `assertDoesNotExist`), bisect-verified. BEHAVIORAL on the show/hide — the fade TIMING itself is not asserted (an opacity curve isn't queryable). **Plus `<TransitionGroup>` (animated keyed list) device-proven (M2.8)** — todomvc wraps its todo `<For>` in `<TransitionGroup>`, lowered to an animated list (iOS `VStack { ForEach }.animation(.default, value: list.count)`; Android `Column(Modifier.animateContentSize())`); the device gate adds a todo (a row ENTERs the animated list) then removes it (LEAVEs). This ALSO fixed a real emit bug the device gate caught: the Swift emit drove `.animation` off the whole list, which is uncompilable (a PMTC struct isn't `Equatable`) — fixed to drive off `.count` (Equatable, changes on enter/leave). Like the show/hide: behavioral on the enter/leave + compile-load-bearing, NOT on the animation timing. Still absent: configurable duration/easing, enter≠leave, spring/keyframe, gesture-driven, shared-element + reorder/layout animations |
| Gestures | 4 | 0.6 | tap R5; **long-press** `<Press onLongPress>` R4 (M2.3 — counter reset via a simultaneous LongPressGesture, iOS Simulator pass; Android `combinedClickable(onLongClick)` proven by the device run); swipe/drag absent |
| Adaptive / tablet layout | 5 | 0.4 | **`useSizeClass()` READ (M2.2)** + **adaptive LAYOUT (M2.2b)**. The size-class READ is a BEHAVIORAL R4 (counter XCUITest asserts `Size: compact` on iPhone, `Size: regular` on iPad — reflects the REAL environment). The size-class-driven **Stack↔Inline** switch now works: a view-branch ternary (`sizeClass() === 'regular' ? <Inline> : <Stack>`) lowered to `? :` was INVALID Swift (ViewBuilder rejects a ternary between different view types), now lowers to `if cond { HStack } else { VStack }` (`swiftc -typecheck`-proven FAIL→PASS; Kotlin already emitted if/else). Device-proven: the counter carries an adaptive Stack↔Inline and its iOS XCUITest COMPILES + renders the compact branch (a pre-fix `? :` emit would fail `xcodebuild`). iOS `@Environment(\.horizontalSizeClass)` / Android `LocalConfiguration.screenWidthDp` / web `matchMedia`. Full responsive PROPS + tablet-optimized components still absent |
| Media (image display/picker/AV) | 4 | 0.25 | bundled image display R5 (tasks branded header); remote image R2; picker/AV absent |
| Accessibility | 3 | 0.15 | **`accessibilityLabel` DEVICE-PROVEN (iOS)** — the counter's XCUITest asserts a labelled element is queryable in the REAL accessibility tree by its LABEL ("A11y status ready"), NOT by its visible glyph "●", so `.accessibilityLabel` genuinely overrode the accessible name in the live tree (bisect-verified: strip the prop → the query fails). The rest stays R2/emit-locked: `accessibilityHidden` (XCUITest string queries don't reliably reflect it — tooling limitation, not an emit gap), roles/focus-order/live-announcements, and the Android side (not device-asserted here) |
| i18n | 3 | 0.3 | **`createI18n` translation DEVICE-PROVEN (M2.4)** — the counter renders `<Text>Greeting: {i18n.t('hello')}</Text>` with `createI18n({ locale: 'de', … })`; its iOS XCUITest asserts the render tree shows the CONFIGURED-locale value "Greeting: Hallo!" (NOT the raw key "hello", NOT the English "Hello!"), so `PyreonI18n.t` genuinely resolved `messages["de"]["hello"]` at runtime AND honored the configured locale (bisect-verified: flip `locale` to `'en'` → the render becomes "Hello!" and the query fails with "did not look up messages['de']['hello']"). Behavioral R4 on iOS (local Simulator pass); the Android half asserts the same node in Compose (`onNodeWithText("Greeting: Hallo!")`, CI-gated). Single-arg `t(key)` + locale selection are the device-proven core; interpolation (`t(key, { name })`), plurals, `setLocale` writes, `<Trans>`, and async namespaces stay R2 |
| Offline / sync | 3 | 0.0 | `@pyreon/sync` web-only; native db offline-first R2 |
| Maps / geolocation | 3 | 0.0 | R2 runtimes; no device test |
| Payments | 2 | 0.0 | R2 runtime; no device test |
| Background / push | 3 | 0.0 | R2 runtime; manual `.start()`; no device test |

**Weighted totals (2026-07-08 baseline; M2.3 + M3.1 + M3.2 + M3.2b + M3.3 + M2.2 + a11y-label + M2.2b + M2.4-i18n + M2.5-colorScheme + M2.6-machine + M2.7-animations + M2.8-transitiongroup + M3.5-biometrics applied):** device-proven (R4+) coverage
**≈ 51%** (54.15 / 107 — the Platform-APIs row's +1.0 each for haptics/share/link/notifs, +1.0 for `useSizeClass()` (M2.2), +0.45 for the `accessibilityLabel` device assertion, +1.0 for the adaptive Stack↔Inline layout (M2.2b), +0.9 for the `createI18n` translation device assertion (M2.4), +1.2 for the `<Transition show>` animation device assertion (M2.7), +0.6 for the `<TransitionGroup>` animated-list device assertion (M2.8), plus **+1.0 for the `useBiometrics()` async-lowering device assertion (M3.5)** (the Platform-APIs row moved 0.4 → 0.5 as the M4.5 `await hook.method()` lowering — the keystone for the whole async-platform-API tier — was proven to RUN on-device, not just compile, via a biometric gate whose deterministic denied path flips an observable text; the biometric SUCCESS path + Android real `BiometricPrompt` stay follow-ups) and **+1.0 for the `useImagePicker()` device assertion (M3.4)**: the row moves 0.5 → 0.6 as the first CAMERA/photo-library capability lands with a behavioural iOS round trip (present → cancel → re-render) and a real — not scaffolded — Android launcher emit, leaving the pick-a-real-asset path and the Android round trip as disclosed follow-ups. `useColorScheme` (M2.5) + `createMachine` (M2.6) landed device-proofs that deepened already-recorded rows so neither moved the fraction); compile-proven (R2+) upper bound **≈ 74%** —
i.e. roughly three-quarters of the weighted surface already *exists and
typechecks*, but only about a third is *proven to behave* on a device.
**The production goal is 70–90% at R4+**; the gap between the two
numbers is, precisely, the roadmap: assert what exists (storage, auth,
services), then build what doesn't (platform APIs, animations, adaptive
layout, gestures beyond tap). The self-rating moves only on device
evidence — this table is where that evidence is ledgered.

### Per-hook device-behavior audit (M1.2)

The service-hook layer at per-hook granularity — same rung vocabulary,
same strictness (a hook that *runs* inside a green device test but has
no assertion on its behavior earns nothing). "In device app" names which
of the four nightly-built apps (todomvc / counter / router-demo / tasks)
uses the hook at all.

| Hook | In device app | Behavior asserted | Rung |
| --- | --- | --- | --- |
| `useFetch` | tasks | ✅ success (`lc-quote`) + error (`lc-error`) render | **R5** |
| `useForm` | tasks | ✅ validators, field bindings, submit gating (login error path) | **R5** |
| `useParams` / router nav + guards | router-demo | ✅ nav, typed params, auth gate | **R5** |
| `useStorage` | todomvc | ✅ persistence: `test_todosPersistAcrossRelaunch` (iOS, genuine terminate+relaunch) + `todosPersistAcrossActivityRecreation` (Android, activity recreation — honest scope: not full process death) | **R4→R5** |
| `useLoaderData` (loader auto-emit) | — | ❌ | R2 |
| `useAuth` | — (the tasks "login" is `useForm` + a router guard, NOT this hook) | ❌ | R2 |
| `useDatabase` | — | ❌ | R2 |
| `useSecureStorage` | — | ❌ | R2 |
| `useWebSocket` | — | ❌ | R2 |
| `useGeolocation` | — | ❌ (manual `.start()` on Kotlin) | R2 |
| `useMap` | — | ❌ | R2 |
| `usePush` | — | ❌ (manual `.start()`) | R2 |
| `usePayments` | — | ❌ (manual `.start()`) | R2 |
| `usePermissions` | — | ❌ (unit-tested; no device use) | R2–R3 |
| `useClipboard` | — | ❌ | R2 |
| `useOnline` | — | ❌ (unit-tested emit + swiftc/kotlinc compile-proof of the shared `net()` accessor; no device use) | R2–R3 |
| `useAppState` | — | ❌ (unit-tested emit + swiftc/kotlinc compile-proof of the shared `state()` accessor + runtime state-machine tests; no device use) | R2–R3 |
| `useColorScheme` | counter | ✅ (M2.5) — `Text("Theme: \(colorScheme)")` reads `@Environment(\.colorScheme)`; the counter XCUITest asserts "Theme: light" under the default Simulator appearance and "Theme: dark" under `simctl ui appearance dark` (proven locally), so the read reflects the LIVE system appearance, not a constant (a constant would render the same string in both). Still emit-only (no runtime port); Android asserts the same node in Compose (`isSystemInDarkTheme()`, CI-gated) | R4 (iOS local + Android CI) |

**Assertion queue** (the follow-up PR order; each moves a row to R5 and
re-scores the matrix): 1. `useStorage` persistence (todomvc already uses
it — terminate + relaunch + assert todos survive; zero new app code),
2. `useDatabase`, 3. `useWebSocket`, 4. `useAuth`, 5. `useClipboard`.
The three manual-`.start()` hooks (geolocation/push/payments) are gated
on M3.9 auto-start parity first.

**M2.3 — gestures (long-press) SHIPPED.** `<Press onLongPress={fn}>` now
lowers on native (the type + web 500ms-polyfill already existed; only the
native emit was missing). **Swift uses a SIMULTANEOUS `LongPressGesture`,
not `.onLongPressGesture`** — a bare long-press modifier on a `Button`
does NOT fire (the button's tap recognizer swallows it; found on a real
Simulator, invisible to `swiftc`). Android uses `combinedClickable(
onClick, onLongClick)`. Device-proven: `examples/native-counter-ios`'s
XCUITest holds a `<Press>` reset zone >=0.5s and asserts the counter
resets (R4 local pass); the Android `longClick()` sibling is proven by
the device run. First gesture beyond tap. Deferred: `onSwipe` / drag
(M2.3b).

## Native routing

`createRouter({ routes })` compiles to native dispatch — SwiftUI
`NavigationStack` + `.navigationDestination(for:)` on iOS, a Compose
`when (router.currentPath)` block on Android. One route table, both targets.

```tsx
const router = createRouter({
  routes: [
    { path: '/',            component: Home },
    { path: '/users/:id',   component: User },          // path param
    { path: '/files/:rest*', component: Files },         // splat / catch-all
    { path: '/old',         redirect: '/users/1' },      // redirect (alias)
    { path: '/admin',       component: Admin, beforeEnter: () => isAuthed() }, // guard
    { path: '/app',         component: AppLayout, children: [   // nested layout
      { path: 'dashboard',  component: Dashboard },
      { path: 'settings',   component: Settings },
    ] },
    { path: '*',            component: NotFound },        // wildcard 404
  ],
  beforeEach: [requireAuth],                              // global guards run before every nav
  afterEach: [logAnalytics],                              // global hooks fire after every nav
})
return <RouterProvider router={router}><RouterView /></RouterProvider>
```

Inside a route component, read path params via destructuring:

```tsx
function User() {
  const { id } = useParams<{ id: string }>()   // → id reads the active route's param
  return <Text>{id}</Text>
}
```

**Path matching** (mirrors `@pyreon/router`'s `match.ts`, verified by the
native router runtime's own `swift test` / kotlinc smoke):

| Pattern | Matches | Captures |
|---------|---------|----------|
| `/users/:id` | `/users/42` | `id = "42"` |
| `/blog/:rest*` (splat) | `/blog/a/b/c` (one-or-more tail) | `rest = "a/b/c"` |
| `/users/:id?` (optional) | `/users` **and** `/users/42` | `id` absent or set |
| `*` / `(.*)` (wildcard) | any unmatched path | — (renders the 404 component) |

Leading/trailing slashes are tolerated (`/about/` matches `/about`).

**Redirects** are compile-time aliases: `{ path: '/old', redirect: '/new' }`
makes the `/old` dispatch branch render `/new`'s component directly (no
runtime push). Chains (`/a → /b → /c`) resolve transitively; cyclic /
dangling redirects are dropped to the no-match fallback.

**Wildcard 404**: a `*` / `(.*)` route's component becomes the dispatch
**else-branch** — the canonical not-found page for any unmatched path.

**Guards** (`beforeEnter: () => <boolExpr>`) wrap the matched component in
an inline conditional checked at navigation time; on failure the branch
renders the wildcard catch-all (if present) or a denial placeholder.

**Nested routes** (`children: [...]`) compile to a flattened full-path
dispatch where each leaf is wrapped in its layout chain via a **content
slot**: a layout component (a route parent) is emitted with a
`@ViewBuilder content` closure (SwiftUI) / `content: @Composable () -> Unit`
(Compose), and its `<RouterView />` becomes that slot. So `/app/dashboard`
renders `AppLayout { Dashboard() }`; the layout's own `/app` index renders
`AppLayout { EmptyView() }`. Three-plus levels nest outermost-first
(`AppLayout { TeamLayout { Members() } }`). Flat route tables keep the
original dispatch unchanged.

**`useParams()` destructuring** — `const { id } = useParams()` (and
`{ id: userId }` aliasing) binds each field to the active router's param
map: a computed `private var id: String { useParams(router:)["id"] ?? "" }`
on SwiftUI (computed, not stored — it reads `@Environment`), `val id =
useParams()["id"] ?: ""` on Compose.

**Typed `params` prop** — a route component may instead declare
`props: { params: { id: string } }` (the web router's prop-injection
shape). PMTC synthesizes a named type per component — `UserPage` →
`struct UserPageParam: Codable` (SwiftUI) / `data class UserPageParam`
(Compose) — and the dispatcher **constructs** it from the matched path
segments: `UserPage(params: UserPageParam(id: params["id"] ?? ""))` /
`UserPage(params = UserPageParam(id = params["id"] ?: ""))`. `number` /
`boolean` fields coerce from the string segments with safe defaults
(`Int(...) ?? 0`, `== "true"`). If the params shape structurally matches
a struct you declared yourself (`type RouteParams = { id: string }`),
your name is reused instead of synthesizing. Components without a
`params` prop are dispatched with no arguments.

**Loader data** — `PyreonRouter` exposes a `loaderData` store +
`useLoaderData<T>()`; a route's loaded data is keyed by the active path
and read back, typed, by the current route. A route's
`loader: () => <expr>` is now **auto-emitted** (v1): the compiler wraps
the route in a runtime `PyreonRouteLoader` host that fires the loader once
on appear (`.task` / `LaunchedEffect`) and calls `setLoaderData`, so
`useLoaderData<T>()` reads it with no manual wiring. v1 covers zero-param,
expression-body loaders (signal/store reads + sync expressions);
param-using, block-body, and truly-async loaders WARN and emit unloaded —
see the loader-auto-emit note in the roadmap.

**Global guards** (`beforeEach` / `afterEach`) — pass arrays of
identifier-referenced guard/hook functions on the `createRouter({ ... })`
config. The parser extracts the identifiers (inline arrow bodies + non-
array forms are silently dropped — a documented follow-up); the emit
configures the router via a Swift closure-init / Kotlin `apply { }` block.
At runtime, `push` / `replace` wrap the navigation in the guard chain —
any guard returning `false` blocks the navigation, then every `afterEach`
hook fires after a successful commit:

```tsx
const requireAuth = (path: string) => isAuthed() || path === '/login'
const logAnalytics = (path: string) => trackPageView(path)

const router = createRouter({
  routes,
  beforeEach: [requireAuth],   // any → false blocks the nav
  afterEach: [logAnalytics],   // all fire after successful commit
})
```

Falls back to bare init when no guards are configured (back-compat —
existing apps need no changes).

**Throw-redirect pattern** (`router.redirect(path)`) — the native
equivalent of web's `throw redirect("/login")` from a loader/guard,
without the guard-return-type redesign. Inside a `beforeEach`,
`router.redirect(path)` queues a `replace` AND returns false-equivalent
short-circuit semantics; an internal `_inGuard` re-entry flag prevents
the redirect's own navigation from infinite-recursing through the same
guard chain:

```swift
router.beforeEachGuards.append { path in
    if !isAuthed() && path != "/login" {
        router.redirect("/login")  // queues replace, re-entry-safe
        return false               // blocks the original push
    }
    return true
}
```

Same shape on Kotlin (`router.beforeEachGuards.add { path -> … }`). The
runtime addition is ~30 LOC per target; no compiler changes.

> Status: path matching, redirects, wildcard 404, **per-route guards**,
> **nested routes**, **`useParams` destructuring**, the **loader-data
> runtime**, **global `beforeEach` / `afterEach` guards** (#1108), the
> **`router.redirect()` throw-pattern** (#1109), and the **typed
> `params` prop** (synthesized per-component struct/data class +
> dispatcher construction from the matched segments) are all **landed**.
> Loader auto-emit and a typed `useParams<T>()` hook generic are planned.

## Bundled images — the asset pipeline

One `assets/` directory next to your shared `src/` carries the app's
images; the `pyreon-native assets` build step materializes it per
target:

| Target | Output | Mechanism |
|---|---|---|
| iOS | `Assets.xcassets/<name>.imageset` (1x/2x/3x from `@2x`/`@3x` suffixes) | `<Image src="logo.png">` → `Image("logo")` |
| Android | `res/drawable-{mdpi,xhdpi,xxhdpi}` (names sanitized to resource rules) | → `Image(painterResource(pyreonDrawable("logo")))` — a name-keyed runtime lookup, so the generated code never references the host's `R` class |
| Web | `public/assets/` | the web `<Image>` primitive prefixes bare names with `/assets/` |

All 15 primitives compile + render on a REAL Android build, not just
the kotlinc-validate subset: the emit's androidx symbols that live
outside the star-imported packages (`Color`, `RoundedCornerShape`,
`verticalScroll`/`rememberScrollState` for `<Scroll>`, `Dialog` for
`<Modal>`, Coil's `AsyncImage` for remote `<Image>`) each get a
content-keyed conditional import — the kotlinc stubs would otherwise
MASK a missing import (green validate, red `gradle assembleDebug`).

The `src` dispatch is canonical across targets: `http(s)://…` is
remote (`AsyncImage`/Coil/`<img>`), a BARE name (`logo.png`) is a
bundled asset, and a path-style src (`/img/x.png`) is web-only — the
compiler warns and native falls through to the remote emit (visible
failure, never silent). `fit` maps to
`scaledToFill/scaledToFit` (SwiftUI) and `ContentScale.Crop/Fit/
FillBounds/None` (Compose); the web default `cover` holds everywhere.

Asset-name collisions after Android sanitization (`my-logo.png` vs
`my_logo.png` → both `my_logo`) abort the build loudly.

### Icons — the canonical name map

`<Icon name="star">` uses ONE semantic name everywhere: iOS maps it to
an SF Symbol (`Image(systemName: "star.fill")`), Android to a
COMPILE-TIME Material reference (`Icons.Filled.Star` — hosts need only
the small `material-icons-core` artifact, never `-extended`), and web
to the app sprite's symbol id. The curated ~37-glyph map lives in
`canonical-primitives.ts` (`ICON_MAP`: navigation, actions, status).
An UNMAPPED name warns at compile time and stays visible: iOS passes
it through raw (direct SF ids keep working), Android renders the
`warning` placeholder glyph — never a silent blank.

### Custom fonts

Drop `.ttf`/`.otf` files in the same `assets/` dir; the assets step
copies them per target (iOS bundle + `UIAppFonts`; Android `res/font`;
web `public/fonts`). `<Text font="Brand">` / `<Heading font="Brand">`
renders the bundled family. The load-bearing detail iOS gets wrong by
default: `Font.custom` needs the font's POSTSCRIPT NAME (its internal
`name`-table id), NOT the filename — a filename-keyed `Font.custom`
silently falls back to the system font on-device. The CLI reads the
PostScript name from the sfnt table (no dependency) and bakes it into
the emit, so `<Text font="Brand">` → `Font.custom("Trattatello", …)`
even when the file is `Brand.ttf`. Android resolves `res/font` at
runtime via `pyreonFont(name)` (a missing font throws loudly).

## Native data & services

Data hooks compile to native via per-service **runtime ports** behind the
shared TS API (the `PyreonStorage` pattern — each service has a Swift +
Kotlin runtime the emitted code drives):

- **Platform prerequisites for networked apps** (both device-CI
  findings): Android needs `<uses-permission
  android:name="android.permission.INTERNET" />` in the manifest —
  without it socket creation fails with the opaque
  `SocketException: socket failed: EPERM` — plus a
  network-security-config exception if the endpoint is plain http
  (scope it to loopback/dev hosts only). iOS needs an ATS exception
  for non-HTTPS endpoints (`NSAllowsLocalNetworking` for
  loopback/dev). The `create-multiplatform` scaffold ships the
  INTERNET permission by default.
- **`useFetch<T>('/url')`** → a `PyreonFetch<T>` reactive container
  (`{ data, error, isPending, refetch }`). The compiler emits a mount-time
  `.task { }` (SwiftUI) / `LaunchedEffect` (Compose) that runs the request
  through the container's `begin → resolve | reject` state machine and
  decodes into `T`. Field reads (`x.data`, `x.isPending`) are `@Observable`
  properties on iOS, Compose `MutableState` on Android.
- **`useForm`** → a `PyreonForm` container (per-field values / errors /
  touched + submit state). `const form = useForm({ initialValues })` emits
  `@State PyreonForm(initialValues:[...])` (SwiftUI) / `remember {
  PyreonForm(mapOf(...)) }` (Compose); MutableState field reads append
  `.value` on Compose (except the derived `isValid` getter).
  **v2 (form-binding arc) — device-proven.** `useForm({ initialValues,
  validators, onSubmit })` lowers fully: per-field validators emit as
  native closures ('' = valid), `<Field value={form.values.x}>` binds
  through the runtime (`form.binding("x")` on SwiftUI — a real
  `Binding<String>` whose setter re-validates after an error; a
  value/onValueChange pair through `setValue` on Compose), per-field
  dict access subscripts with typed defaults (`form.errors.x` →
  `form.errors["x"] ?? ""`), and `submit()` gates on `validateAll`
  before invoking `onSubmit`. The web-parity names (`setFieldValue`,
  `handleSubmit`) exist on both runtime ports. SwiftUI nuance handled
  by the emit: an `onSubmit` capturing instance members (navigate,
  store writes) attaches via `.onAppear { form.onSubmit = … }` — a
  @State property initializer runs before `self` exists. The tasks
  showcase's login is the canonical validated form; its device smokes
  assert the ERROR path before the happy path. Open: block-body +
  async validators, schema validation (`@pyreon/validation`
  reachability), `<Form>`/`<Submit>` wrappers.
- **`usePermissions`** → a `PyreonPermissions` container (RBAC
  `can`/`cannot`/`all`/`any` with `"x.*"` wildcards). `const can =
  usePermissions([...])` seeds the grant set; reads are method calls (no
  `.value` rewrite).
- **`useOnline`** → a `PyreonNetworkStatus` container with a reactive
  `isOnline` flag (real `NWPathMonitor` on iOS; the Compose side takes the
  app's connectivity callback). Because the WEB `useOnline()` returns an
  ACCESSOR (`() => boolean`), ONE shared source reads it as `net()` — the
  emit lowers that accessor call to the container's `isOnline` read
  (`net.isOnline` on SwiftUI, `net.isOnline.value` on Compose). The direct
  `net.isOnline` member read also compiles on native (a native-only shape
  with no web equivalent), so both idioms work — prefer `net()` for
  cross-platform parity.
- **`useAppState`** → a `PyreonAppState` container with a reactive `phase`
  String (`"active"` | `"inactive"` | `"background"`), driven by
  `UIApplication` lifecycle notifications on iOS and an app-injected
  `ProcessLifecycleOwner` source on Android (the same injected-source shape
  `PyreonNetworkStatus`/`PyreonStorage` use to stay Android-SDK-free for the
  kotlinc stub gate). The WEB `useAppState()` returns an ACCESSOR
  (`() => 'active' | 'inactive' | 'background'`), so ONE shared source reads it
  as `state()` — the emit lowers that accessor call to `state.phase` (SwiftUI
  `@Observable`) / `state.phase.value` (Compose `MutableState`). The direct
  `state.phase` member read also works. Use it to pause a live poll while
  backgrounded or dim UI while inactive — identical source on all three targets.
- **`useClipboard`** → a `PyreonClipboard` container with a `copy(text)`
  method + a reactive `copied: Bool` flag that auto-resets to false ~2s
  after each copy (matches the web `@pyreon/hooks` contract). Wraps
  `UIPasteboard.general.string` on iOS (cross-platform UIKit/AppKit —
  #1096 split out the macOS `NSPasteboard` path so the Swift runtime
  builds on both Apple platforms) and the system `ClipboardManager` on
  Android. Reads are plain method calls + a plain Bool/Boolean field
  — no `.value` rewrite. Kotlin emit is a two-line shape — `val cbCtx =
  LocalContext.current` hoisted out of the `remember { … }` lambda (the
  lambda is non-Composable; `LocalContext.current` can't be read inside
  it) + `val cb = remember { PyreonClipboard(cbCtx) }`. The Swift
  container's `deinit` now cancels the in-flight reset Task (#1107 —
  Class I leak fix) so a view that disappears mid-copy doesn't leak a
  pending 2-second timer. BOTH the single-binding shape `const cb =
  useClipboard()` AND the destructure form `const { copy, copied } =
  useClipboard()` compile (PR1 — destructure lowers to a synthetic
  single-binding container + per-field aliases; see "Binding idioms").
- **`useColorScheme()`** → returns `"light"` | `"dark"` reactively from
  the platform's preferred-color-scheme channel. **No runtime port
  needed** — both SwiftUI (`@Environment(\.colorScheme)`) and Compose
  (`isSystemInDarkTheme()`) ship the primitive directly, so PMTC emit is
  a thin per-target wrapper: Swift injects `@Environment(\.colorScheme)
  private var pyreonColorScheme` on the View struct + a computed `private
  var <name>: String { pyreonColorScheme == .dark ? "dark" : "light" }`;
  Kotlin emits `val <name> = if (isSystemInDarkTheme()) "dark" else
  "light"` inline. Same `"light" | "dark"` string contract the web hook
  uses — `scheme === 'dark'` works identically across all three targets
  (#1103).
- **Data/services hooks (Phase 5 — #1689):** seven more `@pyreon/*` hooks
  now compile to their runtime containers, instantiated + read exactly like
  `useOnline` (Swift `@State private var x = PyreonX()` with bare
  `@Observable` reads; Kotlin `val x = remember { PyreonX() }` with `.value`
  on the `MutableState` fields, bare on `Bool` getters + methods):
  `useAuth<User>()` → `PyreonAuth<User>` (status / user / error +
  `isAuthenticated`); `useDatabase()` → `PyreonDatabase` (insert / get / all
  / find / delete / count); `useGeolocation()` → `PyreonGeolocation` (lat /
  lon / accuracy / isAuthorized); `useMap()` → `PyreonMapState` (camera /
  markers / selectedMarkerId); `useWebSocket('wss://…')` → `PyreonWebSocket`
  (lastMessage / messages / isConnected; URL must be a string literal);
  `usePush()` → `PyreonPushNotifications` (token / lastNotification /
  isAuthorized); `usePayments()` → `PyreonPayments` (products /
  ownedProductIds / purchasing). This unblocks **writing** the finance,
  analytical, maps, and realtime/uber archetypes from one `.tsx` — verified
  at the compile rung: an archetype component using all seven emits
  typecheck-clean Swift (`swiftc`) **and** Kotlin (`kotlinc`).
  **Two honest limits:**
  (1) **WebSocket lifecycle auto-start is EMITTED** — `useWebSocket(url)`
  now auto-connects on mount on BOTH targets, matching the web hook: the
  compiler synthesizes a mount-time `ws.connect()` (Swift `.onAppear` on the
  stable host / Kotlin `LaunchedEffect(Unit)`), url-threaded to the faithful
  `connect(to: URL(string: …)!)` (Swift) / `connect("wss://…")` via the
  `@pyreon/native-runtime-kotlin` OkHttp transport extension (`fun
  PyreonWebSocket.connect(url: String)`, Kotlin). An EXPLICIT
  `onMount(() => ws.connect())` is respected — the auto-connect is skipped
  when the component already calls `.connect()`, so there's no double-connect.
  Both auto-connect shapes are proven by real `swiftc -typecheck` + `kotlinc`.
  `geolocation.start()` / `push.start()` still LOWER only via the EXPLICIT
  `onMount(() => …)` escape hatch (their Kotlin containers need an
  app-injected source — `FusedLocationProvider` — that the compiler can't
  synthesize, so their zero-call auto-start stays a host-wiring follow-up).
  (2) **`useSecureStorage()` is deferred** (warns + drops) — the Kotlin
  secret store needs an app-injected `EncryptedSharedPreferences` backend, so
  auto-instantiation isn't clean cross-target. Use the runtime container from
  native host code, or keep secrets in a `<Web>`-only branch, until the
  backend-injection emit lands.
  As with every native service, the **runtime behavior is compile-verified,
  not device-proven** — the nightly device gate + example apps are the
  runtime-proof layer.

> Status: `useForm` (v2 — validated forms, device-proven via the tasks
> showcase's error-path smoke), `useFetch` (device-proven — the
> networked Quotes screen), `usePermissions`,
> `useOnline`, `useClipboard`, and `useColorScheme` are **landed**
> (runtime port + compiler emit — `useColorScheme` is emit-only
> because the platform primitive is enough). `useFetch`'s open item is
> a device-scope NETWORK proof (the UITest gates don't run a backend
> yet). `useValidation` reachability planned.

### The supported TypeScript surface

PMTC compiles a deliberate SUBSET of TypeScript — the shapes the
canonical examples exercise, enumerated here so you know where the
boundary is BEFORE the compiler tells you. Outside the subset, the
contract is: a **warning naming the construct** + either a conservative
passthrough (the native compiler then errors loudly at the site) or a
whole-decl bail — never silent misbehavior. `pyreon-native build` prints
every warning; treat any warning as "this construct is outside v1."

**Declarations (component body)**
| Shape | Notes |
|---|---|
| `const x = signal(init)` / `signal<T>(init)` | un-annotated literals infer string/number/boolean; enum-typed signals get native enums |
| `const c = computed(() => expr)` | expression OR block body (block: `let` + `if`/`return`) |
| `const f = (args) => …` | functions; expression or block body |
| `const x = <expr>` (plain value) | non-call / non-arrow inits — string / number / boolean / arithmetic / member / signal-read — emit as a body-local `let` (Swift, in `body`) / `val` (Kotlin); captures-once like a JS const (#1691) |
| `useStorage<T>('key', default)` | literal string key required |
| `createRouter({ routes })` / `useNavigate()` / `useParams()` / `useLoaderData<T>()` | literal route arrays; guards as expression-body arrows |
| `useFetch<T>(url)` / `usePermissions([...])` / `useOnline()` / `useClipboard()` / `useColorScheme()` | see the services section for per-hook status |
| `useAuth<User>()` / `useDatabase()` / `useGeolocation()` / `useMap()` / `useWebSocket('wss://…')` / `usePush()` / `usePayments()` | Phase 5 (#1689) — container + reactive reads; `useWebSocket` needs a literal URL; `useWebSocket` auto-connects on mount (both targets, synthesized — no `.connect()` call needed); `useGeolocation`/`usePush`/`usePayments` auto-start still deferred (their Kotlin `start(register:)`/`connect(register:)` needs a default per-hook transport, the OkHttp-for-WebSocket pattern) + `useSecureStorage` deferred (services section) |
| `createI18n({...})` / `createMachine({...})` / `defineStore(id, setup)` / `model({...}).create()` | literal configs; store v2 setup bodies take signals + expression-body computeds + arrow methods |
| `rx.METHOD(source, …)` | 21 collection methods (Strategy-A lowering) |

**Binding idioms — one requirement, one convenience that now lowers:**

- **Hook results → single-binding OR destructure (both work now).** Bind
  the hook's result to one name and read fields off it (`const q =
  useFetch<T>(url); q.data()` / `q.isPending`), OR destructure it directly
  (`const { data, isPending } = useFetch<T>(url)`). The destructure form
  **lowers** (PR1) to a synthetic single-binding container
  (`const __pyHookN = useFetch<T>(url)`) + one field alias per key, so each
  local rewrites to `__pyHookN.<field>` at its use sites — producing
  **byte-identical native output to the single-binding form** on both
  targets, with the call form preserved (accessor `data()` vs plain
  `isPending`). Covers `useFetch` / `useForm` / `useClipboard` /
  `useStorage` / `usePermissions` / `useOnline` / `useColorScheme` /
  `useNetworkStatus` / the seven Phase-5 data/services hooks. `useParams`
  keeps its own per-key lowering (router section). **Still warn-drop:** a
  rest element (`const { data, ...rest } = …`) or a nested pattern
  (`const { user: { id } } = …`) — v1 lowers all-simple destructures only;
  and `useLoaderData`'s destructure (its read returns an opaque `T` with no
  field shape to alias).
- **Destructured function/arrow params → lowered.** A helper with a
  destructured param — `const dist = ({ x, y }: Point): number => x + y`,
  `const apply = ({ id }: T) => { remove(id) }` — synthesizes a positional
  param `__pN` (typed from the pattern's annotation — a named type resolves
  to the declared struct) + prepends `let x = __pN.x` per key, so the body
  references `x`/`y` as written. Works for **void handlers** and functions
  with an **explicit return-type annotation**. A value-returning destructured
  function WITHOUT a return annotation should annotate it
  (`({ x }: P): number => x`) — an unannotated value return infers `Unit` on
  Kotlin (a separate, pre-existing return-inference limit, not specific to
  destructuring). Rest / nested patterns warn + stay un-destructured.
- **Store reads → inline OR aliased (both work).** Read store state
  inline through the hook (`useApp().store.tasks()`) OR bind the hook to a
  local first (`const app = useApp(); app.store.tasks()`) — the alias
  **lowers** to a `useApp()` call at every use site, producing
  byte-identical native output to the inline form. (Aliasing previously
  failed the native build with `Unresolved reference 'app'`; it now
  compiles.)
- **Static attrs → literal OR module-level `const`.** A native-mapped
  static attribute (`<Image src=…>`, `<WebView src=… />` / `html=`, font,
  background, …) accepts an inline string literal OR a **module-level
  `const` string/number/boolean binding** referenced by name:

  ```tsx
  const CHART_URL = "https://x.example/c.png"
  // both emit AsyncImage(url:) / Coil AsyncImage(model=) identically:
  <Image src="https://x.example/c.png" alt="chart" />
  <Image src={CHART_URL} alt="chart" />
  ```

  A `let` (mutable) binding, a non-literal init (`const x = f()`), or a
  component-scope / unknown identifier is NOT resolved — it falls through
  to the normal "needs static" emit path. (Component-scope const +
  transitive `const B = A` resolution are tracked follow-ups.)

**Expressions**
| Shape | Notes |
|---|---|
| literals, identifiers, calls, member access | |
| string / array methods → native idioms | `map` / `filter` / `find` / `findIndex` / `some` / `every` / `reduce` / `sort` / `includes` / `indexOf` / `join` / `concat` / `flatMap` (arrays) and `startsWith` / `endsWith` / `split` / `repeat` / `trim` / `toUpperCase` / `toLowerCase` (strings) lower to the platform idiom — e.g. `join`→`joined(separator:)` / `joinToString`, `findIndex`→`(firstIndex(where:) ?? -1)` / `indexOfFirst` (JS `-1`-sentinel preserved), `split`→`components(separatedBy:)` / native split. `slice` / `replace` / `Number()` are NOT yet lowered (type-ambiguity / first-vs-all / coercion subtleties — tracked). |
| `xs[i]` index access | arrays/lists; element-typed inference |
| `+ - * / %`, comparisons, `&& \|\|`, `!`, ternary | `===`/`!==` coalesce to native `==`/`!=`; `/` is always float division (→ `Double`, like JS) |
| `**` (exponent) | → `pow(Double(a), Double(b))` (Swift) / `Math.pow((a).toDouble(), (b).toDouble())` (Kotlin); result is `Double` (matches JS), right-associative |
| `& \| ^ << >>` (bitwise) | Swift keeps the symbols; Kotlin uses the infix functions `and`/`or`/`xor`/`shl`/`shr` (compound operands parenthesized to preserve JS grouping). `>>>` is NOT lowered |
| `a?.b` (optional chaining) | **member access** lowers to native `?.` (and **propagates** down the chain — `a?.b.c` → `a?.b?.c` — required for Kotlin). Optional **index** (`a?.[i]`) and optional **call** (`f?.()`) are NOT supported (they diverge per target) |
| `Math.<fn>(…)` | `abs/min/max/floor/ceil/round/sqrt/cbrt/pow/hypot/sin/cos/tan/atan2/log/log10/log2/exp/trunc` + `PI`/`E`/`random` lower to native (Foundation free fns on Swift; java.lang.Math / kotlin.math with `.toDouble()` arg coercion on Kotlin). `Math.sign` lowers on Kotlin only (no clean Foundation equivalent — Swift tracked) |
| `{cond && <View/>}` conditional render | lowers to `if cond { view }` (SwiftUI) / `if (cond) { view }` (Compose) — the same form `<Show>` emits; parens are seen through so `{cond && (a ? <X/> : <Y/>)}` lowers too. (A value-only `a && b` with no view RHS stays a value expression.) |
| `x++` / `x--` | value-position degrades to `x + 1` (side effect dropped — warning); statement-position composes via `.update` |
| `sig.set(v)` / `sig.update(fn)` | lower to native assignment; `.update` needs a single-param expression-body arrow whose param isn't shadowed |
| object literals | construct declared structs / synthesized types; an **anonymous all-scalar-literal** object (`{ id: 1, name: 'a' }`) matching no declared struct **synthesizes** a module-scope struct (Swift `Codable`) / data class (Kotlin), deduped by field name:type shape (`__Obj0`, …; cross-target names align) — replaces the old labelled-tuple emit (illegal single-field Swift tuple; tuple key-paths break `ForEach(id:)`). A **non-literal field whose type INFERS to a scalar** (`{ id: count(), name: label() }` — signal reads) now synthesizes too; only a non-scalar (array / nested-object / typeRef) field keeps the tuple emit. `{ ...t, field: v }` single-spread becomes Swift IIFE-copy / Kotlin `.copy(...)` |
| array literals + spreads | `[...xs, item]` → concatenation |
| zero-param accessor arrows in condition positions | unwrap to their body (`when={() => cond()}`) |

**Types**
| Shape | Notes |
|---|---|
| `string` / `number` / `boolean`, arrays, `T \| null` | **`number` infers `Int` OR `Double`** from literal evidence: a fractional literal (`12.5`) → `Double`, integer literals stay `Int`. Applies to scalars (`signal(12.5)` / `signal<number>(12.5)`), struct fields, array elements (`signal([12.5, 8.3])` → `[Double]`), and `reduce` seeds (a Double accumulation flips the seed to `0.0`). Whole-number elements in a Double array render `15.0` so `[Double]` / `List<Double>` stays homogeneous. |
| `type X = {...}` / interfaces | become Codable structs / @Serializable data classes |
| string-literal unions | become native enums |
| anonymous object types in props | synthesize named structs (`UserPage`+`params` → `UserPageParam`); declared structs win on structural match |
| generics beyond the recognized hooks' `<T>` slots | NOT supported |

**Statements (function/computed bodies)**: `const`/`let` (incl.
**multi-declarator** `const a = 1, b = 2` → split into one decl each),
`return`, `if`/`else`, **`for…of` / `while` / `switch`** (→ native `for in` /
`while` / `switch`·`when`), and **reassignment** — `t = t + x`, `+= -= *= /=
%=` (a reassigned local is emitted `var`, not `let`/`val`, automatically), so
an imperative loop body can accumulate. C-style `for (let i = 0; …; …)` is NOT
in v1 — use `for…of` over an array or `while`. **Array** destructuring of
locals (`const [a, b] = xs`) is NOT in v1 — the binding is silently dropped,
leaving later references undefined; index explicitly (`xs()[0]`) instead.
(**Object** destructuring `const {a, b} = obj` DOES lower — body-local,
component-param, and hook-result forms, e.g. `const { data } = useFetch(url)`.)
`<For>` remains the idiom for RENDERING a list; these loops are for
in-body data work.

**JSX**: the 15 canonical primitives, `<For each by>`, `<Show when>`,
`<Suspense fallback>`, `<ErrorBoundary fallback>`, `<KeepAlive when>`,
`<Transition show>`, `<Modal open>`, `<RouterProvider>`/`<RouterView>`/
`<Link>`. `data-testid` flows to `accessibilityIdentifier` / `testTag`
(containers gain the queryability semantic automatically). The
cross-platform a11y vocabulary on `@pyreon/primitives` lowers the same
way on every target — write the neutral prop once:
`accessibilityLabel="…"` → web `aria-label` / SwiftUI
`.accessibilityLabel(…)` (the VoiceOver name) / Compose
`.semantics { contentDescription = … }` (the TalkBack name); and
`accessibilityHidden` → web `aria-hidden="true"` / SwiftUI
`.accessibilityHidden(true)` / Compose `.clearAndSetSemantics { }`
(clears the node + subtree from the a11y tree — `clearAndSetSemantics` is
stable in the targeted Compose 1.7 BOM, vs the experimental
`invisibleToUser()`); and `accessibilityRole` (`"button"` / `"image"` /
`"header"` — the values that map 1:1 to every target's role model) → web
`role="button"`/`"img"`/`"heading"` / SwiftUI
`.accessibilityAddTraits(.isButton / .isImage / .isHeader)` / Compose
`.semantics { role = Role.Button / Role.Image }` (and `heading()` for
headers). Component children must be JSX or value
expressions (auto-wrapped in `Text`).

**Module scope**: `let`/`const` primitives (non-reactive on native),
type aliases, the recognized factory calls. Module-scope `signal()` is
NOT lowered — declare signals inside components or stores.

### Consuming compiler diagnostics

The parser warnings introduced by Round-1 (#1094 — `Icon` / `Image` /
`Link` missing required props) and Round-2 (#1099 — `Press` without
`onPress`, native `Link prefetch={…}`, `Stack/Inline/Layer
align="<typo>"`) flow through the same `result.warnings` channel as
every other parse warning. Read them programmatically from the
compiler:

```ts
import { transform } from '@pyreon/native-compiler'

const { code, warnings } = transform(source, { target: 'swift' })
for (const w of warnings) console.warn(w)
```

The shipped surface today is the `pyreon-native build` CLI, which
aggregates warnings per file and prints them to stderr as
`[pyreon-native] N warning(s):` after each build. There is **no
Vite-plugin / LSP / editor-diagnostic surfacer yet** — that's an
explicit Phase 6 DX follow-up. The package is `@pyreon/native-compiler`
(private / workspace-only); consumers using `transform()` directly are
the path until a public published API lands.

## WebView host — embedding web-only-rich viz (charts / flow)

Some libraries are **structurally web-only** — `@pyreon/charts` (ECharts),
`@pyreon/flow` (elkjs), `@pyreon/code` (CodeMirror), `@pyreon/document`
(pdfmake) all wrap a browser-runtime engine and cannot compile to SwiftUI
/ Compose. The multiplatform answer is a **hybrid**: a substantial native
shell (the canonical primitives) with the heavy viz hosted in a
`<WebView>` — `WKWebView` on iOS, Android `WebView`, an `<iframe>` on web.

```tsx
<NativeIOS><WebView html={CHART_HTML} /></NativeIOS>
<NativeAndroid><WebView html={CHART_HTML} /></NativeAndroid>
<Web>{/* render the chart inline — it's already web */}</Web>
```

`<WebView>` takes `html` (inline page — `loadHTMLString` / `srcdoc`) OR
`src` (a LOCAL bundled asset — preferred, policy-safe — or a remote URL).
For App Store / Play Store review, prefer bundled local assets so the viz
is app content, not remote code.

### The two-way data bridge

A hosted chart isn't a static screenshot — it stays live in BOTH
directions, over a **unified JS API** the runtime wires per platform:

**Forward — native → page (`data`).** Pass a signal; the runtime
JSON-encodes it and PUSHES it into the already-loaded page as
`window.__pyreonData`, firing a `pyreondata` event, WITHOUT reloading — so
the chart updates in place (no flicker, zoom/animation preserved). A
`data`-only change never reloads; only an `html`/`src` change does.

```tsx
const metrics = signal<Metric[]>([…])
<WebView html={CHART_HTML} data={metrics()} />
```

```js
// In the hosted page:
function render() { const d = window.__pyreonData || []; /* draw d */ }
window.addEventListener('pyreondata', render); render()
```

**Reverse — page → native (`onMessage`).** The page calls
`window.pyreonPostMessage("payload")`; the string is delivered to the
native `onMessage` callback, so a tap inside the chart drives a native
signal. (iOS `WKScriptMessageHandler`; Android a main-thread-marshalled
`@JavascriptInterface`; web the parent defines `window.pyreonPostMessage`
on the iframe.) The payload is a plain string — JSON-stringify structured
data and parse it in the handler.

```tsx
const selected = signal('')
<WebView html={CHART_HTML} data={metrics()} onMessage={(m) => selected.set(m)} />
<Text>Selected: {selected()}</Text>
```

```js
// In the hosted page — a tapped bar reports back:
bar.addEventListener('click', () => window.pyreonPostMessage(region))
```

Together these make a webview-hosted chart a first-class interactive
member of the native app: live native data flows in, user events flow
back out. `examples/native-analytics` is the canonical end-to-end proof
(native data table + aggregation + an interactive WebView chart from ONE
`.tsx`). **Web caveat:** both bridges are same-origin / `srcdoc` only — a
cross-origin remote `src` can't be reached from the parent frame (the
native targets reach remote content via `evaluateJavaScript` / the script
handler).

## DX surfaces on native (honest scope)

The "one source" promise extends to **WRITING** the source, not just
shipping it. Pyreon ships several developer-experience surfaces;
which of them work on the native targets is a structural question —
some are pre-emit (source-level) and target-agnostic, others depend
on the Pyreon runtime that PMTC erases when emitting Swift/Kotlin.

### Works on native source (✅ — same DX as web)

These analyze your `.tsx` source BEFORE PMTC emits anything, so they
are target-agnostic by construction.

- **Reactivity Lens** (`analyzeReactivity` from `@pyreon/compiler`).
  Returns the same structural reactivity facts (`reactive` /
  `reactive-prop` / `static-text` / `hoisted-static`) and footgun
  findings (`props-destructured`, `signal-write-as-call`, …) on a
  PMTC source file as it does on a web-only source. Verified end-to-
  end against a `<Stack>`/`<Button>`/`<Text>` Counter fixture: the
  Lens correctly flags `const { x } = props` as `footgun` and the
  signal reads inside `{count()}` as `reactive`, identical to the
  output it produces for the same shape in a web component.
- **`@pyreon/lint` rules + `pyreon doctor`**. Every rule runs on the
  source AST; none of them load the runtime. `pyreon/no-window-in-
  ssr`, `pyreon/signal-write-as-call`, `pyreon/props-destructured`,
  `pyreon/no-iterate-children-without-resolve`, the islands audit,
  the SSG audit, the test-environment audit — all surface the same
  findings on a PMTC source file. The `pyreon/no-window-in-ssr`
  rule is actually MORE valuable on native sources (the emit target
  literally has no `window`), but the surface is the same.
- **Static type checking + `audit-types`**. `tsc --noEmit` and the
  typed-but-unimplemented gate care only about TypeScript types, so
  they work identically across targets.
- **MCP tools** (`validate`, `get_api`, `get_pattern`,
  `get_anti_patterns`, `get_changelog`, `audit_test_environment`,
  `audit_islands`). All operate on source / repo metadata, not the
  runtime. An AI agent driving a native source through `validate`
  gets the same anti-pattern catalog as it would for a web file.
- **`pyreon-native check` editor-ready diagnostics.** The fast
  authoring-loop command exposes an in-memory `checkSource(code,
  fileName, opts)` core — no disk read, so it checks an *unsaved*
  editor buffer, the case a linter plugin needs — and attaches a
  `position` (`{ line, column }`) to transform + type-check-error
  findings, parsed from the `file:line:col` the toolchains embed. So
  `check --json` is consumable by an editor linter integration (null-ls,
  a generic-linter extension) or a CI annotation matcher, with precise
  squiggles on the errors that carry a location. **Honest scope:**
  unsupported-subset WARNINGS are still position-less (rendered as a
  `file`-level diagnostic — threading source spans through the ~110
  compiler warn sites is a tracked follow-up).
- **`pyreon-native check --lsp` — a stdio LSP server.** Publishes those
  findings as **live editor diagnostics** on open / change (a
  `textDocument/didOpen` / `didChange` → `publishDiagnostics` loop over
  the in-memory `checkSource` core), so the authoring loop no longer
  needs a manual CLI run — squiggles appear as you type in any
  LSP-speaking editor (VS Code, Neovim, …). The JSON-RPC framing is
  hand-rolled, mirroring `@pyreon/lint --lsp` (no `vscode-languageserver`
  dependency); the pure core (finding→diagnostic mapper + message
  handler) is unit-tested without the transport, and the end-to-end
  server is proven by spawning it and round-tripping a real
  `initialize` + `didOpen`. **Honest v1 scope:** diagnostics only (no
  inlay hints — native has no reactivity-lens surface to project), a
  synchronous re-check on change (debounce is a follow-up — the
  in-memory transform is fast), and no `swiftc -typecheck` on the
  keystroke path (slow / macOS-only). Warnings stay file-level until the
  compiler warn sites carry spans.

### Web-only by structural design (❌ — not coming to native)

These surfaces depend on the Pyreon RUNTIME (signal registry,
effect graph, devtools hook). PMTC erases that runtime when it
emits to SwiftUI `@State` / Compose `mutableStateOf` — there is no
Pyreon-side data structure to introspect on a native target;
SwiftUI's `_GraphInputs` and Compose's `SlotTable` own the reactive
graph end-to-end. This is **structural-infeasibility**, not
engineering effort.

- **LPIH** (Live Program Inlay Hints — fire counts / re-run
  counters at the source line). Requires the dev-mode
  `@pyreon/reactivity` registry (`activateReactiveDevtools` +
  `getFireSummaries`) to be alive in the running app. On native
  builds the entire reactivity package is tree-shaken — the
  `signal(0)` call you wrote is emitted as `@State var count = 0`,
  there is no Pyreon-side wrapper to count fires. **Use on web
  during development; the inlay hints don't reach a running iOS /
  Android build, by design.**
- **Devtools panel** (the Chrome extension under
  `packages/tools/devtools`). Connects to
  `window.__PYREON_DEVTOOLS__` (a hook attached by
  `@pyreon/runtime-dom`'s `installDevTools()`) to walk the
  component tree, highlight nodes, watch signals fire. On a native
  build there is no `window`, no `__PYREON_DEVTOOLS__`, and no
  Pyreon component tree — SwiftUI and Compose own the view
  hierarchy. For native runtime debugging use **Xcode's View
  Hierarchy Debugger** (iOS) and **Android Studio's Layout
  Inspector** (Android); they're the native equivalents of the
  Pyreon devtools panel and they work on the emitted view tree
  directly.
- **Pyreon HMR + `@pyreon/vite-plugin` signal-preserving HMR**.
  Web-only by construction (Vite is a web dev server). iOS uses
  Xcode's incremental compile + Simulator hot-reload; Android uses
  Gradle's incremental build + Compose's `LiveLiterals` /
  `recomposeHighlighter`. These are platform-native HMR equivalents
  — there is no shared Pyreon HMR surface across targets.

### Partial — works for the source-level part, runtime part is on the platform

- **`pyreon-native build` warnings** (the silent-drop diagnostic
  surface from PRs #1235 / #1441). Pre-emit warnings about dropped
  `useLoaderData()` reads, dropped `<Suspense fallback>` props,
  etc. ARE shown — they're emitted at compile time, surfaced via
  `transform()` `result.warnings` and the CLI's
  `[pyreon-native] N warning(s)` stderr aggregation. The actual
  runtime-state debugging is per-target (Xcode + Android Studio
  above).

If you adopt PMTC for a real production app, the practical
workflow is: write + debug source-level concerns on web (Lens,
devtools, HMR, lint) where the iteration loop is fastest; verify +
debug native-runtime concerns on the device with the platform's
own tooling. Same `.tsx`, two debugging surfaces.


## Verifiable today (compile contract)

- **Web**: `@pyreon/runtime-dom` renders any Pyreon JSX. Full ecosystem available.
- **iOS**: `pyreon-native build --target=ios --source=./src --out=./generated` produces typecheck-clean Swift (verified via `swiftc -parse` in the `native-validate` CI). The **opt-in** `native-device` workflow additionally runs `xcodegen` + `xcodebuild` to compile the full example app on a real Xcode/Simulator SDK, then `xcodebuild test` boots the iPhone 15 Simulator + runs `PyreonTodoMVCUITests` to assert `accessibilityIdentifier("todo-app")` renders within 30s.
- **Android**: `pyreon-native build --target=android --source=./src --out=./generated` produces typecheck-clean Kotlin (verified via `kotlinc + Compose stubs`). The same opt-in `native-device` workflow runs `gradle assembleDebug` against the real Android toolchain, then boots a Pixel-6 emulator (API 33, google_apis, x86_64, via `reactivecircus/android-emulator-runner`) + runs `gradle connectedCheck` which executes `TodoAppInstrumentedTest`'s `composeRule.onNodeWithTag("todo-app").assertIsDisplayed()`.

### TodoMVC reference walkthrough (locally verified, June 2026)

The `examples/native-todomvc-{web,ios,android}` apps form the **canonical proof** of the single-source contract. The shared TodoApp source (`examples/native-todomvc-ios/src/TodoApp.tsx`) renders on all three targets without modification.

**Web** (a real running app in the browser):

```bash
cd examples/native-todomvc-web
bun run build      # 88 modules → 35 KB JS bundle, 13 KB gzipped
bun run dev        # http://localhost:5173/
```

Then in a browser: type, hit Enter, toggle, filter All/Active/Completed, click Clear completed. Zero console errors. Web fully working.

**iOS Swift emit**:

```bash
bash examples/native-todomvc-ios/scripts/build.sh
# → examples/native-todomvc-ios/generated/TodoApp.swift
```

The emitted file opens with the import preamble (`import SwiftUI` / `PyreonRuntime` / `PyreonRouter`) and emits idiomatic SwiftUI: `@PyreonAppStorage("pyreon-todomvc:todos")` for persistence, `@State` for local signals, `VStack(spacing: 8)` / `HStack` for layout, `TextField(..., text: $draft)` with `.onSubmit { addTodo() }`, `ForEach` keyed by id, `Button(action:)`. The `data-testid="todo-app"` JSX attribute becomes `.accessibilityIdentifier("todo-app")` so the same string works on the iOS UI test.

Verify it compiles against the real SwiftUI SDK:

```bash
swiftc -typecheck \
  -target arm64-apple-macos14.0 \
  packages/native/runtime-swift/Sources/PyreonRuntime/*.swift \
  packages/native/router-swift/Sources/PyreonRouter/*.swift \
  examples/native-todomvc-ios/generated/TodoApp.swift
# → exit 0 (zero errors)
```

**Android Kotlin emit**:

```bash
bash examples/native-todomvc-android/scripts/build.sh
# → examples/native-todomvc-android/app/src/main/kotlin/com/pyreon/generated/TodoApp.kt
```

The emitted file opens with `package com.pyreon.generated`, the Compose import preamble (`androidx.compose.runtime.*` / `material.*` / `kotlinx.serialization.Serializable` / `com.pyreon.runtime.*`), and emits idiomatic Compose: `var todos by rememberPyreonStorage<List<Todo>>(...)`, `var filter by remember { mutableStateOf(Filter.all) }`, `val visible by remember { derivedStateOf { ... } }`, `Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.testTag("todo-app"))`, `TextField` with `KeyboardOptions(imeAction = ImeAction.Done)` + `KeyboardActions(onDone = { addTodo() })`, `LazyColumn { items(visible, key = { it.id }) { ... } }`, `Button(onClick = ...)`.

Verify against the framework's `validateKotlin` (same Compose stub set the `validate-kotlin.test.ts` gate uses):

```bash
bun -e "
  import('./packages/native/compiler/src/validate.ts').then(async (m) => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('examples/native-todomvc-android/app/src/main/kotlin/com/pyreon/generated/TodoApp.kt', 'utf8')
    // Strip the package + wildcard imports (the stub set is in default package).
    const stripped = src.split('\n')
      .filter(l => !l.startsWith('package ') && !l.startsWith('import androidx') && !l.startsWith('import kotlinx') && !l.startsWith('import com.pyreon'))
      .join('\n')
    console.log(JSON.stringify(m.validateKotlin(stripped), null, 2))
  })
"
# → { "ok": true }
```

**One source. Three targets. Verified locally** on macOS 14 with Xcode 15 + JDK 21 + Kotlin 2.x.

The runtime packages exist, with one reactive container per data/service hook:

- `@pyreon/native-runtime-swift` — `@PyreonAppStorage` + `PyreonStorage`, `PyreonFetch<T>`, `PyreonForm`, `PyreonPermissions`, `PyreonNetworkStatus` (`@Observable` containers)
- `@pyreon/native-runtime-kotlin` — `rememberPyreonStorage` + the same `PyreonFetch` / `PyreonForm` / `PyreonPermissions` / `PyreonNetworkStatus` / `PyreonClipboard` containers (Compose `MutableState`); PR #1104 closed the last untested service by adding the Kotlin `PyreonClipboard` test suite, bringing every container to parity test coverage
- `@pyreon/native-router-{swift,kotlin}` — `PyreonRouter` (path stack, `matchPath`, `params`, `loaderData`) + `useNavigate` / `useParams` / `useLoaderData` hooks

## Reference

- Compiler source: `packages/native/compiler/src/` — `emit-swift.ts` / `emit-kotlin.ts` per-target emit; `canonical-primitives.ts` shared name maps + token resolution
- Native runtime packages: `packages/native/runtime-swift/`, `packages/native/runtime-kotlin/`
- Web runtime: `packages/core/primitives/src/web/` — all 15 canonical primitives
- Example apps: `examples/native-todomvc-{ios,android,web}/` + `examples/native-router-demo-{ios,web}/` — `native-router-demo-ios` ships a full XcodeGen host shell (#1105) so `bash scripts/build.sh` produces a buildable Xcode project, not a source-only stub. `examples/native-todomvc-web/README.md` was also corrected (#1106) so it no longer references a fictional `src/TodoApp.tsx` — the one-source contract (Phase E3) keeps the shared TodoApp source in `examples/native-todomvc-ios/src/`.
- Real-device build gate: `.github/workflows/native-device.yml` (opt-in via the `native-device` label / dispatch)
- CLAUDE.md "PMTC Multi-Target Architecture" section — agent-context summary of the layered model + roadmap
