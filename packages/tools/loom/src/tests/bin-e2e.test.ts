/**
 * END-TO-END through the SHIPPED artifact: the real `bin/loom.js` spawned as
 * a process, resolving the BUILT `lib/`, against a workspace on disk.
 *
 * Why this file exists separately from `cli.test.ts`: that suite calls
 * `runCli()` from `src/`, which is the library function, not the thing a
 * consumer runs. The repo has already shipped one published bin that was a
 * complete no-op while every unit test passed (`pyreon-lint` 0.43.0 — the
 * built `lib/cli.js` is a pure re-export, so an `import.meta.main` self-run
 * guard never fired). `@pyreon/loom` is about to be published for the first
 * time; the bin, the built lib, the exit-code contract and the report
 * artifact are the surface a consumer's CI actually binds to, so they get
 * asserted the way a consumer would meet them.
 *
 * Per the subprocess-testing discipline (anti-patterns: "Subprocess testing
 * as a default"), process assertions are on EXIT CODES, never captured
 * stdout — stdout ordering is not deterministic under parallel load. Findings
 * are asserted by reading `loom-report.json` off DISK, which is.
 *
 * The FOREIGN-SHAPE fixture is the repeatable form of a manual validation
 * run against a real 87-package TypeScript monorepo: four workspace glob
 * groups, a `~/*` tsconfig alias, a wrapped multi-line `import type`, and a
 * `.d.ts` module augmentation — none of which the pyreon monorepo itself
 * uses, which is exactly why two false-positive classes shipped undetected.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { IssueCode, IssueSeverity, LoomReport } from '../core'

const PKG_ROOT = resolve(__dirname, '..', '..')
const BIN = join(PKG_ROOT, 'bin', 'loom.js')
const LIB_CLI = join(PKG_ROOT, 'lib', 'cli.js')
const built = existsSync(LIB_CLI)

const roots: string[] = []
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))

/** Run the shipped bin; return its exit code. */
function runBin(args: string[]): number {
  try {
    execFileSync('node', [BIN, ...args], { stdio: 'pipe' })
    return 0
  } catch (err) {
    return (err as { status?: number }).status ?? -1
  }
}

/** Write a workspace on disk. `files` keys are paths relative to the root. */
function makeWorkspace(rootManifest: object, files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'loom-e2e-'))
  roots.push(root)
  writeFileSync(join(root, 'package.json'), JSON.stringify(rootManifest, null, 2))
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, body)
  }
  return root
}

function readReport(root: string): LoomReport {
  return JSON.parse(readFileSync(join(root, 'loom-report.json'), 'utf8')) as LoomReport
}

const codes = (r: LoomReport, code: IssueCode) => r.issues.filter((i) => i.code === code)
const bySeverity = (r: LoomReport, sev: IssueSeverity) =>
  r.issues.filter((i) => i.severity === sev)

/** A published package importing an undeclared package at runtime = error. */
function workspaceWithError(): string {
  return makeWorkspace(
    { name: 'root', private: true, workspaces: ['packages/*'] },
    {
      'packages/a/package.json': JSON.stringify({ name: 'a', version: '1.0.0' }),
      'packages/a/src/index.ts': `import { x } from 'never-declared'\nexport const y = x`,
    },
  )
}

/** A PRIVATE package with the same undeclared import = warning, not error. */
function workspaceWithWarningOnly(): string {
  return makeWorkspace(
    { name: 'root', private: true, workspaces: ['packages/*'] },
    {
      'packages/a/package.json': JSON.stringify({ name: 'a', version: '1.0.0', private: true }),
      'packages/a/src/index.ts': `import { x } from 'never-declared'\nexport const y = x`,
    },
  )
}

function cleanWorkspace(): string {
  return makeWorkspace(
    { name: 'root', private: true, workspaces: ['packages/*'] },
    {
      'packages/a/package.json': JSON.stringify({
        name: 'a', version: '1.0.0', private: true, dependencies: { dep: '^1.0.0' },
      }),
      'packages/a/src/index.ts': `import { x } from 'dep'\nexport const y = x`,
    },
  )
}

describe('the shipped bin runs a real scan (not a no-op)', () => {
  it('lib/cli.js is built here — the specs below are NOT silently skipped', () => {
    // A skipped suite must never masquerade as coverage. Bootstrap builds
    // lib/; if this fires, run `bun scripts/bootstrap.ts`.
    expect(built).toBe(true)
  })

  it.skipIf(!built)('exits 1 on an error finding — a no-op bin would exit 0', () => {
    expect(runBin(['scan', workspaceWithError(), '--no-write'])).toBe(1)
  })

  it.skipIf(!built)('exits 0 on a clean workspace', () => {
    expect(runBin(['scan', cleanWorkspace(), '--no-write'])).toBe(0)
  })

  it.skipIf(!built)('warnings alone pass; --strict turns the same scan red', () => {
    const root = workspaceWithWarningOnly()
    expect(runBin(['scan', root, '--no-write'])).toBe(0)
    expect(runBin(['scan', root, '--no-write', '--strict'])).toBe(1)
  })

  it.skipIf(!built)('a directory that is not a workspace is a loud error, not a clean pass', () => {
    const bare = mkdtempSync(join(tmpdir(), 'loom-e2e-bare-'))
    roots.push(bare)
    expect(runBin(['scan', bare, '--no-write'])).not.toBe(0)
  })

  it.skipIf(!built)('writes loom-report.json by default, and --no-write does not', () => {
    const written = cleanWorkspace()
    runBin(['scan', written])
    expect(existsSync(join(written, 'loom-report.json'))).toBe(true)

    const unwritten = cleanWorkspace()
    runBin(['scan', unwritten, '--no-write'])
    expect(existsSync(join(unwritten, 'loom-report.json'))).toBe(false)
  })

  it.skipIf(!built)('the report artifact carries the machine surface a CI job binds to', () => {
    const root = workspaceWithError()
    runBin(['scan', root])
    const report = readReport(root)
    expect(report.model.packages).toHaveLength(1)
    expect(report.stats.internal).toBe(1)
    expect(Array.isArray(report.issues)).toBe(true)
    const phantom = codes(report, 'phantom-dep')
    expect(phantom).toHaveLength(1)
    expect(phantom[0]!.severity).toBe('error')
    expect(phantom[0]!.dep).toBe('never-declared')
    // Evidence, not just a verdict — the file that produced the finding.
    // `details` is a deliberately open `Record<string, unknown>`; narrowing
    // the one key this detector documents is the read, not an escape hatch.
    const files = phantom[0]!.details?.['files'] as string[] | undefined
    expect(files?.[0]).toContain('index.ts')
  })
})

describe('foreign-workspace shapes survive the shipped path', () => {
  /**
   * Four glob groups + the three shapes that produced false positives on a
   * real repo. Reproduced here so the validation is a gate rather than a
   * thing someone once ran by hand.
   */
  function foreignWorkspace(): string {
    return makeWorkspace(
      { name: 'root', private: true, workspaces: ['apps/*', 'packages/*', 'modules/*', 'tools/*'] },
      {
        // (1) `~/*` tsconfig path alias — must not scan as a package named `~`.
        'apps/web/package.json': JSON.stringify({ name: 'web', version: '1.0.0', private: true }),
        'apps/web/tsconfig.json': JSON.stringify({
          compilerOptions: { paths: { '~/*': ['./src/*'] } },
        }),
        'apps/web/src/index.ts': `import { Shell } from '~/components/Shell'\nexport const app = Shell`,

        // (2) wrapped multi-line `import type` from a devDependency — correct code.
        'packages/ui/package.json': JSON.stringify({
          name: 'ui', version: '1.0.0', private: true,
          devDependencies: { 'types-pkg': '^1.0.0' },
        }),
        'packages/ui/src/index.ts':
          `import type {\n  ExtractProps,\n  HigherOrderComponent,\n} from 'types-pkg'\n` +
          `export type P = ExtractProps<HigherOrderComponent>`,

        // (3) `.d.ts` module augmentation of an undeclared package — info, not a warning.
        'modules/i18n/package.json': JSON.stringify({ name: 'i18n', version: '1.0.0', private: true }),
        'modules/i18n/typings.d.ts':
          `import 'i18n-lib'\ndeclare module 'i18n-lib' { interface Opts { locale: string } }`,

        // (4) a genuine runtime phantom — the control that proves the scan still bites.
        'tools/cli/package.json': JSON.stringify({ name: 'cli', version: '1.0.0', private: true }),
        'tools/cli/src/index.ts': `import { run } from 'genuinely-missing'\nexport const go = run`,
      },
    )
  }

  it.skipIf(!built)('discovers every glob group', () => {
    const root = foreignWorkspace()
    runBin(['scan', root])
    const names = readReport(root).model.packages.map((p) => p.name).sort()
    expect(names).toEqual(['cli', 'i18n', 'ui', 'web'])
  })

  it.skipIf(!built)('reports ONLY the genuine phantom — aliases and types are not deps', () => {
    const root = foreignWorkspace()
    runBin(['scan', root])
    const report = readReport(root)
    const phantoms = codes(report, 'phantom-dep')
    expect(phantoms.map((i) => i.dep)).toEqual(['genuinely-missing'])
    // The alias never becomes a package…
    expect(report.issues.some((i) => i.dep === '~')).toBe(false)
    // …and importing types from a devDependency is silent.
    expect(codes(report, 'prod-import-of-dev-dep')).toHaveLength(0)
  })

  it.skipIf(!built)('the .d.ts augmentation is info-level phantom-type-dep, so --strict stays green on it', () => {
    const root = foreignWorkspace()
    runBin(['scan', root])
    const report = readReport(root)
    const typed = codes(report, 'phantom-type-dep')
    expect(typed.map((i) => i.dep)).toEqual(['i18n-lib'])
    expect(typed[0]!.severity).toBe('info')
    // It must not be sitting in the gating tiers.
    expect(bySeverity(report, 'warning').some((i) => i.dep === 'i18n-lib')).toBe(false)
    expect(bySeverity(report, 'error').some((i) => i.dep === 'i18n-lib')).toBe(false)
  })

  it.skipIf(!built)('a type-only dependency is never accused of being unused', () => {
    const root = makeWorkspace(
      { name: 'root', private: true, workspaces: ['packages/*'] },
      {
        'packages/a/package.json': JSON.stringify({
          name: 'a', version: '1.0.0', private: true, dependencies: { 'types-pkg': '^1.0.0' },
        }),
        'packages/a/src/index.ts': `import type { A } from 'types-pkg'\nexport type B = A`,
      },
    )
    runBin(['scan', root])
    expect(codes(readReport(root), 'unused-dep')).toHaveLength(0)
  })
})
