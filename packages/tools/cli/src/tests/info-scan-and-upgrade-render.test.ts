/**
 * What `pyreon info` sees in `node_modules`, and what `pyreon upgrade`
 * prints once it has decided.
 *
 * Both commands exist for one situation: two copies of a `@pyreon/*`
 * package at different versions, which is not a cosmetic problem. Two
 * copies of `@pyreon/reactivity` are two module instances — a signal
 * created by one is invisible to an effect in the other — and the
 * symptom is a component that renders and never updates. `info` is how
 * you find out, and `upgrade` is how you fix it.
 *
 * So the scan is the load-bearing half. A package that gets dropped
 * because its `package.json` is shaped unexpectedly does not appear in
 * the skew report, and the one version that is actually causing the bug
 * is the one you never see. And the render is the other half: the report
 * is read in a terminal, piped to a file, and pasted into an issue, so
 * anything that only exists as a colour is gone by the time someone
 * tries to help.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectInfo, detectSkew, scanInstalledPyreon } from '../info'
import { compareVersions } from '../upgrade'

let root: string

const ESC = String.fromCharCode(27)
const stripAnsi = (s: string): string =>
  s.replace(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '')

/** Install `@pyreon/<dir>` with the given package.json body (raw text). */
const install = (dir: string, body: string): void => {
  const d = join(root, 'node_modules', '@pyreon', dir)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'package.json'), body)
}

const installed = (dir: string, version: string): void =>
  install(dir, JSON.stringify({ name: `@pyreon/${dir}`, version }))

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-info-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('the installed scan is what the whole skew report rests on', () => {
  it('reads name and version from each installed package', () => {
    // The control. Every "and skips X" below is worthless against a scan
    // that finds nothing.
    installed('core', '1.0.0')
    installed('router', '1.0.0')
    expect(scanInstalledPyreon(root)).toEqual([
      { name: '@pyreon/core', version: '1.0.0' },
      { name: '@pyreon/router', version: '1.0.0' },
    ])
  })

  it('returns nothing when the scope directory is absent', () => {
    // Running outside a project, or before `bun install`. A throw here
    // takes down `pyreon info` for the person trying to work out why
    // their app is broken.
    expect(scanInstalledPyreon(root)).toEqual([])
  })

  it('skips the package manager DOTDIRS inside the scope', () => {
    // `node_modules/@pyreon/.bin` and `.cache` are not packages.
    // Reporting `@pyreon/.bin` at a made-up version puts a phantom entry
    // in the skew report and can invent a version that does not exist.
    installed('core', '1.0.0')
    mkdirSync(join(root, 'node_modules/@pyreon/.bin'), { recursive: true })
    mkdirSync(join(root, 'node_modules/@pyreon/.cache'), { recursive: true })
    expect(scanInstalledPyreon(root).map((p) => p.name)).toEqual(['@pyreon/core'])
  })

  it('falls back to the DIRECTORY name when the manifest has no name', () => {
    // A partially-written package (an install interrupted midway) still
    // occupies the directory, and its version is exactly the kind of
    // stray copy this command exists to surface.
    install('core', JSON.stringify({ version: '0.9.0' }))
    expect(scanInstalledPyreon(root)).toEqual([{ name: '@pyreon/core', version: '0.9.0' }])
  })

  it('ignores a non-string name rather than rendering it', () => {
    install('core', JSON.stringify({ name: 42, version: '0.9.0' }))
    expect(scanInstalledPyreon(root)[0]?.name).toBe('@pyreon/core')
  })

  it('DROPS a package with no readable version', () => {
    // A version is the only thing this report is about. Emitting the
    // package with `null` would put the word "null" in the version
    // column and make the skew count wrong.
    install('core', JSON.stringify({ name: '@pyreon/core' }))
    install('router', JSON.stringify({ name: '@pyreon/router', version: 1 }))
    install('head', 'not json at all')
    installed('good', '1.0.0')
    expect(scanInstalledPyreon(root).map((p) => p.name)).toEqual(['@pyreon/good'])
  })

  it('orders the list by name, so two runs read the same', () => {
    installed('router', '1.0.0')
    installed('core', '1.0.0')
    installed('atlas', '1.0.0')
    expect(scanInstalledPyreon(root).map((p) => p.name)).toEqual([
      '@pyreon/atlas',
      '@pyreon/core',
      '@pyreon/router',
    ])
  })
})

describe('skew ordering puts the alignment target first', () => {
  const pkgs = (entries: Array<[string, string]>) =>
    entries.map(([name, version]) => ({ name, version }))

  it('names the version MOST packages sit on as dominant', () => {
    // `upgrade` aligns everything to this. Picking the minority version
    // would move most of the tree to reach one straggler — the opposite
    // of the intended fix, and a far larger change than the user asked
    // for.
    const s = detectSkew(pkgs([
      ['@pyreon/a', '0.9.0'],
      ['@pyreon/b', '1.0.0'],
      ['@pyreon/c', '1.0.0'],
    ]))
    expect(s.dominant).toBe('1.0.0')
    expect(s.versions[0]).toBe('1.0.0')
    expect(s.hasSkew).toBe(true)
  })

  it('orders the same way regardless of the input order', () => {
    // The comparator has two directions, and a sort that is right in one
    // of them silently reverses the whole report for half of all inputs.
    const a = detectSkew(pkgs([
      ['@pyreon/a', '1.0.0'],
      ['@pyreon/b', '1.0.0'],
      ['@pyreon/c', '0.9.0'],
    ]))
    const b = detectSkew(pkgs([
      ['@pyreon/c', '0.9.0'],
      ['@pyreon/a', '1.0.0'],
      ['@pyreon/b', '1.0.0'],
    ]))
    expect(a.versions).toEqual(b.versions)
    expect(a.dominant).toBe('1.0.0')
  })

  it('reports NO skew for a consistent install', () => {
    // The quiet direction: warning about a healthy tree sends people
    // chasing a problem they do not have.
    const s = detectSkew(pkgs([['@pyreon/a', '1.0.0'], ['@pyreon/b', '1.0.0']]))
    expect(s.hasSkew).toBe(false)
    expect(s.dominant).toBe('1.0.0')
  })

  it('handles an empty install without inventing a dominant version', () => {
    const s = detectSkew([])
    expect(s).toEqual({ versions: [], hasSkew: false, byVersion: {}, dominant: null })
  })
})

describe('collectInfo reports the project it was pointed at', () => {
  it('reads the project name and its declared @pyreon ranges', () => {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'my-app', dependencies: { '@pyreon/zero': '^1.0.0' } }),
    )
    installed('zero', '1.0.0')
    const r = collectInfo(root)
    expect(r.project.name).toBe('my-app')
    expect(r.project.isZero, 'a zero app is worth naming — its skew story differs').toBe(true)
    expect(r.installed).toHaveLength(1)
  })

  it('reports a NULL name rather than the word undefined', () => {
    // `pyreon info` run in a directory with no manifest, or one with no
    // name field. Rendering "undefined" as the project name reads as a
    // bug in the tool rather than an absent field.
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: {} }))
    expect(collectInfo(root).project.name).toBeNull()
  })

  it('reports a null name for a non-string name field', () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: { x: 1 } }))
    expect(collectInfo(root).project.name).toBeNull()
  })

  it('works with no manifest at all', () => {
    const r = collectInfo(root)
    expect(r.project.name).toBeNull()
    expect(r.project.isZero).toBe(false)
    expect(r.installed).toEqual([])
  })
})

describe('version comparison decides what everything is aligned to', () => {
  it('compares each numeric segment in BOTH directions', () => {
    // A comparator that is right one way and wrong the other sorts
    // correctly for half of all inputs, which is exactly the shape that
    // survives a casual test.
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1)
    expect(compareVersions('1.2.0', '1.10.0'), 'numeric, not lexical').toBe(-1)
    expect(compareVersions('1.0.9', '1.0.10')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })

  it('pads a SHORT version on either side', () => {
    // `1.2` and `1.2.0` are the same release. Treating the missing
    // segment as absent rather than zero makes one of them sort below
    // the other, and `upgrade` then aligns the whole tree to a version
    // that is identical to the one it left.
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.0', '1.2')).toBe(0)
    expect(compareVersions('1.2', '1.2.1')).toBe(-1)
    expect(compareVersions('1.2.1', '1.2')).toBe(1)
  })

  it('sorts a prerelease BELOW its own release, both ways round', () => {
    // Otherwise `pyreon upgrade` picks an rc as the alignment target and
    // moves a whole project onto a prerelease nobody asked for.
    expect(compareVersions('1.0.0-rc.1', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0', '1.0.0-rc.1')).toBe(1)
  })

  it('orders two prereleases against each other, both ways round', () => {
    expect(compareVersions('1.0.0-rc.1', '1.0.0-rc.2')).toBe(-1)
    expect(compareVersions('1.0.0-rc.2', '1.0.0-rc.1')).toBe(1)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
    expect(compareVersions('1.0.0-rc.1', '1.0.0-rc.1')).toBe(0)
  })

  it('treats an unparseable segment as zero rather than NaN', () => {
    // NaN poisons every comparison it touches: `NaN - 0` is NaN, which is
    // neither < 0 nor > 0, so the sort silently keeps the input order and
    // the "highest" version is whichever happened to be first.
    expect(compareVersions('1.x.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.x.0')).toBe(0)
    expect(compareVersions('1.x.0', '1.1.0')).toBe(-1)
  })
})

describe('the upgrade report carries its meaning in words, not colour', () => {
  /** Re-import under a chosen colour environment — the flag is import-time. */
  const withColor = async (on: boolean) => {
    vi.resetModules()
    vi.stubEnv('NO_COLOR', '')
    vi.stubEnv('FORCE_COLOR', on ? '1' : '0')
    return import('../upgrade')
  }

  const capture = async (on: boolean, cwd: string): Promise<{ out: string; code: number }> => {
    const mod = await withColor(on)
    const chunks: string[] = []
    const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      chunks.push(a.map(String).join(' '))
    })
    const code = mod.upgrade({ cwd })
    log.mockRestore()
    return { out: chunks.join('\n'), code }
  }

  const project = (deps: Record<string, string>, install: Array<[string, string]>): void => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', dependencies: deps }))
    for (const [dir, v] of install) installed(dir, v)
  }

  it('lists the packages it would move, with the from and to versions', () => {
    // The control, and the thing a reader acts on: a plan that says "3
    // packages" without naming them cannot be reviewed before `--write`.
    project({ '@pyreon/core': '^0.9.0', '@pyreon/router': '^1.0.0' }, [
      ['core', '0.9.0'],
      ['router', '1.0.0'],
    ])
    return capture(false, root).then(({ out, code }) => {
      expect(code).toBe(0)
      expect(out).toContain('@pyreon/core')
      expect(out).toContain('0.9.0')
      expect(out).toContain('1.0.0')
    })
  })

  it('renders the SAME text with colour on as with it off', () => {
    // Piped to a file or pasted into an issue — which is exactly when
    // someone is asking for help with a version problem — the escape
    // codes are gone. Anything they were the only marker for goes with
    // them.
    project({ '@pyreon/core': '^0.9.0' }, [['core', '0.9.0'], ['router', '1.0.0']])
    return capture(true, root).then(({ out: on }) =>
      capture(false, root).then(({ out: off }) => {
        expect(stripAnsi(on), 'same words either way').toBe(off)
        expect(on, 'and the coloured run must actually be coloured').not.toBe(off)
      }),
    )
  })

  it('warns that the INSTALLED tree is still split even when the manifest is aligned', () => {
    // The trap this command can walk a user into. `upgrade` rewrites
    // manifests, so a project whose ranges already agree gets "already
    // aligned" — while `node_modules` still holds two copies and the
    // duplicate-instance bug is still live. Stopping at the tick is
    // exactly the wrong conclusion, so the reminder to install is the
    // load-bearing half of that message.
    project({ '@pyreon/core': '^1.0.0' }, [['core', '1.0.0'], ['router', '0.9.0']])
    return capture(false, root).then(({ out, code }) => {
      expect(code).toBe(0)
      expect(out).toContain('already on 1.0.0')
      expect(out, 'and must not stop at the tick').toContain('2 installed versions')
      expect(out).toContain('install')
    })
  })

  it('says everything is aligned, with no install reminder, when it really is', () => {
    // The quiet direction, and the control for the spec above: the
    // reminder must appear only when the tree is genuinely split, or it
    // is noise that teaches people to skip the line that matters.
    project({ '@pyreon/core': '^1.0.0' }, [['core', '1.0.0']])
    return capture(false, root).then(({ out, code }) => {
      expect(code).toBe(0)
      expect(out).toContain('already on 1.0.0')
      expect(out).not.toContain('installed versions')
    })
  })

  it('is a DRY RUN by default and names the flag that applies it', () => {
    // The command edits package.json. Doing that without being asked —
    // or doing nothing without saying how to ask — are both worse than
    // the extra step.
    const manifest = join(root, 'package.json')
    project({ '@pyreon/core': '^0.9.0' }, [['core', '0.9.0'], ['router', '1.0.0']])
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const before = readFileSync(manifest, 'utf8')
    return capture(false, root).then(({ out }) => {
      expect(readFileSync(manifest, 'utf8'), 'nothing written').toBe(before)
      expect(out).toContain('--write')
    })
  })

  it('fails when there is no version to align to', () => {
    // A workspace-only project has no resolvable target. Exiting 0 with
    // an empty plan would read as "already aligned".
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'app', dependencies: { '@pyreon/core': 'workspace:*' } }),
    )
    return capture(false, root).then(({ code }) => {
      expect(code).toBe(1)
    })
  })

  it('defaults to the process cwd when none is given', () => {
    // The ordinary invocation. A default that resolved somewhere else
    // would report on a project the user is not in.
    project({ '@pyreon/core': '^0.9.0' }, [['core', '0.9.0'], ['router', '1.0.0']])
    const spy = vi.spyOn(process, 'cwd').mockReturnValue(root)
    return withColor(false)
      .then((mod) => {
        const chunks: string[] = []
        const log = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
          chunks.push(a.map(String).join(' '))
        })
        const code = mod.upgrade()
        log.mockRestore()
        return { out: chunks.join('\n'), code }
      })
      .then(({ out, code }) => {
        expect(spy).toHaveBeenCalled()
        expect(code).toBe(0)
        expect(out).toContain('@pyreon/core')
      })
  })
})
