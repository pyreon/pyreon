/**
 * Gate: the npm tarballs of the source-shipping native runtimes must be
 * CONSUMABLE as published, not just as checked out.
 *
 * WHY THIS EXISTS (issue #3787). `@pyreon/native-runtime-swift` and
 * `@pyreon/native-router-swift` shipped a `Package.swift` declaring
 * `.testTarget(...)` while their `files` list omitted `Tests`. SwiftPM then
 * resolves the missing test directory to the production sources and aborts with
 * `target 'PyreonRuntimeTests' has overlapping sources` — so every consumer's
 * Xcode package resolution failed before a line of app code compiled. Every
 * in-repo check read the SOURCE checkout, where `Tests/` exists, so nothing
 * could see it. The same shape is possible for the Kotlin runtimes: the app's
 * Gradle `srcDir` points at a directory the tarball may not contain.
 *
 * Two layers:
 *   1. STRUCTURAL (always on, ~1s, needs only npm): ask `npm pack --dry-run`
 *      for the REAL file list (so `files`, `.npmignore` and npm's own
 *      always-include rules are all honoured) and require every target
 *      directory a `Package.swift` declares — and the Kotlin source dir —
 *      to be present in it.
 *   2. REAL (needs `swift`): pack for real, unpack, run
 *      `swift package describe` against the unpacked tarball — the exact
 *      operation a consumer's SwiftPM performs. Skips LOUDLY when swift is
 *      absent; `PYREON_REQUIRE_NATIVE_VALIDATE=1` turns that skip into a failure.
 *
 * Layer 1 is the cheap net that runs in `validate-fast`; layer 2 is what
 * proves the diagnosis and is wired into the native-validate workflow.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const REPO = resolve(new URL('..', import.meta.url).pathname)
const NATIVE = join(REPO, 'packages', 'native')

export interface SwiftTarget {
  kind: 'target' | 'testTarget' | 'executableTarget' | 'binaryTarget' | 'systemLibrary' | 'plugin'
  name: string
  /** Explicit `path:` argument, if any. */
  path?: string
}

/**
 * Extract the targets a `Package.swift` declares. Deliberately a lexical scan
 * (a manifest is Swift, not data) scoped to the `targets: [` array, with
 * comments blanked first so a commented-out target never counts.
 */
export function parseSwiftTargets(manifest: string): SwiftTarget[] {
  const src = manifest.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const out: SwiftTarget[] = []
  const re = /\.(target|testTarget|executableTarget|binaryTarget|systemLibrary|plugin)\s*\(/g
  for (let m = re.exec(src); m; m = re.exec(src)) {
    // Balanced-paren body of this call.
    let depth = 1
    let i = m.index + m[0].length
    const start = i
    while (i < src.length && depth > 0) {
      const c = src[i]
      if (c === '(') depth++
      else if (c === ')') depth--
      i++
    }
    const body = src.slice(start, i - 1)
    const name = /name\s*:\s*"([^"]+)"/.exec(body)?.[1]
    if (!name) continue
    const path = /(?:^|[\s,])path\s*:\s*"([^"]+)"/.exec(body)?.[1]
    out.push({ kind: m[1] as SwiftTarget['kind'], name, ...(path ? { path } : {}) })
  }
  return out
}

/** Directory SwiftPM looks in for a target (its documented defaults). */
export function swiftTargetDir(t: SwiftTarget): string | null {
  if (t.path) return t.path.replace(/^\.\//, '').replace(/\/$/, '')
  if (t.kind === 'target' || t.kind === 'executableTarget') return `Sources/${t.name}`
  if (t.kind === 'testTarget') return `Tests/${t.name}`
  return null // binary/system/plugin targets are out of scope here
}

/** Problems for one Swift package given the files its tarball would contain. */
export function swiftTarballProblems(pkg: string, manifest: string, tarFiles: string[]): string[] {
  const problems: string[] = []
  for (const t of parseSwiftTargets(manifest)) {
    const dir = swiftTargetDir(t)
    if (!dir) continue
    if (!tarFiles.some((f) => f.startsWith(`${dir}/`) && f.endsWith('.swift'))) {
      problems.push(
        `${pkg}: Package.swift declares .${t.kind}("${t.name}") but the tarball has no .swift file under ${dir}/ — ` +
          `SwiftPM reports "overlapping sources" and consumer package resolution fails. ` +
          `Add "${dir.split('/')[0]}" to package.json "files".`,
      )
    }
  }
  return problems
}

/** Problems for one Kotlin package: its declared source dir must be shipped. */
export function kotlinTarballProblems(pkg: string, dir: string, sdkOnly: string[], tarFiles: string[]): string[] {
  const problems: string[] = []
  const under = tarFiles.filter((f) => f.startsWith(`${dir}/`) && f.endsWith('.kt'))
  if (under.length === 0) {
    problems.push(
      `${pkg}: pyreon.native.kotlin.dir is "${dir}" but the tarball has no .kt file under it — ` +
        `a consumer's Gradle srcDir would point at nothing. Add its top-level folder to package.json "files".`,
    )
  }
  for (const f of sdkOnly) {
    if (!under.some((u) => u.endsWith(`/${f}`))) {
      problems.push(`${pkg}: kotlinSdkOnly entry ${f} is not in the tarball under ${dir}/.`)
    }
  }
  return problems
}

function run(cmd: string[], cwd: string): { code: number; out: string; err: string } {
  const [bin, ...args] = cmd
  const r = spawnSync(bin as string, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return { code: r.status ?? 1, out: r.stdout ?? '', err: r.stderr ?? '' }
}

interface Pkg {
  name: string
  dir: string
  hasSwift: boolean
  kotlin?: { dir: string; sdkOnly: string[] }
}

export function discoverNativePackages(): Pkg[] {
  const pkgs: Pkg[] = []
  for (const d of readdirSync(NATIVE, { withFileTypes: true })) {
    if (!d.isDirectory()) continue
    const dir = join(NATIVE, d.name)
    const pj = join(dir, 'package.json')
    if (!existsSync(pj)) continue
    const json = JSON.parse(readFileSync(pj, 'utf-8'))
    if (json.private) continue
    const hasSwift = existsSync(join(dir, 'Package.swift'))
    const k = json.pyreon?.native?.kotlin
    if (!hasSwift && !k) continue
    pkgs.push({
      name: json.name,
      dir,
      hasSwift,
      ...(k?.dir ? { kotlin: { dir: k.dir, sdkOnly: k.kotlinSdkOnly ?? [] } } : {}),
    })
  }
  return pkgs
}

function main(): number {
  const failures: string[] = []
  const pkgs = discoverNativePackages()
  if (pkgs.length === 0) {
    console.error('✗ check-native-tarballs: no native source-shipping packages found — gate is blind')
    return 1
  }
  const haveSwift = run(['swift', '--version'], REPO).code === 0
  const requireAll = process.env.PYREON_REQUIRE_NATIVE_VALIDATE === '1'
  let described = 0

  for (const p of pkgs) {
    const dry = run(['npm', 'pack', '--dry-run', '--json', '--ignore-scripts'], p.dir)
    if (dry.code !== 0) {
      failures.push(`${p.name}: npm pack --dry-run failed: ${dry.err.trim().split('\n').slice(-1)[0]}`)
      continue
    }
    const files: string[] = JSON.parse(dry.out)[0].files.map((f: { path: string }) => f.path)
    if (p.hasSwift) {
      failures.push(...swiftTarballProblems(p.name, readFileSync(join(p.dir, 'Package.swift'), 'utf-8'), files))
    }
    if (p.kotlin) failures.push(...kotlinTarballProblems(p.name, p.kotlin.dir, p.kotlin.sdkOnly, files))
    console.log(`  ${failures.length === 0 ? '✓' : '·'} ${p.name}: ${files.length} files in tarball (structural)`)

    if (p.hasSwift && haveSwift) {
      const tmp = mkdtempSync(join(tmpdir(), 'pyreon-tarball-'))
      try {
        const pack = run(['npm', 'pack', '--json', '--ignore-scripts', '--pack-destination', tmp], p.dir)
        if (pack.code !== 0) {
          failures.push(`${p.name}: npm pack failed: ${pack.err.trim()}`)
          continue
        }
        const tgz = join(tmp, JSON.parse(pack.out)[0].filename)
        const untar = run(['tar', 'xzf', tgz, '-C', tmp], tmp)
        if (untar.code !== 0) {
          failures.push(`${p.name}: could not unpack tarball: ${untar.err.trim()}`)
          continue
        }
        const d = run(['swift', 'package', 'describe', '--package-path', join(tmp, 'package'), '--type', 'json'], tmp)
        described++
        if (d.code !== 0) {
          failures.push(
            `${p.name}: \`swift package describe\` FAILED against the unpacked tarball (what a consumer's SwiftPM does):\n    ${(d.err || d.out).trim().split('\n')[0]?.slice(0, 300)}`,
          )
        } else console.log(`  ✓ ${p.name}: swift package describe OK on the real tarball`)
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    }
  }

  if (!haveSwift) {
    const msg = 'swift not on PATH — SKIPPED the real `swift package describe` layer (structural layer still ran)'
    if (requireAll) failures.push(`${msg}; PYREON_REQUIRE_NATIVE_VALIDATE=1 forbids skipping`)
    else console.warn(`⚠ check-native-tarballs: ${msg}`)
  } else if (described === 0 && pkgs.some((p) => p.hasSwift)) {
    failures.push('swift present but no tarball was described — gate measured nothing')
  }

  if (failures.length > 0) {
    console.error(`\n✗ check-native-tarballs: ${failures.length} problem(s):`)
    for (const f of failures) console.error(`  • ${f}`)
    return 1
  }
  console.log(`✓ check-native-tarballs: ${pkgs.length} native package tarball(s) consumable`)
  return 0
}

if (import.meta.main) process.exit(main())
