# @pyreon/loom

## 0.51.0

### Minor Changes

- `@pyreon/loom` reads its settings from the ecosystem-wide `pyreon.config.*`, (f35927f)
  and `@pyreon/config` gains the `loom` section that describes them.

  ```ts
  export default defineConfig({
    loom: {
      devPaths: ["src/manifest.ts", "**/*.gen.ts"],
      ignore: [
        {
          dep: "sharp",
          code: "unused-dep",
          reason: "loaded by the image plugin",
        },
      ],
      strict: true,
      severity: { "unused-dep": "info", "phantom-dep": "error" },
    },
  });
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
