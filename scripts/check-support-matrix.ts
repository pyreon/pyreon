#!/usr/bin/env bun
/**
 * check-support-matrix — the platforms Pyreon supports are stated once and
 * declared everywhere a tool reads them.
 *
 * The support matrix (Node.js, Bun, browsers, iOS, Android) is a promise on
 * the stability page and in SECURITY.md. A promise nothing checks drifts: 73
 * of 86 published packages declared no `engines` at all, the compiler
 * binaries still said Node 18, and `@pyreon/native-router-swift` declared
 * iOS 16 while the runtime it ships beside declared iOS 17. This gate holds
 * every machine-read copy to `SUPPORT_MATRIX`:
 *
 *   1. every published `@pyreon/*` package.json (the per-platform compiler
 *      binaries included) declares `engines.node` exactly `NODE_ENGINE`, so a
 *      new package cannot ship without it;
 *   2. every SwiftPM manifest under `packages/native/` declares the iOS and
 *      macOS floors;
 *   3. the `create-multiplatform` scaffold and the native examples use the
 *      same iOS deployment target and Android `minSdk`;
 *   4. the human-read copies (the stability page's "Support matrix" section
 *      and SECURITY.md) name the same versions.
 *
 * Bun and browsers have no field a package manager or bundler enforces for a
 * library, so they are held only by (4).
 *
 * Usage:
 *   bun scripts/check-support-matrix.ts          # verify
 *   bun scripts/check-support-matrix.ts --fix    # write engines.node
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// `import.meta.dirname`, not Bun's `import.meta.dir`: the unit tests import
// this under vitest, where only the standard spelling is defined.
const REPO_ROOT = resolve(import.meta.dirname, '..')

/** The one source of truth. Change a floor here, then run `--fix` and update the docs the gate names. */
export const SUPPORT_MATRIX = {
  node: 22,
  bun: '1.3',
  browsers: 'Baseline 2024',
  ios: 17,
  macos: 14,
  androidMinSdk: 26,
} as const

/** The `engines.node` range every published package declares. */
export const NODE_ENGINE = `>=${SUPPORT_MATRIX.node}`

export interface Finding {
  path: string
  detail: string
}

interface Manifest {
  name?: string
  private?: boolean
  engines?: Record<string, string>
}

/** Published `@pyreon/*` package.json paths: `packages/<category>/<pkg>` plus the compiler's per-platform binaries. */
export function publishedManifestPaths(root: string = REPO_ROOT): string[] {
  const out: string[] = []
  const dirs: string[] = []
  const packages = join(root, 'packages')
  for (const cat of readdirSync(packages)) {
    const catDir = join(packages, cat)
    if (!statSync(catDir).isDirectory()) continue
    for (const pkg of readdirSync(catDir)) dirs.push(join(catDir, pkg))
  }
  const binaries = join(packages, 'core', 'compiler', 'npm')
  if (existsSync(binaries)) {
    for (const triple of readdirSync(binaries)) dirs.push(join(binaries, triple))
  }
  for (const dir of dirs) {
    const f = join(dir, 'package.json')
    if (!existsSync(f)) continue
    const m = JSON.parse(readFileSync(f, 'utf8')) as Manifest
    if (m.private || !m.name?.startsWith('@pyreon/')) continue
    out.push(f)
  }
  return out.sort()
}

/** The finding for one published package.json, or null when `engines.node` is exactly `NODE_ENGINE`. */
export function engineFinding(path: string, text: string): Finding | null {
  const m = JSON.parse(text) as Manifest
  const node = m.engines?.node
  if (node === NODE_ENGINE) return null
  return {
    path,
    detail:
      node === undefined
        ? `${m.name} declares no engines.node (expected "${NODE_ENGINE}")`
        : `${m.name} declares engines.node "${node}" (expected "${NODE_ENGINE}")`,
  }
}

/**
 * `text` with `engines.node` set to `NODE_ENGINE`, keeping the rest of the
 * file byte for byte. An existing `engines` block has its `node` value
 * replaced (or gains one); otherwise a block is inserted before
 * `publishConfig` (else `pyreon`, else the last key).
 */
export function withNodeEngine(text: string): string {
  const block = /("engines"\s*:\s*\{)([^}]*)(\})/
  const found = block.exec(text)
  if (found) {
    const body = found[2] as string
    const nodeKey = /("node"\s*:\s*)"[^"]*"/
    const nextBody = nodeKey.test(body)
      ? body.replace(nodeKey, `$1"${NODE_ENGINE}"`)
      : body.trim() === ''
        ? `\n    "node": "${NODE_ENGINE}"\n  `
        : body.replace(/^(\s*)/, `$1"node": "${NODE_ENGINE}",$1`)
    return text.replace(block, `$1${nextBody}$3`)
  }
  const insert = `  "engines": {\n    "node": "${NODE_ENGINE}"\n  },\n`
  for (const key of ['publishConfig', 'pyreon']) {
    const at = text.search(new RegExp(`^  "${key}"\\s*:`, 'm'))
    if (at >= 0) return text.slice(0, at) + insert + text.slice(at)
  }
  // No anchor: append as the last key.
  const end = text.lastIndexOf('}')
  const head = text.slice(0, end).replace(/\s*$/, '')
  return `${head},\n${insert.replace(/,\n$/, '\n')}${text.slice(end)}`
}

/** The floors one native build file states, compared with the matrix. */
export function nativeFindings(path: string, text: string): Finding[] {
  const out: Finding[] = []
  const expect = (re: RegExp, want: string, what: string): void => {
    const all = [...text.matchAll(re)].map((m) => m[1] as string)
    if (all.length === 0) out.push({ path, detail: `no ${what} found (expected ${want})` })
    for (const got of all) {
      if (got !== want) out.push({ path, detail: `${what} is ${got} (expected ${want})` })
    }
  }
  if (path.endsWith('Package.swift')) {
    expect(/\.iOS\(\.v(\d+)\)/g, String(SUPPORT_MATRIX.ios), 'the SwiftPM iOS platform')
    expect(/\.macOS\(\.v(\d+)\)/g, String(SUPPORT_MATRIX.macos), 'the SwiftPM macOS platform')
  } else if (path.endsWith('.gradle.kts')) {
    expect(/\bminSdk\s*=\s*(\d+)/g, String(SUPPORT_MATRIX.androidMinSdk), 'minSdk')
  } else {
    // project.yml (XcodeGen) and the scaffold that writes one and a build.gradle.kts.
    expect(/\biOS:\s*'(\d+(?:\.\d+)*)'/g, `${SUPPORT_MATRIX.ios}.0`, 'the iOS deployment target')
    expect(
      /\bdeploymentTarget:\s*'(\d+(?:\.\d+)*)'/g,
      `${SUPPORT_MATRIX.ios}.0`,
      'the target deployment target',
    )
    if (path.endsWith('.ts')) {
      expect(/\bminSdk\s*=\s*(\d+)/g, String(SUPPORT_MATRIX.androidMinSdk), 'minSdk')
    }
  }
  return out
}

/** Native build files the matrix governs. */
export function nativeBuildFiles(root: string = REPO_ROOT): string[] {
  const out: string[] = []
  const native = join(root, 'packages', 'native')
  for (const pkg of readdirSync(native)) {
    const f = join(native, pkg, 'Package.swift')
    if (existsSync(f)) out.push(f)
  }
  out.push(join(root, 'packages', 'zero', 'create-multiplatform', 'src', 'scaffold.ts'))
  const examples = join(root, 'examples')
  for (const ex of readdirSync(examples)) {
    for (const rel of ['android/app/build.gradle.kts', 'ios/project.yml']) {
      const f = join(examples, ex, rel)
      if (existsSync(f)) out.push(f)
    }
  }
  return out
}

/** Strings each human-read copy of the matrix must contain. */
export function matrixPhrases(): string[] {
  const m = SUPPORT_MATRIX
  return [
    `Node.js ${m.node}`,
    `Bun ${m.bun}`,
    m.browsers,
    `iOS ${m.ios}`,
    `minSdk ${m.androidMinSdk}`,
  ]
}

/** Missing phrases in a document that states the matrix. */
export function docFindings(path: string, text: string | null): Finding[] {
  if (text === null) return [{ path, detail: 'file is missing' }]
  return matrixPhrases()
    .filter((p) => !text.includes(p))
    .map((p) => ({
      path,
      detail: `does not state "${p}" (the support matrix in scripts/check-support-matrix.ts)`,
    }))
}

/** The stability page's "Support matrix" section, or null when the page has none. */
export function supportSection(page: string): string | null {
  const m = /^## Support matrix\n([\s\S]*?)(?=^## )/m.exec(page)
  return m ? (m[1] as string) : null
}

function readOrNull(f: string): string | null {
  return existsSync(f) ? readFileSync(f, 'utf8') : null
}

export function runGate(
  root: string = REPO_ROOT,
  fix = false,
): { findings: Finding[]; packages: number } {
  const findings: Finding[] = []
  const manifests = publishedManifestPaths(root)
  for (const f of manifests) {
    const text = readFileSync(f, 'utf8')
    const finding = engineFinding(f, text)
    if (!finding) continue
    if (fix) {
      const next = withNodeEngine(text)
      if (engineFinding(f, next) === null) {
        writeFileSync(f, next)
        continue
      }
    }
    findings.push(finding)
  }
  for (const f of nativeBuildFiles(root)) {
    findings.push(...nativeFindings(f, readFileSync(f, 'utf8')))
  }
  const page = join(root, 'docs', 'src', 'content', 'docs', 'stability-and-direction.md')
  const pageText = readOrNull(page)
  const section = pageText === null ? null : supportSection(pageText)
  if (pageText !== null && section === null) {
    findings.push({ path: page, detail: 'has no "## Support matrix" section' })
  } else findings.push(...docFindings(page, section))
  findings.push(...docFindings(join(root, 'SECURITY.md'), readOrNull(join(root, 'SECURITY.md'))))
  return { findings, packages: manifests.length }
}

function main(argv: string[]): number {
  const { findings, packages } = runGate(REPO_ROOT, argv.includes('--fix'))
  // An empty scan is a broken gate, not a passing one.
  if (packages === 0) {
    console.error('[check-support-matrix] ✗ found 0 published packages; the gate is broken.')
    return 1
  }
  if (findings.length > 0) {
    console.error(`[check-support-matrix] ✗ ${findings.length} issue(s):`)
    for (const f of findings) console.error(`  ${relative(REPO_ROOT, f.path)} — ${f.detail}`)
    console.error('')
    console.error('The support matrix lives in scripts/check-support-matrix.ts (SUPPORT_MATRIX).')
    console.error(
      '`bun scripts/check-support-matrix.ts --fix` writes engines.node; native floors and docs are edited by hand.',
    )
    return 1
  }
  console.log(
    `[check-support-matrix] ✓ ${packages} published packages declare engines.node "${NODE_ENGINE}"; ` +
      'native floors and the documented matrix agree',
  )
  return 0
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
