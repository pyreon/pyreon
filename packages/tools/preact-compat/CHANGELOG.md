# @pyreon/preact-compat

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

### Patch Changes

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

- [#756](https://github.com/pyreon/pyreon/pull/756) [`5c302b9`](https://github.com/pyreon/pyreon/commit/5c302b9e1c44a26b1669b43d0f46123ed9ca06ff) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(react-compat, preact-compat): unwrap compiler-emitted function children in `Children.*` / `toChildArray`

  `@pyreon/react-compat`'s `React.Children.map` / `forEach` / `count` /
  `toArray` / `only` AND `@pyreon/preact-compat`'s `toChildArray`
  silently produced wrong results when children went through the Pyreon
  compiler's prop-inlining accessor wrap. Same bug class as PR [#197](https://github.com/pyreon/pyreon/issues/197)
  (connector-document silent metadata drop) and PR [#736](https://github.com/pyreon/pyreon/issues/736) (kinetic /
  Iterator function-shape iteration), now also closed for the React /
  Preact compat layers.

  ## The bug class

  The Pyreon vite-plugin's compiler rewrites
  `<MyComp>{data.map(fn)}</MyComp>` (or any non-stable children
  expression — `CallExpression`, `ConditionalExpression`, etc.) as
  `MyComp({ children: () => data.map(fn) })`. The transform is
  pragma-agnostic — it fires for components under `@pyreon/react-compat`
  and `@pyreon/preact-compat` too, not just the native `@pyreon/core`
  pragma. PR [#732](https://github.com/pyreon/pyreon/issues/732)'s "stable references" carve-out only skips the wrap
  for bare identifiers and simple member-expression chains; everything
  else still gets the function wrap.

  Pre-fix, `React.Children.map(props.children, fn)` (or `toChildArray`)
  saw the wrapping function as a single child. `flattenChildren` /
  `flatten` fell through to "not array → push value" — returning
  `[function]` instead of expanding to the N real children. The
  downstream `fn(function, 0)` either crashed, rendered nothing, or
  silently corrupted the output depending on what the user's callback
  did with the function-shaped child.

  Real-world impact: any React-port that uses `React.Children.*` to
  render dynamic lists would silently lose every child after position 0
  when the children expression isn't a bare identifier. The bug shipped
  from package inception on both compat layers.

  ## The fix

  Mirrors PR [#731](https://github.com/pyreon/pyreon/issues/731) / [#736](https://github.com/pyreon/pyreon/issues/736) / Iterator's pattern — unwrap the function at
  helper entry:

  ```ts
  // react-compat
  function flattenChildren(children: VNodeChild | VNodeChild[]): VNodeChild[] {
    if (children == null) return [];
    if (typeof children === "function") {
      children = (children as () => VNodeChild | VNodeChild[])();
      return flattenChildren(children as VNodeChild | VNodeChild[]);
    }
    if (!Array.isArray(children)) return [children];
    // ... existing array-flatten path
  }

  // preact-compat
  function flatten(value: NestedChildren, out: VNodeChild[]): void {
    if (value == null || typeof value === "boolean") return;
    if (typeof value === "function") {
      flatten((value as () => NestedChildren)(), out);
      return;
    }
    // ... existing array-flatten path
  }
  ```

  The recursion handles every shape the compiler can emit (function
  wrapping array / single VNode / nested arrays / null). The fix is
  additive — plain (non-wrapped) children paths are unchanged.

  ## Bisect verification

  **react-compat**: 9 new specs added covering `Children.map` /
  `forEach` / `count` / `toArray` / `only` against function-wrapped
  children + the additive control. Reverted the `typeof children ===
'function'` branch from `flattenChildren` → 8 of 9 specs fail with
  "expected 2 to be 1" / "expected [Function] to throw" / etc. The 9th
  control spec ("plain children still work") stays green either way.
  Restored → 233/233 specs pass.

  **preact-compat**: 5 new specs added covering `toChildArray` against
  function-wrapped children + the additive control. Reverted the
  `typeof value === 'function'` branch from `flatten` → 3 of 5 specs
  fail with "expected length 2 but got 1" / "expected length 3 but got
  1" / "expected [Function] to deeply equal []". The 2 control specs
  ("single child unwraps", "plain children still work") stay green
  either way. Restored → 162/162 specs pass.

  ## Surfaces updated

  - `packages/tools/react-compat/src/index.ts` — `flattenChildren`
    function-unwrap branch + recursion
  - `packages/tools/preact-compat/src/index.ts` — `flatten` function-
    unwrap branch
  - `packages/tools/react-compat/src/tests/new-apis.test.ts` — 9 new
    specs in `describe('Children utilities — compiler function-wrap unwrap')`
  - `packages/tools/preact-compat/src/tests/new-apis.test.ts` — 5 new
    specs in nested `describe('compiler function-wrap unwrap')` under
    the existing `toChildArray` describe block

  ## Why the lint rule didn't catch this

  `pyreon/no-iterate-children-without-resolve` flags `cloneVNode(EXPR)`,
  inline-or-bound `(Array.isArray(EXPR) ? EXPR : [EXPR]).METHOD(…)`, and
  `EXPR.props` reads where EXPR ends with `.children`. The compat helpers
  iterate the children parameter via `if (Array.isArray(children))`
  followed by a `for...of` loop (an `IfStatement`-guarded shape that's
  deliberately out-of-scope to avoid false-positives on framework
  primitives like `Dynamic` / `Show` / `Switch`). Manual sweep — exactly
  the precision trade-off PR [#751](https://github.com/pyreon/pyreon/issues/751) documented.

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/runtime-dom@0.23.0
  - @pyreon/reactivity@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/runtime-dom@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/runtime-dom@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7), [`9aa21a0`](https://github.com/pyreon/pyreon/commit/9aa21a0ae858c9ca88744f4c0d3a730a5d35a29f)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/runtime-dom@0.20.0
  - @pyreon/core@0.20.0

## 0.19.0

### Patch Changes

- [#642](https://github.com/pyreon/pyreon/pull/642) [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Repo sweep (round 2): a real memory leak + cross-compat duplication removal.

  **`@pyreon/styler` — unbounded `insertCache` + DOM `cssRules` growth (memory leak).** `evictIfNeeded()` trimmed ONLY the `cache` Map. The cssText-keyed `insertCache` (large keys — full CSS text) and the live `<style>` tag's `CSSStyleSheet.cssRules` were never evicted, so `maxCacheSize` bounded the _smallest_ of the three storage layers while the two memory-heavy ones grew for the entire process lifetime. Any app generating many distinct CSS strings (signal-driven dynamic styles, per-instance computed themes) leaked Map entries + live DOM rules forever. Fix: a `className → Set<icKey>` reverse index plus a `className → CSSRule[]` object-ref index (object refs survive `deleteRule()` reindexing) let `evictKeys()` drop all three layers in lockstep — `cache.delete` + `insertCache.delete` + descending-index `deleteRule()`. `reset()` / `clearCache()` / `clearAll()` clear the two new indices too. `maxCacheSize` now genuinely bounds memory. No API/behaviour change for steady-state apps; dedup correctness preserved (re-inserting an evicted rule yields the same deterministic className + exactly one live DOM rule). Bisect-verified: reverted `evictKeys` to pre-fix cache-only behaviour → `insertCache stays bounded` failed `expected 300 to be ≤ 75`, `live DOM cssRules count` failed `expected 180 to be ≤ 47`; restored → 13/13.

  **`@pyreon/core` + `@pyreon/react-compat` + `@pyreon/preact-compat` — compat duplication removal (behaviour-preserving).** `shallowEqual` (memo / useState bailout) was copy-pasted byte-identically into `react-compat/index.ts` and `preact-compat/hooks.ts`; the React/Preact DOM-prop mapping (`className→class`, `htmlFor→for`, `onChange→onInput`, `autoFocus`, `defaultValue`/`defaultChecked`, authoring-only strip) was near-duplicated across both jsx-runtimes (only divergence: React also stripped `suppressContentEditableWarning` — a no-op for Preact, so unifying is behaviour-preserving). Consolidated into a new `@pyreon/core/compat-shared.ts` (`shallowEqualProps`, `mapCompatDomProps`) — core is already a dependency of every compat package and already hosts the sibling cross-compat module `compat-marker.ts` (`nativeCompat`/`isNativeCompat`). Both packages now import the canonical helpers (aliased to local names — zero call-site churn).

  Validation: lint 0 errors; typecheck clean (styler + core + react-compat + preact-compat); styler 413/413, core 497/497, react-compat 224/224, preact-compat 157/157; styler browser smoke 9/9; e2e `ui-regression` 26/26 (styler/rocketstyle real-app gate); e2e `compat-layers` 12/12 (react/preact/vue/solid real-app gate); new `compat-shared.test.ts` 13/13.

  **Deferred (own focused PRs — analysis preserved):** router `findNotFoundFallback` cache — its result depends on `urlPath` (not a pure fn of `routes`), so a correct cache needs an enumerate-candidates / pick-by-urlPath refactor. That's a correctness-sensitive perf refactor, not a mistake / edge case / leak / duplicate, so it's out of scope for a behaviour-preserving sweep. `@pyreon/styler` `internElementBundle` css-prop interning ([#626](https://github.com/pyreon/pyreon/issues/626)-documented) — a distinct optimization, not a leak; its own PR. No other new memory leak found this round (prior sweeps already fixed signal.\_d / computed.direct / useSortable / ISR).

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

### Minor Changes

- [#293](https://github.com/pyreon/pyreon/pull/293) [`1f31c6b`](https://github.com/pyreon/pyreon/commit/1f31c6bddfa2589d3f0e16b813021220b95b3a5b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Production-ready Preact API surface. Fixes setter identity stability, effect unmount cleanup, memo per-instance cache, signals peek untracking. Adds forwardRef, useImperativeHandle, useDebugValue, PureComponent, createPortal, lazy, Suspense, ErrorBoundary, version. JSX runtime: className, htmlFor, onChange mapping, autoFocus, defaultValue/defaultChecked, native component marker for Provider.

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

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.2
  - @pyreon/core@0.7.2
  - @pyreon/runtime-dom@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.1
  - @pyreon/core@0.7.1
  - @pyreon/runtime-dom@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.7.0
  - @pyreon/core@0.7.0
  - @pyreon/runtime-dom@0.7.0

## 0.6.0

### Patch Changes

- feat(core): add `provide()` helper, widen `ComponentFn` return to `VNodeChild`, add `ExtractProps` and `HigherOrderComponent` utility types

  Migrate router, head, preact-compat to use `provide()` instead of manual `pushContext`/`popContext`

- Updated dependencies []:
  - @pyreon/core@0.6.0
  - @pyreon/runtime-dom@0.6.0
  - @pyreon/reactivity@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.5.7
  - @pyreon/core@0.5.7
  - @pyreon/runtime-dom@0.5.7

## 0.5.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.6
  - @pyreon/runtime-dom@0.5.6
  - @pyreon/reactivity@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.4
  - @pyreon/reactivity@0.5.4
  - @pyreon/runtime-dom@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.3
  - @pyreon/reactivity@0.5.3
  - @pyreon/runtime-dom@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.2
  - @pyreon/reactivity@0.5.2
  - @pyreon/runtime-dom@0.5.2

## 0.5.1

### Patch Changes

- Unify project scanner into @pyreon/compiler, fix JSX type declarations for published packages, update dependencies, and resolve build compatibility with rolldown 1.15.0.

- Updated dependencies []:
  - @pyreon/core@0.5.1
  - @pyreon/reactivity@0.5.1
  - @pyreon/runtime-dom@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.5.0
  - @pyreon/runtime-dom@0.5.0
  - @pyreon/reactivity@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.4.0
  - @pyreon/core@0.4.0
  - @pyreon/runtime-dom@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.3.1
  - @pyreon/core@0.3.1
  - @pyreon/runtime-dom@0.3.1

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

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.3.0
  - @pyreon/core@0.3.0
  - @pyreon/runtime-dom@0.3.0

## 0.2.1

### Patch Changes

- Release 0.2.1

  - feat(vite-plugin): add `compat` option for zero-change framework migration
  - fix: resolve `workspace:^` dependencies correctly during publish
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

- Updated dependencies []:
  - @pyreon/reactivity@0.2.1
  - @pyreon/core@0.2.1
  - @pyreon/runtime-dom@0.2.1

## 0.2.0

### Minor Changes

- Release 0.2.0
  - fix(vite-plugin): use `oxc` instead of deprecated `esbuild` option for Vite 8
  - fix(vite-plugin): bump vite peer dependency to `>=8.0.0`

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.2.0
  - @pyreon/core@0.2.0
  - @pyreon/runtime-dom@0.2.0

## 0.1.2

### Patch Changes

- Improve compat package types (eliminate unnecessary casts), add lint/typecheck CI for all workspaces, split example apps into individual component files.

- Updated dependencies []:
  - @pyreon/reactivity@0.1.2
  - @pyreon/core@0.1.2
  - @pyreon/runtime-dom@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.1.1
  - @pyreon/core@0.1.1
  - @pyreon/runtime-dom@0.1.1
