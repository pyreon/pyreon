# @pyreon/kinetic

## 0.27.1

### Patch Changes

- [#1189](https://github.com/pyreon/pyreon/pull/1189) [`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: publish `@pyreon/sized-map` and force topological build order

  The 0.27.0 release silently failed: `bun run --filter='./packages/*/*' build`
  runs in parallel, and seven framework packages (`@pyreon/core/router`,
  `@pyreon/core/runtime-dom`, `@pyreon/tools/lint`, `@pyreon/ui-system/elements`,
  `@pyreon/ui-system/rocketstyle`, `@pyreon/ui-system/kinetic`, `@pyreon/zero/zero`)
  listed `@pyreon/sized-map` in `devDependencies` despite IMPORTING it from `src/`.
  Bun's filter respects `dependencies` for topological ordering but not
  `devDependencies`, so a consumer could start building before sized-map's `lib/`
  existed, crashing with `[UNLOADABLE_DEPENDENCY] Could not load .../sized-map/lib/index.js`.

  This also closes a type-leak: `@pyreon/router/lib/types/index.d.ts:3` carries
  `import { SizedMap } from '@pyreon/sized-map'`, which would degrade to `any`
  for npm consumers if sized-map stayed private.

  Changes:

  - `@pyreon/sized-map` is now publishable to npm (was `private: true`). The
    package is a small, focused, bounded-Map primitive (FIFO or LRU-on-read) —
    safe to use directly even though Pyreon's main consumers are framework-internal.
  - All 7 consumers move `@pyreon/sized-map` from `devDependencies` →
    `dependencies`. This forces `bun run --filter` to respect topological order
    and makes the transitive dep explicit for npm consumers.
  - Added to `.changeset/config.json` `fixed[0]` group so it ships with every
    other framework package at the synced version.

  First-publish is bootstrapped manually following the OIDC trusted-publisher
  procedure documented in CLAUDE.md.

- Updated dependencies [[`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781)]:
  - @pyreon/sized-map@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@1.0.0
  - @pyreon/reactivity@1.0.0
  - @pyreon/runtime-dom@1.0.0

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

### Patch Changes

- [#1111](https://github.com/pyreon/pyreon/pull/1111) [`421fc21`](https://github.com/pyreon/pyreon/commit/421fc211ca6da19a332ed7dc5b51545181ee58da) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(ui-system): batch() multi-signal writes + LRU-bound kinetic splitCache

  Four hot multi-signal write sites previously notified subscribers twice per event. `batch()` collapses notify cycles to one per event:

  - `@pyreon/rocketstyle` `createLocalProvider.ts` `onMouseLeave` — `hover` + `pressed` (fires on every styled-hover-state mouseleave).
  - `@pyreon/rocketstyle` `usePseudoState.ts` `onMouseLeave` — `hover` + `pressed` (fires on every `usePseudoState` consumer).
  - `@pyreon/elements` `Overlay/useOverlay.tsx` `hideContent` — `active` + `isContentLoaded` (fires on every overlay dismiss path).
  - `@pyreon/elements` `Overlay/useOverlay.tsx` position recompute — `innerAlignX` + `innerAlignY` (fires on every scroll-driven recompute).

  Doubling subscriber work per event compounds visibly on UIs with many overlay or styled-hover-state consumers; the change is invisible to single-signal consumers.

  `@pyreon/kinetic` `utils.ts` `splitCache` was an unbounded `Map<string, string[]>` keyed by class-name strings — Class C leak per the anti-pattern catalog. Real-app inputs are stable per kinetic definition, but HMR cycles, dynamic theme generation, and A/B-tested variants can grow it without limit. Bounded at 128 entries with insertion-order eviction (matches `@pyreon/styler` `classCache`).

- Updated dependencies [[`fce4e86`](https://github.com/pyreon/pyreon/commit/fce4e868611a3f5e006f20a031d43435441901e5), [`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74), [`b1e3087`](https://github.com/pyreon/pyreon/commit/b1e30879335bbeb29eb8c56520828b841f89db08), [`8333f05`](https://github.com/pyreon/pyreon/commit/8333f05e3a2b3d8b31cd03c3d835a4234a6e689c)]:
  - @pyreon/runtime-dom@1.0.0
  - @pyreon/reactivity@1.0.0
  - @pyreon/core@1.0.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1
  - @pyreon/core@0.25.1
  - @pyreon/runtime-dom@0.25.1

## 0.25.0

### Patch Changes

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0
  - @pyreon/core@0.25.0
  - @pyreon/runtime-dom@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/reactivity@0.24.6
  - @pyreon/runtime-dom@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/reactivity@0.24.5
  - @pyreon/runtime-dom@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/reactivity@0.24.4
  - @pyreon/runtime-dom@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.3
  - @pyreon/reactivity@0.24.3
  - @pyreon/runtime-dom@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/reactivity@0.24.2
  - @pyreon/runtime-dom@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.1
  - @pyreon/reactivity@0.24.1
  - @pyreon/runtime-dom@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`c41aa1a`](https://github.com/pyreon/pyreon/commit/c41aa1ae90efe00d82c97f623a02ed17acb2427c), [`bc65b82`](https://github.com/pyreon/pyreon/commit/bc65b825505016e4433b50cd1276c9982ef10b8a), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd), [`84cd28f`](https://github.com/pyreon/pyreon/commit/84cd28feba1899d70696e9a292bb078601558e8f), [`49cc686`](https://github.com/pyreon/pyreon/commit/49cc6869c42e3d3a7ef9e6568f7aade0be23edc0), [`73a6949`](https://github.com/pyreon/pyreon/commit/73a694940a0121508dee84b8a88812753e26fb10)]:
  - @pyreon/core@0.24.0
  - @pyreon/runtime-dom@0.24.0
  - @pyreon/reactivity@0.24.0

## 0.23.0

### Patch Changes

- [#736](https://github.com/pyreon/pyreon/pull/736) [`5c9e45b`](https://github.com/pyreon/pyreon/commit/5c9e45b4797bfc3043d6be9e0d5c022e49639f54) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic, elements, lint): audit + defense-in-depth for the iterate-children bug class

  PR [#731](https://github.com/pyreon/pyreon/issues/731) fixed the kinetic-mode `StaggerRenderer` + `TransitionItem` against
  the Pyreon-compiler-prop-inlining + iterate-children bug. PR [#732](https://github.com/pyreon/pyreon/issues/732) added the
  compiler-side carve-out for stable references at the JSX call site. This PR
  closes the **3 parallel library sites** the audit found and ships a lint
  rule (`pyreon/no-iterate-children-without-resolve`) to prevent recurrence
  in any future library code.

  ## Background — the bug class

  The Pyreon vite-plugin's prop-inlining pass rewrites `<Comp>{children}</Comp>`
  (where `children` is a local `const` derived from a getter — typically
  `const children = childHolder.children` after `splitProps`) as
  `Comp({ ..., children: () => h.children })`. Receiving components see
  `props.children` as a FUNCTION instead of the expected `VNode | VNode[]`.

  DOM-consuming code routes through `mountChild` which handles function
  children correctly via `mountReactive` — invisible bug for the common
  forwarding pattern. Libraries that iterate children at the VNode level
  or `cloneVNode` them directly are silently broken: the function spread
  produces `{type: undefined}` and the DOM renders literal `<undefined>`
  tags. Real-app reproducer: `examples/bokisch.com` Intro section.

  ## Library fixes (3 sites — parallel to PR [#731](https://github.com/pyreon/pyreon/issues/731)'s renderers fix)

  PR [#731](https://github.com/pyreon/pyreon/issues/731) fixed the kinetic-mode renderers under `packages/ui-system/kinetic/src/kinetic/`.
  It missed the parallel TOP-LEVEL components in the same package + a
  subtle Iterator shape.

  - **`@pyreon/kinetic` top-level `Stagger.tsx`** — `(Array.isArray(own.children) ? own.children : [own.children]).filter(isVNode)` collapsed to `[]` when `own.children` is a function. Fixed by calling `resolveChildren(own.children)` at body entry (same helper PR [#731](https://github.com/pyreon/pyreon/issues/731) shipped in `kinetic/src/utils.ts`).
  - **`@pyreon/kinetic` top-level `Transition.tsx`** — 3 × `cloneVNode(props.children, …)` + 1 × `(props.children.props ?? {})` reads. The cloneVNode-on-function shape produces `<undefined>` tags; the `.props` read returns undefined and silently drops the merge-ref. Fixed by resolving once at body entry (`const child = resolveChildren(props.children)`).
  - **`@pyreon/elements` `Iterator`** — falls through to `renderChild(function)` which calls `render(function, props)` and interprets the function as a component. Doesn't crash but loses per-item metadata (`first`/`last`/`position`/`index`/`odd`/`even`). Fixed by unwrapping at body entry with the inline `typeof rawChildren === 'function' ? rawChildren() : rawChildren` ternary.

  ## Lint rule — `pyreon/no-iterate-children-without-resolve`

  New error-level rule under the `reactivity` category. Detects:

  1. **`cloneVNode(EXPR, …)`** where EXPR ends with `.children`.
  2. **`(Array.isArray(EXPR) ? EXPR : [EXPR]).METHOD(…)`** where METHOD is one of `filter` / `map` / `forEach` / `reduce` / `every` / `some` / `find` / `findIndex` / `flatMap`.
  3. **`EXPR.props`** reads where EXPR ends with `.children` (the merge-ref pattern from `Transition.tsx`).

  **Acceptable mitigations** (per-function scope, inherits through nested arrow functions):

  - `resolveChildren(…)` call.
  - `typeof EXPR === 'function' ? EXPR() : EXPR` ternary.
  - `typeof EXPR === 'function'` guard anywhere.
  - `const NAME = <mitigation expression>` — marks NAME as safe-aliased.

  **Out of scope** (deliberate precision trade-offs):

  - Pass-through `...(Array.isArray(EXPR) ? EXPR : [EXPR])` SpreadElement → mountChild handles function children. Naturally not flagged by the call-site detection.
  - `if (Array.isArray(X)) return X.map(…)` IfStatement-guarded iteration. Framework primitives (`Dynamic`, `Show`, `Switch`) use this with direct h() rest args that never reach the auto-wrap; out of scope.
  - Variable-bound iteration patterns (`const xs = COND; xs.METHOD(…)`). Out of scope — detection at the inline `.METHOD(…)` call site.

  **Bisect-verified at two layers**: 19 unit specs (10 FIRES + 9 CONTROL + real-world shapes), reverting the rule fails all 10 FIRES; full repo sweep against `packages/**` after library fixes → 0 hits (zero false positives, zero remaining real bugs).

  ## Surfaces updated

  - `packages/ui-system/kinetic/src/Stagger.tsx` — top-level Stagger fix
  - `packages/ui-system/kinetic/src/Transition.tsx` — top-level Transition fix
  - `packages/ui-system/elements/src/helpers/Iterator/component.tsx` — Iterator fix
  - `packages/ui-system/kinetic/src/__tests__/top-level-transition-stagger-function-children.test.tsx` — 4 regression specs (2 FIRES per component + 2 CONTROL)
  - `packages/ui-system/elements/src/__tests__/iterator-function-children.test.tsx` — 2 regression specs (1 FIRES + 1 CONTROL)
  - `packages/tools/lint/src/rules/reactivity/no-iterate-children-without-resolve.ts` — new rule
  - `packages/tools/lint/src/tests/no-iterate-children-without-resolve.test.ts` — 19 unit specs
  - `packages/tools/lint/src/rules/index.ts` — register rule + bump reactivity count to 14
  - `packages/tools/lint/src/tests/runner.test.ts` — update rule count assertions (80 → 81, reactivity 13 → 14)
  - `CLAUDE.md`, `packages/tools/lint/README.md`, `packages/tools/lint/src/manifest.ts`, `docs/docs/lint.md` — rule count claims updated (locked by `check-doc-claims`)
  - `.claude/rules/anti-patterns.md` — new bug-class entry under Architecture Mistakes

  ## Validation

  - All 3 library packages pass tests (kinetic 220, elements 463 → +new regression specs)
  - All 650 lint tests pass (19 new specs)
  - `check-doc-claims` clean (count claims locked)
  - Real-app sweep: 0 hits across 1041 source files (rule is precision-tuned to avoid false positives on framework primitives, pass-through patterns, and unrelated `Array.isArray` shapes in non-VNode domains)

- [#731](https://github.com/pyreon/pyreon/pull/731) [`a855c4c`](https://github.com/pyreon/pyreon/commit/a855c4c90308e2bbcdaa8203ce6074fee7649051) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic): Stagger + Group children render correctly when the Pyreon compiler wraps the JSX child in a deferred accessor

  **Reported symptom**: `kinetic('div').stagger()` (and `.group()`) with multiple component-VNode children rendered `<undefined>` HTML tags in place of the real children post-hydration. SSR HTML was correct (`<h1>Hello</h1>` + tagline + icons with `--stagger-index` styles inlined) but client hydration replaced the entire subtree with literal `<undefined></undefined>` elements + `<!--pyreon-->` markers. Reproduced on `examples/bokisch.com`'s Intro section: `kinetic('div').preset(blurInUp).stagger({ interval: 80 })` + `show={() => true}` + `appear` + three rocketstyle-wrapped children → SSG'd HTML carried the children, post-hydrate every child was `<undefined>` (puppeteer-verified, `h1Count: 0`, body text missing "Hello", "I build…", icon labels).

  **Root cause** (compiler + library cooperation):

  1. The Pyreon vite-plugin compiler's prop-inlining pass rewrites `<Comp>{children}</Comp>` where `children` is a local `const` derived from a getter-shaped binding (`const children = childHolder.children` after `splitProps`) as `Comp({ ..., children: () => childHolder.children })`. The receiving component therefore sees `props.children` as a FUNCTION, not the expected `VNode | VNode[]`. DOM-consuming code routes through `mountChild` which handles function children correctly (as reactive accessors via `mountReactive`), so this wrap is invisible to most consumers.

  2. **StaggerRenderer** iterated children directly at the VNode level (to build per-child `TransitionItem` wrappers): `(Array.isArray(children) ? children : [children]).filter(isVNode)`. When `children` was a function, this produced `[function].filter(isVNode) === []` → the rendered `<div>` had ZERO children → SSR-rendered content was replaced by an empty `<div>` during client mount.

  3. **TransitionItem** then ALSO hit the wrap one level down: StaggerRenderer's `<TransitionItem>{cloneVNode(child, {style})}</TransitionItem>` JSX child likewise compiles to `() => cloneVNode(child, {style})`. `TransitionItem`'s `cloneVNode(props.children, {ref})` spread a function (no own enumerable properties) → produced `{type: undefined, props: {ref}}` → `mountElement(undefined)` → `document.createElement(undefined)` → literal `<undefined>` HTML tag.

  **Fix**: new `resolveChildren` helper in `utils.ts` — unwraps a children value that may be a compiler-emitted accessor. Applied at both fix-sites:

  - `StaggerRenderer` calls `resolveChildren(children)` before the iteration. Group works around the same shape independently via its existing `typeof children === 'function'` normalize.
  - `TransitionItem` calls `resolveChildren(props.children)` once at body entry, then all downstream `cloneVNode` / `child?.props?.ref` / `child?.props?.style` reads use the resolved value.

  Eager unwrap is safe for kinetic because the renderers snapshot children at render time (animation state is per-item, built once); they do NOT observe children changes after initial render. No reactivity is lost.

  **Bisect-verified**: regression test at `packages/ui-system/kinetic/src/__tests__/stagger-component-children-hydration.test.tsx` covers both fix-sites independently. Reverting `resolveChildren` in `StaggerRenderer` fails the first spec (kinetic `<div>` empty); reverting in `TransitionItem` fails the second spec (`<undefined>` tag where `<h1>` should be); restoring both → all 3 specs pass + all 215 pre-existing kinetic tests pass. Real-app verified end-to-end against the bokisch.com Intro reproducer: pre-fix puppeteer showed `h1Count: 0` + 36 `<!--pyreon-->` markers; post-fix `h1Count: 1`, `<h1 class="..." style="--stagger-index: 0px; --stagger-interval: 80ms; transition-delay: 0ms;">Hello</h1>` byte-for-byte matches the SSG HTML.

  **Follow-up (out of scope for this fix)**: the COMPILER auto-wrapping `{children}` JSX child expressions in `() => x.children` for component (not DOM-element) parents is the deeper root cause. The current wrap is correct for DOM-element parents (where children are reactive text/child slots) but mismatched for component parents that snapshot children. A future compiler pass could refrain from wrapping when the parent is a function component — but that needs a careful audit because consumers like `mountChild` already handle the function form via `mountReactive`. The library-side fix in this PR is the defensive, immediate unblock.

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/runtime-dom@0.23.0
  - @pyreon/reactivity@0.23.0

## 0.22.0

### Minor Changes

- [#719](https://github.com/pyreon/pyreon/pull/719) [`50afe21`](https://github.com/pyreon/pyreon/commit/50afe21856cf348eba8d096e1be0eedd6879850b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic): `kinetic(tag).<mode>` API emits children in SSR for initially-hidden state — completes the PR [#717](https://github.com/pyreon/pyreon/issues/717) SSR coverage

  **Bug class continuation of [#717](https://github.com/pyreon/pyreon/issues/717).** PR [#717](https://github.com/pyreon/pyreon/issues/717) fixed the top-level `<Transition>` direct-import path, but the `kinetic(tag).<mode>` factory API — which the README promotes as the primary surface ("Four Modes" section) — has its own per-mode renderers that all carried the identical `<Show when={shouldMount} fallback={null}>` shape:

  - `TransitionRenderer` → `kinetic('div').preset(fadeUp)` (default `.transition` mode)
  - `TransitionItem` → `kinetic('ul').stagger()` per item (cascading-children mode) AND `kinetic('ul').group()` per item
  - `CollapseRenderer` → `kinetic('div').collapse()` (height-animation mode)

  Every consumer of these — including the documented cascading-Stagger pattern surfaced by a real resume-page report — still hit the SSR-children-dropped bug after [#717](https://github.com/pyreon/pyreon/issues/717) landed. The reporter's scroll-reveal `<Reveal>` helper (`useIntersection` + sticky-signal + `kinetic` mode) stayed blocked because the SSR fix didn't reach the renderers backing the kinetic-mode factory.

  **Fix.** Same `wasInitiallyShown` branch pattern from [#717](https://github.com/pyreon/pyreon/issues/717), applied to each of the three renderers:

  - Initially-visible → existing `<Show>`-gated mount unchanged (preserves runtime-unmount semantic for visible→hidden).
  - Initially-hidden → always renders children with hidden-state class/style inlined. Picker: `leaveTo` / `leaveToStyle` (explicit hidden-end state) wins; falls back to `enterFrom` / `enterStyle` (pre-enter state).

  **Critical refinement vs PR [#717](https://github.com/pyreon/pyreon/issues/717): the `enterStyle` fallback for the preset path.** Reading `@pyreon/kinetic-presets`' factories revealed every preset (fadeUp, blurInUp, slideLeft, …) populates `enterStyle` as the hidden state — but may not set `leaveToStyle`. Without the `enterStyle` fallback, preset users would SSR-render VISIBLE → flash-on-hydration. This PR's hidden-style picker is `leaveToStyle ?? enterStyle` (PR [#717](https://github.com/pyreon/pyreon/issues/717)'s Transition.tsx uses `leaveToStyle` alone and has the same gap; small follow-up commit needed on that branch OR a tiny follow-up PR after merge).

  **Companion fix: `applyEnter` symmetric to `applyLeave`.** Each renderer's `applyEnter` now clears residual `leave` / `leaveFrom` / `leaveTo` classes at start, so the SSR-baked hidden-state class (or one persisting after a leave-complete with `unmount: false`) doesn't compete with `enterTo`'s CSS rules during the enter cycle.

  **CollapseRenderer specifics.** Different shape from the other two: the outer wrapper always rendered (with `height: 0; overflow: hidden`), but the INNER `<div ref={contentRef}>{children}</div>` was Show-gated and produced an empty wrapper at SSR. Fix keeps the outer wrapper's visual hiding (height: 0 IS the layout-safe collapse — flex slots see a 0-height box, no slot-collapse) while always rendering inner content. Trade-off: initially-hidden Collapses no longer unmount the inner subtree after a later close. Initially-visible Collapses keep the unmount behavior.

  **Trade-off (consistent across all three renderers).** For initially-hidden kinetic-mode components, `unmount: true` no longer triggers a true DOM removal after a later leave animation completes — the element stays in DOM with the leave-to class applied. Initially-visible components keep the unmount semantic. Matches Framer Motion / react-transition-group conventions; the price of SSR correctness.

  **Coverage added.**

  - `kinetic-modes.ssr.test.tsx` — 9 SSR specs against real `renderToString` covering all three renderers with both initially-hidden + initially-visible cases per mode, plus the preset-path `enterStyle` fallback assertion.
  - `kinetic.browser.test.tsx` — 4 new real-Chromium specs: kinetic('section').transition initial-hidden mount + show-flip enter, kinetic('ul').stagger() all-items-mounted, kinetic('div').collapse() inner-content-present-with-height:0.
  - `Collapse.test.tsx` helper updated (`wireContentRef`) to walk both vnode shapes (direct div for the SSR-correct initially-hidden branch + Show-wrapped div for the unchanged initially-visible branch) — pure test-plumbing change, behavioral assertions unchanged.

  **Bisect-verified.** Reverting all three `wasInitiallyShown` branches simultaneously fails 6 of the 9 SSR specs across all three describe blocks (`expected '' to contain '<h2'`, `'<ul></ul>' to contain 'Heading'`, `'<div style="overflow: hidden; height:…' to contain 'accordion panel content for SEO'`) — proves each renderer fix is individually load-bearing. The 3 initially-visible no-regression specs keep passing in both states. Restored → 12 files / 206 vitest + 12 browser specs green.

  **Why this shipped undetected (root analysis).** Zero kinetic tests touched the runtime-server path; the README's documented patterns were never SSR-exercised end-to-end. PR [#717](https://github.com/pyreon/pyreon/issues/717) added that test layer for `<Transition>` only; this PR closes the gap across the rest of the public API.

  **Docs deliberately not touched in this PR** to avoid conflicts with [#717](https://github.com/pyreon/pyreon/issues/717)'s CLAUDE.md / README / anti-patterns.md edits. Once both merge, the CLAUDE.md kinetic-section bullet from [#717](https://github.com/pyreon/pyreon/issues/717) can be lightly extended to call out "applied to all four kinetic primitives — direct `<Transition>` + `kinetic(tag)` transition/stagger/group/collapse modes" as a follow-up.

### Patch Changes

- [#721](https://github.com/pyreon/pyreon/pull/721) [`7cef86b`](https://github.com/pyreon/pyreon/commit/7cef86b68100034b70e47376ef26f22e3079f66f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic): `<Transition>`'s SSR hidden-style picker falls back to `enterStyle` for the preset path

  **Gap completion for PR [#717](https://github.com/pyreon/pyreon/issues/717).** When PR [#717](https://github.com/pyreon/pyreon/issues/717) shipped the `wasInitiallyShown` branch on `Transition.tsx`, the hidden-style picker was `props.leaveToStyle` alone. Reading `@pyreon/kinetic-presets`' factories during PR [#719](https://github.com/pyreon/pyreon/issues/719) revealed every shipped preset (`fadeUp`, `blurInUp`, `slideLeft`, `fadeScale`, …) populates **`enterStyle` as the hidden state** but may not set `leaveToStyle` directly. Consequence for the direct-`<Transition>` import path on the preset shape:

  ```tsx
  <Transition
    show={() => false}
    enter="transition-all duration-300"
    enterStyle={{ opacity: 0, transform: "translateY(16px)" }} // ← preset hidden state
    enterToStyle={{ opacity: 1, transform: "translateY(0)" }}
  >
    ...
  </Transition>
  ```

  Pre-fix: `hiddenStyle = props.leaveToStyle` is `undefined` → SSR renders the element with **no inline hidden style** → the element appears VISIBLE in the prerendered HTML → flash-on-hydration (visible → JS applies enterStyle → opacity:0 → enter animation → visible).

  PR [#719](https://github.com/pyreon/pyreon/issues/719) already fixed this for the `kinetic(tag).<mode>` factory paths (TransitionRenderer / TransitionItem / CollapseRenderer). This commit aligns the direct `<Transition>` import path to match.

  **The fix.** One-line picker change in `Transition.tsx`:

  ```diff
  -  const hiddenStyle = props.leaveToStyle
  +  const hiddenStyle = props.leaveToStyle ?? props.enterStyle
  ```

  Mirrors the existing `hiddenClass = props.leaveTo ?? props.enterFrom` class picker — both halves now follow the same "prefer leave-end state, fall back to pre-enter state" convention.

  **Coverage.** New SSR spec `falls back to enterStyle as hidden style when leaveToStyle undefined (preset path)` added to `Transition.ssr.test.tsx`. **Bisect-verified**: reverting the `?? props.enterStyle` fallback fails ONLY this spec with `expected '<section>preset-shaped hidden state</…' to contain 'opacity: 0'` (element renders but with no hidden style — exact flash-on-hydration bug shape); the 7 existing [#717](https://github.com/pyreon/pyreon/issues/717) specs keep passing. Restored → 8/8 passing (full kinetic suite: 13 files / 214 tests + 14 browser specs + typecheck clean).

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/runtime-dom@0.22.0

## 0.21.0

### Minor Changes

- [#717](https://github.com/pyreon/pyreon/pull/717) [`89785b4`](https://github.com/pyreon/pyreon/commit/89785b4e8c1ac72e2a1ac2ea01e399b849bcf86e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic): `<Transition show={() => false}>` now emits children in SSR (was: dropped from prerendered HTML)

  **Bug.** `<Transition>` rendered `<Show when={shouldMount} fallback={null}>`; with the documented `unmount: true` default, an initially-hidden Transition (`show: () => false`) rendered `null` on the server. Any SSG site using kinetic for scroll-triggered reveal — the documented `useIntersection` + sticky-signal pattern, where `show` is false at SSR because IntersectionObserver can't fire until client hydration — shipped with the wrapped content **structurally absent** from the prerendered HTML. Bad for SEO, social scrapers, accessibility tools, and no-JS users.

  **Why it shipped undetected.** Zero existing tests exercised `show: () => false` initial state, and zero kinetic tests touched the runtime-server path. Both layers needed — real `renderToString` + a hidden initial state — to surface the bug.

  **Fix.** `Transition` now branches at setup on `props.show()`:

  - **Initially-visible** Transitions keep the original `<Show>`-gated mount unchanged, preserving the runtime-unmount semantic for the visible→hidden transition (modals closing, dropdowns collapsing, etc.).
  - **Initially-hidden** Transitions always render children with the hidden-state class/style inlined — `leaveTo` if defined (explicit hidden-end state), else `enterFrom` (pre-enter state, covers the scroll-reveal pattern that only configures the enter side). The existing `watch(stage)` effect drives the enter animation when `show` flips true on the **same** DOM element.

  This matches ecosystem norm — Framer Motion, react-transition-group, react-spring, AutoAnimate all render children in SSR regardless of animation state. "Content is structural, animation is visual."

  **Companion fix in `applyEnter`.** Made symmetric to `applyLeave` — now removes residual `leave`/`leaveFrom`/`leaveTo` classes at start. Without this, the SSR-baked hidden-state class (or a class persisting after a leave-complete with `unmount: false`) would compete with `enterTo`'s CSS rules during the next enter cycle. This was a latent issue masked by `unmount: true` defaulting to "destroy element after leave-complete" — surfaced by the SSR fix because the element now stays in DOM.

  **Behaviour change to document.** For initially-hidden Transitions, `unmount: true` no longer triggers a true DOM removal after a later leave animation completes — the element stays in DOM with the leave-to class applied. Initially-visible Transitions keep the unmount semantic. This matches Framer Motion / react-transition-group conventions and is the price of SSR correctness; the rare user who needs true unmount on a started-hidden element can drive mount/unmount themselves outside `<Transition>`.

  **Coverage added.** New `Transition.ssr.test.tsx` (7 specs against real `renderToString` from `@pyreon/runtime-server`) + 2 new browser specs in `kinetic.browser.test.tsx` for the client-side initially-hidden mount + flip-to-shown path. Bisect-verified: reverting the `wasInitiallyShown` branch fails 6 of the 7 SSR specs with `expected '' to contain '<section'` (the empty-output bug); the 7th (initially-visible no-regression check) keeps passing in both states. Restored → 12 files / 204 vitest + 10 browser specs green.

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/runtime-dom@0.21.0

## 0.20.0

### Patch Changes

- [#646](https://github.com/pyreon/pyreon/pull/646) [`9ae6f42`](https://github.com/pyreon/pyreon/commit/9ae6f42fa0990c28173fbc7898c073d696a7ffff) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(kinetic): preserve reactive HTML-attr getters through the kinetic prop pipeline

  `createKineticComponent` value-copied user props twice — a `for…in`
  `htmlProps[key] = props[key]` split followed by a
  `const { children, ...restHtml } = htmlProps` rest-destructure — and all
  four renderers re-spread the result via `h(config.tag, { ...htmlProps })`.

  Pyreon's reactive-prop contract is that the compiler emits
  `<KineticDiv class={sig()}>` as `_rp(() => sig())`, which `mount.ts`'s
  `makeReactiveProps` converts into a **getter** on the props object. Every
  value-copy hop above read that getter once, at component-setup time,
  outside any tracking scope — collapsing it to a static snapshot. The
  attribute then froze forever: a signal write produced no DOM update on
  any `kinetic(tag)`-wrapped component (transition / collapse / stagger /
  group). Same bug class as the swept `@pyreon/rocketstyle` /
  `@pyreon/styler` / `@pyreon/ui-core` prop-pipeline fixes; unfixed here
  since package inception, shipped today, browser package.

  Fix routes every hop through descriptor-preserving primitives from
  `@pyreon/core`:

  - `createKineticComponent`: `splitProps(props, [...KINETIC_KEYS])` for the
    kinetic/html split, then `splitProps(htmlProps, ['children'])` to carve
    out children — getters survive (`Object.getOwnPropertyDescriptor` +
    `Object.defineProperty`).
  - `StaggerRenderer` / `GroupRenderer`: pass `htmlProps` **by reference**
    to `h(config.tag, …)` instead of `{ ...htmlProps }`.
  - `CollapseRenderer` / `TransitionRenderer`: `mergeProps(htmlProps, {
ref, style })` — last-source-wins lets `ref`/the animation-controlled
    `style` override while every other HTML-attr getter stays live.

  runtime-dom's `applyProps` already detects a getter descriptor on an
  `h()`-created element and wraps the read in a `renderEffect`
  (`props.ts:192-195`), so the live getter now drives reactive DOM
  patching end-to-end.

  Bisect-verified at the real-Chromium browser layer
  (`src/__tests__/kinetic.browser.test.tsx`): reverting
  `createKineticComponent`'s `splitProps` split back to the `for…in`
  value-copy fails the new reactive-attr specs with
  `expected 'two' to be 'one'` / `expected 'b' to be 'a'` across
  transition + collapse + stagger/group modes; restored → 8/8 pass.

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7), [`9aa21a0`](https://github.com/pyreon/pyreon/commit/9aa21a0ae858c9ca88744f4c0d3a730a5d35a29f)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/runtime-dom@0.20.0
  - @pyreon/core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/runtime-dom@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/runtime-dom@0.18.0
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/runtime-dom@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/runtime-dom@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`c97783a`](https://github.com/pyreon/pyreon/commit/c97783a85b6f7ffc5d25ad16fd280c92808b5ea6), [`12dbf14`](https://github.com/pyreon/pyreon/commit/12dbf14c92ea3e107c89039a269181a500cb60d4)]:
  - @pyreon/runtime-dom@0.14.0
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0
  - @pyreon/runtime-dom@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies [[`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa)]:
  - @pyreon/runtime-dom@0.12.15
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- [#244](https://github.com/pyreon/pyreon/pull/244) [`c69e178`](https://github.com/pyreon/pyreon/commit/c69e178c2f0155c073a680f357ff71c8f9eec6a8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Kinetic anti-pattern cleanup + lint rule precision

  `@pyreon/kinetic`:

  - `nextFrame` (utils.ts): added `typeof requestAnimationFrame === 'undefined'`
    early-return. SSR callers receive `0` instead of crashing — the rule
    recognises the guard and the safety contract becomes explicit.
  - `TransitionItem`, `TransitionRenderer`: replaced destructured props
    (`({ show, enter, leave, … }) => …`) with `props.x` access to preserve
    reactive prop tracking. Defaults hoisted out (`const appear = props.appear
?? false`).
  - Added `vitest.browser.config.ts` + `src/__tests__/kinetic.browser.test.tsx` —
    the package's first real Chromium smoke test. 5 tests covering Transition
    mount/child rendering, signal-driven show/hide, `nextFrame` scheduling,
    `mergeClassNames` filtering, and the `typeof process === 'undefined'` /
    `import.meta.env.DEV === true` checks that confirm the package works in
    a real browser bundle.
  - Removed `packages/ui-system/kinetic/` from `PHASE_5_PENDING_PACKAGES` in
    `scripts/check-browser-smoke.ts` (stale now that the smoke test exists).
  - Devdep: `@vitest/browser-playwright`, `@pyreon/test-utils`, `@pyreon/core`,
    `@pyreon/reactivity`, `@pyreon/runtime-dom` added.

  `@pyreon/lint` — `no-bare-signal-in-jsx`:

  - Skip allowlist extended to `h` and `cloneVNode` (VNode-producing helpers
    from `@pyreon/core`). Their JSX call sites always produce a VNode, not
    a signal value. Matches `render` (already in the list) from ui-core.

  `@pyreon/lint` — `no-window-in-ssr`:

  - Safe-context call set extended with `watch` (signal-driven watcher from
    `@pyreon/reactivity`) and `requestAnimationFrame`. Both run their
    callbacks post-mount in a browser, so browser-global reads inside them
    are safe.

  4 new bisect-verified regression tests for the rule precision changes.

- Updated dependencies []:
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/runtime-dom@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/runtime-dom@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/runtime-dom@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/runtime-dom@0.12.11

## 0.1.2

## 0.1.1

## 0.0.3

### Patch Changes

- Update pyreon framework peer dependencies to >=0.4.0 <1.0.0, fix Element Wrapper children type for multi-child JSX patterns, add publish script improvements (--no-provenance, --otp support).

## 0.0.2

### Patch Changes

- [#17](https://github.com/pyreon/ui-system/pull/17) [`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial release of Pyreon UI System packages
