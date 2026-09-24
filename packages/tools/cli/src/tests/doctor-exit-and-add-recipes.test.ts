/**
 * What `pyreon doctor --ci` returns, and what `pyreon add` tells you to
 * do next.
 *
 * The exit code is the doctor's entire CI contract, and it carries a
 * deliberate asymmetry: opt-in best-practice findings are scored and
 * displayed, and must NEVER fail a build. That is the compromise that
 * lets the advisory rules stay switched on — the moment an opinion can
 * break someone's pipeline, the honest response is to turn the whole
 * category off, and the objective findings go with it. So the filter
 * that separates them is load-bearing in both directions: letting an
 * advisory error through breaks builds over a preference, and dropping
 * a real error lets a genuine defect merge.
 *
 * `pyreon add` has a smaller but sharper failure: it installs a package
 * and then prints how to wire it up. A package with no curated recipe is
 * the common case for anything new, and the command has to still install
 * it and still say something useful — silently printing nothing after an
 * install reads as a failed install.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { add } from '../add'
import { doctor } from '../doctor'

let cwd: string

const put = (rel: string, body: string): void => {
  const abs = join(cwd, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

/** A one-package workspace whose single source file is clean or not. */
const workspace = (source: string): void => {
  put('package.json', JSON.stringify({ name: 'root', workspaces: ['packages/*'] }))
  put('packages/app/package.json', JSON.stringify({ name: 'app' }))
  put('packages/app/src/a.ts', source)
}

const DIRTY = `import { signal } from '@pyreon/reactivity'
const count = signal(0)
export function bump() { count(1) }
`
const CLEAN = `import { signal } from '@pyreon/reactivity'
const count = signal(0)
export function bump() { count.set(1) }
`

/** A lockfile holding two resolved copies of one @pyreon package. */
const duplicateLock = (): void =>
  put(
    'bun.lock',
    JSON.stringify({
      packages: {
        '@pyreon/core': ['@pyreon/core@1.0.0', {}, {}, 'sha'],
        'dep/@pyreon/core': ['@pyreon/core@0.9.0', {}, {}, 'sha'],
      },
    }),
  )

async function capture<T>(fn: () => T | Promise<T>): Promise<{ value: T; out: string }> {
  const chunks: string[] = []
  const sink = (...a: unknown[]) => {
    chunks.push(a.map(String).join(' '))
  }
  const log = vi.spyOn(console, 'log').mockImplementation(sink)
  const err = vi.spyOn(console, 'error').mockImplementation(sink)
  const value = await fn()
  log.mockRestore()
  err.mockRestore()
  return { value, out: chunks.join('\n') }
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'pyreon-doctor-'))
})
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('--ci returns the count of findings that should block a merge', () => {
  it('returns non-zero for a real error', () => {
    // The control. Without it every "returns 0" assertion below also
    // passes against a gate that finds nothing at all — which is the
    // false green this whole layer was built to close.
    workspace(CLEAN)
    duplicateLock()
    return capture(() =>
      doctor({ fix: false, json: true, ci: true, cwd, only: ['check-dedup'] }),
    ).then(({ value }) => {
      expect(value).toBeGreaterThan(0)
    })
  })

  it('returns 0 for a clean tree', () => {
    workspace(CLEAN)
    put('bun.lock', JSON.stringify({ packages: { '@pyreon/core': ['@pyreon/core@1.0.0', {}, {}, 's'] } }))
    return capture(() =>
      doctor({ fix: false, json: true, ci: true, cwd, only: ['check-dedup'] }),
    ).then(({ value }) => {
      expect(value).toBe(0)
    })
  })

  it('counts ERRORS only, not the warnings printed beside them', () => {
    // The exit code has to equal the number of things that should block
    // a merge. Counting warnings turns every advisory nudge into a red
    // build; counting nothing lets a real defect through. The report is
    // printed in the same run, so the two can be compared directly.
    workspace(DIRTY) // pyreon-patterns reports this as a WARNING
    duplicateLock() // check-dedup reports a duplicate as an ERROR
    return capture(() =>
      doctor({ fix: false, json: true, ci: true, cwd, only: ['check-dedup', 'pyreon-patterns'] }),
    ).then(({ value, out }) => {
      const report = JSON.parse(out) as {
        findings: Array<{ severity: string; category: string }>
      }
      const warnings = report.findings.filter((f) => f.severity === 'warning')
      const errors = report.findings.filter(
        (f) => f.severity === 'error' && f.category !== 'best-practices',
      )
      expect(warnings.length, 'the fixture must produce warnings too').toBeGreaterThan(0)
      expect(errors.length).toBeGreaterThan(0)
      expect(value, 'exit code counts the errors alone').toBe(errors.length)
    })
  })

  it('FAILS a --ci run that measured nothing, instead of passing it', () => {
    // Every gate skipped or matched no files. Exiting 0 there certifies
    // an unaudited tree as healthy, which is worse than no gate: the
    // green is what stops anyone looking.
    return capture(() =>
      doctor({ fix: false, json: true, ci: true, cwd, only: ['pyreon-patterns'] }),
    ).then(({ value, out }) => {
      expect(value).toBe(1)
      expect(out, 'and say what to check').toContain('measured nothing')
      expect(out).toContain('--roots')
    })
  })

  it('reports the TOTAL finding count without --ci, warnings included', () => {
    // Plain `pyreon doctor` is informational: the count is for
    // programmatic consumers and the CLI does not exit on it. It is a
    // different number from the `--ci` one on purpose — the same number
    // would mean one of the two contracts is wrong.
    workspace(DIRTY)
    return capture(() =>
      doctor({ fix: false, json: true, ci: false, cwd, only: ['pyreon-patterns'] }),
    ).then(({ value, out }) => {
      const report = JSON.parse(out) as { findings: unknown[] }
      expect(report.findings.length, 'the fixture must find something').toBeGreaterThan(0)
      expect(value).toBe(report.findings.length)
    })
  })
})

describe('the legacy single-purpose flags still select their gate', () => {
  /**
   * The gates the run actually SELECTED. Every gate appears in the
   * report — the unselected ones carry a `skipped` reason so `--json`
   * consumers can see what was left out — so the selection has to be
   * read off that reason rather than off the list's length.
   */
  const gatesIn = (out: string): string[] =>
    (JSON.parse(out) as {
      gates: Array<{ gate: string; meta: { skipReason?: string } }>
    }).gates
      .filter((g) => g.meta.skipReason !== 'skipped' && g.meta.skipReason !== 'enable with --full')
      .map((g) => g.gate)

  it('runs the whole set when no selector is given', () => {
    // The control for the four assertions below: each of them means
    // "only this one", which is only meaningful if the default is more.
    workspace(CLEAN)
    return capture(() => doctor({ fix: false, json: true, ci: false, cwd })).then(({ out }) => {
      expect(gatesIn(out).length).toBeGreaterThan(1)
    })
  })

  for (const [flag, gate] of [
    ['auditTests', 'audit-tests'],
    ['checkIslands', 'islands-audit'],
    ['checkSsg', 'ssg-audit'],
    ['checkContent', 'content-audit'],
    ['checkNative', 'native-audit'],
  ] as Array<[string, string]>) {
    it(`--${flag} narrows the run to ${gate}`, () => {
      // These are documented as still working, and a CI script pinned to
      // one of them would otherwise start running the whole suite —
      // slower, and failing on gates it never opted into.
      workspace(CLEAN)
      return capture(() =>
        doctor({ fix: false, json: true, ci: false, cwd, [flag]: true } as never),
      ).then(({ out }) => {
        expect(gatesIn(out)).toEqual([gate])
      })
    })
  }

  it('lets an explicit --only WIN over a legacy flag', () => {
    // Passing both is a contradiction; resolving it to the modern flag
    // is the only reading that lets someone migrate a script one line at
    // a time.
    workspace(CLEAN)
    return capture(() =>
      doctor({
        fix: false, json: true, ci: false, cwd,
        only: ['pyreon-patterns'],
        checkIslands: true,
      } as never),
    ).then(({ out }) => {
      expect(gatesIn(out)).toEqual(['pyreon-patterns'])
    })
  })

  it('combines several legacy flags rather than taking the first', () => {
    workspace(CLEAN)
    return capture(() =>
      doctor({ fix: false, json: true, ci: false, cwd, checkSsg: true, checkNative: true } as never),
    ).then(({ out }) => {
      expect(gatesIn(out).sort()).toEqual(['native-audit', 'ssg-audit'])
    })
  })
})

describe('pyreon add tells you what to do after it installs', () => {
  const run = (opts: { packages: string[]; dryRun?: boolean; json?: boolean }) =>
    capture(() =>
      add({
        packages: opts.packages,
        cwd,
        dryRun: opts.dryRun ?? true,
        json: opts.json ?? false,
      }),
    )

  it('prints the setup recipe for a package that has one', () => {
    // The control, and the reason the command exists over a plain
    // `bun add`: the install is the easy half.
    return run({ packages: ['@pyreon/query'] }).then(({ value, out }) => {
      expect(value).toBe(0)
      expect(out).toContain('@pyreon/query')
      expect(out, 'a usage snippet, not just a name').toContain('use')
      expect(out).toContain('pyreon.dev')
    })
  })

  it('still installs a package with NO curated recipe, and points at the docs', () => {
    // Anything newly published lands here. Printing nothing after an
    // install reads as a failed install, and sends the user to check a
    // node_modules directory that is perfectly fine.
    return run({ packages: ['@pyreon/not-a-real-package'] }).then(({ value, out }) => {
      expect(value).toBe(0)
      expect(out).toContain('@pyreon/not-a-real-package')
      expect(out).toContain('Installed.')
      expect(out).toContain('https://pyreon.dev/docs')
    })
  })

  it('normalises a bare name to the @pyreon scope', () => {
    // `pyreon add query` is what people type. Installing a package
    // literally called `query` from npm is a different package
    // altogether — a real supply-chain footgun, not a typo.
    return run({ packages: ['query'] }).then(({ out }) => {
      expect(out).toContain('@pyreon/query')
    })
  })

  it('does NOT run the install under --dry-run, and says so', () => {
    // The flag exists to show the command; running it anyway would make
    // the flag actively dangerous.
    return run({ packages: ['@pyreon/query'], dryRun: true }).then(({ out }) => {
      expect(out).toContain('--dry-run')
      expect(out, 'and still show the command it would have run').toMatch(
        /\$ \w+ \w+ @pyreon\/query/,
      )
    })
  })

  it('emits machine-readable JSON, with a null recipe when there is none', () => {
    // An assistant reads this to decide what to wire up. `null` says
    // "nothing curated"; omitting the key says "I did not look".
    return run({ packages: ['@pyreon/not-a-real-package'], json: true }).then(({ out }) => {
      const rep = JSON.parse(out) as {
        packages: string[]
        command: string
        dryRun: boolean
        recipes: Array<{ package: string; recipe: unknown }>
      }
      expect(rep.packages).toEqual(['@pyreon/not-a-real-package'])
      expect(rep.recipes[0]?.recipe).toBeNull()
      expect(rep.command, 'and the exact command to run').toContain('@pyreon/not-a-real-package')
      expect(rep.dryRun).toBe(true)
    })
  })

  it('carries the recipe through JSON for a package that has one', () => {
    // The control for the null above — an always-null field is the same
    // as no field.
    return run({ packages: ['@pyreon/query'], json: true }).then(({ out }) => {
      const rep = JSON.parse(out) as { recipes: Array<{ recipe: unknown }> }
      expect(rep.recipes[0]?.recipe).not.toBeNull()
    })
  })

  it('handles several packages in one call', () => {
    return run({ packages: ['@pyreon/query', 'not-a-real-package'], json: true }).then(({ out }) => {
      const rep = JSON.parse(out) as { packages: string[] }
      expect(rep.packages).toHaveLength(2)
    })
  })
})
