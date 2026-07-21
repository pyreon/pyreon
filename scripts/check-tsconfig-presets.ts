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

const PRESET_RE = /^(\.\.\/)+((packages\/)?internals\/tsconfig)\/(base|lib|lib-jsx|internal|example|example-bun)\.json$/

export interface Finding {
  file: string
  problem: string
}

const stripJsonComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

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

  // Root tsconfig must point at base.json — the canon lives in the package.
  try {
    const rootCfg = JSON.parse(
      stripJsonComments(readFileSync(path.join(root, 'tsconfig.json'), 'utf8')),
    ) as { extends?: string }
    if (rootCfg.extends !== './packages/internals/tsconfig/base.json') {
      findings.push({
        file: 'tsconfig.json',
        problem: 'root must extend ./packages/internals/tsconfig/base.json',
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
