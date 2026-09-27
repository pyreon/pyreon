#!/usr/bin/env bun
/**
 * Published declarations must be consumable, strictly, out of the box.
 *
 * Two checks over every published package's built `lib/`:
 *
 * 1. DECLARED IMPORTS — every package a `.d.ts` imports must be one the package
 *    declares (dependency or peer).
 * 2. STRICT COMPILE — every declared `types` entry compiles with
 *    `skipLibCheck: false` under `strict`.
 *
 * Both failures are invisible to a normal consumer, which is the point. The
 * `@pyreon/typescript` preset (like most) sets `skipLibCheck: true`, and under it
 * an unresolvable import or an invalid declaration is not reported — the type
 * just becomes `any`. Found this way: `s.string().iso.date()` returned `any`
 * (polymorphic `this` emitted inside an object type literal, TS2526), and every
 * `@pyreon/elements` props type violated `ComponentFn`'s bound once emitted.
 *
 * Check 1 in detail:
 *
 * The declaration emitter writes whatever module a type came from, and an
 * inferred type often comes from a DEPENDENCY'S dependency: `@pyreon/feature`'s
 * `featureTableFeatures` was emitted as `import("@tanstack/table-core")…`, a
 * package only `@pyreon/table` declares. Inside this workspace it resolved, so
 * every local check was green. In a consumer's install it does not — pnpm and
 * bun's isolated layout never expose a transitive dependency — and TypeScript
 * does not report an unresolvable import in a `.d.ts` under the default
 * `skipLibCheck: true` (which `@pyreon/typescript` ships). The type silently
 * becomes `any`. A consumer loses strict typing and nothing says so.
 *
 * The fix is always one of: declare the package, or annotate the export with a
 * type the package re-exports. This gate finds the cases.
 *
 * Reads built `lib/` — run after `bun scripts/bootstrap.ts`.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { builtinModules } from 'node:module'
import { join, relative } from 'node:path'

const BUILTINS = new Set(builtinModules)

/** Remove comments so prose like `…from 'no config'` is not read as an import. */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Package name of a bare specifier, or null for relative / builtin ones. */
export function packageOf(spec: string): string | null {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) return null
  const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!
  return BUILTINS.has(name) ? null : name
}

/** Every package a declaration file imports: `import … from`, `export … from`, `import("…")`, `import "…"`. */
export function declarationImports(src: string): Set<string> {
  const out = new Set<string>()
  const code = stripComments(src)
  const patterns = [
    /^\s*(?:import|export)\b[^'"\n;]*?\bfrom\s*["']([^"']+)["']/gm,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /^\s*import\s+["']([^"']+)["']/gm,
  ]
  for (const re of patterns) {
    for (const m of code.matchAll(re)) {
      const name = packageOf(m[1]!)
      if (name) out.add(name)
    }
  }
  return out
}

interface Manifest {
  name: string
  private?: boolean
  types?: string
  exports?: Record<string, unknown> | string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

/** Every declaration file a package's manifest names as a `types` entry. */
export function typesEntries(pkg: Manifest): string[] {
  const out = new Set<string>()
  const add = (v: unknown) => {
    if (typeof v === 'string' && /\.d\.[cm]?ts$/.test(v)) out.add(v)
  }
  add(pkg.types)
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    for (const [key, value] of Object.entries(node)) {
      if (key === 'types') add(value)
      else walk(value)
    }
  }
  if (pkg.exports && typeof pkg.exports === 'object') walk(pkg.exports)
  return [...out].sort()
}

/** Imported packages that are neither the package itself nor a dependency / peer. */
export function undeclaredImports(pkg: Manifest, imported: Iterable<string>): string[] {
  const declared = new Set([
    pkg.name,
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ])
  return [...imported].filter((n) => !declared.has(n)).sort()
}

function declarationFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return declarationFiles(p)
    return /\.d\.[cm]?ts$/.test(p) ? [p] : []
  })
}

function main(): void {
  // Real path: on macOS `/tmp` is a symlink, and a declaration reached under two
  // spellings is loaded twice (core's global JSX types then collide).
  const root = realpathSync(new URL('..', import.meta.url).pathname)
  const findings: string[] = []
  const entries: string[] = []
  let scanned = 0
  let missingLib = 0
  for (const cat of readdirSync(join(root, 'packages'))) {
    const catDir = join(root, 'packages', cat)
    if (!statSync(catDir).isDirectory()) continue
    for (const name of readdirSync(catDir)) {
      const dir = join(catDir, name)
      const manifestPath = join(dir, 'package.json')
      if (!existsSync(manifestPath)) continue
      const pkg = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
      if (pkg.private) continue
      const lib = join(dir, 'lib')
      if (!existsSync(lib)) {
        missingLib++
        continue
      }
      const files = declarationFiles(lib)
      if (files.length === 0) continue
      scanned++
      for (const e of typesEntries(pkg)) {
        const abs = join(dir, e)
        if (existsSync(abs)) entries.push(abs)
      }
      const firstSeen = new Map<string, string>()
      for (const f of files) {
        for (const n of declarationImports(readFileSync(f, 'utf8'))) {
          if (!firstSeen.has(n)) firstSeen.set(n, relative(root, f))
        }
      }
      for (const n of undeclaredImports(pkg, firstSeen.keys())) {
        findings.push(`  ${pkg.name}: imports "${n}" (${firstSeen.get(n)}) but does not declare it`)
      }
    }
  }

  if (scanned === 0) {
    console.error('[check-declarations] ✗ no built declarations found — run `bun scripts/bootstrap.ts` first.')
    process.exit(1)
  }
  if (missingLib > 0) {
    console.warn(`[check-declarations] ${missingLib} published package(s) have no lib/ — not checked.`)
  }
  if (findings.length > 0) {
    console.error(`[check-declarations] ✗ ${findings.length} declaration import(s) name an undeclared package:`)
    for (const f of findings) console.error(f)
    console.error(
      '\nA consumer cannot resolve these, and under the default skipLibCheck the type silently becomes `any`.\n' +
        'Fix: add the package to dependencies (or peerDependencies), or annotate the export with a type\n' +
        'a declared dependency re-exports.',
    )
    process.exit(1)
  }
  console.log(`[check-declarations] ✓ ${scanned} package(s): every declaration import is declared.`)

  const strict = strictCompile(root, entries)
  if (!strict.ok) {
    console.error(`[check-declarations] ✗ published declarations do not compile with skipLibCheck: false:\n`)
    console.error(strict.output)
    console.error(
      'Under the default skipLibCheck these errors are silent and the affected type becomes `any`.\n' +
        'Fix the SOURCE so the emitted declaration is valid (usually: give an inferred export a named type).',
    )
    process.exit(1)
  }
  console.log(`[check-declarations] ✓ ${entries.length} entry declaration(s) compile strictly.`)
}

/** Compile the given declaration entries the way a strict consumer would. */
function strictCompile(root: string, entries: string[]): { ok: boolean; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-check-declarations-'))
  try {
    const config = join(dir, 'tsconfig.json')
    writeFileSync(
      config,
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          module: 'ESNext',
          moduleResolution: 'bundler',
          target: 'ES2022',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          jsx: 'preserve',
          jsxImportSource: '@pyreon/core',
          types: [],
        },
        files: entries,
      }),
    )
    const tsc = join(root, 'node_modules', '.bin', 'tsc')
    const r = spawnSync(tsc, ['-p', config], { cwd: root, encoding: 'utf8' })
    return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}`.replaceAll(`${root}/`, '') }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

if (import.meta.main) main()
