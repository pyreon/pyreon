# zero-cli

## 0.53.0

### Patch Changes

- Updated dependencies [[`d7408b7`](https://github.com/pyreon/pyreon/commit/d7408b7cf9cbb5c64be7490e97b27b3a0ae9b906), [`54d95ea`](https://github.com/pyreon/pyreon/commit/54d95ea5b6cf3d2840dcfc0b809fe0c6e45486c5), [`068310d`](https://github.com/pyreon/pyreon/commit/068310dd9bd78663945348f579a7f5fd082c6944)]:
  - @pyreon/cli@0.53.0
  - @pyreon/zero@0.53.0
  - @pyreon/create-zero@0.53.0

## 0.52.0

### Patch Changes

- [#3691](https://github.com/pyreon/pyreon/pull/3691) [`99ed841`](https://github.com/pyreon/pyreon/commit/99ed8417ee2541158b92ff6c105ce96d9a959524) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Documentation accuracy pass over the five CLI packages — no runtime changes. `@pyreon/cli`'s README was missing the `check`/`plain`/`add`/`new`/`mcp`/`atlas`/`loom`/`lathe` commands entirely and undercounted `doctor`'s gates (8/10 instead of 13/15); rewritten against the current source, and the docs site gained `pyreon plain`/`pyreon loom`/`pyreon lathe` sections plus the `dependency-fabric` gate that two reference tables had dropped. `@pyreon/zero-cli`'s docs described `zero create` as a broken, prompt-less "copy the default template" shortcut (its actual pre-fix behavior, per the source's own history comment) instead of the full `@pyreon/create-zero` delegate it is today, and were missing `zero doctor --full` / `zero dev --routes`. `@pyreon/create-zero`'s README was missing the `monorepo` template, the `isr` render mode, `--preset`, the `--with-<feature>`/`--no-<feature>` flags, and `--typed-routes`. `@pyreon/create-multiplatform`'s docs never mentioned `--dir`/`--help`, the kebab-case project-name validation, the non-empty-target-dir refusal, or the generated `lint`/`release:keystore`/`release:android` scripts. `@pyreon/native-cli`'s README still claimed `"private": true` and "not published to npm", which stopped being true when the package started publishing; rewritten to document its full `build`/`check`/`assets`/`stage-web`/`wire` command surface.

- [#3753](https://github.com/pyreon/pyreon/pull/3753) [`6bf2770`](https://github.com/pyreon/pyreon/commit/6bf2770d8d25e02aa853ac249b6c07923dac001d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Dependency refresh to latest. `@pyreon/dnd` moves to `@atlaskit/pragmatic-drag-and-drop` 4 and `-hitbox` 3 (the auto-scroll adapter already required core 4, so v3 core would have been installed twice). Runtime deps of the other packages move to their latest in-major releases (`oxc-parser` 0.152, `magic-string`, `@tanstack/query-*` 5.104, CodeMirror, tiptap, `yjs`, `sharp`, `vite`, …).

- [#2704](https://github.com/pyreon/pyreon/pull/2704) [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration).

- [#2998](https://github.com/pyreon/pyreon/pull/2998) [`5867cca`](https://github.com/pyreon/pyreon/commit/5867cca15becbf4811effac32e81bdb3dc0a0d86) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update third-party dependencies to their latest compatible releases.

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

- [#3641](https://github.com/pyreon/pyreon/pull/3641) [`c2503eb`](https://github.com/pyreon/pyreon/commit/c2503eba0b79f1b9460e125a582b4fee8ea5f188) Thanks [@vitbokisch](https://github.com/vitbokisch)! - - `zero create` works again: it runs `@pyreon/create-zero` with every argument forwarded. It used to look for a `templates/default` folder that no longer exists and always failed with "Template not found".
  - A mistyped command no longer starts a dev server. `zero biuld` used to treat `biuld` as a project directory; it now exits with `[Pyreon] "biuld" is not a zero command or a directory. Did you mean "zero build"?`.
  - Scaffolded apps: the server entry now passes `apiRoutes` (API routes returned an empty HTML page in production), `tsconfig` includes `vite.config.ts` so `zero()` option typos fail the typecheck, the app template passes its own `doctor:ci`, and the pages point at `bun create @pyreon/zero` instead of an unrelated package.

- [#3714](https://github.com/pyreon/pyreon/pull/3714) [`4188e73`](https://github.com/pyreon/pyreon/commit/4188e73e27514dcc22c7f1e05fbaee08a5dae426) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Drop the `cac` dependency: `zero`'s argument parsing is now a small first-party parser (`src/argv.ts`) over a declarative command table. Behaviour is unchanged — 72 argv cases recorded from `cac` itself before the swap (command dispatch, option coercion, `--no-*`, `--` passthrough, unknown-option / missing-value / unused-argument errors, `--help` and `--version` output) are replayed against the replacement. The only visible difference is that `--help` no longer prints a trailing space after each option description.

- [#3662](https://github.com/pyreon/pyreon/pull/3662) [`b263f82`](https://github.com/pyreon/pyreon/commit/b263f82effa16d780f47f5d87f8d4a7a2f77602e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Correctness and DX fixes for `@pyreon/zero`:

  - `useLocale()` resolves the locale from the URL in production SSR, SSG and on the client (it returned `'en'` outside the dev middleware, so dev hydrated with a mismatch). Region locales such as `en-US` round-trip, and `setLocale()` keeps the base, query string and hash.
  - A page's own `error` export applies without a directory `_error.tsx`.
  - Windows backslash route paths are normalized to posix, so nested routes and generated imports work.
  - SSG redirect targets must be relative or `http(s):` (a `javascript:` target is rejected). `vercelAdapter.revalidate()` sends the secret as `Authorization: Bearer`; `vercelRevalidateHandler` still accepts `?secret=` with a deprecation warning.
  - Dotted URLs (`/api/export.csv`) reach dev API routes and the dev i18n middleware.
  - Route scans are memoized per build, and `.server.*` siblings come from the same walk.
  - `vite dev` runs the production request pipeline: the server entry's middleware, route middleware, `/_pyreon/data`, `/_zero/actions/*` and server islands (new `@pyreon/zero/pipeline` subpath).
  - `zero({...})` options are validated with did-you-mean suggestions. A missing `pyreon()` plugin, a default-only layout and a literal `loader` each fail with one error that names the file; a route file with no default export warns. Dev SSR errors are logged to the terminal.
  - A `getStaticPaths` export no longer defeats the route's code splitting (removes the `INEFFECTIVE_DYNAMIC_IMPORT` warning).
  - `zero preview` runs the built node/bun server for SSR/ISR builds, and CLI errors are `[Pyreon]`-prefixed with the stack kept.
  - `create-zero` refuses `--mode` a template cannot honor and `--adapter static` with an SSR mode, and `--pm` no longer aliases `--packages`.

- Updated dependencies [[`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338), [`019d5d1`](https://github.com/pyreon/pyreon/commit/019d5d1118d172c333b885122bb5ad286c1bcb50), [`8563e97`](https://github.com/pyreon/pyreon/commit/8563e97ee5fd91daa6d74547c712ae6b71cffb47), [`fdd4dc2`](https://github.com/pyreon/pyreon/commit/fdd4dc2aef317b1c177f9751fcffb6d88554ff92), [`ddf1cd6`](https://github.com/pyreon/pyreon/commit/ddf1cd6ab111ea756a2f76a524a1e2bc5c576e90), [`c12635c`](https://github.com/pyreon/pyreon/commit/c12635c3a9c423ac7b860293b0397583970235dd), [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c), [`99ed841`](https://github.com/pyreon/pyreon/commit/99ed8417ee2541158b92ff6c105ce96d9a959524), [`2e60aea`](https://github.com/pyreon/pyreon/commit/2e60aeab613711749750e7c27407dea22c382c53), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`4188e73`](https://github.com/pyreon/pyreon/commit/4188e73e27514dcc22c7f1e05fbaee08a5dae426), [`6bf2770`](https://github.com/pyreon/pyreon/commit/6bf2770d8d25e02aa853ac249b6c07923dac001d), [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93), [`1dcfb39`](https://github.com/pyreon/pyreon/commit/1dcfb3984d41b01f36104a6e06ed9d655965e2e5), [`a1ccd9b`](https://github.com/pyreon/pyreon/commit/a1ccd9ba5016141ea836e255f376063980a91a6c), [`b7bd8e8`](https://github.com/pyreon/pyreon/commit/b7bd8e86a8eb9f5fbcd3e145f467e0789ab6c3d0), [`153bb4b`](https://github.com/pyreon/pyreon/commit/153bb4b7da3d3b13d61aa588c6302d4ca7650948), [`c000667`](https://github.com/pyreon/pyreon/commit/c0006673ffb70e9a23ca08076a94a5760526f2df), [`96371fc`](https://github.com/pyreon/pyreon/commit/96371fc37676131db59e15c34f8c783c80835211), [`e5567e3`](https://github.com/pyreon/pyreon/commit/e5567e3bf20fbf8d12e04a61747863a4a4e01fa2), [`5af46e1`](https://github.com/pyreon/pyreon/commit/5af46e10c79669e25660bada33324400445db0eb), [`88e7dff`](https://github.com/pyreon/pyreon/commit/88e7dffbba6223c776e47bb01a0600fedf8f2fab), [`bdee35d`](https://github.com/pyreon/pyreon/commit/bdee35d2915b34a31dbf3a7e184bccaf4a014a07), [`8c8c43d`](https://github.com/pyreon/pyreon/commit/8c8c43deeb2b68a4d8b29ffdfe3890f7df94a888), [`0c77007`](https://github.com/pyreon/pyreon/commit/0c770074bd90515a3203bf41d1bd8bf5e3f01bef), [`69c191f`](https://github.com/pyreon/pyreon/commit/69c191f7235dabc5ecc6b6dd41f7ca72376076d5), [`ec0aff6`](https://github.com/pyreon/pyreon/commit/ec0aff6672efcac6f135b1f32b0b7e72e96db08c), [`c58917d`](https://github.com/pyreon/pyreon/commit/c58917db33297788b87d3f011354af79d033ed58), [`ec0aff6`](https://github.com/pyreon/pyreon/commit/ec0aff6672efcac6f135b1f32b0b7e72e96db08c), [`ec0aff6`](https://github.com/pyreon/pyreon/commit/ec0aff6672efcac6f135b1f32b0b7e72e96db08c), [`b47e041`](https://github.com/pyreon/pyreon/commit/b47e041753e57fb38a26c1a57f15349c770c2727), [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f), [`2e12add`](https://github.com/pyreon/pyreon/commit/2e12addb54586212dce479699d7ea70f084d1a7e), [`c9e2e3e`](https://github.com/pyreon/pyreon/commit/c9e2e3e44c5f1a1b00cdd2861b8b5bfa48cdded4), [`f8d6aae`](https://github.com/pyreon/pyreon/commit/f8d6aae6083c37a4d4aecde91d51979a1d3a5694), [`3383952`](https://github.com/pyreon/pyreon/commit/3383952c34a3c0ba3f1961f6e60976697c3599fb), [`5c5e246`](https://github.com/pyreon/pyreon/commit/5c5e246832453a94e5ce112d11c9109d800d2889), [`384cb23`](https://github.com/pyreon/pyreon/commit/384cb23669ef897b74206c9441b8982a71729367), [`5867cca`](https://github.com/pyreon/pyreon/commit/5867cca15becbf4811effac32e81bdb3dc0a0d86), [`87b581a`](https://github.com/pyreon/pyreon/commit/87b581a6a28433116c9a6c8364fbb8e3cab15760), [`78f9652`](https://github.com/pyreon/pyreon/commit/78f965269befa8060db6661e9ce586f3d10c5337), [`db410a0`](https://github.com/pyreon/pyreon/commit/db410a0c599fde5df971c2d4ba3d95e18f7f62fb), [`a0611c4`](https://github.com/pyreon/pyreon/commit/a0611c4d5a9afa2472502f5d932e1ac152861e1e), [`f904416`](https://github.com/pyreon/pyreon/commit/f9044167f2716c658cc8b68fa2c1bde763ce328e), [`7255d9f`](https://github.com/pyreon/pyreon/commit/7255d9f9bf04eb4a2424c89de9e051ee0cd50937), [`a693a0f`](https://github.com/pyreon/pyreon/commit/a693a0f606597896da19d91d65cd6b7dfa447ec2), [`be6a2a4`](https://github.com/pyreon/pyreon/commit/be6a2a401520331b04f38c894f6ffafe5b454a35), [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832), [`f84675f`](https://github.com/pyreon/pyreon/commit/f84675fb134fe96c7d76c1631f754954816183bd), [`37902b5`](https://github.com/pyreon/pyreon/commit/37902b5117083680c958b9ecf37af8572a126223), [`c2503eb`](https://github.com/pyreon/pyreon/commit/c2503eba0b79f1b9460e125a582b4fee8ea5f188), [`2e60aea`](https://github.com/pyreon/pyreon/commit/2e60aeab613711749750e7c27407dea22c382c53), [`09b8661`](https://github.com/pyreon/pyreon/commit/09b8661fd6df33d6314db04518ca524fba5d04dc), [`c2503eb`](https://github.com/pyreon/pyreon/commit/c2503eba0b79f1b9460e125a582b4fee8ea5f188), [`b263f82`](https://github.com/pyreon/pyreon/commit/b263f82effa16d780f47f5d87f8d4a7a2f77602e), [`c2503eb`](https://github.com/pyreon/pyreon/commit/c2503eba0b79f1b9460e125a582b4fee8ea5f188), [`ffeea88`](https://github.com/pyreon/pyreon/commit/ffeea88b0ca39a8f0a1eb70051ba994ac15d8f9a), [`2cf6f2a`](https://github.com/pyreon/pyreon/commit/2cf6f2a15fe3d07ba78669b79f3a5385a60b6088), [`dc580fc`](https://github.com/pyreon/pyreon/commit/dc580fc13327c7a1ca1f23dc0ee5c25921470d1e), [`dc580fc`](https://github.com/pyreon/pyreon/commit/dc580fc13327c7a1ca1f23dc0ee5c25921470d1e), [`c2503eb`](https://github.com/pyreon/pyreon/commit/c2503eba0b79f1b9460e125a582b4fee8ea5f188), [`91d798e`](https://github.com/pyreon/pyreon/commit/91d798e7971c9e96c4c11070ea9843309fdee8ed), [`c2503eb`](https://github.com/pyreon/pyreon/commit/c2503eba0b79f1b9460e125a582b4fee8ea5f188), [`7ead5f8`](https://github.com/pyreon/pyreon/commit/7ead5f8c0b10e9301f66cc0dd6a6f8f1d3ea3bdb), [`dc580fc`](https://github.com/pyreon/pyreon/commit/dc580fc13327c7a1ca1f23dc0ee5c25921470d1e), [`552fd97`](https://github.com/pyreon/pyreon/commit/552fd97f949f73aaaa204f044acc4ce6b65c8844), [`b263f82`](https://github.com/pyreon/pyreon/commit/b263f82effa16d780f47f5d87f8d4a7a2f77602e), [`1339dbc`](https://github.com/pyreon/pyreon/commit/1339dbc85dc7e3fd87493932dde724cee59fbaac), [`92b8701`](https://github.com/pyreon/pyreon/commit/92b87011683004bcbb26641fd9a38dd0b0414a55), [`be6a2a4`](https://github.com/pyreon/pyreon/commit/be6a2a401520331b04f38c894f6ffafe5b454a35), [`c2503eb`](https://github.com/pyreon/pyreon/commit/c2503eba0b79f1b9460e125a582b4fee8ea5f188), [`c2503eb`](https://github.com/pyreon/pyreon/commit/c2503eba0b79f1b9460e125a582b4fee8ea5f188), [`c9043d8`](https://github.com/pyreon/pyreon/commit/c9043d82a4f2902c404e26e934ea5e2f68e97bfe)]:
  - @pyreon/cli@0.52.0
  - @pyreon/zero@0.52.0
  - @pyreon/create-zero@0.52.0

## 0.51.0

### Patch Changes

- `zero doctor`: register + forward the `--full` flag so the `audit-types` and (c20686b)
  `bundle-budgets` gates (which the tool lists under "enable with --full") are
  actually reachable. Previously `zero doctor --full` crashed with an uncaught
  `CACError: Unknown option --full`. Also catch cac argv errors so any unknown
  option prints a friendly usage hint instead of a raw stack trace.
- Updated dependencies:
  - @pyreon/cli@0.51.0
  - @pyreon/zero@0.51.0
  - @pyreon/create-zero@0.51.0

## 0.50.0

### Patch Changes

- [#2417](https://github.com/pyreon/pyreon/pull/2417) [`83d1c0d`](https://github.com/pyreon/pyreon/commit/83d1c0d2a6b93285a441438c148a7d214a91c9d8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - chore: dependency-hygiene fixes from the workspace dependency audit

  Declared-vs-actual dependency audit across all 88 workspace packages. No
  runtime behavior changes — every fix removes or reclassifies a dependency the
  package's shipped code never imports:

  - `@pyreon/zero`: removed unused `@pyreon/meta` dependency (legacy from the
    initial monorepo migration; zero mentions in the package).
  - `@pyreon/zero-cli`: removed unused `@pyreon/server` dependency (the CLI
    delegates to `@pyreon/cli` via dynamic import and to `@pyreon/create-zero`
    via template-path resolution — both kept; `server` was never referenced).
  - `@pyreon/document-primitives`: removed unused `@pyreon/styler` +
    `@pyreon/ui-core` dependencies (its rocketstyle dependency declares its own).
  - `@pyreon/coolgrid`: moved `@pyreon/styler` to devDependencies (only its
    browser test imports it; prod src uses core/ui-core/unistyle).
  - `@pyreon/typescript`: `@pyreon/core` dependency now uses the workspace
    protocol (`workspace:^`) instead of the pinned `>=0.13.0` range — consistent
    with every other inter-package dependency; the fixed-group release keeps the
    published range aligned with the sibling core release.

  (Private packages fixed in the same pass, no changeset needed: `ui-components`
  dropped unused `hooks`/`styler` + moved test-only `ui-core` to devDeps;
  `ui-primitives` dropped unused `elements`.)

- Updated dependencies [[`83d1c0d`](https://github.com/pyreon/pyreon/commit/83d1c0d2a6b93285a441438c148a7d214a91c9d8), [`6029da4`](https://github.com/pyreon/pyreon/commit/6029da41bae4a4f52140cba939d778e079c89fee), [`659c30f`](https://github.com/pyreon/pyreon/commit/659c30f8f41514b47b4c83ce185de43f717fd2d7)]:
  - @pyreon/zero@0.50.0
  - @pyreon/cli@0.50.0
  - @pyreon/create-zero@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.49.0
  - @pyreon/zero@0.49.0
  - @pyreon/create-zero@0.49.0
  - @pyreon/cli@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [[`98b3726`](https://github.com/pyreon/pyreon/commit/98b3726a9f86caf160de6ebc2c175e2bae2cbb77)]:
  - @pyreon/zero@0.48.0
  - @pyreon/server@0.48.0
  - @pyreon/create-zero@0.48.0
  - @pyreon/cli@0.48.0

## 0.47.0

### Patch Changes

- Updated dependencies [[`30e0b0e`](https://github.com/pyreon/pyreon/commit/30e0b0e7bad325bd12cacb2331a93f1968657a57)]:
  - @pyreon/create-zero@0.47.0
  - @pyreon/server@0.47.0
  - @pyreon/cli@0.47.0
  - @pyreon/zero@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [[`b55d3c4`](https://github.com/pyreon/pyreon/commit/b55d3c405195d64586a284cb7dc3c3b144a36a70), [`6164409`](https://github.com/pyreon/pyreon/commit/6164409767c2b7a9668a004ab085406ae8e2178b)]:
  - @pyreon/server@0.46.0
  - @pyreon/zero@0.46.0
  - @pyreon/create-zero@0.46.0
  - @pyreon/cli@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [[`23dcb8d`](https://github.com/pyreon/pyreon/commit/23dcb8d5d36db664aba437abf792f1949530c746)]:
  - @pyreon/cli@0.45.0
  - @pyreon/server@0.45.0
  - @pyreon/create-zero@0.45.0
  - @pyreon/zero@0.45.0

## 0.44.0

### Patch Changes

- [#2146](https://github.com/pyreon/pyreon/pull/2146) [`7870ebd`](https://github.com/pyreon/pyreon/commit/7870ebd9f2042bc83d5c4d86bc13776ea6e711c0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero-cli): `zero --version` reports the real package version (was hardcoded `0.0.1`)

  `cli.version('0.0.1')` was a frozen literal from inception. It now derives
  from `package.json` (`import … with { type: 'json' }`), the same pattern as
  `@pyreon/mcp`, so it can never drift again.

- [#2155](https://github.com/pyreon/pyreon/pull/2155) [`550508c`](https://github.com/pyreon/pyreon/commit/550508ce30be3dbf1a93c9069b542e37237fca39) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero-cli): `zero build` is now ONE `vite build` — the zero plugin owns the whole pipeline (single SSR post-step owner, loud failures)

  `zero build` previously ran a SECOND owner on top of the `zero()` plugin's battle-tested post-step: its own `vite build --ssr` pass to `dist/server`, its own prerender pass, and its own `adapter.build()` into `dist/output` — each wrapped in a bare swallow-all `catch`. Consequences: the SSR bundle was built twice into divergent trees (up to four copies of `entry-server.js`), the deployed `dist/output` server bundle was staged **without** `template.html` (it fell back to the dev template + `/src/entry-client.ts`, so pages server-rendered but never hydrated in production), zero-config apps (no user `src/entry-server.ts`) got **no** server bundle at the documented location at all, and every one of those failures was swallowed into a green "Build completed".

  Now:

  - `zero build` runs exactly one `vite build`; the plugin chain owns client bundle, SSR/ISR server bundle + `dist/server/template.html`, SSG prerendering, and deploy-adapter staging into the one `dist/` tree (`node dist/index.js` for the node adapter). `dist/output` and the CLI's duplicate passes are gone.
  - **Breaking (pre-1.0):** the `--mode` CLI flag is removed — the render mode comes from `zero({ mode })` in `vite.config.ts` (the flag never reached the plugin instances; it only gated the CLI's now-deleted duplicate passes).
  - An **explicitly configured** adapter (`zero({ adapter })`) whose `build()` throws now **fails the build** (SSR/ISR and SSG modes); auto-selected adapters remain non-fatal with a console error — the server bundle itself is still usable.
  - The SSR/SSG plugins' inner-build recursion flags moved to one shared module (`build-flags.ts`); a flag **leaked** in from a parent process/shell (which silently disabled the whole post-step) now prints a one-line notice, and both plugins silently no-op on user-invoked server-target builds (`vite build --ssr`).
  - `zero preview` serves `dist/client/` when a node/bun-adapter build staged it, otherwise the project's `build.outDir` (previously-documented `dist/client` layouts keep working).

- Updated dependencies [[`9ef1b14`](https://github.com/pyreon/pyreon/commit/9ef1b1422313b49a020b7deb1ffa0871a5cc012a), [`4ad62b2`](https://github.com/pyreon/pyreon/commit/4ad62b25037776d6521501cadb8ac9fe33d75e38), [`4add6bd`](https://github.com/pyreon/pyreon/commit/4add6bd17711a6eb9f0cc9375a3643289bf931c4), [`4ad62b2`](https://github.com/pyreon/pyreon/commit/4ad62b25037776d6521501cadb8ac9fe33d75e38), [`550508c`](https://github.com/pyreon/pyreon/commit/550508ce30be3dbf1a93c9069b542e37237fca39)]:
  - @pyreon/zero@0.44.0
  - @pyreon/create-zero@0.44.0
  - @pyreon/server@0.44.0
  - @pyreon/cli@0.44.0

## 0.43.1

### Patch Changes

- Updated dependencies [[`969dc61`](https://github.com/pyreon/pyreon/commit/969dc61b06c4cf081508e79bf3c2873e1ae08f64)]:
  - @pyreon/cli@0.43.1
  - @pyreon/server@0.43.1
  - @pyreon/create-zero@0.43.1
  - @pyreon/zero@0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies [[`e8bfb5c`](https://github.com/pyreon/pyreon/commit/e8bfb5c8ad930f22b2ab3ede6812040079324c56), [`cbefb07`](https://github.com/pyreon/pyreon/commit/cbefb0742e123484be6e158cfeb16c28d0d5deb9)]:
  - @pyreon/cli@0.43.0
  - @pyreon/zero@0.43.0
  - @pyreon/server@0.43.0
  - @pyreon/create-zero@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/cli@0.42.0
  - @pyreon/server@0.42.0
  - @pyreon/zero@0.42.0
  - @pyreon/create-zero@0.42.0

## 0.41.2

### Patch Changes

- Updated dependencies [[`93ee46b`](https://github.com/pyreon/pyreon/commit/93ee46b03f7c13a55abd018ec27376b2b722dbea), [`55195ff`](https://github.com/pyreon/pyreon/commit/55195ff78e4a7e0a51af676211cc53ac880ad9d5)]:
  - @pyreon/zero@0.41.2
  - @pyreon/server@0.41.2
  - @pyreon/cli@0.41.2
  - @pyreon/create-zero@0.41.2

## 0.41.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.41.1
  - @pyreon/cli@0.41.1
  - @pyreon/create-zero@0.41.1
  - @pyreon/zero@0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies [[`850a76d`](https://github.com/pyreon/pyreon/commit/850a76d33296059ff9c0d03d12c8092208b3bf81), [`89457f6`](https://github.com/pyreon/pyreon/commit/89457f6a68984ca29158b8728f605b1f54f2f243)]:
  - @pyreon/zero@0.41.0
  - @pyreon/cli@0.41.0
  - @pyreon/server@0.41.0
  - @pyreon/create-zero@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`df5b28f`](https://github.com/pyreon/pyreon/commit/df5b28f6813381f5064531239dcdaf5e966d9bab), [`78048c1`](https://github.com/pyreon/pyreon/commit/78048c1e6563388bdd6d5e28d2e56481c43cb3c9), [`798a385`](https://github.com/pyreon/pyreon/commit/798a38572f4cf5657f67b28e5ef5b8291ba11d3b), [`6650d81`](https://github.com/pyreon/pyreon/commit/6650d815118968b6dd7f565b0e9424c0cfff50e3), [`2012730`](https://github.com/pyreon/pyreon/commit/2012730a58b462955e54629c9afebfc61095690a), [`9098141`](https://github.com/pyreon/pyreon/commit/9098141d9ffc00d5ff247aa85575ee32d9b2680f), [`92f00c2`](https://github.com/pyreon/pyreon/commit/92f00c2912cdfdd1ea75013a137d227c1ba3c1fe)]:
  - @pyreon/create-zero@0.40.0
  - @pyreon/cli@0.40.0
  - @pyreon/server@0.40.0
  - @pyreon/zero@0.40.0

## 0.39.0

### Patch Changes

- [#1973](https://github.com/pyreon/pyreon/pull/1973) [`fad3226`](https://github.com/pyreon/pyreon/commit/fad3226d42f4767c869bdc71d5ba58bc920ad500) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `zero dev`: honor `NO_COLOR` / `FORCE_COLOR` / `isTTY` in the startup banner, so piped output (`bun run dev > log`, CI, `bun run --filter`'s boxed capture) stays clean plain text instead of leaking raw ANSI escape codes.

- [#1967](https://github.com/pyreon/pyreon/pull/1967) [`1572afd`](https://github.com/pyreon/pyreon/commit/1572afd8891f022b45bbff10575500feb89d6e9e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `zero dev`: collapse the route list to a one-line summary by default and always print the Local URL + ready time last.

  The startup banner previously printed the full route table (one line per route) with the Local URL first. Under `bun run --filter <app> dev` — whose runner elides the _middle_ of long child output and keeps only the tail — a large app's route table pushed the Local URL and startup time off the top, so you couldn't see where to open the app or how long it took.

  Now the banner is collapsed to a compact summary (`Routes  SSR 15 · SSG 4 · API 1`), and the Local URL + `ready in <ms>` are printed last so they survive in the visible tail. Pass `--routes` to expand the full table.

- [#2006](https://github.com/pyreon/pyreon/pull/2006) [`08c022e`](https://github.com/pyreon/pyreon/commit/08c022e2d598ebf70f5b71bfc0a5b274e61991ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Render-mode DX, Tier 1 — "zero decides, you override, everything is visible":

  - **Per-route mode table on every build** — `○ ssg · λ ssr · ⟳ isr · ⚡ spa` with `(declared)` marking per-route overrides (apps >40 routes collapse to the counts line). New public helpers on `@pyreon/zero/server`: `collectFileRouteModes` (file-level mode resolution with layout cascade) + `formatRouteModeTable`.
  - **`zero dev` banner mode line** — shows the app mode plus hybrid overrides (`Mode  ssr (hybrid: 2 ssg, 1 isr)`), and the route summary/table now shows TRUTHFUL resolved per-route modes (previously every route was stamped with the default).
  - **Adapter auto-detection** — `adapter` unset + building on Vercel / Netlify / Cloudflare Pages (`VERCEL` / `NETLIFY` / `CF_PAGES` env) picks that platform's adapter automatically; explicit `adapter` always wins; local builds keep `node`.
  - **No more silent missing SSG pages** — a dynamic route with no `getStaticPaths` under SSG now produces a loud build warning naming the file and the three fixes (previously the page was silently absent from `dist/`). Routes declaring a non-static `renderMode` and API routes are exempt.

- Updated dependencies [[`e1e5278`](https://github.com/pyreon/pyreon/commit/e1e527837f0761d2ee4815c2960f63d1dc70f522), [`6d358d4`](https://github.com/pyreon/pyreon/commit/6d358d4d97ff8185518f58ddebb52233281cb83d), [`801f5a7`](https://github.com/pyreon/pyreon/commit/801f5a758d04bde0ed3a63ae03c3f7d7af12931d), [`31cfc98`](https://github.com/pyreon/pyreon/commit/31cfc984138936feb5c51a2256cff7583e855187), [`31cfc98`](https://github.com/pyreon/pyreon/commit/31cfc984138936feb5c51a2256cff7583e855187), [`31cfc98`](https://github.com/pyreon/pyreon/commit/31cfc984138936feb5c51a2256cff7583e855187), [`08c022e`](https://github.com/pyreon/pyreon/commit/08c022e2d598ebf70f5b71bfc0a5b274e61991ef), [`08c022e`](https://github.com/pyreon/pyreon/commit/08c022e2d598ebf70f5b71bfc0a5b274e61991ef), [`74bbc94`](https://github.com/pyreon/pyreon/commit/74bbc9423245e0596872c9a7fb230bacdc411cca), [`08c022e`](https://github.com/pyreon/pyreon/commit/08c022e2d598ebf70f5b71bfc0a5b274e61991ef), [`08c022e`](https://github.com/pyreon/pyreon/commit/08c022e2d598ebf70f5b71bfc0a5b274e61991ef), [`8e8a0de`](https://github.com/pyreon/pyreon/commit/8e8a0de48a1c4aba4e09fc8e72fb72bc0c1ec68e)]:
  - @pyreon/server@0.39.0
  - @pyreon/zero@0.39.0
  - @pyreon/create-zero@0.39.0
  - @pyreon/cli@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [[`fae2a7f`](https://github.com/pyreon/pyreon/commit/fae2a7fb36be92194f2d08d0e32de0dbd77d17da), [`d59f8ac`](https://github.com/pyreon/pyreon/commit/d59f8acacc0fe1dcd3abad932b0a6fbddc78a85c), [`3ba1276`](https://github.com/pyreon/pyreon/commit/3ba1276d2be734a7b9e9ebd09d00b643a4b80396), [`3ba1276`](https://github.com/pyreon/pyreon/commit/3ba1276d2be734a7b9e9ebd09d00b643a4b80396), [`3ba1276`](https://github.com/pyreon/pyreon/commit/3ba1276d2be734a7b9e9ebd09d00b643a4b80396), [`442cc26`](https://github.com/pyreon/pyreon/commit/442cc26728fe5704a8bc9d8782f419d7a36a683a), [`8a221af`](https://github.com/pyreon/pyreon/commit/8a221af967dec5a2b28467423db2266456225b92), [`bb3adfe`](https://github.com/pyreon/pyreon/commit/bb3adfee32bfb53161b1401fcab51b42268ae107)]:
  - @pyreon/cli@0.38.0
  - @pyreon/zero@0.38.0
  - @pyreon/server@0.38.0
  - @pyreon/create-zero@0.38.0

## 0.37.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.37.1
  - @pyreon/cli@0.37.1
  - @pyreon/create-zero@0.37.1
  - @pyreon/zero@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies [[`7ee9e76`](https://github.com/pyreon/pyreon/commit/7ee9e760a024cc650b5187da7818b0da71698360), [`7a4e9c1`](https://github.com/pyreon/pyreon/commit/7a4e9c133cab77e96c455cefda801623dafef525)]:
  - @pyreon/zero@0.37.0
  - @pyreon/server@0.37.0
  - @pyreon/cli@0.37.0
  - @pyreon/create-zero@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies:
  - @pyreon/server@0.36.0
  - @pyreon/zero@0.36.0
  - @pyreon/cli@0.36.0
  - @pyreon/create-zero@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies [[`62f1191`](https://github.com/pyreon/pyreon/commit/62f119168078711ad4056c576805c71cff127c12), [`36fc915`](https://github.com/pyreon/pyreon/commit/36fc915ae8dcd85e5e50e2c41e43b56285991665), [`8a4e195`](https://github.com/pyreon/pyreon/commit/8a4e19519bcf3dfebb203c97f69d08e3f7ac6b50), [`d3945ea`](https://github.com/pyreon/pyreon/commit/d3945ea93e4aaf6362a01e1ff4cd4ee168b34f15), [`9967eb8`](https://github.com/pyreon/pyreon/commit/9967eb8f3396c6b1caf818f590e1ef9fe42d7387), [`2042ae5`](https://github.com/pyreon/pyreon/commit/2042ae59d1e3347db146ee7bbdf1b2229eabb812), [`b96f66e`](https://github.com/pyreon/pyreon/commit/b96f66e8ed85a14353b7e203a6e4ae5f438f977e)]:
  - @pyreon/zero@0.35.0
  - @pyreon/cli@0.35.0
  - @pyreon/server@0.35.0
  - @pyreon/create-zero@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65), [`b59c7b0`](https://github.com/pyreon/pyreon/commit/b59c7b07f782e0ae0be2dda144e152504cdef7b7)]:
  - @pyreon/create-zero@0.34.0
  - @pyreon/zero@0.34.0
  - @pyreon/server@0.34.0
  - @pyreon/cli@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies [[`81a296d`](https://github.com/pyreon/pyreon/commit/81a296de7666f1215e748a055ed1679967fe3251)]:
  - @pyreon/create-zero@0.33.0
  - @pyreon/server@0.33.0
  - @pyreon/cli@0.33.0
  - @pyreon/zero@0.33.0

## 0.32.0

### Patch Changes

- Updated dependencies [[`04525e1`](https://github.com/pyreon/pyreon/commit/04525e1dfc92ff4d7182818c3e9ddaddd8648cbc), [`75c39ea`](https://github.com/pyreon/pyreon/commit/75c39eac7cc8f4fc1f99586521c27a50bc9f9fb8), [`4795d0b`](https://github.com/pyreon/pyreon/commit/4795d0be414b89a0f557641bacaeda9c36a0eb69), [`25ddda0`](https://github.com/pyreon/pyreon/commit/25ddda0d540199a7177cf0ccd4b0cab78912986a), [`bfb813b`](https://github.com/pyreon/pyreon/commit/bfb813ba5a883c791a8df22c46fa82cf370c6ebe), [`fc26160`](https://github.com/pyreon/pyreon/commit/fc26160ac2d3afba0adde20f61d94a4199519b59), [`510a410`](https://github.com/pyreon/pyreon/commit/510a410f196bb732d963bd357a6bc10993f794fd), [`510a410`](https://github.com/pyreon/pyreon/commit/510a410f196bb732d963bd357a6bc10993f794fd), [`5a38b69`](https://github.com/pyreon/pyreon/commit/5a38b69a2a2dc9a331c2e6a8a11375eebc532c63), [`698f514`](https://github.com/pyreon/pyreon/commit/698f514f44160e1955582b4573014bddba45a38e), [`f21a439`](https://github.com/pyreon/pyreon/commit/f21a439cfefd219b1c13f1b8d99dbfbbe949fd34), [`d543f36`](https://github.com/pyreon/pyreon/commit/d543f36150f11fe94b08fabed0887914fa9deb9f), [`8a9bc52`](https://github.com/pyreon/pyreon/commit/8a9bc52318841868badf907963bf99d7937ab735), [`6cdae79`](https://github.com/pyreon/pyreon/commit/6cdae79903cd00c96410dcc6bad39669d9b8898b), [`b90e67c`](https://github.com/pyreon/pyreon/commit/b90e67c296cc39b2438490f4330b836b78395c8d), [`25ddda0`](https://github.com/pyreon/pyreon/commit/25ddda0d540199a7177cf0ccd4b0cab78912986a)]:
  - @pyreon/cli@0.33.0
  - @pyreon/zero@0.33.0
  - @pyreon/server@0.33.0
  - @pyreon/create-zero@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies [[`7532eae`](https://github.com/pyreon/pyreon/commit/7532eaeff493327bb19f6c2adc94151638d61ceb), [`f56dfab`](https://github.com/pyreon/pyreon/commit/f56dfab160bfebf159c4b2a5a6cb71bc9114840d)]:
  - @pyreon/zero@0.33.0
  - @pyreon/server@0.33.0
  - @pyreon/cli@0.33.0
  - @pyreon/create-zero@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`1cfb381`](https://github.com/pyreon/pyreon/commit/1cfb3811bff4986e23965e1ec60c22ed7c3e369d), [`52c6d2b`](https://github.com/pyreon/pyreon/commit/52c6d2b23e2c886a6156a0bc19ed58598f2672d7), [`18bb9ce`](https://github.com/pyreon/pyreon/commit/18bb9ce8324cd6975fd7ce9e3a8061ea191f1b15), [`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`c80700f`](https://github.com/pyreon/pyreon/commit/c80700f31834347db9691a74c1abcde3fe73f541), [`3c775b8`](https://github.com/pyreon/pyreon/commit/3c775b8debe114b6623e94c84d9ca5daf5313789), [`4c9844d`](https://github.com/pyreon/pyreon/commit/4c9844d4a408549ad48e3d93bbf686ba946032da), [`7b2eabf`](https://github.com/pyreon/pyreon/commit/7b2eabf34cf849b93f40da8bdf9bc679db0bec7f), [`75af4aa`](https://github.com/pyreon/pyreon/commit/75af4aac41cc60abecfd0a25f9522f4850bf9ece), [`2226a27`](https://github.com/pyreon/pyreon/commit/2226a2729de1fbc793cb5c79c082a743a0d1c5b6), [`1b1f4d3`](https://github.com/pyreon/pyreon/commit/1b1f4d326dc18c84672db82699f592869831bf0f), [`102617b`](https://github.com/pyreon/pyreon/commit/102617b06110394a9c32b7de9cf01da0286489ee), [`0eae5c8`](https://github.com/pyreon/pyreon/commit/0eae5c88fe01fc5129c2bef09135c325d7eb0337), [`960d075`](https://github.com/pyreon/pyreon/commit/960d075e71df0bb1830777157cc0f7dd39a2ba85)]:
  - @pyreon/zero@0.33.0
  - @pyreon/server@0.33.0
  - @pyreon/cli@0.33.0
  - @pyreon/create-zero@0.33.0

## 0.29.0

### Patch Changes

- Updated dependencies [[`00a6d70`](https://github.com/pyreon/pyreon/commit/00a6d70fac25baf38c90d582cff3c59110bd9aad), [`64b7feb`](https://github.com/pyreon/pyreon/commit/64b7feb2ea133dd67915d3c3924781cb8fc4a3c3), [`601ad29`](https://github.com/pyreon/pyreon/commit/601ad29f41df0bf96a50136111355b26e8fd6bfe), [`e940031`](https://github.com/pyreon/pyreon/commit/e940031e4d5f754fb47b01187e1a1016b55b965d), [`f5e6ff8`](https://github.com/pyreon/pyreon/commit/f5e6ff8d24cbf1e152717d4b192576200cd3c83d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`78feab2`](https://github.com/pyreon/pyreon/commit/78feab2aaa4d6051a4aa726a7d0f4c2a02cb6cde), [`88a42f7`](https://github.com/pyreon/pyreon/commit/88a42f7620f4c9a4a3df0d6b730294a4f91c94ae), [`0ef3f45`](https://github.com/pyreon/pyreon/commit/0ef3f4591fdd7339a0dd597dabc27295eeb09669)]:
  - @pyreon/cli@0.33.0
  - @pyreon/zero@0.33.0
  - @pyreon/server@0.33.0
  - @pyreon/create-zero@0.33.0

## 0.28.1

### Patch Changes

- Updated dependencies [[`de422bc`](https://github.com/pyreon/pyreon/commit/de422bc24ef8d9f434781160f5d1062b8644d5ec), [`a633067`](https://github.com/pyreon/pyreon/commit/a6330675e99fb54f5d25947670ae873b161a8cf8), [`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0), [`d9cee0b`](https://github.com/pyreon/pyreon/commit/d9cee0beecf7e9718e0e8d6d763afdb9ce8230d8), [`4d75f2d`](https://github.com/pyreon/pyreon/commit/4d75f2dc5ff6768078b60deb126f75c2dd9f8768)]:
  - @pyreon/cli@0.28.1
  - @pyreon/create-zero@0.28.1
  - @pyreon/server@0.28.1
  - @pyreon/zero@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [[`582e58a`](https://github.com/pyreon/pyreon/commit/582e58a6b65a73a292b88eb83ec64651bc856810), [`2bb68fb`](https://github.com/pyreon/pyreon/commit/2bb68fb773b86444810e7b865bc46f7da4058441), [`889cf5a`](https://github.com/pyreon/pyreon/commit/889cf5aec04dd41a37dd4d47edcdad358e23f3a2), [`bb6a0e3`](https://github.com/pyreon/pyreon/commit/bb6a0e38ae15a8f195ed6c0b975f63ebec8663cb)]:
  - @pyreon/zero@0.33.0
  - @pyreon/cli@0.33.0
  - @pyreon/server@0.33.0
  - @pyreon/create-zero@0.33.0

## 0.27.1

### Patch Changes

- Updated dependencies [[`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781)]:
  - @pyreon/zero@0.27.1
  - @pyreon/server@0.27.1
  - @pyreon/cli@0.27.1
  - @pyreon/create-zero@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies [[`07233f0`](https://github.com/pyreon/pyreon/commit/07233f0870e3e1f3672bc7d4ca5a1b21c466fa78), [`94d8704`](https://github.com/pyreon/pyreon/commit/94d87048c270699ff8d4fd2946edb56c135c76cf), [`a92b6f6`](https://github.com/pyreon/pyreon/commit/a92b6f64f56760b77f2c254522bfb74e4b2ffb67)]:
  - @pyreon/zero@0.33.0
  - @pyreon/server@0.33.0
  - @pyreon/cli@0.33.0
  - @pyreon/create-zero@0.33.0

## 0.26.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.26.3
  - @pyreon/cli@0.26.3
  - @pyreon/create-zero@0.26.3
  - @pyreon/zero@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.26.2
  - @pyreon/cli@0.26.2
  - @pyreon/create-zero@0.26.2
  - @pyreon/zero@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [[`1779b84`](https://github.com/pyreon/pyreon/commit/1779b84c2719c1e0745ce2630d8940ff3bc25ed0)]:
  - @pyreon/create-zero@0.26.1
  - @pyreon/server@0.26.1
  - @pyreon/cli@0.26.1
  - @pyreon/zero@0.26.1

## 0.26.0

### Patch Changes

- [#946](https://github.com/pyreon/pyreon/pull/946) [`1385728`](https://github.com/pyreon/pyreon/commit/1385728abb19c6a51498df9dec7fc4b51136a115) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(zero-cli): `zero preview` now serves built output (no more HTTP 404 on the homepage)

  `zero build` writes the client bundle to `dist/client/` (see [packages/zero/cli/src/commands/build.ts](packages/zero/cli/src/commands/build.ts)), but `zero preview` was wrapping `vite preview` with no `outDir` override — so vite served from `dist/` (which only contains the `client/`, `server/`, `output/` subdirectories). Every scaffolded SSR / SSG / SPA project returned HTTP 404 from `bun run preview` on the homepage. The build artefact was correct; the preview command just looked in the wrong place.

  `zero preview` now detects `dist/client/` and passes it as `build.outDir` to vite preview. The 30 prior published `@pyreon/zero-cli` releases all had this bug; this lands as part of the next 0.x.

  **DX improvements bundled in `@pyreon/create-zero`:**

  - Every template (`app`, `blog`, `dashboard`) now ships a `README.md` with project-name substitution, getting-started commands, per-template "what's in this project" section, scripts table, deploy notes, and doc links. Previously only the `monorepo` template had a README — the flat templates landed with no documentation at the project root.

  - `scripts/scaffold-smoke.ts` gained a `previewSmoke?:` hook that spawns `bun run preview` against the built output, waits for the local URL, fetches the homepage, and asserts HTTP 200 + non-empty HTML body. Wired into 3 representative cells (app+vercel, blog+cloudflare, dashboard+vercel+full integrations). Bisect-verified: reverting the `zero preview` fix fails `cpa-smoke-app-vercel` with `preview HTTP 404 from http://localhost:NNNN (expected 200)`; restored → passes.

- Updated dependencies [[`cbef2e7`](https://github.com/pyreon/pyreon/commit/cbef2e7b016da3ac515099f9f403807baeeb4589), [`5602146`](https://github.com/pyreon/pyreon/commit/5602146b7ccac45d3d9ee0b752b00a5f702821e9), [`95663b9`](https://github.com/pyreon/pyreon/commit/95663b943be3f02f61fce7b7532df8c2efa153b4), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`c2d0f34`](https://github.com/pyreon/pyreon/commit/c2d0f34578624f7284842f4f8558e613e969053d), [`537f0a5`](https://github.com/pyreon/pyreon/commit/537f0a5e326a6cc37dd95dd978b474c9a51867e6), [`5ee742a`](https://github.com/pyreon/pyreon/commit/5ee742aa8a83e66664220494dc0e20a3bb16d8b7), [`f911be8`](https://github.com/pyreon/pyreon/commit/f911be8f4ac99f3bcecb35d93d765b8fb1ae4ca0), [`4204f49`](https://github.com/pyreon/pyreon/commit/4204f49f1dad0997b77fd6a9a90d047f8621010d), [`8333f05`](https://github.com/pyreon/pyreon/commit/8333f05e3a2b3d8b31cd03c3d835a4234a6e689c), [`1385728`](https://github.com/pyreon/pyreon/commit/1385728abb19c6a51498df9dec7fc4b51136a115), [`52c1298`](https://github.com/pyreon/pyreon/commit/52c1298e0a2be04bd62b35f43416ecb9bb16b451), [`9ef3922`](https://github.com/pyreon/pyreon/commit/9ef3922a1849aa36aa012284aae6922cdf1715cd), [`a27d7db`](https://github.com/pyreon/pyreon/commit/a27d7db43509c02b29ec59af18e5da18d7d57d41), [`3ebd25f`](https://github.com/pyreon/pyreon/commit/3ebd25fbdd06f8d9f473e8a9281bce27effca209), [`eaa36d7`](https://github.com/pyreon/pyreon/commit/eaa36d720210e8bed9676692fcb819c063dd91c6), [`c19018d`](https://github.com/pyreon/pyreon/commit/c19018ddad0577c82caaa63414ceea6e792d5244)]:
  - @pyreon/zero@0.33.0
  - @pyreon/create-zero@0.33.0
  - @pyreon/server@0.33.0
  - @pyreon/cli@0.33.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/server@0.25.1
  - @pyreon/cli@0.25.1
  - @pyreon/create-zero@0.25.1
  - @pyreon/zero@0.25.1

## 0.25.0

### Patch Changes

- Updated dependencies [[`4d5d5ec`](https://github.com/pyreon/pyreon/commit/4d5d5ec334b0916e42cfe73d2100596920478024), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/cli@0.25.0
  - @pyreon/server@0.25.0
  - @pyreon/zero@0.25.0
  - @pyreon/create-zero@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.24.6
  - @pyreon/cli@0.24.6
  - @pyreon/create-zero@0.24.6
  - @pyreon/zero@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.24.5
  - @pyreon/cli@0.24.5
  - @pyreon/create-zero@0.24.5
  - @pyreon/zero@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.24.4
  - @pyreon/cli@0.24.4
  - @pyreon/create-zero@0.24.4
  - @pyreon/zero@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.24.3
  - @pyreon/cli@0.24.3
  - @pyreon/create-zero@0.24.3
  - @pyreon/zero@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.24.2
  - @pyreon/cli@0.24.2
  - @pyreon/create-zero@0.24.2
  - @pyreon/zero@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies [[`48ac675`](https://github.com/pyreon/pyreon/commit/48ac6758f266843d9b8db679cf19cee29b3a309d)]:
  - @pyreon/zero@0.24.1
  - @pyreon/server@0.24.1
  - @pyreon/cli@0.24.1
  - @pyreon/create-zero@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/cli@0.24.0
  - @pyreon/zero@0.24.0
  - @pyreon/server@0.24.0
  - @pyreon/create-zero@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`51b81f0`](https://github.com/pyreon/pyreon/commit/51b81f0d92bdbc9c4fd6acc3b5b9b0a8043078a9), [`1bb5988`](https://github.com/pyreon/pyreon/commit/1bb598872a7178a5c20af257c49e62a6ae82bf36), [`5934570`](https://github.com/pyreon/pyreon/commit/59345703bcf7a4d946ace655a69514ee438e9006), [`6454cb7`](https://github.com/pyreon/pyreon/commit/6454cb794bb82db11e7842cb4a62a3765e3dd3ac), [`97b0e19`](https://github.com/pyreon/pyreon/commit/97b0e19533056e9cb3d9997401effc79b0f6760b), [`f833a99`](https://github.com/pyreon/pyreon/commit/f833a997bbc04aa5ba94d0d5dd334628871aaa9a), [`e1939bd`](https://github.com/pyreon/pyreon/commit/e1939bd49d185c6522b61f06c5a27cf2b91392a4), [`0036dfc`](https://github.com/pyreon/pyreon/commit/0036dfcb58a0ad33bce8118a3d927f1c09c63b27), [`36767f6`](https://github.com/pyreon/pyreon/commit/36767f69887f8da39c2a14c57da2ca59f3780b3d), [`c459330`](https://github.com/pyreon/pyreon/commit/c459330e248397438892c9a8c1817bd75cfb8b3e), [`2976aa8`](https://github.com/pyreon/pyreon/commit/2976aa84213b479b4d045a83143b3a4a3d89aedf), [`802e88b`](https://github.com/pyreon/pyreon/commit/802e88b3d132d5c73901571c805e8987eec4612a), [`8e81b4a`](https://github.com/pyreon/pyreon/commit/8e81b4a268507b9c9981ba47087c70b7f36a4fc1), [`f0a33da`](https://github.com/pyreon/pyreon/commit/f0a33daff7826cd12bcbc5e6ae96ca161723d89a), [`7632934`](https://github.com/pyreon/pyreon/commit/763293492a26d48e4a7b1b28e42a519677702b35), [`6eb1f57`](https://github.com/pyreon/pyreon/commit/6eb1f5745dde032dd94b91965f5299ea54ab5a63), [`1a23287`](https://github.com/pyreon/pyreon/commit/1a23287ebd180aeae14a31eca21fd490145b989e)]:
  - @pyreon/zero@0.23.0
  - @pyreon/server@0.23.0
  - @pyreon/cli@0.23.0
  - @pyreon/create-zero@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.22.0
  - @pyreon/zero@0.22.0
  - @pyreon/cli@0.22.0
  - @pyreon/create-zero@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [[`95ff116`](https://github.com/pyreon/pyreon/commit/95ff1160e43adceb024c0a897353fb675d20c7bf), [`82b2e3b`](https://github.com/pyreon/pyreon/commit/82b2e3b983d97039999da8d5a1518a387ad683a3), [`9204800`](https://github.com/pyreon/pyreon/commit/9204800d79b5c8167ff176e78ba5f324f43de9e2)]:
  - @pyreon/zero@0.21.0
  - @pyreon/server@0.21.0
  - @pyreon/cli@0.21.0
  - @pyreon/create-zero@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`abda63c`](https://github.com/pyreon/pyreon/commit/abda63c541343cfe967a5c70ce223a6675ceaa8e), [`cc3003c`](https://github.com/pyreon/pyreon/commit/cc3003c3e7ab2e8b9649c3aa6b5e001506916a0d), [`cc3003c`](https://github.com/pyreon/pyreon/commit/cc3003c3e7ab2e8b9649c3aa6b5e001506916a0d)]:
  - @pyreon/cli@0.20.0
  - @pyreon/zero@0.20.0
  - @pyreon/server@0.20.0
  - @pyreon/create-zero@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`dcd2136`](https://github.com/pyreon/pyreon/commit/dcd21360cca7528cbfe87020428394a11aa30ea0), [`c8d6f27`](https://github.com/pyreon/pyreon/commit/c8d6f27b8d207b25a2f378eedc21af11adfe3653), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`0b3e2b3`](https://github.com/pyreon/pyreon/commit/0b3e2b387d4cd6debe6a466877d2100a96ceceb9), [`078b1e7`](https://github.com/pyreon/pyreon/commit/078b1e72343828b2d73f97c03e0b5b0f335fe979), [`e8e95bc`](https://github.com/pyreon/pyreon/commit/e8e95bc2d6785d397f4b8f85039ce76c2a7f6cea), [`5d40b3f`](https://github.com/pyreon/pyreon/commit/5d40b3f70ba50ecd5adbff505db45e38975f61a8), [`7eaa4f0`](https://github.com/pyreon/pyreon/commit/7eaa4f03c6a9e0d48f38647127e1fd5998dc09d1), [`5d40b3f`](https://github.com/pyreon/pyreon/commit/5d40b3f70ba50ecd5adbff505db45e38975f61a8)]:
  - @pyreon/server@0.19.0
  - @pyreon/zero@0.19.0
  - @pyreon/cli@0.19.0
  - @pyreon/create-zero@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/cli@0.18.0
  - @pyreon/zero@0.18.0
  - @pyreon/server@0.18.0
  - @pyreon/create-zero@0.18.0

## 0.17.0

### Patch Changes

- [#580](https://github.com/pyreon/pyreon/pull/580) [`816753b`](https://github.com/pyreon/pyreon/commit/816753b0d10cb55ce41e6ad64aff18bd41e925d6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Honour `zero({ port })` from `vite.config.ts` in `zero dev` / `zero preview`.

  Pre-fix the CLI always bound the CAC-baked default 3000 (or whatever `--port` passed) — `zero({ port: 8080 })` in `vite.config.ts` was silently ignored when the user ran `zero dev`. Post-fix precedence is `CLI flag > zero({ port }) > 3000 default`:

  ```ts
  // vite.config.ts
  plugins: [pyreon(), zero({ port: 8080 })]
  ```

  ```sh
  zero dev               # → 8080 (reads vite.config.ts)
  zero dev --port 5191   # → 5191 (CLI override)
  ```

  Two changes:

  1. **Removed the CAC `default: 3000`** on the `--port` flag. The default made `options.port` always-defined, which meant the config-file fallback could never fire.
  2. **New `loadZeroConfigPort(root)`** in `packages/zero/cli/src/commands/load-config.ts` — loads `vite.config.ts` via `vite.loadConfigFromFile`, walks the plugin list, finds the zero plugin instance, reads its captured `ZeroConfig.port`. Falls back to `undefined` gracefully when no zero plugin is present (consumer is using `pyreon()` only) so the framework's 3000 default kicks in.

  Composes with PR [#582](https://github.com/pyreon/pyreon/issues/582)'s plugin-side argv detection: `vite --port 517N` (plain Vite invocation) is handled by the plugin; `zero dev --port 5191` (CLI invocation) is handled here. Both paths converge on the same precedence model.

  Bisect-verified: pre-fix `zero dev` in a project with `zero({ port: 8080 })` in vite.config.ts binds 3000 (CAC default wins, configPort never consulted). Post-fix binds 8080. `--port 5191` still wins both before and after.

- Updated dependencies [[`c79ade7`](https://github.com/pyreon/pyreon/commit/c79ade7d8384ff7a0afe1a972db2db8c8fd18c88), [`6960087`](https://github.com/pyreon/pyreon/commit/6960087fe09f984636c0ab0ef440280744f19a67), [`acaa216`](https://github.com/pyreon/pyreon/commit/acaa216fb312e8da8f87125b9961834195c8e970), [`af6faf7`](https://github.com/pyreon/pyreon/commit/af6faf78ce02dae1973ed845459bf714adad4fac), [`53b264b`](https://github.com/pyreon/pyreon/commit/53b264b87897a35d8418ad37ce85c805a5b7874f)]:
  - @pyreon/cli@0.17.0
  - @pyreon/zero@0.17.0
  - @pyreon/server@0.17.0
  - @pyreon/create-zero@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`f82584b`](https://github.com/pyreon/pyreon/commit/f82584b3dfb1362d376065354d023647fdbdfa02)]:
  - @pyreon/zero@0.16.0
  - @pyreon/server@0.16.0
  - @pyreon/cli@0.16.0
  - @pyreon/create-zero@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`f3c3644`](https://github.com/pyreon/pyreon/commit/f3c3644499b89d4c72644ed8fad112e15fb0f7b0), [`602446b`](https://github.com/pyreon/pyreon/commit/602446bb49e6ea95fe9d2dbc7774bbf9a66da80d)]:
  - @pyreon/create-zero@0.14.0
  - @pyreon/cli@0.14.0
  - @pyreon/zero@0.14.0
  - @pyreon/server@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.13.0
  - @pyreon/cli@0.13.0
  - @pyreon/create-zero@0.13.0
  - @pyreon/zero@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies [[`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa), [`8c0667d`](https://github.com/pyreon/pyreon/commit/8c0667dccd22d5b794032153c64bc0a029419aaa)]:
  - @pyreon/zero@0.12.15
  - @pyreon/server@0.12.15
  - @pyreon/cli@0.12.15
  - @pyreon/create-zero@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies [[`779f61f`](https://github.com/pyreon/pyreon/commit/779f61f99e1f403485871c1848fc82489d20960f), [`290ea64`](https://github.com/pyreon/pyreon/commit/290ea64ee90b5e749008d2b437084fc001ad24f1)]:
  - @pyreon/server@0.12.14
  - @pyreon/zero@0.12.14
  - @pyreon/cli@0.12.14
  - @pyreon/create-zero@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.12.13
  - @pyreon/cli@0.12.13
  - @pyreon/create-zero@0.12.13
  - @pyreon/zero@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.12.12
  - @pyreon/cli@0.12.12
  - @pyreon/create-zero@0.12.12
  - @pyreon/zero@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/server@0.12.11
  - @pyreon/cli@0.12.11
  - @pyreon/create-zero@0.12.11
  - @pyreon/zero@0.12.11

## 0.5.0

### Minor Changes

- Bump ecosystem to latest, UI system ^0.3.0, Dependabot, template fixes
  - Bump UI system to ^0.3.0, core ^0.7.12, fundamentals ^0.10.0
  - Add Dependabot for automated dependency updates
  - Fix template for @pyreon/store 0.10.0 API (useAppStore returns { store })
  - Use `latest` in static template to prevent version drift
  - Fix camelCase JSX attributes in templates (onClick, srcSet)

### Patch Changes

- Updated dependencies []:
  - @pyreon/zero@0.5.0
  - @pyreon/create-zero@0.5.0

## 0.4.1

### Patch Changes

- Pin GitHub Actions to SHA hashes, add security policy

- Updated dependencies []:
  - @pyreon/zero@0.4.1
  - @pyreon/create-zero@0.4.1

## 0.4.0

### Minor Changes

- Bump to Pyreon 0.7.5 core + 0.9.0 fundamentals, add state-tree, strict types
  - Bump core @pyreon/\* to ^0.7.5, fundamentals to ^0.9.0, UI system ^0.2.0
  - Use @pyreon/typescript preset for strict type checking
  - Add @pyreon/state-tree to meta re-exports
  - Fix all noUncheckedIndexedAccess and exactOptionalPropertyTypes errors
  - Add VNodeChild return types to JSX components
  - Fix integration tests with pyreon() compiler plugin
  - Bump TypeScript to 6.0.2, vitest to 4.1.1
  - Add explicit jsxImportSource + customConditions to root tsconfig (bun compat)

### Patch Changes

- Updated dependencies []:
  - @pyreon/zero@0.4.0
  - @pyreon/create-zero@0.4.0

## 0.3.0

### Minor Changes

- Bump Pyreon ecosystem to 0.7.0 core, add charts/hotkeys/storage/flow/code
  - Bump all core @pyreon/\* deps to ^0.7.0
  - Bump fundamentals to ^0.6.0, UI system to ^0.2.0
  - Add @pyreon/charts, @pyreon/hotkeys, @pyreon/storage to meta re-exports
  - Add @pyreon/flow and @pyreon/code to meta re-exports
  - Add package strategy choice in create-zero (meta barrel vs individual packages)
  - Add charts, hotkeys, storage, flow, code as create-zero feature options
  - Use pinned version ranges instead of 'latest' in scaffolded projects
  - Fix signal setter API for Pyreon 0.7.0 (count.set/count.update)
  - Document provide() helper and onCleanup() in anti-patterns
  - Add Pyreon MCP server config (.mcp.json)

### Patch Changes

- Updated dependencies []:
  - @pyreon/zero@0.3.0
  - @pyreon/create-zero@0.3.0

## 0.2.0

### Minor Changes

- ## @pyreon/zero

  ### New Features
  - **API routes** — file-based `.ts` handlers in `src/routes/api/` with HTTP method exports (GET, POST, PUT, DELETE)
  - **Server actions** — `defineAction()` with automatic client/server boundary detection (direct execution on server, fetch on client)
  - **Per-route middleware** — route files export `middleware` dispatched via `virtual:zero/route-middleware`
  - **Per-route renderMode** — `renderMode` export wired into route `meta.renderMode`
  - **CORS middleware** — configurable origins (string/array/function), credentials, preflight
  - **Rate limiting** — in-memory per-client limiting with `X-RateLimit-*` headers
  - **Compression** — gzip/deflate via native `CompressionStream`
  - **Testing utilities** — `createTestContext`, `testMiddleware`, `createTestApiServer`, `createMockHandler`
  - **Dev error overlay** — styled HTML overlay with source-mapped stack traces for SSR errors
  - **Dev route table** — `zero dev` prints page + API routes on startup

  ### Improvements
  - Bumped all @pyreon/\* core deps to ^0.5.4
  - Added `./actions`, `./api-routes`, `./cors`, `./rate-limit`, `./compression`, `./testing` subpath exports
  - Fixed static adapter build skip for SSG mode
  - 238 unit tests + 11 integration tests (boot real Vite dev server)

  ## @pyreon/zero-cli

  ### New Commands
  - `zero doctor` — detect React patterns (proxies @pyreon/cli)
  - `zero context` — generate AI project context
  - `zero create <name>` — scaffold a new project

  ### Improvements
  - Dev server prints route table on startup (page routes + API routes)

  ## @pyreon/create-zero

  ### New Features
  - **Interactive scaffolding** with @clack/prompts — pick rendering mode, features, AI toolchain
  - Generates customized package.json, vite.config.ts, entry files based on selections
  - AI toolchain opt-in: .mcp.json, CLAUDE.md, doctor scripts

  ## @pyreon/meta

  ### New Packages
  - `@pyreon/machine` — reactive state machines (`createMachine`)
  - `@pyreon/permissions` — reactive permissions (`createPermissions`, `usePermissions`)

  ### Updates
  - All fundamentals: query ^0.5.0, virtual ^0.5.0
  - All UI system: ^0.1.1 (styler, hooks, elements, coolgrid, kinetic, etc.)
  - 75 export verification tests

### Patch Changes

- Updated dependencies []:
  - @pyreon/zero@0.2.0
  - @pyreon/create-zero@0.2.0

## 0.2.0

### Minor Changes

- Initial public release under @pyreon scope.

### Patch Changes

- Updated dependencies []:
  - @pyreon/zero@0.2.0

## 0.1.0

### Minor Changes

- Initial public release of Pyreon Zero meta-framework with SSR/SSG/ISR/SPA modes, file-system routing, optimized components (Image, Link, Script), theme system, font optimization, SEO utilities, cache middleware, and Node/Bun/static deployment adapters.

### Patch Changes

- Updated dependencies []:
  - @pyreon/zero@0.1.0
