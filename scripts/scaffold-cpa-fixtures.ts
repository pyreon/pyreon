#!/usr/bin/env bun
/**
 * scaffold-cpa-fixtures — generate, or check, the create-zero e2e fixtures.
 *
 * The Playwright runtime gate (`bun run test:e2e:cpa`) targets three
 * committed fixture apps:
 *
 *   examples/cpa-pw-app   (template=app,       adapter=vercel)
 *   examples/cpa-pw-blog  (template=blog,      adapter=static)
 *   examples/cpa-pw-dash  (template=dashboard, adapter=vercel,
 *                         no integrations — exercises the in-memory stub)
 *
 * They are committed rather than scaffolded per run so CI pays no scaffold +
 * install per e2e run and specs can name stable file paths. The price is
 * drift: a template or scaffolder change leaves the fixtures testing what
 * `create-zero` USED to emit. `--check` makes that drift a red gate
 * (validate-fast): it scaffolds each fixture into a temp dir, applies the
 * same workspace normalisation, and compares every file.
 *
 * A fixture is exactly the scaffolder's output plus `toWorkspaceFixture`:
 * the package becomes a private workspace member (`@pyreon/example-<dir>`,
 * `@pyreon/*` deps on `workspace:^`, the repo tsconfig preset, the root
 * LICENSE, no nested `.oxlintrc.json`), plus the declared fixture-only
 * `extraFiles` and `appends`. Never hand-edit a fixture: change the template
 * or the scaffolder, then regenerate.
 *
 * The compat-mode runtime gate (`--compat react|vue|solid|preact`) lives in
 * `scripts/scaffold-smoke.ts`, which scaffolds those apps fresh, so it has
 * no committed copies to drift.
 *
 * Usage:
 *   bun scripts/scaffold-cpa-fixtures.ts          # regenerate all three
 *   bun scripts/scaffold-cpa-fixtures.ts --check  # exit 1 and name every drifted file
 * After regenerating: `bun install`, then `bun run test:e2e:cpa`.
 */

import { spawnSync } from 'node:child_process'
import {
  closeSync,
  cpSync,
  existsSync,
  fstatSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'

export interface Fixture {
  /** Directory name under `examples/` (also the scaffolded project name). */
  name: string
  /** create-zero flags. */
  args: string[]
  /**
   * Fixture-only files a spec or verify-modes cell needs and no template
   * ships (for example a catch-all API route). They live only in the
   * committed fixture, survive a regenerate, and must exist for `--check`.
   */
  extraFiles?: readonly string[]
  /**
   * Fixture-only text appended to a scaffolded file, for a behaviour that
   * has to live in a template-owned module (a route's `revalidate` export).
   * Applied by both regenerate and `--check`, so the rest of the file still
   * tracks the template.
   */
  appends?: Readonly<Record<string, string>>
}

/** `revalidate` must be a route-module export; verify-modes reads its ISR manifest. */
const BLOG_REVALIDATE = `
/**
 * Fixture-only (scripts/scaffold-cpa-fixtures.ts): build-time ISR, every hour.
 * The SSG plugin writes this value into \`dist/_pyreon-revalidate.json\` for
 * every prerendered post URL; verify-modes asserts those entries.
 * Must be an inline literal: the build-time extractor does not follow identifiers.
 */
export const revalidate = 3600
`

export const FIXTURES: readonly Fixture[] = [
  {
    name: 'cpa-pw-app',
    args: ['--template', 'app', '--adapter', 'vercel', '--yes'],
  },
  {
    name: 'cpa-pw-blog',
    args: ['--template', 'blog', '--adapter', 'static', '--yes'],
    // e2e/cpa-blog.spec.ts (catch-all streaming route) and the verify-modes
    // cpa-pw-blog cells (404.html, the ISR revalidate handler).
    extraFiles: ['src/routes/_404.tsx', 'src/routes/api/_pyreon-revalidate.ts', 'src/routes/api/echo/[...path].ts'],
    appends: { 'src/routes/blog/[slug].tsx': BLOG_REVALIDATE },
  },
  {
    name: 'cpa-pw-dash',
    // No integrations: tests the in-memory stub end-to-end. The
    // supabase-integrated dashboard requires a live backend / mock layer.
    args: ['--template', 'dashboard', '--adapter', 'vercel', '--integrations', '', '--yes'],
    // e2e/cpa-dash.spec.ts redirect cases.
    extraFiles: [
      'src/routes/redirect-fixtures/chain-a.tsx',
      'src/routes/redirect-fixtures/chain-b.tsx',
      'src/routes/redirect-fixtures/permanent.tsx',
    ],
  },
]

const REPO_ROOT = resolve(import.meta.dirname, '..')
const EXAMPLES_DIR = join(REPO_ROOT, 'examples')
const SCAFFOLDER = join(REPO_ROOT, 'packages/zero/create-zero/src/index.ts')

/** Paths inside a fixture that are install or build output, never compared. */
const IGNORED = new Set(['node_modules', 'dist', '.zero', '.vercel', '.output'])

interface PackageJson {
  name?: string
  version?: string
  license?: string
  private?: boolean
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

/** `@pyreon/*` deps resolve to the local workspace, as in every other example. */
function toWorkspaceDeps(deps: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!deps) return deps
  return Object.fromEntries(
    Object.entries(deps).map(([name, range]) => [name, name.startsWith('@pyreon/') ? 'workspace:^' : range]),
  )
}

/**
 * Turn a fresh scaffold into a workspace fixture. Pure over the directory:
 * running it twice gives the same bytes, so `--check` can reproduce it.
 */
export function toWorkspaceFixture(dir: string, name: string, licenseText: string): void {
  const pkgPath = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson
  const { name: _name, version, license: _license, private: _private, ...rest } = pkg
  const dependencies = toWorkspaceDeps(pkg.dependencies)
  const devDependencies = { ...toWorkspaceDeps(pkg.devDependencies), '@pyreon/tsconfig': 'workspace:*' }
  const sortedDev = Object.fromEntries(Object.entries(devDependencies).sort(([a], [b]) => a.localeCompare(b)))
  const next: PackageJson = {
    name: `@pyreon/example-${name}`,
    version: version ?? '0.0.0',
    license: 'MIT',
    private: true,
    ...rest,
    ...(dependencies ? { dependencies } : {}),
    devDependencies: sortedDev,
  }
  writeFileSync(pkgPath, `${JSON.stringify(next, null, 2)}\n`)

  // Every example extends the repo preset (check-tsconfig-presets); keep the
  // scaffold's own `types` and `include` so what it typechecks is unchanged.
  const tsPath = join(dir, 'tsconfig.json')
  const ts = JSON.parse(readFileSync(tsPath, 'utf8')) as {
    compilerOptions?: { types?: string[] }
    include?: string[]
  }
  const tsNext = {
    extends: '@pyreon/tsconfig/example.json',
    compilerOptions: { types: ts.compilerOptions?.types ?? [] },
    include: ts.include ?? ['src'],
  }
  writeFileSync(tsPath, `${JSON.stringify(tsNext, null, 2)}\n`)

  // check-license-coverage: every workspace carries the root LICENSE.
  writeFileSync(join(dir, 'LICENSE'), licenseText)

  // The repo's root oxlint config and its ratchets govern workspace files. A
  // nested `.oxlintrc.json` would make the root `oxlint .` lint this directory
  // with the scaffold's own preset instead, moving the repo-wide baselines.
  rmSync(join(dir, '.oxlintrc.json'), { force: true })
}

/** Scaffold `fixture` into `parent/<name>` and normalise it. */
export function scaffoldFixture(fixture: Fixture, parent: string): string {
  const result = spawnSync('bun', [SCAFFOLDER, fixture.name, ...fixture.args], {
    cwd: parent,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(
      `[scaffold-cpa-fixtures] create-zero exited with code ${result.status} for ${fixture.name}:\n${result.stdout}${result.stderr}`,
    )
  }
  const dir = join(parent, fixture.name)
  toWorkspaceFixture(dir, fixture.name, readFileSync(join(REPO_ROOT, 'LICENSE'), 'utf8'))
  for (const [file, text] of Object.entries(fixture.appends ?? {})) {
    const path = join(dir, file)
    // One open, no exists-then-write window: append to the file the
    // scaffolder just wrote, and fail loudly when it no longer writes it.
    let fd: number
    try {
      fd = openSync(path, 'r+') // never creates: a missing file is ENOENT
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      throw new Error(
        `[scaffold-cpa-fixtures] ${fixture.name}: the template no longer emits ${file}, which the fixture appends to. Move the append to the file that now owns that route.`,
      )
    }
    try {
      writeSync(fd, text, fstatSync(fd).size)
    } finally {
      closeSync(fd)
    }
  }
  return dir
}

/** Every file under `dir`, relative, skipping install and build output. */
export function listFixtureFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (abs: string): void => {
    for (const entry of readdirSync(abs)) {
      if (IGNORED.has(entry)) continue
      const child = join(abs, entry)
      if (statSync(child).isDirectory()) walk(child)
      else out.push(relative(dir, child))
    }
  }
  if (existsSync(dir)) walk(dir)
  return out.sort()
}

export interface FixtureDrift {
  /** Files the scaffolder emits that the committed fixture lacks. */
  missing: string[]
  /** Committed files the scaffolder no longer emits. */
  extra: string[]
  /** Files present in both with different bytes. */
  changed: string[]
}

/**
 * The fixture's files as git sees them: tracked plus untracked-not-ignored,
 * so build output the fixture's own `.gitignore` excludes (`.pyreon/`,
 * generated route types) never counts as drift, while a new unignored file
 * does. Falls back to a plain walk outside a git checkout.
 */
export function listCommittedFiles(dir: string): string[] {
  const res = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '.'], {
    cwd: dir,
    encoding: 'utf8',
  })
  if (res.status !== 0) return listFixtureFiles(dir)
  const files = res.stdout.split('\0').filter((f) => f !== '' && existsSync(join(dir, f)))
  return [...new Set(files)].sort()
}

/** Compare a committed fixture against a fresh, normalised scaffold. */
export function diffFixture(
  committedDir: string,
  freshDir: string,
  extraFiles: readonly string[] = [],
): FixtureDrift {
  const committed = new Set(listCommittedFiles(committedDir))
  const fresh = new Set(listFixtureFiles(freshDir))
  const allowed = new Set(extraFiles)
  const missing = [
    ...[...fresh].filter((f) => !committed.has(f)),
    ...extraFiles.filter((f) => !committed.has(f)),
  ]
  const extra = [...committed].filter((f) => !fresh.has(f) && !allowed.has(f))
  const changed = [...fresh].filter(
    (f) => committed.has(f) && !readFileSync(join(committedDir, f)).equals(readFileSync(join(freshDir, f))),
  )
  return { missing, extra, changed }
}

function check(): number {
  const tmp = mkdtempSync(join(tmpdir(), 'cpa-fixtures-check-'))
  let drifted = 0
  try {
    for (const fixture of FIXTURES) {
      const fresh = scaffoldFixture(fixture, tmp)
      const drift = diffFixture(join(EXAMPLES_DIR, fixture.name), fresh, fixture.extraFiles)
      const lines = [
        ...drift.missing.map((f) => `missing  ${f}`),
        ...drift.extra.map((f) => `extra    ${f}`),
        ...drift.changed.map((f) => `changed  ${f}`),
      ]
      if (lines.length === 0) {
        console.log(`✓ examples/${fixture.name} matches create-zero`)
        continue
      }
      drifted++
      console.error(`✗ examples/${fixture.name} differs from what create-zero emits today:`)
      for (const l of lines) console.error(`    ${l}`)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  if (drifted > 0) {
    console.error(
      `\n[scaffold-cpa-fixtures] ${drifted} fixture(s) drifted. A template or scaffolder change must regenerate them in the same PR: ` +
        '`bun scripts/scaffold-cpa-fixtures.ts && bun install`, then `bun run test:e2e:cpa`. Never hand-edit a fixture.',
    )
    return 1
  }
  return 0
}

function regenerate(): void {
  const tmp = mkdtempSync(join(tmpdir(), 'cpa-fixtures-'))
  try {
    for (const fixture of FIXTURES) {
      console.log(`──── ${fixture.name} ────`)
      const fresh = scaffoldFixture(fixture, tmp)
      const target = join(EXAMPLES_DIR, fixture.name)
      // Keep install output (no full reinstall) and the fixture-only files.
      const keep = new Set(fixture.extraFiles ?? [])
      for (const f of listFixtureFiles(target)) if (!keep.has(f)) rmSync(join(target, f))
      cpSync(fresh, target, { recursive: true })
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  console.log('\n✓ Regenerated all CPA fixtures.')
  console.log('Run `bun install` to refresh the workspace and bun.lock, then `bun run test:e2e:cpa`.')
}

if (import.meta.main) {
  if (process.argv.includes('--check')) process.exit(check())
  regenerate()
}
