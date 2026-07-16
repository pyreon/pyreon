# @pyreon/cli

## 0.47.0

### Patch Changes

- Updated dependencies [[`a5163c8`](https://github.com/pyreon/pyreon/commit/a5163c8f2cedd56fe37a4fce0b1f87fe7f4061ec)]:
  - @pyreon/compiler@0.47.0
  - @pyreon/lint@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [[`7d88cbb`](https://github.com/pyreon/pyreon/commit/7d88cbb45f95d90085c67d4c24d2b0c96a4dabdf), [`8f0912c`](https://github.com/pyreon/pyreon/commit/8f0912c3a36055aa625d582777850c0c3ecfbc04), [`4ec01d8`](https://github.com/pyreon/pyreon/commit/4ec01d8b5cd9a95b04a01deb5ac2a26605dc1974), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435), [`1d73037`](https://github.com/pyreon/pyreon/commit/1d730373c9adcbeef3a6575e7af199f27e69c7bd), [`853c9b6`](https://github.com/pyreon/pyreon/commit/853c9b615459fa891bb0876d0b2d05d478deb728)]:
  - @pyreon/compiler@0.46.0
  - @pyreon/lint@0.46.0

## 0.45.0

### Patch Changes

- [#2187](https://github.com/pyreon/pyreon/pull/2187) [`23dcb8d`](https://github.com/pyreon/pyreon/commit/23dcb8d5d36db664aba437abf792f1949530c746) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Canonicalize `repository.url` to npm's `git+https://…` form across every
  published package, and add a `distribution/non-canonical-repository-url`
  invariant to the distribution gate (`pyreon doctor` / `check-distribution`)
  so it can't regress.

  This removes the `npm warn publish "repository.url" was normalized to
"git+https://github.com/pyreon/pyreon.git"` line npm printed once per
  package on every release (69 lines of publish-log noise). The published
  metadata is byte-identical to what npm was already auto-correcting to —
  there is no runtime or API change.

- Updated dependencies [[`747cced`](https://github.com/pyreon/pyreon/commit/747cced0efd3611bcff4f0d8ec01417ed5f19e45), [`14a78e6`](https://github.com/pyreon/pyreon/commit/14a78e6a28139c4b2af62f338a5e8533f73a96a8), [`f40448a`](https://github.com/pyreon/pyreon/commit/f40448a4743fbced6938e11d603c9124a4ff3c65), [`44dfab8`](https://github.com/pyreon/pyreon/commit/44dfab88fe302d41c19ced373c97e0eba5025378)]:
  - @pyreon/compiler@0.45.0
  - @pyreon/lint@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [[`38deec0`](https://github.com/pyreon/pyreon/commit/38deec0695ae616960966766e530e1b42d138ed1), [`ae2472e`](https://github.com/pyreon/pyreon/commit/ae2472e4ecb31cd59bde23d1983afe7db1c62d99), [`57808e6`](https://github.com/pyreon/pyreon/commit/57808e65d9b2d9823b0b054d0af0371cde078e85), [`e857e7b`](https://github.com/pyreon/pyreon/commit/e857e7be71601bcded333045182b13fb8814a8e5), [`bc4870c`](https://github.com/pyreon/pyreon/commit/bc4870c318abfa12bd037cde428ad7cf182dd4ba), [`4add6bd`](https://github.com/pyreon/pyreon/commit/4add6bd17711a6eb9f0cc9375a3643289bf931c4), [`8413136`](https://github.com/pyreon/pyreon/commit/84131368d6f8790ba50e2af9d383ee289e4b1f5c), [`0274fb6`](https://github.com/pyreon/pyreon/commit/0274fb6a0f838a9f7b4ec41295adef1bf5ed4e95)]:
  - @pyreon/lint@0.44.0
  - @pyreon/compiler@0.44.0

## 0.43.1

### Patch Changes

- [#2142](https://github.com/pyreon/pyreon/pull/2142) [`969dc61`](https://github.com/pyreon/pyreon/commit/969dc61b06c4cf081508e79bf3c2873e1ae08f64) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Cap the `typescript` dependency range to `>=5.0.0 <7.0.0` so a fresh install no longer resolves TypeScript 7.

  **The bug this fixes:** `@pyreon/compiler`'s detectors, audits, and migrators parse with the classic Compiler API (`ts.createSourceFile(f, code, ts.ScriptTarget.ESNext, …)`). TypeScript 7 ("tsgo", the native preview now published as `latest` on npm) REMOVED that API — `ts.ScriptTarget` is `undefined` there, so parsing throws the cryptic `Cannot read properties of undefined (reading 'ESNext')`. Because `@pyreon/mcp`/`@pyreon/compiler`/`@pyreon/cli` declared `typescript` with an uncapped `>=5.0.0` range, a fresh `bunx @pyreon/mcp` (or any clean install) pulled TS7 and every TS-backed tool (`validate` / migrate / audit) crashed, while a project pinned to 5.x/6.x worked. Capping `<7` keeps installs on the working classic-API 6.x line (the project's supported TypeScript).

  Also:

  - `@pyreon/compiler` now declares `typescript` as a real **dependency** (was a peer) — its shipped `lib` unconditionally imports it and calls the classic Compiler API, so consumers (including `bunx`/`npx` runs of `@pyreon/mcp`) get a working TypeScript without relying on peer auto-install.
  - Added a self-diagnosing guard (`assertClassicTs()`, `@pyreon/compiler`): if a project force-pins TypeScript 7 anyway, parse paths now fail with an actionable `[Pyreon]` message ("needs TypeScript 5.x or 6.x … pin `>=5.0.0 <7.0.0`") instead of the mystifying `undefined.ESNext`. It's a plain function (not an import-time check), so importing `@pyreon/compiler` never throws and the MCP server + non-parsing tools stay up.

- Updated dependencies [[`969dc61`](https://github.com/pyreon/pyreon/commit/969dc61b06c4cf081508e79bf3c2873e1ae08f64)]:
  - @pyreon/compiler@0.43.1
  - @pyreon/lint@0.43.1

## 0.43.0

### Patch Changes

- [#2138](https://github.com/pyreon/pyreon/pull/2138) [`e8bfb5c`](https://github.com/pyreon/pyreon/commit/e8bfb5c8ad930f22b2ab3ede6812040079324c56) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix `pyreon doctor` scoring a consumer app a misleading `C` (75/100). The `doc-claims` gate (the "documentation" category) validates the Pyreon **monorepo's own** doc-claim numbers (hook counts, lint-rule counts, …) against framework-internal source files — meaningless in a downstream consumer, where those paths don't exist, so it flooded the category with `file-missing` errors and dragged an otherwise-clean project's grade. It now detects it's outside the monorepo (via the absence of `scripts/check-doc-claims.ts`) and returns **N/A (skipped, excluded from the composite score)** instead of 0. In-monorepo behavior is unchanged.

- Updated dependencies []:
  - @pyreon/compiler@0.43.0
  - @pyreon/lint@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [[`35139f6`](https://github.com/pyreon/pyreon/commit/35139f6e6bf68cac5a268fd5fa148144f4c397d3), [`39051db`](https://github.com/pyreon/pyreon/commit/39051dbcec2aa5f3aa9db79c5ac0a9f9197cc1e9)]:
  - @pyreon/compiler@0.42.0
  - @pyreon/lint@0.42.0

## 0.41.2

### Patch Changes

- Updated dependencies [[`93ee46b`](https://github.com/pyreon/pyreon/commit/93ee46b03f7c13a55abd018ec27376b2b722dbea), [`72770bb`](https://github.com/pyreon/pyreon/commit/72770bbf4453be41332f595a1aa6fa191315199e)]:
  - @pyreon/lint@0.41.2
  - @pyreon/compiler@0.41.2

## 0.41.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.41.1
  - @pyreon/lint@0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies [[`2ade7a9`](https://github.com/pyreon/pyreon/commit/2ade7a9896859abe19739d1b5c02c41ed91f42fa)]:
  - @pyreon/lint@0.41.0
  - @pyreon/compiler@0.41.0

## 0.40.0

### Minor Changes

- [#2049](https://github.com/pyreon/pyreon/pull/2049) [`78048c1`](https://github.com/pyreon/pyreon/commit/78048c1e6563388bdd6d5e28d2e56481c43cb3c9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `pyreon add <pkg...>` — install one or more `@pyreon/*` packages and print exactly how to wire each one in. It auto-detects the project's package manager from the lockfile (bun / pnpm / yarn / npm, walking up from the current directory), accepts bare names (`pyreon add query` == `@pyreon/query`), and prints a tailored, verified setup recipe per package: the root provider to add (e.g. `<QueryClientProvider>`), a usage snippet, and a docs link. `--dry-run` shows the plan without installing; `--json` emits it machine-readably.

  Curated recipes ship for the flagship packages (query, toast, i18n, permissions, form, store, router, head); any other `@pyreon/*` package still installs with a generic docs pointer. Recipes are hand-authored in the CLI (verified against each package's real public API) rather than generated from manifests — published packages don't ship their manifests.

- [#2045](https://github.com/pyreon/pyreon/pull/2045) [`798a385`](https://github.com/pyreon/pyreon/commit/798a38572f4cf5657f67b28e5ef5b8291ba11d3b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `pyreon check [paths]` — a fast, file-scoped anti-pattern scan that runs the compiler's static detectors (`detectPyreonPatterns` + `detectReactPatterns`) over source files and prints each finding with its inline fix. With no path args it scans the git-changed `.ts`/`.tsx` files (the pre-commit inner loop); pass explicit files/dirs to scope it anywhere. Exits non-zero on findings, so it doubles as a pre-commit / CI gate. `--fix` applies the mechanically-safe auto-fixes (`migratePyreonCode` + `migrateReactCode`) in place; `--json` emits machine-readable findings.

  It's the terminal-native twin of the MCP `validate` tool — distinct from `pyreon doctor` (whole-project health + gates, slower) and `pyreon lint` (the `@pyreon/lint` rule set).

- [#2051](https://github.com/pyreon/pyreon/pull/2051) [`6650d81`](https://github.com/pyreon/pyreon/commit/6650d815118968b6dd7f565b0e9424c0cfff50e3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `pyreon mcp` — launch the Pyreon MCP server from the unified CLI. A thin, dependency-free delegator that `npx`-runs `@pyreon/mcp` (the stdio Model-Context-Protocol server serving Pyreon's API reference / patterns / `validate` / `diagnose` to AI coding assistants). Deliberately **not** pinned to `@latest`: it prefers the project-local `@pyreon/mcp` when installed, so the served API reference matches your installed Pyreon version, fetching on demand only when absent. Extra args and `--dry-run` pass through; it inherits stdio so the spawning AI client talks to the server directly.

- [#2050](https://github.com/pyreon/pyreon/pull/2050) [`2012730`](https://github.com/pyreon/pyreon/commit/2012730a58b462955e54629c9afebfc61095690a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `pyreon new [name] [--native]` — scaffold a new Pyreon project from the unified `pyreon` CLI instead of a separately-remembered `npm create @pyreon/zero`. A thin, dependency-free delegator: it `npx`-runs `@pyreon/create-zero@latest` (or `@pyreon/create-multiplatform@latest` with `--native`), passing the project name and any other flags straight through to the scaffolder's interactive flow. Pinned to `@latest` so a new project always starts on the freshest templates regardless of the installed cli version. `--dry-run` prints the npx command without running it.

### Patch Changes

- Updated dependencies [[`ee8cd71`](https://github.com/pyreon/pyreon/commit/ee8cd7184fa439b3fe5bc60cf45d783439707a5c), [`85d4a91`](https://github.com/pyreon/pyreon/commit/85d4a91c5e015af7348ebdd312e0ba5523950a3d), [`80c19ac`](https://github.com/pyreon/pyreon/commit/80c19ac234888ab08b0aea198c87548debebcf18), [`32e1c66`](https://github.com/pyreon/pyreon/commit/32e1c660b4d1da33c592ef5165774981843f8180), [`e6d3905`](https://github.com/pyreon/pyreon/commit/e6d390586944b903ee8d9c97a71cbaf26eca63d6), [`d61d3d9`](https://github.com/pyreon/pyreon/commit/d61d3d9e3acb483b1b5fa8b79f23c03c309ab2c5), [`85d4a91`](https://github.com/pyreon/pyreon/commit/85d4a91c5e015af7348ebdd312e0ba5523950a3d)]:
  - @pyreon/compiler@0.40.0
  - @pyreon/lint@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [[`514f28d`](https://github.com/pyreon/pyreon/commit/514f28da2c442e9fffd694a88a2b8fd8c9a48088), [`0b3e65c`](https://github.com/pyreon/pyreon/commit/0b3e65c49ff2d6245d4e9e56d49140d4abe87773), [`2444405`](https://github.com/pyreon/pyreon/commit/244440585f0066759a0f1bc4aec087e44b131466), [`8a1feb0`](https://github.com/pyreon/pyreon/commit/8a1feb07faca643488c98e89db7bfc08d6867a31), [`74bbc94`](https://github.com/pyreon/pyreon/commit/74bbc9423245e0596872c9a7fb230bacdc411cca)]:
  - @pyreon/compiler@0.39.0
  - @pyreon/lint@0.39.0

## 0.38.0

### Minor Changes

- [#1867](https://github.com/pyreon/pyreon/pull/1867) [`3ba1276`](https://github.com/pyreon/pyreon/commit/3ba1276d2be734a7b9e9ebd09d00b643a4b80396) Thanks [@vitbokisch](https://github.com/vitbokisch)! - cli: add `pyreon info` — environment + installed `@pyreon/*` versions + version-skew detection

  `pyreon info` reports the CLI version, runtime (node/bun/platform), the project
  name (and whether it's a `@pyreon/zero` app), and every `@pyreon/*` package
  installed in `node_modules` with its version. Because Pyreon ships its packages
  on one synced version trajectory, `info` flags **version skew** when the
  installed set spans more than one version — the condition that can trip the
  `registerSingleton` duplicate-instance guard (`[Pyreon] Duplicate @pyreon/X
detected`) and split context/reactivity across instances at runtime.

  ```bash
  pyreon info          # env + installed @pyreon versions + skew check
  pyreon info --json   # machine-readable report
  ```

  Self-contained — reads only the project's `package.json` + `node_modules/@pyreon/*`,
  so it works in any project (or none) with no framework packages required. The pure
  core (`collectInfo` / `scanInstalledPyreon` / `detectSkew` / `formatInfo`) is
  exported for programmatic use.

  Also fixes `pyreon --version`, which was hardcoded to `0.4.0` and now reads the
  package's real version.

- [#1867](https://github.com/pyreon/pyreon/pull/1867) [`3ba1276`](https://github.com/pyreon/pyreon/commit/3ba1276d2be734a7b9e9ebd09d00b643a4b80396) Thanks [@vitbokisch](https://github.com/vitbokisch)! - cli: add `pyreon lint` — a unified front door to `@pyreon/lint`

  `pyreon lint [paths]` forwards every `pyreon-lint` flag verbatim (`--preset`,
  `--fix`, `--format`, `--quiet`, `--rule`, `--config`, `--ignore`, `--watch`,
  `--lsp`). It exits non-zero on lint errors, just like the standalone binary.

  To keep one implementation, `@pyreon/lint` now exports **`runCli(argv): number
| null`** (extracted from its bin's `main()`): returns the exit code, or `null`
  for the long-running `--watch` / `--lsp` modes. Both the `pyreon-lint` bin and
  `pyreon lint` call it, so the two CLIs can never drift. Lazy-loaded in the
  `pyreon` dispatch — no main-entry bundle growth.

- [#1867](https://github.com/pyreon/pyreon/pull/1867) [`3ba1276`](https://github.com/pyreon/pyreon/commit/3ba1276d2be734a7b9e9ebd09d00b643a4b80396) Thanks [@vitbokisch](https://github.com/vitbokisch)! - cli: add `pyreon upgrade` — align every `@pyreon/*` dependency to one version

  The fix for the skew `pyreon info` detects. `pyreon upgrade` rewrites every
  `@pyreon/*` range in `package.json` to a single target — by default the highest
  version present (aligning laggards up), or an explicit `--to <version>`.

  ```bash
  pyreon upgrade              # dry-run: print the alignment plan
  pyreon upgrade --write      # apply (rewrite package.json), then install
  pyreon upgrade --to 0.37.0  # target a specific version
  pyreon upgrade --exact      # pin without the caret
  ```

  Dry-run by default (applies nothing until `--write`). `workspace:` / `link:` /
  `file:` / git specifiers and non-`@pyreon` deps are left untouched. The pure
  core (`resolveTarget` / `computeUpgradePlan` / `rewriteDeps`) is exported for
  programmatic use. Lazy-loaded in the CLI dispatch (no main-entry bundle growth).

### Patch Changes

- [#1926](https://github.com/pyreon/pyreon/pull/1926) [`fae2a7f`](https://github.com/pyreon/pyreon/commit/fae2a7fb36be92194f2d08d0e32de0dbd77d17da) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Consolidate the `doc-claims` gate's CLAUDE.md claim sites to one per count.

  CLAUDE.md was compressed from a per-PR engineering changelog (~2000 lines) down to a lean reference (~330 lines), keeping every durable contract/convention/gotcha + the package tables but cutting per-PR narratives, bisect details, and Phase sagas. As part of that, each gated numeric claim (hook count, lint rule count, lint category count, document output-format count) now lives in ONE CLAUDE.md site — the package-overview table rows + the summary line — instead of being re-quoted in 2–3 redundant per-category bullets / API-description sentences. The `doc-claims` gate's stale claim patterns for those removed sentences are dropped (the table-row patterns still verify each count); the gate now scans 25 claim sites (was 31), still drift-free. No consumer impact — the gate's `actual` functions read Pyreon-monorepo paths that don't exist in a consumer project.

- Updated dependencies [[`8071b15`](https://github.com/pyreon/pyreon/commit/8071b15a6d353f550e7a499a5ace0baa9d7bc564), [`4cfd22f`](https://github.com/pyreon/pyreon/commit/4cfd22f68088f937535064e0a01a42aaf957f3e2), [`a71dfa2`](https://github.com/pyreon/pyreon/commit/a71dfa2a359b278bee6a38fa7a8a41b454adca28), [`a615f46`](https://github.com/pyreon/pyreon/commit/a615f46237685a1bf4a96f535b9375655cde2c79), [`3ba1276`](https://github.com/pyreon/pyreon/commit/3ba1276d2be734a7b9e9ebd09d00b643a4b80396)]:
  - @pyreon/lint@0.38.0
  - @pyreon/compiler@0.38.0

## 0.37.1

### Patch Changes

- Updated dependencies:
  - @pyreon/compiler@0.37.1
  - @pyreon/lint@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.37.0
  - @pyreon/lint@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies:
  - @pyreon/compiler@0.36.0
  - @pyreon/lint@0.36.0

## 0.35.0

### Minor Changes

- [#1636](https://github.com/pyreon/pyreon/pull/1636) [`8a4e195`](https://github.com/pyreon/pyreon/commit/8a4e19519bcf3dfebb203c97f69d08e3f7ac6b50) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native (multiplatform / PMTC) build-hazard detection across the doctor + MCP surfaces, so an AI/dev catches code that compiles for web but silently breaks the iOS/Android build.

  - **`pyreon doctor --check-native`** (new `native-audit` gate, also in the default fast set) scans `.tsx` files importing `@pyreon/primitives` for two hazards the `swiftc -parse` / `kotlinc`-stub gate can't catch: **web-only-package imports** (`@pyreon/charts`/`flow`/`code`/`dnd`/`document`/`query`/`table`/`virtual` + the CSS-in-JS UI stack — fix: host in `<WebView>` or use `@pyreon/primitives`) and **native-dropped top-level `interface`/`enum`/`class`** (fix: `type X = {…}` / string-literal union / functions). Scoped to multiplatform projects (skips gracefully otherwise); warnings only.
  - **MCP `validate`** now runs the same native detector per-snippet (the AI's per-keystroke feedback loop), firing only when the snippet imports `@pyreon/primitives`.
  - **`@pyreon/compiler`** exports `auditNative(cwd)` (project scan) + `detectNativePatterns(code, filename)` (snippet) + their types.

  Pairs with `get_pattern({ name: "multiplatform" })` and the `@pyreon/primitives` `get_api` entries so an AI has both the reference and the feedback to build a correct multiplatform app one-shot.

### Patch Changes

- [#1667](https://github.com/pyreon/pyreon/pull/1667) [`36fc915`](https://github.com/pyreon/pyreon/commit/36fc915ae8dcd85e5e50e2c41e43b56285991665) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon doctor` doc-claims gate: add two new drift counters — **document output-format count** (source of truth: `@pyreon/document`'s `OutputFormat` union) and **published-package count** (non-private `package.json` under `packages/<category>/`) — and wire the root `README.md` in as a claim site for the existing hook-count and lint-rule/category counters. These are the three numbers that had silently drifted in the README ("55+ packages", "33+ hooks", "14+ output formats", "55 lint rules") because nothing gated them. The gate now scans 31 claim sites (was 19); any future drift in these counts fails CI.

- [#1632](https://github.com/pyreon/pyreon/pull/1632) [`d3945ea`](https://github.com/pyreon/pyreon/commit/d3945ea93e4aaf6362a01e1ff4cd4ee168b34f15) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon doctor` no longer surfaces a scary `Module not found` error when run in a user project. The three monorepo-internal gates — `audit-leak-classes` (default run), `audit-types` and `bundle-budgets` (`--full`) — shell out to scripts that only exist in the Pyreon framework repo; they now **skip gracefully with a clear reason** when those scripts aren't present (any project that isn't the Pyreon monorepo), matching how the `doc-claims` gate already handles its monorepo-only claim sites. Previously every `pyreon doctor` run on a user app reported a spurious `audit-leak-classes/gate-failed` ERROR with a raw `Module not found` message.

- Updated dependencies [[`b3957fa`](https://github.com/pyreon/pyreon/commit/b3957fa6f913410e90f917ebce560a1bf85c2dd8), [`f1e46fb`](https://github.com/pyreon/pyreon/commit/f1e46fb08da6a0fdf03f1eab8abc95ad0643def1), [`62f1191`](https://github.com/pyreon/pyreon/commit/62f119168078711ad4056c576805c71cff127c12), [`8a4e195`](https://github.com/pyreon/pyreon/commit/8a4e19519bcf3dfebb203c97f69d08e3f7ac6b50), [`d2d3cb4`](https://github.com/pyreon/pyreon/commit/d2d3cb4a6f585a59333ef5c28c1ba4eefa10e4ea), [`7209861`](https://github.com/pyreon/pyreon/commit/7209861f602d3bdef6bc0ab9de1ea58c4acaa970), [`7209861`](https://github.com/pyreon/pyreon/commit/7209861f602d3bdef6bc0ab9de1ea58c4acaa970), [`0a23659`](https://github.com/pyreon/pyreon/commit/0a23659f71a57a043390936bc88acd249bbdfbe4), [`544c425`](https://github.com/pyreon/pyreon/commit/544c425b6bcf95f772ea04a5e740fb27fa6938d1), [`1c98f38`](https://github.com/pyreon/pyreon/commit/1c98f3863ccd2fd16a4ad6e20e82fb778725bca0), [`e8d945f`](https://github.com/pyreon/pyreon/commit/e8d945fe7a7c23307b0b7d88eeb4cc060224b3a5), [`ee9b328`](https://github.com/pyreon/pyreon/commit/ee9b32875104b8759c2aa180cb6d00d62fa681de), [`a8a8b41`](https://github.com/pyreon/pyreon/commit/a8a8b41ae001883710cd6cd4e4c367987dd6312d)]:
  - @pyreon/compiler@0.35.0
  - @pyreon/lint@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [[`c0814b7`](https://github.com/pyreon/pyreon/commit/c0814b7881b01b7bfed19dffd7f48a3269c14199), [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5), [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5), [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5), [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5), [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5), [`ec41abf`](https://github.com/pyreon/pyreon/commit/ec41abf8c6aaf8dbf442fb6c8e194ab607238e77), [`10bdb4a`](https://github.com/pyreon/pyreon/commit/10bdb4a449151a70ae2d1ffc1bf4a30f303c5bf0), [`9335e1f`](https://github.com/pyreon/pyreon/commit/9335e1fe75df850ffa6434d3a8f956c4c3e46646), [`3ad3247`](https://github.com/pyreon/pyreon/commit/3ad32475b881b19792c010872fc31024b71b7acb), [`a9788cd`](https://github.com/pyreon/pyreon/commit/a9788cdfbebee4ea7468356c3fcea31a6857f11b)]:
  - @pyreon/compiler@0.34.0
  - @pyreon/lint@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.33.0
  - @pyreon/lint@0.33.0

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

- [#1550](https://github.com/pyreon/pyreon/pull/1550) [`4795d0b`](https://github.com/pyreon/pyreon/commit/4795d0be414b89a0f557641bacaeda9c36a0eb69) Thanks [@vitbokisch](https://github.com/vitbokisch)! - doc-claims gate: the hook-count CLAUDE.md anchor no longer hardcodes the category count (`across 6 categories` → `across \d+ categories`). The category number is anchor text, not the asserted value — bumping hook categories (6 → 7) broke the COUNT gate with a confusing `pattern-not-found` instead of a count mismatch.

- [#1491](https://github.com/pyreon/pyreon/pull/1491) [`25ddda0`](https://github.com/pyreon/pyreon/commit/25ddda0d540199a7177cf0ccd4b0cab78912986a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Path updates in `pyreon doctor`'s doc-claims gate + the MCP `get_pattern` tool: the docs site moved from `docs/docs/<topic>.md` to `docs/src/content/docs/<topic>.md` (legacy VitePress → Pyreon-native cutover). The doc-claims gate now reads from the new location; the MCP `get_pattern` candidate paths list includes the new `docs/src/content/docs/patterns/` location while keeping legacy locations as fallbacks for downstream consumers on older repo layouts.

- [#1549](https://github.com/pyreon/pyreon/pull/1549) [`bfb813b`](https://github.com/pyreon/pyreon/commit/bfb813ba5a883c791a8df22c46fa82cf370c6ebe) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon doctor` correctness + accuracy fixes (deep audit follow-up).

  **Robustness** — a gate that throws no longer crashes the whole run. The orchestrator isolates each gate in a try/catch and records a `<gate>/gate-failed` ERROR finding instead of rejecting `Promise.all` and losing every other gate's findings + the score.

  **False positives** (the gates flagged correct code):

  - `pyreon-patterns` now **defers to the `lint` gate** for codes a configured lint rule fully owns (`process-dev-gate`, `raw-add-event-listener`, `query-options-as-function`) — eliminating double-reporting at a wrong hardcoded `'warning'` severity AND the FPs on framework code the lint rule exempts. The kept codes (e.g. `raw-remove-event-listener`, which the add-only lint rule can't catch) honor the project's `.pyreonlintrc.json` exemptPaths.
  - `ssg-audit`'s `dynamic-route-missing-get-static-paths` is now **scoped to `mode: 'ssg'` apps** (resolved from the nearest `vite.config`). SPA/SSR/ISR apps never prerender, so a missing `getStaticPaths` there was a false positive.

  **Scoring** — `audit-leak-classes` findings now route to the advisory `best-practices` category. They were `info` "to keep the grade honest", but `info` still costs 1pt each, so ~45 advisory findings tanked the architecture grade to F. Advisory = VISIBLE but excluded from the grade + `--ci`, which is what the gate's stated intent actually requires.

  **CLI** — `check-dedup` was rejected by `--only`/`--skip` (the CLI's `VALID_GATES` was a hand-kept duplicate that dropped it) even though it runs by default. `VALID_GATES` is now derived from the orchestrator's `[...FAST_GATES, ...SLOW_GATES]`, so it can never drift again; the help text derives its counts the same way.

  **GHA renderer** — annotation property values (`file=`, `title=`) now URL-encode `,` and `:` per the workflow-command spec (a comma in a path previously ended the property early).

  Bisect-verified per fix. Docs (CLAUDE.md, `docs/src/content/docs/cli.md`, orchestrator header) corrected: the gate count (13 total / 11 fast, not 10/8), the 3 gates missing from every table (`content-audit`, `check-dedup`, `audit-leak-classes`), the "single entry point for every gate" overclaim (doctor is the health-gate entry point, not a runner for CI-pipeline gates), `--check-content`, and the stale non-CI-exit claim (`pyreon doctor` is informational and always exits 0; `--ci` gates).

- Updated dependencies [[`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`04525e1`](https://github.com/pyreon/pyreon/commit/04525e1dfc92ff4d7182818c3e9ddaddd8648cbc), [`edaea04`](https://github.com/pyreon/pyreon/commit/edaea04231fc33b585e785bda61e63c14663c045), [`f6f54a2`](https://github.com/pyreon/pyreon/commit/f6f54a254e43f3b36a4c55581381ab582322990e), [`73436e7`](https://github.com/pyreon/pyreon/commit/73436e782319940abde41200299489a809de70d5), [`bfb813b`](https://github.com/pyreon/pyreon/commit/bfb813ba5a883c791a8df22c46fa82cf370c6ebe), [`b9fbb9c`](https://github.com/pyreon/pyreon/commit/b9fbb9cca02295d7db77ae5525b8f5d188848e35), [`fc26160`](https://github.com/pyreon/pyreon/commit/fc26160ac2d3afba0adde20f61d94a4199519b59)]:
  - @pyreon/lint@0.33.0
  - @pyreon/compiler@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.33.0
  - @pyreon/lint@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.33.0
  - @pyreon/lint@0.33.0

## 0.29.0

### Patch Changes

- [#1312](https://github.com/pyreon/pyreon/pull/1312) [`00a6d70`](https://github.com/pyreon/pyreon/commit/00a6d70fac25baf38c90d582cff3c59110bd9aad) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(cli): add 17 real tests for doctor render + check-dedup gates

  17 new tests in `branch-coverage-real.test.ts` covering:

  - `renderText` finding-location branch matrix (no location / path only / line only / line+column / relPath / relatedLocations / fix suggestion)
  - severity icon rendering (error/warning/info)
  - clean state (no findings) + multiple-gates rendering
  - `runDocClaimsGate` graceful handling of missing CLAUDE.md
  - `runCheckDedupGate` graceful handling of missing lockfiles
  - `_parseBunLock`/`_parseNpmLock`/`_parsePnpmLock` minimal-lockfile parsing
  - `_detectDuplicates` find vs empty matrix

  Branches lifted 85.28% → 86.28%. Incremental real-test coverage on the doctor render layer and check-dedup gate.

- Updated dependencies [[`8524e24`](https://github.com/pyreon/pyreon/commit/8524e24651184d275d5bf7520d65caade2ef25b8), [`3ab6d0d`](https://github.com/pyreon/pyreon/commit/3ab6d0d3e645b65c73bef9ec353dc1526ea840c5), [`0ef3f45`](https://github.com/pyreon/pyreon/commit/0ef3f4591fdd7339a0dd597dabc27295eeb09669)]:
  - @pyreon/compiler@0.33.0
  - @pyreon/lint@0.33.0

## 0.28.1

### Patch Changes

- [#1261](https://github.com/pyreon/pyreon/pull/1261) [`de422bc`](https://github.com/pyreon/pyreon/commit/de422bc24ef8d9f434781160f5d1062b8644d5ec) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lift node-side coverage to ≥95% statements / ≥85% branches. Export `_mapLintSeverity` from `doctor/gates/lint.ts` for unit testing; add 8 targeted tests covering severity mapping, distribution gate package-discovery edge cases (no packages/ dir, malformed package.json, non-string name, private packages), and doctor's `--check-islands` + `--check-ssg` legacy flag mapping + non-`ci` exit code path. Bump thresholds: statements 94 → 95, branches 80 → 85, functions 94 → 95, lines 94 → 95. **Removes** the BELOW_FLOOR_EXEMPTIONS entry — package now meets all floors.

- Updated dependencies [[`404d266`](https://github.com/pyreon/pyreon/commit/404d266a33fd272897e70c59e6baad7f31ccab44), [`d4a76a0`](https://github.com/pyreon/pyreon/commit/d4a76a0ca8fa2468c05e96aacc6a8690496e3e8c), [`e97b8d7`](https://github.com/pyreon/pyreon/commit/e97b8d7a63a3f368c6a1e49a71eb22114b202f81), [`fc2da1c`](https://github.com/pyreon/pyreon/commit/fc2da1cbbae059b5e473735e590c21a1efd90d49), [`fccddae`](https://github.com/pyreon/pyreon/commit/fccddae860e3126640dbcbd6d5a0ef22ac419f48)]:
  - @pyreon/compiler@0.28.1
  - @pyreon/lint@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [[`7f446f2`](https://github.com/pyreon/pyreon/commit/7f446f279e344b7db68eaf7c91ddd1a255f89a1f), [`cc4b6b6`](https://github.com/pyreon/pyreon/commit/cc4b6b683e1c1450432f97fc708abda067818e2e), [`889cf5a`](https://github.com/pyreon/pyreon/commit/889cf5aec04dd41a37dd4d47edcdad358e23f3a2)]:
  - @pyreon/lint@0.33.0
  - @pyreon/compiler@0.33.0

## 0.27.1

### Patch Changes

- Updated dependencies [[`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781)]:
  - @pyreon/lint@0.27.1
  - @pyreon/compiler@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.33.0
  - @pyreon/lint@0.33.0

## 0.26.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.26.3
  - @pyreon/lint@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.26.2
  - @pyreon/lint@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.26.1
  - @pyreon/lint@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [[`fce4e86`](https://github.com/pyreon/pyreon/commit/fce4e868611a3f5e006f20a031d43435441901e5), [`ecceb71`](https://github.com/pyreon/pyreon/commit/ecceb710dc442a93818b7d60f38155a9f8cd71b9), [`f4e8b66`](https://github.com/pyreon/pyreon/commit/f4e8b66b3544b00f0ff36c1e64c37a2aec50524e), [`619834c`](https://github.com/pyreon/pyreon/commit/619834ca66940731d85fc8ef0c76898b37d4f8b3), [`4beab18`](https://github.com/pyreon/pyreon/commit/4beab1809566bc642184775ac19717abdeee316e), [`f27477a`](https://github.com/pyreon/pyreon/commit/f27477a681fdc131ea2904940dabb5b8b0e6b9cb), [`76ef68e`](https://github.com/pyreon/pyreon/commit/76ef68efa4daea765ca3eb512be71cc1f7db483c), [`3ebd25f`](https://github.com/pyreon/pyreon/commit/3ebd25fbdd06f8d9f473e8a9281bce27effca209)]:
  - @pyreon/compiler@0.33.0
  - @pyreon/lint@0.33.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/compiler@0.25.1
  - @pyreon/lint@0.25.1

## 0.25.0

### Minor Changes

- [#889](https://github.com/pyreon/pyreon/pull/889) [`4d5d5ec`](https://github.com/pyreon/pyreon/commit/4d5d5ec334b0916e42cfe73d2100596920478024) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon doctor --check-dedup` audit (PR E of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

  New gate that walks `bun.lock` / `package-lock.json` / `pnpm-lock.yaml` for any `@pyreon/*` package with more than one resolved version installed. Emits an `error`-severity finding per duplicated package naming every version + the concrete fix (lockfile rewrite, reinstall, `PYREON_SINGLE_INSTANCE=warn` mitigation).

  **Defense-in-depth Layer 3.** Pairs with:

  - Layer 1 (PR B / [#884](https://github.com/pyreon/pyreon/issues/884)): `@pyreon/vite-plugin` injects `resolve.dedupe` — BUNDLER prevention
  - Layer 2 (PR A / [#883](https://github.com/pyreon/pyreon/issues/883)): every `@pyreon/*` calls `registerSingleton` — RUNTIME detection
  - **Layer 3 (THIS PR): static lockfile scan — CI gate, catches duplicate installs before deploy**

  Three pure parsers exported as `_internal` for unit-testability without filesystem dependencies:

  - `_parseBunLock(raw)` — bun.lock JSON format (`lockfileVersion: 1`); skips `workspace:*` resolutions
  - `_parseNpmLock(raw)` — package-lock.json v2/v3 format (matches nested `node_modules/.../@pyreon/<name>` paths)
  - `_parsePnpmLock(raw)` — pnpm-lock.yaml v6 + v9+ formats via keyed-line regex

  Wired into the doctor orchestrator as a fast-set gate (runs by default). Gate count: 10 fast + 2 slow = 12 with `--full`.

  CLI: `pyreon doctor --check-dedup [--json]` (via the `--only <gate>` shortcut convention).

  Test coverage: 20 specs covering each parser, the duplicate detector, and the full `runCheckDedupGate` integration against temp-dir fixtures. Bisect-verified — neutralizing the detection loop fails 5 detection tests; restored passes 20/20. Also includes a regression spec that runs the gate against the actual workspace `bun.lock` and asserts zero findings (every `@pyreon/*` is `workspace:*`).

### Patch Changes

- [#895](https://github.com/pyreon/pyreon/pull/895) [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Post-audit fixes for the bullet-proof cross-module-instance architecture (PRs [#883](https://github.com/pyreon/pyreon/issues/883)/[#884](https://github.com/pyreon/pyreon/issues/884)/[#886](https://github.com/pyreon/pyreon/issues/886)/[#889](https://github.com/pyreon/pyreon/issues/889)). Closes 1 HIGH-severity race condition + 2 correctness bugs surfaced by the deep release-readiness audit.

  **1. HIGH — race condition in sentinel opt-out under concurrent `Promise.all`** (`@pyreon/reactivity` + `@pyreon/zero` + `@pyreon/vite-plugin`).

  The env-var dance pattern (`process.env.PYREON_SINGLE_INSTANCE = 'silent'` / capture+restore) used by `ssrLoadModuleQuiet`, SSG-plugin's built-handler import, and rocketstyle-collapse's nested-SSR resolver was race-prone under `Promise.all` of N opt-out scopes:

  1. Call A: captures `prev=undefined`, sets `'silent'`
  2. Call B: captures `prev='silent'` (post-A's write), sets `'silent'`
  3. A's `finally` deletes env (prev was undefined)
  4. B's `finally` restores `'silent'` ← **leaked permanently**

  Effect: the sentinel was silently disabled for the entire dev / SSG / collapse-resolver process lifetime. Bisect-verified with a focused reproducer; the leak fires with 5 concurrent scopes in `renderSsr`.

  **Fix**: `@pyreon/reactivity` ships two new exports:

  - `withSilent(fn): Promise<T>` — async refcount-based scope. Increments `silentDepth` on the sentinel state, awaits the fn, decrements in `finally`. Order-independent under concurrency.
  - `withSilentSync(fn): T` — sync variant.

  All three call sites updated to use `withSilent` instead of the env-var dance. The env-var (`PYREON_SINGLE_INSTANCE`) is preserved as the documented user-facing escape hatch for browser extensions / micro-frontends.

  `@pyreon/vite-plugin` gains a runtime dep on `@pyreon/reactivity` (rocketstyle-collapse).

  **2. BUG — pnpm v9 peer-suffix false-positive duplicate** (`@pyreon/cli`).

  `pyreon doctor --check-dedup`'s `_parsePnpmLock` regex parsed `/@pyreon/core@1.0.0(react@19.0.0):` keys with the peer suffix INCLUDED in the version. Two installs sharing the same `1.0.0` but resolved against different peers were counted as TWO distinct versions → false-positive `multiple-versions` finding.

  **Fix**: strip the `(...)` suffix when adding to the version set. Build-metadata versions (`1.0.0+build.42` — no `(`) round-trip unchanged. Genuine multi-version dups remain detectable. 3 new regression specs.

  **3. BUG — `PYREON_DISABLE_DEDUPE` only triggered on literal `'1'`** (`@pyreon/vite-plugin`).

  Users reaching for an escape-hatch env var under stress reach for `true` / `yes` / `on` first. The strict `=== '1'` check silently no-op'd those alternatives — worst-of-both-worlds (escape hatch present but doesn't fire).

  **Fix**: `_isTruthyEnv(v)` accepts `1` / `true` / `yes` / `on` case-insensitively. 11 new specs covering both positive (truthy) and negative (falsy / unrecognized) values.

  All three fixes are bisect-verified — neutralizing each fails its dedicated test(s); restored passes. Full repo validation: 3,978 tests pass across 10 affected packages (`reactivity` 444, `core` 531, `router` 521, `runtime-dom` 681, `runtime-server` 150, `head` 115, `server` 168, `cli` 177, `vite-plugin` 193, `zero` 998). `pyreon doctor` clean on all changed files. Bundle budgets clean.

- Updated dependencies [[`32ca446`](https://github.com/pyreon/pyreon/commit/32ca44676723f196cf7cde48f78d49c67a8d34d0), [`9f19029`](https://github.com/pyreon/pyreon/commit/9f190298828b4204a617d30d5b7ae4fedd2b3eb1)]:
  - @pyreon/compiler@0.25.0
  - @pyreon/lint@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.6
  - @pyreon/lint@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.5
  - @pyreon/lint@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.4
  - @pyreon/lint@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.3
  - @pyreon/lint@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.2
  - @pyreon/lint@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.24.1
  - @pyreon/lint@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`275eb20`](https://github.com/pyreon/pyreon/commit/275eb2038f32374e90c9fe0c3d55f35895f43450), [`47073eb`](https://github.com/pyreon/pyreon/commit/47073ebdd7552c63985f461a663ba98d93538606), [`572212f`](https://github.com/pyreon/pyreon/commit/572212f631907a18b98118f48dea3621dd5a95b1), [`f22902a`](https://github.com/pyreon/pyreon/commit/f22902a9a9c5f5b8a5192da086a6b4299291dd57), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`cc536f0`](https://github.com/pyreon/pyreon/commit/cc536f071244c0a5f791da899e1bc52b20819f1b), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`572212f`](https://github.com/pyreon/pyreon/commit/572212f631907a18b98118f48dea3621dd5a95b1)]:
  - @pyreon/compiler@0.24.0
  - @pyreon/lint@0.24.0

## 0.23.0

### Patch Changes

- [#750](https://github.com/pyreon/pyreon/pull/750) [`8e81b4a`](https://github.com/pyreon/pyreon/commit/8e81b4a268507b9c9981ba47087c70b7f36a4fc1) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(cli): wire audit-leak-classes into `pyreon doctor` + CI nightly + CONTRIBUTING pointer

  Closes the 3 remaining gaps from the post-[#748](https://github.com/pyreon/pyreon/issues/748) review of the
  leak-class sweep:

  ### 1. `pyreon doctor` integration

  `audit-leak-classes` is now a fast gate in `pyreon doctor` (runs by
  default alongside `audit-tests`, `islands-audit`, `ssg-audit`). Maps
  every finding to severity `'info'` — the audit is advisory by design;
  mapping to error/warning would push the score down for known-bounded
  patterns (Chrome extension scripts, framework-owned lifecycles,
  enum-keyed caches) which the script deliberately flags. The `'info'`
  mapping keeps the doctor's grade honest while making the catalog
  discoverable through the existing doctor surface every user runs.

  Available via:

  - `pyreon doctor` — runs alongside the 8 other fast gates
  - `pyreon doctor --only audit-leak-classes` — just this gate
  - `pyreon doctor --json` — machine-readable per existing convention

  ### 2. CI nightly run

  `.github/workflows/audit-leak-classes.yml` — nightly `schedule: '23 4 * * *'`

  - manual `workflow_dispatch` + opt-in via `leak-audit` PR label. Uploads
    both `findings.json` (machine-readable, 30-day retention) and
    `findings.txt` (human-readable summary) as artifacts. Posts a summary
    to the workflow output with collapsed full report.

  **Soft ceiling** at 40 findings — fails the job if total exceeds 40
  (current baseline ~21, 2x headroom). This catches a sudden spike from
  a recent merge without gating individual PRs. Tunable as the leak-hunt
  sweep matures.

  ### 3. CONTRIBUTING.md pointer

  New "Memory-Leak Avoidance" section between Code Style and Commit
  Messages. Documents the 3 preventative layers (lint rules + static
  audit + anti-patterns catalog) and the 3-question defensive check
  when adding module-level state. Cross-references the canonical
  catalog in `.claude/rules/anti-patterns.md`.

  ### Validation

  - `@pyreon/cli` 147/147 tests pass (+1 new test suite for the gate
    adapter with 3 specs covering parse-output mapping, path
    relativization, and empty-findings edge case)
  - Lint + typecheck clean
  - `bun run check-doc-claims` clean (19/19 claim sites)
  - `pyreon doctor --only audit-leak-classes` end-to-end smoke verified
    — produces 21 findings (the script's current baseline)

  ### Closes the post-[#748](https://github.com/pyreon/pyreon/issues/748) review

  This finishes the leak-class sweep at the discoverability layer.
  The 11-PR sweep total now covers: 8 fix PRs ([#725](https://github.com/pyreon/pyreon/issues/725)-[#741](https://github.com/pyreon/pyreon/issues/741)) + 2
  preventative lint rules ([#743](https://github.com/pyreon/pyreon/issues/743)) + documentation ([#746](https://github.com/pyreon/pyreon/issues/746)) + monitoring
  ([#747](https://github.com/pyreon/pyreon/issues/747)) + audit script + 2 more fixes ([#748](https://github.com/pyreon/pyreon/issues/748)) + integration (this PR).

- Updated dependencies [[`5c9e45b`](https://github.com/pyreon/pyreon/commit/5c9e45b4797bfc3043d6be9e0d5c022e49639f54), [`6454cb7`](https://github.com/pyreon/pyreon/commit/6454cb794bb82db11e7842cb4a62a3765e3dd3ac), [`eea2972`](https://github.com/pyreon/pyreon/commit/eea29723e36088ec32d3e817e0f5f61606c9b949), [`9be148b`](https://github.com/pyreon/pyreon/commit/9be148b21ef6a31a5e5c98ead363f5f532ee0399), [`c19084c`](https://github.com/pyreon/pyreon/commit/c19084c6a57ca6651f62acdd584f17ad3a81aaab), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/lint@0.23.0
  - @pyreon/compiler@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.22.0
  - @pyreon/lint@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.21.0
  - @pyreon/lint@0.21.0

## 0.20.0

### Patch Changes

- [#656](https://github.com/pyreon/pyreon/pull/656) [`abda63c`](https://github.com/pyreon/pyreon/commit/abda63c541343cfe967a5c70ce223a6675ceaa8e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon doctor` text output now follows the Pyreon brand handoff ([#651](https://github.com/pyreon/pyreon/issues/651)) — CLI spec §6.5 / `pyr doctor` §6.6.

  `render/ansi.ts` maps every brand token to its nearest **xterm-256** index and emits 8-bit SGR (`38;5;N`). The handoff is explicit — _"256-color terminal palette must survive (no truecolor-only colors)"_ — so there is no `38;2;r;g;b`; the codes render identically on truecolor terminals and remain correct on 256-only ones. Mapping: `red`→ember-core `#FF5E1A` (202, errors / fail grade / `✗`), `yellow`→ember-warm `#FFC83D` (220, warnings · hints · `!`), `green`→ok-green `#4ADE80` (78, pass / grade A), `cyan`→brand cyan `#22D3EE` (45, info · links), `gray`→muted-2 `#8A8696` (245, separators · headings · skipped), `magenta`→ember-plasma (198). Severity glyphs aligned to §6.5: `✗` error, `!` warning (`ℹ` kept for info — the findings list only renders problems, never passes, so the brand `✓` would mislead).

  Ember stays scarce by construction, as the brand mandates — it only colors error/fail states and the worst grade, never decoration. No structural/output-shape change; `NO_COLOR` / `FORCE_COLOR` / TTY logic and OSC-8 hyperlinks untouched, so `--json` / `--gha` / `--ci` and all snapshots are unaffected (render tests run `FORCE_COLOR=0`).

  Verified: dependency-free assertion that the emitted codes are exactly `38;5;{202,220,78,45,245,198}` with zero `38;2` (truecolor) sequences; `@pyreon/cli` render tests 14/14 pass; oxlint clean.

- Updated dependencies [[`c3df9db`](https://github.com/pyreon/pyreon/commit/c3df9dbbcf9e939c92e1c4843b59686cdd25589e), [`9a54705`](https://github.com/pyreon/pyreon/commit/9a54705c645ff2c3bee54fa8c6d411d1530b3187), [`bbccaaf`](https://github.com/pyreon/pyreon/commit/bbccaaf3ec2f5dc3eed3e7195a09023fc59575d1), [`abda63c`](https://github.com/pyreon/pyreon/commit/abda63c541343cfe967a5c70ce223a6675ceaa8e), [`24a063c`](https://github.com/pyreon/pyreon/commit/24a063ccfa2ef267927dfd68886be24c397ccd72), [`a086769`](https://github.com/pyreon/pyreon/commit/a0867699bdeca87f34e60fef7aa867a75a24d815), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7)]:
  - @pyreon/compiler@0.20.0
  - @pyreon/lint@0.20.0

## 0.19.0

### Minor Changes

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

- [#635](https://github.com/pyreon/pyreon/pull/635) [`c8d6f27`](https://github.com/pyreon/pyreon/commit/c8d6f27b8d207b25a2f378eedc21af11adfe3653) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(cli): non-grade-gating `best-practices` advisory category for `pyreon doctor`

  Follow-up [#4](https://github.com/pyreon/pyreon/issues/4). Resolves the objectivity tension from the doctor-objective
  work ([#630](https://github.com/pyreon/pyreon/issues/630)): enabling the opt-in `@pyreon/lint` best-practice rules
  ([#632](https://github.com/pyreon/pyreon/issues/632)/[#634](https://github.com/pyreon/pyreon/issues/634) — `frontend`/`query`/`rx`/`i18n` + form/router opt-in) used
  to fold into `correctness`/`architecture`, tanking the objective health
  grade and failing `--ci` — punishing projects for adopting opinionated
  best practices (opinionated ≠ broken).

  New advisory `FindingCategory: 'best-practices'`. The lint gate routes
  every `meta.optIn` rule's findings here regardless of its lint category
  (`gates/lint.ts`). It is **scored + displayed** (own breakdown, labeled
  `advisory — excluded from grade & --ci` in the text renderer; never
  shown as "skipped") but **always `included: false`** so it never enters
  the overall mean/grade, and `doctor.ts` excludes advisory errors from
  the `--ci` exit code. `isAdvisoryCategory()` exported from `doctor/score`.

  Verified: `@pyreon/cli` 141 tests pass (+3 advisory specs: always-
  excluded-from-mean, scored-for-visibility, 10 advisory errors don't move
  the grade); typecheck clean; full-repo oxlint 0 errors. Self-run proof:
  doctor grade/score/errors **byte-identical** to baseline with the
  category added (zero regression), advisory row renders correctly.
  Doctor/CLI-only — runtime-inert (no e2e impact, same class as [#632](https://github.com/pyreon/pyreon/issues/632)/[#634](https://github.com/pyreon/pyreon/issues/634)).

  NOTE — deferred (honest scope): [#4](https://github.com/pyreon/pyreon/issues/4)'s "more frontend a11y rules" half is
  deliberately NOT in this PR. Adding lint rules off `main` while [#632](https://github.com/pyreon/pyreon/issues/632)'s
  rule-count manifest claims and [#634](https://github.com/pyreon/pyreon/issues/634)'s are still unmerged would create
  manifest/count-claim merge conflicts across the stack. Those a11y rules
  land cleanly in a follow-up once [#632](https://github.com/pyreon/pyreon/issues/632)/[#634](https://github.com/pyreon/pyreon/issues/634) merge (rebased onto the real
  76-rule baseline) — not faked into this PR.

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

### Patch Changes

- Updated dependencies [[`bcc3cd5`](https://github.com/pyreon/pyreon/commit/bcc3cd50d3cc19b486a8169fbe941848edd793c7), [`82d78b4`](https://github.com/pyreon/pyreon/commit/82d78b4889344bad26175d4adf07c682d639dfa3), [`5fb461a`](https://github.com/pyreon/pyreon/commit/5fb461aaf9fcc8d2a624af1442f4db97fd7f33c9), [`5b69841`](https://github.com/pyreon/pyreon/commit/5b69841a6ab30963977e276d120c33d66682da23), [`e274fce`](https://github.com/pyreon/pyreon/commit/e274fceeb37d0893c7425463e443185388fce475), [`dcd2136`](https://github.com/pyreon/pyreon/commit/dcd21360cca7528cbfe87020428394a11aa30ea0), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`6472de0`](https://github.com/pyreon/pyreon/commit/6472de00ffdbcff1fd453c125c404b75fc5cc46d), [`0408e47`](https://github.com/pyreon/pyreon/commit/0408e475e63770996eff17bfb6ac318e89c45df4), [`8f1aad3`](https://github.com/pyreon/pyreon/commit/8f1aad3cc44d86f9248cfd4b7def10c914748bb0), [`7e0fe1a`](https://github.com/pyreon/pyreon/commit/7e0fe1a4f7cbb68f7647d85bef843de90d04d506), [`9de49da`](https://github.com/pyreon/pyreon/commit/9de49dab97c91c8707decd10ce89085d8d6942e0), [`c5b2ea2`](https://github.com/pyreon/pyreon/commit/c5b2ea2fe0df3f52b2af21e0d79b1e391ca9fad5), [`6581f07`](https://github.com/pyreon/pyreon/commit/6581f073293a72360fe9391990d08316e0dc5b4b), [`070a0ec`](https://github.com/pyreon/pyreon/commit/070a0ec687ad598cf15963e5615bb1d8c81933a3)]:
  - @pyreon/lint@0.19.0
  - @pyreon/compiler@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [[`f35e69b`](https://github.com/pyreon/pyreon/commit/f35e69b2ab53474ecf0ffb792866bc27215b68c3)]:
  - @pyreon/compiler@0.18.0
  - @pyreon/lint@0.18.0

## 0.17.0

### Minor Changes

- [#570](https://github.com/pyreon/pyreon/pull/570) [`c79ade7`](https://github.com/pyreon/pyreon/commit/c79ade7d8384ff7a0afe1a972db2db8c8fd18c88) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Foundation for `pyreon doctor` v2 — unified gate API + 4 programmatic gates.

  Introduces a shared `Finding` + `GateResult` shape (`packages/tools/cli/src/doctor/types.ts`) every doctor gate emits, and extracts four standalone-script gates as programmatic functions so the follow-up aggregator can produce a unified `DoctorReport` with per-category subscores + an overall 0-100 health score:

  - `runDistributionGate({ cwd })` — pure-function port of `scripts/check-distribution.ts`. Emits `distribution/missing-sideEffects`, `distribution/missing-map-exclusion`, `distribution/tarball-contains-map` findings under `category: 'architecture'`.
  - `runDocClaimsGate({ cwd })` — pure-function port of `scripts/check-doc-claims.ts`. Emits `doc-claims/<check>-drift` / `-hedged` / `-pattern-miss` / `-file-missing` findings under `category: 'documentation'`.
  - `runAuditTypesGate({ cwd })` — subprocess adapter over `scripts/audit-types.ts --json --all`. Maps HIGH/MEDIUM/LOW script severities onto `error`/`warning`/`info` and emits `audit-types/typed-but-unimplemented-<severity>` under `category: 'architecture'`. The script is 476 lines of mature AST-walking logic; the adapter shape keeps this PR tractable while letting the aggregator consume the same `Finding[]` as the other gates.
  - `runBundleBudgetsGate({ cwd })` — subprocess adapter over `scripts/check-bundle-budgets.ts --json`. Emits `bundle-budgets/over-budget`, `bundle-budgets/missing-budget`, `bundle-budgets/bundle-failed` under `category: 'performance'`. Slowest gate by a wide margin (~15-30s); doctor's follow-up `--full` flag is what enables it.

  The standalone scripts (`scripts/check-distribution.ts`, `scripts/check-doc-claims.ts`) are now thin CLI wrappers that delegate to the gate functions and preserve their historical JSON output shape (`{ violations, totalPackages }` / `{ drifts }`) for backward compat with any CI consumers parsing the output.

  No behavior change for CI gates or end users in this PR — this is foundation work for the upcoming `pyreon doctor` v2 aggregation + scoring + beautiful CLI output.

- [#575](https://github.com/pyreon/pyreon/pull/575) [`6960087`](https://github.com/pyreon/pyreon/commit/6960087fe09f984636c0ab0ef440280744f19a67) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon doctor` v2 — feature-complete project health audit with a 0-100 score
  and beautiful CLI output (after [react.doctor](https://www.react.doctor/)).

  **What's new** (on top of PR 1's foundation):

  - **6 new gates** wired into the unified `GateResult` API:
    `react-patterns`, `pyreon-patterns`, `lint` (all 66 `@pyreon/lint` rules),
    `audit-tests`, `islands-audit`, `ssg-audit`.
  - **Score module** — pure per-category 0-100 subscores + overall weighted
    mean. Severity weights: `error=10 / warning=3 / info=1`. Letter grades
    A/B/C/D/F. Categories with no gate coverage are excluded from the mean
    rather than counted as perfect-100 (would inflate the score).
  - **DoctorReport aggregator** — `buildReport(gates) → { score, grade,
categories[], findings[], gates[], totals, elapsedMs, timestamp }`.
    Pure-function: gate results in, report out. Findings sorted errors →
    warnings → infos, then by category.
  - **Beautiful CLI output** — big-score banner with letter grade,
    per-category bar chart (12-cell ░/█ fill), severity-iconed top-N
    findings with code + clickable file:line:col location (OSC-8
    hyperlinks for iTerm2 / WezTerm / kitty / VSCode), fix hints, skipped-
    gates footer. ANSI colors respect `NO_COLOR` / `FORCE_COLOR`.
  - **`--json`** — full `DoctorReport` for AI agents + dashboards.
  - **`--gha`** — GitHub Actions annotation lines (`::error file=X,
line=Y,col=Z::msg`) for inline PR annotations.
  - **Modes** — `--full` (enable slow gates: audit-types, bundle-budgets),
    `--only <gates>`, `--skip <gates>`, `--fix` (lint + react-patterns),
    `--ci` (exit nonzero on error findings only). `--only` precedence
    over `--full`; `--skip` applies after `--only` (intersection).
  - **Parallel execution** — `Promise.all` over selected gates cuts
    wall-clock from ~5s sequential to ~1-2s for the fast set.
  - **Legacy flag compat** — `--audit-tests`, `--check-islands`,
    `--check-ssg` still work; they map to `--only <gate>` shortcuts so
    existing CI scripts continue to function unchanged.

  **Output sample** (text mode):

  ```text
    pyreon doctor · project health audit

    Score:  92/100   Grade: A

    Per category:

    correctness    █████████░░░  87 · 1E 1W
    performance    ████████████ 100 · clean
    architecture   ████████████ 100 · clean
    testing        ████████████ 100 · clean
    documentation  ████████████ 100 · clean

    Top findings (2 of 2):

    ✖ useState imported from React. Use signal() from @pyreon/reactivity.
       src/App.tsx:1:9
       fix: import { signal } from "@pyreon/reactivity"

    ⚠ className → class (HTML standard attribute).
       src/App.tsx:3:18

    1 error · 1 warning · 8 gates · 1.4s
  ```

  No breaking changes — all existing flags (`--audit-tests`,
  `--check-islands`, `--check-ssg`, `--fix`, `--json`, `--ci`) keep
  working.

### Patch Changes

- [#578](https://github.com/pyreon/pyreon/pull/578) [`acaa216`](https://github.com/pyreon/pyreon/commit/acaa216fb312e8da8f87125b9961834195c8e970) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon doctor` v2 — two rough-edge fixes surfaced by real-app testing.

  **lint gate emitted absolute paths.** Every lint finding's `location.relPath`
  held the full absolute path from `fileResult.filePath` instead of a path
  relative to the doctor's `cwd`. Reports rendered as
  `/Users/.../packages/tools/react-compat/src/index.ts:830:4` instead of
  `packages/tools/react-compat/src/index.ts:830:4` — long, leaked the user's
  home directory, broke OSC-8 hyperlink alignment. Fix: route through
  `path.relative(opts.cwd, fileResult.filePath)`.

  **doc-claims gate flooded non-Pyreon projects with spurious errors.** The
  gate hardcodes Pyreon-monorepo-specific claim sites
  (`packages/fundamentals/hooks/README.md`, `CLAUDE.md`,
  `docs/docs/index.md`, etc.) — none of which exist in a downstream consumer
  app. Running `pyreon doctor` against a clean project produced 7
  `file-missing` errors that blamed the user for paths the gate had no
  business asserting. Fix: pre-check whether ANY of the gate's claim files
  exist; if zero do, return `meta.skipped: true` with
  `skipReason: 'no claim sites found in this project (gate targets Pyreon
monorepo paths)'`. The aggregator then excludes documentation from the
  score mean rather than counting it as 0/100.

  Test coverage: the original "emits file-missing when claim file absent"
  test was tightened to plant one claim file first (so the gate doesn't
  skip), and a new "skips gate when no claim files exist" test locks the
  non-Pyreon-project behavior. 102 tests pass.

- Updated dependencies [[`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/compiler@0.17.0
  - @pyreon/lint@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.16.0

## 0.14.0

### Minor Changes

- [#311](https://github.com/pyreon/pyreon/pull/311) [`602446b`](https://github.com/pyreon/pyreon/commit/602446bb49e6ea95fe9d2dbc7774bbf9a66da80d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Test-environment audit (T2.5.7) — scans every `*.test.ts(x)` under `packages/` for mock-vnode patterns (the PR [#197](https://github.com/pyreon/pyreon/issues/197) bug class: tests that construct `{ type, props, children }` literals or a custom `vnode()` helper instead of going through the real `h()` from `@pyreon/core`). Classifies each file as HIGH / MEDIUM / LOW based on the balance of mock literals, helper definitions, helper call-sites, real `h()` calls, and the `@pyreon/core` import.

  Scanner lives in `@pyreon/compiler` (`auditTestEnvironment`, `formatTestAudit`) so both `@pyreon/mcp` and `@pyreon/cli` can use it without pulling in each other.

  - **MCP**: new `audit_test_environment` tool. Options `minRisk` (default `medium`) and `limit` (default 20). Scans 400+ test files in ~50ms.
  - **CLI**: `pyreon doctor --audit-tests` appends the audit output. `--audit-min-risk high|medium|low` to filter. Honors `--json` for machine-readable output.

### Patch Changes

- Updated dependencies [[`aa8e61b`](https://github.com/pyreon/pyreon/commit/aa8e61b873b7d42c60a613f57841a75293080c8a), [`602446b`](https://github.com/pyreon/pyreon/commit/602446bb49e6ea95fe9d2dbc7774bbf9a66da80d), [`4638c27`](https://github.com/pyreon/pyreon/commit/4638c2761ec34b1102a36c4675cfcfa805c2168c), [`83aa9ab`](https://github.com/pyreon/pyreon/commit/83aa9abbc52d423dfc9d45a3b0a4e048b161186d)]:
  - @pyreon/compiler@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.12.11

## 0.7.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.2

## 0.7.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.1

## 0.7.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.6.0

## 0.5.7

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.7

## 0.5.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.6

## 0.5.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.4

## 0.5.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.3

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.2

## 0.5.1

### Patch Changes

- Unify project scanner into @pyreon/compiler, fix JSX type declarations for published packages, update dependencies, and resolve build compatibility with rolldown 1.15.0.

- Updated dependencies []:
  - @pyreon/compiler@0.5.1

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

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.5.0
