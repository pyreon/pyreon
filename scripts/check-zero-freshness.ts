#!/usr/bin/env bun
/**
 * A7 — scheduled freshness check for what `@pyreon/zero` makes users deploy.
 *
 * Two kinds of rot land with no commit in this repo, so no PR gate sees them:
 *
 *   1. A runtime reaches END OF LIFE. `vercelAdapter` shipped `nodejs20.x`
 *      as its default until after Node 20's EOL. This scans every runtime
 *      the adapters emit and every Node version the scaffold templates pin
 *      (Dockerfile `FROM node:N`, `.nvmrc`, `engines.node`) against
 *      `scripts/runtime-eol.json`: past EOL fails, within
 *      `WARN_DAYS` warns, and a runtime missing from the table fails.
 *   2. A dependency pin STOPS INSTALLING. `@supabase/supabase-js@^2.49.0`
 *      resolved to a release whose own dependency was never published, and
 *      every fresh scaffold failed `bun install`. This builds the scaffolder's
 *      REAL generated package.json for every template × feature ×
 *      integration × compat mode, takes the union of third-party pins, and
 *      resolves the full tree with `bun install --lockfile-only` (no
 *      tarballs, no scripts) — a missing transitive version fails.
 *
 *   bun scripts/check-zero-freshness.ts [--skip-install]
 *
 * Runs weekly from `.github/workflows/zero-freshness.yml`, not per PR: its
 * verdict depends on the date and the npm registry, not on the diff.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Resolved lazily so importing the pure helpers (tests) never touches the URL. */
const root = (): string => fileURLToPath(new URL('..', import.meta.url))
const WARN_DAYS = 90

interface EolTable {
  runtimes: Record<string, string>
  node: Record<string, string>
}

export interface Finding {
  level: 'error' | 'warn'
  where: string
  message: string
}

/** Classify one `(id, eolDate)` against `today`. */
export function eolFinding(
  where: string,
  label: string,
  eolDate: string | undefined,
  today: Date,
): Finding | null {
  if (eolDate === undefined) {
    return { level: 'error', where, message: `${label} is not in scripts/runtime-eol.json — add its EOL date` }
  }
  const days = Math.floor((new Date(eolDate).getTime() - today.getTime()) / 86_400_000)
  if (days <= 0) return { level: 'error', where, message: `${label} reached end of life on ${eolDate}` }
  if (days <= WARN_DAYS) return { level: 'warn', where, message: `${label} reaches end of life in ${days} days (${eolDate})` }
  return null
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath ?? dir, e.name))
    .filter((p) => !p.includes('node_modules'))
}

/** Runtime / Node-version references in adapter sources and scaffold templates. */
export function scanRuntimeRefs(files: { path: string; text: string }[]): { where: string; kind: 'runtime' | 'node'; id: string }[] {
  const out: { where: string; kind: 'runtime' | 'node'; id: string }[] = []
  for (const { path, text } of files) {
    const lines = text.split('\n')
    lines.forEach((line, i) => {
      const where = `${path}:${i + 1}`
      // Prose about a runtime ("was hardcoded to nodejs20.x") is not a pin.
      if (/^\s*(\/\/|\/?\*|#)/.test(line)) return
      for (const m of line.matchAll(/\bnodejs(\d+)\.x\b/g)) out.push({ where, kind: 'runtime', id: `nodejs${m[1]}.x` })
      const from = /^\s*FROM\s+node:(\d+)/i.exec(line)
      if (from) out.push({ where, kind: 'node', id: from[1] as string })
    })
    if (/(^|\/)\.(nvmrc|node-version)$/.test(path)) {
      const v = /^v?(\d+)/.exec(text.trim())
      if (v) out.push({ where: path, kind: 'node', id: v[1] as string })
    }
    if (path.endsWith('package.json')) {
      try {
        const engines = (JSON.parse(text) as { engines?: { node?: string } }).engines?.node
        const v = engines ? /(\d+)/.exec(engines) : null
        if (v) out.push({ where: `${path} (engines.node)`, kind: 'node', id: v[1] as string })
      } catch {
        // Template package.json files may contain {{placeholders}}; skip.
      }
    }
  }
  return out
}

function runtimeFindings(today: Date): Finding[] {
  const eol = JSON.parse(readFileSync(join(root(), 'scripts/runtime-eol.json'), 'utf-8')) as EolTable
  const dirs = ['packages/zero/zero/src/adapters', 'packages/zero/create-zero/templates', 'packages/zero/create-zero/src']
  const files = dirs
    .flatMap((d) => walk(join(root(), d)))
    .filter((p) => !/\.test\.|\/tests\//.test(p))
    .map((p) => ({ path: relative(root(), p), text: readFileSync(p, 'utf-8') }))
  // An EMPTY scan must never read as "nothing is stale".
  if (files.length === 0) return [{ level: 'error', where: dirs.join(', '), message: 'scanned zero files' }]
  const refs = scanRuntimeRefs(files)
  if (!refs.some((r) => r.kind === 'runtime')) {
    return [{ level: 'error', where: 'adapters', message: 'found no nodejsNN.x runtime reference — scan is broken' }]
  }
  return refs
    .map((r) =>
      eolFinding(r.where, r.kind === 'runtime' ? `runtime ${r.id}` : `Node ${r.id}`, (r.kind === 'runtime' ? eol.runtimes : eol.node)[r.id], today),
    )
    .filter((f): f is Finding => f !== null)
}

/** Union of third-party dependency pins across every scaffold configuration. */
async function scaffoldPins(): Promise<Record<string, string>> {
  const { generatePackageJson } = await import('../packages/zero/create-zero/src/generators/package-json')
  const { FEATURES } = await import('../packages/zero/create-zero/src/templates')
  const templates = ['app', 'blog', 'dashboard', 'monorepo'] as const
  const compats = ['none', 'react', 'vue', 'solid', 'preact'] as const
  const pins: Record<string, Set<string>> = {}
  for (const template of templates) {
    for (const compat of compats) {
      for (const strategy of ['meta', 'individual'] as const) {
        const config = {
          name: 'freshness-probe',
          targetDir: '/tmp/freshness-probe',
          template,
          renderMode: 'ssr-stream',
          adapter: 'node',
          features: Object.keys(FEATURES),
          packageStrategy: strategy,
          integrations: ['supabase', 'email'],
          aiTools: ['mcp', 'claude'],
          compat,
          lint: true,
          typedRoutes: true,
        } as unknown as Parameters<typeof generatePackageJson>[0]
        const kinds = template === 'monorepo' ? (['monorepo-root', 'monorepo-web'] as const) : (['flat'] as const)
        for (const kind of kinds) {
          const pkg = JSON.parse(generatePackageJson(config, kind)) as {
            dependencies?: Record<string, string>
            devDependencies?: Record<string, string>
          }
          for (const [name, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
            if (name.startsWith('@pyreon/') || range.startsWith('workspace:')) continue
            ;(pins[name] ??= new Set()).add(range)
          }
        }
      }
    }
  }
  // One install per distinct range would multiply registry traffic; a name
  // with several ranges keeps the one listed first per name and reports the
  // rest, so a divergence between generators is visible too.
  const out: Record<string, string> = {}
  for (const [name, ranges] of Object.entries(pins)) out[name] = [...ranges][0] as string
  return out
}

function installFindings(pins: Record<string, string>): Finding[] {
  if (Object.keys(pins).length === 0) {
    return [{ level: 'error', where: 'create-zero', message: 'collected no third-party pins — scan is broken' }]
  }
  const dir = mkdtempSync(join(tmpdir(), 'zero-freshness-'))
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'zero-freshness-probe', private: true, dependencies: pins }, null, 2),
    )
    const r = spawnSync('bun', ['install', '--lockfile-only', '--ignore-scripts'], {
      cwd: dir,
      encoding: 'utf-8',
      timeout: 600_000,
    })
    if (r.status !== 0) {
      return [
        {
          level: 'error',
          where: 'scaffold dependency pins',
          message: `bun install --lockfile-only failed for ${JSON.stringify(pins)}:\n${(r.stderr || r.stdout).slice(-3000)}`,
        },
      ]
    }
    if (!existsSync(join(dir, 'bun.lock'))) {
      return [{ level: 'error', where: 'scaffold dependency pins', message: 'install reported success but wrote no bun.lock' }]
    }
    return []
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  const today = new Date()
  const findings = runtimeFindings(today)
  if (process.argv.includes('--skip-install')) {
    console.warn('[zero-freshness] SKIPPED the dependency-install half (--skip-install)')
  } else {
    const pins = await scaffoldPins()
    console.log(`[zero-freshness] resolving ${Object.keys(pins).length} third-party scaffold pin(s)`)
    findings.push(...installFindings(pins))
  }
  for (const f of findings) {
    const line = `${f.where}: ${f.message}`
    if (f.level === 'error') console.error(`  ✗ ${line}`)
    else console.warn(`  ! ${line}`)
    if (process.env['GITHUB_ACTIONS']) {
      console.log(`::${f.level === 'error' ? 'error' : 'warning'}::${line.split('\n')[0]}`)
    }
  }
  const errors = findings.filter((f) => f.level === 'error').length
  if (errors > 0) {
    console.error(`[zero-freshness] ${errors} error(s)`)
    process.exit(1)
  }
  const scope = process.argv.includes('--skip-install') ? 'no end-of-life runtime' : 'no end-of-life runtime and every scaffold pin resolves'
  console.log(`[zero-freshness] ✓ ${scope} (${findings.length} warning(s))`)
}

if (import.meta.main) await main()
