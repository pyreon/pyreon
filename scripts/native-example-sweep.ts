#!/usr/bin/env bun
/**
 * Native example sweep — what the compiler does with every documented example of every package.
 *
 * Each `api[].example` in a package manifest is the code an AI assistant or a reader is shown. Compiling it, inside a
 * component, through the real first-party compiler for BOTH targets, and then type-checking the emitted Swift and
 * Kotlin with the real toolchains, answers a question the coverage registry (one hand-written snippet per package)
 * cannot: across the surface people are actually told to write, how often does native output fail, and — the case
 * that matters — how often does it fail WITHOUT the compiler saying so?
 *
 * Every example lands in exactly one bucket per target:
 *
 *   clean         compiles, and the compiler said nothing
 *   warned-ok     compiles, but the compiler warned (a warning on code that compiles is a false positive worth reading)
 *   warned-fail   does not compile, and the compiler warned — the contract working: a named warning, not a silent break
 *   incomplete    does not compile, no warning, but ONLY because the example is a fragment: the symbol the toolchain
 *                 cannot find is not a Pyreon export (`price`, `api`, `doc`, …) — the snippet relies on helpers it never
 *                 defines. The repo's TypeScript example gate (`check-manifest-examples`) excludes the same class
 *   SILENT-FAIL   does not compile and the compiler said NOTHING, about a Pyreon export — the defect class this sweep
 *                 exists to drive to zero
 *
 * Usage:
 *   bun scripts/native-example-sweep.ts                  # every package, summary + per-package table
 *   bun scripts/native-example-sweep.ts @pyreon/router   # one package, with every non-clean example listed
 *   bun scripts/native-example-sweep.ts --json out.json  # also write the per-example records
 *   bun scripts/native-example-sweep.ts --silent         # list every silent failure with its first error
 *
 * Needs swiftc and kotlinc (it exits 2 saying so rather than reporting a clean sweep it never ran). Verdicts are
 * content-addressed by the validators, so a second run is fast.
 *
 * An example that is genuinely web-only (it calls the DOM, `h()`, a bundler) is EXPECTED to fail — what it must not do
 * is fail silently. Reading the SILENT-FAIL list is therefore a to-do list for warnings and lowerings, not a score.
 */

import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(import.meta.dirname, '..')

interface ApiEntry {
  name: string
  example?: string
}
interface Manifest {
  name: string
  api?: ApiEntry[]
}

type Bucket = 'clean' | 'warned-ok' | 'warned-fail' | 'incomplete' | 'SILENT-FAIL'

interface Record_ {
  pkg: string
  api: string
  swift: Bucket
  kotlin: Bucket
  swiftWarnings: number
  kotlinWarnings: number
  swiftError?: string
  kotlinError?: string
  example: string
}

async function loadManifests(): Promise<Manifest[]> {
  const out: Manifest[] = []
  for (const cat of ['core', 'fundamentals', 'tools', 'ui-system', 'zero']) {
    const catDir = join(REPO_ROOT, 'packages', cat)
    if (!existsSync(catDir)) continue
    for (const pkg of readdirSync(catDir)) {
      const path = join(catDir, pkg, 'src', 'manifest.ts')
      if (!existsSync(path)) continue
      const mod = (await import(pathToFileURL(path).href)) as { default?: Manifest }
      if (mod.default) out.push(mod.default)
    }
  }
  return out
}

/**
 * Every `import` statement is hoisted (they may follow a leading comment and may span lines); whatever is left is the
 * example body.
 */
function splitImports(code: string): { imports: string[]; body: string } {
  const imports: string[] = []
  const body = code.replace(/^[ \t]*import\s[^;'"]*?from\s*['"][^'"]+['"];?[ \t]*$/gm, (m) => {
    imports.push(m.trim())
    return ''
  })
  return { imports, body: body.trim() }
}

/** An example that already declares a component (or exports) is module-level code and is used as written. */
const declaresComponent = (body: string): boolean =>
  /\bexport\s+(default\s+)?(function|const|class)\b/.test(body) ||
  /\bfunction\s+[A-Z]\w*\s*\(/.test(body) ||
  /\bconst\s+[A-Z]\w*\s*=\s*\(/.test(body)

/**
 * The example as a compilable module: its own imports plus the primitives the wrapper renders, then either the body
 * inside a component or, for an example that is already module-level, the body followed by a trivial component so the
 * file always has something to compile.
 */
function buildSource(pkg: string, apiNames: readonly string[], example: string): string {
  const { imports, body } = splitImports(example)
  // Names the example itself imports: what is inside the braces (or a default / namespace binding), NOT the module path —
  // `import type { X } from '@pyreon/kinetic'` does not import `kinetic`.
  const own = new Set<string>()
  for (const line of imports) {
    const m = /^import\s+(?:type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?(?:\*\s+as\s+([\w$]+))?\s*from/.exec(line)
    if (!m) continue
    if (m[1]) own.add(m[1])
    if (m[3]) own.add(m[3])
    for (const part of (m[2] ?? '').split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()
      if (name) own.add(name)
    }
  }
  // Value APIs of the package the example uses but did not import: import them, as a reader would.
  const wanted = apiNames.filter((n) => !own.has(n) && new RegExp(`\\b${n}\\b`).test(body))
  const head = [
    ...imports,
    ...(wanted.length ? [`import { ${wanted.join(', ')} } from '${pkg}'`] : []),
    `import { Stack, Text } from '@pyreon/primitives'`,
  ]
  const render = `return (<Stack><Text>ok</Text></Stack>)`
  if (declaresComponent(body)) return `${head.join('\n')}\n${body}\nexport function SweepHost() { ${render} }\n`
  const async = /\bawait\b/.test(body) ? 'async ' : ''
  return `${head.join('\n')}\nexport ${async}function SweepHost() {\n${body}\n${render}\n}\n`
}

const firstLine = (s: string | undefined): string | undefined => {
  if (!s) return undefined
  const line = s.split('\n').find((l) => /error:/.test(l)) ?? s.split('\n')[0]
  return line?.replace(/^.*\/Input\.\w+:/, '').slice(0, 220)
}

/**
 * The symbol a toolchain could not resolve, when that is what the error says. Swift: `cannot find 'x' in scope` /
 * `cannot find type 'X' in scope`; Kotlin: `unresolved reference 'x'`. A `value of type 'Any' has no member 'p'` is the
 * same incompleteness one step later (the source value was never declared, so it is `Any`).
 */
function unresolvedSymbol(error: string | undefined): string | 'any-member' | undefined {
  if (!error) return undefined
  const named = /cannot find (?:type )?'([^']+)' in scope|unresolved reference '([^']+)'/.exec(error)
  if (named) return named[1] ?? named[2]
  if (/value of type 'Any' has no member/.test(error)) return 'any-member'
  return undefined
}

function bucket(compiles: boolean, warnings: number, error: string | undefined, pyreonExports: ReadonlySet<string>): Bucket {
  if (compiles) return warnings === 0 ? 'clean' : 'warned-ok'
  if (warnings > 0) return 'warned-fail'
  const symbol = unresolvedSymbol(error)
  // Missing symbol that is NOT a Pyreon export: the example is a fragment, not a compiler gap.
  if (symbol !== undefined && (symbol === 'any-member' || !pyreonExports.has(symbol))) return 'incomplete'
  return 'SILENT-FAIL'
}

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  const jsonIdx = args.indexOf('--json')
  const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : undefined
  const listSilent = args.includes('--silent')
  const only = args.find((a) => a.startsWith('@pyreon/'))

  const { transform, FIRST_PARTY_VALIDATE_OPTIONS: validateOptions } = await import('./native-first-party-plugins')
  const { isSwiftcAvailable, isKotlincAvailable, validateSwiftWithStubs, validateKotlin } = await import(
    '../packages/native/compiler/src/validate'
  )
  if (!isSwiftcAvailable() || !isKotlincAvailable()) {
    console.error('native-example-sweep: swiftc and kotlinc are both required (a sweep that skips the compiles proves nothing).')
    return 2
  }

  const manifests = (await loadManifests()).filter((m) => !only || m.name === only)
  const pyreonExports = new Set<string>()
  for (const m of await loadManifests()) for (const a of m.api ?? []) for (const n of a.name.split(/[^\w$]+/)) if (n) pyreonExports.add(n)
  const records: Record_[] = []
  for (const m of manifests) {
    // An entry may document several exports at once (`nestValues / flattenValues`): each is a name the example may use.
    const apiNames = [...new Set((m.api ?? []).flatMap((a) => a.name.split(/[^\w$]+/)).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n)))]
    for (const entry of m.api ?? []) {
      if (!entry.example?.trim()) continue
      const source = buildSource(m.name, apiNames, entry.example)
      // A compiler THROW (a syntax error in the example as wrapped) is the compiler speaking loudly, so it counts as a
      // warned failure, never a silent one.
      const attempt = (target: 'swift' | 'kotlin') => {
        try {
          const r = transform(source, { target, filename: 'Example.tsx' })
          const v = (target === 'swift' ? validateSwiftWithStubs : validateKotlin)(r.code, validateOptions) as {
            ok: boolean
            error?: string
          }
          return { warnings: r.warnings?.length ?? 0, ok: v.ok, error: v.ok ? undefined : firstLine(v.error) }
        } catch (error) {
          return { warnings: 1, ok: false, error: `compiler rejected: ${(error instanceof Error ? error.message : String(error)).slice(0, 160)}` }
        }
      }
      const sv = attempt('swift')
      const kv = attempt('kotlin')
      records.push({
        pkg: m.name,
        api: entry.name,
        swift: bucket(sv.ok, sv.warnings, sv.error, pyreonExports),
        kotlin: bucket(kv.ok, kv.warnings, kv.error, pyreonExports),
        swiftWarnings: sv.warnings,
        kotlinWarnings: kv.warnings,
        ...(sv.error ? { swiftError: sv.error } : {}),
        ...(kv.error ? { kotlinError: kv.error } : {}),
        example: entry.example,
      })
    }
  }

  const tally = (target: 'swift' | 'kotlin') => {
    const t: Record<Bucket, number> = { clean: 0, 'warned-ok': 0, 'warned-fail': 0, incomplete: 0, 'SILENT-FAIL': 0 }
    for (const r of records) t[r[target]]++
    return t
  }
  const pad = (s: string | number, n: number) => String(s).padEnd(n)
  const ts = tally('swift')
  const tk = tally('kotlin')
  console.log(`native-example-sweep — ${records.length} documented examples across ${new Set(records.map((r) => r.pkg)).size} packages\n`)
  console.log(`${pad('', 12)}${pad('clean', 8)}${pad('warned-ok', 11)}${pad('warned-fail', 13)}${pad('incomplete', 12)}SILENT-FAIL`)
  console.log(`${pad('swift', 12)}${pad(ts.clean, 8)}${pad(ts['warned-ok'], 11)}${pad(ts['warned-fail'], 13)}${pad(ts.incomplete, 12)}${ts['SILENT-FAIL']}`)
  console.log(`${pad('kotlin', 12)}${pad(tk.clean, 8)}${pad(tk['warned-ok'], 11)}${pad(tk['warned-fail'], 13)}${pad(tk.incomplete, 12)}${tk['SILENT-FAIL']}`)

  const silent = records.filter((r) => r.swift === 'SILENT-FAIL' || r.kotlin === 'SILENT-FAIL')
  const byPkg = new Map<string, Record_[]>()
  for (const r of records) byPkg.set(r.pkg, [...(byPkg.get(r.pkg) ?? []), r])
  console.log(`\n${pad('package', 30)}${pad('n', 5)}${pad('clean(both)', 13)}${pad('silent', 8)}`)
  for (const [pkg, rs] of [...byPkg].sort((a, b) => b[1].filter(isSilent).length - a[1].filter(isSilent).length || a[0].localeCompare(b[0]))) {
    const clean = rs.filter((r) => r.swift === 'clean' && r.kotlin === 'clean').length
    console.log(`${pad(pkg, 30)}${pad(rs.length, 5)}${pad(clean, 13)}${rs.filter(isSilent).length}`)
  }

  if (listSilent || only) {
    console.log(`\n${only ? `non-clean examples of ${only}` : 'silent failures'}:`)
    const rows = only ? records.filter((r) => r.swift !== 'clean' || r.kotlin !== 'clean') : silent
    for (const r of rows) {
      console.log(`  ${r.pkg} :: ${r.api}   swift=${r.swift}${r.swiftError ? ` (${r.swiftError})` : ''}   kotlin=${r.kotlin}${r.kotlinError ? ` (${r.kotlinError})` : ''}`)
    }
  }
  console.log(`\n${silent.length} example(s) fail to compile on at least one target, naming a Pyreon export, without any warning.`)
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(records, null, 1))
  return 0
}

function isSilent(r: Record_): boolean {
  return r.swift === 'SILENT-FAIL' || r.kotlin === 'SILENT-FAIL'
}

process.exit(await main())
