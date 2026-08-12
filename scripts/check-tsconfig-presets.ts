/**
 * check-tsconfig-presets — drift guard for the @pyreon/tsconfig consolidation.
 *
 * Every package/example tsconfig.json must `extends` one of the internal
 * presets (packages/internals/tsconfig/*.json). Without this gate, new
 * packages copy a neighbour's pre-consolidation config and the 9-variant
 * drift the presets eliminated grows back file by file.
 *
 * Scope: packages/<category>/<pkg>/tsconfig.json + examples/<name>/tsconfig.json.
 * Never scanned: template trees shipped to users (create-zero/create-multiplatform
 * templates), nested tool configs (tsconfig.types-tests.json etc.), and the
 * presets package itself. Exemptions (with rationale) live in EXEMPT below.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** `<base>/<*>/<*>/tsconfig.json` (depth 2) or `<base>/<*>/tsconfig.json` (depth 1). */
function tsconfigsUnder(root: string, base: string, depth: 1 | 2): string[] {
  const out: string[] = []
  const baseDir = path.join(root, base)
  if (!existsSync(baseDir)) return out
  for (const a of readdirSync(baseDir, { withFileTypes: true })) {
    if (!a.isDirectory()) continue
    if (depth === 1) {
      const f = path.join(baseDir, a.name, 'tsconfig.json')
      if (existsSync(f)) out.push(path.relative(root, f))
    } else {
      for (const b of readdirSync(path.join(baseDir, a.name), { withFileTypes: true })) {
        if (!b.isDirectory()) continue
        const f = path.join(baseDir, a.name, b.name, 'tsconfig.json')
        if (existsSync(f)) out.push(path.relative(root, f))
      }
    }
  }
  return out
}

/** Path → rationale. Keep this list SHORT — an entry means "deliberately not on presets". */
export const EXEMPT: Record<string, string> = {
  // (none today — add "path/to/tsconfig.json": "why" with a PR-reviewed rationale)
}

// Bare workspace specifier ONLY — packages declare `@pyreon/tsconfig` as a
// devDependency (bun links it), so `extends` is depth-independent and the
// dependency graph is honest. Relative `../../internals/...` forms are
// rejected: two spellings for one thing is how drift starts.
const PRESET_RE = /^@pyreon\/tsconfig\/(base|lib|lib-jsx|internal|example|example-bun)\.json$/

export interface Finding {
  file: string
  problem: string
}

/**
 * Strip JSONC comments, honouring string context.
 *
 * The regex pair this replaces (`/\/\*[\s\S]*?\*\//g` then `/^\s*\/\/.*$/gm`)
 * could not tell a comment from a `/*` that merely APPEARS inside a string or
 * inside another comment — and both are ordinary in a tsconfig. A comment
 * mentioning `@pyreon/*` opened a block comment that the very next
 * `"${configDir}/**` + `/lib/**"` closed, silently deleting every option
 * between them. Here that swallowed `incremental` and `tsBuildInfoFile` and
 * reported the file as unparseable, which at least failed loudly — but the same
 * bug can just as easily yield JSON that still parses and is missing options.
 *
 * Same lesson as the styler `insertGlobal` splitter: a hand-rolled scanner over
 * a language with quoting must model the quoting before trusting its
 * delimiters. So this walks the text once and only treats `//` and `/*` as
 * comment openers when it is not inside a string.
 */
export function stripJsonComments(source: string): string {
  let out = ''
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!
    if (c === '"') {
      // Copy the whole string literal verbatim, backslash escapes included.
      out += c
      for (i++; i < source.length; i++) {
        out += source[i]
        if (source[i] === '\\') {
          out += source[++i] ?? ''
          continue
        }
        if (source[i] === '"') break
      }
      continue
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++
      out += '\n'
      continue
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 1
      continue
    }
    out += c
  }
  return out
}

/**
 * Read a file, or undefined when it is absent.
 *
 * Absent and corrupt are different answers. The synthetic trees the unit tests
 * build legitimately have no preset package, and reporting those as
 * "unparseable" would have been a wrong diagnosis for a file that simply is not
 * there.
 */
function readIfPresent(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Is the incremental cache path one git ignores?
 *
 * `${configDir}` resolves to the directory of the tsconfig that ends up
 * consuming the preset, so the path is resolved against a REAL package before
 * asking git — a check against a made-up directory would answer about a
 * .gitignore rule that may not apply where the file actually lands.
 *
 * Returns a problem string, or undefined when the path is safely ignored.
 */
export function buildInfoIgnoreProblem(root: string, tsBuildInfoFile?: string): string | undefined {
  if (!tsBuildInfoFile) {
    return 'incremental is on but no tsBuildInfoFile is set — TypeScript would write .tsbuildinfo next to the config, where git tracks it'
  }
  if (!tsBuildInfoFile.includes('${configDir}')) {
    return `tsBuildInfoFile (${JSON.stringify(tsBuildInfoFile)}) is not per-package — every package would write to the SAME file and invalidate each other's cache on every run`
  }
  // Any real package works; the rule under test is repo-wide.
  const sample = path.join(root, 'packages/core/core')
  if (!existsSync(sample)) return undefined
  const resolved = path.resolve(tsBuildInfoFile.replace('${configDir}', sample))
  const r = spawnSync('git', ['check-ignore', '-q', '--', resolved], { cwd: root })
  // 0 = ignored, 1 = NOT ignored, anything else = git could not answer (no
  // repo, no git). Only a definite "not ignored" is a finding: a gate that
  // fails because git is unavailable would be reporting on its own environment.
  if (r.status === 1) {
    return `incremental is on and tsBuildInfoFile resolves to ${path.relative(root, resolved)}, which git does NOT ignore — one cache file per package would show up in git status`
  }
  return undefined
}

export function checkTsconfigPresets(root: string): Finding[] {
  const findings: Finding[] = []
  const files = [
    ...tsconfigsUnder(root, 'packages', 2),
    ...tsconfigsUnder(root, 'examples', 1),
  ].filter(
    (f) =>
      !f.includes('/templates/') &&
      f !== 'packages/internals/tsconfig/tsconfig.json',
  )

  for (const rel of files) {
    if (EXEMPT[rel]) continue
    let json: { extends?: string }
    try {
      json = JSON.parse(stripJsonComments(readFileSync(path.join(root, rel), 'utf8')))
    } catch {
      findings.push({ file: rel, problem: 'unparseable JSON(C)' })
      continue
    }
    if (typeof json.extends !== 'string' || !PRESET_RE.test(json.extends)) {
      findings.push({
        file: rel,
        problem: `must extend an @pyreon/tsconfig preset (packages/internals/tsconfig/*.json); got ${JSON.stringify(json.extends ?? null)}`,
      })
    }
  }

  // The incremental cache must stay somewhere git already ignores.
  //
  // `base.json` turns on `incremental`, which writes a ~74 KB `tsbuildinfo` per
  // package — 115 of them across this workspace. Pointed anywhere git tracks,
  // they become clutter in every `git status` and, sooner or later, a committed
  // cache.
  //
  // This asks GIT whether the resolved path is ignored, rather than matching the
  // path against a spelling. A spelling check answers a proxy question and goes
  // stale the moment the location moves — which it already did once, from
  // `node_modules/` to `.cache/`. The property that matters is "git ignores it",
  // so that is what gets asked.
  const basePath = 'packages/internals/tsconfig/base.json'
  const baseSource = readIfPresent(path.join(root, basePath))
  if (baseSource !== undefined) {
    let base: { compilerOptions?: { incremental?: boolean; tsBuildInfoFile?: string } } | undefined
    try {
      base = JSON.parse(stripJsonComments(baseSource))
    } catch {
      findings.push({ file: basePath, problem: 'unparseable' })
    }
    const opts = base?.compilerOptions ?? {}
    if (opts.incremental) {
      const problem = buildInfoIgnoreProblem(root, opts.tsBuildInfoFile)
      if (problem) findings.push({ file: basePath, problem })
    }
  }

  // Root tsconfig must point at base.json — the canon lives in the package.
  try {
    const rootCfg = JSON.parse(
      stripJsonComments(readFileSync(path.join(root, 'tsconfig.json'), 'utf8')),
    ) as { extends?: string }
    if (rootCfg.extends !== '@pyreon/tsconfig/base.json') {
      findings.push({
        file: 'tsconfig.json',
        problem: 'root must extend @pyreon/tsconfig/base.json',
      })
    }
  } catch {
    findings.push({ file: 'tsconfig.json', problem: 'unparseable' })
  }

  return findings
}

if (import.meta.main) {
  const findings = checkTsconfigPresets(ROOT)
  if (findings.length > 0) {
    console.error(`✗ ${findings.length} tsconfig(s) off the shared presets:`)
    for (const f of findings) console.error(`  ${f.file} — ${f.problem}`)
    console.error(
      '\nExtend a preset from packages/internals/tsconfig/ (see its README) and put only genuine per-package deviations in the local file. Deliberate opt-outs go in EXEMPT with a rationale.',
    )
    process.exit(1)
  }
  console.log('✓ All package/example tsconfigs extend the shared @pyreon/tsconfig presets.')
}
