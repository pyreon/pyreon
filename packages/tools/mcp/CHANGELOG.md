# @pyreon/mcp

## 0.42.0

### Minor Changes

- [#2136](https://github.com/pyreon/pyreon/pull/2136) [`88f2815`](https://github.com/pyreon/pyreon/commit/88f281514bd34a700191fda8a6d8131288df184c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Make `@pyreon/mcp` fully usable in a consumer project via `bunx @pyreon/mcp` (the shipped `.mcp.json` config). Two fixes:

  - **`typescript` is now a runtime dependency (was a peer).** The code-analysis tools (`validate`, `explain_reactivity`, `diagnose`, `migrate_react`, `migrate_pyreon`) call into `@pyreon/compiler`, which uses the TypeScript compiler API. In a `bunx` isolated env the peer wasn't installed, so those tools threw (`Cannot find package 'typescript'` / `Cannot read properties of undefined (reading 'ESNext')`). Declaring `typescript` as a dependency makes `bunx` install it alongside the compiler.
  - **Doc/content tools now ship a bundled snapshot.** `get_pattern`, `get_anti_patterns`, and `get_changelog` read from monorepo files (`docs/src/content/docs/patterns/*.md`, `.claude/rules/anti-patterns.md`, `packages/**/CHANGELOG.md`) that don't exist in a consumer checkout — so they returned empty. The published package now includes a `content/` snapshot of those files (regenerated on every build via `scripts/copy-content.ts`). The loaders prefer the live monorepo source when present (in-repo dev sees the latest) and fall back to the bundled snapshot otherwise, so the tools return real content in consumers.

### Patch Changes

- Updated dependencies [[`35139f6`](https://github.com/pyreon/pyreon/commit/35139f6e6bf68cac5a268fd5fa148144f4c397d3), [`39051db`](https://github.com/pyreon/pyreon/commit/39051dbcec2aa5f3aa9db79c5ac0a9f9197cc1e9)]:
  - @pyreon/compiler@0.42.0

## 0.41.2

### Patch Changes

- Updated dependencies [[`72770bb`](https://github.com/pyreon/pyreon/commit/72770bbf4453be41332f595a1aa6fa191315199e)]:
  - @pyreon/compiler@0.41.2

## 0.41.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.41.0

## 0.40.0

### Patch Changes

- [#2070](https://github.com/pyreon/pyreon/pull/2070) [`80c19ac`](https://github.com/pyreon/pyreon/commit/80c19ac234888ab08b0aea198c87548debebcf18) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New `detectPyreonPatterns` code `static-early-return-conditional`: flags `if (loading()) return <Skeleton/>` at the top of a component body when the condition reads a tracked `signal()`/`computed()` binding. Components run ONCE — the branch is evaluated exactly once at mount and the component is pinned to it forever (verified end-to-end: the compiler emits the shape unchanged with zero warnings, and TS2774 does not cover it because the signal IS called). The message prescribes `<Show when={() => loading()} fallback={…}>` or a returned reactive accessor. Signal-binding-gated only (helper-call / props / env conditions stay unflagged); the `return null` shape stays with `static-return-null-conditional`, so the two codes never double-fire. Surfaced automatically by MCP `validate`, `pyreon check`, and `pyreon doctor`. Also fixes stale manifest prose (detector count 14 → 16; the "every diagnostic reports `fixable: false`" invariant claim, superseded when `migratePyreonCode` shipped).

- Updated dependencies [[`ee8cd71`](https://github.com/pyreon/pyreon/commit/ee8cd7184fa439b3fe5bc60cf45d783439707a5c), [`85d4a91`](https://github.com/pyreon/pyreon/commit/85d4a91c5e015af7348ebdd312e0ba5523950a3d), [`80c19ac`](https://github.com/pyreon/pyreon/commit/80c19ac234888ab08b0aea198c87548debebcf18), [`32e1c66`](https://github.com/pyreon/pyreon/commit/32e1c660b4d1da33c592ef5165774981843f8180), [`e6d3905`](https://github.com/pyreon/pyreon/commit/e6d390586944b903ee8d9c97a71cbaf26eca63d6), [`d61d3d9`](https://github.com/pyreon/pyreon/commit/d61d3d9e3acb483b1b5fa8b79f23c03c309ab2c5), [`85d4a91`](https://github.com/pyreon/pyreon/commit/85d4a91c5e015af7348ebdd312e0ba5523950a3d)]:
  - @pyreon/compiler@0.40.0

## 0.39.0

### Minor Changes

- [#1970](https://github.com/pyreon/pyreon/pull/1970) [`1e8ed00`](https://github.com/pyreon/pyreon/commit/1e8ed002acdeb4b1abfd7a5f5469f7077dd9b318) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(mcp): `explain_reactivity` tool — the compiler's per-expression reactivity verdict for AI agents

  New MCP tool `explain_reactivity({ code, filename? })`. The Pyreon compiler already decides, while emitting codegen, whether each JSX expression is reactive or baked static — this surfaces that ground truth (via `analyzeReactivity`) so an AI coding agent sees the map BEFORE it commits. Every expression is classified `live` / `live prop` / `live attr` / `baked once` / `hoisted static`, merged with the `detectPyreonPatterns` footguns, over an annotated source view.

  Where `validate` reports _bugs_, `explain_reactivity` reports the whole _map_: an agent sees that `<div>{qty}</div>` (from destructured props) compiled to `baked once` (dead) right at the source — so it can't ship the stale-closure / destructured-props / static-when-meant-reactive bug even when no footgun fires. The reactivity "type-check" surface for agents.

  Brings the MCP server to 17 tools (15 manifest-listed).

- [#1971](https://github.com/pyreon/pyreon/pull/1971) [`2444405`](https://github.com/pyreon/pyreon/commit/244440585f0066759a0f1bc4aec087e44b131466) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat: `migrate_pyreon` — auto-fix the mechanically-safe Pyreon footguns

  Closes the documented gap that kept every `detectPyreonPatterns` diagnostic `fixable: false` ("no migrate_pyreon tool yet"). New `migratePyreonCode(source, filename?)` in `@pyreon/compiler` + the `migrate_pyreon` MCP tool (parallel to `migrate_react`) rewrite Pyreon-footgun → correct-Pyreon for the three UNAMBIGUOUS, purely-mechanical codes:

  - `signal-write-as-call` — `sig(v)` → `sig.set(v)`
  - `for-with-key` — `<For key={k}>` → `<For by={k}>`
  - `as-unknown-as-vnodechild` — `x as unknown as VNodeChild` → `x`

  Every other footgun (props-destructured, on-click-undefined, raw-add-event-listener, …) needs human judgement and is returned in `remaining`, untouched. The codemod is span-based (exact `getStart`/`getEnd`), applied back-to-front, non-overlapping, and idempotent — so an agent can apply the result verbatim. This makes those three `detectPyreonPatterns` codes report `fixable: true` (kept in sync via the new `AUTO_FIXABLE_PYREON_CODES` set); every other code stays `fixable: false`.

### Patch Changes

- Updated dependencies [[`514f28d`](https://github.com/pyreon/pyreon/commit/514f28da2c442e9fffd694a88a2b8fd8c9a48088), [`2444405`](https://github.com/pyreon/pyreon/commit/244440585f0066759a0f1bc4aec087e44b131466), [`8a1feb0`](https://github.com/pyreon/pyreon/commit/8a1feb07faca643488c98e89db7bfc08d6867a31)]:
  - @pyreon/compiler@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [[`4cfd22f`](https://github.com/pyreon/pyreon/commit/4cfd22f68088f937535064e0a01a42aaf957f3e2), [`a71dfa2`](https://github.com/pyreon/pyreon/commit/a71dfa2a359b278bee6a38fa7a8a41b454adca28), [`a615f46`](https://github.com/pyreon/pyreon/commit/a615f46237685a1bf4a96f535b9375655cde2c79)]:
  - @pyreon/compiler@0.38.0

## 0.37.1

### Patch Changes

- Updated dependencies:
  - @pyreon/compiler@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies:
  - @pyreon/compiler@0.36.0

## 0.35.0

### Minor Changes

- [#1636](https://github.com/pyreon/pyreon/pull/1636) [`8a4e195`](https://github.com/pyreon/pyreon/commit/8a4e19519bcf3dfebb203c97f69d08e3f7ac6b50) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native (multiplatform / PMTC) build-hazard detection across the doctor + MCP surfaces, so an AI/dev catches code that compiles for web but silently breaks the iOS/Android build.

  - **`pyreon doctor --check-native`** (new `native-audit` gate, also in the default fast set) scans `.tsx` files importing `@pyreon/primitives` for two hazards the `swiftc -parse` / `kotlinc`-stub gate can't catch: **web-only-package imports** (`@pyreon/charts`/`flow`/`code`/`dnd`/`document`/`query`/`table`/`virtual` + the CSS-in-JS UI stack — fix: host in `<WebView>` or use `@pyreon/primitives`) and **native-dropped top-level `interface`/`enum`/`class`** (fix: `type X = {…}` / string-literal union / functions). Scoped to multiplatform projects (skips gracefully otherwise); warnings only.
  - **MCP `validate`** now runs the same native detector per-snippet (the AI's per-keystroke feedback loop), firing only when the snippet imports `@pyreon/primitives`.
  - **`@pyreon/compiler`** exports `auditNative(cwd)` (project scan) + `detectNativePatterns(code, filename)` (snippet) + their types.

  Pairs with `get_pattern({ name: "multiplatform" })` and the `@pyreon/primitives` `get_api` entries so an AI has both the reference and the feedback to build a correct multiplatform app one-shot.

### Patch Changes

- [#1828](https://github.com/pyreon/pyreon/pull/1828) [`f107ee9`](https://github.com/pyreon/pyreon/commit/f107ee9951cc6e17fe8e4f41b4f3e19606a887fb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(manifests): correct API inaccuracies that feed llms.txt / llms-full.txt / MCP `get_api`

  Several package manifests carried inaccuracies that would break copied code. Corrected
  against source + regenerated the AI-facing doc surfaces (`@pyreon/mcp`'s `api-reference.ts`
  ships the corrected `get_api` data):

  - **rx**: removed the fabricated "curried operators" model — `pipe(source, ...fns)` threads
    the value through plain `(value) => value` transforms; `filter`/`map`/`sortBy` are always
    2-arg `(source, …)` (no 1-arg curried form).
  - **hotkeys**: the real option is `enableOnInputs` (not the fabricated `enableOnFormElements`);
    scopes are not reference-counted.
  - **url-state**: options are `debounce` / `replace` (not `debounceMs` / `replaceState`); SSR
    initializes to the default value (it does not read the request URL).
  - **storage**: custom-backend methods are `get` / `set` / `remove`; serializer options are
    `serializer` / `deserializer`.
  - **document**: the format string is `google-chat` (not `gchat`).

- [#1634](https://github.com/pyreon/pyreon/pull/1634) [`243ed9a`](https://github.com/pyreon/pyreon/commit/243ed9a1876867dbf67d61c0879a6738c81808a8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/primitives` now has a manifest, so the 15 canonical multiplatform primitives (Stack/Inline/Layer/Scroll/Spacer/Text/Heading/Image/Icon/Button/Press/Link/Field/Toggle/Modal) plus `<WebView>` and the `<Web>`/`<NativeIOS>`/`<NativeAndroid>` escape hatches are queryable via the MCP `get_api` tool (and appear in `llms.txt` / `llms-full.txt`). Each entry documents the real props, the per-target mapping (DOM / SwiftUI / Compose), and the native gotchas (e.g. `<Inline>` is a non-wrapping `Row` on Android, `onPress`/`onChangeText` canonical handlers). This is the AI-facing primitive reference for building multiplatform apps one-shot; pair it with `get_pattern({ name: "multiplatform" })`.

- Updated dependencies [[`b3957fa`](https://github.com/pyreon/pyreon/commit/b3957fa6f913410e90f917ebce560a1bf85c2dd8), [`f1e46fb`](https://github.com/pyreon/pyreon/commit/f1e46fb08da6a0fdf03f1eab8abc95ad0643def1), [`8a4e195`](https://github.com/pyreon/pyreon/commit/8a4e19519bcf3dfebb203c97f69d08e3f7ac6b50), [`d2d3cb4`](https://github.com/pyreon/pyreon/commit/d2d3cb4a6f585a59333ef5c28c1ba4eefa10e4ea), [`544c425`](https://github.com/pyreon/pyreon/commit/544c425b6bcf95f772ea04a5e740fb27fa6938d1), [`1c98f38`](https://github.com/pyreon/pyreon/commit/1c98f3863ccd2fd16a4ad6e20e82fb778725bca0), [`e8d945f`](https://github.com/pyreon/pyreon/commit/e8d945fe7a7c23307b0b7d88eeb4cc060224b3a5), [`ee9b328`](https://github.com/pyreon/pyreon/commit/ee9b32875104b8759c2aa180cb6d00d62fa681de), [`a8a8b41`](https://github.com/pyreon/pyreon/commit/a8a8b41ae001883710cd6cd4e4c367987dd6312d)]:
  - @pyreon/compiler@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [[`c0814b7`](https://github.com/pyreon/pyreon/commit/c0814b7881b01b7bfed19dffd7f48a3269c14199), [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5), [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5), [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5), [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5), [`f69da36`](https://github.com/pyreon/pyreon/commit/f69da36344b8d7edfd0f530d578a0285e85d7ec5), [`ec41abf`](https://github.com/pyreon/pyreon/commit/ec41abf8c6aaf8dbf442fb6c8e194ab607238e77), [`10bdb4a`](https://github.com/pyreon/pyreon/commit/10bdb4a449151a70ae2d1ffc1bf4a30f303c5bf0), [`9335e1f`](https://github.com/pyreon/pyreon/commit/9335e1fe75df850ffa6434d3a8f956c4c3e46646), [`3ad3247`](https://github.com/pyreon/pyreon/commit/3ad32475b881b19792c010872fc31024b71b7acb), [`a9788cd`](https://github.com/pyreon/pyreon/commit/a9788cdfbebee4ea7468356c3fcea31a6857f11b)]:
  - @pyreon/compiler@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.33.0

## 0.32.0

### Minor Changes

- [#1388](https://github.com/pyreon/pyreon/pull/1388) [`04525e1`](https://github.com/pyreon/pyreon/commit/04525e1dfc92ff4d7182818c3e9ddaddd8648cbc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `get_content_collection` + `get_content_entry` MCP tools. Lets AI agents navigate a `@pyreon/zero-content` corpus structurally — enumerate collections, list every entry's slug + title, drill into one entry's frontmatter + heading outline — without scraping `import.meta.glob` patterns or reading raw markdown files one at a time.

  ## get_content_collection

  - No args → lists every declared collection across all `content.config.{ts,mts,js,mjs}` in the project (one bullet each: name, type, entry count, content dir).
  - With `name` → returns that collection's metadata + every entry's slug + title + path.

  ## get_content_entry

  - `collection: string` + `slug: string` → returns the entry's relative path, frontmatter (parsed key→value), heading outline (level + text, code-fence-aware), and source size in bytes.
  - Missing-slug case returns nearest-match suggestions filtered against the collection's known slugs.

  ## Implementation

  Pure syntactic walker — reuses `parseContentConfig` + `findContentConfigs` + `deriveSlug` + `readFrontmatter` + `readTitleFromFrontmatter` from `@pyreon/compiler`'s content audit (same module that powers `pyreon doctor --check-content`). No runtime dep on `@pyreon/zero-content`. Works on any project that ships a `content.config.{ts,mts,js,mjs}` declaring `defineCollection({...})` shapes.

  64 unit specs in `content.test.ts` (collection enumeration, entry detail, frontmatter parsing, heading outline + fence-aware extraction, error paths) + 5 server-roundtrip specs in `content-server.test.ts` (empty-project + arg validation). 531/531 MCP specs pass. `tools/list` payload stays under the 1,300 token regression budget.

### Patch Changes

- [#1491](https://github.com/pyreon/pyreon/pull/1491) [`25ddda0`](https://github.com/pyreon/pyreon/commit/25ddda0d540199a7177cf0ccd4b0cab78912986a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Path updates in `pyreon doctor`'s doc-claims gate + the MCP `get_pattern` tool: the docs site moved from `docs/docs/<topic>.md` to `docs/src/content/docs/<topic>.md` (legacy VitePress → Pyreon-native cutover). The doc-claims gate now reads from the new location; the MCP `get_pattern` candidate paths list includes the new `docs/src/content/docs/patterns/` location while keeping legacy locations as fallbacks for downstream consumers on older repo layouts.

- [#1442](https://github.com/pyreon/pyreon/pull/1442) [`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926) Thanks [@vitbokisch](https://github.com/vitbokisch)! - MCP `get_api` now covers `@pyreon/zero-content`'s `<Example>` docs primitive + `registerExamples` + `getOrCreateSharedSignal` helpers. Plus a manifest-renderer fix: literal backslashes in `example` / `mistakes` strings are now escaped during template-literal serialization, so manifest entries containing markdown-fenced code (` ```bash ... ``` `) round-trip without prematurely closing the generated template literal. Affects 9 api-reference regions that previously skipped this escape pass.

- Updated dependencies [[`04525e1`](https://github.com/pyreon/pyreon/commit/04525e1dfc92ff4d7182818c3e9ddaddd8648cbc), [`edaea04`](https://github.com/pyreon/pyreon/commit/edaea04231fc33b585e785bda61e63c14663c045), [`f6f54a2`](https://github.com/pyreon/pyreon/commit/f6f54a254e43f3b36a4c55581381ab582322990e), [`73436e7`](https://github.com/pyreon/pyreon/commit/73436e782319940abde41200299489a809de70d5), [`bfb813b`](https://github.com/pyreon/pyreon/commit/bfb813ba5a883c791a8df22c46fa82cf370c6ebe)]:
  - @pyreon/compiler@0.33.0

## 0.31.0

### Patch Changes

- [#1367](https://github.com/pyreon/pyreon/pull/1367) [`932a54a`](https://github.com/pyreon/pyreon/commit/932a54abc12ba9374e6d28704677df59b388485c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs(mcp): expand api-reference coverage for recent zero/head/reactivity APIs

  The published MCP server's `get_api` now answers for the image / font /
  resource-hint / head-defer / wrapSignal features merged since 2026-06-01.
  Adds entries — zero: `createImageRegistry`, `NoOptimize`, `useNoOptimize`,
  `imagePlugin`, `usePreloadFont`, `inferFontMimeType`, `PreloadFontOptions`,
  `fontPlugin`, `fontImportPlugin`, `FontDescriptor`, `usePreconnect`,
  `useDnsPrefetch`, `usePreload`, `PreloadOptions`; reactivity: `wrapSignal`,
  `WrapSignalOptions`; head: `ScriptTag` — and refreshes the stale `<Image>`
  entry to the bi-modal `src` (descriptor | URL) + `optimize` form. Generated
  from the source manifests via `bun run gen-docs`.

  (The companion `src/manifest.ts` changes in `@pyreon/head` / `@pyreon/reactivity`
  / `@pyreon/zero` are gen-docs-only — `manifest.ts` is tree-shaken from each
  package's published `lib/`, so those packages ship no consumer-facing change.)

- Updated dependencies []:
  - @pyreon/compiler@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/compiler@0.33.0

## 0.29.0

### Patch Changes

- Updated dependencies [[`8524e24`](https://github.com/pyreon/pyreon/commit/8524e24651184d275d5bf7520d65caade2ef25b8), [`0ef3f45`](https://github.com/pyreon/pyreon/commit/0ef3f4591fdd7339a0dd597dabc27295eeb09669)]:
  - @pyreon/compiler@0.33.0

## 0.28.1

### Patch Changes

- [#1210](https://github.com/pyreon/pyreon/pull/1210) [`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(coverage): bulk-bump 31 packages' `statements` threshold 94 → 95 (already passing)

  PR 1 of the "whole-repo coverage ≥ 95%" initiative (user-approved sequence:
  by-gap-size, start with quick wins).

  Every package in this bump is **already reporting ≥ 95% actual** per
  `bun scripts/check-coverage.ts`. Locking the configured threshold in
  match prevents regressions and lets the `Coverage (Full)` CI gate enforce
  the new floor.

  **No runtime changes, no test additions** — pure config update.
  Drift-detection in `BELOW_FLOOR_EXEMPTIONS` was triggered for two
  exemption entries (`@pyreon/code`, `@pyreon/kinetic`) which had been
  listed with `currentStatements: 94`; updated to 95 with the new reason
  documenting the lift.

  Packages bumped (current actual in parens):

  - @pyreon/attrs (100), @pyreon/coolgrid (100), @pyreon/table (100), @pyreon/toast (100)
  - @pyreon/rocketstyle (99.41), @pyreon/primitives (99.26), @pyreon/i18n (99.21), @pyreon/validation (99.12)
  - @pyreon/rx (98.45), @pyreon/kinetic (98.24), @pyreon/feature (98.11), @pyreon/head (97.97), @pyreon/flow (97.94), @pyreon/form (97.94), @pyreon/document-primitives (97.82), @pyreon/preact-compat (97.68), @pyreon/server (97.54), @pyreon/svelte-compat (97.42), @pyreon/validate (98.69), @pyreon/dnd (97.33)
  - @pyreon/query (96.79), @pyreon/mcp (96.52), @pyreon/unistyle (96.36) [already 95], @pyreon/reactivity (96.13), @pyreon/connector-document (96.05), @pyreon/react-compat (96.03) [already 95]
  - @pyreon/storage (95.6), @pyreon/permissions (95.38), @pyreon/url-state (95.13), @pyreon/runtime-dom (95.02), @pyreon/code (95.02), @pyreon/core (95.68), @pyreon/vite-plugin (95.32)

  Pre-existing CI failures NOT addressed in this PR (separate follow-ups):

  - @pyreon/sized-map: 0% reported by check-coverage.ts (test detection bug — Tier 5)
  - @pyreon/styler: 93.16% < 94% threshold (Tier 3)
  - @pyreon/ui-core: 90.94% < 94% threshold (Tier 4)
  - @pyreon/zero: 91.65% < 94% threshold (Tier 4)
  - @pyreon/runtime-dom: branches 85.78% < 88% threshold (Tier 6)

  Next PR (Tier 2): close the < 1pt gaps on charts, elements, hooks,
  hotkeys, lint, router, state-tree with focused test additions.

- Updated dependencies [[`404d266`](https://github.com/pyreon/pyreon/commit/404d266a33fd272897e70c59e6baad7f31ccab44), [`e97b8d7`](https://github.com/pyreon/pyreon/commit/e97b8d7a63a3f368c6a1e49a71eb22114b202f81), [`fccddae`](https://github.com/pyreon/pyreon/commit/fccddae860e3126640dbcbd6d5a0ef22ac419f48)]:
  - @pyreon/compiler@0.28.1

## 0.28.0

### Patch Changes

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

- [#1194](https://github.com/pyreon/pyreon/pull/1194) [`1aeb610`](https://github.com/pyreon/pyreon/commit/1aeb610a10ce5069b52b2882a6175a16c16483b3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - chore: move @pyreon/sized-map to packages/core/ + enrich mcp/feature/storage manifests

  **@pyreon/sized-map** — package moved from `packages/internals/` to `packages/core/`
  alongside the other foundational primitives every Pyreon package depends on. The
  package is now published to npm at 0.27.1 with OIDC trusted publishing, so the
  "internal-by-convention" location no longer fits. Updated:

  - `repository.directory` in package.json → `packages/core/sized-map`
  - `bun.lock` workspace dep entry rewritten

  Zero source/runtime changes — every consumer imports `@pyreon/sized-map` by package
  name, never by path. This is a path-only repackage; the published artifact is
  byte-identical.

  **@pyreon/feature** — manifest enriched from 2 → 5 api[] entries:

  - Added `isReference`, `extractFields`, `defaultInitialValues` (helpers exported
    from the package but not in the MCP `get_api` surface before this PR)
  - Added `mistakes[]` to the existing `reference()` entry

  `get_api({ package: 'feature', symbol: 'extractFields' })` now returns a real
  entry instead of 404. No runtime change.

  **@pyreon/mcp** — manifest enriched: 9 of 14 tool entries lacked `mistakes[]`.
  Added foot-gun catalogs for `get_api`, `validate`, `migrate_react`, `get_routes`,
  `get_components`, `get_pattern`, `get_changelog`, `audit_test_environment`,
  `audit_islands`. All 14 tools now have 3-4 documented mistakes grounded in real
  failure modes. No runtime change.

  **@pyreon/storage** — manifest enriched from 4 → 7 api[] entries:

  - Added `useSessionStorage`, `useMemoryStorage`, `setCookieSource` (helpers exported
    but not in the MCP `get_api` surface before this PR)
  - Added `mistakes[]` to existing `useCookie`, `useIndexedDB`, `createStorage`
    entries (e.g. cookie maxAge unit traps, IDB async-init flash-of-default, custom
    backend `undefined` vs `null` return contract)

  No runtime change.

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

- [#1195](https://github.com/pyreon/pyreon/pull/1195) [`bb6a0e3`](https://github.com/pyreon/pyreon/commit/bb6a0e38ae15a8f195ed6c0b975f63ebec8663cb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(zero): `sitemap.trailingSlash` option (`'always' | 'never' | 'preserve'`)

  Adds a trailing-slash policy to `SitemapConfig`, applied to every non-root
  `<loc>` and hreflang `href`. Default `'preserve'` is a no-op (no behaviour
  change). Set `'always'` when deploying SSG output to a host that 301-redirects
  `/path` → `/path/` (GitHub Pages, directory-style Netlify / Cloudflare Pages) so
  the sitemap stops emitting redirect-triggering URLs — closes the bokisch.com
  0.27.1 Lighthouse "Avoid multiple page redirects" finding (~160ms).

  Default kept `'preserve'` rather than auto-switching on adapter, since not every
  SSG host redirects — opt in to match your host. `@pyreon/mcp` api-reference
  regenerated from the updated manifest.

- Updated dependencies []:
  - @pyreon/compiler@0.33.0

## 0.27.1

### Patch Changes

- Updated dependencies []:
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

### Patch Changes

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

### Patch Changes

- Updated dependencies [[`275eb20`](https://github.com/pyreon/pyreon/commit/275eb2038f32374e90c9fe0c3d55f35895f43450), [`47073eb`](https://github.com/pyreon/pyreon/commit/47073ebdd7552c63985f461a663ba98d93538606), [`572212f`](https://github.com/pyreon/pyreon/commit/572212f631907a18b98118f48dea3621dd5a95b1), [`f22902a`](https://github.com/pyreon/pyreon/commit/f22902a9a9c5f5b8a5192da086a6b4299291dd57), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`572212f`](https://github.com/pyreon/pyreon/commit/572212f631907a18b98118f48dea3621dd5a95b1)]:
  - @pyreon/compiler@0.24.0

## 0.23.0

### Patch Changes

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

- Updated dependencies [[`c3df9db`](https://github.com/pyreon/pyreon/commit/c3df9dbbcf9e939c92e1c4843b59686cdd25589e), [`9a54705`](https://github.com/pyreon/pyreon/commit/9a54705c645ff2c3bee54fa8c6d411d1530b3187), [`bbccaaf`](https://github.com/pyreon/pyreon/commit/bbccaaf3ec2f5dc3eed3e7195a09023fc59575d1), [`24a063c`](https://github.com/pyreon/pyreon/commit/24a063ccfa2ef267927dfd68886be24c397ccd72), [`a086769`](https://github.com/pyreon/pyreon/commit/a0867699bdeca87f34e60fef7aa867a75a24d815), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7)]:
  - @pyreon/compiler@0.20.0

## 0.19.0

### Minor Changes

- [#600](https://github.com/pyreon/pyreon/pull/600) [`81553e2`](https://github.com/pyreon/pyreon/commit/81553e210d64f8ea6639fd9fe08c5b0ba1411dbe) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `diagnose` MCP tool v2 — structured-context enrichment (backward-compatible).

  The original `diagnose` took only an error string and matched it against a fixed regex table. That's the "known error message → canned fix" tier — it can't reason about _why_ the app reached the bad state because it never sees the component or the reactive run-up.

  v2 keeps the string-only path **byte-identical** (verified — every existing `diagnose` test passes unchanged) and adds optional structured context:

  - **`componentSource`** → runs `detectPyreonPatterns` over it and maps each hit to the documented `.claude/rules/anti-patterns.md` entry via the `AntiPatternEntry.detectorCodes` bridge. The agent gets "here's the static foot-gun in this component + its catalog explanation," not just the raw error.
  - **`reactiveTrace`** → the causal sequence of signal writes leading to the crash (`ErrorContext.reactiveTrace` from `@pyreon/core`, shipped [#598](https://github.com/pyreon/pyreon/issues/598)). Formatted as a chronological run-up.
  - `filename` / `phase` — optional hints.

  Architecture: the tool is **deterministic and embeds no LLM**. An MCP tool's job is to assemble the richest structured failure context; the agent calling it does the reasoning. This removes model/prompt risk from the framework entirely and keeps the enrichment unit-testable. The pure `enrichDiagnosis(input, deps)` function takes injected dependencies (detector + parsed anti-patterns) so it has no filesystem/server coupling.

  Backward compatibility is a hard contract, not a hope: when no structured context is supplied, `contextLevel` is `'string-only'` and `formatEnrichedDiagnosis` returns exactly the v1 block (the "Could not identify…" fallback or the `**Cause:** / **Fix:** / **Code:** / **Related:**` block). The enrichment sections are appended _only_ when `componentSource` / `reactiveTrace` are present.

  When structured context is supplied but yields nothing (clean component, empty trace) the tool says so explicitly ("no additional findings") rather than implying the base diagnosis is enriched — honest about its own confidence.

  Bisect-verified: forcing `hasStructuredContext = false` made all 7 v2 tests fail while all 14 v1/string-only tests still passed (proving backward-compat is structural, not coincidental); restored → 21/21 pass, no remnant.

  Pairs with [#598](https://github.com/pyreon/pyreon/issues/598) — `reactiveTrace` is the input that makes causal diagnosis possible; this is the consumer of that substrate, sequenced as a separate PR (same [#585](https://github.com/pyreon/pyreon/issues/585)→[#587](https://github.com/pyreon/pyreon/issues/587) layering).

- [#599](https://github.com/pyreon/pyreon/pull/599) [`872f083`](https://github.com/pyreon/pyreon/commit/872f083c6036aa34974abbe425c90d9e0cbbdb66) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New `explain_error` MCP tool — assembles a structured failure dossier from a full Pyreon error report.

  The rich-context sibling of `diagnose`. `diagnose` matches an error _string_ against known footguns; `explain_error` takes a full `ErrorContext`-shaped report — crucially the **`reactiveTrace`** (the causal sequence of signal writes from `@pyreon/core`'s error reports) — and assembles:

  - The **reactive run-up** (the write sequence, oldest → newest)
  - **Heuristic findings** over that sequence: `empty-trace` (crash is NOT state-driven — don't chase a reactive bug), `last-write-correlation` (the write whose signal name is in the error message), `nullish-then-crash` (a signal set null/undefined that the error references), `write-storm` (same signal written past a loop threshold), `type-flip` (value shape changed: `Array(3)` → `null`)
  - Optional **static detection** (`detectPyreonPatterns` / `detectReactPatterns`) when the component source is supplied
  - **Correlated anti-pattern catalogue** entries (matched via the finding → detector-code mapping, reusing the `get_anti_patterns` loader)

  ```ts
  explain_error({ report: JSON.stringify(errorContext) });
  // errorContext captured via registerErrorHandler(ctx => …) in dev
  ```

  **Architecture (deliberate):** the server only _assembles_ + applies cheap heuristics — it does not call an LLM, hold API keys, or mutate anything. The consuming agent reasons over the dossier; a human gates any patch _by construction_ (the tool returns text only, no write capability). This is the sound, distinctive core of "AI-native self-healing" — self-_explaining_, not autonomous-repairing. The rejected idea (autonomous in-production repair) is structurally impossible here.

  **Why Pyreon can do this and incumbents can't:** the dossier's highest-signal section is the reactive write sequence — _how_ the app reached the failing state, which a stack trace alone can't show. That input only exists because of `@pyreon/core`'s `reactiveTrace` (companion PR [#598](https://github.com/pyreon/pyreon/issues/598)). `explain_error` does not import [#598](https://github.com/pyreon/pyreon/issues/598) — it parses the serialized shape structurally, so it works standalone and gets more useful once apps capture real reactive traces.

  Bisect-verified: disabling the `last-write-correlation` heuristic fails the `explain-error-server.test.ts > assembles a dossier` round-trip; restored → 24 tests pass (19 unit + 5 JSON-RPC). No `TEMP BISECT` remnant. Full `@pyreon/mcp` suite: 473 pass. Manifest-driven — `mcp_overview` + `api-reference.ts` + `llms-full.txt` + `docs/docs/mcp.md` regenerate from the new manifest entry; `gen-docs --check` clean; manifest-snapshot key list updated.

- [#604](https://github.com/pyreon/pyreon/pull/604) [`364d2bd`](https://github.com/pyreon/pyreon/commit/364d2bd49aa3a1a82002408c1eb100c620999249) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Cut MCP consumer token cost — `get_anti_patterns` default ≈76% smaller, plus a per-session-tax trim and a regression gate.

  **Measured** (≈4 chars/token; reproducible via `src/tests/token-budget.test.ts`):

  | surface                                              |  before |  after |    delta |
  | ---------------------------------------------------- | ------: | -----: | -------: |
  | `get_anti_patterns({})` (the common orient call)     |  13,976 |  3,292 | **−76%** |
  | `tools/list` (paid by every consumer, every session) |   1,228 |  1,097 |     −11% |
  | `diagnose` schema (in `tools/list`)                  |     280 |    212 |     −24% |
  | blended working session\*                            | ~17,440 | ~6,620 | **−62%** |

  \* tools/list + mcp_overview + 2×get_api + one `get_anti_patterns({})`.

  **`get_anti_patterns` is now token-frugal by default:**

  - **no args → a COMPACT INDEX** — one line per entry (title + `[detector: <code>]` tag + one-sentence hook). Keeps the per-category `## <Heading>` markers so an agent still discovers categories in one call; only the prose body is elided.
  - `{ name }` → the single matching entry's full body (cheapest drill-in).
  - `{ category }` → that category's full bodies — **unchanged contract** (the existing filtered tests pass untouched).
  - `{ full: true }` → the entire catalog (≈14K), explicit expensive opt-in.

  The old behaviour (no-arg = full dump) was the bloat: an agent calling `get_anti_patterns()` to orient itself ate ~14K tokens to read every full body when it needed the map plus one or two entries. That call is now ~3.3K and the full bodies are one deliberate call away.

  **Per-session tax trim:** schema `.describe()` strings ship in `tools/list` to every consumer on every connection whether or not the tool is ever called. The verbose prose (including the `diagnose` describes I over-wrote in [#600](https://github.com/pyreon/pyreon/issues/600)) is trimmed to terse one-liners; the full param semantics live in the manifest, served on demand via `get_api` / `mcp_overview`. Honest note: this lever is smaller than I estimated — the JSON-Schema _structure_ (param names, types, the nested `reactiveTrace` shape) dominates `tools/list`, not description text — so it's −11%, not the ~40% I projected.

  **Regression gate:** `src/tests/token-budget.test.ts` stands up the real client↔server (in-memory JSON-RPC, the MCP e2e shape) and pins `tools/list` < 1,300 tokens, `get_anti_patterns({})` < 5,000, the index ≥60% smaller than `full`, and `{ name }` cheaper than the index. Bisect-verified: reverting the default to the old full dump fails 4 of these; restored → all pass, no remnant. Budgets sit above the post-PR numbers with head-room so normal catalog growth doesn't trip them — it's a ratchet against re-bloat, not a snapshot.

  No capability lost: every full body is still reachable, just behind an explicit, intentional call instead of being the default firehose. `@pyreon/mcp` suite: 473 tests pass (7 new: 4 token-budget + 3 drill-in paths). gen-docs in sync (manifest entry rewritten, api-reference regenerated).

### Patch Changes

- [#622](https://github.com/pyreon/pyreon/pull/622) [`5fb461a`](https://github.com/pyreon/pyreon/commit/5fb461aaf9fcc8d2a624af1442f4db97fd7f33c9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Migrate `@pyreon/compiler` onto the manifest-driven docs pipeline.

  `@pyreon/compiler` was the last core-layer package with NO `src/manifest.ts` — its `llms.txt` / `llms-full.txt` / MCP `api-reference.ts` surfaces did not exist at all (it was simply absent from every generated doc, and `get_api(compiler, …)` 404'd for the entire public surface including the Reactivity-Lens). This is the cause-level fix behind the "Lens docs enrichment" follow-up: the Lens couldn't be documented because the package it lives in wasn't on the pipeline.

  **Added** `packages/core/compiler/src/manifest.ts` via `defineManifest()` — 18 `api[]` entries (the full public surface from `src/index.ts`): `transformJSX`, `transformJSX_JS`, `analyzeReactivity`, `formatReactivityLens`, `detectReactPatterns`, `migrateReactCode`, `hasReactPatterns`, `diagnoseError`, `detectPyreonPatterns`, `hasPyreonPatterns`, `auditTestEnvironment`, `formatTestAudit`, `auditIslands`, `formatIslandAudit`, `auditSsg`, `formatSsgAudit`, `transformDeferInline`, `generateContext`. Every entry carries an accurate `signature` + dense `summary`; the real foot-guns get `mistakes[]` (the dual-backend invisibility trap, the SSR-needs-`h()`-not-`_tpl()` trap, `knownSignals` cross-module seeding, the Lens asymmetric-precision contract, the enforced `fixable: false` invariant); `analyzeReactivity` / `formatReactivityLens` are flagged `stability: 'experimental'`; 3 package-level `gotchas` (dual backend, Lens is editor-only, detectors are not codemods).

  **Wiring:** added `@pyreon/manifest` as a `workspace:*` devDependency on `@pyreon/compiler` (matches the `@pyreon/lint` convention — `manifest.ts` is gen-docs-only, never imported by `src/index.ts`, so it's tree-shaken from the published `lib/`). Added the `// <gen-docs:api-reference:start/end @pyreon/compiler>` marker pair to `packages/tools/mcp/src/api-reference.ts` (core-layer slot, between `@pyreon/core` and `@pyreon/router`). `bun run gen-docs` regenerated the `llms.txt` bullet, the `llms-full.txt` `## @pyreon/compiler` section, and the 18-entry MCP api-reference region; updated the hand-prose `## Core Framework` count 6 → 7.

  **No runtime or API change** — purely additive doc-pipeline metadata. `gen-docs --check` in sync; lint 0 errors; typecheck clean (compiler + mcp); compiler 1053 tests, mcp 497, manifest 135 all green; `check-manifest-depth` passes (compiler enters at port-grade density and is intentionally NOT added to `LOCKED` — it's the visible migration backlog, not yet at flagship density). New `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + the experimental-flag and foot-gun-catalog assertions locally in addition to the CI `Docs Sync` gate.

- [#629](https://github.com/pyreon/pyreon/pull/629) [`29788dc`](https://github.com/pyreon/pyreon/commit/29788dc7ae5a52daab204b6205fe39f56703d980) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Migrate `@pyreon/elements` onto the manifest-driven docs pipeline.

  `@pyreon/elements` is the structural layer every styled / rocketstyle component renders through (`Element` / `Text` / `List` / `Overlay` / `useOverlay` / `Portal` / `Iterator`), but it had only a one-line hand-written `llms.txt` bullet and **no `src/manifest.ts`, no `llms-full.txt` section, and no MCP api-reference region** — `get_api(elements, Element|Overlay|useOverlay|…)` 404'd. PR D of the recommended manifest-coverage follow-up sequence (PR A = the doc-claim correction [#623](https://github.com/pyreon/pyreon/issues/623); [#622](https://github.com/pyreon/pyreon/issues/622) = compiler; [#624](https://github.com/pyreon/pyreon/issues/624) = runtime-server; PR C = styler [#628](https://github.com/pyreon/pyreon/issues/628) — all merged; this branch rebased onto post-[#628](https://github.com/pyreon/pyreon/issues/628) `origin/main`).

  **Added** `packages/ui-system/elements/src/manifest.ts` via `defineManifest()` — **10 `api[]` entries** (`Element`, `Text`, `List`, `Overlay`, `useOverlay`, `OverlayProvider`, `Portal`, `Iterator`, `Util`, `Provider`) with accurate signatures + dense summaries + the real elements foot-guns in `mistakes[]`: `direction="row"` is invalid (`inline` / `rows` / `reverseInline` / `reverseRows`); layout props are primitive ATTRS not styler `.theme()` CSS; the 2026-Q2 simple-path fast path moves the tag to `props.as` and layout under `props.$element.*`; void-tag children are dropped; `Overlay`'s positioning/flip/ESC/click-outside/scroll/hover-delay all live in `useOverlay` (never reimplement); `Portal` nests a per-instance wrapper inside the DOMLocation (DOM assertions traverse one level deeper); `Iterator`'s four-overload Simple/Object/Children/Loose type system. 4 package `gotchas`.

  **Wiring:** `@pyreon/manifest` `workspace:*` devDep (the `@pyreon/lint` / `@pyreon/compiler` / `@pyreon/runtime-server` / `@pyreon/styler` convention — gen-docs-only, tree-shaken from published `lib/`). Surgical 1-line bun.lock add; `bun install --frozen-lockfile` verified (fresh-worktree version-field churn reverted to base). api-reference marker pair added in the ui-system group (after `@pyreon/styler`, before `@pyreon/storybook`). `bun run gen-docs` regenerated the `llms.txt` bullet (in place — elements already had one), the `llms-full.txt` `## @pyreon/elements` section, and the 10-entry MCP region.

  **`@pyreon/mcp` bundle budget — no bump needed in this PR.** The 10-entry api-reference region is bundled into `@pyreon/mcp`'s main entry, but the focused single-package bump PR [#627](https://github.com/pyreon/pyreon/issues/627) (`chore(ci): bump @pyreon/mcp bundle budget — RED on main`) already raised the budget to `142848` on `main`. This branch's measured `@pyreon/mcp` gzipped main entry is `122629` bytes — comfortably under `142848` — so the elements region fits within [#627](https://github.com/pyreon/pyreon/issues/627)'s headroom and no further `scripts/bundle-budgets.json` change is required here. (An earlier revision of this branch carried its own `153344` bump; rebasing onto post-[#627](https://github.com/pyreon/pyreon/issues/627) `main` made it redundant and it was dropped in favour of [#627](https://github.com/pyreon/pyreon/issues/627)'s value.)

  **No runtime or API change** — purely additive doc metadata. `gen-docs --check` in sync; lint **0 errors** (303 pre-existing warnings, same class as prior PRs); typecheck clean (elements + mcp); elements 461 tests, mcp 497 all green; new `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + the layout-in-attrs and Portal-wrapper foot-gun assertions locally; `check-manifest-depth` passes (elements enters at port-grade density, intentionally NOT added to `LOCKED` — visible migration backlog, not yet flagship).

  The `renderStringLiteral` backslash hazard documented by [#628](https://github.com/pyreon/pyreon/issues/628) in `.claude/rules/anti-patterns.md` was applied from the start here — manifest prose is backslash-free (plain single-backtick code spans, no nested backtick escapes), so no serializer-escape parse error and no further anti-patterns.md change was required for this PR.

- [#643](https://github.com/pyreon/pyreon/pull/643) [`b4de7e0`](https://github.com/pyreon/pyreon/commit/b4de7e0f0eb9134325eb6d87db6250064a494d51) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `useHead({ speculationRules })` — declarative Speculation Rules support (E12).

  **Origin: the Qwik architecture analysis.** A deep Pyreon-vs-Qwik review concluded the famous "resumability / zero-JS-for-free" thesis was already measured-and-shelved here (the Tier-2 spike: ~28% ceiling, depth-invariant, demo-vs-prod 38× variance — see `SPIKE.md` on `spike/tier2-resumability`). Decomposing Qwik into its separable ideas, **exactly one** cleared the "worth implementing" bar: native speculative loading (Q4) — and `@pyreon/head` already emits `<script>` tags with a body, so it collapses to a thin, idiomatic helper that mirrors the existing `jsonLd` convenience line-for-line. The resumability spike itself was NOT re-run (it would contradict its own measured verdict); the dead bytes thesis was NOT touched.

  **What this adds.** A new opt-in `speculationRules?: SpeculationRules` field on `UseHeadInput` (plus exported `SpeculationRules` / `SpeculationRule` / `SpeculationEagerness` types). It auto-wraps the object as a single `<script type="speculationrules">` tag — supported browsers prefetch or fully prerender the next document(s) for near-instant navigation; unsupported browsers ignore it (no polyfill). Both `source: 'list'` (explicit URLs) and `source: 'document'` (CSS-selector predicate — the Qwik "prefetch by intent" shape) are typed. **Zero runtime JS, opt-in (nothing emitted unless called), SSR + client for free** (rides the existing head pipeline, including its `</script>`-breakout escaper), deduplicated by a single key. No default behavior change.

  **Run as a bounded spike with kill-criteria fixed first** (the codebase's own Tier-2 methodology), shipped only because both load-bearing criteria passed:

  1. **Correctness & SSR-safety — ✅ 0 defects.** 7 unit specs: SSR single-block emission + valid-JSON round-trip, CSR `document.head` sync, key dedup (innermost wins, never two blocks), reactive regen on signal change, `document`-source predicate round-trip, opt-in absence, and XSS-safety (`/x</script><b>pwn` URL → escaped, JSON still parses back to the original).
  2. **Real-Chromium browser acceptance — ✅.** A `*.browser.test.tsx` spec asserts in real Chromium: the script lands in `<head>`, `HTMLScriptElement.type === 'speculationrules'`, the body is valid JSON that round-trips, and Chromium raises **zero** speculation-rules parse errors. (Whether Chromium then prefetches/prerenders is browser-discretionary + headless-flag-dependent and is **intentionally not asserted** — the framework's contract is "emit a correct, valid declarative hint", same as `<link rel=prefetch>`. The docs + manifest mistakes state this explicitly; no measured-TTI claim is made.)
  3. **Net value over existing prefetch — qualitatively yes, honestly framed.** `RouterLink prefetch=intent` warms loader _data_ for in-app client-side nav; Speculation Rules warm the _document_ at the platform level for full navigations — a strictly additional, complementary capability the framework didn't expose. Not overclaimed as a guaranteed perf win.

  **Validation.** `@pyreon/head`: 107 unit + 10 real-Chromium browser tests pass (+7/+1 new). Typecheck clean (head + mcp). `bun run lint` 0 errors. `gen-docs --check` in sync (manifest feature + mistakes added; `api-reference.ts` head region regenerated → the `@pyreon/mcp` patch). `@pyreon/mcp` 497 tests pass. Docs surfaces updated in-PR: `manifest.ts`, `docs/docs/head.md` (intro + `UseHeadInput` interface + a new `## Speculation Rules` section with the honest hint-not-guarantee framing), `index.ts` type exports. No new anti-pattern or lint rule discovered (the hint-not-guarantee caveat is documented as a manifest `mistakes[]` entry).

  No bug fixed → the bisect-verify mandate (revert fix → assert failure) does not apply; this is a new additive capability, stated plainly rather than fabricating a regression.

- [#615](https://github.com/pyreon/pyreon/pull/615) [`8e4b607`](https://github.com/pyreon/pyreon/commit/8e4b607b01c6399153bd504f1411f213db987a9a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs: reconcile manifest doc-metadata with source

  `useTransition()` / `useMiddlewareData()` manifest entries documented the
  wrong shape (`{ isTransitioning }` / `<T>(): T`); source returns reactive
  accessors (`() => boolean`, `() => Record<string, unknown>`). The mcp
  `get_pattern` summary said "Eight foundational patterns" — actually 16.
  Manifest-only / regenerated-api-reference; no runtime behavior change.

- [#606](https://github.com/pyreon/pyreon/pull/606) [`fde0f41`](https://github.com/pyreon/pyreon/commit/fde0f41ad6312ad0ee45d8e70ece965d7c4fec41) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix the biggest MCP `get_api` quality gap: enrich + correct the two thinnest fundamentals manifests, and add a ratchet so density can't silently erode.

  **The gap (measured, via the authoritative `findManifests` loader — the same one `get_api` uses):**

  - `@pyreon/rx`: **3** `api[]` entries for 37 functions. `get_api(rx, sortBy)` / `(rx, debounce)` / `(rx, search)` / `(rx, groupBy)` all **404'd** — agents got nothing for the most-used transforms.
  - `@pyreon/store`: `StoreApi` referenced **3× in `seeAlso`** with no `api[]` entry — `get_api(store, StoreApi)` 404'd despite being the central return type.

  **Plus four real inaccuracies in the existing rx manifest** that were actively _misleading_ AI agents (found by grounding every claim in source, not assuming):

  1. "signals detected by checking for a `.subscribe` method" — false; detection is purely `typeof source === "function"` (`rx/src/types.ts`).
  2. "pass `items` not `() => items()`" — backwards; an accessor wrapper _is_ a function and works. The real mistake is passing a resolved `items()` (static path, never updates).
  3. `groupBy` documented as returning `Computed<Map<…>>` — it returns `Record<string, T[]>` (keys `String()`-coerced).
  4. `search` documented as `{ keys: [...] }` options + "fuzzy" — it's a positional `keys` array and plain case-insensitive `String.includes` (not fuzzy).

  **Fixed (delta, authoritative counts):**

  - `@pyreon/store`: 5 → **6** entries, 2 → **6** with `mistakes[]` (added `StoreApi` entry; added grounded foot-gun catalogs to `addStorePlugin` / `resetStore` / `resetAllStores`; expanded `defineStore`). Every foot-gun traced to real source behaviour (plugin-runs-once-at-creation, silent `patch({typoKey})` no-op, `__proto__` guard, registry-detach semantics, `store.pluginRun` O(stores×plugins)).
  - `@pyreon/rx`: 3 → **9** entries, 2 → **9** with `mistakes[]` (added `map`/`sortBy`/`groupBy`/`search`/`debounce`/`throttle`; beefed `filter`/`pipe`/`rx`) **and the 4 inaccuracies corrected** across summary, longExample, gotchas, and per-entry notes.

  **Proven end-to-end:** a real MCP client↔server round-trip confirms `get_api(rx, sortBy|debounce|search|groupBy)` and `get_api(store, StoreApi)` now resolve with `Common mistakes` sections (were 404), and `get_api(rx, groupBy)` returns `Record`, not `Map`, through the live tool.

  **Structural fix so this can't recur:** new `scripts/check-manifest-depth.ts` ratchet + required `Check Manifest Depth` CI job. `LOCKED` records each migrated package's _achieved_ `{ minEntries, minWithMistakes }` (store 6/6, rx 9/9, query 16/11, form 7/7 — counted via `findManifests`). The gate fails if a locked package erodes; not-yet-migrated packages are intentionally absent (the visible backlog) so it never flag-days CI. Bisect-verified: removing the `StoreApi` entry fails the gate on `@pyreon/store`; restored → passes.

  Per-package `manifest-snapshot` tests updated (regenerated inline snapshots now capture the _corrected_ content; regression-guard assertions added so the 4 inaccuracies can't reappear). `gen-docs` regenerated `llms.txt` / `llms-full.txt` / `api-reference.ts` — in sync.

- [#624](https://github.com/pyreon/pyreon/pull/624) [`8a300bf`](https://github.com/pyreon/pyreon/commit/8a300bf0e6fe7532bb6ae4670a8d64258d64e25f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Migrate `@pyreon/runtime-server` onto the manifest-driven docs pipeline.

  `@pyreon/runtime-server` is the SSR/SSG renderer (`renderToString` / `renderToStream` / `runWithRequestContext` / `configureStoreIsolation` / `decodeKeyFromMarker`) — a real server API surface AI agents query — but it had NO `src/manifest.ts`, no api-reference markers, and was entirely absent from `llms.txt` / `llms-full.txt` / MCP `api-reference.ts`. `get_api(runtime-server, …)` 404'd for the whole surface. PR B of the recommended manifest-coverage follow-up sequence (PR A = the doc-claim correction, [#623](https://github.com/pyreon/pyreon/issues/623); [#622](https://github.com/pyreon/pyreon/issues/622) = compiler).

  **Added** `packages/core/runtime-server/src/manifest.ts` via `defineManifest()` — all 5 public exports as `api[]` entries with accurate signatures + dense `summary` + the real SSR foot-guns in `mistakes[]`: SSR is one-shot (no server reactivity; signals snapshot at render time), Suspense streams out-of-order with a 30s-timeout-keeps-fallback contract, `runWithRequestContext` must wrap the whole `prefetch + render` sequence or loader data is lost, `configureStoreIsolation` MUST be called once at startup or concurrent requests share one global store registry (cross-user SSR state bleed), `<head>` flushes before Suspense resolves. 3 package gotchas (no server reactivity / usually consumed via `@pyreon/server` / the server `typeof process` dev-gate convention).

  **Wiring:** `@pyreon/manifest` added as a `workspace:*` devDependency (the `@pyreon/lint` / `@pyreon/compiler` convention — `manifest.ts` is gen-docs-only, tree-shaken from published `lib/`). Surgical 3-line bun.lock add; `bun install --frozen-lockfile` verified (unrelated fresh-worktree version-field churn reverted to base). api-reference marker pair added between the `@pyreon/runtime-dom` and `@pyreon/store` regions; `bun run gen-docs` regenerated the `llms.txt` bullet, the `llms-full.txt` `## @pyreon/runtime-server` section, and the 5-entry MCP region; hand-prose `## Core Framework` count 6 → 7.

  **No runtime or API change** — purely additive doc metadata. `gen-docs --check` in sync; lint 0 errors; typecheck clean (runtime-server + mcp); runtime-server 143 tests, mcp 497, manifest 135 all green; `check-manifest-depth` passes (runtime-server enters at port-grade density and is intentionally NOT added to `LOCKED` — visible migration backlog, not yet flagship). New `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + the foot-gun-catalog assertions locally in addition to the CI `Docs Sync` gate.

- [#628](https://github.com/pyreon/pyreon/pull/628) [`5431467`](https://github.com/pyreon/pyreon/commit/5431467ac41ccd1374359120b3e71f4af5d6745e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Migrate `@pyreon/styler` onto the manifest-driven docs pipeline.

  `@pyreon/styler` is the CSS-in-JS engine (`styled` / `css` / `keyframes` / `createGlobalStyle` / `useCSS` / theming / `StyleSheet`) — one of the most-queried real-API surfaces in the ui-system, but it had only a one-line hand-written `llms.txt` bullet and **no `src/manifest.ts`, no `llms-full.txt` section, and no MCP api-reference region**. `get_api(styler, styled|css|useTheme|…)` 404'd. PR C of the recommended manifest-coverage follow-up sequence (PR A = the doc-claim correction [#623](https://github.com/pyreon/pyreon/issues/623); [#622](https://github.com/pyreon/pyreon/issues/622) = compiler; [#624](https://github.com/pyreon/pyreon/issues/624) = runtime-server — all merged).

  **Added** `packages/ui-system/styler/src/manifest.ts` via `defineManifest()` — **19 `api[]` entries** covering the consumer-facing surface (`styled`, `css`, `keyframes`, `createGlobalStyle`, `useCSS`, `useTheme`, `useThemeAccessor`, `ThemeProvider`, `ThemeContext`, `createSheet`, `StyleSheet`, `sheet`, `resolve`, `normalizeCSS`, `resolveValue`, `clearNormCache`, `buildProps`, `filterProps`, `isDynamic`) with accurate signatures + dense summaries + the real CSS-in-JS foot-guns in `mistakes[]`: `$`-transient props are not forwarded to the DOM; `css`/`keyframes`/`createGlobalStyle` return lazy/name/component values (not strings, not side-effecting); `useTheme()` snapshots vs `useThemeAccessor()` tracks; `buildProps`/`filterProps` copy DESCRIPTORS not values to preserve the `_rp` reactive-prop contract; singleton-sheet-vs-`createSheet` isolation. 4 package `gotchas`.

  **Wiring:** `@pyreon/manifest` `workspace:*` devDep (the `@pyreon/lint` / `@pyreon/compiler` / `@pyreon/runtime-server` convention — gen-docs-only, tree-shaken from published `lib/`). Surgical 1-line bun.lock add; `bun install --frozen-lockfile` verified (fresh-worktree version-field churn reverted to base). api-reference marker pair added in the ui-system group (between `@pyreon/unistyle` and `@pyreon/storybook`). `bun run gen-docs` regenerated the `llms.txt` bullet (in place — styler already had one), the `llms-full.txt` `## @pyreon/styler` section, and the 19-entry MCP region.

  **No runtime or API change** — purely additive doc metadata. `gen-docs --check` in sync; lint **0 errors** (303 pre-existing warnings, same class as prior PRs); typecheck clean (styler + mcp); styler 410 tests, manifest 135 all green; new `manifest-snapshot.test.ts` (5 specs) locks the rendered bullet/section/api-reference shape + foot-gun-catalog assertions locally; `check-manifest-depth` passes (styler enters at port-grade density, intentionally NOT added to `LOCKED` — visible migration backlog, not yet flagship).

  **Authoring note for the next ui-system migration**: `@pyreon/manifest`'s `renderStringLiteral` serializer escapes backtick + `${` when emitting MCP entries into `api-reference.ts`, but does NOT escape literal backslashes. A `summary`/`mistakes` string whose RESOLVED value contains a literal `\` (e.g. from over-escaped nested `` \`…\``` code spans) emits `\\\ `` → the raw backtick prematurely closes the generated template literal → `api-reference.ts` parse error. Keep manifest prose backslash-free: use plain single-backtick code spans for identifiers, never nested backtick-in-backtick escapes; `${`-in-prose is fine (serializer-escaped, round-trips). Documented in `.claude/rules/anti-patterns.md`.

- Updated dependencies [[`5fb461a`](https://github.com/pyreon/pyreon/commit/5fb461aaf9fcc8d2a624af1442f4db97fd7f33c9), [`5b69841`](https://github.com/pyreon/pyreon/commit/5b69841a6ab30963977e276d120c33d66682da23), [`e274fce`](https://github.com/pyreon/pyreon/commit/e274fceeb37d0893c7425463e443185388fce475), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`6472de0`](https://github.com/pyreon/pyreon/commit/6472de00ffdbcff1fd453c125c404b75fc5cc46d), [`0408e47`](https://github.com/pyreon/pyreon/commit/0408e475e63770996eff17bfb6ac318e89c45df4), [`7e0fe1a`](https://github.com/pyreon/pyreon/commit/7e0fe1a4f7cbb68f7647d85bef843de90d04d506), [`c5b2ea2`](https://github.com/pyreon/pyreon/commit/c5b2ea2fe0df3f52b2af21e0d79b1e391ca9fad5), [`6581f07`](https://github.com/pyreon/pyreon/commit/6581f073293a72360fe9391990d08316e0dc5b4b), [`070a0ec`](https://github.com/pyreon/pyreon/commit/070a0ec687ad598cf15963e5615bb1d8c81933a3)]:
  - @pyreon/compiler@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [[`f35e69b`](https://github.com/pyreon/pyreon/commit/f35e69b2ab53474ecf0ffb792866bc27215b68c3)]:
  - @pyreon/compiler@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/compiler@0.17.0

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

- [#310](https://github.com/pyreon/pyreon/pull/310) [`94c63f9`](https://github.com/pyreon/pyreon/commit/94c63f9426ef0ce64ad8883dd571fd87b0401f88) Thanks [@vitbokisch](https://github.com/vitbokisch)! - New MCP `get_changelog` tool (T2.5.8). AI agents can fetch recent release notes for any `@pyreon/*` package without scraping `git log` or reading raw markdown. Parses changesets-populated `CHANGELOG.md` files, filters out ceremonial version bumps (pure dependency-update releases), and returns the N most recent substantive versions. Accepts the short slug (`"query"`) or the fully-qualified name (`"@pyreon/query"`). Options: `limit` (default 5), `includeDependencyUpdates` (default false), and `since` (filter to versions strictly newer than a floor — useful when an agent knows the version it was trained against and wants just the delta). Complements the existing `get_pattern` + `get_anti_patterns` proactive-docs trio — `get_changelog` answers "what changed recently" while `get_api` answers "what is it now".

- [#309](https://github.com/pyreon/pyreon/pull/309) [`7313617`](https://github.com/pyreon/pyreon/commit/731361719e4ab6fb29bd13265802b36382149a7c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Two new MCP tools for AI coding assistants (T2.5.3 + T2.5.4). `get_pattern({ name })` fetches a "how do I do X in Pyreon" pattern body from `docs/patterns/<name>.md` — 8 foundational patterns ship today (dev-warnings, controllable-state, ssr-safe-hooks, signal-writes, keyed-lists, reactive-context, event-listeners, form-fields). `get_anti_patterns({ category? })` parses `.claude/rules/anti-patterns.md` and returns per-category listings with detector tags surfaced inline. Complements the reactive `validate` tool from T2.5.2: patterns + anti-patterns are proactive (called BEFORE writing code), `validate` is reactive (called AFTER). Both tools walk up from `process.cwd()` to locate the source files so they work across worktrees and monorepo layouts; a helpful miss message prints when running outside the Pyreon repo.

- [#307](https://github.com/pyreon/pyreon/pull/307) [`4638c27`](https://github.com/pyreon/pyreon/commit/4638c2761ec34b1102a36c4675cfcfa805c2168c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Pyreon-specific anti-pattern detector for the MCP `validate` tool (T2.5.2). `@pyreon/compiler` exports a new `detectPyreonPatterns(code, filename)` AST walker catching 9 "using Pyreon wrong" mistakes — `for-missing-by` / `for-with-key` on `<For>`, `props-destructured` at component signatures, `process-dev-gate` (dead code in Vite browser bundles), `empty-theme` no-op chains, `raw-add-event-listener` / `raw-remove-event-listener`, `date-math-random-id` ID schemes, and `on-click-undefined`. `@pyreon/mcp`'s `validate` tool now merges these diagnostics with the existing React detector output, sorted by source line. Every detected pattern is grounded in `.claude/rules/anti-patterns.md` — each bullet there carries a `[detector: <code>]` tag so contributors see what runs statically vs what remains doc-only.

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
