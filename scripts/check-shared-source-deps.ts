#!/usr/bin/env bun
/**
 * check-shared-source-deps — a TRI-TARGET shared source must be buildable
 * for the WEB target too, not just the two native ones.
 *
 * ## The bug class
 *
 * PMTC's whole claim is ONE source, THREE targets. The examples encode that
 * literally: `examples/native-router-demo-web/src/entry-client.tsx` imports
 * `RouterApp` from `../../native-router-demo-ios/src/RouterApp`, and the two
 * native siblings compile the SAME file through the native CLI.
 *
 * The three targets do not consume it the same way, and that asymmetry is the
 * trap. The native builds run the file through PMTC, which resolves the
 * canonical tags itself and never reads `node_modules` — so a native build
 * stays green no matter what the source imports. The WEB build BUNDLES it, so
 * every bare `@pyreon/*` import must be a declared dependency of the web
 * example. Nothing kept those two facts in sync.
 *
 * The failure mode is therefore: add a primitive to the shared source, prove
 * it on a simulator and an emulator, and ship a repo where the web build is
 * broken. That is not hypothetical — it is exactly how
 * `@pyreon/elements` + `@pyreon/coolgrid` landed in the router demo, and the
 * only thing that noticed was a Playwright job ~50 minutes into CI, reporting
 * a blank page rather than the missing dependency.
 *
 * A CI e2e catching it is not good enough: the signal arrives late, and it
 * arrives as "home route did not render" rather than "you forgot a dep".
 *
 * ## How it works
 *
 * For every `examples/*-web` package whose entry imports a shared source out
 * of a sibling example:
 *
 *  1. Resolve the shared source file the entry points at.
 *  2. Collect its bare `@pyreon/*` imports (static + `export … from`).
 *  3. Assert each one is declared in the WEB package's dependencies or
 *     devDependencies.
 *
 * Static, so it costs milliseconds and belongs in `validate-fast` — the point
 * is to fail on the machine that made the change, before the push.
 *
 * ## What it deliberately does NOT do
 *
 * It does not run the web build. A build would also catch RUNTIME divergence
 * (a component that resolves but renders differently on web), which this
 * cannot see — that remains the web e2e's job. This gate closes the specific,
 * fully-static hole that produced a 50-minute feedback loop for a one-line
 * fix.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// `import.meta.url` rather than Bun's `import.meta.dir`: the pure helpers below
// are imported by a vitest suite, where `import.meta.dir` is undefined and the
// path resolution would throw at module load.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EXAMPLES = join(REPO_ROOT, 'examples')

type Finding = {
  webPackage: string
  sharedSource: string
  missing: string[]
}

/** Every bare `@pyreon/*` specifier imported (or re-exported) by a file. */
export function pyreonImports(source: string): string[] {
  const found = new Set<string>()
  // `import … from '@pyreon/x'`, `export … from '@pyreon/x'`, `import '@pyreon/x'`
  const re = /(?:from|import)\s*['"](@pyreon\/[a-z0-9-]+)['"]/g
  for (const m of source.matchAll(re)) found.add(m[1]!)
  return [...found].sort()
}

/**
 * The shared source a web entry points at, if any. Matches a relative import
 * that escapes this example (`../../<other-example>/src/<Name>`) — the literal
 * shape the tri-target examples use.
 */
export function sharedSourceOf(entryFile: string): string | null {
  const src = readFileSync(entryFile, 'utf8')
  const m = src.match(/from\s*['"](\.\.\/\.\.\/[^'"]+)['"]/)
  if (!m) return null
  const base = resolve(dirname(entryFile), m[1]!)
  for (const ext of ['.tsx', '.ts']) {
    if (existsSync(base + ext)) return base + ext
  }
  return null
}

function declaredDeps(pkgJsonPath: string): Set<string> {
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ])
}

function main(): number {
  const findings: Finding[] = []
  let checked = 0

  for (const dir of readdirSync(EXAMPLES)) {
    if (!dir.endsWith('-web')) continue
    const webDir = join(EXAMPLES, dir)
    const pkgJson = join(webDir, 'package.json')
    const srcDir = join(webDir, 'src')
    if (!existsSync(pkgJson) || !existsSync(srcDir)) continue

    for (const entry of readdirSync(srcDir)) {
      if (!/\.tsx?$/.test(entry)) continue
      const shared = sharedSourceOf(join(srcDir, entry))
      if (shared === null) continue

      checked += 1
      const declared = declaredDeps(pkgJson)
      const missing = pyreonImports(readFileSync(shared, 'utf8')).filter(
        (spec) => !declared.has(spec),
      )
      if (missing.length > 0) {
        findings.push({
          webPackage: `examples/${dir}`,
          sharedSource: shared.replace(`${REPO_ROOT}/`, ''),
          missing,
        })
      }
    }
  }

  // An empty scan is a SKIP masquerading as a pass — the repo HAS tri-target
  // examples, so finding none means the detection broke (a renamed directory,
  // a changed entry shape), not that everything is clean.
  if (checked === 0) {
    console.error(
      '✗ check-shared-source-deps: found NO tri-target web example to check.\n' +
        '  The repo has web examples that import a shared source from a native\n' +
        '  sibling; if that is still true, this gate stopped detecting them and\n' +
        '  is silently protecting nothing. Fix the detection in\n' +
        '  scripts/check-shared-source-deps.ts.',
    )
    return 1
  }

  if (findings.length === 0) {
    console.log(
      `✓ check-shared-source-deps: ${checked} tri-target shared source(s); every @pyreon/* import is declared by its web example`,
    )
    return 0
  }

  console.error('✗ check-shared-source-deps: shared source imports a package its WEB example does not declare\n')
  for (const f of findings) {
    console.error(`  ${f.sharedSource}`)
    console.error(`    is bundled by ${f.webPackage}, which is missing:`)
    for (const m of f.missing) console.error(`      ${m}`)
    console.error(
      `    fix: add ${f.missing
        .map((m) => `"${m}": "workspace:*"`)
        .join(', ')} to ${f.webPackage}/package.json dependencies, then \`bun install\` and commit bun.lock\n`,
    )
  }
  console.error(
    'Why this is a gate: the two NATIVE targets compile the shared source through\n' +
      'PMTC and never read node_modules, so they stay green while the WEB build —\n' +
      'which bundles it — cannot resolve the import. Proving a change on a simulator\n' +
      'and an emulator says nothing about the third target.',
  )
  return 1
}

// Only run as a bin — importing this module (the unit tests do) must not
// exit the process.
if (import.meta.main) process.exit(main())

export { main as checkSharedSourceDeps }
