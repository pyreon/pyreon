#!/usr/bin/env bun
/**
 * Library BUNDLE SIZE — every browser-running Pyreon library against the
 * leading rival(s) of its kind, each as a minimal consumer app for the
 * library's main use case (`lib-bundle/cases.ts`).
 *
 * Protocol:
 *  - one isolated production `vite build` per entry (Vite 8 / Rolldown, the
 *    same minifier, target and plugin set for every entry), `NODE_ENV=production`;
 *  - Pyreon packages resolve to their PUBLISHED shape (`lib/`, the `import`
 *    condition). The repo-internal `bun` condition (source) is stripped, since
 *    npm consumers never see it. Rebuild `lib/` (`bun scripts/bootstrap.ts`)
 *    before trusting a Pyreon number;
 *  - size = SUM of every emitted .js (initial + lazy chunks) compressed with
 *    gzip -9 and brotli -11; `initial` = the entry chunk plus its static
 *    imports. Emitted CSS is reported separately (uPlot, notyf and xyflow ship
 *    a stylesheet their layout needs);
 *  - OWN = total − the host framework's baseline entry (Pyreon / React / Vue
 *    mounting one `<div>`): what adding the library to an app that already
 *    ships the framework costs. Framework-free libraries have OWN = total;
 *  - per-package attribution: every byte of the minified output is assigned
 *    to the source file its source-map segment points at, then grouped by
 *    package. `--detail` prints per-file rows for the Pyreon arms.
 *
 * HONEST LIMITS: sizes are for these entries, not your app; the shared
 * framework runtime is a sunk cost most apps pay once. A bundle size is not a
 * runtime cost. AUTHOR-JUDGE: written by the Pyreon authors — every rival arm
 * uses the leanest documented setup; send a PR if one is not.
 *
 * Run:  bun bench-lib-bundle.ts [--only <substr>] [--detail [--source]] [--json <file>]
 *   --source resolves Pyreon packages to src/ (the `bun` condition) so --detail
 *   names source files; use it to diagnose, never for the published numbers.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import pyreon from '@pyreon/vite-plugin'
import { build, type Plugin } from 'vite'
import { BASES, CASES, type Case } from './lib-bundle/cases'

const root = import.meta.dirname
const entriesDir = join(root, 'lib-bundle/.entries')
const outRoot = join(root, 'dist-lib-bundle')
const args = process.argv.slice(2)
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : undefined
const detail = args.includes('--detail')
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : undefined
/** Diagnosis only: resolve Pyreon packages to SOURCE so `--detail` attributes per src file. */
const fromSource = args.includes('--source')

/** Npm consumers never see the repo-internal `bun` (source) condition. */
function publishedShape(): Plugin {
  const strip = (c: { conditions?: string[] } | undefined): void => {
    if (c?.conditions) c.conditions = c.conditions.filter((x) => x !== 'bun')
  }
  return {
    name: 'lib-bundle:published-shape',
    configResolved(config) {
      strip(config.resolve as never)
      for (const env of Object.values(config.environments ?? {})) strip((env as { resolve?: never }).resolve)
    },
  }
}

/** The flags `@vitejs/plugin-vue` / vue-i18n document for production builds. */
const DEFINES: Record<string, string> = {
  __VUE_OPTIONS_API__: 'true',
  __VUE_PROD_DEVTOOLS__: 'false',
  __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  __VUE_I18N_FULL_INSTALL__: 'true',
  __VUE_I18N_LEGACY_API__: 'false',
  __INTLIFY_PROD_DEVTOOLS__: 'false',
}

// ── source-map attribution ────────────────────────────────────────────────
const B64 = new Map([...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map((c, i) => [c, i]))
function decodeVlq(seg: string): number[] {
  const out: number[] = []
  let v = 0
  let shift = 0
  for (const ch of seg) {
    const d = B64.get(ch)!
    v += (d & 31) << shift
    if (d & 32) shift += 5
    else {
      out.push(v & 1 ? -(v >>> 1) : v >>> 1)
      v = 0
      shift = 0
    }
  }
  return out
}

/** Package (or package-relative file with `fine`) that a source path belongs to. */
function owner(src: string, fine: boolean): string {
  const nm = src.lastIndexOf('node_modules/')
  if (nm !== -1) {
    const rest = src.slice(nm + 13).split('/')
    const name = rest[0]!.startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0]!
    return fine ? `${name}/${rest.slice(name.split('/').length).join('/')}` : name
  }
  const m = /packages\/[^/]+\/([^/]+)\/(.*)$/.exec(src)
  if (m) return fine ? `@pyreon/${m[1]}/${m[2]}` : `@pyreon/${m[1]}`
  if (src.includes('.entries/')) return '(app)'
  return fine ? src : '(other)'
}

/** Minified bytes per owner for one emitted chunk, via its source map. */
function attribute(code: string, mapText: string, mapDir: string, fine: boolean, into: Map<string, number>): void {
  const map = JSON.parse(mapText) as { sources: string[]; mappings: string }
  const sources = map.sources.map((s) => owner(resolve(mapDir, s), fine))
  const lines = code.split('\n')
  const mlines = map.mappings.split(';')
  let src = 0
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!
    let col = 0
    let prevCol = 0
    let prevOwner = '(unmapped)'
    for (const seg of (mlines[li] ?? '').split(',')) {
      if (seg === '') continue
      const f = decodeVlq(seg)
      col += f[0]!
      into.set(prevOwner, (into.get(prevOwner) ?? 0) + (col - prevCol))
      prevCol = col
      if (f.length >= 4) {
        src += f[1]!
        prevOwner = sources[src] ?? '(unmapped)'
      } else prevOwner = '(unmapped)'
      // advance the other fields so `src` stays relative-correct
    }
    into.set(prevOwner, (into.get(prevOwner) ?? 0) + (line.length + 1 - prevCol))
  }
}

interface Measured {
  gz: number
  br: number
  min: number
  initialGz: number
  css: number
  owners: Map<string, number>
  fine: Map<string, number>
}

const gz = (b: Buffer | string): number => gzipSync(b, { level: 9 }).length
const br = (b: Buffer | string): number =>
  brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length

async function measure(c: Case): Promise<Measured> {
  const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const entry = join(entriesDir, `${slug}.${c.ext}`)
  mkdirSync(dirname(entry), { recursive: true })
  writeFileSync(entry, c.source)
  const outDir = join(outRoot, slug)
  rmSync(outDir, { recursive: true, force: true })
  let initial = new Set<string>()
  await build({
    configFile: false,
    root,
    logLevel: 'silent',
    mode: 'production',
    define: DEFINES,
    plugins: [
      pyreon(),
      ...(fromSource ? [] : [publishedShape()]),
      {
        name: 'lib-bundle:initial-set',
        generateBundle(_o, bundle) {
          const byName = new Map(Object.entries(bundle))
          const seen = new Set<string>()
          const walk = (f: string): void => {
            if (seen.has(f)) return
            seen.add(f)
            const ch = byName.get(f)
            if (ch && ch.type === 'chunk') for (const i of ch.imports) walk(i)
          }
          for (const [f, ch] of byName) if (ch.type === 'chunk' && ch.isEntry) walk(f)
          initial = seen
        },
      },
    ],
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: 'hidden',
      copyPublicDir: false,
      reportCompressedSize: false,
      rollupOptions: { input: entry },
    },
  })
  const m: Measured = { gz: 0, br: 0, min: 0, initialGz: 0, css: 0, owners: new Map(), fine: new Map() }
  let allText = ''
  const walk = (d: string): void => {
    for (const f of readdirSync(d)) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (f.endsWith('.js')) {
        const buf = readFileSync(p)
        const g = gz(buf)
        m.gz += g
        m.br += br(buf)
        m.min += buf.length
        if (initial.has(p.slice(outDir.length + 1))) m.initialGz += g
        const text = buf.toString('utf8')
        allText += text
        try {
          const mapText = readFileSync(`${p}.map`, 'utf8')
          attribute(text, mapText, dirname(p), false, m.owners)
          if (detail && c.pyreon) attribute(text, mapText, dirname(p), true, m.fine)
        } catch {
          m.owners.set('(no map)', (m.owners.get('(no map)') ?? 0) + buf.length)
        }
      } else if (f.endsWith('.css')) m.css += gz(readFileSync(p))
    }
  }
  walk(outDir)
  if (c.marker !== '' && !allText.includes(c.marker))
    throw new Error(`[bench-lib-bundle] ${c.name}: marker ${JSON.stringify(c.marker)} missing — library not bundled`)
  return m
}

const kb = (b: number): string => (b / 1024).toFixed(2)
const results = new Map<string, Measured>()
for (const b of BASES) results.set(b.name, await measure(b))
const selected = CASES.filter((c) => !only || c.useCase.includes(only) || c.name.includes(only))
for (const c of selected) {
  process.stderr.write(`[bench-lib-bundle] ${c.name}…\n`)
  try {
    results.set(c.name, await measure(c))
  } catch (e) {
    process.stderr.write(`[bench-lib-bundle]   FAILED: ${(e as Error).message.slice(0, 1500)}\n`)
  }
}

const own = (c: Case, k: 'gz' | 'br' | 'min'): number => {
  const m = results.get(c.name)!
  return c.host === 'none' ? m[k] : m[k] - results.get(`base:${c.host}`)![k]
}

console.log('\n## Library bundle size — minimal app per use case (KB; gzip -9 / brotli -11)\n')
console.log('Baselines: ' + BASES.map((b) => `${b.name} ${kb(results.get(b.name)!.gz)} gz`).join(' · ') + '\n')
console.log('| use case | library | host | own gz | own br | total gz | initial gz | css gz | top packages (min bytes) |')
console.log('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |')
const groups = [...new Set(selected.map((c) => c.useCase))]
const json: Record<string, unknown>[] = []
for (const g of groups) {
  for (const c of selected.filter((x) => x.useCase === g)) {
    const m = results.get(c.name)
    if (!m) {
      console.log(`| ${g} | ${c.name} | ${c.host} | FAILED | | | | | |`)
      continue
    }
    const top = [...m.owners]
      .filter(([k]) => k !== '(unmapped)')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')
    const name = c.pyreon ? `**${c.name}**` : c.name
    console.log(
      `| ${g} | ${name} | ${c.host} | ${kb(own(c, 'gz'))} | ${kb(own(c, 'br'))} | ${kb(m.gz)} | ${kb(m.initialGz)} | ${m.css ? kb(m.css) : '—'} | ${top} |`,
    )
    json.push({ useCase: g, name: c.name, host: c.host, pyreon: !!c.pyreon, ownGz: own(c, 'gz'), ownBr: own(c, 'br'), gz: m.gz, br: m.br, initialGz: m.initialGz, css: m.css, owners: Object.fromEntries(m.owners) })
  }
}
if (detail) {
  for (const c of selected.filter((x) => x.pyreon)) {
    const m = results.get(c.name)
    if (!m) continue
    console.log(`\n### ${c.name} — per file (min bytes)\n`)
    for (const [k, v] of [...m.fine].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(v).padStart(7)}  ${k}`)
  }
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(json, null, 2))
