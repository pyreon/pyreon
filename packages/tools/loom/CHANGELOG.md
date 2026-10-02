# @pyreon/loom

## 0.52.0

### Minor Changes

- [#2788](https://github.com/pyreon/pyreon/pull/2788) [`6288cb8`](https://github.com/pyreon/pyreon/commit/6288cb8171a9b9373dc2f932fc999082cd17ddd3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `loom build` prerenders the observatory to a standalone static site — one page per view, deployable to any static host or openable from disk.

  The observatory is now a `@pyreon/zero` app, so the five views are real fs-routes (`/`, `/matrix`, `/cycles`, `/impact`, `/manifests`) instead of a `view` signal. Until now there was no way to send someone a link to the cycles view; now every view has a URL, its own prerendered page, and its own chunk. The view tabs render as real links when the host supplies `hrefFor`, and `mountObservatory` is unchanged — both new `<Observatory>` props are optional and default to today's behaviour.

  `@pyreon/zero`, `head`, `router`, `runtime-server` and `server` join `vite` and `@pyreon/vite-plugin` as OPTIONAL peers: the app root has to resolve zero's own graph (bun's isolated layout does not expose it transitively), but `loom scan` — the CI gate and the command most people run — still needs none of them, and `loom build` names the whole set when they are absent.

### Patch Changes

- [#3602](https://github.com/pyreon/pyreon/pull/3602) [`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The repo's contributor rules moved from `.claude/rules/` to `.agents/rules/`, and the agent instructions from `CLAUDE.md` to `AGENTS.md`, so they work with any coding agent. Tools that read those files now look in the new places: the MCP `get_anti_patterns` and `get_browser_smoke_status` tools, the lint rule `pyreon/require-browser-smoke-test`, and the `pyreon doctor` doc-claims gate. Messages and comments that pointed at the old paths are updated.

  The six `@pyreon/native-*` packages no longer describe themselves on npm as "PRIVATE / EXPERIMENTAL" or "Not published"; they are published, and their descriptions now say what each one is.

  `@pyreon/mcp`: `get_content_collection` and `get_content_entry` were registered and callable but missing from the manifest, so `mcp_overview` and the API reference did not list them. They are listed now, and `check-mcp-docs` fails when a registered tool and the manifest disagree in either direction.

- [#3638](https://github.com/pyreon/pyreon/pull/3638) [`a92fd69`](https://github.com/pyreon/pyreon/commit/a92fd69a81dde9b99ca8585e213454fbf399b7f5) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Type the workbench and observatory theme through rocketstyle's `withTheme<Tokens>()` instead of casts.

  `rs` / `el` / `txt` from `@pyreon/atlas/ui` are now bound to Atlas's `ThemeTokens`, so a catalog built on them gets a typed, checked `t` in every `.theme()` and dimension callback. **Breaking:** the `dim` adapter is removed from `@pyreon/atlas/ui`; write `.states((t) => …)` directly, since `t` is now typed.

- [#2704](https://github.com/pyreon/pyreon/pull/2704) [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration).

- [#3675](https://github.com/pyreon/pyreon/pull/3675) [`153bb4b`](https://github.com/pyreon/pyreon/commit/153bb4b7da3d3b13d61aa588c6302d4ca7650948) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Accuracy fixes found by a docs audit:

  - `@pyreon/zero-content`: a directive opener with bare text after the name (`:::caution Title`, `:::details Label`, `:::math inline`) now warns for ANY name, not only the five callout types — an unknown name never became a directive, so it shipped as literal `:::caution …` text with no diagnostic. `:::math`, `:::mermaid` and `:::details` no longer emit a spurious "Unknown callout directive" warning.
  - `@pyreon/loom`: `loom --help` now lists `dev` (it was missing) and files `--json` under `scan`, where it applies.
  - `@pyreon/cli`: `pyreon loom` help and docstring name all three loom commands (`scan`, `dev`, `build`).
  - `@pyreon/lint`: `prefer-canonical-primitive` no longer cites a stale primitive count; `prefer-isserver`'s JSDoc no longer claims the rule is not auto-fixable.

- [#3669](https://github.com/pyreon/pyreon/pull/3669) [`c95ea09`](https://github.com/pyreon/pyreon/commit/c95ea0941a5a09cd9b14e817b09c857ce64b1112) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Docs/manifest accuracy pass over the ui-system and tools packages — no runtime changes.

  - `@pyreon/ui-core`: manifest grew from 6 to 18 `api[]` entries, now covering every real export — `init`, the descriptor-safe `get`/`set`/`merge`/`pick`/`omit`/`isEmpty`/`isEqual` utilities, `throttle`, `compose`, `resolveSlot`, `isPyreonComponent`, `render`, `useStableValue`, `HTML_TAGS`/`HTML_TEXT_TAGS`, the `getThemeEngine`/`setThemeEngine` theme-engine registration seam, and `resolveCssVariables`. The deprecated internal `Provider`/`context` are now called out in `gotchas`.
  - `@pyreon/unistyle`: manifest grew from 11 to 14 entries — added `values`, and the Custom-Property Style Extraction (CPSE) primitives (`cpseRewrite`/`cpseVarName`/`extractStyleVar`, `cpseStyled`) that were previously undocumented despite backing the `styleExtraction: true` opt-in.
  - `@pyreon/atlas`: added `atlas init`, `atlas check`, and `defineAtlas` manifest entries — three real CLI/API surfaces that had zero documentation on the manifest or the docs site. Corrected `defineAtlas`'s description: it types `createAtlas()`'s programmatic options, not the wider `atlas.config.ts` file convention (a real, easy-to-hit type mismatch if conflated).
  - `@pyreon/lathe`: added `resolveProjects`, `resolveTransform`, and `worstVerdict` manifest entries (referenced in existing examples but previously undocumented).
  - `@pyreon/lint`: added the `lintAsync` manifest entry (the worker-pool sibling of `lint()`, used by the CLI itself for large runs).
  - `@pyreon/loom`: added the `loom build` manifest entry — a real, shipped CLI command (static-site export of the observatory) that was missing from both the manifest and the docs site.

  Docs-site fixes:

  - `docs/elements.md`: documented the previously-unexplained `contentDirection`/`contentAlignX`/`contentAlignY` trio (governs a SIMPLE Element's layout, default `'rows'`) and the per-slot `beforeContentDirection`/`afterContentDirection` trio, and clarified that the existing `direction`/`alignX`/`alignY` props only apply once `beforeContent`/`afterContent` make an Element compound — passing `direction` alone on a simple Element was silently a no-op with no explanation anywhere in the docs.
  - `docs/ui-core.md`: added the theme-engine registration seam section (`getThemeEngine`/`setThemeEngine`) and fixed a broken internal anchor link.
  - `docs/atlas.md`: added `atlas init` and `atlas check` sections — both real, documented-in-`--help` commands with zero prior coverage; renamed the stale "The four commands" heading (five sub-sections were already documented, plus two more added here).
  - `docs/loom.md`: added the `loom build` section.
  - `docs/lathe.md`: added the `lathe pull` section and a full CLI flags reference (`--target`, `--base-url`, `--client`, `--validator`, `--strict-native`, `--fail-on-breaking`, `--watch`), none of which were previously documented on the docs site despite being real, shipped flags.

- [#2796](https://github.com/pyreon/pyreon/pull/2796) [`bdee35d`](https://github.com/pyreon/pyreon/commit/bdee35d2915b34a31dbf3a7e184bccaf4a014a07) Thanks [@vitbokisch](https://github.com/vitbokisch)! - zero's nested SSR/SSG build now inherits the user's `pyreon()` transform options

  `mode: 'ssg' | 'ssr' | 'isr'` runs a nested Vite build over the same source. It
  cannot forward the outer `pyreon` plugin instance — a second `configResolved`
  rewrites captured output paths — so it constructs a fresh one, and that call was
  a bare `pyreon()`. Every transform option applied to the client graph and
  silently did not apply to the SSR graph.

  `ssrTemplate` was the sharpest case: it shapes only the SSR emit, so the SSR pass
  is the one place it does anything, and the one place it was dropped.
  `pyreon({ ssrTemplate: false })` in an SSG app was a no-op — `@pyreon/loom`'s
  static-site build hit this and carried a comment saying so.

  The plugin now publishes its options on its Vite `api` field
  (`PyreonPluginApi`), and zero carries the transform-shaping subset across:
  `compat`, `ssrTemplate`, `islands`, `jsxAutoImport`, `compileValidators`,
  `optimizeValidators`.

  Deliberately withheld, because forwarding them would mis-steer the sub-build:
  `ssr.entry` (its `config()` return sets `build.rollupOptions.input`, which beats
  the inline `build({ … })` argument — it would compile the user's server entry
  instead of the synthetic one zero wrote), `collapse` (client-graph-only, and it
  spawns its own nested build), and `lpih` / `devErrorPrinter` (dev-server-only).

  The split is typed as a total `Record` over `keyof Required<PyreonPluginOptions>`,
  so a newly added option is a typecheck error until it is classified rather than
  silently inheriting the wrong default.

- [#3121](https://github.com/pyreon/pyreon/pull/3121) [`ec0aff6`](https://github.com/pyreon/pyreon/commit/ec0aff6672efcac6f135b1f32b0b7e72e96db08c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Role-aware rule tiers — one config now covers server, client, isomorphic and
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

- [#2854](https://github.com/pyreon/pyreon/pull/2854) [`9ea3bc0`](https://github.com/pyreon/pyreon/commit/9ea3bc0105d1d867a86cee578b8e124caef41754) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `loom build` now forces `NODE_ENV=production` for the build (restoring the caller's value afterwards), so a stray value in the environment can no longer produce a non-production site.

  `vite build` sets `NODE_ENV` only when it is UNSET, and Vite derives `isProduction` from that variable — not from `mode`, so passing `mode: 'production'` does not help. Any caller with `NODE_ENV` already set (`development` in a dev shell, `test` under any test runner) therefore got a site with every `process.env.NODE_ENV !== 'production'` branch in Pyreon still in the bundle: dev-only lifecycle warnings shipped to users, and 3894 MB of build memory against 952 MB.

  Vite's behaviour is right for a general-purpose command, where `NODE_ENV=staging` may steer a user's own config. Nothing here can — the build runs `configFile: false`, so no user config is loaded and nothing legitimate reads the value, and `loom build` has no dev variant.

  This also fixes an intermittent `Coverage (Full)` failure on main: the suite's in-process build inherited vitest's `NODE_ENV=test` and peaked just under node's ~4 GB old-space cap, so the worker died and vitest attributed it to whichever spec was in flight — reported as a failure in `strip-equivalence`, which was innocent. The build now runs as a spawned subprocess (exercising the shipped bin and built `lib/`), and a new spec asserts the emitted bundle is production even though the spawn inherits `NODE_ENV=test`.

- [#3621](https://github.com/pyreon/pyreon/pull/3621) [`b47e041`](https://github.com/pyreon/pyreon/commit/b47e041753e57fb38a26c1a57f15349c770c2727) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `loom` now fails loudly where it used to give a wrong answer.

  - A scan that finds no workspace packages exits 1 instead of reporting "fabric clean". Run from inside a member package, the error names the workspace root to scan instead.
  - Unknown or misspelled flags and `loom` config keys are errors with a did-you-mean. Options accept `--out site` as well as `--out=site`; before, the spaced form was read as the directory argument.
  - `--port` is validated. Without it, `loom dev` uses 5230 or the next free port instead of failing.
  - `loom dev` reports with the same settings `loom scan` resolves from `pyreon.config.*`, shows an error page when a rescan fails, and keeps its own Vite dependency cache so it no longer invalidates the project's.
  - `loom build` writes to `<dir>/loom-dist` by default, prints one line, and no longer ships `.vite/` or `_pyreon-ssg-paths.json`.
  - Added `--version` and `loom <command> --help`; the help now documents `dev` and `--port`. `loom scan | head` no longer prints an EPIPE stack trace.

  In `@pyreon/zero`, informational build output (the prerender line, the route-mode table, the build summary) now goes through Vite's logger and respects `logLevel`. The SSG server bundle's chunks use `.mjs` like its entry, so Node no longer asks you to add `"type": "module"` to your own `package.json`.

- [#3612](https://github.com/pyreon/pyreon/pull/3612) [`0005029`](https://github.com/pyreon/pyreon/commit/000502927b91ec561ffba757a71f85bd62010cd3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `loom scan` no longer misreads two JavaScript shapes. A regex literal holding a quote (`/'/`) used to open a string and flip string/code state for the rest of the line, which could hide a real import or report one written inside a string. A template nested in an interpolation (`${`…`}`) used to end the outer template early and expose the inner template's text as code. Both could produce a false `phantom-dep` or miss a real dependency. Regexes are now recognised by the usual lexical rule (after an operator, an opening bracket or a keyword), and interpolations are walked as code, including nested templates, strings, comments and regexes.

- [#3622](https://github.com/pyreon/pyreon/pull/3622) [`6bb2ade`](https://github.com/pyreon/pyreon/commit/6bb2ade11cdb51c3980ea6180d6e2c895141b759) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Scanner correctness fixes in `loom scan`:

  - `lib/` and `dist/` are skipped only at a package's root. A nested `src/lib/` is ordinary source and is now scanned, so dependencies used only there are no longer reported as `unused-dep` and undeclared imports there are no longer missed.
  - A `package.json` that exists but is not valid JSON now fails the scan with `[Pyreon] loom: <path> is not valid JSON: <reason>`. Previously a malformed member was silently dropped (its siblings then saw it as an external package) and a malformed root was reported as "no package.json".
  - `typeof import('x')` is recognized as a type query, not a runtime import.
  - Identifiers or methods that merely end in a keyword (`myrequire('x')`, `reimport('x')`, `loader.import('x')`) are no longer recorded as imports.
  - `!negation` workspace globs are matched as globs, not literal paths.
  - `pnpm-workspace.yaml` is read for the `packages:` key only (block or flow form); lists under other keys such as `onlyBuiltDependencies` no longer become workspace globs.
  - A dependency declared in both `dependencies` and `peerDependencies` produces one graph edge instead of two.
  - A package whose root `tsconfig*.json`, or a `.json` it publishes through `exports`, sets `compilerOptions.jsxImportSource` now counts that package as used, so a TypeScript preset package is no longer told its JSX runtime dependency is unused.

- [#3457](https://github.com/pyreon/pyreon/pull/3457) [`20a7696`](https://github.com/pyreon/pyreon/commit/20a7696b3b8b0977f1abdd8bdba6d8570617d948) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix `phantom-type-dep` never firing for a package with no runtime imports.

  `detectPhantoms` opened each package with `if (!prod) continue`, which skipped
  the whole package — and the TYPE-only scan below it — whenever `imports.prod`
  had no entry for that name. A package whose runtime imports are all relative,
  or all already declared, has no entry there at all, so its undeclared
  `import type` specifiers were never checked.

  That is exactly the shape where `phantom-type-dep` is the only finding
  available: a types-heavy package, or one whose bare specifiers are all
  type-only, was silently exempt from the detector written for it.

  The prod map now defaults to empty instead of skipping the package, so the
  type-only pass runs regardless. No change for packages that already had
  runtime imports.

- [#3627](https://github.com/pyreon/pyreon/pull/3627) [`b28e614`](https://github.com/pyreon/pyreon/commit/b28e6149e41dd5882a7ea18f64a2dd57c8256175) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Observatory UI: instant interactions, responsive layout, and a polished static build.

  - **Matrix**: renders only edge cells in a CSS grid (~1.3k nodes instead of ~23k) and drives selection through one stylesheet, so a selection change costs ~7 ms instead of a 2.5–3.9 s freeze. Sticky row/column headers, a selection crosshair, foundations-first ordering (back-edges sit above the diagonal), scroll reset on entry.
  - **Graph**: built once per shown set; hover and selection no longer recreate the SVG. Selection moved by ↑/↓ or ⌘K is scrolled into view (sidebar and graph). External labels keep their scope and truncate in the middle.
  - **⌘K** owns its own query — typing no longer re-filters the sidebar and graph behind the dialog — and caps rendered hits at 50. Result names are readable in dark mode; the field no longer draws a square outline over the `esc` hint.
  - **Manifest** is a real table with aligned columns and a sticky header (the grid-on-a-button layout stacked every cell).
  - **Theme** follows `prefers-color-scheme`, remembers the toggle, and sets the page background; light-mode contrast raised.
  - **Mobile**: sidebar and detail panel become drawers, tabs scroll horizontally, the graph gets the screen.
  - **Static build** (`loom build`): now ships the fonts, the page reset and the graph/matrix styles (previously only `loom dev` injected them), and carries the selection across tab navigations in the URL hash. The matrix page drops from 1.2 MB to ~330 KB.
  - `loom dev` serves the UI with Pyreon's production gate folded, removing ~330 ms of dev-only instrumentation from the first mount.
  - Detail panel and manifest show info-severity findings alongside errors and warnings.

- [#2752](https://github.com/pyreon/pyreon/pull/2752) [`e0e0dc0`](https://github.com/pyreon/pyreon/commit/e0e0dc066470e92066652ccbd739ae0d6e518c58) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Eight README examples are now typechecked in CI.

  `check-doc-examples` only ever looked at `docs/src/content/docs/**`; package READMEs carry ~550 `ts`/`tsx` blocks and nothing verified any of them. The gate now walks package READMEs too, and each of these packages has one verified-clean example opted in with the `// @check` marker.

  Each was compiled before being marked, not marked and then debugged. No content changed — the marker is a comment inside the fence.

- [#3557](https://github.com/pyreon/pyreon/pull/3557) [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stop publishing the build's bundle-analysis report.

  `vl_rolldown_build` writes an HTML treemap per entry into `lib/analysis/`, and
  54 packages published it: every install downloaded a build report (258 KB for
  `@pyreon/charts`) that is not part of the package. Their `files` now exclude
  `lib/analysis`, as ten packages already did. `pyreon doctor`'s distribution
  gate enforces it twice: a `vl_rolldown_build` package that publishes `lib`
  must exclude the report, and the live `npm pack --dry-run` probe fails if the
  tarball carries one.

- Updated dependencies [[`089064b`](https://github.com/pyreon/pyreon/commit/089064b8f9c98b297b2f7897a3721695be6cd1d2), [`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338), [`1a64907`](https://github.com/pyreon/pyreon/commit/1a64907717ca2734bedaceceda00d368e0c0f2a9), [`d5f19b9`](https://github.com/pyreon/pyreon/commit/d5f19b9700962305b1cc4fd0e5da603ec884e759), [`fdd4dc2`](https://github.com/pyreon/pyreon/commit/fdd4dc2aef317b1c177f9751fcffb6d88554ff92), [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac), [`8563e97`](https://github.com/pyreon/pyreon/commit/8563e97ee5fd91daa6d74547c712ae6b71cffb47), [`ed98e38`](https://github.com/pyreon/pyreon/commit/ed98e380716dacea266b65e25394b5157265a415), [`fdd4dc2`](https://github.com/pyreon/pyreon/commit/fdd4dc2aef317b1c177f9751fcffb6d88554ff92), [`fdd4dc2`](https://github.com/pyreon/pyreon/commit/fdd4dc2aef317b1c177f9751fcffb6d88554ff92), [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`9045709`](https://github.com/pyreon/pyreon/commit/9045709020995c37692eb2a9a6ecd65f6b8c6e30), [`890f785`](https://github.com/pyreon/pyreon/commit/890f785acfeaed76836d925a2ff61e5169b97789), [`be6a2a4`](https://github.com/pyreon/pyreon/commit/be6a2a401520331b04f38c894f6ffafe5b454a35), [`57b94ed`](https://github.com/pyreon/pyreon/commit/57b94ed8cd4b2aa9d5bd16e52d39edcdb7056c62), [`1c70f68`](https://github.com/pyreon/pyreon/commit/1c70f68b69a7e9f60eb7d565bf8797a155353743), [`99a1888`](https://github.com/pyreon/pyreon/commit/99a188821c005c4750c3daf98fd2d0863a0e3b58), [`e56abb6`](https://github.com/pyreon/pyreon/commit/e56abb6b44873164473b085e0e64838e7d9e7012), [`79c1bf1`](https://github.com/pyreon/pyreon/commit/79c1bf13b1d8eb8fd65df9ff2d8fece58bed1aa0), [`c4c2d52`](https://github.com/pyreon/pyreon/commit/c4c2d5232856e31b733dbc992ea8cbb37201f53f), [`6bf2770`](https://github.com/pyreon/pyreon/commit/6bf2770d8d25e02aa853ac249b6c07923dac001d), [`ea669a1`](https://github.com/pyreon/pyreon/commit/ea669a11028d7067e80b8c59bb2f5d35d5cbda1b), [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93), [`96426be`](https://github.com/pyreon/pyreon/commit/96426bef7ac3c86cf60ab898813dde449b1b0954), [`a6e97cb`](https://github.com/pyreon/pyreon/commit/a6e97cb4c0ee97dbc405900d4d9655f8fd81937a), [`c95ea09`](https://github.com/pyreon/pyreon/commit/c95ea0941a5a09cd9b14e817b09c857ce64b1112), [`fc0f445`](https://github.com/pyreon/pyreon/commit/fc0f445c4bf32e5b04355fa17ec5a938e9a05448), [`9f02726`](https://github.com/pyreon/pyreon/commit/9f0272677bd083fb50998335257e31e44766e85d), [`1f3d974`](https://github.com/pyreon/pyreon/commit/1f3d974dd15cbc1151dab8a3d31c112465bbbd81), [`cc455e8`](https://github.com/pyreon/pyreon/commit/cc455e84d9ed7d682d963d44b25cd3c4bb89c7c8), [`6a7c0f1`](https://github.com/pyreon/pyreon/commit/6a7c0f1bb21f285fce47fe67492ce9a14c20fd6a), [`1431b7b`](https://github.com/pyreon/pyreon/commit/1431b7bc0f5e3b984ba2884674c8b998b0131bb4), [`ce16224`](https://github.com/pyreon/pyreon/commit/ce1622481cb8e11f3d2abe8df1cc290003018a13), [`a156c40`](https://github.com/pyreon/pyreon/commit/a156c4069ad6882d9e402efa552566dd5714b94d), [`a6e9c1a`](https://github.com/pyreon/pyreon/commit/a6e9c1a428aaec7de6d6ecd76e7601d2c7f41b48), [`215768a`](https://github.com/pyreon/pyreon/commit/215768ae52a01c22d4c6a428b5e62c8a6e83a6eb), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`9b1b20a`](https://github.com/pyreon/pyreon/commit/9b1b20ad8b5deb842079927bba39068749757cc6), [`4b40ea0`](https://github.com/pyreon/pyreon/commit/4b40ea0a0b88b467c61c737f385a3253c946368f), [`4234788`](https://github.com/pyreon/pyreon/commit/423478813e018e7974b1dbd07525772cc5164754), [`4234788`](https://github.com/pyreon/pyreon/commit/423478813e018e7974b1dbd07525772cc5164754), [`43d769d`](https://github.com/pyreon/pyreon/commit/43d769d04237ece6e20b90a4499bed14c2b3b03e), [`ce16224`](https://github.com/pyreon/pyreon/commit/ce1622481cb8e11f3d2abe8df1cc290003018a13), [`1a7ca7e`](https://github.com/pyreon/pyreon/commit/1a7ca7ef1f982e43e2564e805a980d0a45385b73), [`c0e9e9c`](https://github.com/pyreon/pyreon/commit/c0e9e9cad5ac2cd077ca00fcd51648cee47d9fa5), [`18bc355`](https://github.com/pyreon/pyreon/commit/18bc355db06ba5f8e2eabcc6a5e68d82387d3b95), [`88e7dff`](https://github.com/pyreon/pyreon/commit/88e7dffbba6223c776e47bb01a0600fedf8f2fab), [`cb15c01`](https://github.com/pyreon/pyreon/commit/cb15c012632b66ea26b777087251aa906006a168), [`75a47dd`](https://github.com/pyreon/pyreon/commit/75a47dd93736933a941109d9a844099a54bdf58a), [`cf50c79`](https://github.com/pyreon/pyreon/commit/cf50c79668fa46510df17f76906520c53d6e0e4a), [`bdee35d`](https://github.com/pyreon/pyreon/commit/bdee35d2915b34a31dbf3a7e184bccaf4a014a07), [`2b12889`](https://github.com/pyreon/pyreon/commit/2b12889546e64765a9c83c961e64c236f7b6dd76), [`80135d8`](https://github.com/pyreon/pyreon/commit/80135d80f82ea0f5f1c25da1f44512b8214529ea), [`99a1888`](https://github.com/pyreon/pyreon/commit/99a188821c005c4750c3daf98fd2d0863a0e3b58), [`8c8c43d`](https://github.com/pyreon/pyreon/commit/8c8c43deeb2b68a4d8b29ffdfe3890f7df94a888), [`0c77007`](https://github.com/pyreon/pyreon/commit/0c770074bd90515a3203bf41d1bd8bf5e3f01bef), [`71fbf23`](https://github.com/pyreon/pyreon/commit/71fbf23042b7ae852817dfa83ebecf1c9c85cca8), [`ce16224`](https://github.com/pyreon/pyreon/commit/ce1622481cb8e11f3d2abe8df1cc290003018a13), [`f2194d5`](https://github.com/pyreon/pyreon/commit/f2194d544ca7fc10dcc64b2aeb1c97dc923eabfe), [`b976aa0`](https://github.com/pyreon/pyreon/commit/b976aa02bd47feceb8c3fe574edf676dc190ae37), [`fc91492`](https://github.com/pyreon/pyreon/commit/fc91492c18cba19e38811486884eba76a46ef832), [`bcb04bd`](https://github.com/pyreon/pyreon/commit/bcb04bd844bd46bb8f30760e269f38746e911b5e), [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb), [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5), [`2a85027`](https://github.com/pyreon/pyreon/commit/2a85027c190335e782bd581b5856ae2ef783207d), [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5), [`c41314d`](https://github.com/pyreon/pyreon/commit/c41314da54f7217a4a63cd0d6ec07583fd431001), [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb), [`e6b70a5`](https://github.com/pyreon/pyreon/commit/e6b70a5c80ed7c9f338a6a750296ebe89e9dd9c2), [`cbd6459`](https://github.com/pyreon/pyreon/commit/cbd6459970423b7f7d94883685ae7c753895f1d9), [`ec0aff6`](https://github.com/pyreon/pyreon/commit/ec0aff6672efcac6f135b1f32b0b7e72e96db08c), [`ce819ca`](https://github.com/pyreon/pyreon/commit/ce819cadd41f50af25200da1cc130a35c52ab523), [`b47e041`](https://github.com/pyreon/pyreon/commit/b47e041753e57fb38a26c1a57f15349c770c2727), [`1275e17`](https://github.com/pyreon/pyreon/commit/1275e1726fed67b467377db956fda44827161589), [`ea4e50a`](https://github.com/pyreon/pyreon/commit/ea4e50ab7d97d84f2bd5518ea747280c34805611), [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f), [`9fe7be2`](https://github.com/pyreon/pyreon/commit/9fe7be2e14c2e42c79bd9267c410b9b4ebcc7676), [`fc0d636`](https://github.com/pyreon/pyreon/commit/fc0d636583d09a649c95d308d59b815a96a76a79), [`0764bf0`](https://github.com/pyreon/pyreon/commit/0764bf02cb3cc21881fbdebeabab9df35e13b7d7), [`408b9b5`](https://github.com/pyreon/pyreon/commit/408b9b5324bb06acd528abf9d21642bb93beb732), [`39db4ce`](https://github.com/pyreon/pyreon/commit/39db4ce30422821ac781e72d7cc27f43ac523e17), [`84e7444`](https://github.com/pyreon/pyreon/commit/84e7444cbde8b3f0259a1bdc91674d893d19d26c), [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50), [`1a64907`](https://github.com/pyreon/pyreon/commit/1a64907717ca2734bedaceceda00d368e0c0f2a9), [`290a386`](https://github.com/pyreon/pyreon/commit/290a38675f6363ac6f8f8d24cab47a70ca081af9), [`ddd9586`](https://github.com/pyreon/pyreon/commit/ddd95868e9a865face6c204559df037c2eadcf41), [`411a373`](https://github.com/pyreon/pyreon/commit/411a3735a340bae20370de806eb3650b153b05ce), [`8a855d5`](https://github.com/pyreon/pyreon/commit/8a855d54a758f19d912152acc23beebb82c5ab14), [`d114ff8`](https://github.com/pyreon/pyreon/commit/d114ff8c83ac98acb0c421d0ee3217e43d4d713b), [`c9e2e3e`](https://github.com/pyreon/pyreon/commit/c9e2e3e44c5f1a1b00cdd2861b8b5bfa48cdded4), [`f8d6aae`](https://github.com/pyreon/pyreon/commit/f8d6aae6083c37a4d4aecde91d51979a1d3a5694), [`1612ed1`](https://github.com/pyreon/pyreon/commit/1612ed15b80c220d049212b0f62dabccb45aa9e9), [`50d9324`](https://github.com/pyreon/pyreon/commit/50d93245d8e28ba0a3c8217bd83a50d3dd6719d3), [`317367a`](https://github.com/pyreon/pyreon/commit/317367a9ade57b9aefd036441ebb397c8e3d1dc2), [`5c5e246`](https://github.com/pyreon/pyreon/commit/5c5e246832453a94e5ce112d11c9109d800d2889), [`384cb23`](https://github.com/pyreon/pyreon/commit/384cb23669ef897b74206c9441b8982a71729367), [`5867cca`](https://github.com/pyreon/pyreon/commit/5867cca15becbf4811effac32e81bdb3dc0a0d86), [`600f763`](https://github.com/pyreon/pyreon/commit/600f763fbd41493dd72812d875696a0ab3f2c623), [`1025315`](https://github.com/pyreon/pyreon/commit/1025315701d7eb0a2bea2958252c3a0efda34b29), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`4f75a72`](https://github.com/pyreon/pyreon/commit/4f75a72ebbc4223a88d9ffc2ce950d962aa973a4), [`773f9df`](https://github.com/pyreon/pyreon/commit/773f9dfaafaed05a06b252b1f83a0f7d970dbb8d), [`3dba9dc`](https://github.com/pyreon/pyreon/commit/3dba9dceec5dc96c34686b70604b6d79939655a2), [`d98b60d`](https://github.com/pyreon/pyreon/commit/d98b60d48ec42e1cf4cc6f22e20262000384676a), [`e44dcc7`](https://github.com/pyreon/pyreon/commit/e44dcc7124a5617f95ddb69786be262a35280d5f), [`768f104`](https://github.com/pyreon/pyreon/commit/768f104018ced7568dde1c99990a21c273e924ec), [`e0e0dc0`](https://github.com/pyreon/pyreon/commit/e0e0dc066470e92066652ccbd739ae0d6e518c58), [`87b581a`](https://github.com/pyreon/pyreon/commit/87b581a6a28433116c9a6c8364fbb8e3cab15760), [`b0761a2`](https://github.com/pyreon/pyreon/commit/b0761a24e1a27e66eb7daed9bb53aeed693bd30b), [`0d4ebbf`](https://github.com/pyreon/pyreon/commit/0d4ebbf8a0c2ed015ee5fd29ff772cf66e7e0eb2), [`0e434c8`](https://github.com/pyreon/pyreon/commit/0e434c89a2d317a2862d56cc8d1e623a68d9b332), [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac), [`78f9652`](https://github.com/pyreon/pyreon/commit/78f965269befa8060db6661e9ce586f3d10c5337), [`c52e915`](https://github.com/pyreon/pyreon/commit/c52e915f03b8f7322a5e993ee50e8dfb653e8b58), [`1e6c0f2`](https://github.com/pyreon/pyreon/commit/1e6c0f26e906bb3628f37a663456d572985ea61d), [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c), [`a92fd69`](https://github.com/pyreon/pyreon/commit/a92fd69a81dde9b99ca8585e213454fbf399b7f5), [`80e2ce2`](https://github.com/pyreon/pyreon/commit/80e2ce2a77551338b3bf58c5bb6ef88236e5e285), [`6b84f8a`](https://github.com/pyreon/pyreon/commit/6b84f8aeca2303abb29e4a70b35cc664f790d256), [`db410a0`](https://github.com/pyreon/pyreon/commit/db410a0c599fde5df971c2d4ba3d95e18f7f62fb), [`a0611c4`](https://github.com/pyreon/pyreon/commit/a0611c4d5a9afa2472502f5d932e1ac152861e1e), [`b030408`](https://github.com/pyreon/pyreon/commit/b0304087973b540fa75fc0d627fd3a1dd120d1c1), [`4f75a72`](https://github.com/pyreon/pyreon/commit/4f75a72ebbc4223a88d9ffc2ce950d962aa973a4), [`c52e915`](https://github.com/pyreon/pyreon/commit/c52e915f03b8f7322a5e993ee50e8dfb653e8b58), [`f904416`](https://github.com/pyreon/pyreon/commit/f9044167f2716c658cc8b68fa2c1bde763ce328e), [`b047088`](https://github.com/pyreon/pyreon/commit/b047088bb852d53f740802a3dd388890b03cc7f9), [`9593fbc`](https://github.com/pyreon/pyreon/commit/9593fbc44375cc00f57865790a798bd53e479551), [`7c0d3cb`](https://github.com/pyreon/pyreon/commit/7c0d3cb9c7f158a0ce308fea3da9a7b487635b9a), [`24c4019`](https://github.com/pyreon/pyreon/commit/24c4019d3e2527bf063d65d62bf574b00965d1e4), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`c5c44b8`](https://github.com/pyreon/pyreon/commit/c5c44b811a413688d34bd96ee7dda367d75d8b03), [`e5b71bd`](https://github.com/pyreon/pyreon/commit/e5b71bd064c94914001644f1bbafafc3c2b97559), [`d0e57b2`](https://github.com/pyreon/pyreon/commit/d0e57b27ccbf9b4b90521235186a003f3d6bc3ca), [`6c9e618`](https://github.com/pyreon/pyreon/commit/6c9e6189660eee8d672825d6b6fc905155db2f9e), [`531d7a1`](https://github.com/pyreon/pyreon/commit/531d7a1c6294624c7e0ac63919d6bb4a70386c07), [`7255d9f`](https://github.com/pyreon/pyreon/commit/7255d9f9bf04eb4a2424c89de9e051ee0cd50937), [`a693a0f`](https://github.com/pyreon/pyreon/commit/a693a0f606597896da19d91d65cd6b7dfa447ec2), [`be6a2a4`](https://github.com/pyreon/pyreon/commit/be6a2a401520331b04f38c894f6ffafe5b454a35), [`cfbb342`](https://github.com/pyreon/pyreon/commit/cfbb3426f12049b86f596bc3337245accf75be5b), [`2486982`](https://github.com/pyreon/pyreon/commit/2486982da2c663375b7825ff23bbd0c16a94684c), [`fabd888`](https://github.com/pyreon/pyreon/commit/fabd888ac865155a5af687f1706bf918c6419f19), [`02905e4`](https://github.com/pyreon/pyreon/commit/02905e41eaaaf204e181abc7f8879093bb47dccf), [`6b1ff6b`](https://github.com/pyreon/pyreon/commit/6b1ff6bc64f0c8e285f61fd7e0a8790c18694818), [`b67df5e`](https://github.com/pyreon/pyreon/commit/b67df5ede1eed345022f3777968211f3526000c7), [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac), [`9dafed7`](https://github.com/pyreon/pyreon/commit/9dafed7a5238c057c44c00dcff3b56044f16dfa8), [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832), [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac), [`be6a2a4`](https://github.com/pyreon/pyreon/commit/be6a2a401520331b04f38c894f6ffafe5b454a35), [`5438e9a`](https://github.com/pyreon/pyreon/commit/5438e9a7496e4c6e5dac43bc03ab90459d147a59), [`0b2edfc`](https://github.com/pyreon/pyreon/commit/0b2edfc24f106f765bd356c2a572bcae0b75d8d0), [`57f0480`](https://github.com/pyreon/pyreon/commit/57f04800c4fc7bb5f2e4098e6b3399a0860ab6eb), [`e690309`](https://github.com/pyreon/pyreon/commit/e690309cc58c842fc8cb07869519b4288c667eb5), [`f84675f`](https://github.com/pyreon/pyreon/commit/f84675fb134fe96c7d76c1631f754954816183bd), [`5af143d`](https://github.com/pyreon/pyreon/commit/5af143d746be81a4a0d688243f123d532c455553), [`2bef24d`](https://github.com/pyreon/pyreon/commit/2bef24df3d5c86d709509906d4d1e831357b41c6), [`e506bcf`](https://github.com/pyreon/pyreon/commit/e506bcf796a930094e5f5665b72e7efa4967a62c), [`f8ee02a`](https://github.com/pyreon/pyreon/commit/f8ee02aadb4c1fa2c223201f8f2480a143341e42), [`37902b5`](https://github.com/pyreon/pyreon/commit/37902b5117083680c958b9ecf37af8572a126223), [`b689ffd`](https://github.com/pyreon/pyreon/commit/b689ffd0b004a387591c912479f080442ffce49b), [`f4e9268`](https://github.com/pyreon/pyreon/commit/f4e9268a750318ceb5f7d2dc40c185a53e6b5299), [`ba24de3`](https://github.com/pyreon/pyreon/commit/ba24de3274c315abf9f3f6c90ebe38e8390090bb), [`47dfb62`](https://github.com/pyreon/pyreon/commit/47dfb62f7ea49b523dfff216710e0ce6e1f5ec73), [`086ca67`](https://github.com/pyreon/pyreon/commit/086ca67dd5219a7e80111c2c62c301be4263f535), [`967f78b`](https://github.com/pyreon/pyreon/commit/967f78b1c1d87d1eac156b1d122d27e772734330), [`195a9dc`](https://github.com/pyreon/pyreon/commit/195a9dc6417f964eb3858772da449a3bc1f1d02a), [`29f1002`](https://github.com/pyreon/pyreon/commit/29f10026097e30e261dcc49ad25ea3928ab7e026), [`968781e`](https://github.com/pyreon/pyreon/commit/968781ea3156803fe79aef5ae11146fce1278986), [`5c175d4`](https://github.com/pyreon/pyreon/commit/5c175d42ddd614a6fd58c1832c36ea4f98898f5a), [`c26fcef`](https://github.com/pyreon/pyreon/commit/c26fcef861ec794ca7f0e0b2163d84f7b58c0866), [`214097a`](https://github.com/pyreon/pyreon/commit/214097ae90b62dcc59d5b098b027fb5c39055c74), [`0cc9209`](https://github.com/pyreon/pyreon/commit/0cc9209a35e4ab9e73e849dd092ed654c2a56ed4), [`127e5d6`](https://github.com/pyreon/pyreon/commit/127e5d65cd2a3cea8457a1bd6f397b75c0ad4597), [`50caf2d`](https://github.com/pyreon/pyreon/commit/50caf2d3f97fefa7afa6105e38c7f5940c427b5d), [`b735e04`](https://github.com/pyreon/pyreon/commit/b735e040674de13d31aa30913ff5a3896c2f8b90), [`c7feb0b`](https://github.com/pyreon/pyreon/commit/c7feb0b726ea78ef7b6a4d3a17e8ae85df471a67), [`5a83e86`](https://github.com/pyreon/pyreon/commit/5a83e86c2c1848de9b318e2fd011963f2125cd4d), [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e), [`c2503eb`](https://github.com/pyreon/pyreon/commit/c2503eba0b79f1b9460e125a582b4fee8ea5f188), [`2e60aea`](https://github.com/pyreon/pyreon/commit/2e60aeab613711749750e7c27407dea22c382c53), [`09b8661`](https://github.com/pyreon/pyreon/commit/09b8661fd6df33d6314db04518ca524fba5d04dc), [`b263f82`](https://github.com/pyreon/pyreon/commit/b263f82effa16d780f47f5d87f8d4a7a2f77602e), [`c2503eb`](https://github.com/pyreon/pyreon/commit/c2503eba0b79f1b9460e125a582b4fee8ea5f188), [`ffeea88`](https://github.com/pyreon/pyreon/commit/ffeea88b0ca39a8f0a1eb70051ba994ac15d8f9a), [`2cf6f2a`](https://github.com/pyreon/pyreon/commit/2cf6f2a15fe3d07ba78669b79f3a5385a60b6088), [`dc580fc`](https://github.com/pyreon/pyreon/commit/dc580fc13327c7a1ca1f23dc0ee5c25921470d1e), [`dc580fc`](https://github.com/pyreon/pyreon/commit/dc580fc13327c7a1ca1f23dc0ee5c25921470d1e), [`c2503eb`](https://github.com/pyreon/pyreon/commit/c2503eba0b79f1b9460e125a582b4fee8ea5f188), [`91d798e`](https://github.com/pyreon/pyreon/commit/91d798e7971c9e96c4c11070ea9843309fdee8ed), [`c2503eb`](https://github.com/pyreon/pyreon/commit/c2503eba0b79f1b9460e125a582b4fee8ea5f188), [`7ead5f8`](https://github.com/pyreon/pyreon/commit/7ead5f8c0b10e9301f66cc0dd6a6f8f1d3ea3bdb), [`dc580fc`](https://github.com/pyreon/pyreon/commit/dc580fc13327c7a1ca1f23dc0ee5c25921470d1e), [`552fd97`](https://github.com/pyreon/pyreon/commit/552fd97f949f73aaaa204f044acc4ce6b65c8844), [`b263f82`](https://github.com/pyreon/pyreon/commit/b263f82effa16d780f47f5d87f8d4a7a2f77602e), [`1339dbc`](https://github.com/pyreon/pyreon/commit/1339dbc85dc7e3fd87493932dde724cee59fbaac), [`92b8701`](https://github.com/pyreon/pyreon/commit/92b87011683004bcbb26641fd9a38dd0b0414a55), [`be6a2a4`](https://github.com/pyreon/pyreon/commit/be6a2a401520331b04f38c894f6ffafe5b454a35), [`c2503eb`](https://github.com/pyreon/pyreon/commit/c2503eba0b79f1b9460e125a582b4fee8ea5f188), [`c2503eb`](https://github.com/pyreon/pyreon/commit/c2503eba0b79f1b9460e125a582b4fee8ea5f188), [`c9043d8`](https://github.com/pyreon/pyreon/commit/c9043d82a4f2902c404e26e934ea5e2f68e97bfe)]:
  - @pyreon/runtime-dom@0.52.0
  - @pyreon/ui-core@0.52.0
  - @pyreon/zero@0.52.0
  - @pyreon/core@0.52.0
  - @pyreon/unistyle@0.52.0
  - @pyreon/hooks@0.52.0
  - @pyreon/runtime-server@0.52.0
  - @pyreon/router@0.52.0
  - @pyreon/server@0.52.0
  - @pyreon/styler@0.52.0
  - @pyreon/vite-plugin@0.52.0
  - @pyreon/reactivity@0.52.0
  - @pyreon/head@0.52.0
  - @pyreon/rocketstyle@0.52.0
  - @pyreon/elements@0.52.0
  - @pyreon/config@0.52.0

## 0.51.0

### Minor Changes

- `@pyreon/loom` reads its settings from the ecosystem-wide `pyreon.config.*`, (f35927f)
  and `@pyreon/config` gains the `loom` section that describes them.

  ```ts
  export default defineConfig({
    loom: {
      devPaths: ['src/manifest.ts', '**/*.gen.ts'],
      ignore: [
        {
          dep: 'sharp',
          code: 'unused-dep',
          reason: 'loaded by the image plugin',
        },
      ],
      strict: true,
      severity: { 'unused-dep': 'info', 'phantom-dep': 'error' },
    },
  })
  ```

  Two homes, one shape. The root `package.json`'s `loom` key predates the shared
  file, still works, and wins **per key** — mirroring how `atlas.config.*` beats
  `pyreon.config.*`. Per-key rather than whole-object so a project mid-migration
  can move one setting at a time without the manifest silently blanking
  everything it does not mention.

  Both homes go through ONE validator. Two would let one home accept what the
  other rejects — a config that works until you move it.

  `severity` is the adoption lever: raise a code to `error` once it is clean,
  lower one to `info` while it is being burned down, the same ratchet this repo
  runs its lint backlogs on. An unknown code is rejected **with the list of real
  ones**, and severity is applied BEFORE suppressions so an explicit `ignore`
  still has the last word — a deliberate wave-through should not be resurrected
  by a blanket raise.

  A config file that exists but cannot be loaded is a NAMED error, never a silent
  skip. `loom scan` has no bundler (vite is an optional peer used only by
  `loom dev`), so a TypeScript config needs a runtime that strips types — the
  message says so and points at `pyreon.config.mjs` or the manifest key.

  Bisect-verified: flip the precedence → the per-key spec fails; apply severity
  after suppressions → the ignore-wins spec fails. Suite 119/119.

- `loom.devPaths` — the project declares which package-relative paths are **not (9eb349c)
  shipping source**.

  Loom classifies imports by surface: shipping source drives `phantom-dep` and
  `prod-import-of-dev-dep` (both statements about what a CONSUMER receives),
  while the dev surface only proves a dependency is used. It infers that surface
  from path shape — tests, configs, scripts — which covers the common cases and
  cannot cover a repo's own build conventions.

  Measured on this monorepo: every package's `src/manifest.ts` imports
  `@pyreon/manifest` at runtime to feed gen-docs, and `scripts/publish.ts` calls
  `stripSrcFromFiles`, so `src/` never reaches a tarball. Loom was right by its
  own rules and wrong about the world — **55 of the repo's 60 non-example gating
  warnings were that one convention**, which nothing in any manifest states.

  ```jsonc
  // package.json
  { "loom": { "devPaths": ["src/manifest.ts", "**/*.gen.ts"] } }
  ```

  Declaring it takes this repo from **73 gating warnings to 18**, with all 166
  `unused-dep` findings byte-identically intact. That last number is the point:
  `devPaths` extends the dev-surface classifier rather than dropping files from
  the scan, so a declared path still counts as USED — it just stops counting as
  shipped. Dropping the file instead would have manufactured a fresh
  `unused-dep` for every dependency only a manifest touches.

  Segment-wise globs, the same vocabulary as workspace globs: `*` within one
  segment, `**` any depth including zero. A malformed value is a loud error, not
  a silently-ignored config — the same rule `loom.ignore` follows.

  Bisect-verified: revert the surface routing → 3 specs fail; break
  `**`-matches-zero-segments → 2 fail; restored → 13/13, suite 101/101.

- `@pyreon/loom`: the phantom detector now recognizes the DefinitelyTyped (19ee507)
  pattern (a declared `@types/x` twin satisfies a type-only import of `x`,
  scoped names included), the lexical scanner requires the import KEYWORD to
  sit in code (a `from '…'` inside a string — rule messages, fix catalogs,
  generated examples — never scans as an import), subtrees with their own
  package.json are separate units, and a root `loom.ignore` (reason
  REQUIRED) downgrades findings to info with the reason attached — never a
  silent drop.

  The other packages: devDependency range alignment only (same-major sync
  surfaced by `loom scan`); no runtime change.

- `@pyreon/loom` is now published: the monorepo dependency observatory. (19ee507)
  `loom scan` turns a workspace's dependency fabric into data — the internal
  graph (depths, runtime cycles, blast radius), the external version-usage map,
  and seven detectors with honest severities — with a red exit that gates CI.
  `loom dev` serves the five-view observatory UI. `pyreon loom` joins the CLI
  front door.

### Patch Changes

- Visual polish for both workbenches. (20db838)

  atlas: the dev shell now loads its webfonts (Space Grotesk / Public Sans / JetBrains Mono — previously nothing loaded a font and the whole UI fell back to the browser serif) and the theme ships real `font.sans`/`font.display` stacks applied on the Shell. Fixed the needsFix-tag layout gap where a button's children stacked vertically ignoring the theme's row/gap (the flex-fix inner span is now `display: contents`), the status bar's column-stacked texts, and the addon tab strip clipping half its tabs (wraps instead of hidden overflow).

  loom: the layered graph now scales to a full workspace — ambient edges drop to a whisper (0.1 opacity), the selected fan no longer flares over its neighborhood, node labels get a background halo (`paint-order: stroke`) so 700 edges never strike through text, long package names truncate with a native tooltip, and version sublabels render only on the selected/focused neighborhood.

- Element's typed `gap` prop now works on SIMPLE elements and the button/fieldset/legend flex-fix layer — it renders modern CSS `gap` on the flex container (previously it was wired only into the before/after slot margins, a typed-but-partial contract that pushed consumers into theme-level flex overrides). The compound path keeps its slot-margin machinery and never receives wrapper gap, so the two mechanisms cannot double up. (cd442ea)

  On the strength of that, both workbench UIs (atlas + loom) are now fully props-first: layout is expressed exclusively through Element's own props (`contentDirection`/`contentAlignX`/`contentAlignY`/`gap`/`block`) with `.theme()` reserved for visual CSS — no flex overrides anywhere, matching the documented ui-components architecture. The only theme-level layout left is the documented special-case trio: `flexWrap` (no Element prop), CSS grid components, and `display: block` for text truncation. The Element manifest's api notes + mistakes now teach the full contract (simple-path `content*` props, axis-fixed alignment, `block` for app roots, the gap history).

- `@pyreon/atlas` now declares the two optional runtime peers it already imports: `@pyreon/vite-plugin` and `happy-dom`. (ea58e22)

  Both were devDependencies only, and both are loaded with a dynamic `import()` behind a graceful fallback — which is exactly what an optional peer is. `vite` and `playwright-core` were already declared that way; `@pyreon/vite-plugin` is imported in the _same_ `try` block as `vite`, so a consumer who installed vite because the peer list asked them to still silently fell back to the runtime loader instead of the real compiler chain. `happy-dom`'s own failure message literally reads "install `happy-dom`", for a package nothing ever told the consumer to install. The declaration now matches the behaviour, so package managers surface it at install time.

  The `loom scan` gate over this repo runs `--strict`, so a NEW dependency-fabric warning is red rather than scrollback. The repo's 18 warnings are at zero: the real ones fixed, and three verified false positives suppressed in the root `loom` config, each with a written `reason` (loom requires one). A backlog that reaches zero and is not gated refills — the same argument behind the lint ratchet.

- `loom scan --json` now writes the report and nothing else to stdout, so `loom scan . --json > report.json` produces a valid JSON file. (d04b532)

  It did not before. The write notice (`  → /path/loom-report.json`) went to stdout _after_ the document, so the documented machine surface produced a file no JSON parser could read — in the DEFAULT configuration, since `--json` still writes the report unless `--no-write` is passed. The notice now goes to stderr under `--json`, which changes nothing for a human at a terminal (both streams land there) and makes a redirect correct. Human mode is untouched: there, the narration IS the requested output.

  Every pre-existing `--json` test passed `--no-write`, so the default combination was never exercised — and the assertion that did check stdout parsed `out.split('  →')[0]`, stripping the notice before parsing. That split made the spec pass while stdout was polluted, so it could never have caught this. It now parses stdout whole.

- Records the measured performance frontier of the import scan in the code, and adds `bun run bench:loom` so the numbers are reproducible instead of living in someone's scratch directory. No runtime change. (acf3fde)

  Three optimizations that look obviously right on paper were prototyped and measured, and all three lose: reading files concurrently is worth 1.09x in the real scan (not the 1.25x an isolated read benchmark projects, because the per-file CPU work already hides most of the syscall latency) and would cost making `buildReport` async; fusing the specifier match into the lexer so the stripped string is never materialized measures 0.81x — an outright loss, because `isTypeOnlyStatement` wants random access into that string and tracking statement heads incrementally costs more than the string building it avoids; and the various per-file skips are worth 1-2ms each.

- `loom scan` is ~2.1x faster — 0.60s → 0.29s on this 143-package monorepo, measured end-to-end through the shipped bin under node, with byte-identical output (234 findings, identical stats). (f2af5c3)

  Phase timing put 98% of the run in one place: the source-import scan. Two changes there account for it.

  `stripWithMask`, the per-file lexical pass, called a `push()` closure once per CHARACTER — one closure call, one rope concat, and one `boolean[]` push each, with V8 storing that array as oddball pointers at 8 bytes per character. It now scans forward to the next character that can change lexer mode and moves whole runs with one slice plus one `Uint8Array.fill`. Same state machine, same transitions, same output: proven byte-for-byte against the original implementation over every source file in this repo, which is a far harsher corpus than any fixture (JSX, regex-heavy code, template literals carrying whole `import … from '…'` lines as prose).

  File discovery now asks the OS what each entry is (`withFileTypes`) instead of inferring from the name. The inference it replaced — "no dot in the name means directory" — was wrong in both directions, and one direction was a silent correctness bug: a directory with a dot in its name (`src/v1.2/`) was never descended into, so its source went unscanned and any dependency only it imported was reported as `unused-dep`.

- `loom scan` reported correct TypeScript as broken. Two false-positive classes, (7265f93)
  both found by running it against a real foreign 87-package monorepo rather
  than against this repo — loom's entire job is reading workspaces it has never
  seen, so its own conventions are the least interesting ones to test against.

  **Type-only imports were counted as runtime dependencies.** `import type { X }
from 'dev-dep'` is the _correct_ pattern — the import erases at build, so a
  consumer never needs the package installed — yet it drove
  `prod-import-of-dev-dep` on 9 of 12 findings, every one of them correct code.
  The scan now tracks a third surface: statement-level `import type` /
  `export type` (multi-line included) plus everything inside a `.d.ts`. A
  type-only import of a devDependency is silent; one of an _undeclared_ package
  surfaces as the new info-level `phantom-type-dep`, which says what is actually
  true — erased at runtime, so consumers are unaffected, but typecheck resolves
  it through hoisting luck.

  **tsconfig path aliases scanned as packages.** `~` was admitted by the package
  -name grammar although npm names cannot contain it, so every
  `import '~/components/X'` became a phantom dep — at _warning_ severity, which
  means `--strict` failed CI on a non-issue. `~` is out of the grammar, and
  `compilerOptions.paths` prefixes are now read from the package's tsconfig and
  the workspace root's (JSONC, one relative `extends` hop) so `@app/*` and
  `baseUrl`-relative specifiers are recognised as internal too.

  Measured on that repo: gating warnings 4 → 2 (the two survivors are real
  version drift), `prod-import-of-dev-dep` 12 → 1 (the survivor is a genuine
  runtime import), and all 75 `unused-dep` findings byte-identically intact —
  that last number is the one that mattered, because splitting type imports out
  of the runtime bucket without teaching `unused-dep` about the new surface
  would have accused every type-only dependency of being dead.

  Bisect-verified five ways: restoring `~` to the grammar, dropping the alias
  lookup, sending type imports back to the runtime buckets, removing the
  `unused-dep` guard, and re-introducing this fix's own first-cut regex — the
  newline-excluding one that silently missed prettier-wrapped multi-line type
  imports, the dominant real-world shape.

- Chrome + views polish: the brand block, sidebar group heads, health/cycles pills, detail-rail metric rows, and impact ranking rows all rendered their children COLUMN-stacked — three stacking sources fixed (the needsFix flex-fix span on buttons is now `display: contents`; `Row`'s layout moved from the attrs `css` string into the theme so a per-instance `css` prop no longer discards it; components whose `css` attr omitted `flex-direction: row` now declare it, since the Element wrapper's explicit column otherwise survives). The impact view's reach bars now actually render as a ranked bar chart, metric rows are label-left/value-right, and the matrix's rotated column labels are clipped + truncated instead of overflowing through the view header. (06e29ec)
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

- Fulltext ⌘K search in both workbenches, with match-reason chips. (e2aec5b)

  atlas: the search index now covers keywords, not just names — control keys, enum OPTIONS (the state/variant axes: searching `soft` surfaces every component with a `variant: soft`), scenario names, group paths, and descriptions. Multi-token queries AND across fields; keyword hits carry the matched field as a chip (`variant · soft`, `scenario · Long content`) so a row explains why it surfaced.

  loom: the ⌘K dialog arrives (same docs-site shape as atlas — the header keeps the trigger; the query still drives the sidebar filter), fulltext over the fabric: package ids, versions, kind, license, FINDINGS (searching `unused-dep` lists every flagged package with a `finding · unused-dep` chip), and the dependency edges in both directions (`depends on · X` / `needed by · X`).

- Styling discipline pass over both workbench UIs: no inline styles and no attrs `css` strings — every layout now lives in rocketstyle `.theme()` structured keys (the raw-string idiom was the root of the whole column-stacking bug family), loom's matrix view renders through real styled components instead of ~15 inline-styled divs, and all spacing/radii snap to a 4/8px grid (radius scale: chip 4 · control 8 · card 12 · pill 20). Even the graph's SVG styling is class-based now (static font/cursor/animation rules live in injected global classes — SVG can't be a rocketstyle component); the only remaining inline values are theme-token paints as SVG attributes and truly data-driven geometry (per-node opacity, the measured min-width), documented at their sites. Device viewport presets (375/768) are deliberately exempt from the grid — they are real device widths. (cd442ea)
- atlas: the workbench owns its page now (global reset — the browser's default body margin framed the shell with a white gap); brand themes + appearance moved out of the top bar into a profile menu on the avatar (click-away + Escape to close); search became a docs-site-style ⌘K dialog (dim blurred backdrop, keyboard-driven results with ↑↓/Enter, the top bar keeps only the trigger); and the side panels are drag-resizable (pointer-captured handles, clamped 200–420 / 280–560) and collapsible (bar toggles + double-click on a handle), widths as live drag geometry. (7a47093)

  loom: the view-bar title block breathes (real gap between title and eyebrow, roomier padding) and detector findings render severity-TRUE — an INFO finding no longer borrows the danger card's red (info → neutral surface, warning → warn tint, error → danger tint).

- Updated dependencies:
  - @pyreon/config@0.51.0
  - @pyreon/vite-plugin@0.51.0
  - @pyreon/ui-core@0.51.0
  - @pyreon/rocketstyle@0.51.0
  - @pyreon/runtime-dom@0.51.0
  - @pyreon/reactivity@0.51.0
  - @pyreon/hooks@0.51.0
  - @pyreon/elements@0.51.0
  - @pyreon/core@0.51.0
  - @pyreon/styler@0.51.0
  - @pyreon/unistyle@0.51.0
