# @pyreon/compiler

## 0.35.0

### Minor Changes

- [#1636](https://github.com/pyreon/pyreon/pull/1636) [`8a4e195`](https://github.com/pyreon/pyreon/commit/8a4e19519bcf3dfebb203c97f69d08e3f7ac6b50) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native (multiplatform / PMTC) build-hazard detection across the doctor + MCP surfaces, so an AI/dev catches code that compiles for web but silently breaks the iOS/Android build.

  - **`pyreon doctor --check-native`** (new `native-audit` gate, also in the default fast set) scans `.tsx` files importing `@pyreon/primitives` for two hazards the `swiftc -parse` / `kotlinc`-stub gate can't catch: **web-only-package imports** (`@pyreon/charts`/`flow`/`code`/`dnd`/`document`/`query`/`table`/`virtual` + the CSS-in-JS UI stack — fix: host in `<WebView>` or use `@pyreon/primitives`) and **native-dropped top-level `interface`/`enum`/`class`** (fix: `type X = {…}` / string-literal union / functions). Scoped to multiplatform projects (skips gracefully otherwise); warnings only.
  - **MCP `validate`** now runs the same native detector per-snippet (the AI's per-keystroke feedback loop), firing only when the snippet imports `@pyreon/primitives`.
  - **`@pyreon/compiler`** exports `auditNative(cwd)` (project scan) + `detectNativePatterns(code, filename)` (snippet) + their types.

  Pairs with `get_pattern({ name: "multiplatform" })` and the `@pyreon/primitives` `get_api` entries so an AI has both the reference and the feedback to build a correct multiplatform app one-shot.

- [#1776](https://github.com/pyreon/pyreon/pull/1776) [`e8d945f`](https://github.com/pyreon/pyreon/commit/e8d945fe7a7c23307b0b7d88eeb4cc060224b3a5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `analyzeValidate()` + `emitValidator()` — compile-time specialized validators for `@pyreon/validate` (the build-time analogue of the runtime JIT). `analyzeValidate(code)` reads `s.*` schema definitions from source and parses each into a typed IR (`ValidateSchemaInfo` — `string`/`number`/`boolean`/`literal` primitives with their common checks, plus `object`/`array` composition and `.optional()`); it's conservative — any unrecognized shape becomes an `unsupported` node and the schema's `emittable` flag is false, so a partial understanding never yields a wrong validator. `emitValidator(node)` emits a monomorphic, fully-inlined validator function source for an emittable IR (typia-class straight-line `typeof`/regex/comparison checks — no op-array traversal). Pure, deterministic, TS-compiler-API based; mirrors the `analyzeReactivity` sidecar. Wiring the emit into `@pyreon/vite-plugin` is a follow-up.

- [#1792](https://github.com/pyreon/pyreon/pull/1792) [`ee9b328`](https://github.com/pyreon/pyreon/commit/ee9b32875104b8759c2aa180cb6d00d62fa681de) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `analyzeValidate` now reports `topLevel: boolean` on each `ValidateSchemaInfo` — true iff the schema is a module-level declaration (`VariableDeclarationList → VariableStatement → SourceFile`). Consumers that emit a module-end `name._attachCompiledVerdict(…)` (the `@pyreon/vite-plugin` verdict pass) use this to skip function/block-scoped schemas, which would otherwise be a ReferenceError at module load. Additive, non-breaking.

### Patch Changes

- [#1826](https://github.com/pyreon/pyreon/pull/1826) [`b3957fa`](https://github.com/pyreon/pyreon/commit/b3957fa6f913410e90f917ebce560a1bf85c2dd8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix Rust-backend JSX-compiler divergences from the JS oracle, found via a 644-file real-corpus dual-backend byte-diff sweep:

  - **Text-vs-vnode child classifier made generic (whole-class fix).** The JS oracle classifies a JSX child as a vnode (`_mountSlot`) vs text (`_bind .data`) via a generic walk over every descendant node; the Rust `contains_jsx_in_expr` was a hand-rolled partial mirror that missed nested-JSX shapes and rendered `[object Object]` — `obj?.map(x => <jsx/>)` (JSX in an optional-chained call's args) and IIFEs `(() => { … return <jsx/> })()` (JSX in the call callee). Both were the same class, so rather than patch shapes one at a time the classifier now uses an `oxc_ast_visit::Visit` walker that matches the JS oracle by construction (both visit every node), eliminating the entire class including shapes not in the corpus.
  - **`.map`/any-CallExpression-argument callback params** were over-bound as reactive props: a bare item read like `{item.label}` in a compiled element emitted a wasteful per-row `_bind()` renderEffect instead of static `textContent`, because the item-param carve-out only covered direct JSX-child render callbacks, not nested `.map`-arg callbacks.

  Both backends are now byte-identical for these shapes, locked by `corpus-sweep regressions` fixtures in `native-equivalence.test.ts` (bisect-verified).

- [#1629](https://github.com/pyreon/pyreon/pull/1629) [`f1e46fb`](https://github.com/pyreon/pyreon/commit/f1e46fb08da6a0fdf03f1eab8abc95ad0643def1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix `dangerouslySetInnerHTML` in the compiled template fast path. When an
  element carrying a reactive/forwarded `dangerouslySetInnerHTML` (e.g.
  `<div dangerouslySetInnerHTML={props.html} />`) was template-ized into a
  `_tpl()` (any multi-element static tree), the binding was emitted as a generic
  `el.setAttribute("dangerouslySetInnerHTML", value)` — stringifying the
  `{ __html }` object to `dangerouslysetinnerhtml="[object Object]"` and leaving
  the element EMPTY. SSR rendered the content correctly, so it "blinked" then
  vanished the instant the client rendered the template (visible on any SSG/SSR
  page with a Shiki code block, `@pyreon/zero-content` docs, etc.). Both the JS
  and Rust backends now mirror the runtime `applyStaticProp`:
  `el.innerHTML = value.__html`. (`class`/`style` were already special-cased; this
  extends the same fix to `dangerouslySetInnerHTML`.)

- [#1838](https://github.com/pyreon/pyreon/pull/1838) [`d2d3cb4`](https://github.com/pyreon/pyreon/commit/d2d3cb4a6f585a59333ef5c28c1ba4eefa10e4ea) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix `emitValidator` crashing on nested arrays — under `pyreon({ compileValidators: true })` this silently false-rejected every input.

  A schema with two `array` nodes on one root-to-leaf path (`s.array(s.array(...))`, `s.object({ rows: s.array(s.array(...)) })`, etc.) emitted colliding loop variables: every array level used `__i`/`__e`, so the inner `const __e = __e[__i]` self-referenced the outer `__e` in the inner block scope → `ReferenceError: Cannot access '__e' before initialization` (TDZ) thrown for **every** input. Under the vite-plugin's compiled-verdict wiring the throw is swallowed by the verdict try/catch, so `Schema.is(validInput)` returned `false` while `Schema.parse(validInput).ok` returned `true` — a silent, total false-reject.

  Fix: thread an enclosing-array `depth` through `emitNode` so each nesting level names its loop vars `__i<depth>` / `__e<depth>`. Sibling arrays at the same depth keep the same name (they live in separate `for` block scopes — correct); only nested arrays now get distinct names. Locked by new nested-array cases in the emit⟷runtime equivalence corpus.

- [#1642](https://github.com/pyreon/pyreon/pull/1642) [`544c425`](https://github.com/pyreon/pyreon/commit/544c425b6bcf95f772ea04a5e740fb27fa6938d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Dependency refresh + Toaster lint annotation

  - **`@pyreon/toast`**: annotated the Toaster's `aria-live` region with a rule
    suppression + rationale for oxlint 1.70's new
    `jsx-a11y/no-noninteractive-element-interactions` rule. The labeled live
    region is the accessibility mechanism (toasts are announced + dismissable);
    pause-on-hover is an intentional mouse-only enhancement on top of it, not a
    clickable control. No behavior change.
  - **`@pyreon/compiler` / `@pyreon/lint`**: bump the `oxc-parser` (+ `oxc-transform`)
    runtime dependency range to `^0.137.0` (was `^0.133.0`). No API change in the
    affected surface — the full compiler (1603) + lint (993) test suites pass.

  Dev-tooling was also refreshed to latest in-range (vitest 4.1.9, playwright
  1.61, esbuild 0.28.1, oxlint 1.70, oxfmt 0.55, happy-dom, etc.) — not
  consumer-affecting.

- [#1648](https://github.com/pyreon/pyreon/pull/1648) [`1c98f38`](https://github.com/pyreon/pyreon/commit/1c98f3863ccd2fd16a4ad6e20e82fb778725bca0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Three allocation fast paths in the template/mount hot paths (per-instance closure & array reductions)

  - **`@pyreon/compiler`** — a single-binding template returns its disposer
    directly (`return __d0`) instead of a per-instance wrapper closure
    (`return () => { __d0() }`). For the dominant `<For>`-row shape (a sole
    reactive-text child): ~97 B/row → ~948 KB + 10,000 fewer closure allocations
    on a 10k-row list. Both JS + Rust backends, byte-identical.
  - **`@pyreon/runtime-dom`** — `_rsCollapseH` uses an inline-first handler-disposer
    slot (no array for the common 0/1-handler collapsed shape): ~57 B/row +
    10,000 fewer array allocations on a 10k single-handler-collapse list.
  - **`@pyreon/runtime-dom`** — `mountChildren`'s 3+-child path collects only real
    (non-`noop`) cleanups inline-first instead of `children.map(...)`: no array /
    wrapper closure for child sets yielding ≤1 real cleanup. ~169 B/call → ~1.6 MB
    on 10k mixed 3-child elements (the `h()`/component path).

  All behaviour-identical (proven by the existing compiler + runtime-dom suites)
  with added bisect-verified regression tests. A fourth candidate (reusing the
  batch flush's per-pass `_visitedThisPass` Set) was implemented, measured as a
  wash (`Set.clear()` is marginally slower than `new Set()` in V8; the GC benefit
  was unmeasurable), and reverted.

- [#1779](https://github.com/pyreon/pyreon/pull/1779) [`a8a8b41`](https://github.com/pyreon/pyreon/commit/a8a8b41ae001883710cd6cd4e4c367987dd6312d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `emitValidator` correctness fixes surfaced by the new cross-runtime equivalence gate (a corpus test in `@pyreon/validate` that builds each schema both as the real runtime `s` and via `analyzeValidate`→`emitValidator`, then asserts the accept/reject verdict matches for every input): the emitted `email` check now uses `@pyreon/validate`'s strict standard `EMAIL_RE` (2+ char TLD, no leading/consecutive dots) instead of a loose `^…@…\.…$`, and the `.nonEmpty()` string check is recognized under its real camelCase method name (was `nonempty`). Email/url/uuid regexes are now emitted from verbatim `RegExp` literals via `re.source`/`re.flags` so they can't drift from the runtime in transcription.

## 0.34.0

### Patch Changes

- [#1592](https://github.com/pyreon/pyreon/pull/1592) [`c0814b7`](https://github.com/pyreon/pyreon/commit/c0814b7881b01b7bfed19dffd7f48a3269c14199) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix reactive `class` and `style` bindings in the compiled template fast path.

  The template setter assigned the raw value to `className` / `style.cssText`, so several documented forms were silently broken — only correct through the slower `h()`/`applyProp` path:

  - `class={['a', cond() && 'b']}` rendered `class="a,b"` (comma-joined) instead of `"a b"` — the array was never passed through `cx()`.
  - `class={{ active: a() }}` rendered `class="[object Object]"`.
  - `style={() => ({ color: theme() })}` (the form the docs use) emitted `style.cssText = <object>` → `"[object Object]"` → **no inline styles at all**.
  - `style={{ color: theme() }}` applied once via a one-shot `Object.assign` and never updated on signal change; object styles also skipped number→px and stale-key removal.

  The compiled paths now match the runtime `applyProp` value-normalization exactly:

  - **class** → `typeof v === "string" ? v : _cx(v)` (string passthrough; array/object → `cx`). The injected `cx` import is aliased (`import { cx as _cx }`) so it can't collide with a hand-written component that already imports the public `cx`.
  - **style** → delegates to a new `_setStyle` runtime helper (`@pyreon/runtime-dom`, = `applyStyleProp`): string → `cssText`; object → per-property `setProperty` with kebab-casing, number→px, and stale-key removal; dynamic bindings wrapped in a reactive `_bind`.

  Fixed byte-identically in both backends (JS + Rust native; locked by the cross-backend equivalence suite) and verified end-to-end with runtime DOM mount specs + a real docs-site build. String class/style emit is behaviourally unchanged. Bisect-verified.

- [#1606](https://github.com/pyreon/pyreon/pull/1606) [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The Rust native backend now implements the DYNAMIC-prop rocketstyle-collapse
  variants (`__rsCollapseDyn` + the handler-combined `__rsCollapseDynH`) —
  byte-for-byte identical to the JS backend. PR 3/N of pairing collapse to Rust
  (builds on the full + on\*-handler-partial foundations).

  `detect_dynamic_collapsible_shape` composes TWO relaxations onto the full bail
  catalogue: an `on[A-Z]…` handler is peeled, AND exactly ONE prop whose value is
  a ternary of two string literals (`state={cond ? 'a' : 'b'}`) is captured as a
  DynamicCollapsibleProp. Two+ ternaries bail (2^N axis blow-up is a separable
  scope); zero ternaries defer to the other detectors. The emit expands the ternary
  into truthy + falsy resolver lookups, requires matching templateHtml (one `_tpl`
  reused across both values), builds the stride-2 value-major class array
  `[v0_light, v0_dark, v1_light, v1_dark]`, and emits `__rsCollapseDyn(html,
classes, () => (cond) ? 0 : 1, () => __pyrMode() === "dark")` — or the
  handler-combined `__rsCollapseDynH(…, handlerObj)`. Unions BOTH values' rule
  bundles (dedup by ruleKey). The dynamic paths set ONLY their own import flag
  (not needs_collapse), so the preamble gate widened to
  `needs_collapse || needs_collapse_dyn || needs_collapse_dyn_h` (matching JS).

  The JS force-route still routes collapse to JS until all variants land
  (element-child remains, then the force-route removal + vite-plugin native
  wiring). Verified: 11 cross-backend equivalence fixtures (no-handler / +handler /
  +extra-prop / brace-wrapped / complex-cond / multi-handler / half-resolved bail /
  template-mismatch bail / two-ternaries bail / non-literal-branch bail / rule
  dedup), all JS≡Rust; full compiler suite 1553/1553. Bisect-verified: disabling
  the dynamic fallthrough diverges 7 fixtures; restored → 324/324.

- [#1606](https://github.com/pyreon/pyreon/pull/1606) [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The Rust native backend now implements the ELEMENT-CHILD rocketstyle-collapse
  variant — byte-for-byte identical to the JS backend. PR 4/N of pairing collapse
  to Rust; this completes the compiler-side port of ALL four collapse variants
  (full / on\*-handler-partial / dynamic-prop / element-child).

  Element-child reuses the UNCHANGED `__rsCollapse` emit (NO new runtime helper):
  the resolver SSR-renders the REAL component WITH its child subtree and bakes the
  full output HTML, so the cloned `_tpl` template already contains the children.
  What's new in the compiler is the detection + keying:

  - detect_static_element_child: a recursively-static DOM-child validator —
    lowercase tag, string-literal attrs only (no spread/boolean/{expr}/on\*), and
    children that are static text or recursively-static elements.
  - collect_static_children: text normalized via the SHARED clean_jsx_text (so a
    resolver reconstruction renders byte-identically); expression/fragment/spread
    children bail.
  - serialize_static_children: deterministic C0-delimited serialization (mirror of
    the JS serializer; delimiters built from byte values so the SOURCE carries no
    raw control byte and no \u escape). Fed to the collapse key as childrenText so
    distinct subtrees get distinct keys (never colliding with a text-only key).
  - detect_element_child_collapsible_shape requires ≥1 element child (text-only is
    the FULL-collapse shape); try_element_child_collapse emits the keyed \_\_rsCollapse.
  - Orchestrator fall-through is now full → partial → dynamic → element-child.

  The JS force-route still routes collapse to JS — the remaining work is the
  force-route removal + the vite-plugin native config wiring (the live-enabling PR).
  Verified: 11 cross-backend equivalence fixtures (single / mixed-text+element /
  recursive-nesting / multi-prop / brace-wrapped / text-only→full / component-child
  bail / handler-child bail / expr-child bail / unresolved / dynamic-root bail), all
  JS≡Rust; full compiler suite 1564/1564. Bisect-verified: disabling the
  element-child fallthrough diverges 5 fixtures; restored → 335/335.

- [#1606](https://github.com/pyreon/pyreon/pull/1606) [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The Rust native backend now implements the FULL rocketstyle-collapse emission
  (`__rsCollapse`) — byte-for-byte identical to the JS backend. This is the
  foundation of pairing the collapse feature (previously JS-path-only) to Rust.

  Adds the resolved-collapse config across the napi boundary (a new optional 6th
  `transform_jsx` arg — `CollapseConfig` { candidates, sites, mode, … }; existing
  5-arg calls are unaffected), the FNV-1a collapse-key (UTF-16 code-unit hash,
  matching JS `charCodeAt`), the full-shape detector (string-literal props +
  text-only children), the `__rsCollapse` emit (with brace-wrap when the parent
  is JSX), and the imports + idempotent `injectRules` prologue.

  The JS `transformJSX` dispatcher still force-routes collapse to the JS backend
  (a file goes wholesale to one backend, so the route can only flip once ALL
  variants are ported); the remaining variants (partial `__rsCollapseH`, dynamic
  `__rsCollapseDyn`/`DynH`, element-child) + the force-route removal + the
  vite-plugin native wiring are follow-on PRs.

  Verified: a Rust FNV-key unit test against the JS oracle, + 8 cross-backend
  equivalence fixtures (top-level / fragment-child brace-wrap / multi-prop /
  unresolved / non-candidate / dynamic-prop bail / ruleKey dedup / JSON-escape),
  all JS≡Rust. Full compiler suite 1523/1523. Bisect-verified (disabling the
  collapse hook diverges 5 fixtures; restored → green).

- [#1606](https://github.com/pyreon/pyreon/pull/1606) [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Rocketstyle-collapse now RUNS on the Rust backend in production (PR 5/N — the
  live-enabling step that completes the port). The JS `transformJSX` dispatcher no
  longer force-routes collapse builds to the JS path; it lowers the
  `collapseRocketstyle` config from its `Set`/`Map` shape to the napi array/Record
  shape (`toNativeCollapse`) and threads it as `transformJsx`'s 6th arg. The native
  backend implements all four collapse variants byte-identically (locked by the
  cross-backend equivalence suite), so a collapse build now gets the native
  backend's 3.7-8.x× transform speed instead of falling back to JS.

  Output is unchanged (the feature is opt-in via `pyreon({ collapse: true })` and
  the emit is byte-for-byte identical across backends) — only the backend that
  produces it changes. The JS path remains the graceful fallback when the native
  binary is unavailable (it still reads the `Set`/`Map` config directly).

  Verified: full compiler suite 1571/1571; the `verify-modes ui-showcase × spa`
  collapse cell (real `vite build`, `pyreon({ collapse: true })`) builds the
  rs-collapse / dyn / elem probes through the native backend and the
  collapse-exclusive fingerprints hold. Bisect-verified: feeding native empty
  `candidates` makes the cell fail with the raw (non-collapsed) Button mount,
  proving the native+config path is what drives the real-build collapse; restored
  → green.

- [#1606](https://github.com/pyreon/pyreon/pull/1606) [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The Rust native backend now implements the on\*-handler PARTIAL rocketstyle-collapse
  variant (`__rsCollapseH`) — byte-for-byte identical to the JS backend. PR 2/N of
  pairing collapse to Rust (builds on the full-variant foundation).

  `detect_partial_collapsible_shape` is the EXACT full bail catalogue with ONE
  relaxation: an `on[A-Z]…` handler in a `{expr}` container is PEELED into the
  handler list (an event binding never changes the SSR-resolved styler class) while
  the literal-prop subset still feeds the UNCHANGED collapse key. The orchestrator
  falls through to the partial path only when the full shape is absent (a full shape
  with an unresolved key bails outright — it can never be a partial site). Emits
  `__rsCollapseH(html, light, dark, () => __pyrMode() === "dark", { "onClick":
(<sliced expr>), … })`, brace-wrapped as a JSX child; each handler expression is
  re-emitted verbatim from its source span (paren-wrapped). Sets both
  needs_collapse + needs_collapse_h (matching JS — a partial-only module imports
  both helpers; the unused one tree-shakes out).

  The JS force-route still routes collapse to JS until all variants land (dynamic +
  element-child remain). Verified: 8 cross-backend equivalence fixtures
  (top-level / brace-wrapped / multi-handler+multi-prop / comma-sequence body /
  handler-only / unresolved / non-handler-{expr} bail / zero-handlers→full), all
  JS≡Rust; full compiler suite 1542/1542. Bisect-verified: disabling the partial
  fallthrough diverges 5 fixtures; restored → 313/313.

- [#1600](https://github.com/pyreon/pyreon/pull/1600) [`ec41abf`](https://github.com/pyreon/pyreon/commit/ec41abf8c6aaf8dbf442fb6c8e194ab607238e77) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Element-conditional children now keep the `_tpl` cloneNode fast path.

  A DOM element wrapping an inline element-conditional —
  `<div class="card">{() => open() ? <Panel/> : <Empty/>}</div>`,
  `<section>{n() > 0 && <List/>}</section>`, or a `.map(x => <li/>)` child —
  previously bailed the whole wrapper to the jsx runtime (`h()`/`jsx()`).

  The compiler now templatizes the wrapper (`_tpl("<div class=\"card\"><!></div>", …)`)
  and routes the conditional child through `_mountSlot` + a `<!>` placeholder —
  the same path `.map`-returning children and element-valued-`const` children
  already take. The conditional child's own reactive boundary (`mountReactive`)
  is unchanged, so behaviour is identical; only the wrapper gains the cloneNode
  fast path. Inner JSX inside the conditional stays raw (compiled downstream by
  esbuild to `h()`), consistent with how all expression-nested JSX is handled.

  A DIRECT static JSX child (`<div>{<span/>}</div>`) is unaffected — it keeps its
  static-hoist path. Fixed byte-identically in both backends (JS + Rust native;
  locked by the cross-backend equivalence suite), with end-to-end runtime specs
  (reactive swap + disposal) in `@pyreon/runtime-dom`.

- [#1604](https://github.com/pyreon/pyreon/pull/1604) [`10bdb4a`](https://github.com/pyreon/pyreon/commit/10bdb4a449151a70ae2d1ffc1bf4a30f303c5bf0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix a cross-backend escaping divergence: the Rust native backend left a bare
  numeric "entity" like `&123;` (digits with no `#`) unescaped in static text,
  while the JS backend correctly escaped the `&` to `&amp;` (per the HTML
  char-ref grammar — `&123;` is not a valid reference). The two backends now
  agree: `escape_html_text` recognizes a valid char-ref only as `#<dec>`,
  `#x<hex>`, or `<letter><word*>` — matching the JS `escapeHtmlText` regex
  exactly. Locked by 11 new cross-backend equivalence fixtures covering the
  entity edge cases; bisect-verified (the fixtures diverge on the pre-fix Rust).

- [#1619](https://github.com/pyreon/pyreon/pull/1619) [`9335e1f`](https://github.com/pyreon/pyreon/commit/9335e1fe75df850ffa6434d3a8f956c4c3e46646) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix a JS↔Rust compiler parity gap: a prop-derived const read inside an inline
  event-handler / accessor function body was captured (stale) on the Rust native
  backend instead of inlined to the live prop source.

  `const a = props.x; <button onClick={() => send(a)}>` emitted `send(a)` on the
  native path (a captured at component setup — STALE) instead of `send((props.x))`
  (re-reads the live prop on each invocation). Because the dispatcher prefers the
  native backend, production apps shipped the stale-capture form — a real
  reactivity bug against the documented "const-from-props in JSX is reactive"
  contract. The JS backend already inlined correctly.

  Root cause: `accesses_props` returned `false` for ANY arrow/function, so the
  `slice_expr` gate never ran the inliner on a handler binding. The inliner
  (`collect_prop_derived_idents`) already matched JS once it ran. Added a
  gate-only `fn_body_accesses_props` that descends ONE level into a
  binding-function's body, mirroring JS `accessesProps`'s child-skip asymmetry:
  the body is descended, but NESTED functions stay skipped — so a function
  appearing as a CHILD (`foo(() => send(a))`) stays raw, exactly as JS. The
  `Arrow|Function => false` arm of `accesses_props` is unchanged.

  Bisect-verified (neutralizing the gate addition fails exactly the 4 "should
  inline" fixtures while the 5 "stays raw" fixtures keep passing; restored → all
  pass). Full compiler suite 1588/1588, 3 differential sweeps (108 shapes)
  0 divergences, typecheck clean, no cargo warnings.

  KNOWN remaining (documented, not a regression — both pre-date this change): a
  prop-derived const referenced inside a SEPARATELY-DECLARED named handler
  (`const f = () => send(a); onClick={f}`) or called via a local function in a JSX
  expression (`const f = () => i; {f()}`) still captures on the native path. JS
  inlines these by registering the function-valued const as prop-derived and
  either inlining its value at the binding (`{f}`) or rewriting its declaration
  (`{f()}`) — a coupled, larger feature (function-const registration with shadow
  filtering + a component-body statement-rewriting pass the native backend does
  not yet have). Scoped as a follow-up; the common inline-handler form ships here.

- [#1622](https://github.com/pyreon/pyreon/pull/1622) [`3ad3247`](https://github.com/pyreon/pyreon/commit/3ad32475b881b19792c010872fc31024b71b7acb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Close the two remaining JS↔Rust compiler parity gaps for prop-derived consts
  read inside SEPARATELY-DECLARED functions on the Rust native backend (the
  inline-handler form was fixed separately). The native backend captured (stale)
  where the JS backend inlined to the live prop source — and since the dispatcher
  prefers native, production apps shipped the stale form, a reactivity bug against
  the documented "const-from-props in JSX is reactive" contract.

  1. **Named handler / accessor reference** — `const f = () => send(a); onClick={f}`
     emitted `__ev_click = f` (closing over the stale captured `a`) instead of
     inlining `(() => send((props.x)))`. Root cause: `references_prop_derived` /
     `reads_from_props` had `_ => false` arms for arrow/function inits, so a
     function-valued const whose body read a prop-derived var (or props directly)
     never registered as prop-derived. Fix: a generic membership-only body walk
     (`fn_body_any_expr` + `stmt_any_expr`) in both registration helpers — matching
     JS, which descends into function bodies via `forEachChildFast` with NO shadow
     filter and NO nested-function skip (the precise shadow-aware substitution is
     the inliner's job).

  2. **Local function called in a JSX expression** — `const f = () => i; {f()}`
     emitted `_bindText(f, node)` (binding the stale `f`) instead of
     `_bindText((() => (props.start)), node)`. The `{f()}` nullary-call fast path
     (`try_direct_signal_ref`) raw-sliced the callee to avoid auto-calling signals;
     for a prop-derived `f` it now resolves the callee via `slice_expr` (inlines the
     value, no auto-call since `f` is not a signal).

  Edges verified byte-identical: a function reading props directly
  (`const f = () => props.x`) registers + inlines; a function locally shadowing a
  prop-derived name is over-registered exactly like JS (the inliner then leaves the
  shadowed name alone); a function reading neither stays a raw `f` reference.

  Verification: bisect-verified (neutralizing the registration + nullary-call
  changes fails exactly the 7 "should inline" fixtures while the "stays raw" fixture
  keeps passing; restored → all pass). Full compiler suite 1596/1596; a 370-check
  differential audit across ~18 syntactic categories × CSR + SSR + reactivity-lens
  span parity, plus 108 differential-sweep shapes — 0 divergences of any kind.
  typecheck clean, no cargo warnings. With this, there are NO known remaining
  JS↔Rust prop-derived parity gaps.

- [#1616](https://github.com/pyreon/pyreon/pull/1616) [`a9788cd`](https://github.com/pyreon/pyreon/commit/a9788cdfbebee4ea7468356c3fcea31a6857f11b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix three JS↔Rust compiler parity gaps in the Rust native backend's
  prop-derived / component-body handling (all surfaced by differential testing,
  each bisect-verified + locked with cross-backend equivalence fixtures):

  1. **Transitive prop-derived inlining** in arrow / function-expression
     components. `const a = props.x; const b = a + 1; return <div>{b}</div>` emitted
     `(a + 1)` on the native path (a captured, reactivity LOST) instead of
     `((props.x) + 1)`. Root cause: `find_init_expression_by_span` never descended
     into the component's arrow/function-expression body, so the recursive resolver
     fell back to raw source. Added `find_init_in_expression` descent.
     (Function-DECLARATION components masked it — their body was already descended.)

  2. **Function-EXPRESSION components** (`const C = function (props) { … }`) had
     their props baked STATIC (the walk arm deliberately skipped props registration)
     — now registered reactive like arrow + function-declaration components.

  3. **Default-exported arrow components** (`export default (props) => { … }`) hit
     the same transitive gap — the `ExportDefaultDeclaration` span-lookup arm only
     descended into `FunctionDeclaration`; now descends into a default-exported
     arrow/function expression too.

  Output is now byte-identical to the JS backend across all component-definition
  shapes (const-arrow, export-const-arrow, function-expression, function-declaration,
  export-default-arrow, export-default-function). Verified by new cross-backend
  fixtures + ~110 differential-sweep shapes (0 divergences) + full compiler suite
  1579/1579.

## 0.33.0

## 0.32.0

### Minor Changes

- [#1388](https://github.com/pyreon/pyreon/pull/1388) [`04525e1`](https://github.com/pyreon/pyreon/commit/04525e1dfc92ff4d7182818c3e9ddaddd8648cbc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon doctor --check-content` audit — defensive gate for `@pyreon/zero-content`-shaped apps. Mirrors the existing `--check-islands` / `--check-ssg` audits: project-wide cross-file detectors with file:line:column pointers and actionable fix messages, surfaced through the unified doctor pipeline.

  Three detector codes ship:

  - **`missing-frontmatter-title`** (error) — a `.md` file under a `pages` collection has no `title:` field in its YAML frontmatter. Every documented collection schema requires it for sidebar / SEO / route naming. The content() plugin catches this at build time; the audit catches it at edit time so authors don't ship a silently broken page.
  - **`broken-internal-link`** (error) — a markdown `[text](/path)` link where `/path` matches a collection's URL pattern but no entry with that slug exists. Users hit 404 at runtime; the audit catches it before commit so the link can be fixed alongside the referenced page's rename / removal.
  - **`orphaned-md-file`** (warning) — a `.md` file under `src/content/` (or `content/`) that isn't under any declared collection's `path`. The runtime ignores it silently; the user thinks the page is published but the build skips it. Severity is `warning` because it might be intentional WIP.

  Same pure-syntactic style as the existing `island-audit.ts` / `ssg-audit.ts` — TypeScript compiler API for parsing `content.config.{ts,mts,js,mjs}`, naive line-by-line walker for frontmatter + internal-link extraction. No type-check pass, no module resolution. False negatives acceptable; false positives must be rare.

  CLI:

  ```bash
  pyreon doctor --check-content          # legacy single-purpose flag (equivalent to --only content-audit)
  pyreon doctor --only content-audit     # canonical
  pyreon doctor                          # included in the default fast-gate set
  pyreon doctor --json                   # machine-readable
  pyreon doctor --gha                    # GitHub Actions annotations
  ```

  New exports from `@pyreon/compiler`: `auditContent`, `formatContentFindings`, `parseContentConfig`, `findContentConfigs`, `readFrontmatter`, `readTitleFromFrontmatter`, `deriveSlug`, `extractInternalLinks` (+ corresponding types `ContentAuditResult`, `ContentFinding`, `ContentFindingCode`, `ContentLocation`, `CollectionDecl`, `AuditContentOptions`).

  35 per-detector specs in `packages/core/compiler/src/tests/content-audit.test.ts` (bisect-verified: reverting the missing-title condition → 3 specs fail with `expect(codes).toContain('missing-frontmatter-title')`; restored → 35/35 pass).

### Patch Changes

- [#1540](https://github.com/pyreon/pyreon/pull/1540) [`edaea04`](https://github.com/pyreon/pyreon/commit/edaea04231fc33b585e785bda61e63c14663c045) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Sole-dynamic-text-child templates bake a single-space text node INTO the template HTML and bind via `.firstChild`, instead of `document.createTextNode("") + appendChild` per template instantiation (per ROW under `<For>`). Within-tree paired benchmark (60 pooled samples/op, only the emit flipped): the create-1k gap vs Vanilla closes from +700µs to ZERO (Pyreon 9.30ms [9.20–9.40] = Vanilla 9.30ms), replace-all gap from +500µs to zero, append-1k→10k −1.2ms. Correct by construction: whitespace-only text survives innerHTML parsing in every element context (including table foster-parenting, which exempts whitespace-only runs), and every binding path writes the initial value synchronously at bind time, so the space never renders. Mixed-content keeps the comment+replaceChild shape (adjacent baked text runs would merge during parsing). Implemented byte-identically in both backends (JS + Rust native).

- [#1501](https://github.com/pyreon/pyreon/pull/1501) [`f6f54a2`](https://github.com/pyreon/pyreon/commit/f6f54a254e43f3b36a4c55581381ab582322990e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Compiler no longer emits a wasteful per-row `_bind()` renderEffect for static item-property reads inside `<For>`/`<Index>`/render-callback children. A render callback's first parameter (`<For>{(row) => …}</For>`) is a runtime ITEM the framework passes per row, NOT reactive component props — so a bare property read like `{String(row.id)}` is provably static (Pyreon reactivity is via signal CALLS, e.g. `row.label()`) and is now baked as a one-time `textContent =` assignment instead of a `_bind(() => …)` effect.

  Previously `maybeRegisterComponentProps` registered the callback's first param as reactive props (because the callback returns JSX), making every bare item-property read look reactive. For a 1,000–10,000-row list that meant 1,000–10,000 unnecessary `renderEffect` allocations + disposer closures, each retained until the row unmounts — a real per-row CPU + retained-heap cost. Signal-valued item reads (`row.label()`, `() => row.x`) and real components (`function Row(props) { return <td>{props.x}</td> }`) are unaffected and stay reactive.

  Fixed in both the JS and Rust (native) backends — byte-identical output, all cross-backend equivalence tests pass. Attribute-value render functions (`component={(p) => …}`) are NOT affected (they can be real inline components receiving props).

- [#1541](https://github.com/pyreon/pyreon/pull/1541) [`73436e7`](https://github.com/pyreon/pyreon/commit/73436e782319940abde41200299489a809de70d5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix two `pyreon doctor` audit detectors that produced false-positive ERRORS across the monorepo.

  - **`auditContent` (content-audit gate) — per-config link scoping.** When two `content.config.*` files in one repo each declare a collection with the same name (e.g. the main `docs/` site and an `examples/*` mini-app both declaring a `docs` collection at `/docs`), the slug set was keyed globally by collection name, so the second config's (smaller) set OVERWROTE the first's — flagging every valid internal link in the larger app as broken (125 false `broken-internal-link` errors). Each config's pages now validate against ITS OWN collections; a link to another app's prefix is left alone.
  - **`auditTestEnvironment` (audit-tests gate) — three mock-vnode false positives.** (1) `const vnode = (await Foo()) as T` (a real component's output) was miscounted as a mock-helper factory because the arrow heuristic matched any leading `(`; now it requires the `(…) =>` shape. (2) A `vnode()` mention inside a `//` or `/* */` comment was counted as a mock-helper call; the scanner now masks comments (and template-literal interiors) while preserving regular-string contents so import-path detection is unaffected. (3) `jsx()` / `jsxs()` (the automatic JSX runtime — the same vnode-producing machinery as `h()`) are now counted as real-runtime calls, so a test driving the real `jsx()` runtime is no longer misclassified as mock-only.

  No public API change; the audits simply stop misfiring. Net effect on `pyreon doctor`: 129 → 0 errors monorepo-wide.

- [#1549](https://github.com/pyreon/pyreon/pull/1549) [`bfb813b`](https://github.com/pyreon/pyreon/commit/bfb813ba5a883c791a8df22c46fa82cf370c6ebe) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon doctor` correctness + accuracy fixes (deep audit follow-up).

  **Robustness** — a gate that throws no longer crashes the whole run. The orchestrator isolates each gate in a try/catch and records a `<gate>/gate-failed` ERROR finding instead of rejecting `Promise.all` and losing every other gate's findings + the score.

  **False positives** (the gates flagged correct code):

  - `pyreon-patterns` now **defers to the `lint` gate** for codes a configured lint rule fully owns (`process-dev-gate`, `raw-add-event-listener`, `query-options-as-function`) — eliminating double-reporting at a wrong hardcoded `'warning'` severity AND the FPs on framework code the lint rule exempts. The kept codes (e.g. `raw-remove-event-listener`, which the add-only lint rule can't catch) honor the project's `.pyreonlintrc.json` exemptPaths.
  - `ssg-audit`'s `dynamic-route-missing-get-static-paths` is now **scoped to `mode: 'ssg'` apps** (resolved from the nearest `vite.config`). SPA/SSR/ISR apps never prerender, so a missing `getStaticPaths` there was a false positive.

  **Scoring** — `audit-leak-classes` findings now route to the advisory `best-practices` category. They were `info` "to keep the grade honest", but `info` still costs 1pt each, so ~45 advisory findings tanked the architecture grade to F. Advisory = VISIBLE but excluded from the grade + `--ci`, which is what the gate's stated intent actually requires.

  **CLI** — `check-dedup` was rejected by `--only`/`--skip` (the CLI's `VALID_GATES` was a hand-kept duplicate that dropped it) even though it runs by default. `VALID_GATES` is now derived from the orchestrator's `[...FAST_GATES, ...SLOW_GATES]`, so it can never drift again; the help text derives its counts the same way.

  **GHA renderer** — annotation property values (`file=`, `title=`) now URL-encode `,` and `:` per the workflow-command spec (a comma in a path previously ended the property early).

  Bisect-verified per fix. Docs (CLAUDE.md, `docs/src/content/docs/cli.md`, orchestrator header) corrected: the gate count (13 total / 11 fast, not 10/8), the 3 gates missing from every table (`content-audit`, `check-dedup`, `audit-leak-classes`), the "single entry point for every gate" overclaim (doctor is the health-gate entry point, not a runner for CI-pipeline gates), `--check-content`, and the stale non-CI-exit claim (`pyreon doctor` is informational and always exits 0; `--ci` gates).

## 0.31.0

## 0.30.0

## 0.29.0

### Patch Changes

- [#1328](https://github.com/pyreon/pyreon/pull/1328) [`8524e24`](https://github.com/pyreon/pyreon/commit/8524e24651184d275d5bf7520d65caade2ef25b8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(compiler): add 20 real branch-coverage tests; branches 84.63% → 85.34% (clears MINIMUM_BRANCH_FLOOR=85)

  `branch-coverage-real.test.ts` covers uncov arms in 3 small-helper modules:

  - **reactivity-lens.ts** (68.75% → 81.25%): `analyzeReactivity({ knownSignals })` truthy/falsy arms; `formatReactivityLens` code-badge branch (footgun vs no-code finding); parse-failure catch path
  - **lpih.ts** (82.6% → 97.1%): `mergeFireDataIntoFindings` nullish rate1s + kind aggregation arms; `firesToCreationSiteFindings` same-line aggregation with lastFire flip + kind-undefined fallback; sort comparator column branch
  - **test-audit.ts** (85.54% → 95.18%): `formatTestAudit` risk-level / singular-vs-plural arms (1 literal vs 2 literals, etc.), `importsH`-no-calls path, `describeRisk` low arm via `minRisk: 'low'`

  Threshold lifted: branches 84 → 85 in `vitest.config.ts`. `BELOW_FLOOR_EXEMPTIONS` entry updated: `currentBranches: 84 → 85`. Compiler now clears `MINIMUM_BRANCH_FLOOR=85`; exemption persists for STATEMENTS only (92.65% vs floor 95).

  Bisect-verified: with new file removed, branches fall to 84.63%, gate fails with `Coverage for branches (84.63%) does not meet global threshold (85%)`. Restored → 85.34%, gate passes.

- [#1325](https://github.com/pyreon/pyreon/pull/1325) [`0ef3f45`](https://github.com/pyreon/pyreon/commit/0ef3f4591fdd7339a0dd597dabc27295eeb09669) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat: islands work natively in @pyreon/zero (self-hydrating island())

  Declaring an island in a `@pyreon/zero` route was broken: the build crashed
  (duplicate-`@pyreon/server` singleton sentinel) and, even forced past it, the
  island never hydrated (the route error boundary caught a thrown async render).
  Root cause: zero's route is a **reactive child of RouterView**, so on the client
  the SSR route DOM is **discarded and re-mounted** (not hydrated in place). That
  defeats the islands model — an inline async `island()` render throws inside the
  host mount/hydrate (no Suspense boundary), and the one-shot `hydrateIslandsAuto`
  scan races the async lazy-route mount.

  `island()` now **self-hydrates on the client**: it renders only the
  `<pyreon-island>` marker, then `onMount` loads the chunk and mounts the
  component into the marker per the `data-hydrate` strategy (load/idle/visible/
  interaction/media), reusing the existing schedulers (`scheduleHydration` /
  `schedulePrefetch`, now exported from `@pyreon/server/client` and dynamically
  imported so they stay out of the SSR graph). The island owns its own hydration
  lifecycle, so it's robust whether the host hydrates the page (a static islands
  app) or re-mounts the route (`@pyreon/zero`). The server branch is unchanged
  (async `loader()` → marker + content for SSR/SEO/first-paint).

  `@pyreon/zero` re-exports `island` (+ `IslandOptions`/`IslandMeta`) from the
  client-safe `@pyreon/server/client`, so a zero app declares islands with
  `import { island } from '@pyreon/zero'` — no `@pyreon/server` dependency, just
  `startClient({ routes })`, no manual `hydrateIslandsAuto`.

  Verified end-to-end in real Chromium (`e2e/zero-islands.spec.ts`: a
  `hydrate:'visible'` island hydrates with zero manual wiring and a click drives
  its signal — no sentinel, no `reading 'ref'` crash) with the 9 islands-showcase
  strategy specs (the static model) staying green.

  `@pyreon/compiler`: the `dead-island` islands-audit detector
  (`pyreon doctor --check-islands` / MCP `audit_islands`) no longer false-positives
  on islands declared in `src/routes/**` files. fs-router routes are auto-loaded
  entry points (the generated virtual route module `lazy()`-imports them), so no
  hand-written source imports the file — the heuristic now skips route files.

## 0.28.1

### Patch Changes

- [#1297](https://github.com/pyreon/pyreon/pull/1297) [`404d266`](https://github.com/pyreon/pyreon/commit/404d266a33fd272897e70c59e6baad7f31ccab44) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(compiler): emit firstChild/nextSibling walks instead of children[N] for dynamic-element resolution

  Compiled templates resolved each dynamic element via the live HTMLCollection /
  NodeList indexed getter (`__root.children[N]` / `__root.childNodes[N]`). That
  getter is measurably slower than direct pointer reads. The codegen now emits a
  `firstElementChild`/`nextElementSibling` walk for `children[N]` and a
  `firstChild`/`nextSibling` walk for `childNodes[N]` (the element-vs-node sibling
  forms match each collection's text-node semantics exactly), matching SolidJS's
  codegen for the same reason. Falls back to the indexed form past 8 hops, where
  the chained reads outweigh the getter overhead.

  Measured (real Chromium, drift-controlled, real `_tpl` + `_bindText` + signal
  mounts): **~3.8% faster create** for rows resolving two dynamic cells, ~2% for a
  single-cell row — pure compile-time, zero runtime cost, semantically identical
  output. Both compiler backends (JS + Rust napi) emit byte-for-byte identical
  code; all 1429 compiler tests pass including the 180 native-equivalence checks.

- [#1279](https://github.com/pyreon/pyreon/pull/1279) [`e97b8d7`](https://github.com/pyreon/pyreon/commit/e97b8d7a63a3f368c6a1e49a71eb22114b202f81) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Coverage floor: raise `MINIMUM_FLOOR` 94 → 95 (statements) in `scripts/check-coverage.ts`. Every published `@pyreon/*` package now configures `statements ≥ 95` except two documented exemptions: `@pyreon/compiler` (jsx.ts ~3000-line file, long-tail edge-case branches; multi-PR effort) and `@pyreon/styler` (94.83% — 0.17pp gap from styled.tsx WeakMap fallback + SSR hydration paths needing targeted DOM-replay tests). Compiler `vitest.config.ts` now declares `statements: 92` explicitly (matches actual 92.38%). The `MINIMUM_BRANCH_FLOOR` stays at 85% for now — universal 95% branch coverage is multi-week per-package work tracked separately.

- [#1212](https://github.com/pyreon/pyreon/pull/1212) [`fccddae`](https://github.com/pyreon/pyreon/commit/fccddae860e3126640dbcbd6d5a0ef22ac419f48) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(runtime-dom): allow `data:image/*` URIs on image-source attributes (unblock `<Image>` placeholders)

  The `setStaticProp` URL guard blocked **every** `data:` URI on URL-bearing
  attributes (`src`, `poster`, …) to stop `javascript:`/`data:text/html`
  injection. But that also rejected `data:image/*` placeholders — silently
  disabling `<Image>`/`<OptimizedImage>`'s blur-up and color placeholders, which
  is the framework's **own** `imagePlugin` output (`data:image/webp;base64,…` for
  blur, `data:image/svg+xml,…` for color). Dev mode logged a `[Pyreon] Blocked
unsafe URL` warning on every render; production silently dropped the attribute
  so the placeholder never reached the DOM.

  The guard is now context-aware. A `data:image/<type>` URI is allowed only on an
  image-source attribute (`src`/`srcset`/`poster`) of an image-context element
  (`<img>`/`<source>`/`<video>`), where the browser treats it as a static,
  non-executing image. Raster types (png/jpeg/webp/avif/…) always pass; SVG is
  allowed only when it carries no `<script>` or `on*=` handlers (decoded for both
  base64 and url-encoded payloads). Everything else stays blocked — `javascript:`
  everywhere, `data:text/html` on `<iframe>`/`<object>`/`<embed>`, and `data:` on
  navigable elements like `<a href>`/`<form action>`.

  The same allowance applies to the HTML-sanitizer path (`dangerouslySetInnerHTML`),
  so a legitimate `<img src="data:image/png;base64,…">` in sanitized HTML also
  survives.

  `@pyreon/compiler` gains a matching `ERROR_PATTERNS` entry so `pyreon doctor
diagnose` / the MCP `diagnose` tool explains the `[Pyreon] Blocked unsafe URL`
  warning and which `data:` URIs are allowed where.

## 0.28.0

## 0.27.1

## 0.27.0

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

### Minor Changes

- [#1067](https://github.com/pyreon/pyreon/pull/1067) [`fce4e86`](https://github.com/pyreon/pyreon/commit/fce4e868611a3f5e006f20a031d43435441901e5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(compiler+runtime-dom): widen `_bindText`/`_bindDirect` fast path to non-computed MemberExpression callees

  `tryDirectSignalRef` previously accepted ONLY bare-identifier callees (`count()`). The canonical For-row idiom `{() => row.label()}` — exactly what the hand-tuned `examples/benchmark/src/impl/pyreon-tpl.ts` reference template uses — bailed to the full `_bind` chain (~6 allocs: deps array, dispose closure, snapshotCapture, scope.add) instead of the `_bindText` fast path (1 dispose).

  Now widened to non-computed MemberExpression chains (`row.label()`, `data.user.name()`) where the root identifier is NOT a tracked active signal (which would suggest `count.peek()` — intentionally untracked, would defeat the binding). Computed access (`row[key]()`) and chained calls (`count().toLocaleString()`) still bail to `_bind`.

  To keep correctness, `_bindText` and `_bindDirect` gain an optional 3rd `caller?` arg. The compiler emits it for MemberExpression callees: `_bindText(row.label, t, () => row.label())`. The runtime's slow path uses it instead of bare `source()` — preserves `this` if source turns out to be a method (not a signal). Fast path ignores the caller (no perf cost). The 2-arg form remains valid for Identifier callees (backward compatible).

  Both JS and Rust compiler backends implement the widening byte-identically (verified by cross-backend equivalence tests).

  Bisect-verified: revert widening → 4 new compiler tests fail (`_bindText(row.label,` not in `_bind`-only output); restore → 4 pass. Bench:fair shows `replace all` 0.96× and `create 10k` 0.98× directionally, within between-run noise band (untouched Solid moved 0.85–1.02× in the same comparison); no regressions across 165 e2e tests.

- [#1071](https://github.com/pyreon/pyreon/pull/1071) [`76ef68e`](https://github.com/pyreon/pyreon/commit/76ef68efa4daea765ca3eb512be71cc1f7db483c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(compiler): classify `String`/`Number`/`Boolean` as pure coercions — `{String(row.id)}` routes to static `textContent` (no `_bind`)

  The compiler conservatively treated every `CallExpression` as dynamic unless ALL args were literals (`isPureStaticCall`). The canonical For-row idiom `{String(row.id)}` — exactly what `examples/benchmark/src/impl/pyreon-tpl.ts` (the hand-tuned reference) uses — failed the literal-arg test (`row.id` isn't a literal) so emitted the full `_bind` chain per row (`createTextNode` + `appendChild` + `_bind(() => { textNode.data = String(row.id) })`).

  `String`, `Number`, `Boolean` are referentially-transparent globals: their result depends ONLY on the argument. Now classified as pure coercions — the OUTER call no longer triggers an early dynamic-return, and the existing recurse-into-children logic determines dynamism from the args:

  - `String(row.id)` — captured row ref, NOT dynamic → routes to `emitStaticTextChild` (`textContent = String(row.id)` once at row mount)
  - `String(count())` — signal call in arg, IS dynamic → preserves `_bind` reactivity
  - `String(props.x)` — props access in arg, IS dynamic → preserves `_bind` reactivity
  - Spread (`String(...args)`) bails

  Both JS and Rust backends implement byte-identically. Matches the static emit pattern the hand-tuned bench template uses.

  Bisect-verified: revert → 3 "fires" tests fail (`textContent = String(row.id)` not in `_bind`-only output); restore → pass. `bench:fair`: Pyreon `create 1k` 0.97× directionally; other cells within noise band. 1421/1421 compiler tests + 150 e2e green.

### Patch Changes

- [#991](https://github.com/pyreon/pyreon/pull/991) [`ecceb71`](https://github.com/pyreon/pyreon/commit/ecceb710dc442a93818b7d60f38155a9f8cd71b9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - P0 element-child collapse — PR 1 (detector + serializer + measurement).

  Adds `detectStaticElementChild` / `collectStaticChildren` /
  `serializeStaticChildren` + the `StaticChildNode` type to
  `@pyreon/compiler`. These recognise the SAFE subset of element-child
  rocketstyle call sites — children whose ENTIRE subtree is provably
  static (DOM tag, string-literal props, no `on*` handlers, static
  text/element children all the way down) — so a later PR's SSR resolver
  can bake the whole subtree into the existing `_rsCollapse` template with
  nothing reactive lost.

  **Measurement-only — additive, not yet wired into the emit path.** The
  collapse emit (`tryRocketstyleCollapse`), runtime (`_rsCollapse`), and
  plugin scanner are byte-unchanged; all 1378 prior compiler tests pass.
  The detectors feed `collapse-bail-census.test.ts`, which now reports the
  go/no-go number for the resolver investment:

  ```
  element-child STATIC-ADDRESSABLE: 16 (2.8% of all sites)
  ```

  Of the 52 element-child bail sites in the real corpus (ui-showcase +
  app-showcase + fundamentals-playground), only 16 are recursively static
  — the rest wrap components or carry reactivity and correctly bail.
  Element-child collapse would lift coverage 83.2% → ~86.0%. PR 2 (the
  resolver structured-children channel) is gated on this number being
  worth the investment.

  Bisect-verified: stubbing `detectStaticElementChild` to return null
  drops the census static-addressable count to 0 (assertion fails) and
  fails the 20-spec detector suite; restored → all green.

- [#998](https://github.com/pyreon/pyreon/pull/998) [`f4e8b66`](https://github.com/pyreon/pyreon/commit/f4e8b66b3544b00f0ff36c1e64c37a2aec50524e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - P0 element-child collapse — PR 2 (resolver wiring + emit).

  Wires PR 1's recursively-static element-child detector into the collapse
  pipeline so a `<Progress state="primary" size="medium"><div style="…" /></Progress>`
  shape now actually collapses. **No new runtime helper** — unlike partial
  (`_rsCollapseH`) and dynamic (`_rsCollapseDyn`), the resolver SSR-renders
  the REAL component WITH its child subtree and bakes the full output HTML,
  so the emit is the UNCHANGED `__rsCollapse(...)` and the cloned template
  already contains the children.

  - **Compiler** (`@pyreon/compiler`): `detectElementChildCollapsibleShape`
    (literal root props + recursively-static element children → `{ props,
childTree, childrenKey }`); `scanCollapsibleSites` emits ONE
    `CollapsibleSite` per element-child site carrying `childTree` +
    `childrenText = serializeStaticChildren(childTree)`;
    `tryRocketstyleCollapse` falls through to `tryElementChildCollapse`
    (key match → unchanged `__rsCollapse`). `StaticChild` / `StaticChildNode`
    re-exported from the package entry for the resolver.
  - **Resolver** (`@pyreon/vite-plugin`): `ResolveInput.childTree` channel +
    `buildChildVNodes(tree, h)` rebuilds the real child VNodes via `h()` so
    the SSR render bakes the full subtree HTML (byte-faithful — the tree was
    normalized with the compiler's own `cleanJsxText`). Cache key includes
    the child tree.

  The element-child site expands to ONE resolution (no per-value fan-out,
  unlike dynamic's two), so the census trustworthiness invariant becomes
  `collapsible + 2×dynamic-addressable + 1×element-child-static-addressable
=== scanner-count`. All 1414 compiler + 207 vite-plugin tests pass.

  Bisect-verified: removing the `|| tryElementChildCollapse` emit arm fails
  the 2 positive emit specs; stubbing the scan element-child branch fails
  the 2 site-emission scan specs; restored → all green.

- [#1019](https://github.com/pyreon/pyreon/pull/1019) [`f27477a`](https://github.com/pyreon/pyreon/commit/f27477a681fdc131ea2904940dabb5b8b0e6b9cb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Bump `oxc-parser` / `oxc-transform` from `^0.129.0` to `^0.133.0`. Both are
  runtime dependencies (the compiler's JS-fallback parse path + all 67 lint
  rules' AST). No AST-shape breakage: compiler suite (1414), lint suite (750),
  native-compiler (388), and the bundle-budgets import-walker (57 pkgs) all
  pass unchanged on 0.133.

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

## 0.25.0

### Minor Changes

- [#898](https://github.com/pyreon/pyreon/pull/898) [`32ca446`](https://github.com/pyreon/pyreon/commit/32ca44676723f196cf7cde48f78d49c67a8d34d0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/compiler` auto-promotes `selector(key) ? a : b` ternaries in className/attr bindings to the effect-free `selector.subscribe(key, m => ...)` fast path.

  ## What

  ```tsx
  // Author writes the canonical idiomatic shape:
  const isSelected = createSelector(selectedId);
  <For each={rows} by={(r) => r.id}>
    {(row) => <tr class={() => (isSelected(row.id) ? "selected" : "")}>...</tr>}
  </For>;
  ```

  Compiles to:

  ```js
  const __d0 = isSelected.subscribe(row.id, (m) => {
    __root.className = m ? "selected" : "";
  });
  ```

  Instead of the previous (still-correct, slower):

  ```js
  const __d0 = _bind(() => {
    __root.className = isSelected(row.id) ? "selected" : "";
  });
  ```

  ## Per-row alloc

  |                  | Old `_bind(() => …)`                                                                              | New `isSelected.subscribe(...)`       |
  | ---------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------- |
  | Allocations      | `deps[]` + `run` closure + `dispose` closure + `{dispose}` wrapper + `trackedFn` closure = **~5** | 1 Set.add + 1 dispose closure = **2** |
  | Effect machinery | full `renderEffect` setup                                                                         | none                                  |
  | Per-fire cost    | `withTracking` + selector lookup + Object.is + ternary                                            | direct call with pre-resolved boolean |

  The perf win from `@pyreon/reactivity` `0.13.0`'s `.subscribe` API now accrues to every existing app that writes the canonical `<For>` + `createSelector` pattern — no API change, no migration.

  ## Bail catalog (conservative — uncertain ⇒ no promotion)

  Falls back to the existing `_bind(...)` shape when:

  - The selector identifier is NOT a known `createSelector()` result (tracked at module scope; function-scope `const` declarations follow the same rules as `signal()` auto-call)
  - The selector call has 0 or 2+ arguments (not the standard shape)
  - The key expression contains a reactive read (would freeze the key at first mount)
  - Either branch contains a reactive read (the promoted updater only re-fires on selection change)
  - The expression is NOT a ternary (handled by the existing pipeline)

  Plain member access in the key (`row.id`, `item.deep.path.id`) is preserved literally — `row` is a stable `<For>` callback parameter, safe to use as a subscription key.

  ## Dual-backend parity

  Implemented byte-for-byte in BOTH the JS path (`packages/core/compiler/src/jsx.ts`) and the Rust native path (`packages/core/compiler/native/src/lib.rs`). 9 new cross-backend equivalence specs cover the promotion-positive shapes + the full bail catalog; production users on the Rust binary (3.7-8.9× faster compiler) get the win immediately.

  ## Test coverage

  - 12 JS-path specs in `selector-subscribe-promote.test.ts`: canonical shape, bare (no-arrow) form, dispose binding shape, every bail in the catalog, deep key expressions, setAttribute-style attrs (aria-current, data-\*).
  - 9 cross-backend equivalence specs in `native-equivalence.test.ts`: bisect-verified-with-restore (disabling the Rust emission branch fails 4 of 9 with the exact `_bind(...)` vs `.subscribe(...)` drift).
  - Real-corpus: `examples/benchmark/src/impl/pyreon.tsx`'s `class={() => isSelected(row.id) ? 'selected' : ''}` confirmed to auto-promote through both backends, byte-identical output.

  ## Backwards-compatible

  Pure compiler optimization. No runtime API change. Apps that don't use `createSelector` see no behavior change. Apps that DO use it see lower per-row allocation + the existing `selector.subscribe(...)` API surface (added in `@pyreon/reactivity` `0.13.0`) ships with full runtime semantics — promoted code is equivalent to the hand-written form.

- [#899](https://github.com/pyreon/pyreon/pull/899) [`9f19029`](https://github.com/pyreon/pyreon/commit/9f190298828b4204a617d30d5b7ae4fedd2b3eb1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/compiler` extends the text-child binding fast paths with two additive auto-promotions:

  ## 1. Text-child selector ternary (companion to className path — PR [#898](https://github.com/pyreon/pyreon/issues/898))

  ```tsx
  // Author writes the canonical text-child shape:
  <td>{() => (isSelected(row.id) ? "✓" : "")}</td>
  ```

  Compiles to `isSelected.subscribe(row.id, (m) => { __t.data = (m ? '✓' : '') })` — the effect-free fast path. Identical bail catalog to the className auto-promotion (only fires when receiver is a known `createSelector()` result, exactly 1 argument, no reactive reads in key or branches).

  ## 2. Signal-method-call in text bindings

  ```tsx
  // Currency / percentage / case-formatting patterns:
  <span>{count().toFixed(2)}</span>
  <h2>{title().toUpperCase()}</h2>
  <code>{n().toString(16)}</code>
  ```

  Compile to `_bindDirect(count, (v) => { __t.data = v.toFixed(2) })` — skipping the `withTracking` setup + signal lookup per fire. Same structural shape as `_bindText` for bare signal reads, extended to common formatting patterns.

  The detector requires:

  - Receiver is a zero-arg call to a known signal (tracked via `signalVars`)
  - Method is in the pure-primitive safelist (Number / String / Boolean prototype methods proven side-effect-free: `toFixed`, `toExponential`, `toPrecision`, `toString`, `valueOf`, `toUpperCase`, `toLowerCase`, `trim*`, `slice`, `substring`, `substr`, `charAt`, `charCodeAt`, `codePointAt`, `padStart`, `padEnd`, `repeat`, `normalize`, `concat`, `startsWith`, `endsWith`, `includes`, `indexOf`, `lastIndexOf`, `at`)
  - Method args contain no reactive reads (would otherwise miss subscriptions)
  - Method callee is not computed (`sig()["toFixed"](2)` — too dynamic to prove safe)

  ## Per-binding alloc reduction

  |             | Old `_bind(() => …)`                       | New `.subscribe` / `_bindDirect`    |
  | ----------- | ------------------------------------------ | ----------------------------------- |
  | Allocations | full `renderEffect` machinery (~5)         | direct subscription (~2)            |
  | Per-fire    | `withTracking` + signal lookup + Object.is | direct call with pre-resolved value |

  Structural — measured at the runtime layer in [#897](https://github.com/pyreon/pyreon/issues/897); not visible at `bench:fair` scale (below ~500µs noise floor) but real.

  ## Dual-backend parity

  Both detectors implemented byte-for-byte in JS path (`packages/core/compiler/src/jsx.ts`) and Rust native (`packages/core/compiler/native/src/lib.rs`). 13 new cross-backend equivalence specs lock the parity.

  ## Test coverage

  - 12 JS-path specs in `text-child-selector-promote.test.ts` (canonical shape + bail catalog + deep keys)
  - 16 JS-path specs in `signal-method-promote.test.ts` (Number/String/Boolean methods + bail catalog + integration with other detectors)
  - 13 cross-backend equivalence specs in `native-equivalence.test.ts` (4 selector + 9 method-call)
  - Bisect-verified-with-restore at THREE layers (Rust selector branch, Rust method-call branch, JS path)
  - Real-corpus scan: 417 example `.tsx` files, 0 false positives, 0 crashes, 0 byte-divergences (vs main) introduced

  ## Backwards-compatible

  Pure compiler optimization. No runtime API change. Patterns not matched by either detector continue to compile to `_bind(...)` exactly as before.

## 0.24.6

## 0.24.5

## 0.24.4

## 0.24.3

## 0.24.2

## 0.24.1

## 0.24.0

### Minor Changes

- [#769](https://github.com/pyreon/pyreon/pull/769) [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Live Program Inlay Hints (LPIH) — runtime + compiler + LSP foundation. A new category of editor surface: **live runtime data displayed at the source line, the same way TypeScript shows inferred types**. No reactive framework today shows fire counts / subscriber counts / effect re-run rates at the cursor — developers context-switch to a separate devtools panel. LPIH closes that gap.

  ```tsx
  function App() {
    const count = signal(0); // 🔥 signal fired 240×
    const doubled = computed(() => count() * 2); // 🔥 derived fired 240×
    effect(() => console.log(doubled())); // 🔥 effect fired 241×
    return <div>{count()}</div>;
  }
  ```

  **`@pyreon/reactivity`**: source-location capture at every `signal()` / `computed()` / `effect()` creation, wired through `_rdRegister` and exposed via `getFireSummaries()`. The runtime bridge ships at the new subpath export `@pyreon/reactivity/lpih`: `writeLpihCache(path)` + `startLpihPolling(path, intervalMs)` writes the current fire snapshot to a JSON cache file atomically (tmp + rename — readers never see a half-written file; failed renames clean up the tmp). Subpath keeps the main entry slim — bridge depends on `node:fs/promises` (Node-only) and is dev-mode glue, not a core primitive. New main-entry exports: `SourceLocation`, `FireSummary`, `getFireSummaries`. New `/lpih` subpath exports: `writeLpihCache`, `startLpihPolling`. **Zero production cost** (existing `process.env.NODE_ENV !== 'production'` gate tree-shakes the entire capture path — verified by the existing `reactive-devtools-treeshake.test.ts`). Dev-mode opt-in cost: `_active === true` triggers `new Error().stack` capture (~2.2µs per creation). At realistic real-app creation rates (100-1000 signals total / 100/sec peak), per-session cost is **0.2-2.3ms** — invisible. Stack-parser handles V8, JSC, and SpiderMonkey formats. 21 new tests (15 source-location + 6 bridge).

  **`@pyreon/compiler`**: two new pure functions that bridge runtime fire data to LSP inlay hints. `mergeFireDataIntoFindings(findings, fires, file)` enriches static Reactivity-Lens findings with fire counts at matching source lines. `firesToCreationSiteFindings(fires, file)` synthesizes inlay-hint findings DIRECTLY from fires — creation-line hints showing `signal fired 240×` at the line where `signal()` was called. New exports: `mergeFireDataIntoFindings`, `firesToCreationSiteFindings`, `LPIHFireDatum`, `LPIHMergeOptions`. 24 new tests covering merge semantics, kind filtering (footguns/static spans NOT enriched), file normalization, aggregation, custom formatters, plus end-to-end `analyzeReactivity + merge` integration.

  **`@pyreon/lint`**: LSP `textDocument/inlayHint` handler reads `PYREON_LPIH_CACHE` env var on each request, parses the cache file (silent failure on missing/malformed JSON), and emits creation-site inlay hints with the `🔥 signal fired N×` label. Opt-in via env var — when unset, LPIH path is a no-op and existing static Reactivity-Lens hints work unchanged. New internal exports: `_readLpihCache`, `LPIHCacheEntry`, `LPIHCacheFile`. 15 new JSON-RPC roundtrip tests covering cache file parsing (malformed JSON, missing entries, shape validation), LSP handler integration (env-var-driven cache read, visible-range filtering with LPIH active, graceful degradation), end-to-end `initialize → didOpen → inlayHint` with real cache file.

  **Measured impact (reproducible via `bun .claude/experiments/lpih-measurement.ts`)**:

  | Metric                                          | Value                                          |
  | ----------------------------------------------- | ---------------------------------------------- |
  | LSP roundtrip latency (median, 20-trial)        | **0.32 ms**                                    |
  | LSP roundtrip latency (p95)                     | **2.78 ms**                                    |
  | User-perceived save→hint (incl. 150ms debounce) | **~150 ms**                                    |
  | Bridge write (atomic JSON file)                 | **1.5 ms**                                     |
  | End-to-end bridge-to-editor                     | **~1.8 ms + 250ms poll interval**              |
  | Production overhead                             | **0 ns** (tree-shaken)                         |
  | Dev-mode active overhead                        | 2.2 µs per signal creation                     |
  | Workflow "which signal fires most?"             | 9 → 2 steps (**4.5× reduction**)               |
  | Workflow "is this effect over-running?"         | 8 → 2 steps (**4× reduction**)                 |
  | Workflow "did memoization help?"                | 10 → 4 steps (**2.5× reduction**)              |
  | Information surface per medium component        | ~9 hints inline vs 0 in editor (devtools-only) |

  **Architecture**: Three-layer (runtime captures source location → bridge writes JSON cache file → LSP reads + merges into inlay hints). Bisect-verified: reverting the LSP wiring fails 11/15 integration tests; restored, 15/15 pass. The cache-file bridge mechanism is filesystem-only (no IPC, no WebSocket) — chosen because LSP servers are stdio-only and filesystem is the universal lowest-common-denominator transport. The LSP re-reads on every inlay-hint request so live edits land immediately. Future build-time location injection via `@pyreon/vite-plugin` will replace stack capture with compile-time literals, eliminating the dev-mode 2.2µs/creation overhead entirely. The editor extension (VS Code / Neovim) that auto-bridges devtools fire data to the cache file is a follow-up.

  **Docs**: new VitePress page at [docs/docs/lpih.md](docs/docs/lpih.md) with quickstart, API reference, measured numbers, and 3 concrete bug-hunting scenarios (with vs without LPIH workflow comparison).

- [#780](https://github.com/pyreon/pyreon/pull/780) [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd) Thanks [@vitbokisch](https://github.com/vitbokisch)! - LPIH: sustained-rate hint via EWMA. Inlay-hint labels now show both cumulative fire count AND current fires/second when active — making hot-path debugging visible at a glance.

  ```tsx
  const count = signal(0); // 🔥 signal fired 240× (12/s) — active
  const stable = signal(0); // 🔥 signal fired 240×          — idle
  ```

  **Why**: cumulative count alone can't distinguish "this is firing right now" from "this fired a lot a few minutes ago." For hot-path debugging (the LPIH [#1](https://github.com/pyreon/pyreon/issues/1) use case), the user needs to see _current_ rate. Adding a decayed-EWMA rate alongside the cumulative count gives both signals without bloating the label.

  **Math**: per-node EWMA with 1-second time constant (`LPIH_RATE_TAU_MS = 1000`). On each fire:

  ```
  dt = ts - lastFire
  decay = exp(-dt / 1000)
  rate1s = rate1s * decay + 1
  ```

  At steady state of λ fires/sec, `rate1s → λ` (when λ·TAU ≫ 1 — true for any rate worth noticing). On read, decay-to-now applied: a node that stopped firing 1.5s ago shows ≈22% of its peak rate; 3s ago shows ≈5%; 5s ago shows ≈0.7% (below the visibility threshold).

  **`@pyreon/reactivity`**:

  - `FireSummary.rate1s: number` — new field, decayed to "now" at every `getFireSummaries()` call.
  - `NodeRec.rate1s` — internal per-node EWMA state, updated on every fire.
  - `LPIH_RATE_TAU_MS` — exported constant (1000 ms = 1 second time constant).
  - Bridge `writeLpihCache` now includes `rate1s` in each fire entry's JSON.

  **`@pyreon/compiler`**:

  - `LPIHFireDatum.rate1s?: number` — optional field; older runtimes that don't emit it produce labels without the rate suffix (backward-compatible).
  - `_LPIH_RATE_VISIBLE_THRESHOLD = 0.5` — rates below this are suppressed (don't show "0.1/s" or "0/s" noise from decayed-dormant nodes).
  - Default label formatter: `signal fired 240× (12/s)` when active, `signal fired 240×` when below threshold or no rate field.
  - Custom `formatDetail` callbacks receive the full `LPIHFireDatum` including `rate1s` for fully custom labels.
  - Multiple fires at the same line have their rates summed (consistent with the existing count-summing behavior).

  **`@pyreon/lint`**:

  - `LPIHCacheEntry.rate1s?: number` — round-trips through the cache; no LSP-side logic change beyond the type extension. The compiler's default formatter picks up the new field automatically.

  **Tests** (+12 new across all 3 packages, 2383 total, all green):

  - @pyreon/reactivity: 367 (+5 — rate1s captured, rises with bursts, decays after TAU, sums at same location, constant value lock)
  - @pyreon/compiler: 1316 (+7 — threshold-suppress, 1-decimal vs integer rounding, creation-site formatter, line-sum, custom formatter receives rate, missing-field passthrough)
  - @pyreon/lint: 700 (no new tests — rate1s is data-only round-trip through the cache; existing integration tests cover the path)

  **Memory + performance**: one extra `number` field per node (+8 bytes). One `Math.exp` per fire (~50 ns). One `Math.exp` per location per `getFireSummaries()` call. Bundle-budget impact: 0 (writeLpihCache code path was already in the subpath, this just adds one field to the JSON payload).

  **Bisect-verified**: stashing the EWMA update in `_rdRecordFire` fails the new "rate1s rises with rapid fires" + "rate1s for many rapid fires reflects fire density" tests.

  **Docs**: example block in `docs/docs/lpih.md` updated to show `(12/s)` rate suffix; new paragraph explaining the cumulative-count + current-rate split.

### Patch Changes

- [#778](https://github.com/pyreon/pyreon/pull/778) [`275eb20`](https://github.com/pyreon/pyreon/commit/275eb2038f32374e90c9fe0c3d55f35895f43450) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(compiler, solid-compat): close two real CodeQL alerts (polynomial-redos + prototype-pollution)

  Closes the two CODE-level CodeQL alerts on the repo. The other four
  open alerts (`Fuzzing`, `CII-Best-Practices`, `Maintained`,
  `Code-Review`) are OpenSSF Scorecard metadata — repo-practice
  recommendations, not code-fixable.

  ## Alert [#65](https://github.com/pyreon/pyreon/issues/65) — `js/polynomial-redos` (severity: high)

  **`packages/core/compiler/src/pyreon-intercept.ts:996`** — the
  `hasPyreonPatterns` fast-path regex for the `onClick={undefined}`
  detector had an unbounded `\w*` quantifier:

  ```ts
  /on[A-Z]\w*\s*=\s*\{\s*undefined\s*\}/.test(code);
  ```

  Polynomial-time on inputs like `onAAAA…` (long runs of `[A-Z]`):
  per starting position the greedy `\w*` consumes O(N) chars before
  the trailing `=` fails to match, giving O(N²) overall on N starting
  positions.

  **Fix**: cap the `\w*` to `\w{0,60}`. Real `on*` handler identifiers
  are at most ~25 chars (`onPointerLeaveCapture`); 60 leaves headroom.
  The cap keeps the regex linear regardless of input shape.

  This file already uses bounded quantifiers (`{1,500}` / `{0,500}`)
  on its OTHER regex sites with the same rationale documented inline
  (lines 997-1008) — this fix brings the `on*` pattern in line with
  the established convention.

  ## Alert [#22](https://github.com/pyreon/pyreon/issues/22) — `js/prototype-polluting-assignment` (severity: medium)

  **`packages/tools/solid-compat/src/index.ts:1040`** — `applyAtPath`
  already guards against `__proto__` / `constructor` / `prototype`
  keyed writes via a `DANGEROUS_KEYS.has(key)` Set lookup at line 1036,
  BUT CodeQL's `js/prototype-polluting-assignment` taint-tracking
  does NOT propagate dataflow through `Set.has` calls. The analyzer
  needs explicit `===` checks against the literal key names to
  recognise the guard.

  **Fix**: inline the comparisons:

  ```ts
  if (
    typeof key === "string" &&
    (key === "__proto__" || key === "constructor" || key === "prototype")
  ) {
    return;
  }
  ```

  Same set of dangerous keys; just a form CodeQL's taint-tracking can
  follow. Behaviorally identical — both guards refuse the same three
  keys before the bracket-notation assignment on line 1042.

  ## Validation

  - `bun run --filter='@pyreon/compiler' typecheck` — clean
  - `bun run --filter='@pyreon/solid-compat' typecheck` — clean
  - `bun run --filter='@pyreon/compiler' test pyreon-intercept` — 70/70 pass
  - `bun run --filter='@pyreon/solid-compat' test` — 218/218 pass
  - `bun run gen-docs --check` — clean
  - `bun run check-doc-claims` — clean
  - `bun run check-manifest-depth` — clean

  CodeQL re-scan on merge will close both alerts automatically.

  ## NOT in this PR

  The other four open alerts (`Fuzzing` / `CII-Best-Practices` /
  `Maintained` / `Code-Review`, all "no file associated") are OpenSSF
  Scorecard metadata about repo practices — not code-fixable. They'd
  need separate workflow / CI / policy changes if pursued.

- [#766](https://github.com/pyreon/pyreon/pull/766) [`47073eb`](https://github.com/pyreon/pyreon/commit/47073ebdd7552c63985f461a663ba98d93538606) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(compiler): add `detectDynamicCollapsibleShape` — PR 2 of the dynamic-prop partial-collapse build

  Compiler detector for the next-bigger bite after the just-shipped
  `on*`-handler partial-collapse: collapsible call sites where ONE
  dimension prop is a **ternary-of-two-literals** dynamic expression.

  ```jsx
  // Pre-fix: bails on `state={...}` non-literal → full 5-layer mount
  // Post-fix (with PR 3 emit): collapses with a value dispatcher
  <Button state={cond ? "primary" : "secondary"} size="medium" onClick={go}>
    Save
  </Button>
  ```

  ## What this PR ships (PR 2 of 4 — detector only)

  Mirrors `detectPartialCollapsibleShape`'s "extend bail catalogue with ONE
  relaxation" pattern. The single relaxation: a `JSXExpressionContainer`
  wrapping a `ConditionalExpression` with BOTH branches being `StringLiteral`
  is acceptable as a `DynamicCollapsibleProp { name, condStart, condEnd,
valueTruthy, valueFalsy }`.

  - Composes with the existing `on*`-handler relaxation (same call can
    carry one ternary AND any number of handlers — matches real-corpus
    shape where Buttons with `state={cond ? ...}` almost always have
    `onClick`)
  - Constraint: AT MOST ONE ternary per site (multi-axis combinatorics is
    separable scope, not this PR)
  - Constraint: branches MUST be `StringLiteral` (template literal,
    identifier, numeric literal all bail — keeps the static-resolvable
    set narrow + provable)
  - Returns `null` for zero ternaries (defers to full / on\*-only paths
    so the three detectors never both/all-three claim the same site —
    same load-bearing separation as the rest of the family)

  ## Bisect verification

  Neutralized `detectDynamicCollapsibleShape` (`if (node) return null`):

  - 5 POSITIVE specs fail with `expected null not to be null`
  - 8 NEGATIVE specs pass (they always assert null — asymmetry proof
    that the positive assertions are load-bearing on the ternary-
    relaxation logic, not on a generic null short-circuit)
  - Restored → 13/13 pass

  ## What's NOT in this PR (follow-up scope)

  - **PR 3**: resolver extension (resolve EACH literal value via existing
    SSR pipeline, assert structural-template parity) + emit
    `__rsCollapseDyn(...)` from `tryRocketstyleCollapse` falling through
    to the new path when full + partial both bail + plugin scan hookup
  - **PR 4**: bail-census update (assert dynamic-prop addressable count
    flips `collapsible`; coverage moves 73.2% → ~88%) + verify-modes
    cell + real-Chromium e2e gate

  This PR is structurally analogous to PR 1 of the `on*`-handler sequence
  (the detector, before the emit landed) — pure AST function, unit-testable
  in isolation, no compiler-pipeline coupling.

  ## Surfaces updated

  - `packages/core/compiler/src/jsx.ts` — `detectDynamicCollapsibleShape`
    - `DynamicCollapsibleProp` interface (new exports)
  - `packages/core/compiler/src/tests/dynamic-collapse-detector.test.ts`
    — 13 bisect-verified specs (POSITIVE + NEGATIVE)

  ## Related

  - **[#765](https://github.com/pyreon/pyreon/issues/765)** (merged) — PR 1: `_rsCollapseDyn` runtime helper
  - **[#761](https://github.com/pyreon/pyreon/issues/761)** (closed spike) — surfaced the recommendation
  - **on\*-handler partial-collapse** PRs (1-3 already shipped) — the
    precedent this PR mirrors

- [#775](https://github.com/pyreon/pyreon/pull/775) [`572212f`](https://github.com/pyreon/pyreon/commit/572212f631907a18b98118f48dea3621dd5a95b1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(compiler): handler-combined dynamic-collapse emit — `__rsCollapseDynH` for ternary-of-two-literals + `on*` handlers

  Follow-up to PR A (`_rsCollapseDynH` runtime helper). Closes the bulk
  of the 15.4% dynamic-prop bail bucket measured by the bail census
  (the strict no-handler scope only addressed 0.2% of all real-corpus
  sites; the bigger slice is handler-combined ternaries like
  `<Button state={cond ? 'a' : 'b'} onClick={h}>` — the most common
  real-world shape).

  ## What this PR ships

  1. **`scanCollapsibleSites` extension** — drops the `dyn.handlers.length === 0`
     guard. Handler-bearing dynamic sites now expand into TWO `CollapsibleSite`
     entries (one per literal value) like no-handler ones. Handlers don't
     affect the resolver's input (componentName, props, childrenText) —
     they're re-attached by the runtime helper.

  2. **`tryDynamicCollapse` extension** — stops bailing when handlers are
     present. Routes handler-bearing sites to `__rsCollapseDynH(html,
classes, valueIndex, isDark, handlers)` (5-arg combined emit);
     no-handler sites stay on `__rsCollapseDyn` (4-arg, lighter).
     Handlers object literal built from sliced source spans (same shape
     as `tryPartialCollapse` re-emits handlers via `__rsCollapseH`).

  3. **Conditional helper imports** — adds `_rsCollapseDynH` to the
     preamble when `needsCollapseDynH` is set (lighter modules pull
     only what they use).

  ## Bail-census update

  The `dynamicTernaryAddressable` counter in `collapse-bail-census.test.ts`
  drops the `!sawHandler` requirement — handler-combined ternaries are
  now addressable too. The trustworthiness gate
  (`myCollapsible + 2 * dynamicTernaryAddressable === scannerCollapsible`)
  still holds because the scan emits 2 entries per dynamic site
  regardless of handlers.

  ## Build-artifact gate

  Extended the `ui-showcase × spa` verify-modes cell's dynamic-collapse
  probe to render TWO Buttons:

  - `<Button state={isPrimary() ? 'primary' : 'secondary'} size="medium">Dyn</Button>` → `__rsCollapseDyn`
  - `<Button state={isPrimary() ? 'primary' : 'secondary'} size="medium" onClick={h}>DynH</Button>` → `__rsCollapseDynH`

  The `assertDynProbeCollapsed` helper gains a fifth fingerprint —
  `handlerCombinedShape` — that matches `===\`dark\`,{`(the 5-arg`**rsCollapseDynH`signature has the handlers object immediately
after the mode accessor; the 4-arg`**rsCollapseDyn`ends with`)`
  at that point). Combined with the existing four fingerprints, this
  proves BOTH emit paths fire in the same chunk.

  ## Bisect verification

  | Bisect                                          | Effect                                                                | Outcome                                                                                                                                 |
  | ----------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
  | Disable handler routing in `tryDynamicCollapse` | All handler-combined sites silently fall through to `__rsCollapseDyn` | `handlerCombinedShape=false`; other 4 fingerprints stay true (the no-handler path keeps working) → cell FAILS with the right diagnostic |
  | Restore                                         | All 5 fingerprints true → cell PASSES                                 |

  Asymmetry proves the `handlerCombinedShape` fingerprint is the
  unique signal of the combined-emit path firing.

  Also re-verified at the compiler-test layer: 1285/1285 specs pass
  (the obsolete "SKIPS expansion when handlers present" scan spec was
  updated to assert the NEW behavior — expansion happens for
  handler-combined sites too).

  ## Re-lands [#771](https://github.com/pyreon/pyreon/issues/771)'s content

  PR [#771](https://github.com/pyreon/pyreon/issues/771) (`verify-modes` cell + bail-census ratchet) was merged into
  its base branch (the pre-rebase `feat/collapse-dynamic-props-pr3`)
  but its content was LOST when [#767](https://github.com/pyreon/pyreon/issues/767) was rebased + merged to main
  (stacked-PR base-rebase trap). This PR re-applies [#771](https://github.com/pyreon/pyreon/issues/771)'s probe +
  verify-modes cell + bail-census ratchet via cherry-pick AND extends
  them for the handler-combined path.

  ## Drive-by: CLAUDE.md hygiene

  The dynamic-prop section had "PR 1 of 4 SHIPPED" and "PRs 2-4 are
  follow-ups" language reflecting the in-flight state. Now the whole
  sequence (plus the handler-combined follow-up) has shipped — the
  note is consolidated into a single "fully shipped" entry covering
  both helpers (`_rsCollapseDyn` + `_rsCollapseDynH`), the compiler
  path, and the three-layer bisect coverage.

  ## Validation

  - `bun run --filter='@pyreon/compiler' typecheck` — clean
  - `bun run --filter='@pyreon/compiler' lint` — zero errors
  - `bun run --filter='@pyreon/compiler' test` — 1285/1285 pass
  - `bun run --filter='@pyreon/vite-plugin' typecheck + test` — clean
  - `bun run verify-modes ui-showcase` — 2/2 cells pass
  - `bun run gen-docs --check` — clean
  - `bun run check-doc-claims` — clean
  - `bun run check-manifest-depth` — clean
  - `bun run check-bundle-budgets` — clean (compiler size unchanged)

  ## Surfaces updated

  - `packages/core/compiler/src/jsx.ts` — `scanCollapsibleSites` drops
    handler-skip guard; `tryDynamicCollapse` routes handler-bearing
    sites to `__rsCollapseDynH`; `needsCollapseDynH` flag + conditional
    import
  - `packages/core/compiler/src/tests/dynamic-collapse-scan.test.ts` —
    obsolete "SKIPS when handlers" spec updated to assert NEW behavior
  - `packages/core/compiler/src/tests/collapse-bail-census.test.ts` —
    `dynamicTernaryAddressable` counter drops the `!sawHandler`
    restriction; report log + docstring updated
  - `examples/ui-showcase/src/routes/rs-collapse-dyn-probe.tsx` —
    dual-Button probe (`Dyn` + `DynH`); re-lands [#771](https://github.com/pyreon/pyreon/issues/771)'s content + extends
  - `scripts/verify-modes.ts` — `assertDynProbeCollapsed` gains a 5th
    fingerprint (`handlerCombinedShape`); re-lands [#771](https://github.com/pyreon/pyreon/issues/771)'s content + extends
  - `CLAUDE.md` — consolidated dynamic-prop section, drops "PR X of 4"
    qualifiers, documents both helpers

  ## Related

  - **[#773](https://github.com/pyreon/pyreon/issues/773)** (open) — PR A: `_rsCollapseDynH` runtime helper (this PR depends on it)
  - **[#765](https://github.com/pyreon/pyreon/issues/765) / [#766](https://github.com/pyreon/pyreon/issues/766) / [#767](https://github.com/pyreon/pyreon/issues/767)** (merged) — dynamic-prop sequence PRs 1-3
  - **[#771](https://github.com/pyreon/pyreon/issues/771)** (merged into pre-rebase pr3 branch, content lost on main; re-landed here)
  - **[#761](https://github.com/pyreon/pyreon/issues/761)** (closed spike) — originally surfaced the recommendation

- [#767](https://github.com/pyreon/pyreon/pull/767) [`f22902a`](https://github.com/pyreon/pyreon/commit/f22902a9a9c5f5b8a5192da086a6b4299291dd57) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(compiler): emit `__rsCollapseDyn` for ternary-of-two-literals sites — PR 3 of the dynamic-prop partial-collapse build

  Wires the dynamic-prop fallthrough into the compiler's collapse pipeline:

  1. **`scanCollapsibleSites` extension** — when the full detector
     (`detectCollapsibleShape`) bails, fall through to
     `detectDynamicCollapsibleShape` (PR 2). For a hit with no `on*`
     handlers, expand into TWO `CollapsibleSite` entries (one per
     literal value) so the resolver pre-renders both via the existing
     SSR pipeline.

  2. **`tryDynamicCollapse` emit** — third fallthrough in
     `tryRocketstyleCollapse` (after full → on\*-handler-partial). Looks
     up both expanded keys; if both resolved AND structural template
     parity holds across values, emits:

     ```js
     __rsCollapseDyn(
       "<button>Save</button>",
       ["pri_light", "pri_dark", "sec_light", "sec_dark"],
       () => (cond ? 0 : 1),
       () => __pyrMode() === "dark"
     );
     ```

     Plus the standard idempotent `__rsSheet.injectRules(...)` for BOTH
     value's rule bundles (de-duped by `ruleKey` so dynamic sites sharing
     a value pay one injection).

  3. **Conditional helper imports** — the import preamble pulls only
     the helpers actually emitted into this module. Dynamic-only
     modules import `_rsCollapseDyn` only; full-collapse-only modules
     import `_rsCollapse` only (preserves existing behavior); partial
     modules import both `_rsCollapse` + `_rsCollapseH` (unchanged).

  ## Conservative bail discipline

  - Either expanded site missing from sites map ⇒ bail (intermittent
    resolver failure on one value mustn't half-collapse)
  - Divergent template HTML across values ⇒ bail (the dispatcher
    shares ONE `_tpl` across values; divergent markup would silently
    pick the truthy variant's HTML for falsy too)
  - Handlers present ⇒ bail (PR 3 scope is no-handler dynamic-collapse;
    a combined `_rsCollapseDynH` helper + emit is a future PR's scope)
  - Multi-axis (2+ ternaries) ⇒ bail (detector enforces; separable
    scope)

  ## Bisect verification

  Reverted the fallthrough chain (`return tryPartialCollapse(...) ||
tryDynamicCollapse(...)` → `return tryPartialCollapse(...)`):

  - 4 POSITIVE emit specs fail with `expected '<source>' to contain
'__rsCollapseDyn('` / `'__pyrMode() === "dark"'` / etc.
  - 5 specs pass either way (FULL + on\*-partial regression specs;
    the three conservative-bail specs which always assert absence)
  - Restored → 9/9 emit + 6/6 scan + 13/13 detector = 28/28 dynamic-
    collapse pass; 1285/1285 full compiler suite pass

  The asymmetry confirms the POSITIVE assertions are load-bearing on
  the dynamic fallthrough — they don't pass for the wrong reason.

  ## NOT in this PR

  - **PR 4**: bail-census update (assert dynamic-prop addressable count
    flips `collapsible` in the existing census; coverage moves 73.2% →
    ~88%), `verify-modes ui-showcase × spa` probe route (build-artifact
    gate), real-Chromium e2e gate (parity vs the 5-layer mount across
    both ternary branches).
  - **Future**: handler-combined dynamic emit (the dynamic detector
    already accepts handlers; the emit + a new `_rsCollapseDynH`
    runtime helper would close that residual).

  ## Surfaces updated

  - `packages/core/compiler/src/jsx.ts` — `scanCollapsibleSites` dynamic
    fallthrough (expands one ternary into two static sites);
    `tryDynamicCollapse` emit fn; `needsCollapseDyn` flag; conditional
    helper imports (`_rsCollapseDyn` pulled only when emitted)
  - `packages/core/compiler/src/tests/dynamic-collapse-scan.test.ts` —
    6 scan specs (key parity, multi-site, multi-ternary skip, handler
    skip)
  - `packages/core/compiler/src/tests/dynamic-collapse-emit.test.ts` —
    9 emit specs (POSITIVE + conservative bails + FULL/PARTIAL
    regression)
  - `.changeset/compiler-emit-dynamic-collapse.md` — this file

  ## Related

  - **[#765](https://github.com/pyreon/pyreon/issues/765)** (merged) — PR 1: `_rsCollapseDyn` runtime helper
  - **[#766](https://github.com/pyreon/pyreon/issues/766)** (open) — PR 2: `detectDynamicCollapsibleShape` detector
  - **[#761](https://github.com/pyreon/pyreon/issues/761)** (closed spike) — surfaced the recommendation

- [#775](https://github.com/pyreon/pyreon/pull/775) [`572212f`](https://github.com/pyreon/pyreon/commit/572212f631907a18b98118f48dea3621dd5a95b1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(scripts, compiler): build-artifact gate + bail-census ratchet for dynamic-prop collapse — PR 4 of the dynamic-prop partial-collapse build

  Closes the 4-PR sequence shipping `_rsCollapseDyn` end-to-end through
  the plugin → resolver → compiler → bundle pipeline. PR 4 ships the
  gates that prove the fully-assembled production artifact is correct:

  ## 1. Probe route (`examples/ui-showcase`)

  New `routes/rs-collapse-dyn-probe.tsx` — canonical dynamic-collapsible
  shape: `<Button state={isPrimary() ? 'primary' : 'secondary'} size="medium">Dyn</Button>`
  plus a toggle button to flip the signal. Mirrors the existing static
  `rs-collapse-probe.tsx` exactly — same "dedicated route so the rest of
  ui-showcase's Buttons can keep carrying `onClick` and correctly bail"
  pattern.

  ## 2. Verify-modes cell + assertion helper

  `scripts/verify-modes.ts` gets a new `assertDynProbeCollapsed(distDir)`
  helper that checks the `rs-collapse-dyn-probe-*.js` route chunk for THREE
  minification-stable, dynamic-emit-EXCLUSIVE fingerprints:

  - **(A) Baked template** — `Dyn</span></button>` (the static children
    baked into the template literal; a non-collapsed Button never
    serializes children to a literal)
  - **(B) Stride-2 value-major class array** — 4 backtick-quoted strings
    each containing `pyr-` (the styler's class namespace). The regular
    `_rsCollapse` emit takes only TWO class args; a 4-element class array
    is unique to `_rsCollapseDyn`.
  - **(C) Value dispatcher** — `()=>+!cond` (the minifier's canonical
    transform of `() => (cond) ? 0 : 1`; both produce 0 for truthy, 1 for
    falsy via `+!true=0, +!false=1`). The regular `_rsCollapse` emit has
    no `+!` pattern — that fingerprint is exclusive to `_rsCollapseDyn`.

  The existing `ui-showcase × spa` cell now runs BOTH `assertProbeCollapsed`
  AND `assertDynProbeCollapsed`, amortizing the build cost over both gates.

  **Why these fingerprints (not the pre-minification `__rsCollapseDyn(`
  identifier)**: Vite renames imports in prod (`__rsCollapseDyn` → `t`
  or similar). Asserting the literal identifier would never match a real
  build. The fingerprints chosen are minification-stable (string/template-
  literal contents) AND collapse-emit-EXCLUSIVE (don't appear in non-
  collapsed code). Matches the precedent established by PR 1 of the
  static collapse's `assertProbeCollapsed`.

  **Bisect verified at the build-artifact layer**: reverted the
  `tryDynamicCollapse` fallthrough in `tryRocketstyleCollapse` (`return
tryPartialCollapse(...) || tryDynamicCollapse(...)` → `return
tryPartialCollapse(...)`), rebuilt compiler lib, re-ran verify-modes:

  - ALL THREE fingerprints become false; the probe falls back to a
    normal `h(Button, props)` mount (visible in the chunk:
    `r(a,{state:i(()=>o()?\`primary\`:\`secondary\`)...})`)
  - Restored → 2/2 cells green

  The `assertProbeCollapsed` (static collapse) cell still passes during
  the bisect — proves the dynamic assertion is independent of the static
  one and the dynamic fallthrough is the only delta.

  ## 3. Bail-census ratchet

  `collapse-bail-census.test.ts` extended with a new
  `dynamicTernaryAddressable` counter — sites that match the strict PR 3
  no-handler ternary-of-two-literals shape.

  **Honest finding from the real-corpus measurement**: of 564
  `@pyreon/ui-components` call sites across the corpus, **1 site (0.2%)
  matches the strict no-handler scope**. The bigger 15.4% dynamic-prop
  bucket is mostly HANDLER-COMBINED ternaries (e.g.
  `<Button state={cond ? 'primary' : 'secondary'} onClick={handle}>`)
  — which PR 3 BAILS by design (handler-combined dynamic-collapse is a
  future PR's scope via a combined `_rsCollapseDynH` helper).

  This is the actually-measured reality vs the "lift 73.2% → ~88%"
  projection from the earlier plan: the structural foundation is now
  shipped (helper + detector + emit + gate), but the immediate coverage
  win is small. The architectural value is the FOUNDATION for the
  handler-combined follow-up which would close most of the remaining
  dynamic-prop bucket.

  The trustworthiness gate (`myCollapsible === scannerCollapsible`) was
  updated to `myCollapsible + 2 * dynamicTernaryAddressable ===
scannerCollapsible` because the scanner now emits 2 entries per
  dynamic site (one per literal value for the resolver). Same load-bearing
  "census agrees with scanner truth-set" invariant, just accounting for
  the new expansion.

  ## Surfaces updated

  - `examples/ui-showcase/src/routes/rs-collapse-dyn-probe.tsx` —
    canonical dynamic-collapsible probe route (new)
  - `scripts/verify-modes.ts` — `assertDynProbeCollapsed` helper +
    extended `ui-showcase × spa` cell (build-artifact gate)
  - `packages/core/compiler/src/tests/collapse-bail-census.test.ts` —
    `dynamicTernaryAddressable` counter, updated trustworthiness gate,
    honest ratchet asserts
  - `.changeset/scripts-collapse-dyn-verify-modes.md` — patch changeset

  ## Validation

  - `bun run --filter='@pyreon/compiler' typecheck` — clean
  - `bun run --filter='@pyreon/compiler' lint` — zero errors
  - `bun run --filter='@pyreon/compiler' test` — 1285/1285 pass (1270
    pre-PR + 9 emit + 6 scan + 0 net delta on census which already counted)
  - `bun run verify-modes ui-showcase` — 2/2 cells pass (static
    `assertProbeCollapsed` + new dynamic `assertDynProbeCollapsed`)
  - `bun run gen-docs --check` — clean
  - `bun run check-doc-claims` — clean
  - `bun run check-manifest-depth` — clean

  ## NOT in this PR (deliberate, scoped)

  - **Real-Chromium e2e gate**: SKIPPED for symmetry with the established
    static-collapse pattern (which also has no e2e — runtime locked by
    PR 1's 7 `_rsCollapse` browser specs). PR 1's 7 `_rsCollapseDyn`
    real-Chromium specs ([#765](https://github.com/pyreon/pyreon/issues/765)) lock the runtime contract identically;
    the verify-modes gate locks the emit content; PR 1's bisect-verified
    specs lock the dispatch. The chain is complete without adding a
    third layer.
  - **Handler-combined dynamic emit**: the 15.4% dynamic-prop bucket
    is mostly handler-combined ternaries (`state={cond ? ...} onClick={h}`).
    PR 3's emit deliberately bails on these; a future PR could ship a
    combined `_rsCollapseDynH` runtime helper + emit to close that
    residual. Would lift the addressable count from 0.2% of corpus to
    closer to the full 15.4% bucket.

  ## Related

  - **[#765](https://github.com/pyreon/pyreon/issues/765)** (merged) — PR 1: `_rsCollapseDyn` runtime helper
  - **[#766](https://github.com/pyreon/pyreon/issues/766)** (open) — PR 2: `detectDynamicCollapsibleShape` detector
  - **[#767](https://github.com/pyreon/pyreon/issues/767)** (open) — PR 3: scan extension + emit `__rsCollapseDyn`
  - **[#761](https://github.com/pyreon/pyreon/issues/761)** (closed spike) — surfaced the recommendation

## 0.23.0

### Patch Changes

- [#754](https://github.com/pyreon/pyreon/pull/754) [`6454cb7`](https://github.com/pyreon/pyreon/commit/6454cb794bb82db11e7842cb4a62a3765e3dd3ac) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(security): close 17 CodeQL alerts (real bugs + workflow hardening; 20 false positives dismissed)

  Sweep through `github.com/pyreon/pyreon/security/code-scanning`. 37
  open alerts triaged into **17 real fixes + 20 false-positive
  dismissals**. The 4 remaining alerts are OpenSSF Scorecard project-
  posture metrics (CodeReview, Maintained, CIIBestPractices, Fuzzing)
  which can't be closed by a code PR — they're external posture
  checks.

  ### Real fixes (8 code + 9 polynomial-redos + 6 workflow)

  **Code:**

  - **[#27](https://github.com/pyreon/pyreon/issues/27) `@pyreon/zero` `fs-router.ts:1110`** — `import("${fullPath}")`
    interpolated `fullPath` raw into emitted JS. Path is developer-
    controlled (project's own filesystem scan), but a quote / backslash
    / newline in the path would corrupt the generated module source.
    Fixed: `JSON.stringify(fullPath)` — matches the existing `hmrId`
    pattern two lines above.
  - **[#37](https://github.com/pyreon/pyreon/issues/37) `@pyreon/lint` `anchor-is-valid.ts:67`** —
    `trimmed.toLowerCase().startsWith('javascript:')` only catches the
    one canonical scheme. CodeQL's `js/incomplete-url-scheme-check`
    expects the curated dangerous-scheme set. Added `vbscript:`
    (dead on modern browsers but a no-cost completion). `data:`
    intentionally omitted — legitimate `data:image/png;base64,…`
    href usage exists.
  - **[#20](https://github.com/pyreon/pyreon/issues/20)/[#21](https://github.com/pyreon/pyreon/issues/21)/[#22](https://github.com/pyreon/pyreon/issues/22) `@pyreon/solid-compat` `createStore` setStore** —
    `Object.assign(obj, value)` + dynamic `obj[key] = …` with user-
    supplied path keys allowed prototype pollution via
    `setStore('__proto__', evil)` or `setStore({ __proto__: … })`.
    Added a `DANGEROUS_KEYS` Set (`__proto__` / `constructor` /
    `prototype`) and a `safeAssign` helper — same shape as
    `@pyreon/reactivity reconcile.ts:34`. Path-key writes at any
    depth refuse the dangerous identifiers.

  **Polynomial-redos (`@pyreon/compiler`, `@pyreon/vite-plugin`):**

  - **[#9](https://github.com/pyreon/pyreon/issues/9)/[#10](https://github.com/pyreon/pyreon/issues/10)/[#11](https://github.com/pyreon/pyreon/issues/11) `pyreon-intercept.ts` pre-filter regexes** — bound
    `[^}]+` / `[^)]+` greedy quantifiers with `{0,500}` / `{1,500}`
    caps. Pre-filter is a SCAN before the precise AST walker; losing
    detector recall on pathologically long single-line input is
    acceptable.
  - **[#12](https://github.com/pyreon/pyreon/issues/12)/[#13](https://github.com/pyreon/pyreon/issues/13) `ssg-audit.ts` dynamic-route detection** — replaced
    `/\[.+\]/` with `/\[[^\]]+\]/`. Filename basenames are OS-bounded
    (~255 chars) anyway, but `[^\]]+` removes the backtrack potential
    entirely.
  - **[#16](https://github.com/pyreon/pyreon/issues/16) `vite-plugin.ts` ISLAND_CALL_RE** — bound `[\s\S]*?` lazy
    match to `[^}]{0,500}`. Real island() option blocks are tiny.
  - **[#17](https://github.com/pyreon/pyreon/issues/17) `vite-plugin.ts` NAMED_EXPORT_RE** — bound `[^}]+` to
    `[^}]{1,500}`. Real `export { … }` blocks fit easily.
  - **[#18](https://github.com/pyreon/pyreon/issues/18)/[#19](https://github.com/pyreon/pyreon/issues/19) `vite-plugin.ts` `split(/\s+as\s+/)`** — replaced with
    a pre-compiled `AS_SPLIT_RE = /\s{1,10}as\s{1,10}/` at module
    scope. Bounded `{1,10}` quantifiers eliminate worst-case
    backtracking while keeping every realistic import-specifier
    formatting matchable.

  **Workflows (`.github/workflows/`):**

  - **[#1](https://github.com/pyreon/pyreon/issues/1) perf.yml + [#54](https://github.com/pyreon/pyreon/issues/54) audit-leak-classes.yml** — added top-level
    `permissions: contents: read` block. Both workflows are read-only
    (perf records artifacts; audit reports findings).
  - **[#2](https://github.com/pyreon/pyreon/issues/2) release.yml** — restructured permissions: top-level
    `contents: read` (default), per-job `contents: write` +
    `pull-requests: write` + `id-token: write` on `stable` and
    `prerelease` (both publish via OIDC trusted publishing).
  - **[#55](https://github.com/pyreon/pyreon/issues/55)/[#56](https://github.com/pyreon/pyreon/issues/56)/[#57](https://github.com/pyreon/pyreon/issues/57) audit-leak-classes.yml** — pinned `actions/checkout`,
    `oven-sh/setup-bun`, `actions/upload-artifact` by full commit SHA.
    Same SHAs as the rest of `.github/workflows/` (the project's
    existing pinning convention).

  ### Dismissed via API (20 false positives / won't fix)

  **True false positives (9):**

  - **[#28](https://github.com/pyreon/pyreon/issues/28)** `js/clear-text-logging` on `batch.ts:120` — CodeQL matched
    "MAX_PASSES" as if it contained "password". Log is about
    effect-flush pass count.
  - **[#25](https://github.com/pyreon/pyreon/issues/25)/[#26](https://github.com/pyreon/pyreon/issues/26)** `js/bad-code-sanitization` on `vite-plugin.ts:1037,1307`
    — `JSON.stringify()` IS the canonical safe-embed for a string into
    emitted JS code.
  - **[#23](https://github.com/pyreon/pyreon/issues/23)/[#24](https://github.com/pyreon/pyreon/issues/24)** `js/prototype-pollution-utility` on `reconcile.ts:103,107`
    — `DANGEROUS_KEYS.has(key)` guard at line 93 already blocks
    `__proto__` / `constructor` / `prototype` before the assignment.
  - **[#34](https://github.com/pyreon/pyreon/issues/34)/[#35](https://github.com/pyreon/pyreon/issues/35)/[#36](https://github.com/pyreon/pyreon/issues/36)** `js/incomplete-sanitization` on `manifest/render.ts`
    - `mcp/index.ts` — `.replace(/\|/g, '\\|')` is markdown table-cell
      escaping of INTERNAL manifest API metadata (built at gen-docs time
      from `defineManifest()` values), not user-input sanitization.
  - **[#52](https://github.com/pyreon/pyreon/issues/52)** `js/http-to-file-access` on `font.ts` — deterministic font-
    file fetch resolved from CSS `@font-face` declarations parsed at
    build time, then written to a per-project cache dir keyed by a
    base64 hash of the URL. Not user-driven HTTP content writing to
    arbitrary paths.

  **Won't fix (internal dev tooling, not security boundaries):**

  - **[#42](https://github.com/pyreon/pyreon/issues/42)/[#43](https://github.com/pyreon/pyreon/issues/43)/[#44](https://github.com/pyreon/pyreon/issues/44)/[#45](https://github.com/pyreon/pyreon/issues/45)/[#47](https://github.com/pyreon/pyreon/issues/47)/[#48](https://github.com/pyreon/pyreon/issues/48)** `js/file-system-race` — CLI scaffolding
    (`pyreon context`, `create-zero`), build-time Vite plugin
    (`icons-plugin`), internal scripts (`check-bundle-budgets`,
    `serve-ssg`). Single-process, single-developer environments; no
    malicious actor with concurrent filesystem access in the threat
    model.
  - **[#30](https://github.com/pyreon/pyreon/issues/30)/[#31](https://github.com/pyreon/pyreon/issues/31)** `js/shell-command-injection-from-environment` —
    internal repo audit (`audit-codebase`) + benchmark harness
    (`bench/run-all`). Args controlled entirely by the script author,
    not external input.
  - **[#49](https://github.com/pyreon/pyreon/issues/49)/[#50](https://github.com/pyreon/pyreon/issues/50)** `js/indirect-command-line-injection` — internal git-
    affected-packages selectors (`affected.ts`, `e2e-affected.ts`).
    Args are git refs from the GitHub Actions workflow event.
  - **[#3](https://github.com/pyreon/pyreon/issues/3)** `PinnedDependenciesID` on `release-native.yml:252`
    (`npm install -g npm@latest`) — npm 11.5.1+ is the documented
    requirement for OIDC trusted publishing. Pinning an exact version
    blocks security patches; the OIDC token + Sigstore provenance is
    the actual supply-chain guarantee.

  ### Remaining (cannot be closed by a code PR)

  - **[#4](https://github.com/pyreon/pyreon/issues/4) CodeReviewID** — Scorecard counts review approvals per merge;
    squash-merge with self-review by maintainer doesn't count.
    Project-policy issue, not code.
  - **[#5](https://github.com/pyreon/pyreon/issues/5) MaintainedID** — auto-tracks repo activity, improves
    organically.
  - **[#6](https://github.com/pyreon/pyreon/issues/6) CIIBestPracticesID** — requires registering at
    bestpractices.coreinfrastructure.org. Out of scope for this PR.
  - **[#8](https://github.com/pyreon/pyreon/issues/8) FuzzingID** — requires OSS-Fuzz integration. Significant
    infra work, out of scope.

  ### Validation

  - `@pyreon/zero` 957/958 tests pass (1 pre-existing skip)
  - `@pyreon/compiler` 1257/1257 tests pass
  - `@pyreon/vite-plugin` 104/104 tests pass
  - `@pyreon/solid-compat` 218/218 tests pass
  - `@pyreon/lint` 672/672 tests pass
  - Lint + typecheck clean across all 5 packages

  ### Closes the security/code-scanning sweep

  37 alerts → 17 fixed in code + 20 dismissed with rationale + 4
  external-posture deferred. Net open count expected after CodeQL
  re-scans: 4 (Scorecard meta-checks).

- [#732](https://github.com/pyreon/pyreon/pull/732) [`eea2972`](https://github.com/pyreon/pyreon/commit/eea29723e36088ec32d3e817e0f5f61606c9b949) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(compiler): skip the `() => x` accessor wrap for stable-reference JSX children of component parents

  The Pyreon compiler's prop-inlining pass rewrites `<Comp>{children}</Comp>`
  (where `children` is a local `const` derived from a getter — typically
  `const children = childHolder.children` after `splitProps`) as
  `Comp({ ..., children: () => h.children })`. Receiving components see
  `props.children` as a FUNCTION instead of the expected `VNode | VNode[]`.
  DOM-consuming code routes through `mountChild` which handles function
  children correctly via `mountReactive`, so the wrap is invisible there.
  Libraries that iterate children at the VNode level or `cloneVNode` them
  directly were silently broken — the function spread produced
  `{type: undefined}` and the DOM rendered literal `<undefined>` tags. PR
  [#731](https://github.com/pyreon/pyreon/issues/731) shipped the library-side workaround for `@pyreon/kinetic`; this is
  the upstream compiler fix that catches the broader class.

  ## The carve-out

  For JSX children of COMPONENT parents (uppercase tag), skip the wrap when:

  1. The expression is a **stable reference** — bare `Identifier`, simple
     non-computed `MemberExpression` chain (`obj.x.y`), or any of the above
     wrapped in TS type-only layers (`as T` / `satisfies T` / `!` / parens).
  2. The expression does **not** reference a tracked signal variable.

  Both conditions matter:

  - **(1)** restricts the carve-out to shapes whose value at JSX-emit time
    is identical to what an effect re-evaluation would produce — a bare
    property read resolves the underlying getter (if any) the same way once
    or N times. CallExpressions, BinaryExpressions, ConditionalExpressions,
    etc. keep the wrap because their re-evaluation semantics matter.
  - **(2)** preserves `<Comp>{count}</Comp>` (bare signal identifier) as the
    user's deliberate "make this reactive at the call site" shape. The
    compiler auto-calls (`count` → `count()`) AND wraps (`() => count()`)
    so the receiving component re-evaluates inside its
    `mountReactive`/`mountChild` scope.

  The slice is taken of the UNWRAPPED expression — TS type-only layers
  strip because esbuild's next stage removes them anyway, and this keeps
  cross-backend equivalence with the Rust path (whose `accesses_props`
  doesn't recurse into `TSAsExpression`).

  ## Cross-backend parity

  Both `transformJSX_JS` (TypeScript fallback) and the Rust `napi-rs`
  native binary implement the carve-out byte-identically. The cross-backend
  equivalence suite (`native-equivalence.test.ts`) gains 8 specs covering
  every shape (stable-ref / call / binary / DOM parent / signal / TS cast
  / non-null / fragment-transparency / static-array form). All pass on both
  backends.

  ## Relationship to PR [#731](https://github.com/pyreon/pyreon/issues/731) — complementary, not replacement

  This compiler fix and PR [#731](https://github.com/pyreon/pyreon/issues/731)'s library-side `resolveChildren` are
  COMPLEMENTARY layers:

  - **The compiler fix** addresses the OUTER pass-through pattern — any
    library or user code that forwards children to a child component via
    `<Comp>{children}</Comp>` where `children` is a local binding. No more
    silent function-wrap surprises for the most common shape.
  - **PR [#731](https://github.com/pyreon/pyreon/issues/731)'s library fix** addresses the INNER pattern — kinetic's
    StaggerRenderer / GroupRenderer emit JSX like
    `<TransitionItem>{cloneVNode(child, {style})}</TransitionItem>`. The
    inner expression is a CallExpression (`cloneVNode(...)`), NOT a stable
    reference, so the compiler carve-out (correctly) does not apply. The
    library-side unwrap is still needed for that case.

  Verified end-to-end against the bokisch.com Intro reproducer:

  - Compiler fix alone (kinetic at vanilla 0.22.0): bug still fires
    (`h1Count: 0`, 3 `<undefined>` tags from TransitionItem's
    `cloneVNode(function, {ref})`).
  - PR [#731](https://github.com/pyreon/pyreon/issues/731) alone (no compiler fix): bug fixed (PR [#731](https://github.com/pyreon/pyreon/issues/731) verified end-to-end).
  - Both layered: bug fixed AND the emitted bundle is cleaner
    (`children: h.children` bare instead of `children: () => h.children`).

  ## Bisect-verified at three layers

  - **JS backend**: `packages/core/compiler/src/tests/component-child-no-wrap.test.ts`
    (10 specs). Reverting the `isComponentTag(...) && isStableReference(expr)`
    carve-out fails 5 CONTRACT specs; 5 CONTROL specs stay green.
  - **Rust backend**: same carve-out mirrored in `native/src/lib.rs`
    (`is_stable_reference` + `unwrap_type_layers` + parent-component flag
    threading). Reverting fails the 8 new specs in `native-equivalence.test.ts`;
    244 pre-existing specs stay green.
  - **Real-app**: bokisch.com Intro with PR [#731](https://github.com/pyreon/pyreon/issues/731)'s library fix + this
    compiler fix → `h1Count: 1`, "Hello" rendered, zero `<undefined>` tags,
    emitted bundle shows `children: h.children` (no wrap).

  ## Surfaces updated

  - `packages/core/compiler/src/jsx.ts` — `handleJsxExpression(node, parentJsx?)`
    - `isComponentTag` + `isStableReference` + `unwrapTypeLayers`
  - `packages/core/compiler/native/src/lib.rs` — same logic, byte-identical
    emit; `parent_is_component_jsx_element` Ctx flag threaded through
    `handle_jsx_element` and reset across `JSXFragment` boundaries (matches
    JS-backend semantics)
  - `packages/core/compiler/src/tests/component-child-no-wrap.test.ts` —
    10 regression specs (5 CONTRACT + 5 CONTROL) with full bisect rationale
  - `packages/core/compiler/src/tests/native-equivalence.test.ts` —
    8 new cross-backend specs

## 0.22.0

## 0.21.0

## 0.20.0

### Minor Changes

- [#659](https://github.com/pyreon/pyreon/pull/659) [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat: P0 compile-time rocketstyle wrapper-collapse (opt-in `pyreon({ collapse: true })`)

  The vertical slice of the P0 RFC. A literal-prop rocketstyle call site
  (`<Button state="primary" size="medium">Save</Button>` — every dimension
  prop a string literal, no spread, static-text children) collapses from a
  5-layer wrapper mount (rocketstyle → attrs HOC → Element → Wrapper →
  styled) into ONE `_rsCollapse` cloneNode. E2 measured **44× wall-clock**,
  `mountChild` 9→1, `styler.resolve` 22→0. **OFF by default** — zero
  behaviour change unless `pyreon({ collapse: true })` is set.

  Parity is guaranteed BY CONSTRUCTION, not by reimplementing the
  rocketstyle chain in the compiler (RFC decision 2): the Vite plugin
  spins ONE programmatic Vite-SSR server bound to the consumer's own
  `vite.config`, renders the REAL component twice (light + dark), and
  captures the resolved class + styler rule text — the same
  `renderToString` + `@pyreon/styler` code path the app uses. Styler's
  FNV-1a class hash is identical SSR vs DOM (its hydration contract), so
  the build-resolved class is byte-for-byte the client-mounted class.

  New public surface (all additive):

  - `@pyreon/styler` — `StyleSheet.getStyleRules()` (raw SSR rule
    snapshot) + `StyleSheet.injectRules(rules, key)` (idempotent
    pre-resolved rule injection, no re-hash).
  - `@pyreon/runtime-dom` — `_rsCollapse(html, lightClass, darkClass,
isDark, bind?)` (one html-keyed `_tpl` cloneNode; class reactively
    bound to the live mode accessor — RFC decision 1 dual-emit, mode swap
    re-runs ONLY the className on the SAME node, no remount; decision 4
    hoisted-factory). `runtime-dom` stays layer-pure (never imports
    styler/ui-core — the styler injection is the emitted code's job).
  - `@pyreon/compiler` — `scanCollapsibleSites()` +
    `rocketstyleCollapseKey()` exports + `TransformOptions.collapseRocketstyle`.
    Detection + emission live ONLY in the JS path; `transformJSX`
    short-circuits to `transformJSX_JS` when the option is set (the Rust
    binary doesn't implement it). A SINGLE shared `detectCollapsibleShape`
    bail catalogue is used by both the plugin scan and the compiler emit
    so resolution keys can't drift.
  - `@pyreon/vite-plugin` — `pyreon({ collapse: true | PyreonCollapseOptions })`
    - `createCollapseResolver` (Vite-SSR resolver, memoised, disposed in
      `closeBundle`). Only the CLIENT graph collapses — the SSR graph keeps
      the real mount.

  Tested across 5 layers: styler `injectRules` (3 real-Chromium specs);
  `_rsCollapse` (4 real-Chromium specs — light class, mode-flip-no-remount,
  children dispose, shared parsed template); resolver vs the REAL
  `@pyreon/ui-components` Button via Vite SSR (8 specs incl. determinism +
  graceful bail on a non-existent export); compiler detection / emission /
  full bail catalogue / once-per-module dedupe (13 specs); end-to-end
  pipeline — real Button → resolver → scanner → compiler emits
  `__rsCollapse` carrying the real SSR-resolved classes + class-stripped
  template + rule bundle byte-for-byte. **Phase-4 RFC acceptance, real
  Chromium, shipped `_rsCollapse` × the REAL `@pyreon/ui-components` Button**
  (`examples/experiments/e2-static-rocketstyle/e2.browser.test.ts`, 2 specs):
  (1) the collapsed `<button>` is `isEqualNode`-structurally-identical to
  the real rocketstyle-mounted one with a char-for-char-equal `className`
  and identical computed style; (2) the perf signature is exactly
  `runtime.tpl ≥ 1` + `runtime.mountChild == 1` per Button (the real mount
  is 8–9 mountChild) with **~27× wall-clock** (collapsed 0.20 ms vs
  baseline 5.40 ms, in-suite benchmark). Additive guarantee: all 1079
  `@pyreon/compiler` tests pass unchanged with collapse off.

  Bisect-verified: disabling the compiler's `tryRocketstyleCollapse(node)`
  detection call fails the 4 collapse-emission specs (`expected … to
contain '__rsCollapse('`) while the 9 bail-catalogue / key-stability
  specs still pass; restored → 13/13.

  **Deliberately deferred (follow-up PRs, tracked in
  `.claude/plans/open-work-2026-q3.md` §P0):** an `examples/ui-showcase`
  build-with-collapse **verify-modes cell** (a build-artifact gate —
  ui-showcase's Buttons all carry `onClick` → correctly bail, so it needs
  a dedicated literal-prop demo route first; note the real-Chromium
  DOM-parity + perf-counter acceptance is NOT deferred — it ships here as
  the Phase-4 e2 specs above), and dev-mode collapse (build-shaped today —
  dev keeps the normal mount, graceful). The
  slice is fundamentally complete end-to-end (detect → resolve → emit →
  parity-proven); these extend coverage, they are not gaps in the
  mechanism. The RFC doc was removed once shipped — its decisions are now
  the code, documented in `CLAUDE.md` → "Compile-time rocketstyle collapse".

### Patch Changes

- [#687](https://github.com/pyreon/pyreon/pull/687) [`c3df9db`](https://github.com/pyreon/pyreon/commit/c3df9dbbcf9e939c92e1c4843b59686cdd25589e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native (Rust) backend brought to 1:1 with the JS backend for the two
  prop-derived/element-child fixes [#686](https://github.com/pyreon/pyreon/issues/686) landed on the JS side only. Without
  this, the production-preferred native backend silently diverged.

  - R7 — prop-derived inlining inside callback-nested JSX. `collect_prop_derived_idents`
    (native/src/lib.rs) had empty `Arrow|FunctionExpression => {}` arms and no
    JSX arm, so it never descended into a `.map(i => <li class={cls}/>)`
    callback body: `const cls = props.t; items.map(i => <li class={cls}/>)` kept
    `class={cls}` (const frozen at first render → reactivity SILENTLY LOST in
    real builds) while the JS backend inlined `class={(props.t)}`. Fixed: the
    arrow/function arms recurse into the body (concise + block) and JSX, with a
    `pd_minus` scope filter that removes names a scope binds (params / nested
    const-let / catch / loop) — byte-equivalent to the JS pass's scope-aware
    enter/leave set, so recursing does NOT reintroduce the shadowing-param
    clobber.

  - R9 — element-valued binding as a bare JSX child. The JS backend (via [#686](https://github.com/pyreon/pyreon/issues/686))
    mounts `const h=<h1/>; <div>{h}</div>` through `_mountSlot`; the native
    backend still text-coerced it to `createTextNode(h)` ("[object Object]").
    Fixed: the native backend tracks element-valued `const`/`let` bindings and
    routes a bare `{h}` child through `_mountSlot`, mirroring the JS path.

  No public API change; new cross-backend parity test only. native-equivalence
  suite 244/244 (unchanged), full compiler suite green, all three mechanisms
  bisect-verified (revert -> fail with the right error -> restore -> pass).

  Known orthogonal limitation (pre-existing, NOT introduced here, NOT a
  correctness bug): `{localArrowConst()}` whose body shadows via catch /
  nested-const emits different but both semantically-correct representations
  (JS inlines the arrow body; Rust binds the function reference). Outside the
  native-equivalence contract and out of scope; disclosed for honesty.

- [#686](https://github.com/pyreon/pyreon/pull/686) [`9a54705`](https://github.com/pyreon/pyreon/commit/9a54705c645ff2c3bee54fa8c6d411d1530b3187) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Compiler hardening sweep (10 systematic rounds — edge cases, miscompiles,
  memory, cross-backend). Two real correctness bugs fixed; two more proven,
  root-caused, and locked with self-discriminating tests (fixes scoped as
  follow-ups); the rest disproved and locked with contract/characterization
  tests so the verified behavior cannot silently regress.

  Fixed (behavior changes):

  - Scope-blind prop-derived inlining (silent miscompile + un-parseable emit).
    The reactive-props inlining pass substituted any identifier whose NAME
    matched a prop-derived const, with zero lexical-scope analysis. Idiomatic
    code reusing a short name (a / x / i / item) as a later callback parameter
    or nested local was MIS-COMPILED: a prop-derived const named the same as a
    ".map" arrow parameter produced an arrow whose parameter was rewritten to a
    member expression (un-parseable JS); a shadowing catch parameter likewise
    produced un-parseable output; a nested "const a = 7; return a" silently
    became "return props.x". The substitution is now lexically scope-aware
    (scopeBoundPropDerived plus a shadowed set threaded through the walk),
    mirroring the discipline the signal-auto-call pass already had. Genuine
    (non-shadowed) and transitive inlining is unchanged. Bisect-verified.

  - Raw C0 control bytes in source string/regex literals. The FNV-1a
    rocketstyleCollapseKey builder embedded literal NUL and SOH bytes as field
    separators (and a CLI ANSI module embedded a raw ESC), which classified the
    compiler's primary source as binary (grep/rg silently skip it) and made a
    cache-key separator silently mutable by formatters/editors. All replaced
    with byte-identical Unicode escape sequences; the emitted FNV key is
    provably unchanged. A repo-wide self-discriminating gate prevents
    reintroduction.

  Proven + locked (fixes scoped as tracked follow-ups, guarded by an it.fails
  spec that flips green-to-red the moment the fix lands):

  - JS-vs-Rust backend divergence: the native backend does not inline
    prop-derived consts used inside callback-nested JSX (the
    "const cls = props.t; items.map(i => <li class={cls}/>)" shape), so that
    ubiquitous pattern silently loses reactivity under the production
    (native-preferred) path. Root cause: collect_prop_derived_idents in
    native/src/lib.rs has no recursion arm for arrow/function/JSX nodes.

  - Element-valued const used as a bare JSX child is text-coerced
    (createTextNode(x), which renders [object Object]) instead of mounted, even
    though the compiler already lowered the const to a \_tpl(...) call and thus
    knows it is an element.

  No public API change. The new test suites add coverage only.

- [#689](https://github.com/pyreon/pyreon/pull/689) [`bbccaaf`](https://github.com/pyreon/pyreon/commit/bbccaaf3ec2f5dc3eed3e7195a09023fc59575d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Compiler hardening rounds 11–20 — two more real reactivity bugs fixed
  (bisect-verified), plus regression locks for two proven gaps.

  - R11 — signal auto-call was scope-blind. `autoCallSignals` inserted `()`
    after every active-signal-named identifier with a hand-rolled skip-list
    that did NOT cover callback parameter binding positions, and it walked the
    wrapped expression scope-blind. A destructured/plain callback param
    reusing a signal's name was wrongly auto-called:
    `const x = signal(0); [{x:1}].map(({x}) => <li>{x}</li>)` emitted
    `<li>{x()}</li>` — `x` is the map item (1) → `1()` runtime TypeError (the
    signal twin of the R2 prop-derived scope bug). Fixed: `findSignalIdents` is
    now block-accurate scope-aware (`scopeBoundSignals` + a `shadowed` set with
    enter/leave, mirroring R2's `findIdents`); legitimate non-shadowed signal
    reads still auto-call. The JS backend now converges onto the
    already-correct native backend (no new divergence).

  - R13 — native-backend R7 residual. The resolution gate `accesses_props`
    (native/src/lib.rs) plus `collect_pd_in_stmt`'s statement coverage skipped
    prop-derived refs nested inside a callback whose body is a
    while/switch/try/labeled statement, so the production-preferred native
    backend silently under-inlined (`class={c}`) where JS inlined
    `class={(props.x)}` — reactivity lost. Fixed by completing the native
    statement-walker coverage with the same `pd_minus` scope-filter discipline
    (no shadowing-clobber regression); validated against all 180
    native-equivalence tests + full suite, binary rebuilt, bisect-verified.

  - R12 — `transformJSX` emitted NO source map and its substitutions shift
    line counts (template emission expands one-line JSX into a multi-line
    `_tpl(...)` factory), and `@pyreon/vite-plugin` returned `{ code, map: null }`
    — so every runtime stack frame / debugger breakpoint in every Pyreon
    component mislocated app-wide. Fixed: `transformJSX_JS` now applies its
    existing disjoint `{start,end,text}` replacement set through MagicString
    (`update`/`appendLeft`) and the generated preamble via `prepend`;
    `toString()` is byte-identical to the prior concatenation (proven — the
    full ~1240-test suite + 180 native-equivalence tests assert exact emitted
    strings and stay green), while `generateMap()` yields a correct V3 map
    (`prepend` shifts every mapping by the preamble's line count, accounting
    for the line-shift). `@pyreon/vite-plugin` now returns that map. New
    `magic-string` direct dependency on `@pyreon/compiler` (already a
    transitive dep of the toolchain — +1 lockfile line, no new package in any
    install). Build-mode maps are exact; dev-mode HMR / signal-name injections
    add a small un-remapped offset (still vastly better than no map); the
    native backend still emits no map (its own scoped follow-up). Bisect-
    verified: neutralize the map production → the sourcemap specs fail while
    byte-identity stays green; restore → pass.

  Still locked (proven, not yet fixed — scoped follow-up, no behavior change
  here): R15 — a prop-derived-referencing element-valued const
  (`const el=<i class={cls}/>`) diverges between backends (JS inlines+
  duplicates the JSX reactively, native mounts the frozen const); carries a
  self-discriminating `it.fails` lock that flips the moment the semantics are
  unified.

  No public API change. New tests only for the locks; the two fixes change
  emitted code for the buggy shapes (correctness) and are byte-equivalent
  across backends for everything else (R20 adds a JS↔Rust equivalence sweep
  gate over the rounds-11–19 corpus).

- [#679](https://github.com/pyreon/pyreon/pull/679) [`24a063c`](https://github.com/pyreon/pyreon/commit/24a063ccfa2ef267927dfd68886be24c397ccd72) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `detectPartialCollapsibleShape` + `CollapsibleHandler` — PR 1 of the
  partial-collapse build (open-work [#1](https://github.com/pyreon/pyreon/issues/1)). Purely additive: a new exported
  detector for the `on*`-handler-only collapsible subset (literal dimension
  props + peeled event handlers). No production path calls it yet (the
  `tryRocketstyleCollapse` fallback + plugin scan land in a follow-up PR),
  so existing compiler behaviour is byte-unchanged.

- [#683](https://github.com/pyreon/pyreon/pull/683) [`a086769`](https://github.com/pyreon/pyreon/commit/a0867699bdeca87f34e60fef7aa867a75a24d815) Thanks [@vitbokisch](https://github.com/vitbokisch)! - PR 3 of the partial-collapse build (open-work [#1](https://github.com/pyreon/pyreon/issues/1)): `tryRocketstyleCollapse`
  falls back to `tryPartialCollapse` (PR 1's `detectPartialCollapsibleShape`)
  when the full `detectCollapsibleShape` bails, emitting `__rsCollapseH(...)`
  - a residual-handlers object (consumed by PR 2's `_rsCollapseH`) for the
    `on*`-handler-only subset. Purely additive — the full-collapse and
    non-collapse code paths are byte-identical (the only delta is the
    `if (!shape)` fallback line + a conditional `_rsCollapseH` import that is
    byte-identical when no partial site fired). Off by default; emits only
    when `collapseRocketstyle` is configured AND the plugin has resolved the
    partial site (the resolver/plugin-scan half is the follow-up PR).

## 0.19.0

### Minor Changes

- [#593](https://github.com/pyreon/pyreon/pull/593) [`5b69841`](https://github.com/pyreon/pyreon/commit/5b69841a6ab30963977e276d120c33d66682da23) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Defer>` inline form (v2) — closes 3 of the 4 scope gaps from PR [#587](https://github.com/pyreon/pyreon/issues/587):

  **Props on inline child** (gap 1)

  ```tsx
  // Before — bailed with no warning; runtime errored.
  <Defer when={open}>
    <Modal title="Confirm" size="md" />
  </Defer>

  // Now — compiler rewrites:
  <Defer when={open} chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}>
    {(__C) => <__C title="Confirm" size="md" />}
  </Defer>
  ```

  Props pass through verbatim into the render-prop body. The compiler only replaces the JSXIdentifier name (in opening AND closing tags) with `__C`; everything else (attrs, spread props, event handlers, nested children) survives unchanged.

  **Closure capture** (gap 2)

  ```tsx
  const open = signal(false)
  const count = signal(0)

  <Defer when={open}>
    <Modal count={count} onClose={() => open.set(false)} />
  </Defer>
  ```

  Works automatically once gap 1 is fixed — the render-prop arrow function lexically captures the surrounding scope, so `count` / `open` references resolve correctly at chunk-load time. No new code path; this falls out of preserving the child JSX verbatim.

  **Renamed imports** (gap 3)

  ```tsx
  // Before — bailed with `import-not-found` warning.
  import { Modal as M } from './Modal'
  <Defer when={open}><M /></Defer>

  // Now — compiler rewrites, extracting the ORIGINAL exported name from the chunk:
  <Defer when={open} chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}>
    {(__C) => <__C />}
  </Defer>
  ```

  `__m.Modal` — not `__m.M`. The chunk resolves the module's actual export, while the render-prop body uses `__C` (the render-prop binding).

  **Multi-specifier import handling** (drive-by bug fix)

  ```tsx
  import { Modal, OtherStuff } from "./shared";
  // ... uses OtherStuff elsewhere ...
  <Defer when={open}>
    <Modal />
  </Defer>;
  ```

  v1 would have removed the entire `import { Modal, OtherStuff }` declaration, breaking `OtherStuff`'s usage. v2 removes ONLY the `Modal` specifier — the import becomes `import { OtherStuff } from './shared'`. Sibling bindings stay intact. Handles both first-specifier and later-specifier cases.

  **Still NOT in this** (gap 4 — namespace imports)

  ```tsx
  import * as M from "./Modal";
  <Defer>
    <M.Modal />
  </Defer>; // — still bails
  ```

  Namespace imports with `JSXMemberExpression` children require a different rewrite path (the `_C` binding can't replace `M.Modal` since it's a member access, not an identifier). Not addressed in this PR — explicit form is the workaround.

  ## Verification

  - 16 unit tests in `defer-inline.test.ts` (3 new props tests + 2 renamed-imports tests + 2 multi-specifier tests in addition to the existing 9)
  - End-to-end via verify-modes — `examples/playground/src/pages/About.tsx` now uses inline `<Defer><DeferredFixture label="..." /></Defer>`, exercising prop-preservation through a real Vite build. The fingerprint `DEFER_INLINE_FIXTURE_PROP_LABEL_ABC987` must land in the route chunk (the render-prop body lives in the caller), NOT in the fixture chunk.
  - Bisect-verified: reverting `buildRenderPropBody` to a constant `{(__C) => <__C />}` (drops prop preservation) → cell fails with `fingerprint "DEFER_INLINE_FIXTURE_PROP_LABEL_ABC987" found in 0 chunks`. Restored → passes.

  1007 `@pyreon/compiler` tests pass.

- [#594](https://github.com/pyreon/pyreon/pull/594) [`e274fce`](https://github.com/pyreon/pyreon/commit/e274fceeb37d0893c7425463e443185388fce475) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Defer>` inline form (v3) — closes the last open scope gap: namespace imports.

  ```tsx
  // Before — bailed with `import-not-found`; user had to use the explicit form.
  import * as M from './Modal'
  <Defer when={open}><M.Modal /></Defer>

  // Now — compiler rewrites:
  <Defer when={open} chunk={() => import('./Modal').then((__m) => ({ default: __m.Modal }))}>
    {(__C) => <__C />}
  </Defer>
  ```

  The compiler recognises `<M.Modal />` as a depth-1 `JSXMemberExpression`, looks up `M` as an `ImportNamespaceSpecifier`, and rewrites:

  1. The chunk extracts `__m.Modal` (the JSX property — `Modal`) from the namespace's source module
  2. The full `M.Modal` JSX name is replaced with `__C` in both opening and closing tags
  3. The static `import * as M from './Modal'` is removed (when M isn't used elsewhere)

  Closes gap 4 from the v2 follow-up roadmap — every common import shape now works inline:

  - `import X from './X'` ✓ (v1)
  - `import { X } from './X'` ✓ (v1)
  - `import { X as Y } from './X'` ✓ (v2)
  - `import * as M from './X'; <M.X />` ✓ (v3, this PR)

  Plus: multi-specifier imports drop only the deferred binding (v2 drive-by fix).

  **Sub-gaps explicitly NOT closed by this PR:**

  - **Deeper member expressions** (`<M.Sub.Modal />`) — `analyzeChildElement` returns null for non-depth-1 member expressions. The Defer is left alone; runtime errors with "missing chunk" if mounted. Workaround: explicit form.
  - **Member access on a default-import** (`import M from './X'; <M.Modal />`) — semantically different (member access on a component, not a namespace bag). Compiler emits `defer-inline/unsupported-import-shape` warning so the author understands why the inline form is being skipped.
  - **Namespace bindings referenced elsewhere in the file** (`import * as M; const x = M.Settings; <Defer><M.Modal /></Defer>`) — bails with `defer-inline/import-used-elsewhere` (Rolldown would static-bundle the module on shared usage, making the dynamic import a no-op). Common shape; users hitting this need either the explicit form or to refactor the namespace import.

  ## Verification

  - **23 unit tests** in `defer-inline.test.ts` (7 new for v3 — basic rewrite + props on member-expression child + non-self-closing + 4 bail-out cases)
  - **Real-app verify-modes**: `examples/playground/src/pages/About.tsx` now uses BOTH the v2 prop-preservation shape (`<DeferredFixture label="..." />`) AND the v3 namespace shape (`<NS.NamespaceFixture />`). New fingerprint `DEFER_NAMESPACE_FIXTURE_MARKER_QRS456` asserts the namespace fixture lands in its own chunk.
  - **Bisect-verified**: disabling the `ImportNamespaceSpecifier` branch in `findImportFor` → fingerprint lands in `about-*.js` (the route chunk) instead of `NamespaceFixture-*.js`. Restored → passes. Grep for `TEMP BISECT` → clean.

  1014 `@pyreon/compiler` tests pass.

- [#611](https://github.com/pyreon/pyreon/pull/611) [`070a0ec`](https://github.com/pyreon/pyreon/commit/070a0ec687ad598cf15963e5615bb1d8c81933a3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **Reactivity Lens (experimental)** — surface the compiler's already-computed reactivity analysis back to the author at the source.

  Pyreon's [#1](https://github.com/pyreon/pyreon/issues/1) silent footgun: whether code is reactive is invisible at the moment you write it. The compiler ALREADY decides this per-expression for codegen and discards the analysis. The Lens pipes it back.

  - `@pyreon/compiler`: additive opt-in `TransformOptions.reactivityLens` → `TransformResult.reactivityLens: ReactivitySpan[]` (emitted code byte-identical with it on/off; all existing compiler tests pass unchanged). New exports `analyzeReactivity()` / `formatReactivityLens()` + `ReactivityKind` / `ReactivitySpan` / `ReactivityFinding` types. `analyzeReactivity` merges the structural compiler facts with the existing `detectPyreonPatterns` footgun detectors under one taxonomy.
  - `@pyreon/lint`: the existing `--lsp` server gains an `inlayHintProvider` + `textDocument/inlayHint` handler rendering `live` / `static` / `live·prop` / `hoisted` ghost-text at each reactive/baked-once expression; footguns publish as `pyreon-lens` warning diagnostics. Adds a `@pyreon/compiler` dependency.

  JS-backend only (native Rust sidecar parity is a follow-up). The positive "this is live" claim is a faithful record of the codegen branch, not a heuristic — drift-gated + bisect-verified.

### Patch Changes

- [#622](https://github.com/pyreon/pyreon/pull/622) [`5fb461a`](https://github.com/pyreon/pyreon/commit/5fb461aaf9fcc8d2a624af1442f4db97fd7f33c9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Migrate `@pyreon/compiler` onto the manifest-driven docs pipeline.

  `@pyreon/compiler` was the last core-layer package with NO `src/manifest.ts` — its `llms.txt` / `llms-full.txt` / MCP `api-reference.ts` surfaces did not exist at all (it was simply absent from every generated doc, and `get_api(compiler, …)` 404'd for the entire public surface including the Reactivity-Lens). This is the cause-level fix behind the "Lens docs enrichment" follow-up: the Lens couldn't be documented because the package it lives in wasn't on the pipeline.

  **Added** `packages/core/compiler/src/manifest.ts` via `defineManifest()` — 18 `api[]` entries (the full public surface from `src/index.ts`): `transformJSX`, `transformJSX_JS`, `analyzeReactivity`, `formatReactivityLens`, `detectReactPatterns`, `migrateReactCode`, `hasReactPatterns`, `diagnoseError`, `detectPyreonPatterns`, `hasPyreonPatterns`, `auditTestEnvironment`, `formatTestAudit`, `auditIslands`, `formatIslandAudit`, `auditSsg`, `formatSsgAudit`, `transformDeferInline`, `generateContext`. Every entry carries an accurate `signature` + dense `summary`; the real foot-guns get `mistakes[]` (the dual-backend invisibility trap, the SSR-needs-`h()`-not-`_tpl()` trap, `knownSignals` cross-module seeding, the Lens asymmetric-precision contract, the enforced `fixable: false` invariant); `analyzeReactivity` / `formatReactivityLens` are flagged `stability: 'experimental'`; 3 package-level `gotchas` (dual backend, Lens is editor-only, detectors are not codemods).

  **Wiring:** added `@pyreon/manifest` as a `workspace:*` devDependency on `@pyreon/compiler` (matches the `@pyreon/lint` convention — `manifest.ts` is gen-docs-only, never imported by `src/index.ts`, so it's tree-shaken from the published `lib/`). Added the `// <gen-docs:api-reference:start/end @pyreon/compiler>` marker pair to `packages/tools/mcp/src/api-reference.ts` (core-layer slot, between `@pyreon/core` and `@pyreon/router`). `bun run gen-docs` regenerated the `llms.txt` bullet, the `llms-full.txt` `## @pyreon/compiler` section, and the 18-entry MCP api-reference region; updated the hand-prose `## Core Framework` count 6 → 7.

  **No runtime or API change** — purely additive doc-pipeline metadata. `gen-docs --check` in sync; lint 0 errors; typecheck clean (compiler + mcp); compiler 1053 tests, mcp 497, manifest 135 all green; `check-manifest-depth` passes (compiler enters at port-grade density and is intentionally NOT added to `LOCKED` — it's the visible migration backlog, not yet at flagship density). New `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + the experimental-flag and foot-gun-catalog assertions locally in addition to the CI `Docs Sync` gate.

- [#630](https://github.com/pyreon/pyreon/pull/630) [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: make `pyreon doctor` objective + close the real first-party findings it then surfaced

  `pyreon doctor` reported a meaningless **F (score 55, 987 errors)** because
  its `lint` / `react-patterns` / `pyreon-patterns` gates scanned the WHOLE
  repo: example apps (intentionally framework-idiomatic, incl. react-compat
  demos), `e2e/`/`docs/`/`scripts/`, detector test-fixtures (which
  _deliberately_ contain anti-patterns so the detectors can be tested), and
  the `*-compat` packages (whose public API IS React/Vue/etc. by design).
  ~705/987 errors were examples + fixtures; the rest a never-CI-enforced
  advisory backlog or by-design.

  **Objectivity (the deliverable):** the three gates now audit ONLY
  first-party published source — `packages/<cat>/<pkg>/src/**`, excluding
  tests/fixtures/`.d.ts` — via pure, unit-tested predicates
  (`isFirstPartySourceFile` / `isCompatPackageFile`); `react-patterns`
  additionally skips `*-compat` src (a React-API shim containing `useState`
  is a definitional false positive). Errors **987 → 86**.

  **Detector precision (false positives are the antithesis of objective):**

  - `@pyreon/compiler` `dot-value-signal`: now requires the receiver to be a
    tracked signal binding — no longer flags `input.value` / `cell.value` /
    `o.value` (17 FPs; bisect-verified).
  - `@pyreon/lint` `no-window-in-ssr`: recognizes field-captured typeof
    (`this.isSSR = typeof document === 'undefined'`) and function-head
    early-return guards covering nested closures (bisect-verified).
  - `@pyreon/lint` `no-bare-signal-in-jsx`: now supports `exemptPaths`
    (consistent with the other exemptable rules) — render-function
    primitives read signals in JSX _attribute_ positions which the compiler
    `_rp()`-wraps; the text-position heuristic over-fired there.

  **Genuine first-party SSR bugs fixed** (the rule correctly did NOT silence
  these — cross-function/method guards aren't lexically traceable):

  - `@pyreon/head` `createNewTag` — added `typeof document` guard.
  - `@pyreon/styler` `Sheet.mount()` — in-method `if (this.isSSR) return`.
  - `@pyreon/hotkeys` `detachListener` — `typeof window` guard.
  - `@pyreon/flow` flow-component — guarded `new ResizeObserver` with
    `typeof ResizeObserver === 'function'`.
  - `@pyreon/core` lifecycle — renamed a local `location` shadowing the
    browser global (hygiene; also removed an SSR-analysis false positive).

  **Curated `.pyreonlintrc.json`** exemptions (with rationale) for
  genuinely-non-SSR-runtime surfaces: `@pyreon/compiler` (build-time Node)
  and `*-compat` (DOM-runtime framework adapters, consistent with the
  existing `runtime-dom` exemption) for `no-window-in-ssr`; `*-compat` for
  `dev-guard-warnings` (intentional user-facing "[Pyreon] X not supported"
  guidance that must reach prod).

  **Result: errors 987 → 1.** The single remaining `no-window-in-ssr` in
  `@pyreon/ui-core` (`_isBrowser && matchMedia(...)`) is provably SSR-safe
  (short-circuit; `_isBrowser` is a `typeof`-AND const) — a documented
  known rule-precision limitation, left visible (NOT exempted: silencing it
  would hide future _real_ ui-core SSR bugs — anti-objective).

  Verified: 8 touched packages, 3091 unit tests pass; typecheck clean;
  full-repo `oxlint` 0 errors; e2e 127 specs pass (default 92 +
  ui-regression 26 + app-showcase 9); each detector change bisect-verified.

- [#644](https://github.com/pyreon/pyreon/pull/644) [`6472de0`](https://github.com/pyreon/pyreon/commit/6472de00ffdbcff1fd453c125c404b75fc5cc46d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Release pipeline: `scripts/publish.ts` now resolves `workspace:` ranges in `optionalDependencies` (previously only `dependencies` / `peerDependencies` / `devDependencies` were resolved).

  `@pyreon/compiler` is the only package using `optionalDependencies` — its 7 per-platform native-binary packages (`@pyreon/compiler-<triple>`). Because that 4th field was never passed through `resolveWorkspaceDeps()`, `@pyreon/compiler@0.18.0` shipped to npm with `optionalDependencies: { "@pyreon/compiler-darwin-arm64": "workspace:^", … }` — the literal pnpm/bun workspace protocol. Effect: `npm i @pyreon/compiler@0.18.0` **hard-fails for every consumer** with `EUNSUPPORTEDPROTOCOL: Unsupported URL Type "workspace:"` — npm rejects the manifest while parsing, before it can skip an _optional_ dependency. The 0.18.0 compiler is therefore uninstallable standalone (and the 7 native binaries it points at can never resolve).

  Fix is the missing 4th field plus a defense-in-depth guard: after building the resolved manifest, `publish.ts` scans every dependency field and **hard-fails before write/publish** if any `workspace:` range remains — so a future package.json field added without updating the resolve list can't silently ship another broken release (exactly how `optionalDependencies` slipped through). A broken publish is immutable and unrecoverable, so the gate must be pre-publish.

  Bisect-proven against the real `packages/core/compiler/package.json`: before → 7× `workspace:^`; after → 7× `^0.18.0`; guard passes on resolved input and exits 1 on any residual `workspace:`. npm 0.18.0 is immutable and stays broken (deprecate it); this makes the next release's `@pyreon/compiler` installable.

- [#645](https://github.com/pyreon/pyreon/pull/645) [`0408e47`](https://github.com/pyreon/pyreon/commit/0408e475e63770996eff17bfb6ac318e89c45df4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Release pipeline: fix `release-native.yml` OIDC trusted publishing — remove the `.npmrc` that defeated it.

  The Publish job correctly had no `NODE_AUTH_TOKEN`, but `actions/setup-node` was still invoked with `registry-url: 'https://registry.npmjs.org'`. setup-node writes a project `.npmrc` containing `//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}` **whenever `registry-url` is set** — with no token in the env that line resolves to an empty `_authToken=`. npm then sees explicit (empty) registry auth and **skips the OIDC trusted-publishing exchange entirely**, so `npm publish` returns `404` on the PUT even when the package's trusted publisher is configured correctly. Provenance still signed (it uses the GitHub OIDC id-token directly, independent of npm registry auth), which masked the root cause and made the v0.18.0 native-publish failures look like an npmjs.com config problem.

  Fix:

  - Remove `registry-url:` from the `setup-node` step (no `.npmrc` auth line is written → npm performs the token-free OIDC exchange).
  - Add an "Ensure npm supports OIDC trusted publishing" step (`npm install -g npm@latest`) — npm's native token-free trusted publishing landed in 11.5.1; Node 24's bundled npm can be older (24.x shipped 11.3.x).
  - Belt-and-suspenders `rm -f` of any stray `.npmrc` (repo checkout / cached home) immediately before `npm publish`.
  - Tightened the in-workflow comment to the exact trusted-publisher identity (`pyreon/pyreon` / `release-native.yml` / no environment) and the precise meaning of a 404.

  YAML validated (parses; `setup-node.with` is now `{ node-version: 24 }` only; publish steps in correct order). This unblocks token-free native-binary publishing for the next release tag — no manual bootstrap needed once it lands (assuming the per-package trusted-publisher records match the identity above).

- [#633](https://github.com/pyreon/pyreon/pull/633) [`7e0fe1a`](https://github.com/pyreon/pyreon/commit/7e0fe1a4f7cbb68f7647d85bef843de90d04d506) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(compiler): `query-options-as-function` detector — makes the @pyreon/query best-practice proactive in MCP `validate`

  `[#632](https://github.com/pyreon/pyreon/issues/632)` shipped `pyreon/query-options-as-function` as an opt-in `@pyreon/lint`
  rule — **reactive**: an AI agent only sees it after running
  `pyreon doctor` / `pyreon-lint`. This adds the same check as a
  `detectPyreonPatterns` code in `@pyreon/compiler`, so the MCP `validate`
  tool flags it **proactively** — an agent calling `validate({ code })`
  while writing sees the fix (`useQuery(() => (...))`) before the code is
  ever committed. Closes the genuine functional gap (proactive AI-fix),
  not just more coverage.

  - New `PyreonDiagnosticCode: 'query-options-as-function'`. Fires on an
    object-literal first arg to `useQuery` / `useInfiniteQuery` /
    `useQueries` / `useSuspenseQuery`. `useMutation` excluded by design
    (imperative — plain object is correct); identifier/call args stay
    silent (statically unprovable). `fixable: false` (the documented
    invariant — no `migrate_pyreon` tool yet).
  - Wired into the AST dispatch + the `hasPyreonPatterns` regex pre-filter.
  - Shares one `[detector: query-options-as-function]` tag in
    `.claude/rules/anti-patterns.md` with the lint rule (the
    `detector-tag-consistency` drift guard enforces the loop; [#632](https://github.com/pyreon/pyreon/issues/632)'s
    entry used the wrong tag form — corrected here).

  Bisect-verified (neuter → 2 FIRES specs fail, restore → 73/73 pass).
  `@pyreon/compiler` suite + the MCP `validate` zero-false-positive guard
  green. Docs: CLAUDE.md detector list 14 → 15.

- [#618](https://github.com/pyreon/pyreon/pull/618) [`c5b2ea2`](https://github.com/pyreon/pyreon/commit/c5b2ea2fe0df3f52b2af21e0d79b1e391ca9fad5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add the `props-destructured-body` static detector to `detectPyreonPatterns`
  — the body-scope companion to `props-destructured`. It flags
  `const { x } = props` written synchronously in a component body, the
  reactivity footgun the parameter-destructure detector explicitly did
  NOT cover (previously a documented "lightweight AST can't do this"
  cliff; the TS-compiler-API detector resolves it with scope tracking).

  Precision (zero-false-positive priority): only PascalCase JSX-rendering
  components; only `= props` where `props` is the bare first-parameter
  identifier (unwrapped through `as` / `satisfies` / `!` / parens); the
  walk does NOT descend into nested functions (a destructure inside a
  handler / `effect` / returned accessor re-reads `props` per invocation
  and is reactivity-correct). Surfaces through the MCP `validate` tool and
  `pyreon doctor` alongside the other Pyreon detectors.

- [#616](https://github.com/pyreon/pyreon/pull/616) [`6581f07`](https://github.com/pyreon/pyreon/commit/6581f073293a72360fe9391990d08316e0dc5b4b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Reactivity Lens — Phase 3: Rust-backend sidecar parity. The native
  napi-rs binary now emits the `reactivityLens` span sidecar from the
  same 6 codegen-decision sites as the JS path, gated by the same opt-in
  `TransformOptions.reactivityLens` flag. Purely additive — emitted code
  is byte-identical with the option on or off, on both backends — so the
  ~80% of users on the native path get the editor lens too. JS↔Rust
  span-set parity + the additive guarantee are gated by the new
  `compareLens` cross-backend equivalence block (bisect-verified).

## 0.18.0

### Minor Changes

- [#587](https://github.com/pyreon/pyreon/pull/587) [`f35e69b`](https://github.com/pyreon/pyreon/commit/f35e69b2ab53474ecf0ffb792866bc27215b68c3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Defer>` now supports inline children — the compiler extracts the subtree into a proper chunk automatically.

  **Before (v1, PR [#585](https://github.com/pyreon/pyreon/issues/585))** — explicit `chunk` prop required:

  ```tsx
  <Defer chunk={() => import("./ConfirmModal")} when={open}>
    {(Modal) => <Modal onClose={() => setOpen(false)} />}
  </Defer>
  ```

  **After (this PR)** — inline children, compiler does the chunking:

  ```tsx
  import { Modal } from "./ConfirmModal";

  <Defer when={open}>
    <Modal />
  </Defer>;
  ```

  The compiler (`@pyreon/compiler`'s new `transformDeferInline`) detects `<Defer>` JSX with no `chunk` prop and a single bare component child, looks up that component's import, rewrites the JSX to use an explicit `chunk={() => import('./path')}` prop, and removes the static import so Rolldown actually emits a separate chunk.

  ## v1 scope (this PR)

  - Single Defer JSX element per file (multiple Defers in one file each get their own transform pass — works fine)
  - Child must be a single self-closing component element with **no props** (`<Modal />` ✓; `<Modal title="hi" />` falls back to the explicit form)
  - Named or default imports only — renamed imports (`{ Modal as M }`) and namespace imports (`* as M`) bail with a warning, user falls back to explicit form
  - The imported binding must NOT be used outside the Defer subtree (Rolldown would static-bundle the module and the dynamic import becomes a no-op; the compiler warns and bails when this is detected)
  - JS-fallback compiler path only — Rust compiler parity is a follow-up

  When the transform bails on any of the above, the user sees a soft warning at compile time. The `<Defer>` element is left unchanged; runtime then errors at chunk-load time because `chunk` is missing, prompting the user to use the explicit form.

  ## What's NOT in this PR

  - Closure capture (passing `count` signals or local state to the inline child) — requires prop-extraction analysis
  - Rust compiler implementation — JS fallback only
  - HMR for the synthetic chunk module — relies on Rolldown's standard dynamic-import HMR
  - TypeScript type-narrowing for the inline form — `<Defer>`'s props still type-check the explicit form; inline form passes through without type-narrowing the chunk relationship

  ## How it composes

  The transform runs in `@pyreon/vite-plugin`'s `transform()` hook BEFORE `transformJSX()`. By the time the JSX→runtime transform sees the source, the inline form has already been rewritten into the explicit chunk-prop form. No special-casing in the runtime, no new VNode shape, no new bundler hook — just AST rewriting before the existing pipeline.

  Verified via 13 unit tests (`@pyreon/compiler/src/tests/defer-inline.test.ts`) covering:

  - Basic rewrites: named/default imports, on="visible" / when={signal} triggers, props preservation
  - Bail-outs: chunk already provided, binding used elsewhere, child not imported, child has props, multiple children, syntax errors
  - Multi-Defer files: two independent Defers in one file get rewritten independently

  1004 `@pyreon/compiler` tests pass (13 new + 991 existing — no regressions).

  Depends on PR [#585](https://github.com/pyreon/pyreon/issues/585) (the runtime `<Defer>` primitive). Won't be useful until that merges.

## 0.17.0

### Patch Changes

- [#584](https://github.com/pyreon/pyreon/pull/584) [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Preserve reactive props through component-JSX spread + framework prop pipelines.

  **Bug class.** Pyreon's reactive-prop contract is that `<Comp prop={signal()}>` compiles to `h(Comp, { prop: _rp(() => signal()) })` and `mount.ts:makeReactiveProps` converts `_rp`-branded thunks into property GETTERS on the props object. Any prop-pipeline step that VALUE-COPIES `props[key]` (plain assignment, spread, or `Object.assign`) fires the getter at HOC setup time — outside any tracking scope — and stores the resolved value as a static data property. Every downstream JSX accessor reading `props.x` then sees the captured-once value, never re-subscribing to the underlying signal.

  **Two layers of fix:**

  1. **Compiler-level (closes the bug class for all consumers, including user code).** Both the JS compiler (`src/jsx.ts`) and the Rust native binary (`native/src/lib.rs`) now wrap component-JSX spread arguments with the new `_wrapSpread(...)` helper from `@pyreon/core`. `<Comp {...source}>` compiles to `jsx(Comp, { ..._wrapSpread(source) })` — `_wrapSpread` replaces getter descriptors with `_rp`-branded thunks, so the JS-level spread carries function values (no getters fire), and `makeReactiveProps` converts them back to getters on the consumer side. Fast path: when `source` has no getter descriptors, `_wrapSpread` returns the source unchanged — zero overhead for the 99% of spread sources that don't carry reactive props. Lowercase-tag (DOM) spreads route through the template path's `_applyProps` (already reactive) and skip the wrap.

  2. **Framework-level (closes every observed leak site in shipped packages):**
     - `@pyreon/rocketstyle` — `removeUndefinedProps` + `mergeDescriptors` (new helper in `utils/attrs.ts`) replace 3 spread sites in `rocketstyleAttrsHoc.ts` and `rocketstyle.ts`'s `mergeProps`. `finalProps.ref` / `$rocketstyle` / `$rocketstate` writes use `Object.defineProperty` (handles getter-only descriptors).
     - `@pyreon/styler` — `buildProps` in `forward.ts` copies descriptors via `copyDescriptor` instead of value-reads.
     - `@pyreon/ui-core` — `omit` / `pick` in `utils.ts` copy descriptors.
     - `@pyreon/elements` — Wrapper's `buildStyledProps` builds props via descriptor-preserving copy and forwards `ref` / `as` / extras via `Object.defineProperty`.
     - `@pyreon/core` — `jsx-runtime.ts`'s `jsx()` has a slow path that preserves descriptors when `props` arrives with getters (for direct `h()` callers).
     - `@pyreon/runtime-dom` — `applyProps` in `props.ts` detects getter descriptors and wraps the write in `renderEffect`.

  **Bisect-verified at TWO layers:**

  - **Unit / browser**: `packages/ui-system/rocketstyle/src/__tests__/reactive-props-preservation.test.ts` (9 specs) + the new `rocketstyle.browser.test.tsx` spec covering the full pipeline. Reverting any of the 4 leak-site fixes individually fails the relevant spec with `expected 'count: 1' to be 'count: 0'`.
  - **Real-Chromium e2e**: `e2e/ui-showcase-regression.spec.ts:793 — signal-driven prop on Button updates the DOM on flip` exercises a rocketstyle Button with a `title={\`count: \${count()}\`}` prop fed by a signal. Reverting the compiler-level fix (`packages/core/compiler/src/jsx.ts`+`native/src/lib.rs`+ rebuilding the Rust binary) → spec fails with`unexpected value "count: 0"` after click — proving the spread reactivity contract holds end-to-end through the entire prop pipeline (rocketstyle attrs HOC → styler buildProps → Element Wrapper → runtime-dom applyProps).

  **No public API breakage.** `_wrapSpread` is an internal compiler-emitted helper; users never call it directly. Framework-internal helpers (`mergeDescriptors` in rocketstyle, `copyDescriptor` in styler, etc.) are not exported. The only public surface change is that getter-shaped reactive props now survive every framework boundary — i.e. the reactive-prop contract finally works as documented.

## 0.16.0

## 0.14.0

### Minor Changes

- [#274](https://github.com/pyreon/pyreon/pull/274) [`aa8e61b`](https://github.com/pyreon/pyreon/commit/aa8e61b873b7d42c60a613f57841a75293080c8a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Rewrite the reactive JSX transform in Rust (napi-rs) for 3.7-8.9x faster compilation. The native binary auto-loads when available, falling back to the JS implementation transparently. All 527 tests pass across both backends.

- [#311](https://github.com/pyreon/pyreon/pull/311) [`602446b`](https://github.com/pyreon/pyreon/commit/602446bb49e6ea95fe9d2dbc7774bbf9a66da80d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Test-environment audit (T2.5.7) — scans every `*.test.ts(x)` under `packages/` for mock-vnode patterns (the PR [#197](https://github.com/pyreon/pyreon/issues/197) bug class: tests that construct `{ type, props, children }` literals or a custom `vnode()` helper instead of going through the real `h()` from `@pyreon/core`). Classifies each file as HIGH / MEDIUM / LOW based on the balance of mock literals, helper definitions, helper call-sites, real `h()` calls, and the `@pyreon/core` import.

  Scanner lives in `@pyreon/compiler` (`auditTestEnvironment`, `formatTestAudit`) so both `@pyreon/mcp` and `@pyreon/cli` can use it without pulling in each other.

  - **MCP**: new `audit_test_environment` tool. Options `minRisk` (default `medium`) and `limit` (default 20). Scans 400+ test files in ~50ms.
  - **CLI**: `pyreon doctor --audit-tests` appends the audit output. `--audit-min-risk high|medium|low` to filter. Honors `--json` for machine-readable output.

- [#307](https://github.com/pyreon/pyreon/pull/307) [`4638c27`](https://github.com/pyreon/pyreon/commit/4638c2761ec34b1102a36c4675cfcfa805c2168c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Pyreon-specific anti-pattern detector for the MCP `validate` tool (T2.5.2). `@pyreon/compiler` exports a new `detectPyreonPatterns(code, filename)` AST walker catching 9 "using Pyreon wrong" mistakes — `for-missing-by` / `for-with-key` on `<For>`, `props-destructured` at component signatures, `process-dev-gate` (dead code in Vite browser bundles), `empty-theme` no-op chains, `raw-add-event-listener` / `raw-remove-event-listener`, `date-math-random-id` ID schemes, and `on-click-undefined`. `@pyreon/mcp`'s `validate` tool now merges these diagnostics with the existing React detector output, sorted by source line. Every detected pattern is grounded in `.claude/rules/anti-patterns.md` — each bullet there carries a `[detector: <code>]` tag so contributors see what runs statically vs what remains doc-only.

- [#296](https://github.com/pyreon/pyreon/pull/296) [`83aa9ab`](https://github.com/pyreon/pyreon/commit/83aa9abbc52d423dfc9d45a3b0a4e048b161186d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Auto-call signals and computeds in JSX — plain JS syntax for reactivity. `const count = signal(0); <div>{count}</div>` compiles to `<div>{() => count()}</div>`. Scope-aware (shadowed variables not auto-called), cross-module (Vite plugin pre-scans exports), import-type-safe, computed-aware. 527 tests.

## 0.13.0

## 0.12.15

## 0.12.14

## 0.12.13

## 0.12.12

## 0.12.11

## 0.7.2

## 0.7.1

## 0.7.0

## 0.6.0

## 0.5.7

## 0.5.6

## 0.5.4

## 0.5.3

## 0.5.2

## 0.5.1

### Patch Changes

- Unify project scanner into @pyreon/compiler, fix JSX type declarations for published packages, update dependencies, and resolve build compatibility with rolldown 1.15.0.

## 0.5.0

### Minor Changes

- ### New packages

  - `@pyreon/cli` — project doctor command that detects React patterns (className, htmlFor, React imports) and auto-fixes them for Pyreon
  - `@pyreon/mcp` — Model Context Protocol server providing AI tools with project context, API reference, and documentation

  ### Features

  - **JSX type narrowing** — added `JSX.Element`, `JSX.ElementType`, and `JSX.ElementChildrenAttribute` for full TypeScript JSX compatibility
  - **Callback refs** — `ref` prop now accepts `(el: Element) => void` in addition to `{ current }` objects
  - **React pattern interceptor** (`@pyreon/compiler`) — AST-based detection and migration of React patterns to Pyreon equivalents
  - **Vite plugin context generation** — automatically generates `pyreon-context.json` and `llms.txt` during dev/build
  - **MCP server tools** — `get-context`, `lookup-api`, `diagnose-error`, `suggest-migration` for AI-assisted development

## 0.4.0

## 0.3.1

## 0.3.0

### Minor Changes

- ### Performance

  - **2x faster signal creation** — removed `Object.defineProperty` that forced V8 dictionary mode
  - **Event delegation** — `el.__ev_click` instead of `addEventListener` for compiled templates
  - **`_bindText`** — direct signal→TextNode subscription with zero effect overhead
  - **`_bindDirect`** — single-signal attribute bindings bypass effect tracking entirely
  - **`signal.direct()`** — flat-array updater registration for compiler-emitted DOM bindings
  - **Batch Set pooling** — snapshot-free subscriber notification eliminates array allocations
  - **`createSelector` snapshot-free** — O(1) selection without copying subscriber maps
  - **`renderEffect` fast path** — lighter than full `effect()` for DOM bindings
  - **SSR `renderToString` micro-optimizations** — sequential loops, `for...in`, `escapeHtml` fast path
  - **Hydration optimizations** — reduced overhead during island hydration
  - **Nested `_tpl` support** — compiler emits nested `cloneNode(true)` templates

  ### Features

  - **True React compatibility** — `useState`, `useEffect`, `useMemo` with re-render model matching React semantics
  - **True Preact compatibility** — hooks with re-render model matching Preact semantics
  - **True Vue compatibility** — `ref`, `reactive`, `watch`, `computed` with re-render model matching Vue semantics
  - **True SolidJS compatibility** — signals with re-render model matching Solid semantics, children helper fixes

  ### Benchmark Results (Chromium)

  Pyreon (compiled) is fastest framework on 6 of 7 tests:

  - Create 1,000 rows: 9ms (1.00x) vs Solid 10ms, Vue 11ms, React 33ms
  - Replace all rows: 10ms (1.00x) vs Solid 10ms, Vue 11ms, React 31ms
  - Partial update: 5ms (1.00x) vs Solid 6ms, Vue 7ms, React 6ms
  - Select row: 5ms (1.00x) — tied with all signal frameworks
  - Create 10,000 rows: 103ms (1.00x) vs Solid 122ms, Vue 136ms, React 540ms

## 0.2.1

### Patch Changes

- Release 0.2.1
  - feat(vite-plugin): add `compat` option for zero-change framework migration
  - fix: resolve `workspace:^` dependencies correctly during publish
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

## 0.2.0

### Minor Changes

- Release 0.2.0
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option for Vite 8
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

## 0.1.1
