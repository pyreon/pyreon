#!/usr/bin/env bun
/**
 * Check docs code examples against the live API surface.
 *
 * ## Why
 *
 * The manifest-driven docs pipeline (T2.1/T2.5.1) catches API drift in
 * the api-reference + llms-* surfaces. Code examples inside `docs/src/content/docs/**`
 * markdown bodies aren't on that pipeline — they rot silently when a
 * symbol is renamed, removed, or has its signature changed.
 *
 * ## Opt-in by marker (avoids 1930-block false-positive flood)
 *
 * `docs/src/content/docs/**` carries ~1930 `tsx`/`ts` fenced blocks today. Most are
 * illustrative snippets that omit imports, reference undefined helpers,
 * or pick up state from earlier blocks (continuation) — typechecking
 * them all as standalone files would produce noise that drowns out the
 * actual API-drift signal.
 *
 * Opt in per block with `// @check` as the first content line:
 *
 *     ```tsx
 *     // @check
 *     import { signal } from '@pyreon/reactivity'
 *     const count = signal(0)
 *     ```
 *
 * Unmarked blocks are skipped. The gate covers what's marked; authors
 * can mark more over time as the docs mature.
 *
 * ## Mechanics
 *
 * 1. Walk `docs/src/content/docs/**` markdown.
 * 2. For each `tsx` / `ts` / `typescript` fence whose first content line
 *    starts with `// @check`, extract the block.
 * 3. Write each block to `.cache/doc-examples/<file>-<idx>.tsx`.
 * 4. Run `tsc --noEmit` against the cache dir + a synthesised tsconfig
 *    that aliases `@pyreon/*` to the workspace `src/` entries, enables
 *    JSX automatic runtime via `@pyreon/core`, and is intentionally
 *    permissive (`strict: false`, `skipLibCheck: true`) so the gate
 *    flags API/signature drift, not stylistic-strictness mismatches.
 * 5. Parse `tsc` output. Report failures back with the original
 *    `docs/src/content/docs/<file>.md` location + block index.
 *
 * Exits 0 on clean, 1 on any check failure.
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const DOCS_DIR = join(REPO_ROOT, 'docs', 'src', 'content', 'docs')
const CACHE_DIR = join(REPO_ROOT, '.cache', 'doc-examples')
const MARKER = '// @check'

// ─── Discover @pyreon/* workspace paths for tsconfig path-aliases ─────────

function discoverPyreonPaths(): Record<string, string[]> {
  const paths: Record<string, string[]> = {}
  const categories = ['core', 'fundamentals', 'tools', 'ui-system', 'zero', 'internals']
  for (const cat of categories) {
    const catDir = join(REPO_ROOT, 'packages', cat)
    if (!existsSync(catDir)) continue
    for (const pkg of readdirSync(catDir)) {
      const pkgDir = join(catDir, pkg)
      const pjPath = join(pkgDir, 'package.json')
      if (!existsSync(pjPath)) continue
      let name: string
      try {
        name = JSON.parse(readFileSync(pjPath, 'utf8')).name
      } catch {
        continue
      }
      if (typeof name !== 'string' || !name.startsWith('@pyreon/')) continue
      const indexPath = join(pkgDir, 'src', 'index.ts')
      if (existsSync(indexPath)) paths[name] = [relative(REPO_ROOT, indexPath)]
    }
  }
  // Common subpaths the docs reference. `@pyreon/core/jsx-runtime` is
  // required by `jsxImportSource: '@pyreon/core'` — without it, every JSX
  // expression errors with TS2875.
  const subpaths: Record<string, string> = {
    '@pyreon/core/jsx-runtime': 'packages/core/core/src/jsx-runtime.ts',
    '@pyreon/core/jsx-dev-runtime': 'packages/core/core/src/jsx-dev-runtime.ts',
    // @pyreon/testing library-helper subpaths (each maps exports-key → src file
    // per the vl_rolldown convention, so the alias is mechanical).
    '@pyreon/testing/form': 'packages/tools/testing/src/form.ts',
    '@pyreon/testing/ui': 'packages/tools/testing/src/ui.ts',
    '@pyreon/testing/router': 'packages/tools/testing/src/router.ts',
    '@pyreon/testing/store': 'packages/tools/testing/src/store.ts',
    '@pyreon/testing/i18n': 'packages/tools/testing/src/i18n.ts',
    '@pyreon/testing/toast': 'packages/tools/testing/src/toast.ts',
    '@pyreon/testing/query': 'packages/tools/testing/src/query.ts',
  }
  for (const [alias, p] of Object.entries(subpaths)) {
    if (existsSync(join(REPO_ROOT, p))) paths[alias] = [p]
  }
  return paths
}

// ─── Markdown extraction ───────────────────────────────────────────────────

interface ExtractedBlock {
  /** Origin file (relative to repo root). */
  file: string
  /** 1-based block index within the file (in fence-encounter order, all langs). */
  index: number
  /** Language tag (`tsx`, `ts`, `typescript`). */
  lang: string
  /** Code body, with the `// @check` marker line removed. */
  body: string
  /** Original line number in the markdown of the FIRST body line. */
  startLine: number
}

const FENCE_RE = /^```(tsx|ts|typescript|jsx)(?:\s+.*)?$/

function* extractBlocks(filePath: string): Generator<ExtractedBlock> {
  const src = readFileSync(filePath, 'utf8')
  const lines = src.split('\n')
  let i = 0
  let fenceIdx = 0
  while (i < lines.length) {
    const line = lines[i]!
    const m = FENCE_RE.exec(line)
    if (!m) {
      i++
      continue
    }
    fenceIdx++
    const lang = m[1]!
    const bodyStart = i + 1
    let j = bodyStart
    while (j < lines.length && lines[j] !== '```') j++
    if (j >= lines.length) {
      // Unterminated fence — bail on this fence, keep going.
      i++
      continue
    }
    const bodyLines = lines.slice(bodyStart, j)
    i = j + 1
    if (bodyLines.length === 0) continue
    if (!bodyLines[0]!.trim().startsWith(MARKER)) continue
    yield {
      file: relative(REPO_ROOT, filePath),
      index: fenceIdx,
      lang,
      body: bodyLines.slice(1).join('\n'),
      startLine: bodyStart + 2, // 1-based, after the marker
    }
  }
}

function* walkMd(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules') continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) yield* walkMd(full)
    else if (name.endsWith('.md')) yield full
  }
}

// ─── tsc runner ─────────────────────────────────────────────────────────────

function writeBlock(block: ExtractedBlock, idx: number): string {
  // Use a flat numeric scheme so we don't have to mirror the docs/ tree;
  // the manifest maps each generated file back to its origin for error
  // reporting.
  const tsxLang = block.lang === 'ts' || block.lang === 'typescript' ? 'ts' : 'tsx'
  const fname = `block-${String(idx).padStart(4, '0')}.${tsxLang}`
  const fpath = join(CACHE_DIR, fname)
  writeFileSync(fpath, block.body)
  return fname
}

function writeTsconfig(filenames: string[]): void {
  const pyreonPaths = discoverPyreonPaths()
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'preserve',
      jsxImportSource: '@pyreon/core',
      strict: false,
      noImplicitAny: false,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      isolatedModules: true,
      noEmit: true,
      // Aliased workspace `src/` files reference `process.env.NODE_ENV`
      // (dev-mode gates); without `@types/node`, the resolved
      // `@pyreon/*` modules error-flood with TS2591 ("Cannot find name
      // 'process'"). Including `node` in `types` matches what the real
      // workspace tsconfigs do.
      types: ['node'],
      // Path aliases need a baseUrl in TS 5.x; `ignoreDeprecations`
      // silences the 7.0 deprecation warning.
      ignoreDeprecations: '6.0',
      baseUrl: '.',
      paths: Object.fromEntries(
        Object.entries(pyreonPaths).map(([name, paths]) => [
          name,
          paths.map((p) => join('..', '..', p)),
        ]),
      ),
    },
    include: filenames,
  }
  writeFileSync(join(CACHE_DIR, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))
}

function runTsc(): { ok: boolean; out: string } {
  try {
    const out = execSync('bunx tsc --project tsconfig.json', {
      cwd: CACHE_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true, out }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number }
    return { ok: false, out: (err.stdout ?? '') + (err.stderr ?? '') }
  }
}

// ─── Run ───────────────────────────────────────────────────────────────────

function main(): number {
  if (!existsSync(DOCS_DIR)) {
    console.log('[check-doc-examples] no docs/src/content/docs/ — skipping.')
    return 0
  }

  // Fresh cache dir each run — no stale leftovers.
  if (existsSync(CACHE_DIR)) rmSync(CACHE_DIR, { recursive: true, force: true })
  mkdirSync(CACHE_DIR, { recursive: true })

  const all: ExtractedBlock[] = []
  const filenames: string[] = []
  const fileMap: Record<string, ExtractedBlock> = {}

  for (const md of walkMd(DOCS_DIR)) {
    for (const block of extractBlocks(md)) {
      const fname = writeBlock(block, all.length + 1)
      all.push(block)
      filenames.push(fname)
      fileMap[fname] = block
    }
  }

  if (all.length === 0) {
    console.log(
      `[check-doc-examples] OK — no opted-in blocks found (marker: \`${MARKER}\` as first content line in tsx/ts fence).`,
    )
    return 0
  }

  console.log(`[check-doc-examples] Checking ${all.length} opted-in code block(s)…`)

  writeTsconfig(filenames)
  const { ok, out } = runTsc()

  if (ok) {
    console.log(`[check-doc-examples] OK — ${all.length} block(s) typecheck cleanly.`)
    return 0
  }

  // Parse tsc errors. Format: `block-NNNN.tsx(L,C): error TSxxxx: msg`.
  //
  // SCOPING: this gate verifies the DOC BLOCKS compile against the live API.
  // It aliases every `@pyreon/*` to its `src/`, which can surface type
  // artifacts INSIDE transitively-imported package source (e.g. a cross-
  // package src-vs-lib union mismatch) that the packages' own `Typecheck`
  // job — which resolves deps to built `lib/` `.d.ts` — does not flag. Those
  // errors are NOT doc-block problems and are owned by the Typecheck job, so
  // we fail ONLY on errors located in a `block-NNNN` cache file (the doc
  // examples themselves). A real doc-block bug (missing import, wrong
  // signature, wrong call) is always reported at its block file, so this
  // scoping never hides a doc error.
  const lines = out.split('\n').filter((l) => l.trim().length > 0)
  const blockErrors: Array<{ block: ExtractedBlock; loc: string; msg: string }> = []
  let transitiveCount = 0
  for (const line of lines) {
    const m = /^(block-\d+\.[tj]sx?)(\(\d+,\d+\))?:\s*(.+)$/.exec(line)
    if (m && fileMap[m[1]!]) {
      blockErrors.push({ block: fileMap[m[1]!]!, loc: m[2] ?? '', msg: m[3]! })
      continue
    }
    // A file-located TS error not in a doc block = transitively-imported
    // package source (the Typecheck job's concern, not this gate's).
    if (/\.[tj]sx?\(\d+,\d+\):\s*error TS/.test(line)) transitiveCount++
  }

  if (blockErrors.length === 0) {
    if (transitiveCount > 0) {
      console.log(`[check-doc-examples] OK — ${all.length} block(s) typecheck cleanly.`)
      console.warn(
        `[check-doc-examples] note: ignored ${transitiveCount} type issue(s) in transitively-imported @pyreon package source (owned by the Typecheck job, not this gate).`,
      )
      return 0
    }
    // tsc failed but produced no recognizable doc-block OR package errors —
    // an unexpected failure (bad config, crash). Surface it rather than mask.
    console.error('[check-doc-examples] tsc failed without doc-block errors:\n' + out)
    return 1
  }

  console.error(`[check-doc-examples] FAILED — ${blockErrors.length} doc-block issue(s):\n`)
  for (const e of blockErrors) {
    console.error(
      `  ${e.block.file}:${e.block.startLine} (block #${e.block.index}) — ${e.msg}${e.loc}`,
    )
  }
  console.error('')
  console.error(
    `To opt a block OUT of checking, remove the \`${MARKER}\` first-line marker.`,
  )
  console.error(
    'To opt MORE blocks IN, add the marker as the first content line of a tsx/ts fence.',
  )
  return 1
}

process.exit(main())
