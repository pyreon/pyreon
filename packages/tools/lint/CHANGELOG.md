# @pyreon/lint

## 0.52.0

### Minor Changes

- New rule `pyreon/no-close-before-handler-teardown` (warn, client + shared (41df05a)
  files) — a socket's `close()` called before its handlers are detached.

  `close()` starts a handshake rather than ending the connection, so a buffered
  frame can still reach a handler that is still attached and write into a scope
  the teardown has already disposed. The rule locks the order that
  `@pyreon/query`'s `use-subscription.ts` was fixed to in this same release.

  Bisect-verified against the real defect rather than a fixture: run over the
  pre-fix file it reports both sites, and over the fixed file it reports none.
  That check is what caught the rule's first cut being **inert** — it matched
  only statements in the same block, while the shipped code guarded its close as
  `if (ws.readyState === WebSocket.OPEN) { ws.close() }` with the nulls after, so
  the rule found nothing at all in the one file it was written for. It now takes
  a `close()` from anywhere in an earlier statement's subtree, while still
  ignoring one inside a nested function (that body runs later, if ever) and
  declining to guess when the null assignments themselves are conditional.

- Closes every open finding from the lint audit, and adds the leak class nothing (ec0aff6)
  caught.

  **The 280 `querySelector(…) as HTMLX` casts are gone.** They were ratcheted
  because 92 files across 12 packages is not a safe hand-edit; a codemod with
  paren-balancing did it, and the conversion is verified rather than assumed —
  `query()` THROWS where a cast silently returned null, so a wrong conversion
  fails loudly. Typecheck clean across all 17 packages, node tests green, and
  **476 browser tests in real Chromium** covering the sites that only exist
  there. The doctor grade goes **F → A**, the ratchet drops **284 → 9**, and
  `no-query-selector-cast-in-test` is back at `error` rather than the `warn` it
  was demoted to in order to fire at all.

  **A ReDoS I introduced, caught by CodeQL.** `js/polynomial-redos`, high
  severity: `/(?:^|\/)routes\/(.+)$/` backtracks on paths with many `/routes/a`
  repetitions, and a linter is handed whatever paths its caller has. Replaced
  with linear string slicing — which also fixed a real misclassification, since
  the greedy regex anchored on the FIRST `/routes/` and mis-resolved nested
  paths. Both halves are pinned.

  **New rule — `pyreon/no-unguarded-async-signal-write`** (opt-in), for memory
  leak class F, which the catalog lists as caught by nothing. A slow earlier
  response resolves last and overwrites newer data: not a crash, not visible in
  a heap snapshot, just the wrong answer intermittently. Precision came from
  measuring — 42 findings became 9 after two narrowings the corpus taught:
  tests and benches cannot race with themselves, and `Map.set(key, value)` takes
  two arguments where a signal write takes one.

  It found two real bugs, both fixed: `<Mermaid>` and `<Math>` wrote their
  rendered output after an await with no cancellation, so unmounting mid-render
  kept the whole closure alive for a signal nothing reads.

  **Two rules stopped keying on what a thing is NAMED.** `no-mutate-store-state`
  fired only when a variable name contained "store" — renaming `cartStore` to
  `cart` disabled it silently. It now tracks the binding. `toast-a11y` exempted
  the literal spelling `Toaster`, so `import { Toaster as AppToast }` was
  reported for missing a11y it already has; the exemption follows the import.

  **`<Icon svg>` now states its contract.** It renders raw and cannot sanitize —
  the sanitized `innerHTML` prop needs a `DOMParser` and so cannot run during
  SSR, which an icon must. Rather than change that, the prop documents that it
  takes markup you control, and the new lint rule flags misuse in consumer code.

  **A bundle-budget failure now explains itself.** gzip differs between macOS and
  the ubuntu runner — measured ~177 B on a 16.5 KB package — so a budget with
  less headroom than that fails on CI while passing locally. The overage message
  now says when it is inside that band.

  Also fixes an untimed `fetch()` in `lathe pull` that could hang the CLI
  forever against a server that accepts and never answers.

  **The ratchet is now empty.** Every advisory finding is resolved rather than
  carried:

  - The five leak-class-F sites got real guards, and three were genuine
    concurrency bugs rather than style issues: `useWakeLock` and
    `useAudioRecorder` both checked their "already running" flag BEFORE the
    await, so two calls arriving during it each acquired a resource and orphaned
    the first — a wake lock held with nothing able to release it, a microphone
    stream left open. `useDeviceMotion` would attach its listener twice.
    `useClipboard` and atlas's source viewer could land a stale value.
  - `<CodeBlock>`'s line-number gutter no longer builds an HTML string at all. It
    was a workaround for a compiler bug that has since been fixed, so it was a
    raw sink in a component that never needed one; it renders real nodes now.
  - The three remaining sinks cannot be routed through the sanitized `innerHTML`
    prop, and that is verified rather than assumed: the allowlist deliberately
    excludes `foreignObject` and `<style>` (which mermaid emits for labels and
    theming) and does not cover MathML at all (which is all KaTeX emits), so
    sanitizing would strip working output. They are hardened at the library
    layer instead — `securityLevel: 'strict'` for mermaid, `trust: false` for
    KaTeX — and exempted with that reasoning recorded at each call site.

  The rule that found them also learned two things from being wrong: an in-flight
  promise shared between callers is a staleness guard just as much as a version
  counter, and a guard may live one scope out from the `async` function that
  writes.

- The general BE/FE/shared tiers are complete — 16 new rules, taking the linter (72edfc6)
  to 131. Every tier now matches the role-aware plan exactly: isomorphic 6,
  backend 7, web-perf 6, portable 6, js 3.

  **isomorphic** — `no-env-branch-in-render` (an environment branch deciding
  rendered OUTPUT rather than behaviour is a guaranteed mismatch) and
  `require-stable-iteration-order` (`Object.keys()` order is stable within one
  process and guarantees nothing between two — a data-dependent mismatch that
  fixtures never reproduce).

  **backend** — `no-unvalidated-request-body`, `no-await-in-loop-over-io`,
  `require-request-signal-forwarding`, `no-module-mutable-in-handler` (per-request
  state on a module binding is a data leak, not a race), `no-secret-in-shared-module`.

  **web-perf** — `no-layout-thrash`, `require-abort-on-unmount`,
  `require-img-loading-hint`, `no-blocking-third-party-script`.

  **portable** — `no-web-only-import-in-portable` (mirrors the compiler's
  generated web-only set), `prefer-canonical-primitive`,
  `require-native-compat-marker`, `no-css-in-js-in-portable`. All opt-in and all
  silent until `portablePaths` names the files that must travel.

  **js** — `no-catch-without-rethrow-or-report`, opt-in.

  Running them over this monorepo is what shaped three of them, and each
  correction is recorded in the rule's own docblock:

  - `no-await-in-loop-over-io` gated on `appliesTo: ['server']` alone reported 15
    findings, every one an SSG plugin, template engine or scanner. Server-role is
    not request-serving; it now needs a handler export or an api route, the line
    its siblings already drew. 15 → 0.
  - `no-secret-in-shared-module` reported `FORCE_COLOR` three times in
    `@pyreon/ansi` — a TTY capability check, not a credential. The benign list
    now earns entries by measurement.
  - `no-catch-without-rethrow-or-report` reported 411. A rule that cannot be
    driven to zero does not belong in a preset that gates CI, so it ships opt-in
    with the measured number in its docblock.

  `pyreon doctor --only lint --ci` reports **no findings** with all 131 live.

- Rule-set restructure: remove a duplicate rule that reported every defect twice, stop shipping this repo's own conventions to consumers, and make "why isn't this rule firing?" answerable. (c58917d)

  **A duplicate rule shipped.** `pyreon/no-large-for-without-by` and `pyreon/no-missing-for-by` had byte-identical implementations — same visitor, same condition, same message string — under different ids, categories and severities. Both fired, so one `<For>` without a `by` prop produced two diagnostics at the same span with the same text, one `warning` and one `error`, disagreeing about how bad it is. The `performance` copy is deleted; `no-missing-for-by` survives and is promoted `warn` → `error`, which is the severity the deleted rule carried — keeping `warn` would have silently weakened the gate. Verified zero violations across `packages/`, `examples/` and `docs/`.

  **Breaking (lint config):**

  - `pyreon/no-large-for-without-by` no longer exists — remove it from `.pyreonlintrc.json`. Not aliased, per the pre-1.0 no-shims policy.
  - `pyreon/no-missing-for-by` is now `error`.
  - `pyreon/no-querySelector-cast-in-test` → `pyreon/no-query-selector-cast-in-test` (camelCase inside a kebab id is malformed, not a style choice).
  - Six rules no longer ship on. See below.
  - Rule count 99 → 98; `performance` category 6 → 5.

  **Monorepo-scoped rules stop shipping to consumers.** Six rules encode the Pyreon _repository_ rather than Pyreon the framework, and all six were on — several at `error` — in the presets a consumer selects. The split is drawn by measurement: these are exactly the rules whose source hardcodes an `@pyreon/*` specifier or a `packages/<layer>/` path — `no-circular-import`, `no-cross-layer-import`, `no-error-without-prefix`, `no-query-selector-cast-in-test`, `require-browser-smoke-test`, `vitest-config-uses-shared`. `dev-guard-warnings` hardcodes neither and is a genuine library-author rule, so it stays. New `RuleMeta.scope: 'framework' | 'monorepo'`; every shipped preset forces monorepo rules off, `best-practices` included, and `lib` stops promoting four of them to `error`. The Pyreon repo re-enables them by id in its own config, which makes that dependency visible instead of hidden in a shared preset.

  **`pyreon-lint --why-off <rule>`.** A rule can be silently inert for four independent reasons, three of them invisible in config: `severity-off`, `opt-in`, `monorepo-scope`, `dependency-missing`. They compose, so a rule is often off for several at once and fixing one changes nothing. `--why-off` reports every reason that applies with the specific edit that lifts it, takes a bare or namespaced id, exits non-zero on an unknown rule with a did-you-mean, and surfaces configured `exemptPaths`. Exported programmatically as `explainRuleState` / `formatRuleState`. New `RuleMeta.requiresDependency` declares the dependency gate that previously lived only inside each rule body, with a test asserting the declaration matches the call the source makes.

  **AST walks no longer follow `parent`.** Six rules hand-rolled a recursive walk that descends into anything holding a `.type` — including a `parent` back-reference, which climbs back up the tree and recurses until the stack blows. New `walkSubtree` helper driven by oxc's exported `visitorKeys`; measured across 2,994,091 nodes of this repo it reaches every typed child link except `Program.hashbang`, which has no children, and a test pins that premise. Two stateless walkers migrate onto it; the two that thread state through the recursion keep their own walk and gain the `parent` exclusion, since restructuring them to fit a generic helper would risk changing what they detect.

  **A gate hole (`@pyreon/cli`).** `doc-claims` checked the rule count against CLAUDE.md, both READMEs, `docs/lint.md` and the manifest — but not `packages/tools/lint/package.json`, the published npm description and the first count a consumer sees. It had drifted to "56 rules" against an actual 98. That file and `.claude/rules/code-style.md` (stale at 97) are now covered; 33 claim sites, up from 30.

  **Rule groups.** Every rule now belongs to one of four groups — the axis the 19 categories don't capture, _what knowledge does this rule require and does it ship?_: `pyreon` (50), `pkg` (27, per-library and dependency-gated), `a11y` (15), `internal` (6, never on in a shipped preset). Categories live underneath, so a query rule is group `pkg`, category `query`. New `groups` config key sets a whole group in one line — `{ "groups": { "a11y": "off" } }` — applied after the preset and before per-rule entries, so an explicit rule always wins. `--list` groups its output the same way. `CATEGORY_GROUP` is a total `Record<RuleCategory, RuleGroup>`, so a new category fails to compile until classified. There is deliberately no `js`/`ts` group: this package has no general JS/TS rules and an empty group would advertise coverage that doesn't exist.

  **The fix engine had two defects.** Overlapping fixes were applied blind in reverse order, so two diagnostics touching the same range both got written and the later landed _inside_ the earlier one's replacement — `const x = window.innerWidth` could become `const x = globalThis`, matching neither intent. The first fix in source order now wins and overlapping ones are deferred, as ESLint does. And a fix could only carry ONE edit, so any fix needing an import insertion plus a call-site edit was inexpressible — a large part of why the fixable ratio was 11%.

  **Breaking (programmatic):** `Diagnostic.fix` is now `Fix | readonly Fix[]`. Normalize with the exported `fixEdits(d.fix)`; TypeScript flags every site that assumed one edit. A multi-edit fix is applied whole or not at all.

  **Two new autofixes.** `no-signal-call-write` fixes `count(5)` to `count.set(5)`, gated on exactly one non-function argument — `sig(prev => …)` reads as update intent and `.set(fn)` would store the function as the value. `prefer-isserver` rewrites `typeof window !== 'undefined'` to `isClient` _and_ adds the import as one fix, extending an existing `@pyreon/reactivity` import or inserting a statement, and refusing to fix through a namespace or type-only import where a specifier would not compile. `no-peek-in-tracked` deliberately gets no fixer: `.peek()` in a tracked scope is often intentional loop-prevention. Fixable ratio 11.2% to 13.3%.

  **Accessibility is on by default.** Twelve of fifteen a11y rules were `optIn` — `require-img-alt` among them, at `error` severity and still silent — so a fresh Pyreon app had no accessibility checking at all. Six are promoted, chosen empirically: running oxlint's jsx-a11y plugin at its `correctness` tier over a fixture carrying each defect fires exactly `alt-text`, `anchor-is-valid`, `no-autofocus`, `no-redundant-roles` and `tabindex-no-positive`. Those plus `primitive-media-needs-label` (the primitives analogue, dependency-gated so it stays silent elsewhere) are now on in every standard preset. Layout-shift, heuristic and zero-specific rules stay opt-in. Measured zero findings across `packages/`, `examples/` and `docs/` first.

  **Turning `no-redundant-role` on found a false positive in it.** It flagged `<a href={href} role="link">`, contradicting its own docstring — its helper was named `getStaticAttr` but matched the attribute by NAME and ignored the value. That matters because `applyProp` removes a nullish attribute: a dynamic href resolving to `undefined` renders no href, so the element has no implicit `link` role and the explicit one is meaningful. Split into `getAttr` and `getStaticStringAttr`. The bail-out spec for that branch had been passing vacuously, because the rule was off.

  **Parallel linting.** Runs above 200 files are split across a worker pool instead of walking one core. Config is resolved once on the main thread and shipped as data; results are re-sorted by path so CI diffs are stable; config diagnostics are deduped; small runs stay sequential; a worker that fails to start falls back rather than reporting a partial result. `lint()` stays synchronous for the LSP and watch mode — `lintAsync()` is the parallel driver, and a test locks that the two produce an identical diagnostic stream. **Breaking:** `runCli` is now async.

  Two micro-optimizations were measured and rejected rather than shipped: pre-filtering dependency-gated rules avoids 2.8% of `create()` calls, and a rule's unbounded backward character scan costs ~1% of a run. No speedup figure is quoted — the machine was under heavy load throughout, where timing measures the load.

  **`pyreon-lint --init`.** Adoption previously meant hand-writing `.pyreonlintrc.json` against documentation. `--init` picks the preset from the project (a package with an entry point gets `lib`, anything else `app`), points `$schema` at the installed schema so editors complete rule ids, and refuses to overwrite an existing config. The file it writes is deliberately minimal — scaffolding every rule at its current severity would freeze today's defaults into the user's file, so later improvements to `recommended` would never reach them.

  **Prevents recurrence.** `rule-registry.test.ts` lints a corpus with every rule enabled and fails if two rule ids ever emit an identical message at an identical span, so a future duplicate cannot land quietly. It also asserts id uniqueness, that no rule object is registered twice, strict kebab-case with no allowlist, that monorepo-scoped rules stay off in every shipped preset, and that ids matching an upstream ESLint name (`anchor-is-valid`, `no-autofocus`) are never renamed away from it.

- New rule `pyreon/no-line-comment-in-jsx` (error, in `recommended`). (4a38216)

  JSX has no line comments. A `// …` line in child position is JSXText, so it
  RENDERS — on web, and through PMTC as a native `Text` node on iOS and Android.
  Developer prose ends up in the running UI on every target with nothing said by
  any compiler.

  Found once for real: six explanatory lines above a `<Scroll>` in the
  native-tasks example put a paragraph about `kAXScrollToVisibleAction` at the top
  of the screen. A line-oriented grep over this repo returns 1,212 candidates,
  essentially all of them genuine comments inside `{}` expression containers — the
  shape is only visible with an AST.

  Gated to text sitting alongside element children, which is the mistake's shape.
  A displayed code sample (`<code>// like this</code>`) and anything under a
  code-ish tag are left alone. Zero findings across 1,216 `.tsx` files in this
  repo.

- New rule `pyreon/no-require-in-esm` (error) — `require()` in a package declared (bb2dc02)
  `"type": "module"`.

  There is no `require` in an ES module, so the call throws at runtime. What
  makes it worth a rule rather than a test is that **Bun defines `require` in
  ESM**, so a bun-run vitest suite executes the line and reports green while Node
  throws. The catalog records two shipped instances and concludes the lock has to
  be static; this is that lock.

  It found a third instance on its first run, inside `@pyreon/lint` itself. The
  LSP's project-root walk and the `require-browser-smoke-test` rule both read the
  filesystem through `require('node:fs')`, both inside `try/catch` — so under
  Node they did not crash, they silently returned the fallback. For the
  browser-smoke rule that fallback is an EMPTY package set, so the rule matched
  nothing at all and `browser-packages.json` was ignored. Measured on the built
  lib with identical input: **bun 1 diagnostic, node 0** — `npx pyreon-lint`
  enforced less than `bun` did, invisibly. Both are fixed here, and Node now
  agrees with Bun.

  The rule gates on the owning package's `type` field (`.cjs`/`.mjs` beat the
  manifest, and an unprovable file is left alone), and stays quiet on
  `typeof require` environment detection and on a locally bound `require`.

- Role-aware rule tiers — one config now covers server, client, isomorphic and (ec0aff6)
  multiplatform code, with no glob `overrides`.

  A general-purpose linter splits backend from frontend with hand-written globs
  the user keeps in sync. A framework does not have to guess: an fs-router API
  route, a `node:` import, an `island()` call and an entry file each PROVE where
  a file runs. `resolveFileRole()` reads them, strongest signal first, and
  defaults to `shared` — the strict answer, because an isomorphic file must
  satisfy both sides and guessing either one silently disables the other's rules.

  **This was already happening, badly.** Two rules classified server files with
  `filePath.includes('server')`, and `observer` contains `server` — so
  `use-intersection-observer.ts`, a client hook, was treated as a server file by
  both. Reproduced against `lintFile`, then fixed. A third rule re-implemented
  `isTestFile` inline, omitting `/__tests__/`.

  **Eleven new rules across five new groups** (113 rules, 25 categories,
  10 groups). Every one gated by the RUNNER via `appliesTo`, never by the rule —
  `exemptPaths` was opt-in per rule and 55 of 102 silently ignored it, and a role
  gate written rule-by-rule would repeat that exactly.

  - **`isomorphic`** — `no-locale-dependent-format`, `no-timezone-dependent-date`,
    `no-unstable-render-id`, `no-node-builtin-in-component`. Hydration mismatches
    that are correct in every unit test and wrong for some users in production.
  - **`backend`** — `no-sync-fs-in-request-path`, `no-floating-promise-in-handler`.
  - **`web-perf`** — `prefer-passive-listener`, `no-unbounded-raf-loop`.
  - **`portable`** — `no-out-of-subset-construct`, `no-platform-branch-without-fallback`.
    PMTC warns about these too, but only for files a native app's entry graph
    reaches; the catalog names that gap directly ("a feature no example uses is
    one no gate ever compiles"). These fire at authoring time instead.
  - **`js`** — `require-error-cause`.

  **Precision came from measurement, not taste.** Run unscoped against this repo
  the first cut produced **over 5,000 findings**; reading them produced five
  narrowings, and the final count is **11**:

  | finding              | cause                                                            | narrowing                                                |
  | -------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
  | 4,388 subset         | web-only internals are entitled to the whole language            | fires only where `portablePaths` says a file must travel |
  | 469 floating promise | a shared util is not a request handler                           | the file must EXPORT a handler                           |
  | 149 sync fs          | Vite plugins and the compiler are server-role, not request paths | same handler gate                                        |
  | 14 raf               | a one-shot frame is ordinary                                     | must schedule ITSELF                                     |
  | 1 raf                | a double-rAF terminates                                          | self-REFERENCE, not merely nested                        |
  | 11 locale            | benches print to a console                                       | `bench/` and `e2e/` are build role                       |
  | 2 timezone           | `new Date(y, m, d).getDate()` is timezone-independent arithmetic | only Dates representing an INSTANT                       |
  | 2 error-cause        | a custom error class has no options slot                         | built-in error constructors only                         |

  **Two real bugs found and fixed by the new rules.** The scaffolded dashboard
  template formatted money and dates with no locale in 14 places — every
  generated app shipped a hydration mismatch on its own front page. Fixed with a
  `lib/format.ts` that pins locale AND timezone, which is also the pattern users
  should copy. And five `throw new Error(msg)` sites inside `catch` now pass
  `{ cause }`, so the stack points at what actually broke.

  Also closes the review finding on `no-unsanitized-inner-html`: a dead
  assignment was a half-written hop loop, and finishing it fixed a real
  false positive — a sanitized value that had been renamed once
  (`const body = clean`) was flagged.

- Two new lint rules for validated upstream-shipped bug shapes (97 → 99 rules): (47ef812)

  - `pyreon/no-signal-read-in-attrs-callback` (styling, warn, dep-gated on `@pyreon/rocketstyle`): rocketstyle `.attrs()` callbacks run ONCE at setup, so a zero-arg call of a same-file signal/computed binding inside the callback captures a dead value that never updates (the ui-collapse-that-never-collapsed shape). Silent on `props.*`/`theme.*` reads, calls with args, the `.attrs({...})` object form, and handlers defined inside the callback; silent entirely in projects without `@pyreon/rocketstyle`.

  - `pyreon/no-guard-only-signal-reads-in-effect` (reactivity, info): flags an `effect()` whose EVERY reactive read (tracked signal call or `props.X` read) sits behind a conditional whose own test is provably non-reactive (`if (ref.current) { chart.setOption(props.option) }`, incl. the early-return spelling) — the first run can short-circuit before any read, so the effect subscribes to nothing and never re-runs. Zero-FP construction: any unconditional proven OR possible read (an unclassifiable zero-arg call like `chart.instance()`), a reactive guard test, both-branch reads, loop-body reads, nested-callback reads, and switch/catch shapes all suppress the report.

  `@pyreon/atlas`: the workbench preview's `dir`-applying effect now reads the `dir()` signal before the element guard — the previous shape subscribed only when the guard was truthy on the first run (it was in practice, since the effect is created after the element is captured, but the shape was fragile and is exactly what the new rule flags).

- New `security` rule group — script URLs and referrer leakage — on by default in every standard preset. (c041c1b)

  The gap was measured, not assumed: a fixture of eight defects a polished app must never ship was caught **1 of 8** by this linter. The security shapes were caught by nothing — the equivalent rules live in oxlint's `react` plugin, which `code-style.md` skips wholesale (correctly, for its re-render-perf rules, which are semantically wrong for a framework whose components run once) and which took three JSX-generic security rules down with it.

  **`pyreon/no-script-url`** (`error`) — `javascript:` / `vbscript:` in `href`, `src`, `action`, `formaction`, `poster`, `ping`. These execute in the page's origin rather than navigating. It normalizes the way a browser does before matching the scheme, so it catches what a naive `startsWith` misses: leading control characters, and embedded ones like `java\tscript:` — both live script URLs.

  **`pyreon/no-target-blank-without-rel`** (`warn`, autofixable) — `target="_blank"` on `a` / `area` / `form` without `rel="noreferrer"`. It still reports `rel="noopener"` alone: modern browsers imply `noopener`, so that half is largely historical, but nothing implies `noreferrer` and the referring URL can itself identify a user, document or tenant. The autofix only **adds** a missing `rel`; a partially-correct one is reported and left alone, because silently rewriting someone's `rel` is worse than a nag.

  Both read **static values only**. A dynamic `href={u}` or `rel={r}` may well be correct, and a rule that cannot prove otherwise stays quiet — a security rule with false positives is a security rule people switch off.

  **Behaviour change:** `pyreon/anchor-is-valid` no longer flags `javascript:` / `vbscript:` URLs; `no-script-url` owns them. It covers more attributes, catches the control-character bypasses, and frames the finding as the security issue it is. Reporting both emitted two diagnostics for one defect. `anchor-is-valid` still owns `""`, `"#"` and `data:`.

  Rule count 98 → 100; categories 19 → 20.

- Every rule now runs on this monorepo, and every rule is proven to fire. (ec0aff6)

  Three silent holes, each the same shape — a capability that worked for a
  hand-maintained subset, where being outside the subset was indistinguishable
  from being inside it.

  **Two rules could never fire.** `pyreon doctor`'s lint gate scans each
  package's shipped `src/**` minus tests, fixtures and `.d.ts`. Two rules'
  subject is exactly what that removes: `no-query-selector-cast-in-test` and
  `vitest-config-uses-shared`. Both were configured `error`; 2,159 test files
  and 115 vitest configs existed and **none were in scope**. A rule now declares
  its surface via `RuleMeta.scanTarget` (`'source'` | `'test'` |
  `'packageConfig'`) and the gate collects what the enabled rules need, each
  extra target as its own pass with every other rule off — running the full set
  over tests would reintroduce the fixture noise the exclusions exist to prevent.

  Turning them on found **280 `querySelector(…) as HTMLX` sites across 92
  files** — the exact class `no-query-selector-cast-in-test` exists to prevent,
  re-accumulated since PR #963 eliminated 122 of them. They are routed to the
  advisory ratchet at a seeded baseline of 280, which can only shrink. That is
  strictly more enforcement than the zero they had, and the burn-down is a
  follow-up.

  **`exemptPaths` was honoured per rule** — a rule had to call `isPathExempt`
  itself and **55 of 101 did not**, so an exemption configured for one of those
  parsed, validated, and did nothing. It is now applied centrally in the runner,
  before `rule.create()`, so it means the same thing for every rule by
  construction.

  Because it is now a runner-level option rather than a per-rule one, option
  validation recognises it on every rule — configuring it on a rule whose schema
  omits it used to warn `unknown option "exemptPaths"` about an exemption that
  demonstrably works. The 46 per-rule `isPathExempt` bails are deleted: the
  central skip runs before `rule.create()`, so they were unreachable.

  **A config key naming nothing was silently ignored.** This repo shipped
  `pyreon/dangerously-set-inner-html` — with an `exemptPaths` list — for a rule
  that has never existed. Unknown `rules` / `groups` keys are now config
  diagnostics with a did-you-mean.

  **Verification:** a new fires-invariant asserts all 101 rules produce their
  diagnostic on a defect fixture and stay silent on the corrected one, with only
  that rule enabled, and asserts the fixture map is total over the registry.
  Building it found 13 fixtures wrong and **zero broken rules** — and it then caught the new rule below before it had a fixture, which is the case it exists for.

  **New rule — `pyreon/no-unsanitized-inner-html`** (opt-in, `warn`). Pyreon
  assigns `dangerouslySetInnerHTML`'s `__html` **raw** by design — React parity,
  the developer owns sanitization, and unlike the sibling `innerHTML` prop no
  sanitizer applies. That is the most direct XSS vector a Pyreon app has, and it
  was caught by nothing. The gap was recorded but not closed: the ghost config
  entry above was `pyreon/dangerously-set-inner-html`, complete with an exemption
  for the one file that legitimately uses it.

  It stays quiet on everything it cannot prove — a string literal, a
  substitution-free template literal, a sanitizer call, and one hop through a
  same-file `const`, so the idiomatic `const clean = DOMPurify.sanitize(dirty)`
  is recognised. Opt-in because it is a judgement call about a prop that is
  legitimately used with your own sanitizer.

  It found **4 raw sinks** in this repo, ratcheted alongside the others. One is
  worth a look on its own: `<Icon svg={…}>` renders caller-supplied markup raw,
  so an app passing untrusted SVG through it has an XSS hole. The other three
  are library output (mermaid, katex) and an `aria-hidden` gutter built from
  line numbers.

  **Also fixed:** the code editor's gutter line numbers failed WCAG AA — 2.45:1
  (light) and 2.63:1 (dark) against a 4.5:1 requirement. Now 4.55:1 and 4.75:1,
  one palette step each.

  The repo's config runs all 101 rules: non-opt-in at `error`, opt-in at
  advisory severity so the ratchet locks them at zero. Four rules stay off with
  stated reasons — `no-ternary-conditional` and `no-and-conditional` are style
  preferences whose own docstrings say they are not correctness rules, and
  gating CI on them would fail correct code.

- Shared `settings` in the lint config, and the four portable rules a scaffolded multiplatform app was never actually running. (72edfc6)

  `portablePaths` is a property of the project, not of one rule — it names the directories whose source has to survive three targets, and **five** rules need that same answer. Repeating it per rule made a config a hand-maintained copy of the rule registry, and the multiplatform scaffolder listed exactly one: `no-out-of-subset-construct` fired, while `no-web-only-import-in-portable`, `prefer-canonical-primitive`, `require-native-compat-marker` and `no-css-in-js-in-portable` were silently inert in every scaffolded app.

  `{ "settings": { "portablePaths": ["src/"] } }` says it once. A key is seeded into a rule's options only when that rule DECLARES it in `meta.schema`, so a shared key can never reach a rule that would reject it as unknown; per-rule options still win. A `settings` key no rule declares is reported as a config error, since a typo there would otherwise be as silent as a typo'd rule id.

  Two fixes fell out of the fixture that proves it:

  - `prefer-canonical-primitive` fired on DOM tags inside a `<Web>` branch — the exact shape its own message recommends as the fix. It now tracks `<Web>` by depth, so leaving the subtree re-arms the rule rather than one escape hatch silencing a whole file.
  - `no-out-of-subset-construct` read `portablePaths` through its own copy of the parsing logic; all five rules now share one helper, so they cannot drift on what the key means.

### Patch Changes

- Update third-party dependencies to their latest compatible releases, (ea669a1)
  extending #3174's sweep to every package.json the first pass hadn't reached
  (that pass touched only the root manifest, so nothing there tripped the
  Changeset gate — this one edits per-package manifests directly and does).

  Runtime dependencies that reach consumers: `oxc-parser`/`oxc-transform`
  0.147 → 0.148 (`@pyreon/compiler`, `@pyreon/native-compiler`, `@pyreon/lint`
  — `@oxc-project/types` alongside it), `magic-string` 1.2.2 → 1.2.3
  (`@pyreon/compiler`), the CodeMirror 6 family — `@codemirror/search` and
  `@codemirror/state` 6.7.1 → 6.7.2, `@codemirror/legacy-modes` 6.5.3 → 6.5.4
  (`@pyreon/code`), TipTap 3.30.3 → 3.31.2 (`@pyreon/rich-text`), TanStack Query
  5.102.2 → 5.102.8 across `@tanstack/query-core` and its persist/devtools
  companions (`@pyreon/query`, and the shared root override so `@pyreon/http`
  agrees), `@tanstack/table-core` 9.1.2 → 9.2.4 (`@pyreon/table`), the
  pragmatic-drag-and-drop family (`@pyreon/dnd`) — core 3.0.0 → 3.1.0,
  auto-scroll 3.1.0 → 3.2.0, hitbox 2.1.0 → 2.2.0, all in-range within the
  v3 major this repo already adopted.

  Dev-only comparison/tooling bumps across the touched packages: `rolldown`,
  `react-hook-form`, `hotkeys-js`, `axios`, `ky`, `i18next`, `xstate`, `joi`,
  `typia`, `nuqs`, `@tanstack/react-virtual`, `@tanstack/react-table`,
  `@tanstack/react-query`, `motion`, and `mobx-state-tree` 7.4.0 → 8.0.0 — a
  real major, but its own peer range for `mobx` moved `^6.3.0` → `^7.0.0`,
  which matches what this repo already declares (`^7.0.3`); the OLD pin was
  the one silently out of range.

  `happy-dom` deduped to ONE resolved version repo-wide — three stale copies
  (20.11.6/20.12.0/20.13.2) were co-installed before this pass across the ~17
  packages that each pin it independently. The unification target is
  **20.11.6, not the newest 20.13.2** — bumping past 20.11.6 breaks
  `@pyreon/styler`'s `memory-growth.test.ts` deterministically (5/5 local
  runs, plus a CI failure on `test (fundamentals+ui-system+zero)`), a pure
  `environment: 'happy-dom'` test whose eviction-cycle counting depends on
  CSSOM/`cssRules` behavior that changed somewhere between those versions —
  confirmed by isolating the version with an exact pin, not by assumption; 3/3
  clean at 20.11.6, 5/5 failing at 20.13.2. Verified pre-existing on `main`
  (3/3 passes there, at 20.11.6) so this is the same "routine bump, unvetted
  runtime behavior change" shape as the `@tanstack/virtual-core` finding
  below, just caught before push instead of by CI. The one other consumer
  pinning past 20.11.6 — `@happy-dom/global-registrator` in
  `examples/benchmark`, whose own 20.13.2 release requires `happy-dom
^20.13.2` as a peer — is reverted to `^20.11.6` alongside it, so the whole
  graph resolves to one version again.

  `examples/benchmark`'s framework competitors were refreshed too so the
  "fastest framework" comparisons stay honest against current releases: Vue +
  `@vue/server-renderer` + `@vue/compiler-dom` 3.5.41 → 3.5.42, Svelte 5.56.10
  → 5.57.0, and Octane 0.1.46 → 0.2.2 (its peer `@octanejs/vite-plugin`
  0.1.46 → 0.1.52 alongside it) — a real minor jump, verified with a clean
  production build before committing to it. Octane 0.2.2 replaces the
  `forBlock` fast-path flag the row-list bench's own doc comment describes
  un-handicapping with a new `fastKeyedForBlock` path; the bench impl still
  reaches it (confirmed by compiling `octane.tsrx` through `octane/compiler`
  0.2.2 and reading the emitted flags), so the comparison stays fair, but
  every previously-published Pyreon-vs-Octane number in
  `.claude/skills/pyreon-benchmarks/SKILL.md` was measured against 0.1.46 and
  needs re-verification against 0.2.2 before being cited again — flagged
  there, not restated as fact here.

  Held deliberately, each for a stated reason found by actually reading the
  dependency rather than assuming: TypeScript stays capped `<7.0.0` (removes
  the classic Compiler API `@pyreon/compiler`/`@pyreon/mcp`/`@pyreon/cli` are
  built on). `vitest`/`@vitest/browser`/`@vitest/browser-playwright`/
  `@vitest/coverage-v8` stay on 4.1.11 as one locked unit (5.0.0 just went GA
  and changes `clearMocks` to default `true`, tightens `coverage.include`/
  `exclude` matching, and removes several import entrypoints — exactly the
  class of change this repo's `Coverage (Full)` gate has already rotted on
  three times; a real migration, not a version bump). `@changesets/cli`
  2.31.1 → 3.0.1 and `@changesets/changelog-github` 0.7.0 → 1.0.0 stay put:
  1.0.0 ships `"type": "module"` with no CJS export, and this repo's own
  `.changeset/resilient-changelog.cjs` does `require('@changesets/changelog-
github')` — bumping it would break `changeset version` at release time with
  `ERR_REQUIRE_ESM`, verified by reading the published package's `exports`
  map, not assumed. The root `uuid` override stays at `11.1.1` for the same
  reason, one level removed: it force-pins a transitive dep of `exceljs`
  (`^8.3.0`, itself already outside its own declared range on purpose), and
  `uuid` 12.0.0 dropped CommonJS support entirely — `exceljs`'s own bundled
  code does `require('uuid')`, verified directly in its installed `dist/`, so
  the same ESM-only trap applies one hop further down the graph.

  One more found by actually running the browser test tier, not just typecheck
  and the node/happy-dom suite: `@tanstack/virtual-core` was bumped 3.17.4 →
  3.17.8 in this branch's first pass (a routine-looking override edit, not
  vetted as carefully as the deps above), and it broke
  `@pyreon/virtual`'s real-Chromium `repositions a STAYING row below when row 0
is remeasured taller` test deterministically (3/3 local runs, plus 3/3 CI
  retries) — bisected down to virtual-core's own 3.17.7 "synchronous
  notification for scroll compensation" change, not to anything else in this
  branch (ruled out `@tanstack/react-virtual`, unrelated — not imported by this
  code path at all; ruled out the `oxc-parser`/`magic-string`/`rolldown`
  bumps too, by reverting each in isolation and rebuilding). Reverted back to
  3.17.4, matching what's currently on `main`, and NOT bumped further.

  This surfaced something that predates this PR: `@pyreon/virtual`'s own
  `package.json` has declared `@tanstack/virtual-core: "^3.17.7"` since an
  earlier fix (commit 973c4e323, "the root overrides pinned
  @tanstack/virtual-core to 3.17.4 while three packages declared ^3.17.7, so
  the installed version did not satisfy its own consumers' declared range")
  — but the root override was only ever bumped to 3.17.4 there, not to
  3.17.7+, so the exact mismatch that fix describes is still live on `main`
  today: the declared floor and the resolved version disagree, silently,
  because the currently-resolved 3.17.4 happens to still pass. Bumping the
  override to actually satisfy the package's own declared range (3.17.7,
  confirmed — not just 3.17.8) is what surfaces the real compatibility break
  in `use-virtualizer.ts`'s remeasurement handling. Left as-is here rather
  than fixed, because closing it needs either updating the wrapper for
  virtual-core's new synchronous-notification timing or re-adjudicating the
  test's assumptions against it — real source-level work, not a version
  bump. Tracked as a known gap, not silently left broken: someone picking
  this up should treat `bun run test:browser` in `@pyreon/virtual` as the
  regression gate, not just `bun run test`, which does not exercise this
  path at all (confirmed: the full node/happy-dom suite passes 1805/1805
  regardless of which virtual-core version is resolved).

- Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration). (1d74edc)
- `pyreon/no-error-without-prefix` now accepts the scoped `[Pyreon <scope>]` form. (02cae6a)

  The rule recognised `[Pyreon]` and `[@pyreon/<pkg>]` but not `[Pyreon Router]` /
  `[Pyreon ISR]` / `[Pyreon manifest]` — the same convention with a space instead of a
  slash, which this repo uses deliberately. Those messages already satisfy the rule's
  stated purpose exactly (identified AND package-named), so requiring the literal token
  would have forced `[Pyreon] [Pyreon Router] …`, which is worse for the reader than
  what it replaces.

  Every remaining finding of this rule in the repo was one of those false positives.

- Two gaps found by probing the rules that every shipped preset turns OFF. (ad918cd)

  `rule-fires.test.ts` asserts totality — every rule has a fires fixture and a quiet counterpart — and 39 rules were still unverified against reality, because opt-in, monorepo-scoped and dependency-gated rules never run under `recommended`. Force-enabling all 39 over 5,386 real files, then building a positive control for each of the 12 that stayed silent, found two:

  - **`prefer-canonical-primitive` read JSX only.** Pyreon has two spellings for a DOM element, and `@pyreon/primitives`' own web implementations are written entirely in `h('div', …)` — so the rule reported nothing on files made of nothing but DOM elements. It now covers the `h()` form, gated on `h` being imported from `@pyreon/core`/`@pyreon/runtime-dom` so somebody else's `h` is never flagged, and on a string first argument so `h(Component)` stays a component.
  - **`no-circular-import` enforced `packages/core/` only.** The layer order it owns also exists in `packages/ui-system/` — the tree where a real `ui-core` ↔ `unistyle` cycle happened and was fixed by the theme-engine registration seam, guarded since by nothing but that fix's own tests. The two orders are INDEPENDENT stacks, compared only within a file's own tree, so a ui-system package importing a core one stays correct.

  `connector-document` and `document-primitives` are deliberately unranked: they are not in the documented chain, and ranking them by eye produced 41 findings in a tree with no real violation. An unranked package is ignored — a guessed rank is worse than no rank.

  The other ten silent rules are healthy; the repo simply contains none of their defects. Verifying that took care: a dependency-gated rule probed at a synthetic path measures the gate rather than the rule, and `no-circular-import` is a layer-order rule despite its name, so the obvious probe reported a working rule as dead.

- Three detector/rule precision fixes, each found by running the analyzers against (02cae6a)
  the framework itself and reading what they flagged.

  - `static-return-null-conditional` had NO signal gate, unlike its documented
    sibling `static-early-return-conditional`. It fired on every top-level
    `if (cond) return null`, including `if (typeof document === 'undefined')` —
    an SSR guard that can never re-evaluate — and told the author to wrap it in a
    reactive accessor. Now gated on a tracked binding in the condition, matching
    the sibling and the message's own claim.
  - `pyreon/no-unbatched-updates` counted any `.set()` as a signal write. A signal
    write is single-argument; `map.set(k, v)`, `headers.set(k, v)` and
    `params.set(k, v)` are not. Server middleware calling `ctx.headers.set(...)`
    five times was reported as unbatched signal updates in code containing no
    signals. Arity now rules those out, which also generalises past the existing
    receiver-name tracking (that only caught locals bound to `new Map()`).
  - `native-audit`'s `WEB_ONLY_PACKAGES` had gone stale: elements / styler /
    rocketstyle / coolgrid gained native frontends and declare
    `multiplatform: { tier: 'shared' }`, and the native compiler carries
    `emit-rocketstyle.ts` / `parse-rocketstyle.ts` / `attrs-native.ts` for them —
    but they stayed listed, so the tri-target examples that exist to PROVE
    ui-system on native were reported as native-build hazards. A new drift test
    asserts the list mirrors the manifest tiers, because a hand-maintained mirror
    without one is a convention rather than a guard.

  Also widens `pyreon/no-error-without-prefix` to accept the scoped
  `[Pyreon <scope>]` form (`[Pyreon Router]`, `[Pyreon ISR]`), which the rule's own
  comment already says is acceptable.

- Dedicated specs for the general BE/FE/shared rule tiers, which had shipped (41df05a)
  with only fires-invariant fixtures.

  The fires-invariant proves a rule CAN fire and stays silent on a clean
  counterpart. It says nothing about the branches in between, and the general
  tiers were the least-covered code in the package as a result —
  `no-locale-dependent-format` at 45% branches, `no-out-of-subset-construct` at
  47%, `require-error-cause` at 57%. Five new files (`isomorphic-`, `backend-`,
  `portable-`, `js-`, `web-perf-rules.test.ts`) close that, and the negative
  cases are written as deliberately as the positive ones: these rules run on
  `shared` files, which is most of an app, so a false positive is expensive.

  Writing them surfaced three things the fixtures could not:

  - **Dead code in `no-locale-dependent-format`.** Its `CallExpression` handler
    carried a `node.type === 'NewExpression'` branch that the walker never
    dispatches there, shadowed by a live `NewExpression` visitor below. Removing
    it leaves every spec green, which is what proves it was unreachable.
  - **A false positive in `require-error-cause`.** `AggregateError` is in its
    builtin set, and its only idiomatic form is `new AggregateError([err], msg)`
    — but the positional check looked for a bare identifier and not inside an
    array, so it flagged the correct use of a constructor it claims to support.
  - Two of my own assertions were wrong about the rules rather than the reverse:
    a file importing `node:fs` is `server` by PROOF wherever it sits, and an
    explicit `{ passive: false }` is a stated decision the rule deliberately
    respects. Both are now pinned as specs so the contracts are documented.

  Package coverage moves 95.01/88.47 to 95.70/90.07 (statements/branches). The
  branch threshold was configured at 90 and had been unmet — `bun run test
--coverage` exited 1 before this change and exits 0 after.

- The manifest's rule-METADATA claims are now gated, not just its counts. (437d110)

  `registry-drift.test.ts` already locked the group list and the per-group
  counts. It did not cover the quieter half: prose that names specific rules and
  asserts something about their `meta`. Two such claims exist, both accurate
  today and both with nothing keeping them that way:

  - `(auto-fixable)` on a named rule. A wrong one sends someone to run `--fix`
    and wonder why nothing changed — and it renders verbatim into the docs site
    and the MCP api-reference, so the claim travels further than the manifest.
  - The enumerated list of `meta.scope: 'monorepo'` rules. That list tells a
    consumer which rules EVERY shipped preset forces off. A rule missing from it
    reads as shippable when it is not; a rule still listed after losing the
    marker reads as forced-off when it is live in someone's project. Checked in
    both directions.

  Same hand-maintained-list class as the schema group list and the per-group
  counts before it — the third and fourth claims in this file to get a lock.
  Bisect-verified by injecting a false auto-fixable claim and a phantom
  monorepo rule; each fails exactly its own spec.

- The config schema now lists every rule group, and both it and the manifest's (bb2dc02)
  per-group counts are gated against the registry.

  Two hand-maintained surfaces had rotted, neither checked by anything:

  - `schema/pyreonlintrc.schema.json` knew FOUR of the ten groups, with
    `additionalProperties: false`. So `groups: { portable: 'warn' }` — the line
    that enables the native tier for a multiplatform app — validated as an
    invalid key in every editor while working perfectly at runtime. That is the
    worse direction for a schema to be wrong in: the config is correct and the
    tool says it is not, which teaches people to delete working configuration.
  - `manifest.ts` claimed the `pyreon` group held 51 rules against an actual 52,
    and had done before this session's work. Those counts render verbatim into
    the docs site, `llms.txt` and the MCP api-reference, so the number an AI
    assistant reads back was simply wrong.

  `check-doc-claims` locks the TOTAL rule count; nothing locked the split or the
  schema. `registry-drift.test.ts` now does both, in BOTH directions — a count
  that drifted and a group the manifest still names after the registry dropped
  it — and is bisect-verified five ways. Its own first draft matched every group except `a11y`, because
  `[a-z-]` cannot match a name with digits in it — a hole shaped exactly like the
  ones the file exists to catch, which is why the widened class is commented.

- `pyreon/no-bare-signal-in-jsx` no longer fires on a call that passes arguments. (c467178)

  A signal read is zero-arg by construction (`sig()`), so `{formatDefault(value)}` can
  never be the shape this rule is about. It previously flagged such calls and then told
  the reader, in the finding itself, that a non-signal pure function should be ignored —
  a finding that asks to be disregarded is worse than none, because it teaches people to
  skim past the whole rule's output.

  This removes the false-positive class rather than any single instance. The rule's
  behaviour on genuine zero-arg signal reads is unchanged.

- Update third-party dependencies to their latest compatible releases. (5867cca)

  Runtime dependencies that reach consumers: `oxc-parser` / `oxc-transform`
  0.144 → 0.147 (`@pyreon/compiler`, `@pyreon/native-compiler`), the CodeMirror 6
  family (`@pyreon/code`), TipTap 3.29 → 3.30 (`@pyreon/rich-text`), TanStack
  Query 5.101 → 5.102 (`@pyreon/query`), the
  pragmatic-drag-and-drop auto-scroll/hitbox companions (`@pyreon/dnd`),
  `y-protocols` (`@pyreon/sync`), `oxlint` 1.78 → 1.80 (`@pyreon/lint`), and the
  shiki / remark / unist chain (`@pyreon/zero-content`).

  No API surface changes. Held deliberately, each for a stated reason: TypeScript
  stays capped `<7.0.0` (TS7 removed the classic Compiler API), and
  `@changesets/cli` v3, `@atlaskit/pragmatic-drag-and-drop` v3, and `ky` v2 are
  majors that need their own PRs.

- Three reactivity/correctness fixes found by running `pyreon doctor` against the (02cae6a)
  framework itself, plus the rule-option support that made the remaining reports
  resolvable.

  - **`useChart` published a torn frame.** `instance.set(chart)`, `loading.set(false)`
    and `error.set(null)` ran unbatched, so a subscriber reading two of them saw
    the chart instance published while `loading` was still `true` — the "chart is
    ready but still showing a spinner" flicker. Batched into one notify cycle; the
    batch flushes before `onInit`, so the documented "fully configured before
    `onInit` fires" invariant is unchanged.

  - **Flow's `handlePointerUp` fired one notify cycle per selected node.** Its
    three branches (rubber-band / drag-end / connection-drop) are sequential and
    can co-occur, and the rubber-band branch calls `clearSelection()` plus
    `selectNode()` once per hit node — so a band over 100 nodes fired 100+ cycles
    and re-rendered the canvas each time. One pointerup is now one transition.

  - **`createActorId`'s fallback could collide.** The doc comment states two live
    peers must not share an id, but the non-`crypto.randomUUID` path was
    `Date.now()` + `Math.random()`, which repeats within a millisecond and is a
    birthday risk besides. It now prefers `crypto.getRandomValues` (far more widely
    available than `randomUUID`, which requires a secure context) and its last
    resort mixes in a per-process monotonic counter, so two ids from one process
    can never collide by construction and the random field only has to separate
    processes.

  - **`exemptPaths` on six rules that documented the convention but never read it.**
    `toast-a11y`, `no-href-navigation`, `no-inline-style-object`,
    `prefer-use-is-active`, `no-effect-in-mount` and `prefer-field-array` all
    inspect a call site, so the file that _implements_ the thing being recommended
    reports against itself — `link.tsx` renders the `<a href>` that `<Link>`
    wraps, and the toast row computes `role` from severity in its definition
    rather than at the `<ToastItem>` call site. Resolving that in-rule needs the
    parent chain, which oxc's visitor does not provide, so these now honour the
    documented `exemptPaths` option instead. Each still fires normally everywhere
    else.

- Updated dependencies:
  - @pyreon/compiler@0.52.0
  - @pyreon/sized-map@0.52.0

## 0.51.0

### Minor Changes

- New `@pyreon/http` package — the transport layer beneath `@pyreon/query`. (663ac5a)

  It owns how a request is made (URL building, path params, query encoding, headers, body, cancellation, typed errors, optional response validation) and deliberately owns no cache, no dedup-by-key and no reactive container, because `@pyreon/query`, `useFetch` and `createResource` already do. That split mirrors the one the native runtime already made, where `PyreonFetch` is the reactive result container and `PyreonHttp` the request/response layer beneath it.

  The core has zero dependencies. Each capability lives behind its own entry so an unused one costs nothing: `@pyreon/http/middleware` (`retry`, `dedupe`, `bearer`, `refresh`, `logger`, `forwardHeaders`), `@pyreon/http/schema` (Standard Schema validation), `@pyreon/http/query` (TanStack adapters), `@pyreon/http/mock` (network-free mocking) and `@pyreon/http/server` (per-request SSR context, the only `node:async_hooks` import).

  Middleware is onion-shaped — `(request, next) => response` — because that is the only form in which retry, auth-refresh and short-circuiting are ordinary middleware; an axios-style interceptor pair cannot re-enter the chain. Clients are immutable: `extend()` returns a new instance, so no mutable shared default can leak across concurrent SSR requests. Response validation is three tiers, and only the third costs a dependency: an unchecked cast, any `(raw: unknown) => T` parse function, or any Standard Schema (zod, valibot, arktype, `@pyreon/validate`'s `s`, and `@pyreon/validation`'s typed adapters). `endpoint('GET /users/:id', { response })` derives the callable, a stable cache key and the response type from one declaration, so `queryKey` and URL cannot drift; `.query()` forwards TanStack's `AbortSignal`.

  Defaults are chosen against real failure modes: a 30s timeout is ON because `fetch` has none and a hung request otherwise never settles, while retry is OFF because it compounds with query's own retry into nine requests per logical query.

  `@pyreon/lint` gains three opt-in, dependency-gated rules and a new `http` category: `pyreon/query-fn-must-forward-signal` (a `queryFn` that performs a request but drops the `AbortSignal`, which silently disables cancellation), `pyreon/no-unencoded-path-interpolation` (interpolating into a path skips URL encoding, so a value containing `/` escapes its segment) and `pyreon/no-untimed-raw-fetch` (a raw `fetch` with no signal has no deadline).

### Patch Changes

- `@pyreon/feature` now forwards TanStack's `AbortSignal`, so query cancellation works. (331c206)

  Every read hook (`useList`, `useById`, `useSearch`) called its REST layer as `queryFn: () => http.getById(api, id)`. That signature took no `AbortSignal`, so the per-fetch signal TanStack aborts on unmount, on supersede and on `cancelQueries` never reached the network — cancellation has been silently dead for every feature-driven query since the package shipped. An unmounted component kept fetching, and a rapidly-retyped search fired one request per keystroke, all of which ran to completion and raced each other into the cache, so the last response to arrive won rather than the newest.

  The REST layer now runs on `@pyreon/http` and threads `{ signal }` through all three hooks. Two further defects go with it: path parameters are URL-encoded, so an id containing `/` can no longer escape its segment (`1/../admin` reaching `/admin`), and requests get a 30s deadline where raw `fetch` had none.

  The thrown error shape is deliberately unchanged — `message` from the response body when present, else `<METHOD> <url> failed: <status>`, plus `status`, plus `errors` only when the body carries them. Migrating the transport must not silently re-shape what consumers catch, so the client runs with `throwHttpErrors: false` and the original extraction is preserved verbatim. `config.fetcher` remains a plain `typeof fetch`.

  `pyreon/query-fn-must-forward-signal` also gains a false-positive fix: it scanned only the function body, so a correct `queryFn: ({ signal: abortSignal }) => …` — where `signal` appears only in the parameter pattern — was reported as a violation. It now scans parameters too.

- `pyreon/no-eager-import` no longer flags TYPE-ONLY imports of heavy packages. A `import type { EditorInstance } from '@pyreon/code'` is erased before any bundler sees it, so it cannot add initial-bundle weight — and it is precisely how a correctly lazy consumer types the package it `await import()`s, so flagging it steered authors away from the pattern the rule exists to encourage. Covers both `import type {…}` and declarations whose every specifier is inline-`type`; a value import carrying an inline type still reports. Same guard the sibling `no-heavy-import-only-in-handler` already applied. (77eaf81)
- Every package manifest now declares its MULTIPLATFORM story as data: (4e53471)
  `multiplatform: { tier: 'shared' | 'service-backend' | 'web-only', rationale }`
  (a discriminated union — `web-only` REQUIRES the rationale sentence). The
  assignments transcribe the classification the multiplatform docs and the PMTC
  compiler's own `WEB_ONLY_PACKAGES` registry already maintain, and the new
  `check-multiplatform-tier` gate (validate-fast family) holds the contract:
  a manifest without a tier, a published package with neither manifest nor
  explicit exemption, a `web-only` without a rationale, or a stale generated
  tier table all fail CI — so a new package can never again silently default
  to web-only while the ecosystem advertises "one codebase, three targets".

  No runtime change in any package: manifests are docs-pipeline inputs and are
  stripped from published tarballs; every generated surface (llms, MCP
  api-reference, reference pages) is byte-identical.

- Bump `oxc-parser` to `^0.142.0` (from `^0.140.0`). (9415d31)

  The parser sits under the JS compiler backend, so an AST-shape change would surface as a JS/Rust divergence rather than a crash. Verified where that would show: `@pyreon/compiler` 1961 tests passing — including `native-equivalence` (the byte-identical oracle) and the 300-seed × 3-mode differential fuzz — plus `@pyreon/lint` 1150 and `@pyreon/native-compiler` 2311.

  No API or behavior change; this is a dependency-range bump only.

- Updated dependencies:
  - @pyreon/compiler@0.51.0
  - @pyreon/sized-map@0.51.0

## 0.50.0

### Patch Changes

- Updated dependencies [[`6029da4`](https://github.com/pyreon/pyreon/commit/6029da41bae4a4f52140cba939d778e079c89fee), [`659c30f`](https://github.com/pyreon/pyreon/commit/659c30f8f41514b47b4c83ce185de43f717fd2d7)]:
  - @pyreon/compiler@0.50.0
  - @pyreon/sized-map@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies [[`db6319e`](https://github.com/pyreon/pyreon/commit/db6319edb0fc993b6319ece9b8f258b9da5e7a4d)]:
  - @pyreon/compiler@0.49.0
  - @pyreon/sized-map@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [[`9b3fda4`](https://github.com/pyreon/pyreon/commit/9b3fda40b3c1e107475d3f15020f8ac73ba5977d), [`39053fe`](https://github.com/pyreon/pyreon/commit/39053fefcc3a3bf1ead1e98f9c138dbde4248789), [`bf97dfa`](https://github.com/pyreon/pyreon/commit/bf97dfa0f6f0f7f341625a4a4d14bf100e869163)]:
  - @pyreon/compiler@0.48.0
  - @pyreon/sized-map@0.48.0

## 0.47.0

### Patch Changes

- [#2335](https://github.com/pyreon/pyreon/pull/2335) [`a5163c8`](https://github.com/pyreon/pyreon/commit/a5163c8f2cedd56fe37a4fce0b1f87fe7f4061ec) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update parser/editor runtime dependencies: oxc-parser + @oxc-project/types 0.138.0 → 0.140.0 (compiler dual-backend equivalence + differential fuzz green), @codemirror/state 6.6.0 → 6.7.1 / @codemirror/view 6.43.0 → 6.43.6 / @codemirror/lang-markdown 6.5.1 (tree-wide coherence overrides bumped in lockstep; real-Chromium editor suite green). No API changes.

- Updated dependencies [[`a5163c8`](https://github.com/pyreon/pyreon/commit/a5163c8f2cedd56fe37a4fce0b1f87fe7f4061ec)]:
  - @pyreon/compiler@0.47.0
  - @pyreon/sized-map@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [[`7d88cbb`](https://github.com/pyreon/pyreon/commit/7d88cbb45f95d90085c67d4c24d2b0c96a4dabdf), [`8f0912c`](https://github.com/pyreon/pyreon/commit/8f0912c3a36055aa625d582777850c0c3ecfbc04), [`4ec01d8`](https://github.com/pyreon/pyreon/commit/4ec01d8b5cd9a95b04a01deb5ac2a26605dc1974), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435), [`1d73037`](https://github.com/pyreon/pyreon/commit/1d730373c9adcbeef3a6575e7af199f27e69c7bd), [`853c9b6`](https://github.com/pyreon/pyreon/commit/853c9b615459fa891bb0876d0b2d05d478deb728)]:
  - @pyreon/compiler@0.46.0
  - @pyreon/sized-map@0.46.0

## 0.45.0

### Patch Changes

- [#2208](https://github.com/pyreon/pyreon/pull/2208) [`f40448a`](https://github.com/pyreon/pyreon/commit/f40448a4743fbced6938e11d603c9124a4ff3c65) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Restore `@pyreon/lint` to its 95% statement-coverage floor (the
  `no-unbatched-updates` hardening in the previous release added an uncovered
  `isNonSignalSetCall` branch). Behavior-preserving: simplified the
  `isNonSignalSetCall` receiver guard to optional chaining (the `!obj` early
  return was unreachable — the helper only runs after `isSetCall` proves a member
  callee) and added behavioral tests for the inline `new Map().set()` receiver
  plus the `maxPathSets` counting across sequence / labeled-loop / else-early-return
  branches. No rule behavior change.

- [#2194](https://github.com/pyreon/pyreon/pull/2194) [`44dfab8`](https://github.com/pyreon/pyreon/commit/44dfab88fe302d41c19ced373c97e0eba5025378) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Harden `@pyreon/lint` from the upstream 0.44.0 findings — three detection
  bugs and five rule-precision fixes:

  **Detection correctness**

  - **`no-props-destructure` (LT-2)** now also catches the BODY form
    (`function C(props) { const { a } = props }`), not just the signature form —
    the exact reactivity bug the rule exists to prevent. Ports the compiler's
    `detectPropsDestructuredBody` (conservative: only a bare `= props` at the
    component top scope; never descends into nested handlers/effects).
  - **`no-unbatched-updates` (LT-3)** no longer (A) sums `.set()` across `await`
    boundaries (`batch()` can't span an `await`, so those are separate microtask
    segments) nor (B) counts non-signal `.set()` on a `Map`/`URLSearchParams`/etc.
  - **`no-window-in-ssr` (LT-4)** no longer (2) fires on a same-expression
    `typeof window !== 'undefined' && window.x` guard, nor (3) flags a local
    `const history = …` as `window.history` (it now tracks the shadow).

  **Rule precision** — style/precision preferences that fired (or gated, under
  `strict`/`lib`) on correct code are now opt-in and reworded:

  - **`no-and-conditional` / `no-ternary-conditional` (LR-2)** — the compiler
    lowers `&&`/ternary and `<Show>` to the same reactive `_mountSlot` accessor,
    so they mount/swap/unmount identically; dropped the false "more efficient"
    claim and made them `optIn`.
  - **`no-bare-signal-in-jsx` (LR-1)** — `optIn` (matches its "Opt-in."
    description; it can't tell a signal from a pure formatter).
  - **`prefer-show-over-display` (LR-4)** — message now acknowledges `display`
    toggling is a legitimate SSR-safe (stable-tree) technique; `optIn`.
  - **`no-theme-outside-provider` (LR-9)** — `optIn`; cross-file context is the
    point of `useTheme()`.
  - **`overlay-a11y` (LR-10)** — accepts `<Overlay type="dialog|…">` as
    satisfying a11y (the component derives ARIA from `type`).

  The new body-form check is scoped off (in the monorepo `.pyreonlintrc.json`)
  for `@pyreon/{flow,code,rich-text}` render-layer components: they legitimately
  destructure `children`/stable-instance/static-config props, and the rule's
  recommended `props.x` fix is _harmful_ for `children` (the compiler reactively
  inlines `const x = props.x`, wrapping children in an accessor and breaking
  structural rendering — verified against real-compiler flow e2e).

- Updated dependencies [[`747cced`](https://github.com/pyreon/pyreon/commit/747cced0efd3611bcff4f0d8ec01417ed5f19e45), [`14a78e6`](https://github.com/pyreon/pyreon/commit/14a78e6a28139c4b2af62f338a5e8533f73a96a8)]:
  - @pyreon/compiler@0.45.0
  - @pyreon/sized-map@0.45.0

## 0.44.0

### Patch Changes

- [#2150](https://github.com/pyreon/pyreon/pull/2150) [`38deec0`](https://github.com/pyreon/pyreon/commit/38deec0695ae616960966766e530e1b42d138ed1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Release-audit low-tier hardening:

  - **`@pyreon/validation`**: the Standard-Schema issue-path → dot-string flattening existed as five inline copies (`standardSchemaToValidator`, `wrapStandardSchema`, and the zod/valibot/arktype adapters) — identical by luck, not construction; every consumer (form's schema-error routing, store/state-tree parse errors) keys on that exact format, so a drifted copy would silently mis-route errors. Consolidated into ONE exported `flattenIssuePath()` (plain segments, `{key}` objects, mixed; absent/empty → `""` the whole-form key), used by all five sites and unit-locked.
  - **`@pyreon/lint`** (`pyreon/no-private-env-in-client`): computed `process.env[expr]` access is now reported — it is ALWAYS dead in the browser (bundler define-replacement rewrites static reads only; `process.env` itself is undefined client-side); it was silently skipped. The specs also exposed a pre-existing misclassification: `process.env[k]` with an identifier key was treated as a STATIC `.k` read and given the wrong guidance (`ZERO_PUBLIC_k`) — `node.computed` is the real discriminator. Computed `import.meta.env[expr]` stays exempt by design (Vite injects a real env object).

- [#2144](https://github.com/pyreon/pyreon/pull/2144) [`e857e7b`](https://github.com/pyreon/pyreon/commit/e857e7be71601bcded333045182b13fb8814a8e5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The `pyreon-lint` bin actually runs the CLI — it was a complete no-op in published builds. `bin/pyreon-lint.js` was a bare `import('../lib/cli.js')`, but the built `lib/cli.js` is a pure re-export: `src/cli.ts`'s `if (import.meta.main) main()` self-run guard does not survive the library build (rolldown drops it, and inside a bundled chunk `import.meta.main` is never true anyway), so the bin loaded a module, ran nothing, and exited 0 for every invocation. The wrapper now explicitly calls `runCli(process.argv.slice(2))` and exits with its code (staying alive for `--watch`/`--lsp`). Locked by a real-bin regression test that asserts exit code 1 on an error-severity finding — the no-op bin exited 0 (bisect-verified). Note `pyreon lint` (via `@pyreon/cli`) was unaffected — it forwards to `runCli` programmatically; only the standalone `pyreon-lint` binary was dead.

- [#2179](https://github.com/pyreon/pyreon/pull/2179) [`bc4870c`](https://github.com/pyreon/pyreon/commit/bc4870c318abfa12bd037cde428ad7cf182dd4ba) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix nine `@pyreon/lint` rule defects surfaced by an upstream consumer's hardening pass — accuracy, scope, and two code-corrupting autofixes.

  - **LT-9** `vitest-config-uses-shared` + `no-querySelector-cast-in-test`: fired at `error` in the default preset mandating `@pyreon/vitest-config` / `@pyreon/test-utils` — both `"private": true`, so a consumer literally cannot satisfy them. Now gated on `isProjectDependency` — silent in a project that doesn't declare the (private) package; the monorepo (which self-depends) still enforces them.
  - **LT-7** `no-signal-leak`: flagged `export const x = signal(0)` as "unused" — exported signals are consumed cross-module. Now skips exported bindings.
  - **LT-5** `no-signal-in-props`: flagged ANY call in a component prop (`String(v)`, `t(key)`, `humanize(id)` — none signals). Now resolves the callee to a `signal()`/`computed()` binding.
  - **LT-4.1** `no-window-in-ssr` + **LT-6** `no-dom-in-setup`: fired inside test files (which never SSR and legitimately touch `window`/`document`). Now skip test files (+ `no-dom-in-setup` gains `exemptPaths`), consistent with the other SSR/browser-API rules.
  - **LR-5** `no-onchange`: its **autofix** rewrote `onChange`→`onInput` on `<select>`/`checkbox`/`radio`/etc., where `onChange` is the correct DOM event. Now restricted to text-like inputs.
  - **LR-8** `no-error-without-prefix`: **autofixed** a consumer's `throw new Error('Save failed (500)')` to `[Pyreon] …`, mislabeling app errors as framework errors. The `[Pyreon]` prefix is a framework-internal convention, so the rule now fires only inside `@pyreon/*` packages.
  - **LR-6** `dev-guard-warnings`: recommended wrapping in `if (__DEV__)` — a global neither `@pyreon/zero` nor `@pyreon/vite-plugin` injects (a runtime `ReferenceError`). Message now recommends the bundler-agnostic `if (process.env.NODE_ENV !== 'production')` (which the rule already accepted).
  - **LR-1** `no-bare-signal-in-jsx`: premise was false — `{sig()}` compiles byte-identically to `{() => sig()}` (both reactive), yet the rule flagged it at `error` and autofixed correct code. Demoted to a non-gating `info` style hint and the churning autofix removed.

  Also carries a 39-byte `@pyreon/mcp` bundle-budget bump (drift making `Check Bundle Budgets` red on main; mcp is not otherwise touched).

- Updated dependencies [[`ae2472e`](https://github.com/pyreon/pyreon/commit/ae2472e4ecb31cd59bde23d1983afe7db1c62d99), [`57808e6`](https://github.com/pyreon/pyreon/commit/57808e65d9b2d9823b0b054d0af0371cde078e85), [`4add6bd`](https://github.com/pyreon/pyreon/commit/4add6bd17711a6eb9f0cc9375a3643289bf931c4), [`8413136`](https://github.com/pyreon/pyreon/commit/84131368d6f8790ba50e2af9d383ee289e4b1f5c), [`0274fb6`](https://github.com/pyreon/pyreon/commit/0274fb6a0f838a9f7b4ec41295adef1bf5ed4e95)]:
  - @pyreon/compiler@0.44.0
  - @pyreon/sized-map@0.44.0

## 0.43.1

### Patch Changes

- Updated dependencies [[`969dc61`](https://github.com/pyreon/pyreon/commit/969dc61b06c4cf081508e79bf3c2873e1ae08f64)]:
  - @pyreon/compiler@0.43.1
  - @pyreon/sized-map@0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.43.0
  - @pyreon/sized-map@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [[`35139f6`](https://github.com/pyreon/pyreon/commit/35139f6e6bf68cac5a268fd5fa148144f4c397d3), [`39051db`](https://github.com/pyreon/pyreon/commit/39051dbcec2aa5f3aa9db79c5ac0a9f9197cc1e9)]:
  - @pyreon/compiler@0.42.0
  - @pyreon/sized-map@0.42.0

## 0.41.2

### Patch Changes

- [#2112](https://github.com/pyreon/pyreon/pull/2112) [`93ee46b`](https://github.com/pyreon/pyreon/commit/93ee46b03f7c13a55abd018ec27376b2b722dbea) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon/no-private-env-in-client` now catches the destructuring / base-capture leak shapes (`const { X } = process.env`, `const e = import.meta.env`) — the direct-access-only visitor previously missed them — and skips `server/` dirs (parity with `api/`) so legit server code isn't falsely warned.

- Updated dependencies [[`72770bb`](https://github.com/pyreon/pyreon/commit/72770bbf4453be41332f595a1aa6fa191315199e)]:
  - @pyreon/compiler@0.41.2
  - @pyreon/sized-map@0.41.2

## 0.41.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.41.1
  - @pyreon/sized-map@0.41.1

## 0.41.0

### Minor Changes

- [#2106](https://github.com/pyreon/pyreon/pull/2106) [`2ade7a9`](https://github.com/pyreon/pyreon/commit/2ade7a9896859abe19739d1b5c02c41ed91f42fa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add the `pyreon/no-private-env-in-client` lint rule (opt-in, `@pyreon/zero`-gated).

  Flags raw `process.env.X` / `import.meta.env.X` reads in client-reachable zero
  code — `process.env` is `undefined` in the browser and `import.meta.env` is
  bundler-specific. It steers you to `publicEnv()` from `@pyreon/zero/env` with a
  `ZERO_PUBLIC_`-prefixed var (inlined into the client bundle at build, secrets
  kept out by construction).

  Conservative by design: `process.env.NODE_ENV` and Vite's `import.meta.env`
  built-ins (`DEV`/`PROD`/`MODE`/`SSR`/`BASE_URL`) are never flagged, and
  server-only files (`*.server.*`, `api/`, `entry-server`, `*.config.*`,
  `scripts/`) are skipped so a legitimate server-side `process.env.SECRET` isn't
  touched. Opt-in best-practice (off in `recommended`, on under `best-practices`);
  surfaces in `pyreon doctor` automatically via the lint gate.

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.41.0
  - @pyreon/sized-map@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`ee8cd71`](https://github.com/pyreon/pyreon/commit/ee8cd7184fa439b3fe5bc60cf45d783439707a5c), [`85d4a91`](https://github.com/pyreon/pyreon/commit/85d4a91c5e015af7348ebdd312e0ba5523950a3d), [`80c19ac`](https://github.com/pyreon/pyreon/commit/80c19ac234888ab08b0aea198c87548debebcf18), [`32e1c66`](https://github.com/pyreon/pyreon/commit/32e1c660b4d1da33c592ef5165774981843f8180), [`e6d3905`](https://github.com/pyreon/pyreon/commit/e6d390586944b903ee8d9c97a71cbaf26eca63d6), [`d61d3d9`](https://github.com/pyreon/pyreon/commit/d61d3d9e3acb483b1b5fa8b79f23c03c309ab2c5), [`85d4a91`](https://github.com/pyreon/pyreon/commit/85d4a91c5e015af7348ebdd312e0ba5523950a3d)]:
  - @pyreon/compiler@0.40.0
  - @pyreon/sized-map@0.40.0

## 0.39.0

### Minor Changes

- [#2011](https://github.com/pyreon/pyreon/pull/2011) [`0b3e65c`](https://github.com/pyreon/pyreon/commit/0b3e65c49ff2d6245d4e9e56d49140d4abe87773) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Two render-mode DX rules (Tier 2/3 of the zero-modes roadmap):

  - `pyreon/missing-get-static-paths` is now renderMode-aware: a dynamic route declaring `export const renderMode = 'ssr' | 'isr' | 'spa'` (literal) is runtime-only/CSR by declaration, so the rule no longer fires on it — killing the false positive in hybrid and SSR apps. A declared `'ssg'` or a computed mode still fires.
  - New `pyreon/island-import-from-client` (architecture, warn): flags `import { island } from '@pyreon/server'` — the barrel drags `node:*` + the server singleton into client bundles (duplicate-singleton throw + dual `@pyreon/core` context split at hydration). Fix is universally safe: import from `'@pyreon/server/client'` (or `'@pyreon/zero'`). Server-only files by naming convention (`entry-server.*`, `*.server.*`) are exempt.

  Rule count 92 → 93.

- [#2023](https://github.com/pyreon/pyreon/pull/2023) [`74bbc94`](https://github.com/pyreon/pyreon/commit/74bbc9423245e0596872c9a7fb230bacdc411cca) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Zero render-modes DX — the final three roadmap gaps:

  - **Build-time ISR auth-read warning** (`@pyreon/zero`): an ISR-mode route whose loader/middleware/guard reads `headers.get('cookie'|'authorization')` without a custom `isr.cacheKey` FUNCTION now gets a loud build/dev warning naming the file and the fix (the runtime already refuses to cache such responses, but only per-request in prod logs). Effective-mode resolution mirrors the file/layout/routeRules/app cascade; a custom `cacheKey` function suppresses it.
  - **Scaffolder ISR + typed routes** (`@pyreon/create-zero`): `--mode isr` (and the interactive ISR choice) scaffolds `mode: 'isr', isr: { revalidate: 60 }` and filters the `static` adapter (ISR needs a server); new `--typed-routes` / `--no-typed-routes` flags + prompt (default ON) wire `zero({ typedRoutes: true })` with the generated `src/pyreon-routes.d.ts` gitignored by the template.
  - **`pyreon/missing-get-static-paths` is now app-mode-aware** (`@pyreon/lint`): new `appMode` option — `["warn", { "appMode": "ssr" }]` flips the polarity for server apps: undeclared dynamic routes are quiet (they render per-request), and only explicit `renderMode = 'ssg'` declarations (which join the prerender pass) still require `getStaticPaths`.

### Patch Changes

- Updated dependencies [[`514f28d`](https://github.com/pyreon/pyreon/commit/514f28da2c442e9fffd694a88a2b8fd8c9a48088), [`a401811`](https://github.com/pyreon/pyreon/commit/a40181170cad2c71efa66244aa9306b4b3f8527f), [`2444405`](https://github.com/pyreon/pyreon/commit/244440585f0066759a0f1bc4aec087e44b131466), [`8a1feb0`](https://github.com/pyreon/pyreon/commit/8a1feb07faca643488c98e89db7bfc08d6867a31)]:
  - @pyreon/compiler@0.39.0
  - @pyreon/sized-map@0.39.0

## 0.38.0

### Minor Changes

- [#1867](https://github.com/pyreon/pyreon/pull/1867) [`3ba1276`](https://github.com/pyreon/pyreon/commit/3ba1276d2be734a7b9e9ebd09d00b643a4b80396) Thanks [@vitbokisch](https://github.com/vitbokisch)! - cli: add `pyreon lint` — a unified front door to `@pyreon/lint`

  `pyreon lint [paths]` forwards every `pyreon-lint` flag verbatim (`--preset`,
  `--fix`, `--format`, `--quiet`, `--rule`, `--config`, `--ignore`, `--watch`,
  `--lsp`). It exits non-zero on lint errors, just like the standalone binary.

  To keep one implementation, `@pyreon/lint` now exports **`runCli(argv): number
| null`** (extracted from its bin's `main()`): returns the exit code, or `null`
  for the long-running `--watch` / `--lsp` modes. Both the `pyreon-lint` bin and
  `pyreon lint` call it, so the two CLIs can never drift. Lazy-loaded in the
  `pyreon` dispatch — no main-entry bundle growth.

### Patch Changes

- [#1890](https://github.com/pyreon/pyreon/pull/1890) [`8071b15`](https://github.com/pyreon/pyreon/commit/8071b15a6d353f550e7a499a5ace0baa9d7bc564) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add opt-in frontend rule `pyreon/content-visibility-needs-intrinsic-size` (CLS). Flags `content-visibility: auto` set without `contain-intrinsic-size` — the browser estimates the off-screen box height then corrects it on render, shoving content below it down (a mobile-biased Cumulative Layout Shift, invisible on fast desktop loads). Detects the object-literal form (JSX `style={{}}` + styler/rocketstyle `.theme(() => ({}))`), `css`/`styled` tagged-template CSS, and string `style="…"`. Off by default (opt-in, `frontend` category); enable via the `best-practices` preset or per-rule config; `exemptPaths` supported.

- Updated dependencies [[`4cfd22f`](https://github.com/pyreon/pyreon/commit/4cfd22f68088f937535064e0a01a42aaf957f3e2), [`a71dfa2`](https://github.com/pyreon/pyreon/commit/a71dfa2a359b278bee6a38fa7a8a41b454adca28), [`a615f46`](https://github.com/pyreon/pyreon/commit/a615f46237685a1bf4a96f535b9375655cde2c79)]:
  - @pyreon/compiler@0.38.0
  - @pyreon/sized-map@0.38.0

## 0.37.1

### Patch Changes

- Updated dependencies:
  - @pyreon/compiler@0.37.1
  - @pyreon/sized-map@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.37.0
  - @pyreon/sized-map@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies:
  - @pyreon/compiler@0.36.0
  - @pyreon/sized-map@0.36.0

## 0.35.0

### Minor Changes

- [#1811](https://github.com/pyreon/pyreon/pull/1811) [`0a23659`](https://github.com/pyreon/pyreon/commit/0a23659f71a57a043390936bc88acd249bbdfbe4) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `pyreon/primitive-media-needs-label` — an opt-in, `@pyreon/primitives`-dependency-gated frontend a11y rule (the multiplatform analog of `pyreon/require-img-alt`). It flags a canonical `<Image>` / `<Icon>` that carries no accessible name — neither a text alternative (`accessibilityLabel` / `alt` / `aria-label` / `aria-labelledby`) nor a decorative marker (`accessibilityHidden` / `aria-hidden`). Because those media primitives have no text content, a missing label is inaccessible on every target (web screen readers, iOS VoiceOver, Android TalkBack); the rule surfaces it at author time so the canonical `accessibilityLabel` (which lowers to each platform's idiom) is written once. Accepting `alt`/`aria-*` as satisfying means a project also using `@pyreon/zero`'s web-optimized `<Image alt>` is never false-flagged. Off in `recommended`/`strict`/`app`/`lib`; enabled by the `best-practices` preset or per-rule config; silent in projects without `@pyreon/primitives`. Brings the rule set to 91 rules across 18 categories (frontend → 11).

### Patch Changes

- [#1657](https://github.com/pyreon/pyreon/pull/1657) [`62f1191`](https://github.com/pyreon/pyreon/commit/62f119168078711ad4056c576805c71cff127c12) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Dependency refresh.

  - `@pyreon/lint`: bump the `@oxc-project/types` dependency `^0.133.0 → ^0.137.0` (aligns with the `oxc-parser`/`oxc-transform` 0.137 line).
  - `@pyreon/zero`: widen the `sharp` peer-dependency range to `^0.33.0 || ^0.34.0 || ^0.35.0` (sharp's image API is stable across these minors) and refresh the dev dependency to `0.35.2` — keeps the dev-tested and consumer-supported sharp versions in sync.

- [#1784](https://github.com/pyreon/pyreon/pull/1784) [`7209861`](https://github.com/pyreon/pyreon/commit/7209861f602d3bdef6bc0ab9de1ea58c4acaa970) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon/no-error-without-prefix` now supports the standard `exemptPaths` rule option (like `no-window-in-ssr` etc.). Lets a project scope the rule off packages whose throws are NOT framework runtime errors — e.g. CLI scaffolders (`create-zero` / `create-multiplatform`), whose `Error`s are user-facing CLI usage/argument messages shown to someone running `npm create`, not runtime errors a Pyreon app developer debugs (and which have their own CLI-tool error voice).

- [#1784](https://github.com/pyreon/pyreon/pull/1784) [`7209861`](https://github.com/pyreon/pyreon/commit/7209861f602d3bdef6bc0ab9de1ea58c4acaa970) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon/no-error-without-prefix` now also accepts the more-specific `[@pyreon/<pkg>]` convention (e.g. `throw new Error('[@pyreon/state-tree] …')`), not just the generic `[Pyreon]` token. Both satisfy the rule's purpose — the error is identifiable as coming from the framework, and the scoped form additionally names the package — so flagging `[@pyreon/<pkg>]` was a false-positive against the rule's own intent. Unrelated bracket prefixes (`[Vue]`, etc.) are still flagged.

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

- Updated dependencies [[`b3957fa`](https://github.com/pyreon/pyreon/commit/b3957fa6f913410e90f917ebce560a1bf85c2dd8), [`f1e46fb`](https://github.com/pyreon/pyreon/commit/f1e46fb08da6a0fdf03f1eab8abc95ad0643def1), [`8a4e195`](https://github.com/pyreon/pyreon/commit/8a4e19519bcf3dfebb203c97f69d08e3f7ac6b50), [`d2d3cb4`](https://github.com/pyreon/pyreon/commit/d2d3cb4a6f585a59333ef5c28c1ba4eefa10e4ea), [`544c425`](https://github.com/pyreon/pyreon/commit/544c425b6bcf95f772ea04a5e740fb27fa6938d1), [`1c98f38`](https://github.com/pyreon/pyreon/commit/1c98f3863ccd2fd16a4ad6e20e82fb778725bca0), [`e8d945f`](https://github.com/pyreon/pyreon/commit/e8d945fe7a7c23307b0b7d88eeb4cc060224b3a5), [`ee9b328`](https://github.com/pyreon/pyreon/commit/ee9b32875104b8759c2aa180cb6d00d62fa681de), [`a8a8b41`](https://github.com/pyreon/pyreon/commit/a8a8b41ae001883710cd6cd4e4c367987dd6312d)]:
  - @pyreon/compiler@0.35.0
  - @pyreon/sized-map@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [[`c0814b7`](https://github.com/pyreon/pyreon/commit/c0814b7881b01b7bfed19dffd7f48a3269c14199), [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5), [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5), [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5), [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5), [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5), [`ec41abf`](https://github.com/pyreon/pyreon/commit/ec41abf8c6aaf8dbf442fb6c8e194ab607238e77), [`10bdb4a`](https://github.com/pyreon/pyreon/commit/10bdb4a449151a70ae2d1ffc1bf4a30f303c5bf0), [`9335e1f`](https://github.com/pyreon/pyreon/commit/9335e1fe75df850ffa6434d3a8f956c4c3e46646), [`3ad3247`](https://github.com/pyreon/pyreon/commit/3ad32475b881b19792c010872fc31024b71b7acb), [`a9788cd`](https://github.com/pyreon/pyreon/commit/a9788cdfbebee4ea7468356c3fcea31a6857f11b), [`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/compiler@0.34.0
  - @pyreon/sized-map@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.32.0

### Minor Changes

- [#1522](https://github.com/pyreon/pyreon/pull/1522) [`b9fbb9c`](https://github.com/pyreon/pyreon/commit/b9fbb9cca02295d7db77ae5525b8f5d188848e35) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `pyreon/prefer-isserver` (ssr category, recommended-level **warn**) — nudges toward the canonical `isServer` / `isClient` environment primitives from `@pyreon/reactivity` over hand-rolled `typeof window` / `typeof document` checks. The primitives single-source SSR detection and use the reliable `typeof document` discriminator (`typeof window` misreports DOM-less environments).

  Advisory by design (warn never fails the errors-only lint gate) and self-gates on the project depending on `@pyreon/reactivity` / `@pyreon/core`, so it stays silent in non-Pyreon code. Flags the `typeof window/document … 'undefined'` idiom specifically (not `typeof window.foo` feature detection); the module that defines the primitives is exempt. Brings the rule set to 90.

### Patch Changes

- [#1503](https://github.com/pyreon/pyreon/pull/1503) [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add canonical runtime environment flags `isServer` / `isClient` to `@pyreon/reactivity` (re-exported from `@pyreon/core`).

  `isServer` is `typeof document === 'undefined'` — the most reliable "is there a DOM" discriminator (more correct than `typeof window`, which misreports Deno and polyfilled Node). Plain runtime constants, evaluated once at module load: correct in every runtime with zero bundler configuration. Use them for small environment guards (module-level singletons, lazy globals, render output that differs server vs client); for heavy server-only code prefer a `/server` subpath export, and for DOM access inside a component prefer `onMount` / `effect` (which never run during SSR).

  Internally, this replaces seven hand-rolled `typeof window` / `typeof document` env consts across `router`, `hooks`, `url-state`, `elements`, `ui-core`, and `styler` with the single primitive — removing the drift (the copies disagreed on `window` vs `document`) and the inconsistency. Behavior is unchanged in browsers and Node; the `window` → `document` switch is a strict improvement for Deno / Web Workers.

  `@pyreon/lint`'s `no-window-in-ssr` rule now recognises an imported `isClient` / `isServer` (or `isBrowser` / `isSSR`) as an SSR guard — but only when imported from `@pyreon/reactivity` or `@pyreon/core`, so `if (isClient) window.x` / `if (isServer) return` / `if (!isClient) return` are clean while a same-named local `const isBrowser = true` or a foreign-source import stays flagged.

- [#1538](https://github.com/pyreon/pyreon/pull/1538) [`fc26160`](https://github.com/pyreon/pyreon/commit/fc26160ac2d3afba0adde20f61d94a4199519b59) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon/no-dom-in-setup` now recognizes the canonical `@pyreon/reactivity` SSR primitive as a head guard: `if (isServer) return|throw` and `if (!isClient) return|throw` (by name, the same convention `no-window-in-ssr` / `dev-guard-warnings` use). This keeps the rule consistent with `pyreon/prefer-isserver` — that rule pushes `typeof document === 'undefined'` guards TO `isServer`, so without this the two rules contradicted (prefer-isserver said "use isServer", then no-dom-in-setup flagged the now-"unguarded" DOM access in the same function).

- Updated dependencies [[`04525e1`](https://github.com/pyreon/pyreon/commit/04525e1dfc92ff4d7182818c3e9ddaddd8648cbc), [`edaea04`](https://github.com/pyreon/pyreon/commit/edaea04231fc33b585e785bda61e63c14663c045), [`f6f54a2`](https://github.com/pyreon/pyreon/commit/f6f54a254e43f3b36a4c55581381ab582322990e), [`73436e7`](https://github.com/pyreon/pyreon/commit/73436e782319940abde41200299489a809de70d5), [`bfb813b`](https://github.com/pyreon/pyreon/commit/bfb813ba5a883c791a8df22c46fa82cf370c6ebe)]:
  - @pyreon/compiler@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.29.0

### Patch Changes

- [#1315](https://github.com/pyreon/pyreon/pull/1315) [`3ab6d0d`](https://github.com/pyreon/pyreon/commit/3ab6d0d3e645b65c73bef9ec353dc1526ea840c5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(lint): add 10 real tests for runner.ts applyFixes + lintFile contracts

  10 new tests in `branch-coverage-real.test.ts` covering:

  - `applyFixes` empty-diagnostics fast path (line 254)
  - single-fix application
  - multi-fix reverse-order offset preservation
  - mixed fixable + non-fixable diagnostic handling
  - `lintFile` basic surface (clean file, empty rules, .tsx, .js, .d.ts skip)

  Branches lifted 90.32% → 90.47% via real tests.

- Updated dependencies [[`8524e24`](https://github.com/pyreon/pyreon/commit/8524e24651184d275d5bf7520d65caade2ef25b8), [`0ef3f45`](https://github.com/pyreon/pyreon/commit/0ef3f4591fdd7339a0dd597dabc27295eeb09669)]:
  - @pyreon/compiler@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.28.1

### Patch Changes

- [#1217](https://github.com/pyreon/pyreon/pull/1217) [`d4a76a0`](https://github.com/pyreon/pyreon/commit/d4a76a0ca8fa2468c05e96aacc6a8690496e3e8c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift node-side coverage to ≥95% statements / ≥90% branches. Add 16 edge-case tests across JSX namespaced-attr bails, styling rule bail branches, frontend a11y bails, heading-order function-scope traversal + exemptPaths, reactivity context-destructure/effect-assignment bails, and store rule bails. Bump `coverageThresholds.statements` 94 → 95, `branches` 85 → 90, `lines` 94 → 95.

- [#1269](https://github.com/pyreon/pyreon/pull/1269) [`fc2da1c`](https://github.com/pyreon/pyreon/commit/fc2da1cbbae059b5e473735e590c21a1efd90d49) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(lint): `no-bare-signal-in-jsx` no longer false-positives on attribute values

  The rule fired on every `JSXExpressionContainer` inside JSX, so it flagged
  attribute signal reads (`<input value={value()} checked={checked()}>`) the same
  as text children (`<div>{count()}</div>`). But the compiler `_rp()`/`_bind()`-
  wraps signal reads in ATTRIBUTE position — those ARE reactive; only an
  already-called signal in TEXT position is captured once. The over-fire forced a
  `.pyreonlintrc.json` exemption for `@pyreon/ui-primitives` + `@pyreon/elements`
  (both use `attr={signal()}` pervasively in their headless primitives).

  The rule now marks text-child containers via a WeakSet when visiting each
  element/fragment (oxc passes no parent) and reports only those — attribute
  values are skipped, while TEXT nested inside an attribute (`prop={<div>{x()}</div>}`)
  still reports correctly. The two package exemptions are removed (shipped source
  of both is clean after the fix). Bisect-verified.

- Updated dependencies [[`404d266`](https://github.com/pyreon/pyreon/commit/404d266a33fd272897e70c59e6baad7f31ccab44), [`a448ff4`](https://github.com/pyreon/pyreon/commit/a448ff4fa5b5627622be0fcd7fbe65b5f8c51991), [`e97b8d7`](https://github.com/pyreon/pyreon/commit/e97b8d7a63a3f368c6a1e49a71eb22114b202f81), [`fccddae`](https://github.com/pyreon/pyreon/commit/fccddae860e3126640dbcbd6d5a0ef22ac419f48)]:
  - @pyreon/compiler@0.28.1
  - @pyreon/sized-map@0.28.1

## 0.28.0

### Minor Changes

- [#1201](https://github.com/pyreon/pyreon/pull/1201) [`7f446f2`](https://github.com/pyreon/pyreon/commit/7f446f279e344b7db68eaf7c91ddd1a255f89a1f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(lint): `pyreon/color-contrast` rule — flag low-contrast literal-hex pairs (a11y)

  New opt-in frontend accessibility rule. When a style object literal sets BOTH
  `color` and `background`/`backgroundColor` to LITERAL hex colours, it computes
  the WCAG 2.1 relative-luminance contrast ratio and warns when it's below AA
  (4.5:1 for normal text). Catches the exact bokisch.com Lighthouse pairs
  (`#6b7280` on `[#212121](https://github.com/pyreon/pyreon/issues/212121)` = 3.33:1, `#f8f8f8` on `#06b6d4` = 2.28:1).

  **Scope — literal hex pairs only.** It does NOT resolve theme tokens
  (`color: t.color.muted`), CSS template strings, `rgb()`/`hsl()`/named colours,
  or alpha hex. Theme-token contrast (the more common real-world shape) is
  impossible for a static AST walker — it would need to evaluate the theme object
  at its definition site. That belongs in a theme-loading audit, not a syntactic
  lint rule; this covers the hardcoded-hex case it can prove with zero guessing.
  Documented prominently in the rule's JSDoc.

  Off in `recommended`/`strict`/`app`/`lib`; on in `best-practices`. (87 rules
  total; frontend category 7 → 8.) `@pyreon/mcp` api-reference regenerated.

- [#1200](https://github.com/pyreon/pyreon/pull/1200) [`cc4b6b6`](https://github.com/pyreon/pyreon/commit/cc4b6b683e1c1450432f97fc708abda067818e2e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(lint): `pyreon/heading-order` rule — flag skipped heading levels (a11y)

  New opt-in frontend accessibility rule. Flags a heading whose level jumps by
  more than one from the previous heading in the same scope (e.g. `<h1>` followed
  by `<h3>`, skipping `<h2>`) — the axe-core "heading-order" check. Screen-reader
  users navigate by the heading outline; skipped levels break it.

  **Function-scoped** so two sibling components in one file each get their own
  outline (no false positive when component B opens at `<h3>` after component A
  ended at `<h1>`). Off in `recommended`/`strict`/`app`/`lib`; on in
  `best-practices`. (87 rules total; frontend category 7 → 8.)

  Limitations (the "80% case"): only literal `<h1>`–`<h6>` in a single file's
  source order; dynamic-level components (`<Heading level={n}>`) and
  cross-component document order are out of reach for a static walker.
  `@pyreon/mcp` api-reference regenerated from the updated manifest.

- [#1198](https://github.com/pyreon/pyreon/pull/1198) [`889cf5a`](https://github.com/pyreon/pyreon/commit/889cf5aec04dd41a37dd4d47edcdad358e23f3a2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat: `<OptimizedImage source={img} />` + `pyreon/no-discarded-optimize-fields` lint rule

  Two complementary defenses against the [#1](https://github.com/pyreon/pyreon/issues/1) real-world CLS cause — pulling just
  `hero.src` off a `?optimize` import onto a raw `<img>`, silently dropping
  `width` / `height` / `srcset` / `placeholder` / `formats`.

  - **`@pyreon/zero`**: new `<OptimizedImage source={hero} alt="…" />` — a one-prop
    form of `<Image>` that spreads the WHOLE `?optimize` descriptor, so no field
    can be forgotten. `<Image {...hero} />` still works; this removes the "did I
    remember every field?" step. Display props pass through alongside `source`.
  - **`@pyreon/lint`**: new opt-in, `@pyreon/zero`-dep-gated frontend rule
    `pyreon/no-discarded-optimize-fields` flags `<img src={x.src}>` where `x` is a
    `?optimize` import, pointing at `<OptimizedImage>` / `<Image {...x}>`. Off in
    `recommended`/`strict`/`app`/`lib`; on in `best-practices`. (87 rules total.)
  - `@pyreon/mcp`: api-reference regenerated from the updated manifests.

  The audit also asked to "brand"/rename the `ProcessedImage` type — intentionally
  skipped: the type is already named and the lint rule keys off the `?optimize`
  import query, not the type name, so a rename would be churn with no detection gain.

### Patch Changes

- Updated dependencies [[`1aeb610`](https://github.com/pyreon/pyreon/commit/1aeb610a10ce5069b52b2882a6175a16c16483b3)]:
  - @pyreon/sized-map@0.33.0
  - @pyreon/compiler@0.33.0

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
  - @pyreon/compiler@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.33.0

## 0.26.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.26.1

## 0.26.0

### Minor Changes

- [#1125](https://github.com/pyreon/pyreon/pull/1125) [`3ebd25f`](https://github.com/pyreon/pyreon/commit/3ebd25fbdd06f8d9f473e8a9281bce27effca209) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Per-request locale via `AsyncLocalStorage` + new lint rule `pyreon/no-module-signal-in-server-package` (PR-S7)

  **Pattern A from the deep-audit campaign** — module-global state in server context. The `@pyreon/zero` `localeSignal` was a module-level `signal('en')` that the dev i18n middleware wrote per-request via `localeSignal.set(locale)`. Server packages are concurrent — two simultaneous SSR requests with different locales (say `/de/about` + `/cs/about`) race the writes; the later-arriving render's `useLocale()` reads the wrong locale because the module signal is single-instance per process.

  **The fix** (Pattern A canonical shape):

  1. **Per-request locale store via `AsyncLocalStorage`**: a new `_localeAls = new AsyncLocalStorage<LocaleStore>()` tracks the locale per-request. The middleware wraps the rest of the request in `_localeAls.run(perRequestStore, next)` — `AsyncLocalStorage` propagates through async hops (Vite middleware chain, ssrLoadModule, Pyreon handler, render), so every downstream `useLocale()` call reads the right store.
  2. **`useLocale()` prefers the ALS store**: server context reads from `_localeAls.getStore()` if present, falls back to the module signal for non-ALS contexts (client, plain test harness without middleware).
  3. **`setLocale()` writes to the ALS store** when one is active, otherwise writes the module signal (CSR contract).
  4. **Module signal stays exported** as a CSR contract + best-effort fallback. The browser is single-threaded — the module signal is fully authoritative there. On the server it's now a fallback, not the source of truth.

  **New lint rule `pyreon/no-module-signal-in-server-package`** (architecture, error) catches the bug class at edit time. Flags `export const X = signal(...)` (or `computed(...)`) at module scope in source files matching the server-package roots (`packages/zero/zero/src/`, `packages/core/server/src/`, `packages/core/runtime-server/src/`). Detects both `signal` and `computed` calls; ignores nested-function-scope signals (per-call allocation = no race). Test files and configurable `exemptPaths` directories are skipped. `additionalPaths` option extends the default set for out-of-tree consumers. No auto-fix — the right shape depends on the call site (ALS vs context vs closure capture).

  **Regression coverage**: 4 new tests in `i18n-routing.test.ts` under `PR-S7: useLocale per-request isolation` (concurrent-request isolation, ALS-precedence, ALS-ignores-module-signal-writes, setLocale-writes-to-ALS); bisect-verified — reverting `i18n-routing.ts` fails 3 of 4 (the 4th is a fallback sanity check that passes either way). 7 new tests in `rule-batch-2.test.ts` for the lint rule (top-level + non-export + computed + nested-function-skip + non-server-package-skip + test-file-skip + exemptPaths + additionalPaths). All 71 zero i18n tests pass; all 903 lint package tests pass.

  **Monorepo audit** found one additional Pattern A instance (`@pyreon/zero/src/theme.tsx` — `theme` + `_osPrefersDark` module signals). Exempted in `.pyreonlintrc.json` with a follow-up audit note — the theme system currently has `setSSRThemeDefault` set at server startup, so the race doesn't materialize today, but a future PR should refactor it to per-request ALS for consistency.

  **No public API change**: `useLocale` / `setLocale` / `localeSignal` keep their existing signatures. The `_runWithLocale` ALS helper is `@internal` (exported only for regression tests).

### Patch Changes

- [#1122](https://github.com/pyreon/pyreon/pull/1122) [`619834c`](https://github.com/pyreon/pyreon/commit/619834ca66940731d85fc8ef0c76898b37d4f8b3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(lint): `pyreon/no-unbatched-updates` now counts max sets per execution path (was: function-scope sum)

  The rule used to sum every `.set()` call in a function and report when the total was ≥3 — but the metric that actually matters for batching is "how many notify cycles can fire on a SINGLE event path." Code with 3 `.set()` calls split across 3 mutually-exclusive branches (if/else-if/else, switch, try/catch) only fires ONE per invocation, yet was incorrectly flagged.

  The walker now treats:

  - **Sequential statements** → SUM
  - **`IfStatement` consequent / alternate** → MAX
  - **`SwitchStatement` cases** → MAX
  - **`TryStatement` try / catch** → MAX (mutually exclusive on throw path), plus finally (always runs)
  - **Loops** → body's per-iteration cost (one iteration is the batch-relevant unit)
  - **Ternary / `LogicalExpression`** → MAX (short-circuit)
  - **Nested functions** → 0 (separate execution paths handled by their own scope)

  Real-corpus impact: the rule flagged 31 sites repo-wide before the fix; 21 after — 10 false positives silenced without missing any real batch candidate. Verified against the canonical false-positive shape (`@pyreon/form` `runValidation` — 3 `errorSig.set()` calls in 3 mutex branches) and the canonical true-positive shape (`setInitialValues` — 4 sets per loop iteration).

  Bisect-verified: reverting the walker → the false-positive shape fires again (matches the bug); restoring → it goes silent while the true-positive shape stays flagged.

  12 new specs in `rule-batch-2.test.ts` lock in the behaviour:

  - 3 false-positive shapes (if/else, switch, try/catch) → not flagged
  - 4 true-positive shapes (sequential, in-branch, loop body, mixed mutex+sequential summing to ≥3) → flagged
  - Scope isolation: nested arrow fn doesn't pollute outer scope
  - batch() wrapper correctly suppresses
  - Short-circuit + ternary shapes

  Message also clarified: "N signal `.set()` calls can fire on a single execution path" (was: "N signal `.set()` calls without batch()") — names the failure mode the rule is actually catching.

- [#1126](https://github.com/pyreon/pyreon/pull/1126) [`4beab18`](https://github.com/pyreon/pyreon/commit/4beab1809566bc642184775ac19717abdeee316e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(lint): `pyreon/no-unbatched-updates` walker now respects early-return semantics

  Follow-up precision fix to the per-path-max walker shipped previously. The walker summed sequential statements after a conditional `return` / `throw`, even though those statements are unreachable on the early-exit path. Two paths exist: (A) take the early exit, (B) fall through — the walker now takes MAX instead of summing.

  Closes the canonical `@pyreon/query` `use-subscription.ts` `connect()` false positive (PR [#1124](https://github.com/pyreon/pyreon/issues/1124) documented this gap):

  ```ts
  function connect() {
    if (typeof WebSocket === 'undefined') return
    // ...
    if (!isEnabled()) { status.set('disconnected'); return }  // early exit
    status.set('connecting')
    try { ws = new WebSocket(...) }
    catch { status.set('error'); scheduleReconnect(); return }
    ws.onopen = (e) => { batch(() => { status.set('connected') }) }
    // ...
  }
  ```

  Real max-path = 2 (status('connecting') + catch's status('error')). Pre-fix walker summed `!isEnabled` early-exit set + main flow set + catch set = 3 → flagged. Post-fix: 2 → silent.

  New `alwaysReturns(node)` helper detects always-returning statements: `ReturnStatement`, `ThrowStatement`, `BlockStatement` with any always-returning member, `IfStatement` with both arms always-returning, `TryStatement` with appropriate try/catch/finally combinations.

  `BlockStatement` walking now uses a 2-track scheme:

  - `cumulative` — sum along the "continuation" (fall-through) path.
  - `branchMax` — max-so-far across already-taken early-exit paths.
  - Final block contribution: `max(cumulative, branchMax)`.

  Real-corpus impact:

  - Before this fix: 21 sites (after the per-path-max baseline)
  - After this fix: **16 sites** — 5 more false positives silenced
  - vs original function-scope-sum rule: 31 → 16, **15 total false positives silenced** across the precision sequence

  7 new specs in `rule-batch-2.test.ts` cover: early-exit with 2 vs 3+ sequential continuation, real-app SSE connect shape, throw-statement early exit, if/else with consequent-returns, nested early-return composition. Bisect-with-restore proven against the real `use-subscription` shape.

- [#1019](https://github.com/pyreon/pyreon/pull/1019) [`f27477a`](https://github.com/pyreon/pyreon/commit/f27477a681fdc131ea2904940dabb5b8b0e6b9cb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Bump `oxc-parser` / `oxc-transform` from `^0.129.0` to `^0.133.0`. Both are
  runtime dependencies (the compiler's JS-fallback parse path + all 67 lint
  rules' AST). No AST-shape breakage: compiler suite (1414), lint suite (750),
  native-compiler (388), and the bundle-budgets import-walker (57 pkgs) all
  pass unchanged on 0.133.
- Updated dependencies [[`fce4e86`](https://github.com/pyreon/pyreon/commit/fce4e868611a3f5e006f20a031d43435441901e5), [`ecceb71`](https://github.com/pyreon/pyreon/commit/ecceb710dc442a93818b7d60f38155a9f8cd71b9), [`f4e8b66`](https://github.com/pyreon/pyreon/commit/f4e8b66b3544b00f0ff36c1e64c37a2aec50524e), [`f27477a`](https://github.com/pyreon/pyreon/commit/f27477a681fdc131ea2904940dabb5b8b0e6b9cb), [`76ef68e`](https://github.com/pyreon/pyreon/commit/76ef68efa4daea765ca3eb512be71cc1f7db483c)]:
  - @pyreon/compiler@0.33.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/compiler@0.25.1

## 0.25.0

### Patch Changes

- Updated dependencies [[`32ca446`](https://github.com/pyreon/pyreon/commit/32ca44676723f196cf7cde48f78d49c67a8d34d0), [`9f19029`](https://github.com/pyreon/pyreon/commit/9f190298828b4204a617d30d5b7ae4fedd2b3eb1)]:
  - @pyreon/compiler@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.1

## 0.24.0

### Minor Changes

- [#777](https://github.com/pyreon/pyreon/pull/777) [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - LPIH: zero-config cache path convention. `startLpihPolling()` and `writeLpihCache()` now default to `<cwd>/.pyreon-lpih.json` when called with no path; the LSP server auto-discovers the same file by walking up from the source file to the nearest `package.json`. No env var required for the common case.

  ```ts
  // Before (foundation PR):
  import { startLpihPolling } from "@pyreon/reactivity/lpih";
  startLpihPolling("/tmp/pyreon-lpih.json", 250);
  // + set PYREON_LPIH_CACHE=/tmp/pyreon-lpih.json on the LSP

  // Now (zero config):
  import { startLpihPolling } from "@pyreon/reactivity/lpih";
  startLpihPolling(); // writes to <cwd>/.pyreon-lpih.json
  // LSP auto-discovers; no env var needed
  ```

  **`@pyreon/reactivity/lpih`**:

  - `writeLpihCache(path?)` — `path` is now optional, defaults to `getDefaultLpihCachePath()` (which returns `<cwd>/.pyreon-lpih.json`)
  - `startLpihPolling(path?, intervalMs?)` — same default; throws synchronously if no default can be resolved AND no path given (better than silently never writing)
  - New export `getDefaultLpihCachePath(): string | null` — returns the resolved path or null in environments without `process.cwd()` (web workers, etc.)
  - New export `LPIH_DEFAULT_FILENAME = '.pyreon-lpih.json'` — canonical filename constant

  **`@pyreon/lint`** LSP:

  - `_resolveLpihCachePath(filePath)` — new helper that resolves the cache path for a given source file. Priority: `PYREON_LPIH_CACHE` env (explicit override) → `<project-root>/.pyreon-lpih.json` discovered by walking up to nearest `package.json` (zero-config default) → `undefined` (LPIH inactive)
  - `_findProjectRoot(filePath, maxDepth?)` — memoized walk-up helper. Caches results per-file for the LSP-process lifetime; cleared on `_resetOpenDocuments()`. Synchronous (one `existsSync` per level, typically <10 levels = negligible cost).
  - `_LPIH_DEFAULT_FILENAME` — exported constant locked to `.pyreon-lpih.json` (matches `@pyreon/reactivity/lpih`'s `LPIH_DEFAULT_FILENAME` — a drift gate test in `lsp-lpih.test.ts` validates the agreement).

  **Discovery priority** (matches across writer + reader):

  1. `PYREON_LPIH_CACHE` env var on the LSP (explicit override) — unchanged
  2. `<project-root>/.pyreon-lpih.json` (auto-discovered) — new default
  3. No cache → LPIH inactive (degrades to static Reactivity-Lens hints only) — unchanged

  **Multi-session safety**: each project gets its own cache file under its own `package.json` boundary. Two dev sessions in different projects can't collide silently (was a footgun with the previous shared `/tmp/pyreon-lpih.json` convention from the foundation docs).

  **Tests**: +18 new tests across both packages (8 for the runtime default + 10 for LSP discovery), all green. Bisect-verified: removing the `_resolveLpihCachePath` wiring breaks the "auto-discover" LSP integration test.

  **Docs**: `docs/docs/lpih.md` quickstart updated to the zero-config flow; `.gitignore` mention added; custom-path / env-override examples preserved at the bottom of the page.

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

- [#782](https://github.com/pyreon/pyreon/pull/782) [`cc536f0`](https://github.com/pyreon/pyreon/commit/cc536f071244c0a5f791da899e1bc52b20819f1b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - LPIH: `PYREON_LPIH_PATH_MAP` env var for remote-dev path remapping. In Codespaces, devcontainers, Docker dev, or any setup where the runtime captures paths from one filesystem view (e.g. `/host/proj/src/x.ts`) while the LSP serves files from another (`/workspaces/proj/src/x.ts`), inlay hints used to stay invisible — fire-data file paths never matched the LSP's source-file path.

  Now: `PYREON_LPIH_PATH_MAP=/host/proj=/workspaces/proj pyreon-lint --lsp` rewrites captured paths inside `_readLpihCache` before matching. Multiple mappings via `;` (longest `from` wins; malformed entries silently dropped). The runtime side stays untouched — it keeps capturing its native filesystem paths.

  Closes R7 from the LPIH foundation PR ([#769](https://github.com/pyreon/pyreon/issues/769)) recommendations queue. Bisect-verified: disabling the path-map rewrite in `_readLpihCache` fails 3 of the 53 LSP-LPIH specs (`rewrites file paths via PYREON_LPIH_PATH_MAP-style source`, `applies longest-prefix-wins across multiple rules`, `reads PYREON_LPIH_PATH_MAP from process.env by default`); restored → 53/53. Exposed surface: `_parseLpihPathMap`, `_applyLpihPathMap`, `LPIHPathMapEntry` (`@internal` underscore-prefixed for tests, not stable public API).

### Patch Changes

- Updated dependencies [[`275eb20`](https://github.com/pyreon/pyreon/commit/275eb2038f32374e90c9fe0c3d55f35895f43450), [`47073eb`](https://github.com/pyreon/pyreon/commit/47073ebdd7552c63985f461a663ba98d93538606), [`572212f`](https://github.com/pyreon/pyreon/commit/572212f631907a18b98118f48dea3621dd5a95b1), [`f22902a`](https://github.com/pyreon/pyreon/commit/f22902a9a9c5f5b8a5192da086a6b4299291dd57), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`572212f`](https://github.com/pyreon/pyreon/commit/572212f631907a18b98118f48dea3621dd5a95b1)]:
  - @pyreon/compiler@0.24.0

## 0.23.0

### Minor Changes

- [#743](https://github.com/pyreon/pyreon/pull/743) [`c19084c`](https://github.com/pyreon/pyreon/commit/c19084c6a57ca6651f62acdd584f17ad3a81aaab) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(lint): two new preventative rules distilled from the [#725](https://github.com/pyreon/pyreon/issues/725) → [#741](https://github.com/pyreon/pyreon/issues/741) leak-class sweep

  Adds two preventative lint rules — `pyreon/promise-race-needs-cleartimeout`
  (performance) and `pyreon/init-fn-needs-idempotency` (lifecycle) — that
  would have caught the structural bugs fixed across the 8-PR leak-class
  sweep ([#725](https://github.com/pyreon/pyreon/issues/725), [#729](https://github.com/pyreon/pyreon/issues/729), [#730](https://github.com/pyreon/pyreon/issues/730), [#733](https://github.com/pyreon/pyreon/issues/733), [#734](https://github.com/pyreon/pyreon/issues/734), [#735](https://github.com/pyreon/pyreon/issues/735), [#737](https://github.com/pyreon/pyreon/issues/737), [#739](https://github.com/pyreon/pyreon/issues/739), [#741](https://github.com/pyreon/pyreon/issues/741)) BEFORE
  they shipped.

  ### 1. `pyreon/promise-race-needs-cleartimeout` (performance, warn)

  Flags `Promise.race([work, new Promise((_, reject) => setTimeout(reject,
MS))])` inside a try block where the enclosing `finally` block does NOT
  contain a `clearTimeout` call. The bug class: when `work` wins the race
  (the success path — every healthy invocation), the rejection branch's
  setTimeout fires later, pinning a closure + reject callback for up to
  MS ms. Under sustained traffic, hundreds of pending timers pile up.

  **Caught real cases (would have surfaced at edit time)**:

  - [#734](https://github.com/pyreon/pyreon/issues/734) — `@pyreon/zero` `isr.ts revalidate()` — 30s setTimeout per
    successful revalidation, hundreds piled up under load.
  - [#735](https://github.com/pyreon/pyreon/issues/735) — `@pyreon/zero` `ssg-plugin.ts` per-path render + per-locale
    404 render (×2), 30s setTimeout per successful render.

  **Heuristic**: targets the canonical `new Promise((_, reject) =>
setTimeout(...))` shape used in every real case. Conservative — doesn't
  attempt to detect anonymous-arrow setTimeouts deeply nested in arbitrary
  arguments.

  **Tests (7 specs)**: 3 FIRES (canonical, no-finally, multi-line) + 4
  DOES-NOT-FIRE (clearTimeout present, no setTimeout branch, plain
  setTimeout outside race, no try/catch). **Bisect-verified**: disabled
  the `TryStatement` visitor body → 3 FIRES specs fail with `expected
[] to include 'pyreon/promise-race-needs-cleartimeout'`. Restored →
  7/7 pass.

  ### 2. `pyreon/init-fn-needs-idempotency` (lifecycle, warn)

  Flags an exported `init*` function that:

  1. Has at least one `onMount(...)` call in its body.
  2. Is ALSO called from another function in the SAME module.
  3. Lacks a module-level refcount / boolean guard variable
     (`let _x = 0` / `let _flag = false` / `let _disposeShared = null`).

  **Caught real case**:

  - [#734](https://github.com/pyreon/pyreon/issues/734) — `@pyreon/zero` `initTheme()` ThemeToggle pile-up. `initTheme`
    was exported from `theme.tsx` AND called from `ThemeToggle`'s render
    body, with no refcount guard. Every mounted ThemeToggle registered a
    fresh matchMedia listener + effect (N components → N listeners).

  **Conservative by construction (deliberate FN tolerance)**:

  - Same-module call requirement means cross-module reentrancy is out of
    scope (would need a full project scan, way beyond per-file lint).
    Legit one-shot inits (`initApp()` exported and called only from a
    separate entry file) don't fire.
  - Guard detection looks for module-level `let X = 0|false|null` — the
    refcount / flag patterns the playbook PRs used. A WeakMap-keyed
    dedup wouldn't match, but that's an acceptable false negative.
  - Name pattern `/^init[A-Z]/` only — `useX` / `setupX` / lowercase
    function names skip the rule (those have different semantics in
    Pyreon's component conventions).

  **Tests (7 specs)**: 2 FIRES ([#734](https://github.com/pyreon/pyreon/issues/734) shape, multi-callsite) + 5
  DOES-NOT-FIRE (refcount guard, boolean guard, one-shot init with no
  same-module call, useX hook, init with no onMount). **Bisect-verified**:
  disabled the `Program` visitor's report loop → 2 FIRES specs fail
  with `expected [] to include 'pyreon/init-fn-needs-idempotency'`.
  Restored → 7/7 pass.

  ### Validation

  - `@pyreon/lint` 653/653 tests pass (+14 new — 7 per new rule)
  - Lint + typecheck clean
  - Manifest + CLAUDE.md + lint README + lint docs updated to 82 rules /
    18 categories (lifecycle 5→6, performance 5→6)
  - Doc-claims gate clean (`bun run check-doc-claims`)
  - Generated llms.txt / llms-full.txt / MCP api-reference regenerated
    via `bun run gen-docs`
  - Both rules ship as `warn` severity, present in the `recommended`
    preset by default (matches every other performance/lifecycle rule)

  ### Closes the systemic-prevention arm of [#733](https://github.com/pyreon/pyreon/issues/733)/[#734](https://github.com/pyreon/pyreon/issues/734)'s follow-up sweep

  The fixes-side of the audit-byproducts trail closed in [#735](https://github.com/pyreon/pyreon/issues/735), [#737](https://github.com/pyreon/pyreon/issues/737),
  [#739](https://github.com/pyreon/pyreon/issues/739), [#741](https://github.com/pyreon/pyreon/issues/741) (the 4 MEDIUM patterns from [#733](https://github.com/pyreon/pyreon/issues/733)+[#734](https://github.com/pyreon/pyreon/issues/734)'s audit). These two
  rules close the PREVENTION-side — going forward, the same bug shapes
  fail at edit time instead of shipping.

  Other rule categories the audit surfaced but didn't bottom out:

  - "Wrapper-callable forwards .direct without \_v" — already covered
    by `pyreon/storage-signal-v-forwarding` (existing rule).
  - "Module-level mutable cross-request bleed" (the csp.ts pattern) —
    too context-dependent to detect statically without high FP rates.
    Documented in `.claude/rules/anti-patterns.md` as a manual checklist.

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

- [#751](https://github.com/pyreon/pyreon/pull/751) [`9be148b`](https://github.com/pyreon/pyreon/commit/9be148b21ef6a31a5e5c98ead363f5f532ee0399) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(lint): close the two scope gaps on `pyreon/no-iterate-children-without-resolve`

  PR [#736](https://github.com/pyreon/pyreon/issues/736) shipped the rule with two deliberate scope deferrals: (a)
  variable-bound iteration (`const xs = Array.isArray(X) ? X : [X];
xs.filter(…)`) was only caught at the inline `.METHOD(…)` call site,
  (b) the inner-component foot-gun (outer unwraps `props.children`,
  inner inline-defined component iterates its own `innerProps.children`)
  relied on per-source-path mitigation tracking that was implemented but
  not regression-tested. This PR closes both gaps with bisect-verified
  unit specs.

  ## Gap 2 — variable-bound iteration

  The risky shape now caught:

  ```js
  const Stagger = (props) => {
    const [own] = splitProps(props, ["children"]);
    const xs = Array.isArray(own.children) ? own.children : [own.children];
    const filtered = xs.filter(isVNode); // ← FIRES (was silent pre-fix)
    return h("div", null, ...filtered);
  };
  ```

  Detection: a new per-scope `boundIterationTargets: Map<NAME, sourceKey>`
  records `const NAME = Array.isArray(EXPR) ? EXPR : [EXPR]` bindings
  (parenthesized form supported) at `VariableDeclarator` visit time. The
  `CallExpression` visitor's `MemberExpression`/`ITER_METHODS` branch then
  adds an `Identifier` case: if `obj.name` is in any enclosing scope's
  `boundIterationTargets`, the same risky-iteration flag fires keyed on
  the underlying source path.

  The mitigation contract still wins by source-path:

  ```js
  // Does NOT fire — mitigation tracked per-source-path, applies to bound forms too.
  const resolved = resolveChildren(own.children);
  const xs = Array.isArray(resolved) ? resolved : [resolved];
  xs.filter(isVNode);
  ```

  ## Gap 3 — per-source-path mitigation precision

  The contract was already correct in the rule's `isCovered` lookup (keys
  on `exprKey`, not "any mitigation in scope"), but no regression spec
  locked it in. Added the canonical Outer/Inner shape that exercises it:

  ```js
  const Outer = (props) => {
    const child = resolveChildren(props.children); // mitigates `props.children`
    const Inner = (innerProps) => cloneVNode(innerProps.children, { ref }); // ← FIRES — different source path
    return Inner({});
  };
  ```

  `Outer`'s mitigation marks `unwrappedSources = {'props.children'}` +
  `safeIdents = {'child'}`. `Inner` receives a fresh `innerProps`
  parameter, so `innerProps.children` is a DIFFERENT source key the outer
  mitigation never covered. The function-shape bug fires per-prop-source,
  not per-component-tree, and now has the regression to prove it.

  Bisect-verified at the over-permissive `isCovered` (returns true if ANY
  mitigation exists in scope) — that spec fails; restored → 23/23 pass.

  ## Coverage

  - 4 new unit specs (now 23 total, up from 19): 2 FIRES for Gap 2 + 1
    CONTROL for Gap 2 mitigation + 1 FIRES for Gap 3 cross-component
    precision.
  - Repo sweep across 988 source files in `packages/**` (excluding tests,
    fixtures, manifest.ts) → **0 hits**: no new false positives from the
    broader Gap-2 detection, and no remaining real bugs (consistent with
    PR [#736](https://github.com/pyreon/pyreon/issues/736)'s library-side fixes leaving the tree clean).
  - Gap 1 (Iterator-fallthrough shape: `if (Array.isArray(x)) return
x.map(…); … return renderChild(x)`) remains intentionally out of
    scope — that shape is the precise pattern framework primitives
    (`Dynamic`, `Show`, `Switch`) use with direct `h()` rest args that
    never reach the auto-wrap, so detection would false-positive on
    every primitive's hot path.

  ## Surfaces updated

  - `packages/tools/lint/src/rules/reactivity/no-iterate-children-without-resolve.ts`
    — `ScopeFrame.boundIterationTargets` + `findBoundIteration` helper +
    `VariableDeclarator` extension + `CallExpression` `Identifier` branch
  - `packages/tools/lint/src/tests/no-iterate-children-without-resolve.test.ts`
    — 4 new specs (3 in "FIRES" + 1 in "DOES NOT FIRE (mitigation present)")

- [#733](https://github.com/pyreon/pyreon/pull/733) [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(tools): post-[#725](https://github.com/pyreon/pyreon/issues/725)/[#729](https://github.com/pyreon/pyreon/issues/729)/[#730](https://github.com/pyreon/pyreon/issues/730) leak-class sweep — vue-compat provide/createApp context-stack leaks + lint AstCache unbounded growth

  Audit pass across all 12 `packages/tools/*` packages for the same patterns behind [#725](https://github.com/pyreon/pyreon/issues/725) (position-based pop on shared module-level stack under non-LIFO unmount), [#729](https://github.com/pyreon/pyreon/issues/729) (sibling-unmount LIFO violation), and [#730](https://github.com/pyreon/pyreon/issues/730) (refcount under-count + inflight-cache rejection). Found 3 HIGH suspects + 4 MEDIUM patterns. This PR fixes the three HIGH suspects.

  ### 1. `@pyreon/core` — export `removeContextFrame`

  The internal identity-based stack-frame remover already existed in `packages/core/core/src/context.ts` (used by `provide()` post-[#725](https://github.com/pyreon/pyreon/issues/725)) but wasn't exported. Compat layers and advanced consumers that call `pushContext` directly need this primitive to do safe identity-based cleanup. Now exported alongside `popContext` / `pushContext` from the package root. No behavior change for existing code — purely an additive export.

  ### 2. `@pyreon/vue-compat` `provide(key, value)` — context-stack frame leak (exact [#725](https://github.com/pyreon/pyreon/issues/725) shape)

  Vue's `provide(key, value)` semantics use string/symbol keys with a key→Context registry. The vue-compat implementation pushed a Map onto Pyreon's global context stack and registered `unmountCallbacks.push(() => popContext())` — the _position-based_ `stack.pop()` that [#725](https://github.com/pyreon/pyreon/issues/725) explicitly flagged as unsafe.

  `@pyreon/core/context.ts` documents: _"The `provide()` helper does NOT use this — it uses identity-based removal via `removeContextFrame` because reactive boundaries can push snapshot frames between a component's `provide(ctx, value)` and its eventual unmount, making the top-of-stack unsafe to assume."_ vue-compat bypassed that safety.

  Real-app symptom: two sibling components both call `provide('K', …)`. They unmount in renderer-driven order (keyed `<For>` removing a non-last item, `<Show>` flipping a non-last sibling, route nav unmounting an outer of nested provider chains). The first-unmounted's `popContext` removed the LAST sibling's frame instead of its own; the surviving sibling's frame was orphaned at the top of the global stack forever.

  Fix: capture the frame at push, register `unmountCallbacks.push(() => removeContextFrame(frame))`. Mirror of the framework's own `provide()` fix from [#725](https://github.com/pyreon/pyreon/issues/725).

  ### 3. `@pyreon/vue-compat` `createApp(C).provide(k, v).mount(el)` — app-level provisions pushed but never popped

  `createApp.mount()` ran `pushContext(new Map([[ctx.id, value]]))` for each app-level provision but the returned unmount function only ran `pyreonMount`'s cleanup — leaving the app-level frames on the global stack forever, one per provision per mount cycle.

  Real-app symptom: test harness or app entry calls `createApp(C).provide('A', a).provide('B', b).mount(el)` then unmounts. Two app-level frames stay on the context stack forever. SSG / re-mount cycles compound this.

  Fix: track every pushed frame in a local array during `mount()`, remove each by identity (reverse order) in the returned unmount closure.

  ### 4. `@pyreon/lint` `AstCache` — unbounded growth in LSP / `--watch` sessions

  `AstCache` (used by `lint` programmatic API, the LSP server, and `pyreon-lint --watch`) keyed by FNV-1a hash of source text with `cache: Map<string, …>` and NO eviction strategy. Each entry holds a multi-MB oxc-parsed AST + `LineIndex`. A long-running LSP session editing across many files accumulates one entry per UNIQUE content snapshot ever seen — after hours of editing, hundreds of MB of heap.

  Fix: LRU bound (default 256 entries). `Map` preserves insertion order, so the first key is the least-recently-used. `get` / `set` on an existing key refresh recency by re-inserting at the tail. Apps that lint thousands of distinct files in tight succession can bump the cap via `new AstCache(2048)`.

  ### Regression tests + bisect

  - `packages/tools/vue-compat/src/tests/provide-stack-leak-repro.test.ts` (2 specs) — `createApp().provide().mount(el); unmount()` returns the global context stack to baseline; 100 mount/unmount cycles do NOT accumulate frames. **Bisect-verified**: revert `vue-compat/src/index.ts` → both specs fail with stack-length assertions; restored → pass.
  - `packages/tools/lint/src/tests/ast-cache-lru.test.ts` (5 specs) — cache never exceeds `maxEntries`, evicts LRU on overflow, `get`/`set` refresh recency, re-setting an existing key doesn't double-count, default cap is 256. **Bisect-verified**: revert `lint/src/cache.ts` → all 5 fail; restored → pass.

  ### Validation

  - `@pyreon/core` 510/510 tests pass
  - `@pyreon/vue-compat` 218/218 tests pass (+ 2 new regression specs)
  - `@pyreon/lint` 639/639 tests pass (+ 5 new LRU specs)
  - Lint + typecheck clean across all 3 packages
  - Zero public-API breakage (`removeContextFrame` is a purely additive export)

  ### Audit byproducts (NOT in this PR — deliberately scoped follow-ups)

  The 12-package audit also surfaced 4 MEDIUM-risk patterns documented in the audit report. Each filed-worthy as a separate small follow-up:

  1. **`@pyreon/solid-compat` `createStore` per-path signal map grows unbounded** — one signal per UNIQUE read-path string. Problematic for stores with dynamic key spaces (dictionaries, pagination, logs).
  2. **`@pyreon/solid-compat` `createResource` has the Class-F stale-resolution race** — `fetchPromise` overwritten on refetch with no AbortSignal; old promise's success handler still runs `setData`. Same shape as [#730](https://github.com/pyreon/pyreon/issues/730)-charts/storage inflight-promise bug.
  3. **`@pyreon/svelte-compat` ChildInstance preservation discards `unmountCallbacks` without firing them** — the cached `writable.subscribe` short-circuit doesn't re-register the unsub after the reset. Subtle; needs a targeted reproducer.
  4. **`@pyreon/vite-plugin` per-instance caches (`signalExportRegistry`, `resolveCache`, `pyreonWorkspaceDirCache`, `islandRegistry`) never evict** stale entries when source files are deleted/renamed during a long `vite dev` session. Bounded by source tree size in practice, but no invalidation on file delete.

  Plus 6 LOW-risk patterns (devtools `expandedIds` accumulating across panel session, lint LSP debounceTimers not cleared on didClose, svelte-compat globalThis CTX_REGISTRY, vite-plugin HMR registry never deletes, vue-compat `_contextRegistry` global map, etc.) — none real leaks in practice, all bounded by user surface.

  ### `pyreon doctor` baseline

  Saved at `/tmp/doctor-tools-baseline.json`. 94 findings across `packages/tools/*`: 51 errors + 24 warnings + 19 infos. Top patterns: `lint/pyreon/no-window-in-ssr` (51, mostly devtools Chrome-extension false positives), `lint/pyreon/no-children-access` (10), `lint/pyreon/no-error-without-prefix` (10), `lint/pyreon/no-raw-addeventlistener` (9), `lint/pyreon/no-dom-in-setup` (7). Separate hardening pass; this PR addresses the structural bugs not caught by static lint rules.

- Updated dependencies [[`6454cb7`](https://github.com/pyreon/pyreon/commit/6454cb794bb82db11e7842cb4a62a3765e3dd3ac), [`eea2972`](https://github.com/pyreon/pyreon/commit/eea29723e36088ec32d3e817e0f5f61606c9b949)]:
  - @pyreon/compiler@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.21.0

## 0.20.0

### Patch Changes

- [#656](https://github.com/pyreon/pyreon/pull/656) [`abda63c`](https://github.com/pyreon/pyreon/commit/abda63c541343cfe967a5c70ce223a6675ceaa8e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon-lint` text output now follows the Pyreon brand handoff ([#651](https://github.com/pyreon/pyreon/issues/651)) — CLI spec §6.5 — matching the `pyreon doctor` change.

  New self-contained `lint/src/ansi.ts` (mirrors `@pyreon/cli`'s `doctor/render/ansi.ts`; no shared module — both are separate published packages that deliberately avoid a runtime ANSI dependency). Brand tokens map to their nearest **xterm-256** index, emitted as 8-bit SGR (`38;5;N`) — the handoff mandates _"256-color terminal palette must survive (no truecolor-only colors)"_, so there is no `38;2;r;g;b`. Mapping: error→ember-core `#FF5E1A` (202), warning→ember-warm `#FFC83D` (220), info→cyan `#22D3EE` (45); severity glyphs `✗` / `!` / `ℹ` per §6.5; file path `bold`, loc/ruleId `dim`. Ember stays scarce by construction (only the error + warning severities), as the brand mandates.

  Also closes a pre-existing correctness gap: `reporter.ts` previously emitted raw ANSI (`\x1b[31m`) **unconditionally** — colored output even when piped to a file or under `NO_COLOR`. `ansi.ts` adds the standard gate (`NO_COLOR` → off, `FORCE_COLOR=0/set` → off/on, else `process.stdout.isTTY`), parity with the doctor renderer.

  `--format json` and `--format compact` are untouched (machine formats, never colored). Verified: dependency-free proof the emitted codes are exactly `38;5;{202,220,45}` with zero `38;2` truecolor, and `NO_COLOR` yields plain text; `@pyreon/lint` reporter tests 10/10 pass; oxlint clean.

- Updated dependencies [[`c3df9db`](https://github.com/pyreon/pyreon/commit/c3df9dbbcf9e939c92e1c4843b59686cdd25589e), [`9a54705`](https://github.com/pyreon/pyreon/commit/9a54705c645ff2c3bee54fa8c6d411d1530b3187), [`bbccaaf`](https://github.com/pyreon/pyreon/commit/bbccaaf3ec2f5dc3eed3e7195a09023fc59575d1), [`24a063c`](https://github.com/pyreon/pyreon/commit/24a063ccfa2ef267927dfd68886be24c397ccd72), [`a086769`](https://github.com/pyreon/pyreon/commit/a0867699bdeca87f34e60fef7aa867a75a24d815), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7)]:
  - @pyreon/compiler@0.20.0

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
