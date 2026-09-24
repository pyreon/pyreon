---
title: "Build Pipeline Mistakes"
description: "Common build pipeline mistakes in Pyreon and how to fix them."
---

# Build Pipeline Mistakes

> **Generated** from `.agents/rules/anti-patterns.md` (the same source as MCP `get_anti_patterns`). Each entry is a real mistake + its fix; where a detector code is listed, the linter / `pyreon doctor` / MCP `validate` catches it automatically.

### Layout decisions every target must make belong in the engine, not a host file.

If the web host and a code generator both have to make a decision, implement it once in shared engine code. Legend placement used to live only in the web `canvas-host.tsx`. The native emitters drew every legend at the top, and even the one shared placement was off by 8px. Now `placeLegend(entries, area, position, opts, measure) -> { cmds, top, bottom, left, right, boxes }` in `packages/fundamentals/charts/src/engine/legend.ts` is the only implementation. The emitters pass a position and read the insets back. Only the insets a position can take are emitted, so the default (top) keeps its one-axis `pyreonShiftCmds(p, top)`. A prop that "does not lower yet" while every primitive it needs already crosses usually means a decision is stuck in one host.
  - Classify a shared offset by the coordinate space each caller reads. A left legend indents the plot, so plot hits subtract the indent. Legend entry boxes, the pager and the preset strip are laid out in canvas coordinates (drawn before the plot shift) and must read the raw x. `tapY` already draws this line: chrome reads raw, the plot subtracts the title.
  - A `toContain` check on the raw-x string passes against the bug because it is a prefix of the indented one. Assert through the next argument's separator. Device taps at hardcoded coordinates go stale when layout moves.
  - Locks: `charts/src/engine/legend-place.test.ts` (web) and `native/compiler/src/tests/chart-legend-position.test.ts` (both targets, real swiftc/kotlinc compiles of all four positions). The emitters must call `placeLegend` and never `renderLegend`.

---

### A user type named like a generated type shadows it silently.

PMTC merges the generated chart engine's struct/enum declarations into every file importing `@pyreon/charts/plot` and constructs them by bare name (`Slice(value:label:)`). A user `interface Slice` shadows the engine's, giving `invalid redeclaration` or type mismatches with no warning. The merge point detects the collision: `packages/native/compiler/scripts/gen-chart-engine.ts` generates `CHART_ENGINE_DECLARED_NAMES` from the same parse as the structs, and `index.ts:chartEngineShadowWarnings` diffs it against user declarations. Only types are listed. Engine functions can overload, and engine constants are `private`, so warning on those would flag working code. Lock: `native/compiler/src/tests/chart-engine-shadow.test.ts` (real-toolchain failure plus the renamed twin passing; a totality spec fails if a struct is missing from the list).

---

### A decline whose reason is a data shape calls for an API change.

`<MapChart>` was declined because GeoJSON `coordinates` is `number[][][]` or `number[][][][]` in one field. The fix was a new accepted prop shape (`GeoShape[]`, already normalised to rings) rather than a new lowering; the web-only GeoJSON shapes warn individually. Compile any remedy a diagnostic recommends: `geoShapes(json)` is itself web-only, so suggesting it just swaps one warning for another. A theme token meaning "inherit" (`background: ''`) is not a colour; resolve defaults derived from it where light/dark values are still raw (`chartThemeFields` derives `pageGround` once), not in the consumer. Reference: `packages/native/compiler/src/chart-hosts.ts` (`geoShapesAdapter`, `geoValuesAdapter`, `CHART_THEME_SOURCE.borderColor`); lock `chart-hosts.test.ts`.

---

### Do not access a data-keyed dictionary object with ordinary property operations.

When keys come from data, `key in obj`, `obj[key]` and `obj[key] = v` consult `Object.prototype`, and `__proto__` hits an accessor. Test with `Object.hasOwn`; write with `Object.defineProperty` or use a null-prototype object. Program-supplied keys are fine with ordinary access.
  - Read side: `.strict()` in `packages/fundamentals/validate/src/composition/object.ts` used `key in known`, so keys like `toString` or `constructor` bypassed strict mode. Lock: `validate/src/tests/strict-prototype-keys.test.ts`.
  - Write side: `packages/tools/lathe/src/input/yaml.ts:setKey` assigned `map[key] = value`, so a `__proto__` key replaced the prototype and vanished from the IR. The `.json` path (`JSON.parse`) already defined it as an own key; when two readers of the same data disagree, the divergence finds the bug. Lock: `lathe/src/tests/yaml-prototype-keys.test.ts` (the `constructor` case is a companion, not the lock — plain assignment defines it).

---

### Decide emit syntax from where the text goes, not from the node's AST parent.

`templatizeComponentChildren` splices a component child into a call argument (`_mountChild(<Button/>, __root, null)`); `collapseRocketstyle` then rewrote `<Button/>` and added JSX braces because its AST parent was still a `<div>`, producing `_mountChild({__rsCollapse(…)}, …)`. Braces, parens, semicolons and `return` depend on emit position; once another pass relocates text, the parent no longer answers that. The relocating pass declares it: JS marks hole nodes in `argPositionNodes` (`compiler/src/jsx.ts:bracesForParent`); Rust clears `parent_is_jsx` across the hole walk, saving and restoring it because holes nest. The native half only breaks when the templatized element is itself a JSX child (the `_lc` sole-child path), so a per-backend bisect is only as good as its corpus. `verify-modes` (every example × mode) is the gate that catches combined-option bugs; run it when flipping a default. Lock: `compiler/src/tests/collapse-absorbed-hole.test.ts`, which reparses the output with `oxc-parser`.

---

### A `_tpl` bind must not mount components in an eager argument position.

Pyreon passes component children eagerly (`h(Comp, props, ...children)`). In `<PyreonUI theme={t}>{_tpl(…)}</PyreonUI>` the bind would mount the subtree before `PyreonUI` calls `provide(theme)`, and rocketstyle descendants crash with `Cannot read properties of undefined (reading 'base')`. Solid is safe with the same template+insert only because its compiler thunks component children (`get children() { … }`). Pyreon's rules today:
  - A component's sole child is deferred with `_lc`, which covers the provider case.
  - `templatizeComponentChildren` (default on in `@pyreon/vite-plugin`) absorbs component children only in the trailing `[element*][component+]` shape. Multi-child component parents, member/namespaced tag parents, fragments and expression containers bail to `h()`.
  - A helper call in component-child position (`<Comp>{helper()}</Comp>`) is still an eager argument; its body being in return position does not make it safe.
  - This class needs a provider above a templatized element, which synthetic fixtures rarely have. Run the real-app `ui-showcase-regression` e2e for any template-emission change.

---

### A name-shadow check must cover every binding form.

`@pyreon/vite-plugin`'s JSX auto-import skips names already declared, but its regex only matched `const ${name}\b`. `const { Form, Text } = createForm(schema)` bound `Text`, the pass injected `import { Text } from '@pyreon/primitives'`, and the build failed with `Identifier 'Text' has already been declared`. Match simple, object-destructured, array-destructured and renamed bindings. Bias an injecting transform toward not injecting: a false positive (`const { Text: Renamed }` treated as shadowing) costs an explicit import; a false negative costs a build. Lock: `vite-plugin/src/tests/jsx-auto-import.test.ts`.

---

### Choose the parser dialect by the same rule in both compiler backends.

Rust `SourceType::from_path(filename).unwrap_or_default()` fell back to plain JavaScript for unknown names; TypeScript then failed to parse, the panic was caught, and the source came back unchanged with no JS fallback. Both Rust entry points now mirror the JS `getLang` (`.jsx` → JSX, else TSX; the plain pre-pass adds `.ts` → TS and `.js` → JS). `#[napi(catch_unwind)]` makes a native panic fall back to JS; a stack overflow is not an unwind and stays uncatchable. Vary the filename in compiler specs. Lock: `compiler/src/tests/template-escape-audit.test.ts` (five filename shapes, both backends).

---

### Quote PMTC string literals with the per-target quoter, never `JSON.stringify`.

JSON leaves Kotlin's `$` interpolation marker alone (`'due: $total now'` reads a signal named `total` on Android), emits `\f`/`\b` that Kotlin lacks, and emits `\b`/`\f`/`\uXXXX` that Swift lacks (Swift spells `\u{X}`). Use `kotlinStr`/`swiftStr` from `packages/native/compiler/src/string-literals.ts`; non-strings may keep `JSON.stringify`. Related rules:
  - Sanitise identifiers universally (`swiftIdent`/`kotlinIdent`) so declaration, memberwise init and member access agree. String-literal-union enum cases go through `swiftEnumCase` (camelCase + raw value) and `kotlinMember` (backticks). A Swift struct with a renamed field gets `CodingKeys`.
  - Keep `parseInt(s, radix)`'s radix. Coerce Double concat operands with `pyreonNumString` so `250.0` prints as JS prints `250`.
  - When a correct helper exists, audit for sites that bypass it by grepping the raw primitive (`JSON.stringify(`, `.join(`, `${f.name}`).
  - Known limitation: `inlineValueConsts` (`emit-swift.ts`) substitutes each value const at every use with no sharing, so a chain where each const references the previous twice grows exponentially.
  - Lock: `native/compiler/src/tests/native-string-literal-quoting.test.ts` (real swiftc/kotlinc).

---

### `@pyreon/vite-plugin` has one source-file walker; keep it that way.

Two copies both skipped `lib`/`dist`/`build` at any depth, so a `src/lib/store.ts` store never reached the signal registry and rendered its signal's function source. `collectSourceFiles` in `vite-plugin/src/index.ts` skips build-output dirs only at the walk root or beside a `package.json`, and the `.ts`/`.js` scan runs before the extension gate. Related rules in the same file, locked by `vite-plugin/src/tests/audit-2026-09.test.ts`:
  - Decide the sanitizer auto-import on parsed usage, not a raw `innerHTML[=:]` text match, and append the import rather than prepend it after the source map is built.
  - Decide whether a file is framework source by its package name, not by `/packages/` in its path.
  - Skip `node_modules` and honour `include`/`exclude`.
  - Probe `ssrTemplate` capability from the project root, not from whichever module transforms first.
  - Reject cross-origin POSTs to the dev LPIH endpoint.

---

### A scan for a transform's markers must accept every spelling the transform accepts.

The Plain Mode pre-pass recognises `state`/`derived` by import source, so `import { state as s } from '@pyreon/core/plain'` compiles. The signal-export scan now reads the module's own import specifiers (`vite-plugin/src/index.ts:plainMarkerLocalNames`). The transform gate and the prescan must also agree on extensions (`.ts`/`.mts`/`.js`/`.mjs`/`.cjs`/`.cts`). Lock: `vite-plugin/src/tests/plain-mode.test.ts`.

---

### A root-level config file can only import what the root package declares.

A monorepo root usually declares little, so `atlas.config.ts` could not import workspace packages (`@acme/ui-theme`) or `@pyreon/core`. Resolve config imports by looking up workspace package names, and fall back to Node resolution from a base that declares the dependency. Apply this only to the config: a component that cannot resolve an import has a real dependency bug. Make an exports-map helper's caller say whether it wants types or a loadable entry; preferring `types` for a loader lands on `index.d.ts`. Lock: `atlas/src/discover/tests/config-resolution.test.ts`.

---

### A default-on transform must not inject an import the app cannot resolve.

The `ssrTemplate` fast path injects `import { _ssr, _esc, … } from "@pyreon/runtime-server"`. Under strict layouts (bun isolated, pnpm strict) a transitive dependency is not importable from app source, and resolving it from the plugin's location is unsafe because `renderToString` recognises `_ssr` output via `instanceof RawHtml` — a second copy breaks it. `@pyreon/vite-plugin` therefore defaults `ssrTemplate` to auto: it enables the emit for the SSR graph only when `@pyreon/runtime-server` resolves from the app (probed once, cached in `ssrTemplateAuto`); otherwise it uses the `h()` SSR path. The compiler primitive stays opt-in (`ssrTemplate === true`). Run every SSR e2e suite (`ssr-node`, `ssr-showcase`, `islands-showcase`) for SSR-compile changes, because resolvability differs between `@pyreon/server` and `@pyreon/zero` apps.

---

### Never call `require()` in a `type: module` package.

Import statically at module top. In the browser `require` is undefined; in Node ESM it throws `ReferenceError`, and inside a `try/catch` that degrades the failure is silent (a `require('node:crypto')` in `zero/src/https/cert.ts:expiryOf` once made every dev certificate expire in 24 hours; a `require('node:fs')` in `@pyreon/lint` made `require-browser-smoke-test` match zero packages under Node). Bun defines `require` in ESM, so a bun-run suite cannot catch this; reproduce with a `.mjs` under real `node`. Rolldown rewrites the call to a `__require` shim, so grep source, not `lib/`. Enforced by the `pyreon/no-require-in-esm` lint rule (error; `.cjs`/`.mjs` override the package `type`; `typeof require` checks and local `require` bindings are allowed). Locks: `lint/src/tests/no-require-in-esm.test.ts`, `zero/src/tests/https-internals.test.ts` ("ESM discipline", static check), `code/src/tests/code.browser.test.tsx`. Methods that only run against a live browser resource need a real-Chromium test that exercises them, not just the no-resource bail.

---

### Read a library's state through its API, not a guessed DOM class.

The `@pyreon/code` minimap checked `classList.contains('cm-dark')`, but CodeMirror 6 uses hashed classes, so dark editors got a light minimap. Use `view.state.facet(EditorView.darkTheme)`. Assert the rendered effect (the canvas `fillStyle`), not class presence. Lock: `code.browser.test.tsx`.

---

### A CLI wrapping a plugin-driven build must delegate, not duplicate, the plugin's post-step.

`zero build` is a single `vite build`; the plugin chain owns client, server bundle, `template.html`, prerender and adapter. A duplicated pipeline built divergent trees and deployed a server without `template.html`. Rules: never `catch {}` a deploy-artifact step — an explicitly configured adapter failure fails the build, an auto-selected one logs; recursion-gate env flags live in one module (`packages/zero/zero/src/build-flags.ts`); a flag leaked from a parent process prints a notice instead of silently disabling the post-step. Locks: `packages/zero/cli/src/commands/build.test.ts` (one server bundle, template beside the entry, no `dist/output`) and `zero/src/tests/integration/build-post-step.test.ts`.

---

### Cap dependency ranges below any major that removed the API you use.

TypeScript 7 removed the classic Compiler API; `typescript: ">=5.0.0"` resolved to it and parse-backed tools crashed with `Cannot read properties of undefined (reading 'ESNext')`. Rules:
  - Use `">=5.0.0 <7.0.0"`, not a bare `>=X`.
  - A dependency the shipped `lib/` always imports is a `dependency`, not a `peer`.
  - Guard at the use site, not at import time: `packages/core/compiler/src/ts.ts:assertClassicTs` runs before each `ts.createSourceFile` and throws a `[Pyreon]` message naming the pin. `diagnose.ts` has an `ERROR_PATTERNS` entry for `reading 'ESNext'`.
  - `bun install --frozen-lockfile` accepts the stale range metadata in `bun.lock`; do not stage lockfile churn for a range cap.

---

### Both compiler backends must share one traversal reachability for any rewriting pass.

When JS and Rust reach different nodes, they diverge, and bugs in the overlap where both agree stay invisible to a hand-curated corpus. The signal auto-call rule: reach nested function bodies (shadow-aware) and nested JSX; an exactly-bare signal (parens and TS layers transparent) as a DOM attr/child in a re-emitted region stays bare so both runtimes bind it reactively; template-path bindings call it because they assign the value. Never write a catch-all arm that returns "handled, emit nothing" — unrecognised static attributes must fall through to the dynamic path, or they vanish. Duplicate plain JSX attributes dedupe last-wins in the template path (the HTML parser would pick the first) and emit `duplicate-jsx-attr`. Seeded grammar fuzzing covers the combinatoric space: `packages/core/compiler/src/tests/fuzz-equivalence.test.ts` (300 seeds × client/SSR in CI).

---

### Apply an attribute refusal at every sink and derive it from the browser's vocabulary.

A prop reaches the DOM through several sinks: `setStaticProp` (h() path, including its foreign-namespace branch), `applyAttrProp`/`_setAttr` (compiled), `renderPropSkipped` (SSR), `_ssrAttrGen` (compiled SSR), and `@pyreon/head`'s own SSR serializer and client syncer. Refuse event-handler names (`onclick`, including SVG SMIL `onbegin`/`onend`/`onrepeat` and legacy `onmousewheel`/`onwebkit*`) and unsafe attribute names above the branch structure and above accessor resolution, because resolving a function-valued handler to build a string is itself the side effect. Refuse camelCase too: `setAttribute` lowercases names on HTML elements, so `onClick` becomes a live `onclick`. The compiler's own `/^on[A-Z]/` bail does not cover lowercase names. Single source: `packages/core/core/src/url-guard.ts` (`EVENT_HANDLER_ATTRS`, `isEventHandlerAttr`, `UNSAFE_ATTR_NAME_RE`); head uses `packages/core/head/src/attr-guard.ts`. `event-handler-vocabulary.browser.test.tsx` enumerates Chromium's own `on*` handlers and fails on any missing one (superset, not equality). happy-dom does not compile handler content attributes and disagrees on `'onClick' in el`, so liveness needs real Chromium. Locks: `runtime-dom/src/tests/setx-superset-differential.test.tsx`, `event-handler-attr.browser.test.tsx`, `event-handler-vocabulary.browser.test.tsx`, `head/src/tests/ssr-attr-guards.test.ts`.

---

### Take a tokenizer guard's separator set from the parser, including the empty case.

`SVG_SCRIPT_RE` only matched `on*=` after whitespace. Chromium's HTML tokenizer also accepts `/` and a closing quote with no separator (after a quoted attribute value it recovers into a new attribute name). The measured set is `[\s/"']`; `>` is inert because the tag has closed. `IMAGE_SRC_ATTRS` does not include `srcset`: a `srcset` value is a comma-separated candidate list and SVG data URIs contain commas. Reference: `packages/core/core/src/url-guard.ts`; lock `core/src/tests/svg-data-uri-separators.test.ts` (url-encoded and base64 payloads).

---

### The compiled template path must emit calls to the runtime's normalizers, not re-implement them.

The template `attrSetter` (`compiler/src/jsx.ts`, mirrored by `native/src/lib.rs:attr_setter`) and the runtime `applyProp` (`runtime-dom/src/props.ts`) must normalize values identically. The compiler emits `_setClass` (`applyClassProp`, uses `setAttribute('class', …)`), `_setStyle` (`applyStyleProp`: number→px, kebab-case, stale-key removal) and `_setAttr` (`applyAttrProp`: `null`/`undefined` → remove, boolean `aria-*` → `"true"`/`"false"`, boolean → presence, function → resolved). Without these, `class={[a(), 'b']}` rendered `"a,b"`, object styles became `[object Object]`, `aria-disabled={x ? 'true' : undefined}` rendered `"undefined"`, and an accessor held in a bare identifier stringified its source. Static literals still bake via `staticAttrToHtml`. A static-emit callable (a provably local function) resolves once; use a signal call or prop-derived expression for a live attribute. Alias injected imports of public names (`import { cx as _cx }`) so they cannot collide with the user's own import; `_`-prefixed internals need no alias. Test by mounting output of the real `transformJSX` — the oxc auto-runtime in primitives' browser configs goes through `h()` and masks template bugs. Locks: `runtime-dom/src/tests/compiler-integration.test.tsx`, `compiler/src/tests/native-equivalence.test.ts`, `runtime-server/src/tests/ssr.test.ts`.

---

### Decide property vs attribute by reflection and writability, not by name.

- `key in el` is true for getter-only IDL accessors, and framework code runs in strict mode, so `<input list="dl">` threw `Cannot set property list … which has only a getter`. `setStaticProp` now does `try { el[key] = value } catch { el.setAttribute(key, String(value)) }`; the attribute is the correct destination for `list`/`form`. This costs nothing on success, unlike a descriptor walk. A genuine setter exception (e.g. `valueAsNumber` on a text input) is also turned into an attribute write.
  - Non-reflecting properties (SSR markup and client mount then produce the same state from different HTML): `input.value/checked/indeterminate/selectionStart`, `textarea.value`, `select.value/selectedIndex`, `option.selected`, media `muted/volume/currentTime/playbackRate/srcObject`, `table.tHead`. `value` reflects on `option`/`button`/`progress`/`meter`/`li`/`data`/`param`/`output`. `input.files` is settable, not read-only.
  - `<video muted>` diverges in behaviour, not HTML (a hydrated page is muted, a client-navigated one is not). This matches React/Preact/Solid and is left as is; `defaultMuted` alone does not fix it. `hydration-parity-fuzz.test.tsx` compares `innerHTML`, so it cannot see this class.
  - Open: SSR kebab-cases every camelCase prop, which is wrong for non-reflecting props (`defaultValue` → `default-value`).
  - Locks: `runtime-dom/src/tests/readonly-idl-prop.test.ts` + `.browser.test.tsx`; the parity fuzzer generates value-bearing controls behind the exported `KNOWN_ATTR_PARITY_DIVERGENCES` mask (only `input.value`/`textarea.value`/`select.value`). That fuzzer builds with `h()`, so it covers the runtime path only.

---

### `_applyProps` (the compiled spread sink) must be a superset of `applyProps`.

`applyProps` skips `ref`, and `mountElement`/`hydrateElement` wire it themselves, so a `ref` inside `<div {...props}>` was dropped on the compiled path. The exported `_applyProps` is `applyPropsWithRef` (applies props and wires the spread's `ref`); internal mount/hydrate code calls the unexported `applyProps` so refs never double-fire. The compiler captures the returned cleanup: an identifier spread emits `const __dN = _applyProps(__root, props)`, a call spread emits `const __dN = _bindSpread(__root, () => (make()))`, which disposes each pass's cleanup before the next and at unmount (`renderEffect` has no `onCleanup` window). Any runtime helper returning a cleanup must have it captured by the bind function. Reference: `runtime-dom/src/props.ts` (`applyPropsWithRef`, `bindSpread`); locks `runtime-dom/src/tests/ref-in-dom-spread.test.tsx` + `.browser.test.tsx`, `compiler/src/tests/jsx.test.ts`.

---

### HTML-string DOM construction is SVG-blind unless the string is rooted at `<svg>`.

`template.innerHTML` parses a bare `<g>`/`<path>`/`<rect>` root in the HTML namespace, producing inert `HTMLUnknownElement`s. `_tpl` (`runtime-dom/src/template.ts`, `isSvgRooted`) parses SVG-rooted strings inside an `<svg>` wrapper and moves the children into the cached template. SVG `className` is a read-only `SVGAnimatedString`, so assigning it throws; the compiler emits `_setClass` (via `setAttribute`) in both backends. happy-dom implements neither behaviour, and `locator('svg path')` matches HTML-namespaced paths too. Assert `instanceof SVGPathElement`, `namespaceURI === 'http://www.w3.org/2000/svg'` and `getTotalLength() > 0` in real Chromium. Locks: `runtime-dom/src/tests/tpl-svg-namespace.browser.test.tsx`, `compiler-integration.test.tsx`, `e2e/app-showcase-flow.spec.ts`.

---

### A per-file gate cannot see cross-file collisions; add a cheap separate check.

`@pyreon/native-runtime-kotlin` verifies each file alone against stubs (`verify-kotlin.ts --service=X`), but examples compile `runtime-kotlin` and `router-kotlin` as one Gradle module, where duplicate top-level names fail with `Redeclaration:`. `packages/native/runtime-kotlin/scripts/check-duplicate-declarations.ts` scans every top-level `package::name` across both source roots. It runs unconditionally (outside the `kotlinc` guard and the CI-skip branch), keys functions on name + parameter list so overloads pass, and fails on an empty scan or missing root. A whole-source-set compile is not used because the per-module stubs deliberately disagree. Lock: `packages/internals/test-utils/src/tests/check-duplicate-declarations.test.ts`.

---

### A persistence API must not default to in-memory storage.

`useDatabase()` and `useStorage()` on native persist by default; an in-memory default silently loses data on relaunch. Rules:
  - Test persistence by constructing a second backend over the same directory, which is what a relaunch is. A facade round-trip, or an Android activity recreation (the process survives), proves nothing.
  - A real default replaces only the unconfigured backend. An app that installs its own backend (Room, an encrypted store) in `Application.onCreate` keeps it. Test the install policy in both directions.
  - Keep persistence logic and install policy in dependency-free files so `packages/native/runtime-kotlin/scripts/run-kotlin-tests.ts` executes them (it only runs modules importing no `androidx.*`/`android.*`/`kotlinx.*`). The JSON codec is hand-written because CI compiles against minimal stubs, where a stubbed JSON library would make assertions vacuous.
  - Reference: `packages/fundamentals/hooks/native/swift/PyreonDatabase.swift` (`FileDatabaseBackend`), `packages/fundamentals/hooks/native/kotlin/com/pyreon/runtime/PyreonDatabase.kt`, `packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonStorageBackends.kt`.

---

### An object literal PMTC cannot type must warn, not fall back to a tuple.

Struct synthesis needs a type for every field. A tuple fallback is invalid Kotlin (named arguments with no constructor) and a non-`Codable` Swift value that compiles and encodes wrong bytes. Shapes that defeat synthesis: an empty array field (`{ nodes, edges: [] }`), a lone empty array, a `null`/`undefined` field, a nested empty array, a mixed-type array, an array of arrays. The emitters warn at the bail site (`warnUntypeableObjectLiteral`, reason from `expr-utils.ts:explainUntypeableField`), which covers the whole class. The remedy is an annotated declaration (`signal<Shape>({…})`, `const x: Shape = {…}`), which lowers to a real struct on both targets. An object/array literal passed to `<WebView data={…}>` is JSON, not a model: it lowers to compile-time JSON with runtime parts interpolated (`buildJsonLiteralParts`); a non-literal keeps `encode(expr)`. A warning count is not a compile; `scripts/check-native-coverage.ts` webview-host entries carry snippets with real payload shapes so the compile pass exercises them.

---

### A recognizer with a nominal target type must warn on its own fall-through.

PMTC lowers `db.insert(collection, { id, fields: {…} })` to a `PyreonRecord`. A flat literal like `{ id, description, amount }` falls through to generic struct synthesis, which succeeds (every field is typeable) and produces `__Obj0`. Swift and Kotlin are nominally typed, so the call fails to compile on both targets while `warnUntypeableObjectLiteral` stays silent. "No struct could be synthesized" and "the synthesized struct is not the required type" are separate failure classes. Reference: `warnDatabaseInsertShape` in `emit-swift.ts` and `emit-kotlin.ts`; lock `native/compiler/src/tests/native-database-insert-record.test.ts`.

---

### Key a Compose `pointerInput` block on every composition value it reads.

`pointerInput(Unit)` starts its coroutine once, so plain `val`s recomputed on recomposition (spec, range, layouts) stay at their first values. Key the block on them (`pointerInput(pyreonSpec, pyreonZoom)`) or read them through `rememberUpdatedState`; only delegated state (`var x by remember { mutableStateOf(…) }`) reads live from an unkeyed block. SwiftUI re-binds `let`s on each body evaluation, so iOS does not have this bug. Inside a drag, read `positionChange()` before `consume()` — consuming first makes the delta zero. In device tests, assert the state a gesture changes (lower `onZoom` to text) before asserting a downstream tap, so a failure names the broken half. Reference: `emit-kotlin.ts` (plot host `tapKeys`, navigator/brush `awaitEachGesture` drags); locks `native/compiler/src/tests/chart-hosts.test.ts` and the `native-tasks` device tests (`stats-zoom`).

---

### A nesting-hazard check must walk the whole subtree.

A `<For>` lowers to a Compose `LazyColumn`, which throws at measure time ("measured with an infinity maximum height") anywhere under `Column(Modifier.verticalScroll())`, not only as a direct child. `<Scroll><Stack><Text/><For/></Stack></Scroll>` is the ordinary case. A nested lazy-only `<Scroll><For/></Scroll>` is unwrapped by the `lazyOnly` fast path into a bare LazyColumn and still crashes; only a nested mixed `<Scroll>` keeps its own modifier and is a real boundary. A nested `<Stack>` with no `<For>` must stay silent. Reference: `emit-kotlin.ts:containsLazyListDeep`; lock `native/compiler/src/tests/native-scroll-lazy-nesting.test.ts`.

---

### A one-statement-block fast path must exclude non-expression statements.

`() => { count.set(1) }` collapses correctly. `() => { flow.config.reducedMotion = false }` is an assignment, which `parseExpr` rejects, so the handler emitted empty on both targets. Key such fast paths on what the target form can hold, not on statement count. Lock: `native/compiler/src/tests/native-single-assignment-handler.test.ts`.

---

### Sanitise an identifier derived from a user string once, at the parse boundary.

Store ids like `'native-flow-probe'` became `PyreonStore_native-flow-probe`, which neither compiler accepts. `parse.ts` normalises the id with `replace(/[^A-Za-z0-9_]/g, '_')` where it enters the IR, which covers every emit site. Lock: `native/compiler/src/tests/native-store-id-identifier.test.ts`.

---

### Renderer parity needs pixel and frame assertions, not only existence and label checks.

Three flow-renderer divergences passed every compile gate:
  - SwiftUI `.preferredColorScheme(.dark)` propagates to the whole window. Scope dark mode with `.environment(\.colorScheme, …)` on the subtree and paint from an explicit palette. The compiler re-applies the mode over `<Panel>` overlays stacked beside the canvas.
  - The Compose root `Box` must `fillMaxSize()`, matching the web's `.pyreon-flow { width: 100%; height: 100% }`; otherwise the canvas wraps to its content.
  - Compose edge labels must be centred on the label point (web `translate(-50%, -50%)`, Swift `.position`), or the label background hides the target-end marker.
  - Per target, assert at least one painted colour count in a real screenshot and one frame relation. Check what else a scoped modifier (`preferredColorScheme`, `MaterialTheme`) reaches.

---

### Native renderers must lay out in density-independent units.

The Compose flow view once measured in raw px, so a 150-unit node was tiny on a 420dpi phone and 48dp resizer hit boxes covered the node (Compose delivers taps to the topmost sibling). Convert at the view boundary: offsets `graph × density`, sizes `graph.dp`, drag deltas `/ density`, and scale the edge/background/minimap canvases by `density`; keep the engine in graph units. Related Compose behaviour:
  - `detectDragGestures`' first delta excludes touch slop, so summing deltas ends one slop short. Track `change.position`.
  - A pinch detector on a background sibling never sees a pinch starting over content. Observe two-pointer gestures on the container in `PointerEventPass.Initial`.
  - A node that also handles double-tap resolves a single tap after the double-tap timeout. Tests must wait for the selection.

---

### Convert a dp constant to px before mixing it with zoom-scaled flow units.

A 48dp touch floor written as `48.0 / zoom` and sized with `with(density) { hitSize.toFloat().toDp() }` treats the value as px: correct at mdpi, 18dp at 420dpi. Use `with(density) { 48.dp.toPx() } / zoom` so the layer's zoom scale restores 48dp on screen. A device assertion that passes on one density profile is not proof.

---

### Give a native WebView an explicit size.

`AndroidView` gives `WebView` WRAP_CONTENT params, so the viewport sizes to content and a hosted `height: 100%` page gets `clientHeight = 0`. A Compose `defaultMinSize` does not reach the View (AndroidView measures exactly only when min == max). Use `MATCH_PARENT` in the factory and an exact default height of 150 (the web `<iframe>` fallback) when nothing upstream sizes the host; iOS gets the same default as `idealHeight`. Semantics sizes and `performTouchInput { center }` describe the visible, clipped part, so inspect the page itself via WebView DevTools (`adb forward … localabstract:webview_devtools_remote_<pid>`). Reference: `packages/fundamentals/hooks/native/kotlin/com/pyreon/runtime/PyreonWebView.kt`.

---

### Call `performScrollTo()` before interacting with a node on a scrollable Compose page.

A `<Scroll>` page lowers to a `verticalScroll` Column that keeps every child composed, so `assertTextEquals` reads nodes past the fold while `performClick` on them silently does nothing (the tap is injected at off-screen coordinates). On iOS the equivalent failure is loud (`kAXScrollToVisibleAction`) and `<Scroll>` alone fixes it. An assertion whose expected value equals the default cannot tell you the click landed.

---

### Do not spread an optional object in a file that crosses to native.

`{ a: "x", ...o }` with `o: Opts | undefined` is legal TypeScript, but the Swift emit (`var c = o; c.a = "x"`) and the Kotlin emit (`o.copy(a = "x")`) do not compile. Build the object field by field (`upColor: options?.upColor ?? theme.positive`). The emitters warn by name (`expr-utils.ts:isNullableType`/`optionalSpreadWarning`) and leave the emit unchanged, because the defaults for unnamed fields are not knowable there. `{}` warns separately. Lock: `native/compiler/src/tests/optional-spread-warns.test.ts` (non-optional spreads stay silent).

---

### Kotlin validation stubs mask androidx symbols the real Gradle build cannot resolve.

The `validate-kotlin` loop concatenates `kotlin-stubs.ts` into the compiled file, so any stubbed symbol resolves with or without an `import`. The real build (`packages/native/cli` → `gradle assembleDebug`) has no stubs. `androidx.compose.ui.*` is a single-package star import and does not cover sub-packages (`androidx.compose.ui.graphics.Color`, `androidx.compose.foundation.shape.RoundedCornerShape`, …).
  - Every emitted androidx symbol outside the unconditional star imports needs an arm in `packages/native/cli/src/build.ts:conditionalKotlinImports`, keyed on its emitted text, added in the same change. Locks: `cli/src/tests/build.test.ts` and `build-import-arms-and-scanners.test.ts`.
  - A stub must mirror the real library's surface exactly. A superset stub masks errors: `<Heading>` once emitted Material 3 `headlineLarge` against the Material 2 base. `emit-kotlin.ts:HEADING_TYPOGRAPHY` uses M2 names (`h4`/`h5`/`h6`/`subtitle1`/`body1`/`body2`), and `kotlin-stubs.ts` lists exactly the M2 `Typography` members (`h1`–`h6`, `subtitle1/2`, `body1/2`, `button`, `caption`, `overline`).
  - Treat a validate-green, device-red Kotlin failure as this class by default.

---

### Every tag in an enumerated family must be claimed by exactly one table.

Put a new member in the decline table by default, never in no table. `isChartHostTag` once missed `MapChart`, so it fell through to the generic component emit and produced a symbol that exists on no target. Check a per-class policy against each member's actual capability: a "tooltip lowers everywhere" policy was false for Parallel, and rich-hit `onSelect` vanished on hosts whose tap matched only `selectindex`. Reference: `packages/native/compiler/src/chart-hosts.ts` (`UNLOWERED_CHART_HOSTS`, `chartChromeUnlowered`, `chartRichSelectWarning`); lock `native/compiler/src/tests/chart-native-parity.test.ts`.

---

### A lowering is only shipped if an app can import it and use it.

PMTC dispatches on tag names, so an emit test with a bare tag proves the lowering, not its reach. `<Transition>`/`<TransitionGroup>` lowered on both targets but were exported only from `@pyreon/runtime-dom`, which native flags web-only. They are now exported from `@pyreon/primitives` (`packages/core/primitives/src/web/{Transition,TransitionGroup}.tsx`, `types/animation.ts`). Rules:
  - Test the import path a real app writes, and assert it emits zero warnings.
  - Guidance that claims a capability must name the import, not the tag, and its test must assert the package's own rationale (the blanket web-only suffix already mentions `@pyreon/primitives`).
  - A lowering whose only in-tree use is a declaration is unmeasured. String-literal union aliases lower to enums, and the comparison emit once rewrote literals only for enum-typed signal reads; parameters, struct fields and left-hand literals emitted `p == "top"`, which fails on both targets. The two-tier detection (`enumTypeOfExpr` in both emitters) now covers every operand shape. An enum name that never reappears in generated output means the use path is unexercised.
  - Known limitation: the inference ctx's struct table is built per component, so a file of top-level helpers (such as a generated engine) types member reads as `unknown`. Seeding a file-scope ctx is not free — it changes which Int×Double coercions fire.
  - Locks: `primitives/src/tests/transition.test.tsx`, `native/compiler/src/tests/native-transition-primitives-import.test.ts` (emit byte-identical to the bare-tag form), `native/compiler/src/tests/enum-comparison-lowering.test.ts`.

---

### Support every spelling of an idiom, not just the one in front of you.

`<Text>{() => shout()}</Text>` was unwrapped, but `<Text>{shout}</Text>` with `const shout = () => …` emitted the function: a Swift warning with garbage output, a Kotlin error (`function invocation 'shout()' expected`). Enumerate inline vs named, called vs referenced, literal vs const-bound. Scope the rewrite to child/text position and zero arity; a bare reference in prop position (`onPress={handler}`) must stay a reference. A shape that only warns on swiftc is invisible to a `-typecheck` gate, so treat a Swift warning as a failure when the Kotlin twin errors. Reference: `emit-swift.ts:_zeroArgFnNames`/`resolveAccessorChild` and the `emit-kotlin.ts` mirror; lock `native/compiler/src/tests/native-text-bare-fn-accessor.test.ts`.

---

### A type annotation must not override evidence in the initializer.

A TS `number` has no Int/Double distinction; default to Int only when nothing else is known. `signal<{ id: number; price: number }[]>([{ id: 1, price: 2.5 }])` must yield `price: Double`. An inline object type has no `StructIR` at parse time, so every pass that resolves element types must handle both named and anonymous shapes (`parse.ts`: `refineStructFloatsFromInitializers`, `refineInlineObjectFloats`, `refineReduceSeedFloats`). Swift `reduce(0, …)` coerces the literal to Double while Kotlin `fold(0, …)` binds Int, so only a both-toolchain gate sees ordering mistakes. Lock: `native/compiler/src/tests/native-inline-object-float-fields.test.ts` (annotated and bare spellings emit identically).

---

### Widen every spelling of a float accumulator.

A fractional value accumulated into an integer-seeded binding appears as a signal (`widenFloatSignals`), a `reduce` seed (`refineReduceSeedFloats`) and a local (`let acc = 0; for (…) acc += it.price`, `widenFloatLocals` in `infer-type.ts`). `0.0` is `Number.isInteger`, so a user cannot spell a Double seed. When you add an IR marker (the literal `float` flag), make every consumer read it; `inferType` must honour `expr.float` or the emitted return type stays `Int`. Lock: `native/compiler/src/tests/native-accumulator-float-seed.test.ts`.

---

### When a JS contract is wider than the native one, narrow it explicitly.

A JS comparator returns any number and only its sign matters; Kotlin `Comparator.compare` must return `Int`, so `sort((a, b) => a.price - b.price)` failed on Android. The Kotlin `case 'sort'` in `emit-kotlin.ts` narrows only when the body infers as float, so Int comparators emit unchanged and non-numeric bodies are untouched. Swift converts to the `Bool` `sorted(by:)` wants and compiles either way; passing on one target is no evidence about the other. Lock: `native/compiler/src/tests/native-kotlin-double-comparator.test.ts`.

---

### Declining to lower a shape must be observable.

An unmapped method falls through to a verbatim emit, which can fail on one target and silently mean something else on the other. JS `replace(string, string)` replaces the first match only: it lowers to Kotlin `replaceFirst` and to a Swift IIFE over `replacingOccurrences(of:with:options:range:)` bounded to `range(of:)`, evaluating the receiver once. If no faithful mapping exists, emit a named warning plus a safe fallback (as regex literals do). When a method lowers, also add it to the string return-type table in `infer-type.ts` (`replaceAll` and `repeat` were missing, so wrapping helpers returned Void). Lock: `native/compiler/src/tests/native-string-replace-first.test.ts` (string-shape assertions cover the target that compiles the wrong function).

---

### Build runtime URLs at runtime when the web does.

An `@pyreon/http` endpoint with a runtime path param (`getUser.query({ params: { id: props.userId } })`) lowers to native string interpolation plus a runtime encoder (`parse.ts:resolveEndpointParts`, `allowRuntimeParams`; `PyreonURL` in both runtimes). A diagnostic describing the compiler's limitation rather than the user's mistake is a design question. Rules:
  - `useQuery` lowers to a harness keyed on the query key, so it re-fetches when the value changes. `useFetch` lowers to a one-shot task, so it keeps bailing, and the warning names `useQuery`.
  - The runtime value must reach the cache key as well as the URL, or every id shares one cache entry.
  - The native encoders must match `encodeURIComponent(String(value))`. `native-url-encoder-parity.test.ts` extracts them verbatim from the runtime source, compiles with the real toolchains and compares byte for byte. Wrong primitives that compile: Kotlin `URLEncoder.encode` (space → `+`), Swift `.urlPathAllowed` (allows `/&+=`), `CharacterSet.alphanumerics` (passes non-ASCII letters).
  - Lock: `native/compiler/src/tests/native-runtime-path-params.test.ts`.

---

### A coverage exclusion that points at another environment needs a gate in that environment.

The charts node config excludes the canvas hosts as covered in real Chromium. `packages/fundamentals/charts/vitest.browser.config.ts` collects coverage over exactly that exclusion list with measured, ratcheting thresholds; keep the two lists in sync. When many components share a host, drive every one through the whole host surface in one parameterised spec (`src/engine/host-sweep.browser.test.tsx`: paint, a11y, tooltip hit/miss/leave, click and keyboard select, export), so a host that forgets a hook fails by name. Before a real-pointer Playwright interaction, call `scrollIntoViewIfNeeded()`.

---

### Chart engine files are Swift and Kotlin source with TypeScript spelling.

Files in `ENGINE_FILES` pass `tsc` and the web suite but must also compile through `native/compiler/src/tests/native-chart-engine-generated.test.ts` (real swiftc + kotlinc). Run it locally and fix at the idiom level, never with `// native: skip`. Rules:
  - A named string-literal union alias lowers to an enum, so `cfg.xLabels ?? 'auto'` does not compile. Write literal unions inline in engine fields; keep named aliases in the web props layer.
  - `Math.ceil`/`Math.floor` return Double on both targets. Walk the ratio or bin edges with a bounded count loop (`ceilRatio`, `countToDouble`).
  - A typed empty-array `let` lowers to a Kotlin `val`; initialise in one expression instead of reassigning.
  - A Swift subscript is never optional, so `arr[i] ?? d` is dead code. Bounds-check (`i < arr.length ? arr[i]! : d`). Coalesce an optional before comparing it (`v > 0.0` on `Double | undefined` is an error).
  - Reference: `packages/fundamentals/charts/src/engine/{layout,render,stack,bin}.ts`.

---

### Verify published state fully; retry only transient publish errors.

Sentinel sampling reported `OK` while six native packages lagged a release by a month. Rules:
  - `scripts/check-published-state.ts` compares every published package against npm (`classifyLag`).
  - `scripts/publish-retry.ts` retries E422 provenance-verification errors, 5xx and dropped sockets. It never retries a 404 (no Trusted Publisher), a 403, or the cannot-publish-over conflict (which is success).
  - `release.yml` `resume-detect`/`resume-publish` re-run publishing for a lagging version, built from the release tag, never from main.
  - Locks: `packages/internals/test-utils/src/tests/check-published-state.test.ts`, `publish-retry.test.ts`.

---

### A gate's input set is a claim; scan everything it governs.

`scripts/check-ci-job-timeouts.ts` checks every job in every workflow, because jobs without `timeout-minutes` run on GitHub's 6-hour default and a hung one holds a runner slot. The parser skips `on:` sub-keys (`push:`, `schedule:`) and accepts a `${{ … }}` expression as a declared budget. Lock: `packages/internals/test-utils/src/tests/check-ci-job-timeouts.test.ts`.

---

### Normalize a platform difference only through a signal the platform actually gives you.

A web `WakeLockSentinel` is released when the document hides and is not reacquired; native `isIdleTimerDisabled`/`FLAG_KEEP_SCREEN_ON` survive backgrounding. `useWakeLock`'s web arm re-acquires on `visibilitychange` unless the caller released. It tracks caller intent separately from whether a lock is held, and it learns about browser releases only through the sentinel's `release` event. Lock: `packages/fundamentals/hooks/src/tests/useWakeLock.test.ts`. A gate validating a hand-maintained list against a directory must check both directions: `scripts/check-native-cosource.ts` fails on a declared file that does not exist and on an existing Kotlin file declared nowhere. SDK-dependent files are declared in `pyreon.native.kotlinSdkOnly`.

---

### Run a peer's serialization; do not re-implement it.

PMTC resolves literal `@pyreon/http` endpoint URLs at compile time with the same primitives the web's `buildUrl` uses: `encodeURIComponent` for path segments and a real `URLSearchParams` for the query (they differ: space → `%20` vs `+`, `'` literal vs `%27`). Use a function replacement for path params, because a string replacement interprets `$&`, `` $` ``, `$'` and `$$`. Assert byte-equality against the real `buildUrl`, not a hand-written table. Endpoint options: `json` lowers to `body` + `content-type`, `headers` lowers, and every other `EndpointArgs` field warns by name (`ENDPOINT_LOWERED_ARGS` classifies against the real type so a new field cannot be dropped silently). Runtime path params use `PyreonURL.encodePathParam`, which mirrors `encodeURIComponent`. Reference: `packages/native/compiler/src/parse.ts` (`encodePathParam`, `buildQueryString`, `ENDPOINT_LOWERED_ARGS`); locks `native/compiler/src/tests/native-http-url-parity.test.ts`, `native-http-endpoint-options.test.ts`.

---

### A lowering that renames a binding must emit an alias under the source name.

`const Todo = defineFeature({ name, schema })` emits `PyreonFeature_Todo` plus an alias `Todo`, like the sibling `PyreonFieldMeta`/`PyreonZodSchema` lowerings (inline schemas have no source name and no alias). Swift and Kotlin share one namespace for types and values, so a same-named user type still collides; the compiler warns by name for that shape. Emit tests must use the binding in a component body and compile the result; string assertions only show the emitter agrees with itself. When a recognizer declines, check what is emitted instead: an indirect `zodSchema(base)`/`arktypeSchema(base)` now warns (`parse.ts:warnUnloweredSchemaAdapter`) rather than emitting `z`/`type` verbatim. Locks: `native/compiler/src/tests/tier2-feature-emit.test.ts` (real swiftc + kotlinc) and `tier2-validation-emit.test.ts`.

---

### A validation stub stricter than the real runtime rejects correct emit.

Stubs must mirror the real surface: a superset masks breakage, a subset manufactures it. The real `PyreonPermissions` init defaults its parameter on both targets (`init(_ granted: Set<String> = [])`, `PyreonPermissions(granted: Set<String> = emptySet())`), and its Kotlin state is Compose `MutableState`. When a stub-gated emit fails, read the real runtime source before changing the emit. A stub added for one branch of an emit does not cover its siblings: `useStorage` lowers scalars to SwiftUI `@AppStorage` and structs to `@PyreonAppStorage`, and both need stubs. Reference: `packages/native/compiler/src/{swift-stubs,kotlin-stubs}.ts`; lock `native/compiler/src/tests/lowered-hooks-typecheck.test.ts`.

---

### Attach an emitted SwiftUI `.task` to a stable-identity view.

SwiftUI ties a `.task` to its host's identity. On a transparent `Group { if isPending { … } else { … } }` (what `<Suspense>`/`<ErrorBoundary>` emit) the modifier lands on the branch, so every loading/error flip cancels and restarts the task and the fetch never settles. `emit-swift.ts:emitSwiftComponent` wraps fetch-bearing component bodies in a `ZStack`. Kotlin's fetch harness is a `LaunchedEffect(Unit)` sibling and needs no wrapper. `swiftc -typecheck` cannot catch this; only a device run can. Locks: `native/compiler/src/tests/fetch-computed-shapes.test.ts` and the `examples/native-tasks-ios` `lifecycle-page` XCUITest (`lc-quote` and `lc-error` both render).

---

### Derive a package's own name and version from its `package.json`.

Hardcoded `registerSingleton('@pyreon/X', '0.24.6', …)` literals go stale on every release, which defeats the duplicate-instance error's version-skew report. Use `import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }` and `registerSingleton(__pkgName, __pkgVersion, import.meta.url)`. The build inlines only those two strings; dev reads the live file.

---

### Guard module-init reads of runtime-injected values.

Cloudflare workerd passes `undefined` for `import.meta.url` and hides `process`; other edge runtimes hide other values. A crash at module evaluation happens before any handler's `try/catch`. `packages/core/reactivity/src/singleton-sentinel.ts:normalizeLocation` returns `'<unknown>'` for a non-string or empty URL. Node always supplies `import.meta.url`, so test with `undefined as unknown as string`. Lock: `reactivity/src/tests/singleton-sentinel.test.ts` ("workerd / undefined import.meta.url").

---

### Never deliver a runtime build artifact only through the filesystem.

Workerd has no filesystem, so `readFileSync` of `template.html` failed and SSR silently shipped the dev entry. The Cloudflare adapter (`packages/zero/zero/src/adapters/cloudflare.ts`) reads the template at build time, inlines it into `globalThis.__PYREON_SSR_TEMPLATE__` in `_worker.js`, then dynamic-imports the handler so the global exists before `createServer → readBuiltTemplate` runs; a static import would hoist above the assignment. `entry-server.ts:readBuiltTemplate` checks the global first and falls back to `readFileSync`. A Node smoke test has a filesystem and cannot catch this. Lock: `zero/src/tests/adapters.test.ts` ("inlines the built SSR template into a global BEFORE dynamic-importing the handler").

---

### Do not statically value-import a heavy package from a cheap entry point.

`@pyreon/lint`'s LSP module is re-exported from the package index and imported by `cli.ts`, so a top-level `import { analyzeReactivity } from '@pyreon/compiler'` cold-loaded the whole compiler for every CLI importer and timed out a CI hook. Keep types as `import type` and lazy-load the value (`packages/tools/lint/src/lsp/index.ts:loadAnalyze`: `_v ??= (await import('@pyreon/compiler')).analyzeReactivity`). Warm local runs hide this; a CI-only hook timeout on an unrelated `import('../X')` points here.

---

### Never emit a bare `import.meta.hot.accept()` for a module whose exports drive rendered DOM.

A callback-less self-accept re-evaluates the module but leaves the mounted DOM on the old closures and suppresses Vite's full-reload fallback, so the UI stays stale until a manual refresh. The accept callback must re-render with the fresh module Vite passes it, or call `import.meta.hot.invalidate()`. `packages/tools/vite-plugin/src/index.ts:injectHmr` calls `globalThis.__pyreon_hmr_swap__(<id>, freshModule)`, registered by `@pyreon/router`'s `_hmrSwap` and matched to the active lazy route via the `hmrId` that `@pyreon/zero`'s fs-router passes to `lazy()`. Use the namespace Vite passes to the callback; re-running the route's import thunk returns the old module. Lock: `e2e/zero-hmr.spec.ts` (needs a real dev server, browser and file edit).

---

### A catch-all dev middleware must pass through URLs owned by `server.proxy`.

Middlewares added with `server.middlewares.use()` inside `configureServer` run before Vite's internal stack, including the proxy (only the returned-function form runs after). Zero's dev SSR middleware and 404 handler accept any request whose `Accept` includes `text/html` or `*/*` (fetch's default), so they swallowed proxied requests. `packages/zero/zero/src/vite-plugin.ts` captures `Object.keys(resolvedConfig.server?.proxy ?? {})` in `configResolved` and `next()`s matching URLs with `matchesProxyContext`, mirroring Vite's `doesProxyContextMatchUrl` (`^` prefix = RegExp, otherwise prefix match, tested against the full `req.url` including query). It logs `[Pyreon] zero dev: honoring vite server.proxy for: …` once at boot. Dev precedence: fs API routes &gt; `server.proxy` &gt; SSR/404, matching production. Apply the same skip to every catch-all sharing the bug class. `isApiRoute` claims only `.ts`/`.js`, so an `api/*.tsx` page keeps dev SSR. Locks: `zero/src/tests/integration/dev-proxy.test.ts` (real dev server and backend), `proxy-context-match.test.ts`.

---

### Gate a caching or freezing `transform`-hook precompute on `isBuild`, and announce the dev no-op.

`transform` runs in `serve` and `build`. A precompute that is expensive, caches across the process, or freezes a value derived from HMR-editable source must not run in dev. The rocketstyle-collapse resolver starts a nested Vite SSR server (leaked in dev, since `closeBundle` never fires) and freezes styler classes that ignore theme edits. `@pyreon/vite-plugin` gates it `if (collapseEnabled && isBuild && !isSsr)`, with `isBuild = env.command === 'build'` set in `config()`, and prints one `this.info('[Pyreon] … is build-only …')` per process (`warnedDevCollapse`). Test with a `vi.mock`ed resolver so a missing workspace `lib/` cannot make the gate look irrelevant, and pair a `serve` spec with a `build` spec on the same source. Lock: `vite-plugin/src/tests/rocketstyle-collapse-dev.test.ts`.

---

### A nested build that reconstructs a plugin must carry the user's options across deliberately.

Zero's `ssg`/`ssr`/`isr` modes run a nested Vite build. It cannot reuse the outer `pyreon` instance (a second `configResolved` rewrites captured output paths — see `RE_ADDED_PLUGIN_NAMES`), and a bare `pyreon()` silently drops options such as `ssrTemplate`, which only affects the SSR graph. Either replay the config (`createServer` with no `configFile` override, as the rocketstyle-collapse resolver does) or reconstruct it explicitly. Not every option should be forwarded: `pyreon({ ssr: { entry } })` makes `config()` return `build.rollupOptions.input`, which beats the inline `build({ … })` argument and would hijack the sub-build. `packages/zero/zero/src/inner-pyreon-options.ts` classifies options with a total `Record<keyof Required<PyreonPluginOptions>, 'forward' | 'drop'>`, so a new option fails to compile (TS2741) until classified. Test at the call site: stub vite's `build`, capture the config the real `buildSsrBundle` passes, and read the options off the constructed plugin via its `api` (`PyreonPluginApi`). Lock: `zero/src/tests/ssr-build-forwards-pyreon-options.test.ts`.

---

### Rebuild `lib/` before debugging an example build's `MISSING_EXPORT`.

`vite.config.ts` imports resolve through the `node` condition (`lib/`), not `bun` (`src/`). Run `bun scripts/bootstrap.ts` (fast when clean). `bun install` runs it automatically, but edits between installs need a manual run.

---

### Always-on instrumentation must defer expensive work to read time.

Dev-mode capture (devtools registry, perf counters, tracing) runs for every event, but most events are never read. At capture, store only the cheapest primitive that allows reconstruction; resolve and memoize it in the read API; drop the primitive after resolving. `.stack` formatting, source-map resolution and `JSON.stringify` are much slower under CI parallel load than locally, so measure worst-case capture cost with a 10k-event micro-benchmark under CI conditions. Provide a `__resetXForTesting()` helper so a registry growing across tests does not cause threshold flakes. Reference: `packages/core/reactivity/src/reactive-devtools.ts` (`_captureCallerLocation` returns a `DeferredLocation { __deferred, err, skipFrames }`; `_resolveLoc(rec)` runs only from `getReactiveGraph`/`getFireSummaries` and memoizes onto `rec.loc`).

---

### Write a generated file only on change by reading first, never `existsSync` then write.

`existsSync` → `readFileSync` → compare → `writeFileSync` trips CodeQL `js/file-system-race` (TOCTOU), and the `existsSync` is redundant. Read inside `try/catch` (treat ENOENT as absent), compare, write. Do not suppress it via `codeql-config.yml` paths-ignore; that is for build-time code-construction false positives. Example: `packages/zero/zero/src/route-types-gen.ts:writeRouteTypes`.

---

### Call the canonical matcher; never add a second one for the simple case.

PMTC's emitted router dispatch compared static routes with `path == "/toolkit"`, which fails for `/toolkit?filter=done` (a `useUrlState` write). Stripping the query still disagrees with `matchPath` on trailing slashes and empty segments. Static branches now call `matchPath` exactly as dynamic ones do (`emit-swift.ts`/`emit-kotlin.ts` route dispatch). When a shape fix and a class fix both exist, bisect three ways (raw `==`, strip-then-compare, `matchPath`), and lock the absence of the second matcher, since both broken forms still call `matchPath` somewhere. Lock: `native/compiler/src/tests/static-route-uses-matcher.test.ts`.

---

### Escape the escape character first.

Escaping `|` in a Markdown table cell without first escaping `\` turns `\|` into `\\|`, which renders as an escaped backslash plus a live pipe (CodeQL `js/incomplete-sanitization`). Always `.replace(/\\/g, '\\\\')` before the delimiter, as `writer.ts:q()` does for string literals. In tests, count delimiters by walking the string and consuming `\X` pairs (a `(?<!\\)` lookbehind has the same bug), and include a fixture with exactly one backslash before the delimiter. Reference: `packages/tools/lathe/src/emit/docs.ts:mdCell`; lock `lathe/src/tests/docs-emit.test.ts` (`mdCells`).

---

### Every compiled `_setX` helper must restate the `setStaticProp` branches above it.

The compiled template path routes attributes by name straight to `_setAttr`/`_setValue`/`_setStyle`/`_setClass`/`_setHtml` and never calls `setStaticProp`, so any earlier branch must be restated in the helper. Current guarantees:
  - `_setAttr` blocks unsafe URLs (`href`, `src`, `action`, `formaction`, `data`, `poster`, `cite`) through the shared `isBlockedUrl` predicate in `runtime-dom/src/props.ts`, matching `h()` and SSR.
  - `_setValue` treats `undefined` as empty (`HTMLInputElement.value` maps `null` to `''` but not `undefined`).
  - `_setStyle` clears a string style on a nullish flip, as it does an object style.
  - Lock the paths against each other with a differential test over attribute × payload × &#123;compiled via real `transformJSX` + mount, `h()` mount, `renderToString`&#125;: `runtime-dom/src/tests/setx-superset-differential.test.tsx`. A childless element at module top level stays raw JSX and never reaches `_tpl`, so nest differential fixtures.

---

### Namespace `xlink:href`-style JSX attributes the way the HTML parser does.

`xlink:href` parses as `JSXNamespacedName`; each backend reads names through one qualified-name reader (`jsxAttrName` in `compiler/src/jsx.ts`, `jsx_attr_name` in `native/src/lib.rs`, returning `Cow` because the name must be built) for the bake, the dynamic setter and the prescan. Parsed markup (SSR bytes, the `_tpl` bake via `innerHTML`) gets XLink through the parser's "adjust foreign attributes" step; `setAttribute('xlink:href', …)` creates a null-namespace attribute that `<use>` ignores. `runtime-dom/src/props.ts:foreignAttrNamespace` reproduces the parser for assigned attributes. The table is closed (`xlink:href` namespaces; `xlink:custom` and `xml:base` do not) and applies only in foreign content (`<p xml:lang>` stays null-namespace). happy-dom auto-namespaces by prefix and masks the bug; assert in real Chromium with `getBBox().width`, since an unresolved `<use>` still carries the attribute. `transformJSX` prefers the native binary, so rebuild the `.node` and test each backend. Locks: `compiler/src/tests/native-equivalence.test.ts`, `runtime-dom/src/tests/namespaced-attributes.test.tsx` + `.browser.test.tsx`, `runtime-server/src/tests/namespaced-attributes.test.ts`.

---

### Fold `process.env.NODE_ENV` in Node SSR bundles.

Vite replaces it only in client builds, and `ssr.noExternal` bundles `@pyreon/*` into the server output with the reads intact. Under Node, `process.env` is a native interceptor (a getenv per read; bun's costs ~1ns), and the bare-gate convention puts several reads on hot paths such as signal create/read/write. `@pyreon/vite-plugin` folds the read to a same-length `"production"` literal in `@pyreon/*` package files during production SSR builds (`isPyreonPackageFile`; user code untouched, positions preserved). Open: an unbundled Node consumer importing `lib/` directly still pays the cost. Run micro-benchmarks under Node as well as bun (`scripts/bench/core/reactivity.ts --runtime node`). Lock: `vite-plugin/src/tests/ssr-node-env-fold.test.ts`.

---
