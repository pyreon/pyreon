/**
 * @pyreon/code — bundle-size benchmark.
 *
 * Run: `bun run --filter=@pyreon/code bench`
 *
 * ── WHAT THIS MEASURES + WHY (read this first) ───────────────────────────────
 * The marketable claim for @pyreon/code is "~250 KB via CodeMirror 6 instead of
 * ~2.5 MB for Monaco". This bench substantiates it with REAL measured bytes
 * (esbuild bundle → gzip -9), not a repeated marketing number, and adds the
 * FAIR adapter-thesis peer:
 *
 *   @pyreon/code AND @uiw/react-codemirror BOTH wrap the SAME CodeMirror 6
 *   engine. A fair size comparison between them therefore measures WRAPPER +
 *   which-CM6-extensions-each-pulls, NOT CM6 itself — so both are bundled with
 *   their framework runtime EXTERNAL (Pyreon core / React are app-shared, like
 *   CM6 core is shared between the two). Monaco has no framework runtime, so it
 *   is measured whole.
 *
 * ── OBJECTIVITY CONTRACT ─────────────────────────────────────────────────────
 *  - esbuild: format=esm, platform=browser, bundle, minify, treeShaking,
 *    define process.env.NODE_ENV="production" (dev branches drop out).
 *  - gzip -9 (transfer size — what the browser actually downloads).
 *  - Framework runtime externalized for the two CM6 wrappers (see above);
 *    NOTHING externalized for the raw-CM6 floor or Monaco.
 *  - Grammars are LAZY in @pyreon/code, so the "core" row excludes them and a
 *    "+ 1 grammar (javascript)" row shows the marginal first-language cost.
 *
 * ── HONEST LIMITS (disclosed, not hidden) ────────────────────────────────────
 *  - This is a BUNDLE-SIZE bench (deterministic, reproducible), NOT a runtime /
 *    mount-latency / wrapper-overhead TIMING bench — that needs real-Chromium
 *    Playwright and is a separate axis (see the PR body for the honest status).
 *  - Monaco's ESM entry pulls a large graph; its `.css`/`.ttf` imports are
 *    emptied (CSS ships separately) and its web-WORKER bundles are excluded.
 *    Both omissions only make Monaco LARGER in reality — the measured number is
 *    a conservative LOWER BOUND, and it still dwarfs CM6 by ~10x+.
 *  - Author-judge: the framework author wrote and runs this bench. The METHOD
 *    (esbuild+gzip) and the exact entries are printed so anyone can reproduce.
 */
import { gzipSync } from 'node:zlib'
import * as esbuild from 'esbuild'

interface Target {
  label: string
  /** Entry source (bundled from a temp file so bare specifiers resolve). */
  entry: string
  /** Bare specifiers to leave external (framework runtime — app-shared). */
  external?: string[]
  /** Notes for the printed table. */
  note?: string
}

// Resolve everything from THIS package dir so workspace + node_modules both work.
const RESOLVE_DIR = new URL('..', import.meta.url).pathname

const CODE_CORE = `
import { createEditor } from '@pyreon/code'
import { CodeEditor } from '@pyreon/code'
// A realistic single-pane editor with no grammar (grammars are lazy).
const editor = createEditor({ value: '', lineNumbers: true })
export { editor, CodeEditor }
`

// The javascript grammar is a LAZY chunk in @pyreon/code. To report its TRUE
// marginal cost (a lazy chunk reuses the already-loaded CM6 core, it does NOT
// re-download it), we measure an editor that EAGERLY includes the grammar and
// subtract the core — the delta is what actually streams on first use.
const CODE_CORE_JS_EAGER = `
import { createEditor, CodeEditor } from '@pyreon/code'
import { javascript } from '@codemirror/lang-javascript'
const editor = createEditor({ value: '', extensions: [javascript()] })
export { editor, CodeEditor }
`

const CODE_FULL = `export * from '@pyreon/code'`

const UIW = `
import CodeMirror from '@uiw/react-codemirror'
export { CodeMirror }
`

const MONACO = `
import * as monaco from 'monaco-editor/esm/vs/editor/editor.main.js'
export { monaco }
`

const MONACO_REACT = `
import Editor from '@monaco-editor/react'
export { Editor }
`

const FRAMEWORK_EXTERNAL = ['@pyreon/core', '@pyreon/reactivity', '@pyreon/runtime-dom']

const targets: Target[] = [
  {
    label: '@pyreon/code — core editor (no grammar)',
    entry: CODE_CORE,
    external: FRAMEWORK_EXTERNAL,
    note: 'createEditor + <CodeEditor>, CM6 core; framework external',
  },
  {
    label: '@pyreon/code — full public API',
    entry: CODE_FULL,
    external: FRAMEWORK_EXTERNAL,
    note: 'editor + diff + tabs + minimap + binding',
  },
  {
    label: '@uiw/react-codemirror — wrapper (CM6)',
    entry: UIW,
    external: ['react', 'react-dom'],
    note: 'FAIR peer — wraps the same CM6; React external',
  },
  {
    label: 'monaco-editor — ESM core (lower bound)',
    entry: MONACO,
    external: [],
    note: 'CSS/fonts/workers excluded → conservative floor',
  },
  {
    label: '@monaco-editor/react — wrapper only',
    entry: MONACO_REACT,
    external: ['react', 'react-dom', 'monaco-editor'],
    note: 'thin wrapper; monaco loads separately (see row above)',
  },
]

const fmt = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

async function measure(t: Target): Promise<{ raw: number; gz: number } | null> {
  try {
    const result = await esbuild.build({
      // `stdin` + `resolveDir` so bare specifiers resolve from THIS package's
      // node_modules (a temp entry file in /tmp can't walk up to the workspace).
      stdin: { contents: t.entry, resolveDir: RESOLVE_DIR, loader: 'js', sourcefile: 'entry.js' },
      bundle: true,
      minify: true,
      treeShaking: true,
      metafile: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      outdir: 'bench-out',
      // LOAD-BEARING: `splitting` code-splits dynamic `import()` into separate
      // chunks. @pyreon/code lazy-loads every language grammar via `import()`
      // — WITHOUT splitting, esbuild INLINES all 17 grammars into the entry,
      // wildly overstating the "core" (a real Vite build code-splits them).
      // We measure ONLY the entry chunk = the initial editor download.
      splitting: true,
      entryNames: '[name]',
      chunkNames: 'chunk-[hash]',
      legalComments: 'none',
      external: t.external ?? [],
      define: { 'process.env.NODE_ENV': '"production"' },
      // Monaco imports .css / .ttf; empty them so we measure JS transfer only.
      loader: { '.css': 'empty', '.ttf': 'empty', '.svg': 'empty' },
      // Resolve @pyreon/* workspace packages via the `bun` condition → src
      // (lib/ may not be built in a fresh worktree). Pyreon JSX in the .tsx
      // components uses the automatic runtime from @pyreon/core (external).
      conditions: ['bun', 'browser', 'import', 'default'],
      jsx: 'automatic',
      jsxImportSource: '@pyreon/core',
      jsxDev: false,
      logLevel: 'silent',
    })
    // ── Sum the INITIAL DOWNLOAD ────────────────────────────────────────────
    // With splitting, the CM6 core gets hoisted into a shared chunk that the
    // entry STATICALLY imports. The honest "what downloads before the editor
    // renders" is the entry PLUS every chunk reachable through
    // `import-statement` edges — but NOT through `dynamic-import` edges (those
    // are the lazy grammar chunks that stream on first use). Each output file
    // is a separate HTTP response, so we gzip each individually and sum.
    const outputs = result.metafile.outputs
    const contentsByPath = new Map(result.outputFiles.map((f) => [f.path, f.contents]))
    // Normalize metafile keys (relative) to the outputFiles keys (absolute).
    const findContents = (metaPath: string): Uint8Array | undefined => {
      const base = metaPath.split('/').pop()!
      for (const [p, c] of contentsByPath) if (p.endsWith('/' + base) || p.endsWith(base)) return c
      return undefined
    }
    // The entry output for a `stdin` build is `stdin.js` (esbuild's fixed name
    // for stdin when `outdir` is set). Root the static-reachability walk there.
    const entryKey =
      Object.keys(outputs).find((k) => k.endsWith('/stdin.js') || k.endsWith('stdin.js')) ??
      Object.keys(outputs).find((k) => outputs[k]!.entryPoint)
    if (!entryKey) return null
    const visited = new Set<string>()
    const queue = [entryKey]
    while (queue.length) {
      const cur = queue.shift()!
      if (visited.has(cur)) continue
      visited.add(cur)
      for (const imp of outputs[cur]?.imports ?? []) {
        if (imp.kind === 'import-statement' && outputs[imp.path]) queue.push(imp.path)
      }
    }
    let raw = 0
    let gz = 0
    for (const key of visited) {
      const c = findContents(key)
      if (!c) continue
      raw += c.byteLength
      gz += gzipSync(Buffer.from(c), { level: 9 }).byteLength
    }
    return { raw, gz }
  } catch (err) {
    console.error(`  ! failed to bundle ${t.label}:`, (err as Error).message.split('\n')[0])
    return null
  }
}

async function main() {
  console.log('\n@pyreon/code — bundle size (esbuild ESM + minify + gzip -9)\n')
  const rows: Array<[string, string, string, string]> = [['Target', 'raw', 'gzip', 'note']]
  const results: Record<string, { raw: number; gz: number }> = {}
  for (const t of targets) {
    const m = await measure(t)
    if (!m) {
      rows.push([t.label, 'FAIL', 'FAIL', t.note ?? ''])
      continue
    }
    results[t.label] = m
    rows.push([t.label, fmt(m.raw), fmt(m.gz), t.note ?? ''])

    // Right after the core row, insert the TRUE marginal cost of the first
    // language grammar (eager-JS editor minus core) — the lazy chunk reuses
    // the CM6 core it shares with the already-loaded editor.
    if (t.label.startsWith('@pyreon/code — core')) {
      const eager = await measure({
        label: '_eager',
        entry: CODE_CORE_JS_EAGER,
        external: FRAMEWORK_EXTERNAL,
      })
      if (eager) {
        const marg = { raw: Math.max(0, eager.raw - m.raw), gz: Math.max(0, eager.gz - m.gz) }
        results['  + javascript grammar (marginal lazy chunk)'] = marg
        rows.push([
          '  + javascript grammar (marginal lazy chunk)',
          fmt(marg.raw),
          fmt(marg.gz),
          'streams on first use; reuses the loaded CM6 core',
        ])
      }
    }
  }

  // pad columns
  const widths = [0, 1, 2].map((c) => Math.max(...rows.map((r) => r[c].length)))
  for (const [i, r] of rows.entries()) {
    const line = `${r[0].padEnd(widths[0]!)}  ${r[1].padStart(widths[1]!)}  ${r[2].padStart(widths[2]!)}   ${r[3]}`
    console.log(line)
    if (i === 0) console.log('─'.repeat(line.length))
  }

  // Headline ratio
  const codeCore = results['@pyreon/code — core editor (no grammar)']
  const monaco = results['monaco-editor — ESM core (lower bound)']
  if (codeCore && monaco) {
    console.log(
      `\nHeadline: @pyreon/code core is ${(monaco.gz / codeCore.gz).toFixed(1)}x smaller (gzip) than Monaco's ESM core — and Monaco's real cost is higher still (CSS + web workers excluded above).`,
    )
  }
  const uiw = results['@uiw/react-codemirror — wrapper (CM6)']
  if (codeCore && uiw) {
    const delta = ((codeCore.gz - uiw.gz) / uiw.gz) * 100
    const dir = delta >= 0 ? 'larger' : 'smaller'
    console.log(
      `Adapter peer: @pyreon/code core is ${Math.abs(delta).toFixed(0)}% ${dir} gz than @uiw/react-codemirror (both no grammar) — both wrap the same CM6, so this delta is wrapper + which-extensions-each-bundles, not the engine.`,
    )
  }
  console.log('')

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(results, null, 2))
  }
}

void main()
