#!/usr/bin/env bun
/**
 * Cross-framework BUNDLE SIZE benchmark — what each framework costs on the
 * wire for the SAME app (the krausest-style keyed table the fair-bench runs).
 *
 * Protocol:
 *  - One isolated production `vite build` PER framework (same vite version,
 *    same minifier, same config/plugins as the runtime bench app), entry =
 *    that framework's existing fair-bench impl retained via a keep-reference
 *    (no execution — the impl + its framework must survive tree-shaking).
 *  - Size = SUM of ALL emitted .js (initial + lazy chunks), gzip level 9 —
 *    the same gzip the repo's bundle-budget gates use. CSS excluded (none of
 *    the impls ship framework CSS).
 *  - Every impl includes the SHARED runner module (bench/verify helpers) — a
 *    constant common offset, identical across frameworks, disclosed below.
 *
 * HONEST LIMITS: this measures "the fair-bench table app", not hello-world
 * and not your app; per-framework impl code differs slightly (each is that
 * framework's idiomatic table). The shared-runner offset means ABSOLUTE
 * numbers overstate a minimal app for everyone equally — the DELTAS between
 * frameworks are the signal. AUTHOR-JUDGE caveat as with every bench here.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

interface Target {
  name: string
  /** Import specifier of the fair-bench impl (relative to src/bundle-entries). */
  impl: string
  /** Exported run fn to retain. */
  runExport: string
}

const TARGETS: Target[] = [
  { name: 'Vanilla JS', impl: '../impl/vanilla', runExport: 'runVanilla' },
  { name: 'Preact', impl: '../impl/preact', runExport: 'runPreact' },
  { name: 'React 19', impl: '../impl/react', runExport: 'runReact' },
  { name: 'Vue 3', impl: '../impl/vue', runExport: 'runVue' },
  { name: 'SolidJS', impl: '../impl/solid', runExport: 'runSolid' },
  { name: 'Svelte 5', impl: '../impl/svelte', runExport: 'runSvelte' },
  { name: 'Octane', impl: '../impl/octane.tsrx', runExport: 'runOctane' },
  { name: 'Pyreon', impl: '../impl/pyreon', runExport: 'runPyreon' },
]

const root = import.meta.dirname
const entriesDir = join(root, 'src/bundle-entries')
mkdirSync(entriesDir, { recursive: true })

function gzSizeOfDir(dir: string): { gz: number; raw: number; files: number } {
  let gz = 0
  let raw = 0
  let files = 0
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (f.endsWith('.js')) {
        const buf = readFileSync(p)
        gz += gzipSync(buf, { level: 9 }).length
        raw += buf.length
        files++
      }
    }
  }
  walk(dir)
  return { gz, raw, files }
}

const rows: { name: string; gz: number; raw: number; files: number }[] = []
for (const t of TARGETS) {
  const slug = t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const entryFile = join(entriesDir, `${slug}.ts`)
  // Keep-reference entry: retains the impl (and its framework) without
  // executing the bench. globalThis assignment defeats tree-shaking.
  writeFileSync(
    entryFile,
    `import { ${t.runExport} } from '${t.impl}'\n;(globalThis as Record<string, unknown>).__benchKeep = ${t.runExport}\n`,
  )
  const outDir = join(root, `dist-bundle/${slug}`)
  rmSync(outDir, { recursive: true, force: true })
  console.log(`[bench-bundle] building ${t.name}…`)
  execSync(
    `bunx vite build --outDir ${JSON.stringify(outDir)} --emptyOutDir`,
    {
      cwd: root,
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        BENCH_BUNDLE_ENTRY: entryFile,
      },
    },
  )
  const size = gzSizeOfDir(outDir)
  rows.push({ name: t.name, ...size })
}

rows.sort((a, b) => a.gz - b.gz)
const best = rows.find((r) => r.name !== 'Vanilla JS')!
console.log('\nBundle size — the SAME keyed-table app per framework (all emitted JS, gzip -9)')
console.log('─'.repeat(72))
for (const r of rows) {
  const marker =
    r.name === 'Vanilla JS' ? '(no-framework baseline)' : r === best ? '🥇' : `${(r.gz / best.gz).toFixed(2)}×`
  console.log(
    `  ${r.name.padEnd(11)} ${(r.gz / 1024).toFixed(1).padStart(7)} KB gz  (${(r.raw / 1024).toFixed(0).padStart(4)} KB raw, ${r.files} file${r.files === 1 ? '' : 's'})  ${marker}`,
  )
}
console.log(
  '\n(shared fair-bench runner module included in every entry — a constant common\n offset; deltas between frameworks are the signal. See header for limits.)',
)
