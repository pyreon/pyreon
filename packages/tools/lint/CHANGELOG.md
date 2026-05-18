# @pyreon/lint

## 0.19.0

### Minor Changes

- [#632](https://github.com/pyreon/pyreon/pull/632) [`bcc3cd5`](https://github.com/pyreon/pyreon/commit/bcc3cd50d3cc19b486a8169fbe941848edd793c7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(lint): opt-in, dependency-auto-detected best-practice rules (frontend a11y/CLS + query/rx/form)

  Adds 7 best-practice rules across 3 new categories plus a new opt-in
  preset and the dependency-detection foundation that makes them
  zero-config and zero-noise. `pyreon doctor` surfaces them automatically
  (its lint gate already maps every lint category), so no `@pyreon/cli`
  change is needed.

  **New rules (74 rules / 16 categories total, up from 67/13):**

  - `frontend` (4): `pyreon/require-img-alt` (a11y — error), `pyreon/img-requires-dimensions` (CLS/layout-shift — warn), `pyreon/no-positive-tabindex` (a11y, **auto-fixable** → `0`), `pyreon/prefer-zero-image` (asset optimization — info, gated on `@pyreon/zero`).
  - `query` (1): `pyreon/query-options-as-function` — `useQuery`/`useInfiniteQuery`/`useQueries`/`useSuspenseQuery` with an options **object literal** breaks signal-tracked refetch; wrap in `() => ({ ... })` (error; `useMutation` excluded).
  - `rx` (1): `pyreon/rx-prefer-pipe` — nested rx transforms → compose with `pipe(...)` for one computed (info).
  - `form` (1, extends the existing category): `pyreon/no-signal-in-form-initial-values` — a signal read in `useForm({ initialValues })` snapshots once; pass the plain value / use a reactive field (warn).

  **Configurability (all three levels):**

  1. **Opt-in by default** — every new rule sets `meta.optIn: true`: forced
     OFF in `recommended` / `strict` / `app` / `lib` (never a surprise
     score/CI penalty). The new `best-practices` preset enables them
     wholesale; per-rule `.pyreonlintrc.json` config always overrides.
  2. **Dependency auto-detection** — library-scoped rules self-gate on the
     project's `package.json` (`dependencies` / `devDependencies` /
     `peerDependencies` / `optionalDependencies`, + the package's own name
     for in-lib source) via the new `utils/project-deps:isProjectDependency`
     (cached per manifest). A project that doesn't use `@pyreon/query`
     never sees query rules.
  3. **Path exemption** — all support `exemptPaths` like the other
     exemptable rules.

  **AI-actionable:** every rule's message is prescriptive (states the fix),
  so an assistant reading `pyreon doctor` / `pyreon-lint` output knows
  exactly how to resolve it; `no-positive-tabindex` autofixes with `--fix`.

  New public surface: `PresetName` gains `'best-practices'`; `RuleCategory`
  gains `'frontend' | 'query' | 'rx'`; `RuleMeta` gains optional `optIn`;
  `isProjectDependency` exported from `@pyreon/lint`. Backward-compatible
  (opt-in default = no behavior change for existing consumers).

  Bisect-verified per rule (FIRES / DOES-NOT-FIRE + dep-absent specs);
  `@pyreon/lint` 576 tests pass; foundation covered by dedicated
  `project-deps.test.ts` + `best-practices-preset.test.ts`.

- [#634](https://github.com/pyreon/pyreon/pull/634) [`82d78b4`](https://github.com/pyreon/pyreon/commit/82d78b4889344bad26175d4adf07c682d639dfa3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(lint): autofix `query-options-as-function` + extend best-practice rules to i18n & router (76 rules / 17 cat)

  Follow-up to [#632](https://github.com/pyreon/pyreon/issues/632) (extend more libraries + autofix the mechanically-safe ones).

  - **`pyreon/query-options-as-function` is now auto-fixable** (`--fix`): the
    options object literal is wrapped in `() => (...)` (pure syntactic
    thunk; the intended reactivity fix, no other behavior change).
  - **New opt-in rule `pyreon/i18n-prefer-trans-for-rich-jsx`** (`i18n`
    category — new; severity `info`; dep-gated `@pyreon/i18n`): flags
    `{t('…')}` interleaved with JSX element siblings (rich content) —
    use `<Trans>`. Zero-FP: a single element's children-array check;
    plain-text `{t('title')}` never fires.
  - **New opt-in rule `pyreon/prefer-typed-search-params`** (`router`
    category; severity `info`; dep-gated `@pyreon/router`): manual
    `new URLSearchParams(...)` in a router-aware file → use
    `useTypedSearchParams()`. Zero-FP: literal `new URLSearchParams` +
    in-file `@pyreon/router` import.

  Both new rules follow the [#632](https://github.com/pyreon/pyreon/issues/632) contract: `meta.optIn: true` (off in
  `recommended`/`strict`/`app`/`lib`; enabled by the `best-practices`
  preset or per-rule config), `package.json` dependency auto-detection,
  `exemptPaths`, prescriptive AI-actionable messages. `RuleCategory` gains
  `'i18n'`. Backward-compatible (opt-in default = no behavior change).

  Bisect-verified per rule + per autofix; `@pyreon/lint` 595 tests pass
  (incl. updated count/category/opt-in-set meta-tests + a new
  `bp-extend-rules.test.ts`). Docs (CLAUDE.md, lint.md, README,
  anti-patterns.md, manifest) updated.

- [#639](https://github.com/pyreon/pyreon/pull/639) [`8f1aad3`](https://github.com/pyreon/pyreon/commit/8f1aad3cc44d86f9248cfd4b7def10c914748bb0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(lint): 4 opt-in best-practice rules — frontend a11y + dep-gated @pyreon/storage

  Adds 4 opt-in rules (80 rules / 18 categories, up from 76 / 17) on the
  existing `meta.optIn` + dependency-auto-detection foundation. `pyreon
doctor` surfaces them automatically (its lint gate is category-agnostic,
  keyed on `meta.optIn`); the `recommended`/`strict`/`app`/`lib` presets
  force them OFF, the `best-practices` preset enables them at declared
  severity. Backward-compatible (opt-in default = no behavior change).

  **Frontend a11y (category `frontend`, all `optIn`):**

  - `pyreon/no-autofocus` (warn, **fixable**) — the `autoFocus`/`autofocus`
    attribute moves focus on mount, disorienting screen-reader/keyboard
    users. Skips `autoFocus={false}`. Fix removes the attribute.
  - `pyreon/no-redundant-role` (warn, **fixable**) — a `role` that
    duplicates the element's implicit ARIA role. Conservative tag→role map
    (zero-FP: `a`→`link` only with a static `href`; dynamic values and
    component elements skipped). Fix removes the attribute.
  - `pyreon/anchor-is-valid` (warn) — `<a>` with no `href`, or `href` of
    `""` / `#` / `javascript:`. Not fixable (button-vs-link intent is
    ambiguous); `href={dynamic}` skipped.

  **Library best-practice (new category `storage`, `optIn` + dep-gated):**

  - `pyreon/no-storage-write-as-call` (error, **fixable**) — gated on a
    declared `@pyreon/storage` dependency. `useStorage` /
    `useSessionStorage` / `useCookie` / `useIndexedDB` / `useMemoryStorage`
    return a `StorageSignal`; `s(next)` reads-and-discards the argument
    like any signal call. Same proven conservative shape as the
    `signal-write-as-call` detector (tracks the `const s = useStorage(...)`
    binding, fires only on a bare-identifier call with ≥1 arg, skips
    `.set`/`.update`/`.remove` and zero-arg reads). Fix: `s(x)` → `s.set(x)`.

  Deferred with rationale (NOT silently dropped): `control-needs-label`
  and broad machine/hotkeys/permissions/state-tree rules — label/aria
  association and those surfaces need cross-element id / scope / type
  resolution an AST walker can't do without false positives (the explicit
  "high-risk cliff" the codebase avoids for detectors).

  Each rule ships paired FIRES / DOES-NOT-FIRE specs (the dep-gated one
  also a "dep absent → silent" spec); bisect-verified (disabling
  `context.report` in `no-storage-write-as-call` fails its 3 fire/fix
  specs, restored → 9/9). New public surface: `RuleCategory` gains
  `'storage'`. Meta-tests updated (rule count 76→80, category counts,
  `best-practices-preset` opt-in set 9→13). `@pyreon/lint` 634 tests
  pass; manifest regenerated `llms-full.txt` + MCP `api-reference.ts`
  (`gen-docs --check` clean); oxlint + typecheck clean.

- [#601](https://github.com/pyreon/pyreon/pull/601) [`9de49da`](https://github.com/pyreon/pyreon/commit/9de49dab97c91c8707decd10ce89085d8d6942e0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New rule `pyreon/no-heavy-import-only-in-handler` (performance, warn).

  Flags a statically-imported heavy module (`@pyreon/charts` / `code` / `flow` / `document`, plus any extra modules configured via the `heavyModules` option) that is referenced **only** inside deferred scopes — JSX `on*` event handlers or `onMount` / `onUnmount` / `onCleanup` lifecycle callbacks. The static `import` forces the heavy chunk into the initial bundle even though nothing touches it until the user interacts; the fix is a dynamic `await import()` inside the handler.

  ```tsx
  // ✗ flagged — @pyreon/charts only used in a click handler
  import { renderChart } from '@pyreon/charts'
  <button onClick={() => renderChart(el)}>Show chart</button>

  // ✓ heavy chunk stays out of the initial bundle
  <button onClick={async () => {
    const { renderChart } = await import('@pyreon/charts')
    renderChart(el)
  }}>Show chart</button>
  ```

  The precise, actionable counterpart to the blunt info-level `pyreon/no-eager-import` (which fires on every heavy static import including ones genuinely needed at render). This rule fires only when **every** reference is provably deferred, so the recommended fix is unambiguous. Conservative by construction: any eager reference at all — a `<Chart/>` JSX element, a module-eval `const x = heavy`, a plain helper called at render — suppresses the report (a false negative is acceptable; telling someone to defer an import they need at render is not).

  `effect` / `renderEffect` are deliberately **not** treated as deferred: their callbacks run synchronously during component setup, so a heavy module used in an effect body is a render-time dependency, not a deferrable one.

  Rule count 67, performance category 5. No breaking changes.

- [#611](https://github.com/pyreon/pyreon/pull/611) [`070a0ec`](https://github.com/pyreon/pyreon/commit/070a0ec687ad598cf15963e5615bb1d8c81933a3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - **Reactivity Lens (experimental)** — surface the compiler's already-computed reactivity analysis back to the author at the source.

  Pyreon's [#1](https://github.com/pyreon/pyreon/issues/1) silent footgun: whether code is reactive is invisible at the moment you write it. The compiler ALREADY decides this per-expression for codegen and discards the analysis. The Lens pipes it back.

  - `@pyreon/compiler`: additive opt-in `TransformOptions.reactivityLens` → `TransformResult.reactivityLens: ReactivitySpan[]` (emitted code byte-identical with it on/off; all existing compiler tests pass unchanged). New exports `analyzeReactivity()` / `formatReactivityLens()` + `ReactivityKind` / `ReactivitySpan` / `ReactivityFinding` types. `analyzeReactivity` merges the structural compiler facts with the existing `detectPyreonPatterns` footgun detectors under one taxonomy.
  - `@pyreon/lint`: the existing `--lsp` server gains an `inlayHintProvider` + `textDocument/inlayHint` handler rendering `live` / `static` / `live·prop` / `hoisted` ghost-text at each reactive/baked-once expression; footguns publish as `pyreon-lens` warning diagnostics. Adds a `@pyreon/compiler` dependency.

  JS-backend only (native Rust sidecar parity is a follow-up). The positive "this is live" claim is a faithful record of the codegen branch, not a heuristic — drift-gated + bisect-verified.

### Patch Changes

- [#638](https://github.com/pyreon/pyreon/pull/638) [`dcd2136`](https://github.com/pyreon/pyreon/commit/dcd21360cca7528cbfe87020428394a11aa30ea0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(cli): doc-claims gate covers lint-rule / lint-category / detector-code counts

  Extends the `doc-claims` gate (consumed by `pyreon doctor` AND
  `scripts/check-doc-claims.ts`) from 2 to 5 source-of-truth counters,
  7 → 19 claim sites:

  - **lint rule count** — the `allRules` array in
    `packages/tools/lint/src/rules/index.ts`. Claim sites: CLAUDE.md (×3),
    the package README, `docs/docs/lint.md`, `lint/src/manifest.ts` (6×).
  - **lint category count** — distinct `category:` literals across the
    rule files. Claim sites: CLAUDE.md (×2), README, manifest.
  - **detector-code count** — the `PyreonDiagnosticCode` union in
    `packages/core/compiler/src/pyreon-intercept.ts`. Claim sites:
    `.claude/rules/anti-patterns.md`, CLAUDE.md.

  New `ClaimSpec.all` flag asserts EVERY occurrence of a pattern in a file
  agrees (not just the first) — `manifest.ts` carries the rule count 6×;
  bumping 5 of 6 would otherwise pass silently.

  **Counters TEXT-PARSE in-repo source via `repoRoot`, never
  `import { allRules }`.** A dynamic import resolves via bun's module
  cache to a STALE published snapshot (observed: 0.18.0 cache → 66 rules
  while the working tree had 76); asserting against that is worse than no
  gate. Same `repoRoot`-relative approach the existing hook/doc-page
  counters already use.

  Fixes the live drift this gate immediately surfaced on `main`:
  `lint/src/manifest.ts` (`62`/`67`/`13` → `76`/`76`/`17` across 3
  occurrences) and `.claude/rules/anti-patterns.md` ("flags 12" → 15).
  The `@pyreon/lint` manifest correction regenerates `llms-full.txt` +
  the MCP `api-reference.ts` region (`bun run gen-docs`).

  Bisect-verified: stubbing `countLintRules → 0` fails the real-repo
  shape + 2 new specs; restored → all 27 cli gate tests pass. Gate green
  (19/19); `gen-docs --check`, lint manifest-snapshot, oxlint, cli +
  lint typecheck all clean.

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

- Updated dependencies [[`5fb461a`](https://github.com/pyreon/pyreon/commit/5fb461aaf9fcc8d2a624af1442f4db97fd7f33c9), [`5b69841`](https://github.com/pyreon/pyreon/commit/5b69841a6ab30963977e276d120c33d66682da23), [`e274fce`](https://github.com/pyreon/pyreon/commit/e274fceeb37d0893c7425463e443185388fce475), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`6472de0`](https://github.com/pyreon/pyreon/commit/6472de00ffdbcff1fd453c125c404b75fc5cc46d), [`0408e47`](https://github.com/pyreon/pyreon/commit/0408e475e63770996eff17bfb6ac318e89c45df4), [`7e0fe1a`](https://github.com/pyreon/pyreon/commit/7e0fe1a4f7cbb68f7647d85bef843de90d04d506), [`c5b2ea2`](https://github.com/pyreon/pyreon/commit/c5b2ea2fe0df3f52b2af21e0d79b1e391ca9fad5), [`6581f07`](https://github.com/pyreon/pyreon/commit/6581f073293a72360fe9391990d08316e0dc5b4b), [`070a0ec`](https://github.com/pyreon/pyreon/commit/070a0ec687ad598cf15963e5615bb1d8c81933a3)]:
  - @pyreon/compiler@0.19.0

## 0.18.0

## 0.17.0

## 0.16.0

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
