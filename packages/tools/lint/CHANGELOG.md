# @pyreon/lint

## 1.0.0

## 0.14.0

## 0.13.0

## 0.12.15

## 0.12.14

### Patch Changes

- [#247](https://github.com/pyreon/pyreon/pull/247) [`d199b67`](https://github.com/pyreon/pyreon/commit/d199b67edb4f2efa87721caa9708915278337513) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Code editor anti-pattern cleanup + lint rule precision

  `@pyreon/code`:

  - `editor.ts` `CustomGutterMarker.toDOM()`: added `typeof document === 'undefined'`
    early-return — the method is only invoked by CodeMirror at render time
    in a mounted browser, but the explicit guard documents the SSR-safety
    contract at the callsite.
  - `minimap.ts` `createMinimapCanvas` / plugin `update()` / `destroy()`: same
    pattern — typeof guards at function entry. The class-method paths only
    fire from the CodeMirror plugin lifecycle (browser-only) but the rule
    can't AST-trace that.
  - `bind-signal.ts` + 4 `editor.ts` computed/effect blocks: added inline
    `// pyreon-lint-disable-next-line pyreon/no-peek-in-tracked` suppressions
    for the canonical loop-prevention and imperative-ref-access uses of
    `.peek()`. These are intentional and correct — `.peek()` is THE official
    way to read a signal without subscribing.

  `@pyreon/lint`:

  - `no-window-in-ssr`: import-name shadowing — `import { history } from
'@codemirror/commands'` makes every later `history` identifier in the
    file refer to the import, not `window.history`. Same for default
    (`import history from …`) and namespace (`import * as history from …`)
    imports.
  - Runner suppression-comment alias: the `// pyreon-lint-disable-next-line
<rule-id>` syntax is now a recognised alias of the existing
    `// pyreon-lint-ignore <rule-id>` syntax. Several rule docstrings already
    documented `disable-next-line` — closing the docs / runtime gap.

  6 new bisect-verified regression tests for the rule + suppression changes.

- [#239](https://github.com/pyreon/pyreon/pull/239) [`ee1bc2b`](https://github.com/pyreon/pyreon/commit/ee1bc2b0dd3ce853eee4a72bcc8629ed0aa1cea5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Elements anti-pattern cleanup + lint rule precision

  `@pyreon/elements`:

  - `utils.ts`: replaced `process.env.NODE_ENV !== 'production'` (dead code in
    real Vite browser bundles — `process` is not polyfilled) with the
    tree-shake-friendly `import.meta.env?.DEV` gate. Typed through a narrowing
    interface so downstream packages don't need `vite/client` in their
    tsconfigs to type-check elements transitively.
  - `helpers/Wrapper/component.tsx`, `List/component.tsx`: replaced destructured
    props (`({ x, ...rest }) => …`) with `splitProps(props, OWN_KEYS)` to
    preserve reactive prop tracking.
  - `Overlay/useOverlay.tsx`: added `typeof window === 'undefined'` early-return
    guards at the entry points of `calcDropdownVertical`/`Horizontal`,
    `calcModalPos`, `getAncestorOffset`, and `setupListeners`. Each function
    is only reachable from a mounted browser context (via event handlers
    registered inside `onMount`), but the rule can't AST-trace that; the
    explicit guard documents the SSR-safety contract at the callsite.
  - `devWarn`: rewritten to use the shared `IS_DEVELOPMENT` flag (itself
    gated on `import.meta.env?.DEV`) so it tree-shakes in production.
  - Added `packages/ui-system/elements/vitest.browser.config.ts` +
    `src/__tests__/elements.browser.test.tsx` — the package's first real
    Playwright Chromium smoke test. Verifies Element/Portal/Text render into
    real DOM, a reactive text child updates on signal change, and
    `typeof process === 'undefined'` / `import.meta.env.DEV === true` in the
    browser bundle (catching the `typeof process` dead-code class of bug).
  - Devdep: `@vitest/browser-playwright`, `@pyreon/test-utils`, `@pyreon/core`,
    `@pyreon/reactivity`, `@pyreon/runtime-dom` added to elements.

  `@pyreon/lint` — `no-window-in-ssr`:

  - Logical-and guards with a typeof-derived const on either side now recognised
    (e.g. `IS_BROWSER && active() ? <Portal target={document.body} /> : null`).
    Short-circuit semantics mean the body only runs when the guard is truthy.

  `@pyreon/lint` — `no-bare-signal-in-jsx`:

  - Added `render` to the skip allowlist. `render()` from `@pyreon/ui-core` is
    a VNode-producing helper (takes ComponentFn/string/VNode, returns
    VNodeChild), not a signal read — its JSX call sites always produce a
    VNode and don't need `() =>` wrapping.

  `@pyreon/lint` — `dev-guard-warnings`:

  - Added conventional dev-flag name set (`__DEV__`, `IS_DEV`, `IS_DEVELOPMENT`,
    `isDev`) so imported dev gates (e.g. `import { IS_DEVELOPMENT } from '../utils'`)
    silence `console.warn` warnings inside their guarded branches. Same convention
    basis as the existing `__DEV__` identifier check — the rule can't follow
    cross-module imports to verify the binding resolves to `import.meta.env.DEV`,
    so the name is the contract.
  - Also added `VariableDeclaration` tracking for locally-bound dev-flag consts
    (`const x = import.meta.env.DEV === true` or similar).

  5 new bisect-verified regression tests for the rule precision improvements.

- [#234](https://github.com/pyreon/pyreon/pull/234) [`a8ab19d`](https://github.com/pyreon/pyreon/commit/a8ab19d2db8b764f3643f2fa50f721727b8ba0d1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Hooks anti-pattern cleanup + lint rule precision improvements

  `@pyreon/hooks`:

  - `useClipboard`: batch `text.set()` + `copied.set()` in the success branch so
    subscribers reading both see one update, not two. Added
    `typeof navigator === 'undefined'` early-return in `copy()` for SSR safety.
  - `useBreakpoint`, `useFocusTrap`, `useWindowResize`: listeners moved INSIDE
    `onMount` (co-located with their `window`/`document` registration) and
    cleanup returned from `onMount` instead of using a separate `onUnmount`
    call. Matches the Pyreon convention that `onMount` accepts a cleanup
    return value.
  - `useInfiniteScroll.setup()` and `useScrollLock.lock()/unlock()`: added
    `typeof document === 'undefined'` early-returns to make the SSR-safety
    contract explicit at the callsite (previously relied on ref-callbacks never
    firing on the server — brittle).

  `@pyreon/lint` — `no-window-in-ssr` rule precision (fewer false positives,
  fewer silent false negatives):

  - Track `typeof X` expressions via `UnaryExpression` enter/exit depth instead
    of the inert `parent.operator === 'typeof'` check (oxc's visitor does NOT
    pass `parent`).
  - Skip member-expression property names (`x.addEventListener`),
    object-property keys (`{ document: 1 }`), and import-specifier names via
    WeakSet pre-marking, for the same reason.
  - Skip TypeScript type-position nodes (`let x: Window`, `type T = Document`,
    etc.) via `TSTypeAnnotation`/`TSTypeReference`/`TSTypeAliasDeclaration`/
    `TSInterfaceDeclaration`/`TSTypeParameter` depth counter — type refs are
    erased at compile time, not runtime accesses.
  - Recognise `const isBrowser = typeof window !== 'undefined'` idiom: `if
(isBrowser) { … }` is now treated the same as `if (typeof window !==
'undefined') { … }`.
  - Recognise early-return-on-typeof guards: `if (typeof X === 'undefined')
return …` makes the rest of the function body implicitly typeof-guarded.
    Supports OR-chained form (`typeof X === 'undefined' || typeof Y ===
'undefined'`) for features needing multiple browser APIs.
  - Treat `onUnmount`, `onCleanup`, `effect`, `renderEffect` as safe contexts
    (same as `onMount`) — these only run after mount in the browser.
  - Ternary `typeof X !== 'undefined' ? safe : fallback` now tracked via
    `ConditionalExpression` enter/exit.

  `@pyreon/lint` — other rules fixed for the same oxc-no-parent root cause:

  - `no-props-destructure`: pre-mark `CallExpression` arguments via WeakSet so
    HOC factory args (`createLink(({ href }) => <a />)`) are correctly skipped
    — previously the `parent?.type === 'CallExpression'` check was inert.
  - `no-unbatched-updates`: added `schema: { exemptPaths: 'string[]' }` option
    so test files can be exempted from the rule (tests often need deliberate
    sequential `.set()` calls to observe intermediate debounce/throttle state).

  `@pyreon/lint` — type hygiene:

  - `VisitorCallback` signature narrowed to `(node: any) => void`. The earlier
    `parent?: any` second parameter was a false promise — oxc's walker never
    passes `parent`, and rules silently depended on an `undefined` value.

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

- [#232](https://github.com/pyreon/pyreon/pull/232) [`9b0c758`](https://github.com/pyreon/pyreon/commit/9b0c75861b2137cd96d472288e11fa47edab7838) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Per-rule options API — ESLint-style tuple form for rule config

  - Rule entries now accept `Severity` OR `[Severity, RuleOptions]` — e.g.
    `"pyreon/no-window-in-ssr": ["error", { "exemptPaths": ["src/foundation/"] }]`.
    Bare-severity form continues to work.
  - Rules that support path-based exemption read `options.exemptPaths: string[]` —
    currently `no-window-in-ssr`, `no-raw-addeventlistener`, `no-raw-setinterval`,
    `no-process-dev-gate`, `dev-guard-warnings`.
  - `RuleContext` gains `getOptions(): RuleOptions`.
  - `RuleMeta` gains optional `schema: Record<string, 'string' | 'string[]' | 'number' | 'boolean'>`.
    Runner validates user config once per `(rule, options)` pair: wrong-typed
    values disable the rule + emit an error; unknown option keys emit a warning;
    rules without a schema accept any options.
  - Validation messages surface in `LintResult.configDiagnostics` (new field)
    in addition to stderr, so programmatic consumers / LSP / CI see them.
  - `.pyreonlintrc.json` entries can use the tuple form; a shipped JSON Schema
    (`schema/pyreonlintrc.schema.json`) gives IDE autocomplete + validation when
    referenced via `$schema`.
  - CLI: `--rule id=severity` still works; new `--rule-options id='{...}'`
    passes JSON-encoded options to a specific rule from the command line.
  - New exported helpers: `isPathExempt(context)` (reads `options.exemptPaths`)
    and `isTestFile(filePath)` (universal `*.test.*` / `/tests/` matcher).
  - `utils/package-classification.ts` renamed to `utils/file-roles.ts` (the
    monorepo-specific pattern arrays moved to the consuming project's config
    via `exemptPaths`).

- [#242](https://github.com/pyreon/pyreon/pull/242) [`95e7e00`](https://github.com/pyreon/pyreon/commit/95e7e00bd3e3b3926bd8348cf91f88494605ccc6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Router anti-pattern cleanup + lint rule precision

  `@pyreon/router`:

  - `ScrollManager.save()` / `_applyResult()`: added `typeof window === 'undefined'`
    early-return guards so the SSR-safety contract is explicit at the method
    entry instead of relying on callers to pre-check.
  - `useBlocker`: replaced bare `if (beforeUnloadHandler)` guards with
    `if (_isBrowser && beforeUnloadHandler)` — same runtime behaviour (the
    handler is non-null only when `_isBrowser` is true), but links the check
    back to the typeof-derived const so `no-window-in-ssr` can prove the
    body is browser-safe.
  - `destroy()`: same pattern for `_popstateHandler` / `_hashchangeHandler`.
  - Error prefix normalised: `[pyreon-router]` → `[Pyreon]` (matches the
    `no-error-without-prefix` rule + the rest of the framework).

  `@pyreon/lint` — `no-window-in-ssr`:

  - Parameter-shadowing: identifiers like `location`/`history`/`navigator`
    that are FUNCTION PARAMETERS (or destructured parameter patterns) no
    longer false-positive as browser-global references. E.g. `router.push`
    takes a `location` parameter — inside its body, every `location`
    references the parameter, not `window.location`.
  - Typeof-derived `&&` chains in const bindings: `const useVT = _isBrowser
&& meta && typeof document.startViewTransition === 'function'` now
    registers `useVT` as typeof-bound, so `if (useVT) { document.X }` is
    recognised as guarded.

  `@pyreon/lint` — `no-imperative-navigate-in-render`:

  - Full rewrite of the safe-context detection. Previously only recognised
    `onMount`/`effect`/`onUnmount` call callbacks as safe — this false-fired
    on `router.push()` inside any locally-declared event handler
    (`const handleClick = (e) => router.push(...)`). Now tracks a
    `nestedFnDepth` counter across ALL nested functions inside a component
    body, so any nested ArrowFn/FunctionExpression is treated as deferred
    execution. Fires only on direct-in-render-body imperative navigation —
    which is the actual bug the rule is designed to catch.

  `@pyreon/lint` — `no-dom-in-setup`:

  - Extended safe-context set: now includes `onUnmount`, `onCleanup`,
    `renderEffect`, and `requestAnimationFrame`. `document.querySelector`
    inside a `requestAnimationFrame` callback is guaranteed to run in a
    browser frame post-setup, so it doesn't warrant the setup-phase warning.

  9 new bisect-verified regression tests for the three rule precision
  improvements.

- [#253](https://github.com/pyreon/pyreon/pull/253) [`779f61f`](https://github.com/pyreon/pyreon/commit/779f61f99e1f403485871c1848fc82489d20960f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Storage / query / core-server anti-pattern cleanup + `no-window-in-ssr`
  typeof-guard-function recognition

  `@pyreon/storage` (10 errors → 0):

  - `indexed-db.ts`: added `typeof indexedDB === 'undefined'` early-return at
    `openDB` entry. SSR callers receive a rejected promise with a clear
    `[Pyreon] indexedDB is not available` error instead of crashing.

  `@pyreon/query` (5 errors → 0):

  - `use-subscription.ts`: added `typeof WebSocket === 'undefined'`
    early-return guards at the entry of `connect()`, `send()`, and `close()`.
  - `query-client.ts`: error prefix `[@pyreon/query]` → `[Pyreon]`.

  `@pyreon/server` / `@pyreon/core-server` (5 errors → 0):

  - `client.ts`: `typeof document === 'undefined' → throw` early-return on
    `startClient` entry. `hydrateIslands` and `scheduleHydration` /
    `observeVisibility` typeof guards.
  - `client.ts` / `html.ts`: error prefixes normalised to `[Pyreon]`.

  `@pyreon/lint` — `no-window-in-ssr` typeof-guard functions:

  - A function whose body is `return <typeof check>` (or AND-chain of typeof
    checks) now counts as a typeof guard at its call sites — e.g.
    `function isBrowser() { return typeof window !== 'undefined' }` makes
    `if (!isBrowser()) return` an early-return guard. Both
    `function decl` and `const fn = () => …` (arrow + function-expression)
    forms are recognised.
  - Conventional names `isBrowser` / `isClient` / `isServer` / `isSSR` are
    pre-seeded so cross-module imports (`import { isBrowser } from './utils'`)
    work without follow-the-import analysis. Same name-convention basis as
    `dev-guard-warnings` recognising `__DEV__`. The trade-off — a user-defined
    function with a matching name that does NOT actually check typeof would
    silence the rule — is documented as the cross-module convention contract.

  5 new bisect-verified regression tests for the typeof-guard-function
  recognition.

- [#251](https://github.com/pyreon/pyreon/pull/251) [`290ea64`](https://github.com/pyreon/pyreon/commit/290ea64ee90b5e749008d2b437084fc001ad24f1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Zero meta-framework anti-pattern cleanup + lint rule precision

  `@pyreon/zero`:

  - `link.tsx` `doPrefetch`: added `typeof document === 'undefined'` early-return.
    Prefetch only fires from browser-mounted Link interactions but the explicit
    guard documents the SSR-safety contract.
  - `client.ts` `startClient`: added `typeof document === 'undefined' → throw`
    early-return. Browser entry point hard-fails in SSR with a clearer error
    than `document is not defined`.
  - `script.tsx` `loadScript`: typeof-document early-return at function entry
    (the function is only invoked from `onMount` but the rule can't
    AST-trace the indirect call).
  - Error prefix normalisation: `[zero]` / `[zero:adapter]` / `[zero:image]` /
    etc. → `[Pyreon]` across 9 source files. Test assertions updated.
  - `font.ts`: added `[Pyreon] ` prefix to two `Failed to fetch / download`
    errors.

  `@pyreon/lint`:

  - `no-window-in-ssr` and `no-dom-in-setup`: early-return-guard heuristic
    now recognises `throw` as a function-terminating statement (in addition
    to `return`). Common in entry-point functions like `startClient` that
    hard-fail in SSR rather than silently no-op.
  - `no-dom-in-setup`: added the same early-return-on-typeof-document/window
    guard tracking that `no-window-in-ssr` already had — `if (typeof document
=== 'undefined') return …` at function head implicitly guards the rest
    of the body for both rules now.
  - `BROWSER_GLOBALS`: removed `fetch`. It's a universal global in Node 18+,
    Bun, Deno, browsers, and edge runtimes. Code using `fetch` isn't
    browser-specific. (`XMLHttpRequest` and `WebSocket` remain DOM-only.)

  5 new bisect-verified regression tests for the rule changes.

## 0.12.13

## 0.12.12

## 0.12.11
