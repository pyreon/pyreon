/**
 * `pyreon upgrade`'s reporting layer — the half that decides what a caller
 * sees and whether the file is written.
 *
 * `upgrade.test.ts` covers the pure planning core well. The renderer around
 * it was untested, and it is not a formatting detail: the `--json` branch
 * carries its OWN `writeFileSync`, separate from the human path's. A bug
 * there makes `pyreon upgrade --json --write` report a set of changes and
 * write none of them — a silent no-op for exactly the scripted caller who
 * chose `--json` because they were not going to read the output.
 *
 * The other contracts here fail just as quietly:
 *
 *   * **`--json` must be the only thing on stdout**, or a consumer's
 *     `JSON.parse` fails on the human table printed beside it.
 *   * **An unresolvable target returns 1**, and says which of the two
 *     reasons it was. Returning 0 there tells a script the alignment
 *     succeeded when nothing happened.
 *   * **`workspace:` ranges are never rewritten.** This runs in monorepos;
 *     turning `workspace:*` into `^0.52.0` breaks every internal link, and
 *     the failure appears at install time, far from the command that caused
 *     it.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { upgrade } from '../upgrade'

let cwd: string
let logs: string[]
let errs: string[]

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'pyreon-upgrade-'))
  logs = []
  errs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => errs.push(a.join(' ')))
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const writePkg = (pkg: Record<string, unknown>): void =>
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8')

const readPkg = (): Record<string, unknown> =>
  JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as Record<string, unknown>

const LAGGING = {
  name: 'app',
  dependencies: { '@pyreon/core': '^0.30.0', '@pyreon/router': '^0.37.0' },
}

describe('--json is a machine surface', () => {
  it('emits ONE parseable object and no human table beside it', () => {
    writePkg(LAGGING)
    const code = upgrade({ cwd, json: true })

    expect(code).toBe(0)
    expect(logs, 'exactly one line on stdout').toHaveLength(1)
    const out = JSON.parse(logs[0]!) as {
      ok: boolean
      target: string
      write: boolean
      changes: { name: string; from: string; to: string }[]
    }
    expect(out.ok).toBe(true)
    expect(out.target).toBe('0.37.0')
    expect(out.write, 'a dry run must report write:false').toBe(false)
    expect(out.changes).toEqual([{ name: '@pyreon/core', from: '^0.30.0', to: '^0.37.0' }])
  })

  it('--json --write ACTUALLY writes the file', () => {
    // The json branch has its own writeFileSync. A caller scripting the
    // command is not reading the output, so a no-op here is invisible until
    // the versions are still skewed after a "successful" run.
    writePkg(LAGGING)
    expect(upgrade({ cwd, json: true, write: true })).toBe(0)

    const deps = readPkg().dependencies as Record<string, string>
    expect(deps['@pyreon/core'], 'the laggard must be aligned on disk').toBe('^0.37.0')
    expect(JSON.parse(logs[0]!).write).toBe(true)
  })

  it('--json without --write leaves the file untouched', () => {
    // The control. Without it, "json --write writes" passes against a
    // command that writes unconditionally — which would be far worse.
    writePkg(LAGGING)
    upgrade({ cwd, json: true })
    expect((readPkg().dependencies as Record<string, string>)['@pyreon/core']).toBe('^0.30.0')
  })

  it('reports ok:false with a reason when no target resolves', () => {
    // A script needs to distinguish "aligned" from "could not tell what to
    // align to". Both used to be silence.
    writePkg({ name: 'app', dependencies: { lodash: '^4.0.0' } })
    const code = upgrade({ cwd, json: true })

    expect(code, 'nothing to do is still a failure to align').toBe(1)
    const out = JSON.parse(logs[0]!) as { ok: boolean; reason: string; changes: unknown[] }
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('no-target')
    expect(out.changes).toEqual([])
  })

  it('an INVALID --to is rejected rather than falling back to the highest', () => {
    // Falling back would silently align to a version the caller did not ask
    // for — worse than refusing, because the caller believes they pinned it.
    writePkg(LAGGING)
    expect(upgrade({ cwd, json: true, to: 'latest' })).toBe(1)
    expect(JSON.parse(logs[0]!).reason).toBe('no-target')
    expect((readPkg().dependencies as Record<string, string>)['@pyreon/core']).toBe('^0.30.0')
  })
})

describe('the human path reports the plan and how to apply it', () => {
  it('a dry run prints each change and does NOT write', () => {
    writePkg(LAGGING)
    const code = upgrade({ cwd })

    expect(code).toBe(0)
    const out = logs.join('\n')
    expect(out).toContain('@pyreon/core')
    expect(out, 'both sides of the change').toContain('^0.30.0')
    expect(out).toContain('^0.37.0')
    expect(out, 'and the command that applies it').toContain('--write')
    expect((readPkg().dependencies as Record<string, string>)['@pyreon/core']).toBe('^0.30.0')
  })

  it('--write applies and tells the reader to install', () => {
    // A rewritten package.json without an install leaves node_modules on the
    // old versions — the skew the command exists to fix, still present.
    writePkg(LAGGING)
    expect(upgrade({ cwd, write: true })).toBe(0)
    expect((readPkg().dependencies as Record<string, string>)['@pyreon/core']).toBe('^0.37.0')
    expect(logs.join('\n')).toMatch(/install/i)
  })

  it('says so, and returns 0, when everything is already aligned', () => {
    // Not an error: a no-op upgrade is the healthy state, and a non-zero
    // code here would fail a pipeline that runs it defensively.
    writePkg({ name: 'app', dependencies: { '@pyreon/core': '^0.37.0', '@pyreon/router': '^0.37.0' } })
    expect(upgrade({ cwd })).toBe(0)
    expect(logs.join('\n')).toContain('already on 0.37.0')
  })

  it('an unresolvable target goes to STDERR with a reason naming --to', () => {
    // Two different causes, two different messages — "no @pyreon deps" and
    // "your --to is malformed" need different fixes.
    writePkg(LAGGING)
    expect(upgrade({ cwd, to: 'newest' })).toBe(1)
    expect(errs.join('\n')).toContain('--to')
    expect(logs, 'an error must not be reported on stdout').toEqual([])
  })

  it('no @pyreon deps at all says THAT, not that --to is bad', () => {
    writePkg({ name: 'app', dependencies: { lodash: '^4.0.0' } })
    expect(upgrade({ cwd })).toBe(1)
    expect(errs.join('\n')).toContain('No @pyreon/* dependencies')
  })
})

describe('what upgrade must never rewrite', () => {
  it('leaves workspace: ranges alone', () => {
    // This runs in monorepos. Turning `workspace:*` into a version range
    // breaks every internal link, and the failure surfaces at install time
    // rather than here.
    writePkg({
      name: 'app',
      dependencies: { '@pyreon/core': 'workspace:*', '@pyreon/router': '^0.30.0' },
      devDependencies: { '@pyreon/cli': 'workspace:^' },
    })
    upgrade({ cwd, write: true })

    const pkg = readPkg()
    expect((pkg.dependencies as Record<string, string>)['@pyreon/core']).toBe('workspace:*')
    expect((pkg.devDependencies as Record<string, string>)['@pyreon/cli']).toBe('workspace:^')
  })

  it('leaves non-@pyreon dependencies alone', () => {
    writePkg({ name: 'app', dependencies: { '@pyreon/core': '^0.30.0', vite: '^0.37.0' } })
    upgrade({ cwd, write: true })
    expect((readPkg().dependencies as Record<string, string>)['vite']).toBe('^0.37.0')
  })

  it('preserves key ORDER and the rest of package.json', () => {
    // A rewrite that reorders or drops fields turns a one-line upgrade into
    // an unreviewable diff, and can lose `scripts` or `exports` entirely.
    writePkg({
      name: 'app',
      version: '1.0.0',
      scripts: { build: 'vite build' },
      dependencies: { zod: '^3.0.0', '@pyreon/core': '^0.30.0', axios: '^1.0.0' },
    })
    upgrade({ cwd, write: true })

    const pkg = readPkg()
    expect(Object.keys(pkg)).toEqual(['name', 'version', 'scripts', 'dependencies'])
    expect(Object.keys(pkg.dependencies as object), 'dependency order preserved').toEqual([
      'zod',
      '@pyreon/core',
      'axios',
    ])
    expect(pkg.scripts).toEqual({ build: 'vite build' })
  })

  it('--exact pins without a caret', () => {
    writePkg(LAGGING)
    upgrade({ cwd, write: true, exact: true })
    expect((readPkg().dependencies as Record<string, string>)['@pyreon/core']).toBe('0.37.0')
  })

  it('a missing package.json is a clean failure, not a crash', () => {
    // `pyreon upgrade` run from the wrong directory.
    expect(() => upgrade({ cwd })).not.toThrow()
    expect(upgrade({ cwd })).toBe(1)
  })
})
