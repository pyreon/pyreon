#!/usr/bin/env bun
/**
 * verify-modes — real-app build matrix gate.
 *
 * Runs `vite build` against every cell in the matrix below — each cell is
 * (example × mode) — and asserts the resulting `dist/` has actual rendered
 * content (not just a build that didn't crash). Used as a CI required
 * check on every PR.
 *
 * Why this exists: 0.14.0 shipped with `mode: "ssg"` typed in the public
 * API but no runtime implementation — apps configured for SSG silently
 * shipped a SPA shell with no per-route HTML. No internal test caught it
 * because nothing exercised the typed surface end-to-end. This matrix
 * does, against the real example apps that already live in `examples/`.
 *
 * Adding a new cell:
 *   1. Add to `MATRIX` below
 *   2. Implement the smoke assertion — must verify CONTENT, not just that
 *      the build succeeded. "Build green but output is empty" is the
 *      whole class of bug this gate exists to catch.
 *
 * Adding a new mode (ssr/ssg/spa/isr/edge/...):
 *   1. Add to the Mode union
 *   2. Add a smoke-assertion factory that knows what shape the dist/ for
 *      that mode is supposed to take
 *
 * Run locally:
 *   bun run scripts/verify-modes.ts             # all cells
 *   bun run scripts/verify-modes.ts ssr-showcase  # only ssr-showcase cells
 *   bun run scripts/verify-modes.ts --only ssg     # only ssg-mode cells
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

type Mode = 'ssr' | 'ssg' | 'spa' | 'isr'

interface Cell {
  /** Example dir name under `examples/` */
  example: string
  /** Rendering mode under test */
  mode: Mode
  /** SSG-only: paths to prerender. Falls back to autodetect when omitted. */
  ssgPaths?: string[]
  /**
   * Subpath / base-path setting (PR E). Forwarded to `zero({ base })` —
   * which propagates to Vite's `base` (asset URL rewriting) AND to
   * `createRouter({ base })` (RouterLink href prefixing). Verifies the
   * end-to-end coordination across all three layers in a real build.
   * Defaults to `'/'` (no prefix).
   */
  base?: string
  /**
   * If true, run `vite build` against the example's existing `vite.config.ts`
   * unchanged — no auto-generated verify config. Use this for examples that
   * don't go through `@pyreon/zero` (e.g. islands-showcase uses bare
   * `@pyreon/vite-plugin` with `ssr: { entry }`). Defaults to false.
   */
  useExampleConfig?: boolean
  /**
   * P0 compile-time rocketstyle collapse. When true the generated verify
   * config calls `pyreon({ collapse: true })` so the plugin's collapse
   * scan + programmatic Vite-SSR resolver fire during the real
   * `vite build`. The cell's smoke (`assertProbeCollapsed`) checks the
   * `rs-collapse-probe-*.js` route chunk by MINIFICATION-STABLE,
   * collapse-EXCLUSIVE fingerprints (baked-children template literal +
   * the `=== "dark"` mode accessor) — NOT the pre-minification
   * `__rsCollapse(` identifier, which Vite renames in prod so a literal-
   * identifier assertion can never match (the original gate bug). This
   * is the build-artifact gate proving the full plugin→resolver→compiler
   * →bundle pipeline end-to-end (the unit/e2 layers prove the pieces;
   * only this proves the assembled production artifact).
   */
  collapse?: boolean
  /**
   * i18n routing config (PR H). Forwarded to `zero({ i18n })` in the
   * generated verify config. Triggers `expandRoutesForLocales` which
   * fans every FileRoute into per-locale variants. Cells using this
   * field assert that the dist tree has per-locale index.html files
   * under the right prefixes per the configured strategy.
   */
  i18n?: {
    locales: string[]
    defaultLocale: string
    strategy?: 'prefix' | 'prefix-except-default'
  }
  /**
   * SEO sitemap config (PR F + K). When set, the generated verify
   * config wires up `seoPlugin({ sitemap: ... })`. Used to assert
   * sitemap content (PR F) and hreflang xhtml:link entries (PR K)
   * end-to-end through a real build. Without this field, the auto-
   * generated config skips seoPlugin entirely.
   *
   * Keep this inline shape aligned with the canonical sitemap config
   * type in `@pyreon/zero` (`SeoSitemapConfig` in `seo.ts`) — if the
   * canonical shape grows a new field, this matrix needs to opt in.
   */
  sitemap?: {
    origin: string
    useSsgPaths?: boolean
    hreflang?: boolean
  }
  /** Smoke assertion — throws on failure. Receives absolute path to dist/. */
  smoke: (distDir: string) => void
}

// ─── Smoke assertion helpers ────────────────────────────────────────────────

function assertFileExists(path: string): void {
  if (!existsSync(path)) throw new Error(`expected file: ${path}`)
}

function assertFileContains(path: string, needle: string): void {
  assertFileExists(path)
  const content = readFileSync(path, 'utf-8')
  if (!content.includes(needle)) {
    const preview = content.length > 400 ? `${content.slice(0, 400)}…` : content
    throw new Error(`expected ${path} to contain "${needle}". Got:\n${preview}`)
  }
}

function assertFileDoesNotExist(path: string): void {
  if (existsSync(path)) throw new Error(`expected ${path} to NOT exist`)
}

/**
 * Assert the `rs-collapse-probe` route chunk actually collapsed in a
 * REAL production `vite build`.
 *
 * The chunk MUST be checked by minification-stable, collapse-EXCLUSIVE
 * fingerprints — NOT the pre-minification identifier names. Vite's prod
 * build renames imported bindings: the emitted
 * `__rsCollapse(html, light, dark, () => __pyrMode() === "dark")` +
 * `__rsSheet.injectRules(rules, ruleKey)` minify to e.g.
 * `t(\`<button>…\`,\`pyr-…\`,\`pyr-…\`,()=>n()===\`dark\`)` +
 * `e.injectRules([…],\`<key>\`)` — so asserting `"__rsCollapse("` would
 * NEVER match a real build even when collapse works (the original gate
 * bug). What IS stable across minification (string/template-literal
 * CONTENTS are never renamed) AND emitted ONLY by `_rsCollapse`:
 *   (A) static children baked into the template literal —
 *       `Save</span></button>` (a non-collapsed Button route mounts
 *       children via `mountChild`; it never serializes them to a string
 *       literal in the route chunk), and
 *   (B) the dual-emit live-mode accessor — `=== "dark"` / ``=== `dark` ``
 *       (the 4th `_rsCollapse` arg threading the configured `useMode`;
 *       unique to the collapse path).
 * Bisect: with collapse OFF the probe builds the real 5-layer Button →
 * neither fingerprint is present → this throws.
 */
/**
 * Assert the `rs-collapse-dyn-probe` route chunk actually dynamic-collapsed
 * in a REAL production `vite build`. Mirrors `assertProbeCollapsed`'s
 * minification-stable-fingerprint approach (PR 4 of the dynamic-prop
 * partial-collapse build).
 *
 * The chunk MUST be checked by minification-stable, dynamic-emit-EXCLUSIVE
 * fingerprints — NOT the pre-minification `__rsCollapseDyn(` identifier
 * (Vite renames it). What IS stable across minification AND emitted
 * ONLY by `_rsCollapseDyn`:
 *   (A) static children baked into the template literal — `Dyn</span></button>`
 *       (a non-collapsed Button never serializes children to a literal)
 *   (B) the stride-2 value-major class array — 4 quoted class strings
 *       in a row, contains `pyr-` prefix (FNV-1a styler class hashes)
 *   (C) the value dispatcher `?0:1` (or `? 0 : 1` pre-minify) —
 *       unique to `_rsCollapseDyn`'s `() => (cond) ? 0 : 1` emit; the
 *       regular `_rsCollapse` emit doesn't have this ternary
 * Bisect: with PR 3's dynamic emit reverted the probe falls back to
 * the normal mount and none of these fingerprints are present.
 */
function assertDynProbeCollapsed(distDir: string): void {
  const assetsDir = join(distDir, 'assets')
  if (!existsSync(assetsDir)) throw new Error(`expected ${assetsDir} to exist`)
  const probe = readdirSync(assetsDir).find(
    (f) => f.startsWith('rs-collapse-dyn-probe') && f.endsWith('.js'),
  )
  if (!probe) {
    throw new Error(
      `expected an \`rs-collapse-dyn-probe-*.js\` route chunk under ${assetsDir} ` +
        `(the fs-router lazy chunk for the dynamic-collapsible probe route). ` +
        `Got: ${readdirSync(assetsDir)
          .filter((f) => f.endsWith('.js'))
          .join(', ')}`,
    )
  }
  const src = readFileSync(join(assetsDir, probe), 'utf-8')
  // The probe ships TWO Button instances with distinct children text:
  //   - `Dyn`  → no-handler emit (__rsCollapseDyn)
  //   - `DynH` → handler-combined emit (__rsCollapseDynH)
  // Both bake their children into the template literal; the chunk thus
  // contains BOTH `Dyn</span></button>` AND `DynH</span></button>`.
  const bakedChildren = src.includes('Dyn</span></button>')
  const bakedChildrenH = src.includes('DynH</span></button>')
  // Stride-2 value-major class array — 4 styler class strings in a row.
  // Real styler classes are SPACE-SEPARATED COMPOUND (e.g.
  // `pyr-1cwii7n pyr-nk7f91` — rocketstyle layer + element layer
  // identity classes), and the minifier preserves them as
  // backtick-quoted template literals. Match a `[` followed by 4
  // backtick-quoted strings each CONTAINING a `pyr-` prefix.
  // The regular `_rsCollapse` emit takes only TWO class args
  // (light/dark); a 4-element class array is unique to `_rsCollapseDyn`.
  const classArray = /\[`[^`]*pyr-[^`]*`,\s*`[^`]*pyr-[^`]*`,\s*`[^`]*pyr-[^`]*`,\s*`[^`]*pyr-[^`]*`\]/.test(src)
  // Value dispatcher — `()=>+!cond` is the minifier's canonical
  // transform of `() => (cond) ? 0 : 1` (both produce 0 for truthy
  // cond, 1 for falsy: `+!true=0, +!false=1`). The regular `_rsCollapse`
  // emit has no `+!` pattern at all — it dispatches solely on the mode
  // accessor returning a boolean used as a ternary against light/dark
  // classes. The `=>+!` is unique to `_rsCollapseDyn`. Also accept the
  // un-minified form for safety / non-minified verify cells.
  const valueDispatcher = /=>\s*\+!|=>\s*\([^)]*\)\s*\?\s*0\s*:\s*1/.test(src)
  // Handler-combined emit fingerprint — UNIQUE to `__rsCollapseDynH`:
  // the call signature is `(html, classes, valueIndex, isDark, handlers)`.
  // The minified isDark accessor is `()=>m()===\`dark\`` (no wrapping
  // parens around the arrow body), and the handlers object literal
  // sits IMMEDIATELY after `\`dark\``: chunk shape is
  // `…()=>n()===\`dark\`,{onClick:…}`. The no-handler emit ends at
  // `()=>n()===\`dark\`)` with the closing paren of the outer call
  // expression — NO comma between `dark`` and `)`. Regex matches
  // `===\`dark\``  or `==="dark"`, then `,` then `{` — only the
  // 5-arg `__rsCollapseDynH` emit produces this shape; the 4-arg
  // `__rsCollapseDyn` emit always has `)` (closing the outer call)
  // after the mode accessor.
  const handlerCombinedShape = /===\s*[`"']dark[`"']\s*,\s*\{/.test(src)
  if (
    !bakedChildren ||
    !bakedChildrenH ||
    !classArray ||
    !valueDispatcher ||
    !handlerCombinedShape
  ) {
    const preview = src.length > 1500 ? `${src.slice(0, 1500)}…` : src
    throw new Error(
      `expected probe chunk ${probe} to be DYNAMIC-COLLAPSED ` +
        `(bakedChildren=${bakedChildren}, bakedChildrenH=${bakedChildrenH}, ` +
        `classArray=${classArray}, valueDispatcher=${valueDispatcher}, ` +
        `handlerCombinedShape=${handlerCombinedShape}). ` +
        `Dynamic-collapsed routes emit class-stripped templates for BOTH ` +
        `the no-handler probe (Dyn</span></button>) and the handler-combined ` +
        `probe (DynH</span></button>), 4-element backtick-quoted pyr-* class ` +
        `arrays, \`()=>+!cond\` value dispatchers, AND the handler-combined ` +
        `signature \`===\\\`dark\\\`),{handlers}\` (5-arg __rsCollapseDynH). ` +
        `Got:\n${preview}`,
    )
  }
}

function assertProbeCollapsed(distDir: string): void {
  const assetsDir = join(distDir, 'assets')
  if (!existsSync(assetsDir)) throw new Error(`expected ${assetsDir} to exist`)
  const probe = readdirSync(assetsDir).find(
    (f) => f.startsWith('rs-collapse-probe') && f.endsWith('.js'),
  )
  if (!probe) {
    throw new Error(
      `expected an \`rs-collapse-probe-*.js\` route chunk under ${assetsDir} ` +
        `(the fs-router lazy chunk for the collapsible probe route). ` +
        `Got: ${readdirSync(assetsDir)
          .filter((f) => f.endsWith('.js'))
          .join(', ')}`,
    )
  }
  const src = readFileSync(join(assetsDir, probe), 'utf-8')
  const bakedChildren = src.includes('Save</span></button>')
  const modeAccessor = /===\s*[`"']dark[`"']/.test(src)
  if (!bakedChildren || !modeAccessor) {
    const preview = src.length > 600 ? `${src.slice(0, 600)}…` : src
    throw new Error(
      `expected probe chunk ${probe} to be COLLAPSED ` +
        `(bakedChildren=${bakedChildren}, modeAccessor=${modeAccessor}). ` +
        `A collapsed route emits a class-stripped \`<button>…Save</span></button>\` ` +
        `template + a \`() => …() === "dark"\` accessor. Got:\n${preview}`,
    )
  }
}

interface ChunkGraphSpec {
  /**
   * For each entry: assert one chunk file under `dist/assets/` whose
   * basename starts with `<name>-` exists, AND its content contains every
   * `fingerprints` string. Fingerprints are content-strings that survive
   * minification — string literals, attribute values, JSX `data-testid`
   * values. Identifier-renaming-resistant; filename basename is the
   * Vite-natural per-dynamic-import chunk shape.
   */
  mustHaveChunks: { name: string; fingerprints: string[]; maxGzippedKb?: number }[]
  /**
   * Strings that must NOT appear in ANY `dist/assets/*.js` chunk.
   * Use this to assert `hydrate: 'never'` islands genuinely ship zero
   * client JS — their identifiers / attributes / props must be absent
   * from every chunk that the entry can reach.
   */
  mustNotContainStrings: string[]
  /**
   * Filename-basename prefixes that must NOT exist as chunks.
   * Catches the regression where a never-strategy island gets pulled
   * into the client graph (e.g. via accidental registry entry, accidental
   * static import from a hydrated island).
   */
  mustNotHaveChunks: string[]
}

/**
 * Assert that a unique fingerprint string appears in EXACTLY ONE chunk
 * file under `dist/assets/`, and that the chunk's basename starts with
 * the expected prefix. Used by the inline-Defer cell to prove the
 * compiler pass extracted the subtree into its own chunk (rather than
 * inlining it into the entry bundle).
 *
 * Throws when:
 *   - The fingerprint appears in 0 chunks → transform didn't fire or
 *     the static import wasn't removed; component never lazy-loaded.
 *   - The fingerprint appears in 2+ chunks → suspicious; usually means
 *     the entry chunk ALSO has the component (split didn't actually
 *     happen, only duplicated).
 *   - The single matching chunk's basename doesn't start with the
 *     expected prefix → unexpected chunk shape (e.g. Rolldown grouped
 *     it under a shared name).
 */
function assertStringInExactlyOneChunk(
  distDir: string,
  fingerprint: string,
  expectedChunkPrefix: string,
): void {
  const assetsDir = join(distDir, 'assets')
  if (!existsSync(assetsDir)) {
    throw new Error(`expected ${assetsDir} to exist`)
  }
  const allFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
  const matches: string[] = []
  for (const file of allFiles) {
    const content = readFileSync(join(assetsDir, file), 'utf-8')
    if (content.includes(fingerprint)) matches.push(file)
  }
  if (matches.length === 0) {
    throw new Error(
      `fingerprint "${fingerprint}" found in 0 chunks under ${assetsDir}.\n` +
        `Got: ${allFiles.join(', ')}.\n` +
        `This means the inline-Defer compiler pass didn't extract the ` +
        `component into its own chunk — either the transform didn't fire, ` +
        `or the static import wasn't removed.`,
    )
  }
  if (matches.length > 1) {
    throw new Error(
      `fingerprint "${fingerprint}" found in ${matches.length} chunks: ${matches.join(', ')}.\n` +
        `Expected exactly one. Two+ matches usually mean the entry bundle ` +
        `ALSO contains the deferred component (the split didn't separate, ` +
        `just duplicated).`,
    )
  }
  const onlyMatch = matches[0]!
  if (!onlyMatch.startsWith(`${expectedChunkPrefix}-`)) {
    throw new Error(
      `fingerprint "${fingerprint}" found in chunk "${onlyMatch}" but ` +
        `expected basename to start with "${expectedChunkPrefix}-". ` +
        `Got: ${onlyMatch}.\nRolldown may have grouped the chunk under a ` +
        `shared name; investigate before adjusting the prefix.`,
    )
  }
}

function assertChunkGraph(distDir: string, spec: ChunkGraphSpec): void {
  const assetsDir = join(distDir, 'assets')
  if (!existsSync(assetsDir)) {
    throw new Error(`expected ${assetsDir} to exist (build did not emit dist/assets/)`)
  }
  const allFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.js'))

  // ── Per-island chunk presence + fingerprints ────────────────────────────
  for (const { name, fingerprints, maxGzippedKb } of spec.mustHaveChunks) {
    const chunkFile = allFiles.find((f) => f.startsWith(`${name}-`))
    if (!chunkFile) {
      throw new Error(
        `expected chunk for "${name}" in ${assetsDir} (looking for ${name}-*.js).\n` +
          `Got: ${allFiles.join(', ')}.\n` +
          `This means the island's loader didn't produce its own dynamic-import ` +
          `chunk — it may have been inlined into the entry, or its registry ` +
          `entry is missing.`,
      )
    }
    const chunkPath = join(assetsDir, chunkFile)
    const content = readFileSync(chunkPath, 'utf-8')
    for (const fp of fingerprints) {
      if (!content.includes(fp)) {
        const preview = content.length > 200 ? `${content.slice(0, 200)}…` : content
        throw new Error(
          `expected chunk ${chunkFile} to contain "${fp}" (component fingerprint).\n` +
            `Got first 200 chars:\n${preview}`,
        )
      }
    }
    if (maxGzippedKb != null) {
      // Approximate gzipped size: raw bytes / ~3 (typical JS minify+gzip ratio).
      // The exact number isn't important — we want to catch a 10× regression,
      // not police single-byte deltas.
      const rawBytes = Buffer.byteLength(content, 'utf-8')
      const approxGzKb = rawBytes / 3 / 1024
      if (approxGzKb > maxGzippedKb) {
        throw new Error(
          `chunk ${chunkFile} approx-gzipped size ${approxGzKb.toFixed(2)} kB ` +
            `exceeds budget ${maxGzippedKb} kB. Investigate before bumping.`,
        )
      }
    }
  }

  // ── Per-island chunk absence ─────────────────────────────────────────────
  for (const name of spec.mustNotHaveChunks) {
    const offender = allFiles.find((f) => f.startsWith(`${name}-`))
    if (offender) {
      throw new Error(
        `chunk "${offender}" exists but should NOT — "${name}" is a ` +
          `hydrate: 'never' island and shouldn't be in the client bundle ` +
          `graph at all. Check: did it get registered in hydrateIslands(), ` +
          `or is it statically imported from a hydrated island?`,
      )
    }
  }

  // ── Content-string absence (defense-in-depth across all chunks) ─────────
  for (const needle of spec.mustNotContainStrings) {
    for (const file of allFiles) {
      const content = readFileSync(join(assetsDir, file), 'utf-8')
      if (content.includes(needle)) {
        throw new Error(
          `string "${needle}" found in chunk ${file}, but it must NOT appear ` +
            `in any client chunk. This typically means a hydrate: 'never' ` +
            `island leaked into the client graph.`,
        )
      }
    }
  }
}

// ─── Matrix ─────────────────────────────────────────────────────────────────
//
// Start small + concrete. Expand as new cells become valuable. Don't add a
// cell unless you can write a meaningful smoke assertion for it.

const MATRIX: Cell[] = [
  // ssr-showcase — has fs-router, layouts, api routes, multiple pages.
  // The reference SSR app. If any mode breaks here, it's broken
  // everywhere.
  {
    example: 'ssr-showcase',
    mode: 'ssr',
    smoke: (dist) => {
      // SSR client build emits a template index.html that gets injected
      // by the server at request time. Assert the placeholders are intact.
      assertFileContains(join(dist, 'index.html'), '<!--pyreon-app-->')
      assertFileContains(join(dist, 'index.html'), '<!--pyreon-head-->')
    },
  },
  {
    example: 'ssr-showcase',
    mode: 'ssg',
    ssgPaths: ['/', '/about'],
    smoke: (dist) => {
      // SSG must produce per-route HTML files with route-correct content.
      // Identical files for both paths = the per-path router URL isn't
      // being respected (the createServer single-router bug from #336).
      const homePath = join(dist, 'index.html')
      const aboutPath = join(dist, 'about', 'index.html')
      assertFileContains(homePath, 'home-page')
      assertFileContains(aboutPath, 'about-page')
      assertFileContains(aboutPath, 'Pyreon is a signal-based UI framework')
      // Cleanup of the temporary SSR sub-build dir
      assertFileDoesNotExist(join(dist, '.zero-ssg-server'))
      // Styler CSS flush regression: about.ts uses a `styled('span')` so
      // its SSG render populates `@pyreon/styler`'s `sheet.ssrBuffer`.
      // Pre-fix, prerendered HTML carried styler-generated class names
      // but ZERO `<style>` tags — CSS only appeared after client JS ran.
      // The fix in ssg-plugin.ts injects `<style data-pyreon-styler="...">`
      // into the head during SSG via a lazy-imported styler integration.
      // Bisect-verifiable: revert ssg-plugin.ts to the no-flush version
      // and this assertion fails (the home page doesn't use styler so
      // it intentionally produces no tag — only assert about page).
      assertFileContains(aboutPath, 'data-pyreon-styler')
      // PR C — 404 emission. ssr-showcase has `_404.ts` so the SSG
      // build must auto-emit `dist/404.html`. Static hosts (Netlify,
      // Cloudflare Pages, GitHub Pages, S3+CloudFront) serve this file
      // for any unmatched URL. Bisect-verifiable: revert the
      // `findNotFoundComponent` walk in ssg-plugin.ts and the file
      // disappears.
      assertFileExists(join(dist, '404.html'))
      assertFileContains(join(dist, '404.html'), 'data-testid="not-found-page"')
      // PR L5 — 404 layout chrome. The not-found component is rendered
      // THROUGH the router with a synthetic non-matching probe URL, so
      // the matched chain is `[rootLayout, syntheticLeaf]` and the
      // rendered HTML carries the layout's chrome (nav links, header,
      // PyreonUI provider) ALONGSIDE the 404 content. Pre-L5 the chain
      // was just `[notFoundComponent]` standalone with no layout
      // wrapping. Bisect-verifiable: revert `findNotFoundFallback` in
      // `@pyreon/router/src/match.ts` AND `renderPath(probePath)` in
      // ssg-plugin's `__renderNotFound` — the navigation links and the
      // testid stop co-occurring.
      assertFileContains(join(dist, '404.html'), 'data-testid="nav-home"')
      assertFileContains(join(dist, '404.html'), 'data-testid="nav-about"')
    },
  },
  {
    example: 'ssr-showcase',
    mode: 'spa',
    smoke: (dist) => {
      // SPA build: just a shell with #app and asset references. Routing
      // happens client-side.
      assertFileContains(join(dist, 'index.html'), 'id="app"')
    },
  },

  // app-showcase — large multi-feature app (blog, chat, dashboard,
  // resume, kanban, …). Real-world surface for SSR + SPA modes.
  {
    example: 'app-showcase',
    mode: 'ssr',
    smoke: (dist) => {
      assertFileContains(join(dist, 'index.html'), '<!--pyreon-app-->')
    },
  },
  {
    example: 'app-showcase',
    mode: 'spa',
    smoke: (dist) => {
      assertFileContains(join(dist, 'index.html'), 'id="app"')
    },
  },

  // ui-showcase — the UI component library catalog. Browser-only
  // surface (SPA), exercises every rocketstyle component.
  {
    example: 'ui-showcase',
    mode: 'spa',
    smoke: (dist) => {
      assertFileContains(join(dist, 'index.html'), 'id="app"')
    },
  },

  // P0 compile-time rocketstyle collapse — the build-artifact gate.
  // `pyreon({ collapse: true })`, real `vite build`. The dedicated
  // `routes/rs-collapse-probe.tsx` renders the canonical collapsible
  // shape (`<Button state="primary" size="medium">Save</Button>` — every
  // dimension prop a string literal, no spread, static-text children, NO
  // onClick), so the plugin's collapse scan + the programmatic Vite-SSR
  // resolver fire and the compiler emits `__rsCollapse(` +
  // `__rsSheet.injectRules(` into the route's CLIENT chunk instead of the
  // 5-layer wrapper mount. The unit + e2 layers prove the pieces; only
  // this proves the fully-assembled artifact through a production build.
  // Bisect-verified: flip `collapse` off (or break detection) → the
  // probe falls back to the normal mount and neither needle is emitted →
  // both asserts fail.
  {
    example: 'ui-showcase',
    mode: 'spa',
    collapse: true,
    smoke: (dist) => {
      assertFileContains(join(dist, 'index.html'), 'id="app"')
      assertProbeCollapsed(dist)
      // PR 4 of the dynamic-prop partial-collapse build — the SAME cell
      // also exercises the dynamic-collapse probe (`rs-collapse-dyn-probe.tsx`).
      // Sharing a single cell keeps the build cost amortized (one
      // `vite build` covers both gates); both fingerprint sets are
      // collapse-emit-EXCLUSIVE so the dynamic assertion is
      // independent of the static one — bisecting PR 3's dynamic emit
      // fails ONLY this assertion while `assertProbeCollapsed` keeps
      // passing.
      assertDynProbeCollapsed(dist)
    },
  },

  // playground — minimal three-route Pyreon shell. Smallest viable
  // app exercising the routing + layout chain.
  {
    example: 'playground',
    mode: 'ssr',
    smoke: (dist) => {
      assertFileContains(join(dist, 'index.html'), '<!--pyreon-app-->')
    },
  },
  {
    example: 'playground',
    mode: 'ssg',
    ssgPaths: ['/', '/about'],
    smoke: (dist) => {
      // Second SSG cell — different app shape, validates that the SSG
      // pipeline isn't ssr-showcase-specific. Catches regressions in
      // route-correct rendering across different layout chains.
      assertFileExists(join(dist, 'index.html'))
      assertFileExists(join(dist, 'about', 'index.html'))
      assertFileDoesNotExist(join(dist, '.zero-ssg-server'))
    },
  },
  {
    example: 'playground',
    mode: 'spa',
    smoke: (dist) => {
      assertFileContains(join(dist, 'index.html'), 'id="app"')

      // Inline-Defer regression gate. examples/playground/src/pages/About.tsx
      // uses `<Defer when={open}><DeferredFixture /></Defer>` — the compiler
      // pass (`@pyreon/compiler` `transformDeferInline`) should:
      //   1. Rewrite the JSX to `<Defer chunk={() => import(...)} ...>`.
      //   2. Remove the static `import { DeferredFixture } from '...'`.
      //   3. Rolldown then emits `DeferredFixture-*.js` as a separate chunk.
      //
      // The fingerprint `DEFER_INLINE_FIXTURE_MARKER_XYZ123` lives ONLY
      // inside that component's source. If the compiler transform regressed
      // (e.g. didn't fire, didn't remove the static import, emitted a
      // broken chunk-prop), the fingerprint would land in the entry
      // bundle (`index-*.js`) instead — making this assertion fail.
      //
      // Bisect-verifiable: revert the `transformDeferInline` call in
      // `@pyreon/vite-plugin`'s `transform()` hook and this cell fails
      // with `expected fingerprint in DeferredFixture chunk`.
      assertStringInExactlyOneChunk(dist, 'DEFER_INLINE_FIXTURE_MARKER_XYZ123', 'DeferredFixture')

      // v2 prop-preservation gate. About.tsx passes
      // `<DeferredFixture label="DEFER_INLINE_FIXTURE_PROP_LABEL_ABC987" />` —
      // the compiler rewrites the inline child into a render-prop body
      // `{(__C) => <__C label="..." />}` that lives in the route chunk
      // (`about-*.js`), NOT the fixture chunk. If v2 prop-preservation
      // regressed, the prop literal would be dropped — the fingerprint
      // would appear in ZERO chunks and this cell would fail with
      // `expected prop fingerprint in about chunk`.
      //
      // Bisect-verifiable: remove the `buildRenderPropBody` call (revert
      // to `{(__C) => <__C />}` constant) and this assertion fails.
      assertStringInExactlyOneChunk(dist, 'DEFER_INLINE_FIXTURE_PROP_LABEL_ABC987', 'about')

      // v3 namespace-import gate. About.tsx also uses
      // `import * as NS from '../components/NamespaceFixture'` +
      // `<Defer when={...}><NS.NamespaceFixture /></Defer>` — the
      // compiler should rewrite the JSXMemberExpression child + remove
      // the `import * as NS` static import. If gap 4 regressed, the
      // namespace import would survive → Rolldown would static-bundle
      // the fixture → the fingerprint would appear in `about-*.js`
      // (the route chunk) instead of `NamespaceFixture-*.js`.
      //
      // Bisect-verifiable: revert the namespace branches in
      // `analyzeChildElement` / `findImportFor` / the main loop, and
      // this assertion fails with `expected fingerprint in
      // NamespaceFixture chunk`.
      assertStringInExactlyOneChunk(
        dist,
        'DEFER_NAMESPACE_FIXTURE_MARKER_QRS456',
        'NamespaceFixture',
      )
    },
  },

  // ssr-showcase × ssg with autodetect — covers the path-resolution
  // fallback that picks static routes from the file-system route tree
  // when ssg.paths is omitted. Not the same code path as explicit-paths.
  {
    example: 'ssr-showcase',
    mode: 'ssg',
    // No ssgPaths → triggers autodetect (which now includes
    // getStaticPaths-driven dynamic-route enumeration from PR A).
    smoke: (dist) => {
      // Autodetect should produce static routes (/ + /about) AND the
      // dynamic posts/[id] enumeration via getStaticPaths.
      assertFileExists(join(dist, 'index.html'))
      assertFileExists(join(dist, 'about', 'index.html'))
      assertFileExists(join(dist, 'posts', '1', 'index.html'))
      assertFileExists(join(dist, 'posts', '2', 'index.html'))
      assertFileExists(join(dist, 'posts', '3', 'index.html'))
      assertFileDoesNotExist(join(dist, '.zero-ssg-server'))
      // PR C — 404 emission applies in autodetect mode too. The
      // emit404 step runs after the path loop regardless of how paths
      // were resolved.
      assertFileExists(join(dist, '404.html'))

      // PR I — build-time ISR revalidate manifest. posts/[id].ts
      // exports `revalidate = 60`; the SSG plugin emits
      // `dist/_pyreon-revalidate.json` mapping each concrete post path
      // to 60. Adapters consume the manifest at deploy time to wire
      // platform-specific ISR (Vercel `output/config.json`, Cloudflare
      // cache rules, Netlify build hooks).
      //
      // Bisect-verifiable: remove the `export const revalidate = 60`
      // line from posts/[id].ts → manifest is `{}` → file isn't
      // emitted → assertion fails. Restore → manifest contains all
      // 3 post paths.
      const manifestPath = join(dist, '_pyreon-revalidate.json')
      assertFileExists(manifestPath)
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
        revalidate: Record<string, number | false>
      }
      // posts/[id].ts has `revalidate = 60` and 3 enumerated IDs →
      // manifest must include all three. Static routes (/, /about)
      // have NO revalidate export → must NOT appear.
      if (manifest.revalidate['/posts/1'] !== 60) {
        throw new Error(
          `expected manifest.revalidate['/posts/1'] === 60, got ${JSON.stringify(manifest.revalidate)}`,
        )
      }
      if (manifest.revalidate['/posts/2'] !== 60) {
        throw new Error(`expected /posts/2 in manifest`)
      }
      if (manifest.revalidate['/posts/3'] !== 60) {
        throw new Error(`expected /posts/3 in manifest`)
      }
      if ('/about' in manifest.revalidate) {
        throw new Error(`expected /about NOT in manifest (no revalidate export)`)
      }
    },
  },

  // ssr-showcase × ssg-subpath — PR E. Subpath / base-path verification.
  // Sets `zero({ base: '/blog/' })` and asserts the value flows through
  // BOTH the Vite asset-URL rewriter AND the router's RouterLink hrefs
  // — the two coordination points that pre-PR-E were silently
  // disconnected (`zero({ base })` was a typed-but-unimplemented field;
  // `__ZERO_BASE__` was defined as a Vite global with zero consumers,
  // and the SSR/CSR path never forwarded the value to `createRouter`).
  //
  // The dist filesystem layout deliberately does NOT include the base
  // prefix — `dist/about/index.html` not `dist/blog/about/index.html`.
  // Static hosts (Netlify, Cloudflare Pages, GitHub Pages, S3) serve
  // `dist/` mounted at `/blog/`, mapping `/blog/about` → `dist/about/index.html`.
  // The base belongs in the URL contracts (asset paths in HTML, router
  // hrefs), not in the on-disk layout. Bisect-verifiable: revert the
  // `base: config.base` line in vite-plugin.ts → asset assertion fails
  // (URLs lose the prefix); revert the `createApp({ base })` plumbing
  // in entry-server.ts / client.ts / ssg-plugin.ts → router-href
  // assertion fails (RouterLinks render `/about` not `/blog/about`).
  {
    example: 'ssr-showcase',
    mode: 'ssg',
    base: '/blog/',
    ssgPaths: ['/', '/about'],
    smoke: (dist) => {
      // Dist filesystem stays unprefixed — that's the static-host contract.
      assertFileExists(join(dist, 'index.html'))
      assertFileExists(join(dist, 'about', 'index.html'))
      assertFileDoesNotExist(join(dist, 'blog', 'index.html'))

      // Asset URLs in the rendered HTML must include `/blog/` prefix —
      // proves Vite's `base` was set from `zero({ base })`.
      assertFileContains(join(dist, 'index.html'), 'src="/blog/assets/')
      assertFileContains(join(dist, 'index.html'), 'href="/blog/assets/')

      // RouterLink hrefs must include `/blog/` prefix — proves the SSG
      // entry's createApp call forwarded base to createRouter, AND that
      // RouterLink correctly prepends the base when emitting hrefs.
      assertFileContains(join(dist, 'about', 'index.html'), 'href="/blog/about"')
      assertFileContains(join(dist, 'about', 'index.html'), 'href="/blog/posts"')
    },
  },

  // ssr-showcase × ssg-i18n — PR H. Locale-prefixed route variants.
  //
  // Sets `zero({ i18n: { locales: ['en','de','cs'], defaultLocale: 'en' } })`
  // (defaults to prefix-except-default strategy). The build's
  // `autoDetectStaticPaths` calls `expandRoutesForLocales`, which fans
  // each FileRoute into per-locale variants:
  //
  //   `/`        → `/`,         `/de`,        `/cs`
  //   `/about`   → `/about`,    `/de/about`,  `/cs/about`
  //   `/posts`   → `/posts`,    `/de/posts`,  `/cs/posts`
  //
  // The default locale (`en`) keeps unprefixed URLs (canonical /
  // SEO-friendly); non-default locales get explicit prefixes.
  //
  // The cell asserts the dist filesystem layout matches the contract:
  // every locale has its own index.html / about/index.html /
  // posts/index.html. The default-locale variants live at the
  // unprefixed path; non-defaults live under their locale prefix.
  // Catches the regression where `expandRoutesForLocales` is reverted
  // (only default-locale paths emitted; `/de/about/index.html`
  // missing).
  //
  // Bisect-verifiable: revert the `expandRoutesForLocales` call in
  // `ssg-plugin.ts:autoDetectStaticPaths` AND in `vite-plugin.ts`'s
  // virtual-routes load → cell fails with "expected file: dist/de/about/index.html"
  // (de locale variant was never enumerated, so SSG didn't render it).
  {
    example: 'ssr-showcase',
    mode: 'ssg',
    i18n: {
      locales: ['en', 'de', 'cs'],
      defaultLocale: 'en',
      strategy: 'prefix-except-default',
    },
    // PR K — wire seoPlugin to assert hreflang sitemap entries at the
    // build-artifact layer. `hreflang: true` auto-reads the i18n config
    // from the SSG manifest (`_pyreon-ssg-paths.json`) — zero-config
    // pickup of `zero({ i18n: ... })` above.
    sitemap: {
      origin: 'https://example.com',
      useSsgPaths: true,
      hreflang: true,
    },
    smoke: (dist) => {
      // Default-locale variants live at unprefixed paths (SEO-canonical).
      assertFileExists(join(dist, 'index.html'))
      assertFileExists(join(dist, 'about', 'index.html'))
      assertFileExists(join(dist, 'posts', 'index.html'))

      // Non-default locales land under their locale prefix.
      assertFileExists(join(dist, 'de', 'index.html'))
      assertFileExists(join(dist, 'de', 'about', 'index.html'))
      assertFileExists(join(dist, 'de', 'posts', 'index.html'))
      assertFileExists(join(dist, 'cs', 'index.html'))
      assertFileExists(join(dist, 'cs', 'about', 'index.html'))
      assertFileExists(join(dist, 'cs', 'posts', 'index.html'))

      // Default locale MUST NOT have a prefixed variant under
      // prefix-except-default — `/en/about` would be a duplicate
      // canonical URL split across two paths, hurting SEO.
      assertFileDoesNotExist(join(dist, 'en', 'about', 'index.html'))

      // PR H follow-up — dynamic-route × locale CROSS-PRODUCT gate.
      // posts/[id].ts exports `getStaticPaths()` returning 3 ids
      // (1, 2, 3). With 3 locales (en + de + cs) under
      // prefix-except-default, the SSG plugin must produce 9 concrete
      // post HTML files: 3 unprefixed for `en`, 3 under `/de/posts/`,
      // 3 under `/cs/posts/`. Locks in the contract at the dist
      // filesystem level — the unit test in i18n-routing.test.ts
      // covers `exports.getStaticPaths` inheritance at the function
      // level, this gates it end-to-end through the build. A
      // regression that truncated the cross-product to "first locale
      // only" would fail here loudly.
      assertFileExists(join(dist, 'posts', '1', 'index.html'))
      assertFileExists(join(dist, 'posts', '2', 'index.html'))
      assertFileExists(join(dist, 'posts', '3', 'index.html'))
      assertFileExists(join(dist, 'de', 'posts', '1', 'index.html'))
      assertFileExists(join(dist, 'de', 'posts', '2', 'index.html'))
      assertFileExists(join(dist, 'de', 'posts', '3', 'index.html'))
      assertFileExists(join(dist, 'cs', 'posts', '1', 'index.html'))
      assertFileExists(join(dist, 'cs', 'posts', '2', 'index.html'))
      assertFileExists(join(dist, 'cs', 'posts', '3', 'index.html'))

      // PR K — per-locale 404 emission. _404.tsx is duplicated under
      // every locale subtree (PR H), and the SSG closeBundle walks the
      // route tree per-locale and emits `dist/{locale}/404.html`
      // alongside the default `dist/404.html`. Static hosts (Netlify
      // per-directory `errors_404`, Cloudflare Pages) serve the right
      // 404 for paths under each locale prefix.
      assertFileExists(join(dist, '404.html'))
      assertFileExists(join(dist, 'de', '404.html'))
      assertFileExists(join(dist, 'cs', '404.html'))

      // PR K — hreflang sitemap cross-references. seoPlugin reads the
      // i18n config from the SSG manifest (zero-config pickup of
      // `zero({ i18n: ... })`), clusters paths by their un-prefixed
      // form, and emits `<xhtml:link rel="alternate" hreflang="...">`
      // siblings inside each `<url>` entry plus an `x-default` entry
      // pointing at the default-locale URL.
      const sitemapPath = join(dist, 'sitemap.xml')
      assertFileExists(sitemapPath)
      assertFileContains(sitemapPath, 'xmlns:xhtml="http://www.w3.org/1999/xhtml"')
      // /about cluster — 3 locale variants + x-default.
      assertFileContains(
        sitemapPath,
        '<xhtml:link rel="alternate" hreflang="en" href="https://example.com/about"/>',
      )
      assertFileContains(
        sitemapPath,
        '<xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/about"/>',
      )
      assertFileContains(
        sitemapPath,
        '<xhtml:link rel="alternate" hreflang="cs" href="https://example.com/cs/about"/>',
      )
      assertFileContains(
        sitemapPath,
        '<xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/about"/>',
      )
      // Dynamic-route × locale: /posts/1 cluster — also gets hreflang.
      assertFileContains(
        sitemapPath,
        '<xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/posts/1"/>',
      )

      // PR F cleanup — the SSG manifest is internal, MUST NOT ship.
      assertFileDoesNotExist(join(dist, '_pyreon-ssg-paths.json'))
    },
  },

  // ssr-showcase × ssg-i18n-prefix — PR L1 follow-up. Same example,
  // different i18n strategy.
  //
  // PR H + K shipped with `prefix-except-default` exercised end-to-end
  // (the canonical strategy for primary-locale SEO apps). The other
  // strategy — `prefix` — has unit coverage only (the strategy branch in
  // `expandRoutesForLocales` is asserted via the i18n-routing.test.ts
  // unit suite). Without a real-app build at this strategy, a regression
  // in path emission, root-layout handling, or hreflang clustering could
  // ship to users running `strategy: 'prefix'` and nothing in the gate
  // would catch it.
  //
  // This cell asserts the prefix-strategy contract end-to-end:
  //   - Every locale (including default `en`) gets prefixed paths
  //     (`/en/about`, `/de/about`, `/cs/about`).
  //   - The root index emits per locale (`/en/index.html`, `/de`, `/cs`)
  //     — NO unprefixed `/index.html` because under `prefix` there is
  //     no default-locale unprefixed shape.
  //   - Per-locale 404 emits for EVERY locale including `en`
  //     (`dist/en/404.html`, `dist/de/404.html`, `dist/cs/404.html`) —
  //     plus `dist/404.html` from the unprefixed root walker still fires
  //     because the route tree's root subtree carries `notFoundComponent`
  //     even under `prefix` strategy (it just has no unprefixed children).
  //   - hreflang sitemap clusters paths correctly under the new
  //     strategy. The `x-default` entry under `prefix` points at the
  //     `en`-prefixed URL (the default locale's URL, which is itself
  //     prefixed under this strategy).
  {
    example: 'ssr-showcase',
    mode: 'ssg',
    i18n: {
      locales: ['en', 'de', 'cs'],
      defaultLocale: 'en',
      strategy: 'prefix',
    },
    sitemap: {
      origin: 'https://example.com',
      useSsgPaths: true,
      hreflang: true,
    },
    smoke: (dist) => {
      // Under `prefix` strategy, every locale (including default `en`)
      // gets prefixed paths. NO unprefixed `/about` / `/posts`.
      assertFileExists(join(dist, 'en', 'about', 'index.html'))
      assertFileExists(join(dist, 'de', 'about', 'index.html'))
      assertFileExists(join(dist, 'cs', 'about', 'index.html'))
      assertFileExists(join(dist, 'en', 'posts', 'index.html'))
      assertFileExists(join(dist, 'de', 'posts', 'index.html'))
      assertFileExists(join(dist, 'cs', 'posts', 'index.html'))

      // Root indexes per locale — `/en/index.html` exists under `prefix`
      // (unlike `prefix-except-default` where `en` keeps unprefixed `/`).
      assertFileExists(join(dist, 'en', 'index.html'))
      assertFileExists(join(dist, 'de', 'index.html'))
      assertFileExists(join(dist, 'cs', 'index.html'))

      // No unprefixed top-level pages (under `prefix`, every URL must
      // carry a locale prefix — `/about` would be a route that doesn't
      // belong to any locale subtree). The `about/index.html` at
      // top-level being absent proves the duplication ran for ALL
      // locales (including default), not just non-default.
      assertFileDoesNotExist(join(dist, 'about', 'index.html'))
      assertFileDoesNotExist(join(dist, 'posts', 'index.html'))

      // Dynamic-route × locale cross-product under prefix. /posts/[id]
      // exports getStaticPaths returning 3 ids. With 3 locales (all
      // prefixed under this strategy), 9 concrete post HTML files
      // (3 ids × 3 locales).
      assertFileExists(join(dist, 'en', 'posts', '1', 'index.html'))
      assertFileExists(join(dist, 'en', 'posts', '2', 'index.html'))
      assertFileExists(join(dist, 'en', 'posts', '3', 'index.html'))
      assertFileExists(join(dist, 'de', 'posts', '1', 'index.html'))
      assertFileExists(join(dist, 'de', 'posts', '2', 'index.html'))
      assertFileExists(join(dist, 'de', 'posts', '3', 'index.html'))
      assertFileExists(join(dist, 'cs', 'posts', '1', 'index.html'))
      assertFileExists(join(dist, 'cs', 'posts', '2', 'index.html'))
      assertFileExists(join(dist, 'cs', 'posts', '3', 'index.html'))

      // Per-locale 404 for every locale (including default `en`).
      // Under `prefix` strategy, the en-locale duplicate IS emitted —
      // unlike `prefix-except-default` where only non-default locales
      // get a per-locale 404. The unprefixed `dist/404.html` ALSO
      // emits because the route tree's root subtree (where _404.tsx
      // lives at file-scan time) still classifies as null-locale at
      // the walker, then the per-locale duplicates land at /en /de /cs.
      assertFileExists(join(dist, 'en', '404.html'))
      assertFileExists(join(dist, 'de', '404.html'))
      assertFileExists(join(dist, 'cs', '404.html'))

      // hreflang sitemap under `prefix` strategy. The clustering still
      // groups by un-prefixed path, but every variant URL is locale-
      // prefixed. `x-default` points at the EN-prefixed URL (the
      // defaultLocale's URL, which is itself prefixed under prefix).
      const sitemapPath = join(dist, 'sitemap.xml')
      assertFileExists(sitemapPath)
      assertFileContains(sitemapPath, 'xmlns:xhtml="http://www.w3.org/1999/xhtml"')
      // /about cluster — 3 locale variants + x-default. ALL urls
      // are prefixed (no unprefixed /about under this strategy).
      assertFileContains(
        sitemapPath,
        '<xhtml:link rel="alternate" hreflang="en" href="https://example.com/en/about"/>',
      )
      assertFileContains(
        sitemapPath,
        '<xhtml:link rel="alternate" hreflang="de" href="https://example.com/de/about"/>',
      )
      assertFileContains(
        sitemapPath,
        '<xhtml:link rel="alternate" hreflang="cs" href="https://example.com/cs/about"/>',
      )
      // x-default points at the default locale's URL — UNDER PREFIX
      // strategy this is the EN-prefixed URL, not an unprefixed one.
      assertFileContains(
        sitemapPath,
        '<xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/en/about"/>',
      )

      // PR F cleanup — manifest is internal, MUST NOT ship.
      assertFileDoesNotExist(join(dist, '_pyreon-ssg-paths.json'))
    },
  },

  // cpa-pw-blog × ssg — exercises the full SSG roadmap stack:
  //   PR A: getStaticPaths enumerates blog post slugs
  //   PR C: _404.tsx emits dist/404.html
  //   PR F: seoPlugin({ useSsgPaths: true }) reads the resolved-paths
  //         manifest and includes dynamic blog post URLs in sitemap.xml
  //   PR I (M3.B follow-up): `revalidate = 3600` on `[slug].tsx` produces
  //         per-route ISR manifest entries for every prerendered post URL
  // Uses the example's own vite.config.ts (which wires getStaticPaths +
  // seoPlugin + fontPlugin together) — see useExampleConfig: true.
  {
    example: 'cpa-pw-blog',
    mode: 'ssg',
    useExampleConfig: true,
    smoke: (dist) => {
      // Static routes from auto-detect.
      assertFileExists(join(dist, 'index.html'))
      assertFileExists(join(dist, 'about', 'index.html'))
      assertFileExists(join(dist, 'blog', 'index.html'))
      assertFileExists(join(dist, '404.html'))

      // PR A — dynamic blog posts prerendered into dist/blog/<slug>/index.html.
      assertFileExists(join(dist, 'blog', 'welcome', 'index.html'))
      assertFileExists(join(dist, 'blog', 'why-signals', 'index.html'))
      assertFileExists(join(dist, 'blog', 'static-vs-ssr', 'index.html'))

      // PR F — sitemap.xml emitted by seoPlugin AFTER the SSG manifest
      // exists. Must contain the static routes AND the dynamic blog
      // post URLs enumerated by getStaticPaths in [slug].tsx.
      const sitemapPath = join(dist, 'sitemap.xml')
      assertFileExists(sitemapPath)
      // Pre-PR-F: sitemap walks file-system routes and skips `[slug]`
      // (silent regex filter) — the blog post URLs would be absent.
      // Post-PR-F: useSsgPaths reads the manifest, blog post URLs land
      // in sitemap.xml. The slugs come from `examples/cpa-pw-blog/src/lib/posts.ts`.
      assertFileContains(sitemapPath, 'https://example.com/about')
      assertFileContains(sitemapPath, 'https://example.com/blog')
      // Blog post slugs come from `examples/cpa-pw-blog/src/content/posts/`.
      assertFileContains(sitemapPath, '/blog/welcome')
      assertFileContains(sitemapPath, '/blog/why-signals')
      assertFileContains(sitemapPath, '/blog/static-vs-ssr')

      // PR I (M3.B) — `revalidate = 3600` on [slug].tsx produces a
      // manifest entry per prerendered post. The `vercelRevalidateHandler`
      // at `api/_pyreon-revalidate.ts` validates incoming webhook
      // requests against this manifest (it's the path allowlist).
      // Pre-fix (no `revalidate` export): manifest is absent OR empty.
      // Post-fix: every dynamic blog post URL gets a 3600s TTL entry.
      const revalidatePath = join(dist, '_pyreon-revalidate.json')
      assertFileExists(revalidatePath)
      assertFileContains(revalidatePath, '"/blog/welcome": 3600')
      assertFileContains(revalidatePath, '"/blog/why-signals": 3600')
      assertFileContains(revalidatePath, '"/blog/static-vs-ssr": 3600')

      // PR F cleanup — the manifest is an internal artifact and must
      // NOT ship to the static host (no `_pyreon-ssg-paths.json` in dist).
      assertFileDoesNotExist(join(dist, '_pyreon-ssg-paths.json'))

      // PR #715 (`@pyreon/head` HeadProvider ctx inheritance) — gate against
      // the **empty-`<head>` shipped-to-prod bug class**. The original bug
      // shipped silently for the entire lifetime of @pyreon/zero because
      // NO gate diff-checked the prerendered `<head>` for `useHead`-
      // registered tags. The SSG build succeeded, sitemaps emitted, route
      // shells rendered — but every `<title>` / `<meta>` / OG tag dropped
      // on the floor because zero's `App` mounted `<HeadProvider>` which
      // silently shadowed `renderWithHead`'s ctx. Social scrapers (LinkedIn,
      // Slack, Twitter, FB) and non-JS crawlers saw nothing; JS-executing
      // bots like Googlebot saw the post-hydration values, masking the
      // bug from standard SEO sweeps.
      //
      // This block asserts every route that calls `useHead()` has its
      // tags in the prerendered HTML. If the head pipeline regresses —
      // ctx shadowing, missing serialization, broken pushContext seam —
      // these assertions fail loudly at build time instead of shipping
      // empty `<head>` to production.
      //
      // The OG-tag assertions on `dist/blog/welcome/index.html` are
      // load-bearing: those are the EXACT tags social scrapers read,
      // and they're what got silently lost in the pre-fix bug.

      // Home — useHead({ title: 'Blog', meta: [{ name: 'description', … }] })
      assertFileContains(join(dist, 'index.html'), '<title>Blog</title>')
      assertFileContains(join(dist, 'index.html'), 'name="description"')
      assertFileContains(
        join(dist, 'index.html'),
        'A statically-rendered Pyreon Zero blog.',
      )

      // About — distinct title + description (proves per-route resolution)
      assertFileContains(join(dist, 'about', 'index.html'), '<title>About</title>')
      assertFileContains(join(dist, 'about', 'index.html'), 'About this blog.')

      // Blog index — distinct title + description
      assertFileContains(
        join(dist, 'blog', 'index.html'),
        '<title>All posts</title>',
      )
      assertFileContains(
        join(dist, 'blog', 'index.html'),
        'Every post on this blog, newest first.',
      )

      // Dynamic [slug] — title + description + 3 OG tags PER prerendered
      // post. The OG-tag triplet is the killer assertion: it's the
      // social-scraper surface, and it was EXACTLY what the pre-#715
      // empty-`<head>` bug suppressed. PR A's getStaticPaths × PR #715's
      // head fix together prove the full pipeline lands tags on EVERY
      // enumerated dynamic-route output, not just the index.
      const welcomeHtml = join(dist, 'blog', 'welcome', 'index.html')
      assertFileContains(welcomeHtml, '<title>Welcome to your new Pyreon blog</title>')
      assertFileContains(welcomeHtml, 'name="description"')
      assertFileContains(welcomeHtml, 'A quick tour of how this blog is wired together')
      assertFileContains(welcomeHtml, 'property="og:title"')
      assertFileContains(welcomeHtml, 'property="og:description"')
      assertFileContains(welcomeHtml, 'property="og:type"')
      assertFileContains(welcomeHtml, 'content="article"')

      // Cross-product (PR A × #715) — at least one other prerendered
      // post must have its OWN title in its own file (not the home's
      // title spilling across, which would prove a ctx-merge bug).
      assertFileContains(
        join(dist, 'blog', 'why-signals', 'index.html'),
        '<title>Why signals beat hooks for content sites</title>',
      )
      assertFileContains(
        join(dist, 'blog', 'static-vs-ssr', 'index.html'),
        '<title>Static vs SSR — picking the right rendering mode</title>',
      )

      // 404 — _404.tsx calls useHead({ title: '404 — Not found',
      // meta: [{ name: 'robots', content: 'noindex' }] }). The 404 path
      // runs through a DIFFERENT pipeline (router-driven synthetic chain,
      // skipLoaders), so it's a separate gate axis from the regular pages.
      assertFileContains(join(dist, '404.html'), '<title>404 — Not found</title>')
      assertFileContains(join(dist, '404.html'), 'name="robots"')
      assertFileContains(join(dist, '404.html'), 'content="noindex"')
    },
  },

  // fundamentals-playground — exercises every fundamental package
  // (form, query, store, machine, charts, code, hotkeys, i18n, …).
  // If a fundamentals package's build path breaks, this catches it.
  {
    example: 'fundamentals-playground',
    mode: 'spa',
    smoke: (dist) => {
      assertFileContains(join(dist, 'index.html'), 'id="app"')
    },
  },

  // islands-showcase — verifies the "ship per-island JS" pitch at the
  // bundle-output level. PR #461 verified hydration; this verifies the
  // BUILD: each `island()` declaration produces its own dynamic-import
  // chunk, and `hydrate: 'never'` islands genuinely ship zero client JS.
  //
  // Bundle splitting could regress silently otherwise — every browser
  // smoke + e2e test would still pass even if all islands were inlined
  // into the entry, defeating the value prop.
  //
  // Uses the example's bare `pyreon({ ssr })` config (no `@pyreon/zero`).
  {
    example: 'islands-showcase',
    mode: 'ssr',
    useExampleConfig: true,
    smoke: (dist) => {
      // Server still emits the SSR template at build time.
      assertFileContains(join(dist, 'index.html'), '<!--pyreon-app-->')
      assertFileContains(join(dist, 'index.html'), '<!--pyreon-scripts-->')

      // Per-island chunks + content fingerprints + size budget.
      // Budget is generous (5 KB approx-gzipped) — current chunks are
      // 0.4-0.6 KB each. Catches an order-of-magnitude regression, not
      // single-byte drift.
      assertChunkGraph(dist, {
        mustHaveChunks: [
          { name: 'Counter', fingerprints: ['counter-inc', 'counter-value'], maxGzippedKb: 5 },
          { name: 'IdleClock', fingerprints: ['idle-clock-time'], maxGzippedKb: 5 },
          { name: 'VisibleComments', fingerprints: ['visible-comments-list'], maxGzippedKb: 5 },
          {
            name: 'MobileMenu',
            fingerprints: ['mobile-menu-toggle', 'mobile-menu-state'],
            maxGzippedKb: 5,
          },
          {
            name: 'CommandPalette',
            fingerprints: ['command-palette-trigger', 'command-palette-input'],
            maxGzippedKb: 5,
          },
        ],
        // hydrate: 'never' islands MUST be absent from the client bundle.
        // No chunk with their basename, AND no chunk content referencing
        // their identifiers / attributes.
        mustNotHaveChunks: ['StaticBadge'],
        mustNotContainStrings: ['static-badge'],
      })
    },
  },
]

// ─── Per-cell harness ───────────────────────────────────────────────────────

const REPO_ROOT = resolve(import.meta.dir, '..')
const VERIFY_CONFIG_NAME = 'vite.config.verify.ts'

function cellId(c: Cell): string {
  return `${c.example} × ${c.mode}`
}

function configSourceFor(cell: Cell): string {
  const ssgConfig = cell.ssgPaths ? `, ssg: { paths: ${JSON.stringify(cell.ssgPaths)} }` : ''
  const baseConfig = cell.base ? `, base: ${JSON.stringify(cell.base)}` : ''
  const i18nConfig = cell.i18n ? `, i18n: ${JSON.stringify(cell.i18n)}` : ''
  // PR F + K: optional seoPlugin wiring for sitemap + hreflang
  // assertions. Loaded AFTER zero() so closeBundle ordering matches
  // the canonical user-side pattern (seoPlugin's enforce: 'post' picks
  // up the SSG manifest after zero's closeBundle writes it).
  const seoImport = cell.sitemap ? `import { seoPlugin } from '@pyreon/zero/seo'\n` : ''
  const seoPluginCall = cell.sitemap
    ? `, seoPlugin({ sitemap: ${JSON.stringify(cell.sitemap)} })`
    : ''
  return `import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
${seoImport}import { defineConfig } from 'vite'

// Auto-generated by scripts/verify-modes.ts — do not commit.
export default defineConfig({
  plugins: [pyreon(${cell.collapse ? '{ collapse: true }' : ''}), zero({ mode: ${JSON.stringify(cell.mode)}${baseConfig}${ssgConfig}${i18nConfig} })${seoPluginCall}],
  resolve: { conditions: ['bun'] },
})
`
}

async function runViteBuild(exampleDir: string, configFile: string): Promise<void> {
  return new Promise((resolveFn, rejectFn) => {
    const proc = spawn('bun', ['run', 'vite', 'build', '--config', configFile], {
      cwd: exampleDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      if (code === 0) resolveFn()
      else
        rejectFn(
          new Error(`vite build exited with code ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`),
        )
    })
    proc.on('error', rejectFn)
  })
}

interface CellResult {
  cell: Cell
  ok: boolean
  error?: Error
  durationMs: number
}

async function runCell(cell: Cell): Promise<CellResult> {
  const exampleDir = join(REPO_ROOT, 'examples', cell.example)
  const distDir = join(exampleDir, 'dist')
  const verifyConfig = join(exampleDir, VERIFY_CONFIG_NAME)
  const start = Date.now()

  if (!existsSync(exampleDir)) {
    return {
      cell,
      ok: false,
      error: new Error(`example dir not found: ${exampleDir}`),
      durationMs: 0,
    }
  }

  try {
    if (cell.useExampleConfig) {
      // Run the example's real vite.config.ts unchanged. Used for examples
      // that don't go through @pyreon/zero (e.g. islands-showcase uses
      // bare @pyreon/vite-plugin).
      await rm(distDir, { recursive: true, force: true })
      await runViteBuild(exampleDir, 'vite.config.ts')
    } else {
      // Write the per-cell config file. Lives alongside the example's real
      // vite.config.ts but is auto-generated and cleaned up below.
      await writeFile(verifyConfig, configSourceFor(cell), 'utf-8')
      // Wipe any prior dist so we can't get a false-pass from stale output.
      await rm(distDir, { recursive: true, force: true })
      // Build.
      await runViteBuild(exampleDir, VERIFY_CONFIG_NAME)
    }

    // Smoke.
    cell.smoke(distDir)

    return { cell, ok: true, durationMs: Date.now() - start }
  } catch (error) {
    return {
      cell,
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
      durationMs: Date.now() - start,
    }
  } finally {
    // Always clean up the verify config + dist. The example's real
    // vite.config.ts was never touched.
    await rm(verifyConfig, { force: true })
    await rm(distDir, { recursive: true, force: true })
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { example?: string; mode?: Mode } {
  const args: { example?: string; mode?: Mode } = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--only' && argv[i + 1]) {
      args.mode = argv[++i] as Mode
    } else if (!a?.startsWith('--')) {
      args.example = a
    }
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const cells = MATRIX.filter(
    (c) => (!args.example || c.example === args.example) && (!args.mode || c.mode === args.mode),
  )

  if (cells.length === 0) {
    console.error(
      `[verify-modes] no cells match filter (example=${args.example ?? '*'}, mode=${args.mode ?? '*'})`,
    )
    process.exit(2)
  }

  console.log(`[verify-modes] running ${cells.length} cell(s)`)
  console.log()

  const results: CellResult[] = []
  for (const cell of cells) {
    const id = cellId(cell)
    process.stdout.write(`  ${id} ... `)
    const r = await runCell(cell)
    results.push(r)
    if (r.ok) console.log(`✓ (${r.durationMs}ms)`)
    else console.log(`✗ (${r.durationMs}ms)`)
  }

  const failed = results.filter((r) => !r.ok)
  console.log()
  console.log(`[verify-modes] ${results.length - failed.length}/${results.length} passed`)

  if (failed.length > 0) {
    console.log()
    console.log('--- failures ---')
    for (const r of failed) {
      console.log()
      console.log(`✗ ${cellId(r.cell)}`)
      console.log(r.error?.stack ?? r.error?.message ?? 'unknown error')
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[verify-modes] runner crashed:', err)
  process.exit(2)
})
