/**
 * @pyreon/rich-text wrapper-overhead benchmark (bundle size).
 *
 * The adapter thesis: `@pyreon/rich-text` and `@tiptap/react` BOTH wrap the
 * same TipTap/ProseMirror engine. So a fair comparison measures the WRAPPER,
 * not ProseMirror — two axes:
 *
 *   1. Wrapper-only glue — the shared engine (`@tiptap/*`, `prosemirror-*`) AND
 *      the base framework (`@pyreon/*` / `react*`) are externalized. What's left
 *      is purely each library's binding code. This is the truest "how much
 *      wrapper does each add" number.
 *
 *   2. Initial bundle the user pays before the editor loads. `@pyreon/rich-text`
 *      lazy-imports `@tiptap/*` on mount (a separate chunk), so its initial cost
 *      is just the ~1.5 KB wrapper. `@tiptap/react`'s `useEditor` + `EditorContent`
 *      statically import `@tiptap/core`, so — absent manual code-splitting — the
 *      whole engine lands in the initial bundle.
 *
 * All measurements: esbuild ESM + minify + tree-shake, gzip -9, matching what a
 * consumer ships. `@tiptap/react` is measured only when installed (a bench-only
 * devDep); when absent, its rows are skipped with a note.
 *
 * Usage: NODE_ENV=production bun scripts/bench/rich-text.ts [--json]
 */

import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { gzipSync } from 'node:zlib'
import * as esbuild from 'esbuild'

// Pyreon package indexes `import { name, version } from '../package.json'` to
// derive the registerSingleton diagnostic — but the package `exports` map
// doesn't list `./package.json`, so esbuild's exports enforcement rejects it.
// (The real rolldown build inlines those two string literals.) This plugin
// resolves any `package.json` import to the real file, bypassing the map — so
// the bench measures the actual index (registerSingleton included).
const packageJsonPlugin: esbuild.Plugin = {
  name: 'resolve-package-json',
  setup(build) {
    build.onResolve({ filter: /(^|\/)package\.json$/ }, (args) => {
      if (args.kind === 'entry-point') return null
      const abs = resolve(dirname(args.importer), args.path)
      return { path: abs, namespace: 'pyreon-pkg-json' }
    })
    build.onLoad({ filter: /.*/, namespace: 'pyreon-pkg-json' }, (args) => ({
      contents: readFileSync(args.path, 'utf8'),
      loader: 'json',
    }))
  },
}

const ROOT = resolve(import.meta.dir, '../..')
const JSON_MODE = process.argv.includes('--json')

// The shared TipTap/ProseMirror engine + inline document deps. Externalizing
// these isolates each WRAPPER from the engine both libraries share. Note the
// NON-react TipTap packages only — `@tiptap/react` IS the wrapper under test,
// so it must NOT be externalized when measuring it.
const ENGINE = [
  '@tiptap/core',
  '@tiptap/pm',
  '@tiptap/pm/*',
  '@tiptap/starter-kit',
  '@tiptap/extension-*',
  'prosemirror-*',
  'orderedmap',
  'rope-sequence',
  'crelt',
  'w3c-keyname',
]
const PYREON_BASE = ['@pyreon/*']
const REACT_BASE = ['react', 'react-dom', 'react/*', 'react-dom/*']

interface Measure {
  label: string
  gzipped: number
  raw: number
  skipped?: string
}

function has(pkg: string): boolean {
  try {
    execSync(`node -e "require.resolve('${pkg}')"`, { cwd: ROOT, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Bundle `source` and measure gzipped size. When `entryOnly` is set, build with
 * code-splitting and measure only the ENTRY chunk — the cost the browser pays on
 * first paint (a dynamic `import()` lands in a separate lazy chunk, a static
 * import stays in the entry).
 */
async function measure(
  label: string,
  source: string,
  external: string[],
  entryOnly = false,
): Promise<Measure> {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-rt-bench-'))
  const entry = join(dir, 'entry.js')
  const outdir = join(dir, 'out')
  try {
    writeFileSync(entry, source)
    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      outdir,
      splitting: entryOnly,
      minify: true,
      treeShaking: true,
      external: ['node:*', 'bun:*', ...external],
      conditions: ['bun'],
      define: { 'process.env.NODE_ENV': '"production"' },
      absWorkingDir: ROOT,
      // The temp entry lives outside the repo; let bare imports (@tiptap/react,
      // @tiptap/starter-kit) resolve against the workspace node_modules.
      nodePaths: [resolve(ROOT, 'node_modules')],
      plugins: [packageJsonPlugin],
      logLevel: 'silent',
    })
    // The entry output keeps the entry basename (`entry.js`); lazy chunks get
    // hashed `chunk-*.js` names. `entryOnly` measures just `entry.js`.
    const raw = readFileSync(join(outdir, 'entry.js'))
    return { label, raw: raw.length, gzipped: gzipSync(raw, { level: 9 }).length }
  } catch (err) {
    return { label, raw: 0, gzipped: 0, skipped: err instanceof Error ? err.message : String(err) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const RT = resolve(ROOT, 'packages/fundamentals/rich-text/src/index.ts')
const tiptapReact = has('@tiptap/react')

const rows: Measure[] = []

// Axis 1 — wrapper-only glue (engine + base framework externalized).
rows.push(
  await measure(
    '@pyreon/rich-text  (wrapper only)',
    `export * from ${JSON.stringify(RT)}`,
    [...ENGINE, ...PYREON_BASE],
  ),
)
if (tiptapReact) {
  rows.push(
    await measure(
      '@tiptap/react      (wrapper only)',
      `export { useEditor, EditorContent, BubbleMenu, FloatingMenu } from '@tiptap/react'`,
      [...ENGINE, ...REACT_BASE],
    ),
  )
} else {
  rows.push({ label: '@tiptap/react      (wrapper only)', raw: 0, gzipped: 0, skipped: 'not installed' })
}

// Axis 2 — initial ENTRY chunk before the editor loads (engine NOT externalized;
// base framework externalized since the app already ships it; code-splitting on,
// so a dynamic import becomes a lazy chunk and a static import stays in entry).
rows.push(
  await measure(
    '@pyreon/rich-text  (initial — engine is a lazy chunk)',
    `export * from ${JSON.stringify(RT)}`,
    [...PYREON_BASE],
    true,
  ),
)
if (tiptapReact) {
  rows.push(
    await measure(
      '@tiptap/react      (initial — engine eagerly imported)',
      // `EditorContent` statically imports `@tiptap/core`, so the engine lands
      // in the entry chunk. (StarterKit is excluded on BOTH sides — Pyreon
      // lazy-loads it too — so this is apples-to-apples on the mount primitives.)
      `export { useEditor, EditorContent } from '@tiptap/react'`,
      [...REACT_BASE],
      true,
    ),
  )
} else {
  rows.push({
    label: '@tiptap/react      (initial — engine eagerly imported)',
    raw: 0,
    gzipped: 0,
    skipped: 'not installed',
  })
}

function fmt(b: number): string {
  return b < 1024 ? `${b}B` : `${(b / 1024).toFixed(1)}KB`
}

if (JSON_MODE) {
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        tiptapReactInstalled: tiptapReact,
        rows: rows.map((r) => ({ label: r.label.trim(), gzipped: r.gzipped, raw: r.raw, skipped: r.skipped })),
      },
      null,
      2,
    ),
  )
} else {
  console.log('\n@pyreon/rich-text — wrapper-overhead bundle bench (gzip -9, NODE_ENV=production)')
  console.log('='.repeat(72))
  for (const r of rows) {
    if (r.skipped) {
      console.log(`${r.label.padEnd(52)} ${`(${r.skipped})`.padStart(19)}`)
    } else {
      console.log(`${r.label.padEnd(52)} ${fmt(r.gzipped).padStart(9)} gz ${fmt(r.raw).padStart(9)} raw`)
    }
  }
  console.log('-'.repeat(72))
  console.log('Adapter thesis: both wrap the same TipTap/ProseMirror engine.')
  console.log('Axis 1 isolates the wrapper; Axis 2 shows lazy-vs-eager engine loading.')
  if (!tiptapReact) {
    console.log('\n@tiptap/react not installed — add it as a bench devDep for the comparison:')
    console.log('  bun add -D @tiptap/react react react-dom')
  }
}
