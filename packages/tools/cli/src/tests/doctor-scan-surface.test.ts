/**
 * What the doctor's file-scanning gates actually look at, and how the
 * two subprocess gates read a script that fails on purpose.
 *
 * The scan surface is the doctor's deepest correctness question. A
 * resolver that expands to nothing makes every file gate report zero
 * findings, and zero findings renders as a clean bill of health — the
 * upstream-reported false green, where a foreign monorepo scored 100/A
 * having inspected no files at all. So these predicates are load-bearing
 * in BOTH directions: scanning too little manufactures a green, and
 * scanning too much drags an honest project down with findings from
 * detector fixtures that hold anti-patterns on purpose.
 *
 * The subprocess gates have their own trap. `check-bundle-budgets`
 * exits NON-ZERO whenever a package is over budget, and writes its JSON
 * report to stdout anyway. A gate that treats the exit code as failure
 * turns "you are over budget" — the finding it exists to produce — into
 * "the gate crashed", which reads as infrastructure noise and gets
 * ignored.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  collectAuditableSourceFiles,
  collectFilesMatching,
  isAuditableSourceFile,
  isCompatPackageFile,
  isPackageConfigFile,
  isTestSourceFile,
  packageScanRoot,
} from '../doctor/utils/walk'
import {
  describeWorkspaceRoots,
  excludeRootsFromPackageJson,
  expandWorkspaceGlob,
  globMatchesDir,
} from '../doctor/utils/workspace-roots'
import type { WorkspaceRoots } from '../doctor/utils/workspace-roots'
import { runAuditTypesGate } from '../doctor/gates/audit-types'
import { runBundleBudgetsGate } from '../doctor/gates/bundle-budgets'

let root: string

const put = (rel: string, body = ''): string => {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
  return abs
}

const ws = (dirs: string[], over: Partial<WorkspaceRoots> = {}): WorkspaceRoots => ({
  repoRoot: root,
  packageDirs: dirs.map((d) => join(root, d)),
  globs: ['packages/*'],
  excluded: [],
  source: 'workspaces',
  ...over,
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-scan-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('which files count as auditable health surface', () => {
  it('accepts every source extension', () => {
    // The control. Every exclusion below is only meaningful against a
    // predicate that says yes to something.
    for (const p of ['src/a.ts', 'src/a.tsx', 'src/a.js', 'src/a.jsx']) {
      expect(isAuditableSourceFile(p), p).toBe(true)
    }
  })

  it('rejects a non-source extension', () => {
    for (const p of ['README.md', 'package.json', 'a.css', 'a.snap', 'a']) {
      expect(isAuditableSourceFile(p), p).toBe(false)
    }
  })

  it('rejects a DECLARATION file', () => {
    // A `.d.ts` has no runtime behaviour, so a finding in one is noise
    // the author cannot act on.
    expect(isAuditableSourceFile('src/types.d.ts')).toBe(false)
    expect(isAuditableSourceFile('src/types.ts'), 'but a plain .ts is source').toBe(true)
  })

  it('rejects a FIXTURE, which holds anti-patterns on purpose', () => {
    // This is the one that would silently invert the grade: a detector's
    // fixtures exist to contain the exact patterns the detector reports,
    // so scanning them scores the repo on deliberately-bad code.
    for (const p of ['__fixtures__/bad.ts', 'fixtures/bad.ts', 'src/__fixtures__/bad.ts']) {
      expect(isAuditableSourceFile(p), p).toBe(false)
    }
  })

  it('rejects tests, by directory and by filename', () => {
    for (const p of [
      'tests/a.ts',
      'test/a.ts',
      '__tests__/a.ts',
      'src/tests/a.ts',
      'src/a.test.ts',
      'src/a.spec.tsx',
      'src/a.browser.test.tsx',
    ]) {
      expect(isAuditableSourceFile(p), p).toBe(false)
    }
  })

  it('does not mistake a name that merely CONTAINS "test"', () => {
    // `latest/`, `contest.ts`, `protest/` — over-matching here silently
    // drops real source from the scan, which is the false-green
    // direction and the one nobody notices.
    for (const p of ['latest/a.ts', 'src/contest.ts', 'src/testing-library-shim.ts']) {
      expect(isAuditableSourceFile(p), p).toBe(true)
    }
  })

  it('normalises Windows separators before matching', () => {
    // Every rule above is written against `/`. On a backslash path they
    // all silently stop matching, and a Windows user scans their
    // fixtures.
    expect(isAuditableSourceFile('src\\__fixtures__\\bad.ts')).toBe(false)
    expect(isAuditableSourceFile('src\\a.ts')).toBe(true)
  })
})

describe('the compat packages are exempt by definition', () => {
  it('recognises a *-compat path', () => {
    // React-pattern findings in `react-compat` are a definitional false
    // positive: the package exists to expose `useState` and `className`.
    for (const p of ['packages/tools/react-compat/src/a.ts', 'vue-compat/src/a.ts']) {
      expect(isCompatPackageFile(p), p).toBe(true)
    }
  })

  it('does not exempt an ordinary package', () => {
    for (const p of ['packages/core/router/src/a.ts', 'src/compatible.ts']) {
      expect(isCompatPackageFile(p), p).toBe(false)
    }
  })
})

describe('the test and config surfaces are their own predicates', () => {
  it('recognises a test file, by name or by directory', () => {
    // Rules that are ABOUT tests need the surface the default scan
    // deliberately drops.
    for (const p of ['src/a.test.ts', 'src/tests/a.ts', '__tests__/a.tsx']) {
      expect(isTestSourceFile(p), p).toBe(true)
    }
  })

  it('still excludes fixtures from the TEST surface', () => {
    // A rule about test hygiene wants real tests, not the bad code a
    // detector fixture holds on purpose.
    expect(isTestSourceFile('src/__fixtures__/a.test.ts')).toBe(false)
  })

  it('does not call ordinary source a test', () => {
    expect(isTestSourceFile('src/a.ts')).toBe(false)
    expect(isTestSourceFile('src/a.d.ts')).toBe(false)
    expect(isTestSourceFile('README.md')).toBe(false)
  })

  it('recognises the vitest config spellings, and nothing else', () => {
    for (const p of ['vitest.config.ts', 'vitest.browser.config.ts', 'pkg/vitest.config.js']) {
      expect(isPackageConfigFile(p), p).toBe(true)
    }
    for (const p of ['vite.config.ts', 'src/vitest.helper.ts', 'vitest.config.json']) {
      expect(isPackageConfigFile(p), p).toBe(false)
    }
  })
})

describe('the walker picks a scan root and skips build output', () => {
  it('prefers src/ when a package has one', () => {
    // Build output, scripts and configs at the package root are not
    // health surface, and `lib/` in particular is generated — findings
    // there are unfixable by definition.
    mkdirSync(join(root, 'p/src'), { recursive: true })
    expect(packageScanRoot(join(root, 'p'))).toBe(join(root, 'p/src'))
  })

  it('falls back to the package dir for a flat layout', () => {
    mkdirSync(join(root, 'p'), { recursive: true })
    expect(packageScanRoot(join(root, 'p'))).toBe(join(root, 'p'))
  })

  it('skips node_modules, build output and dotdirs while walking', () => {
    // The scan must not descend into a dependency tree: the findings are
    // someone else's, and the walk takes minutes.
    put('p/src/real.ts')
    put('p/src/node_modules/dep/index.ts')
    put('p/src/dist/out.js')
    put('p/src/lib/out.js')
    put('p/src/.cache/x.ts')
    put('p/src/build/x.ts')
    const files = collectAuditableSourceFiles(ws(['p']))
    expect(files.map((f) => f.replace(root, ''))).toEqual(['/p/src/real.ts'])
  })

  it('returns nothing for a package root that does not exist', () => {
    // A stale glob must not crash the walk — the gate reports an empty
    // scan, which the report then surfaces as unmeasured.
    expect(collectAuditableSourceFiles(ws(['ghost']))).toEqual([])
  })

  it('reports a file once when two package roots OVERLAP', () => {
    // `packages/*` and `packages/*/*` both resolve in this repo, so the
    // same file is reachable twice. Counting it twice doubles every
    // finding and the scanned total the report prints.
    put('p/src/a.ts')
    const files = collectAuditableSourceFiles(ws(['p', 'p']))
    expect(files.length).toBe(1)
  })

  it('applies the filters RELATIVE to the scan root, not the absolute path', () => {
    // The temp dir this suite runs in can itself sit under a path with
    // `test` in it. Matching the absolute path would then exclude every
    // file and report a clean scan of nothing.
    const nested = mkdtempSync(join(tmpdir(), 'tests-outer-'))
    try {
      mkdirSync(join(nested, 'p/src'), { recursive: true })
      writeFileSync(join(nested, 'p/src/a.ts'), '')
      const files = collectAuditableSourceFiles({
        repoRoot: nested,
        packageDirs: [join(nested, 'p')],
        globs: [],
        excluded: [],
        source: 'workspaces',
      })
      expect(files.length, 'a parent dir named tests must not exclude the tree').toBe(1)
    } finally {
      rmSync(nested, { recursive: true, force: true })
    }
  })

  it('collectFilesMatching walks the package ROOT, not src/', () => {
    // A per-package config lives outside `src/` by definition, so the
    // src-preferring root would never see it.
    put('p/vitest.config.ts')
    put('p/src/a.ts')
    const found = collectFilesMatching(ws(['p']), isPackageConfigFile)
    expect(found.map((f) => f.replace(root, ''))).toEqual(['/p/vitest.config.ts'])
  })

  it('collectFilesMatching also reports a file once across overlapping roots', () => {
    put('p/vitest.config.ts')
    expect(collectFilesMatching(ws(['p', 'p']), isPackageConfigFile).length).toBe(1)
  })
})

describe('workspace globs expand to real directories', () => {
  it('matches a single-star segment', () => {
    expect(globMatchesDir('packages/*', 'packages/core')).toBe(true)
    expect(globMatchesDir('packages/*', 'packages/core/router')).toBe(false)
  })

  it('matches a DOUBLE-star across any depth, including zero', () => {
    // `packages/**` must cover `packages` itself and every descendant —
    // a `**` implemented as "one or more" silently drops the top level.
    expect(globMatchesDir('packages/**', 'packages')).toBe(true)
    expect(globMatchesDir('packages/**', 'packages/core')).toBe(true)
    expect(globMatchesDir('packages/**', 'packages/core/router')).toBe(true)
    expect(globMatchesDir('packages/**', 'apps/web')).toBe(false)
  })

  it('expands a two-level glob to the directories that exist', () => {
    mkdirSync(join(root, 'packages/core/router'), { recursive: true })
    mkdirSync(join(root, 'packages/tools/cli'), { recursive: true })
    const out = expandWorkspaceGlob(root, 'packages/*/*').map((d) => d.replace(root, ''))
    expect(out.sort()).toEqual(['/packages/core/router', '/packages/tools/cli'])
  })

  it('never descends into node_modules or a dotdir while expanding', () => {
    // Expanding `packages/*` into `node_modules` would put every
    // dependency into the scan scope.
    mkdirSync(join(root, 'packages/real'), { recursive: true })
    mkdirSync(join(root, 'packages/node_modules/dep'), { recursive: true })
    mkdirSync(join(root, 'packages/.cache'), { recursive: true })
    const out = expandWorkspaceGlob(root, 'packages/*').map((d) => d.replace(root, ''))
    expect(out).toEqual(['/packages/real'])
  })

  it('expands a literal segment only when it is a real directory', () => {
    mkdirSync(join(root, 'packages'), { recursive: true })
    writeFileSync(join(root, 'notadir'), '')
    expect(expandWorkspaceGlob(root, 'packages')).toHaveLength(1)
    expect(expandWorkspaceGlob(root, 'notadir'), 'a file is not a root').toEqual([])
    expect(expandWorkspaceGlob(root, 'missing')).toEqual([])
  })

  it('BOUNDS a `**` expansion so a deep tree cannot hang the run', () => {
    // `**` recurses into every descendant. Without a depth cap a deep
    // `node_modules`-free tree — or a symlink cycle — turns a gate that
    // should take milliseconds into one that never returns, and a doctor
    // run that never returns is a doctor run nobody uses.
    let deep = root
    for (let i = 0; i < 14; i++) {
      deep = join(deep, `d${i}`)
    }
    mkdirSync(deep, { recursive: true })
    const out = expandWorkspaceGlob(root, '**')
    expect(out.length).toBeGreaterThan(0)
    expect(out.some((d) => d.includes('d12')), 'beyond the cap is not expanded').toBe(false)
  })
})

describe('the exclusion config is read defensively', () => {
  it('reads a well-formed excludeRoots list', () => {
    // The control — this repo uses it to keep examples and docs out of
    // the audited set.
    expect(
      excludeRootsFromPackageJson({ pyreon: { doctor: { excludeRoots: ['examples/*', 'docs'] } } }),
    ).toEqual(['examples/*', 'docs'])
  })

  for (const [label, pkg] of [
    ['no package.json at all', null],
    ['no pyreon key', {}],
    ['pyreon is null', { pyreon: null }],
    ['pyreon is a string', { pyreon: 'yes' }],
    ['no doctor key', { pyreon: {} }],
    ['doctor is null', { pyreon: { doctor: null } }],
    ['doctor is a number', { pyreon: { doctor: 1 } }],
    ['excludeRoots is not an array', { pyreon: { doctor: { excludeRoots: 'examples' } } }],
  ] as Array<[string, Record<string, unknown> | null]>) {
    it(`returns EMPTY for ${label}`, () => {
      // A hand-edited package.json is the input here. Throwing on a
      // malformed one takes down every file gate at once, for a config
      // key that is entirely optional.
      expect(() => excludeRootsFromPackageJson(pkg), label).not.toThrow()
      expect(excludeRootsFromPackageJson(pkg), label).toEqual([])
    })
  }

  it('drops a non-string entry rather than the whole list', () => {
    expect(
      excludeRootsFromPackageJson({ pyreon: { doctor: { excludeRoots: ['ok', 42, null] } } }),
    ).toEqual(['ok'])
  })
})

describe('the scope description names where the globs came from', () => {
  // A run that audits the wrong tree is invisible unless the report says
  // what it audited. This one line is what makes an empty scan legible.
  const base = { repoRoot: '/r', packageDirs: ['/r/a'], globs: ['packages/*'], excluded: [] }

  it('names each source', () => {
    for (const [source, marker] of [
      ['flag', '--roots'],
      ['pnpm-workspace', 'pnpm-workspace.yaml'],
      ['workspaces', 'package.json workspaces'],
      ['single-package', 'single package'],
    ] as Array<[WorkspaceRoots['source'], string]>) {
      expect(describeWorkspaceRoots({ ...base, source }), source).toContain(marker)
    }
  })

  it('reports the root COUNT, which is what an empty scan shows as zero', () => {
    expect(describeWorkspaceRoots({ ...base, source: 'workspaces', packageDirs: [] })).toContain(
      '0 package root(s)',
    )
  })

  it('names the exclusions when there are any, and stays quiet otherwise', () => {
    expect(
      describeWorkspaceRoots({ ...base, source: 'workspaces', excluded: ['examples/*'] }),
    ).toContain('excluded: examples/*')
    expect(describeWorkspaceRoots({ ...base, source: 'workspaces' })).not.toContain('excluded')
  })
})

describe('the subprocess gates read a script that exits non-zero', () => {
  /** A stand-in for `bun` that prints `stdout` and exits `code`. */
  const fakeBun = (stdout: string, code = 0, argLog?: string): string => {
    const p = join(root, 'fake-bun.sh')
    const log = argLog ? `printf '%s\\n' "$*" > ${JSON.stringify(argLog)}\n` : ''
    writeFileSync(
      p,
      `#!/bin/sh\n${log}cat <<'PYREON_EOF'\n${stdout}\nPYREON_EOF\nexit ${code}\n`,
    )
    chmodSync(p, 0o755)
    return p
  }

  const BUDGET_JSON = JSON.stringify({
    measured: [{ name: '@pyreon/core', current: 5000, budget: 6000 }],
    violations: [
      { name: '@pyreon/router', current: 9000, budget: 8000, overBy: 1000, overByPct: 12.5 },
    ],
    missing: [{ name: '@pyreon/new', current: 1000 }],
    failures: [{ name: '@pyreon/broken', error: 'unresolved import\nstack' }],
  })

  it('SKIPS outside the Pyreon monorepo', () => {
    // Both scripts are monorepo-internal. Reporting `Module not found`
    // in a consumer app is a gate blaming the user for its own scope.
    return Promise.all([
      runBundleBudgetsGate({ cwd: root }),
      runAuditTypesGate({ cwd: root }),
    ]).then(([b, a]) => {
      expect(b.meta.skipped).toBe(true)
      expect(a.meta.skipped).toBe(true)
      expect(b.findings, 'and produce no findings at all').toEqual([])
      expect(a.findings).toEqual([])
    })
  })

  it('parses the report from a run that exited NON-ZERO', () => {
    // The load-bearing case: `check-bundle-budgets` exits 1 precisely
    // when there is something to report, and writes its JSON anyway.
    // Treating the exit code as failure converts every real over-budget
    // finding into "the gate crashed".
    put('scripts/check-bundle-budgets.ts')
    return runBundleBudgetsGate({ cwd: root, bun: fakeBun(BUDGET_JSON, 1) }).then((r) => {
      const codes = r.findings.map((f) => f.code)
      expect(codes, 'the crash path must not be taken').not.toContain('bundle-budgets/gate-failed')
      expect(codes).toContain('bundle-budgets/over-budget')
      expect(codes).toContain('bundle-budgets/missing-budget')
      expect(codes).toContain('bundle-budgets/bundle-failed')
      expect(r.meta.scanned, 'measured plus failures').toBe(2)
    })
  })

  it('parses the same report from a run that exited ZERO', () => {
    put('scripts/check-bundle-budgets.ts')
    return runBundleBudgetsGate({ cwd: root, bun: fakeBun(BUDGET_JSON, 0) }).then((r) => {
      expect(r.findings.map((f) => f.code)).toContain('bundle-budgets/over-budget')
    })
  })

  it('grades an over-budget as an error and a missing entry as a warning', () => {
    // A new package with no budget is a bookkeeping gap; a package past
    // its budget is a regression someone has to answer for. Flattening
    // them to one severity loses the whole signal.
    put('scripts/check-bundle-budgets.ts')
    return runBundleBudgetsGate({ cwd: root, bun: fakeBun(BUDGET_JSON, 1) }).then((r) => {
      const by = (c: string) => r.findings.find((f) => f.code.endsWith(c))
      expect(by('over-budget')?.severity).toBe('error')
      expect(by('missing-budget')?.severity).toBe('warning')
      expect(by('over-budget')?.message, 'and quote the numbers').toContain('12.5%')
    })
  })

  it('reports a gate failure when the script dies with NO output', () => {
    // The complement: a genuinely broken script must be loud, not
    // silently skipped — a skipped gate is excluded from the score, so
    // silence here would inflate the grade.
    put('scripts/check-bundle-budgets.ts')
    return runBundleBudgetsGate({ cwd: root, bun: fakeBun('', 1) }).then((r) => {
      const failed = r.findings.filter((f) => f.code === 'bundle-budgets/gate-failed')
      expect(failed.length).toBe(1)
      expect(failed[0]?.severity).toBe('error')
    })
  })

  it('reports a gate failure when the script prints UNPARSEABLE output', () => {
    put('scripts/check-bundle-budgets.ts')
    return runBundleBudgetsGate({ cwd: root, bun: fakeBun('not json', 0) }).then((r) => {
      expect(r.findings.map((f) => f.code)).toContain('bundle-budgets/gate-failed')
    })
  })

  it('audit-types passes --all by default', () => {
    // The default is the whole high-risk package list. Silently passing
    // an empty selection would audit nothing and report clean.
    put('scripts/audit-types.ts')
    const argLog = join(root, 'args.txt')
    return runAuditTypesGate({ cwd: root, bun: fakeBun('[]', 0, argLog) }).then(async () => {
      const { readFileSync } = await import('node:fs')
      expect(readFileSync(argLog, 'utf8')).toContain('--all')
    })
  })

  it('audit-types passes the NAMED packages instead when given some', () => {
    put('scripts/audit-types.ts')
    const argLog = join(root, 'args.txt')
    return runAuditTypesGate({
      cwd: root,
      bun: fakeBun('[]', 0, argLog),
      packages: ['@pyreon/router'],
    }).then(async () => {
      const { readFileSync } = await import('node:fs')
      const args = readFileSync(argLog, 'utf8')
      expect(args).toContain('@pyreon/router')
      expect(args, 'and not also the whole list').not.toContain('--all')
    })
  })

  it('audit-types treats an EMPTY package list as the default', () => {
    // `--packages` with nothing after it must not audit zero packages
    // and call the result clean.
    put('scripts/audit-types.ts')
    const argLog = join(root, 'args.txt')
    return runAuditTypesGate({ cwd: root, bun: fakeBun('[]', 0, argLog), packages: [] }).then(
      async () => {
        const { readFileSync } = await import('node:fs')
        expect(readFileSync(argLog, 'utf8')).toContain('--all')
      },
    )
  })

  it('audit-types maps the script severities, and drops the OK rows', () => {
    // `OK` means the field HAS references — it is the absence of a
    // finding. Emitting it would bury the real ones under every healthy
    // field in the codebase.
    put('scripts/audit-types.ts')
    const out = JSON.stringify([
      {
        package: '@pyreon/zero',
        packageDir: 'packages/zero/zero',
        findings: [
          { package: '@pyreon/zero', interface: 'C', field: 'a', declaredIn: 'src/t.ts', declaredLine: 1, refCount: 0, severity: 'HIGH' },
          { package: '@pyreon/zero', interface: 'C', field: 'b', declaredIn: 'src/t.ts', declaredLine: 2, refCount: 0, severity: 'MEDIUM' },
          { package: '@pyreon/zero', interface: 'C', field: 'c', declaredIn: 'src/t.ts', declaredLine: 3, refCount: 0, severity: 'LOW' },
          { package: '@pyreon/zero', interface: 'C', field: 'd', declaredIn: 'src/t.ts', declaredLine: 4, refCount: 7, severity: 'OK' },
        ],
      },
    ])
    return runAuditTypesGate({ cwd: root, bun: fakeBun(out, 0) }).then((r) => {
      expect(r.findings.map((f) => f.severity).sort()).toEqual(['error', 'info', 'warning'])
      expect(r.meta.scanned).toBe(1)
    })
  })

  it('audit-types reports a gate failure rather than skipping when the script dies', () => {
    put('scripts/audit-types.ts')
    return runAuditTypesGate({ cwd: root, bun: fakeBun('boom', 3) }).then((r) => {
      expect(r.findings.map((f) => f.code)).toContain('audit-types/gate-failed')
      expect(r.meta.skipped, 'a failure is NOT a skip — a skip leaves the score').toBeFalsy()
    })
  })
})
