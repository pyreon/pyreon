/**
 * `pyreon upgrade`'s version arithmetic, and the renderer that branches
 * on colour.
 *
 * **The comparator decides which version everything is aligned TO.** A
 * wrong ordering does not error — it picks a target and rewrites every
 * `@pyreon/*` range in the user's `package.json` to it. Downgrading a
 * whole monorepo, or aligning onto a prerelease because `-rc.1` sorted
 * above the release, is a change the user asked for and did not get.
 *
 * **The colour branches are a real bug surface, not cosmetics.** Every
 * `c ? colour(s) : s` pair has to carry the SAME INFORMATION either way:
 * a skew marked only by a yellow ansi code is invisible the moment the
 * output is piped to a file or read in CI — which is exactly where
 * someone reads it when they are debugging a version problem.
 *
 * `colorEnabled` is decided once at import, so the two arms are reached
 * by re-importing the module under a different environment.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanVersion,
  compareVersions,
  computeUpgradePlan,
  resolveTarget,
  rewriteDeps,
} from '../upgrade'
import { detectSkew } from '../info'

const sign = (n: number): number => (n > 0 ? 1 : n < 0 ? -1 : 0)

/** Drop ANSI SGR sequences without writing a literal escape byte here. */
const stripAnsi = (s: string): string =>
  s.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('cleanVersion extracts a version from a range', () => {
  it('reads every range spelling npm produces', () => {
    for (const [range, want] of [
      ['1.2.3', '1.2.3'],
      ['^1.2.3', '1.2.3'],
      ['~1.2.3', '1.2.3'],
      ['>=1.2.3', '1.2.3'],
      ['1.2.3-rc.1', '1.2.3-rc.1'],
      ['^0.50.0-alpha.2', '0.50.0-alpha.2'],
    ] as Array<[string, string]>) {
      expect(cleanVersion(range), range).toBe(want)
    }
  })

  it('returns NULL for a range with no version to read', () => {
    // `workspace:*`, `file:../x`, a git URL. Returning `'0.0.0'` here
    // would make a workspace link look like an ancient release, and the
    // plan would try to "upgrade" it — breaking the link.
    for (const range of ['workspace:*', 'file:../local', '*', 'latest', '']) {
      expect(cleanVersion(range), range).toBeNull()
    }
  })
})

describe('the comparator decides what everything is aligned to', () => {
  it('orders by each segment', () => {
    expect(sign(compareVersions('1.0.0', '0.9.9'))).toBe(1)
    expect(sign(compareVersions('1.2.0', '1.10.0')), 'numeric, not lexical').toBe(-1)
    expect(sign(compareVersions('1.0.1', '1.0.1'))).toBe(0)
  })

  it('sorts a PRERELEASE below its own release', () => {
    // Otherwise `resolveTarget` picks `0.50.0-rc.1` as the highest and
    // aligns the whole repo onto a release candidate.
    expect(sign(compareVersions('0.50.0', '0.50.0-rc.1'))).toBe(1)
    expect(sign(compareVersions('0.50.0-rc.1', '0.50.0'))).toBe(-1)
    expect(sign(compareVersions('1.0.0-alpha', '1.0.0-beta'))).toBe(-1)
    expect(sign(compareVersions('1.0.0-rc.1', '1.0.0-rc.1'))).toBe(0)
  })

  it('compares the CORE before the prerelease tag', () => {
    // `1.0.0-alpha` is newer than `0.9.9-zzz`; comparing tags first
    // inverts it.
    expect(sign(compareVersions('1.0.0-alpha', '0.9.9-zzz'))).toBe(1)
  })

  it('pads a short version rather than treating it as missing', () => {
    expect(sign(compareVersions('1.0', '1.0.0'))).toBe(0)
    expect(sign(compareVersions('2', '1.9.9'))).toBe(1)
  })

  it('treats an unparseable segment as 0, never NaN', () => {
    // NaN comparisons are all false, so one bad version makes the sort
    // silently non-deterministic and the chosen target arbitrary.
    expect(Number.isNaN(compareVersions('x.y.z', '1.0.0'))).toBe(false)
    expect(sign(compareVersions('1.x.0', '1.0.0'))).toBe(0)
  })
})

describe('resolveTarget picks the highest, or honours an explicit one', () => {
  it('picks the highest installed version', () => {
    expect(resolveTarget(['0.9.0', '0.50.1', '0.50.0'])).toBe('0.50.1')
  })

  it('prefers a release over its own prerelease', () => {
    expect(resolveTarget(['0.50.0', '0.50.0-rc.1'])).toBe('0.50.0')
  })

  it('honours an explicit target even when it is lower', () => {
    // `--to` is a deliberate downgrade; overriding it would silently do
    // the opposite of what was typed.
    expect(resolveTarget(['0.50.0'], '0.49.0')).toBe('0.49.0')
  })

  it('returns NULL when there is nothing to align', () => {
    expect(resolveTarget([])).toBeNull()
  })
})

describe('the plan lists only what actually changes', () => {
  // `computeUpgradePlan` takes the FLAT map of declared ranges (deps +
  // devDeps already merged) plus an `exact` flag, not a package.json.
  const DECLARED: Record<string, string> = {
    '@pyreon/core': '^0.49.0',
    react: '^18.0.0',
    '@pyreon/cli': '^0.50.0',
  }
  const plan = (
    declared: Record<string, string> = DECLARED,
    target = '0.50.0',
    exact = false,
  ) => computeUpgradePlan(declared, target, exact)

  it('rewrites a @pyreon range that is behind', () => {
    // The control for every negative below.
    expect(plan().map((c) => c.name)).toContain('@pyreon/core')
  })

  it('leaves a NON-pyreon dependency alone', () => {
    // Rewriting `react` is not what was asked for, and it lands in the
    // same commit unnoticed.
    expect(plan().map((c) => c.name)).not.toContain('react')
  })

  it('lists nothing when everything is already aligned', () => {
    // A plan that always reports a change makes `--dry-run` useless.
    expect(plan({ '@pyreon/core': '^0.50.0' })).toEqual([])
  })

  it('leaves a workspace: range alone', () => {
    // Rewriting `workspace:*` to a version breaks the link, and the
    // package silently resolves from the registry instead of the repo.
    expect(plan({ '@pyreon/core': 'workspace:*' })).toEqual([])
  })

  it('leaves every non-version specifier alone', () => {
    // link:, file:, git and npm: aliases all resolve outside the
    // registry; rewriting one to a version breaks the resolution.
    expect(plan({
      '@pyreon/a': 'link:../a',
      '@pyreon/b': 'file:../b',
      '@pyreon/c': 'npm:other@1.0.0',
      '@pyreon/d': 'latest',
    })).toEqual([])
  })

  it('handles an empty declaration set', () => {
    expect(plan({})).toEqual([])
  })

  it('orders changes by name, so two runs produce the same output', () => {
    const names = plan({ '@pyreon/z': '^0.1.0', '@pyreon/a': '^0.1.0' }).map((c) => c.name)
    expect(names).toEqual(['@pyreon/a', '@pyreon/z'])
  })

  it('writes a CARET range by default, and an exact one on request', () => {
    // The two policies the flag selects. Pinning by accident freezes
    // every consumer of that manifest to one patch.
    expect(plan()[0]!.to.startsWith('^')).toBe(true)
    expect(plan(DECLARED, '0.50.0', true)[0]!.to).toBe('0.50.0')
  })

  it('normalises a tilde range to the target policy', () => {
    // `~0.49.0` becomes `^0.50.0`, not `~0.50.0` — alignment means one
    // policy across the repo, which is the point of the command.
    expect(plan({ '@pyreon/core': '~0.49.0' })[0]!.to).toBe('^0.50.0')
  })

  it('applies the plan to deps and devDeps without touching anything else', () => {
    const pkg = {
      dependencies: { '@pyreon/core': '^0.49.0', react: '^18.0.0' },
      devDependencies: { '@pyreon/cli': '^0.49.0' },
    }
    const out = rewriteDeps(pkg as never, plan({
      '@pyreon/core': '^0.49.0', '@pyreon/cli': '^0.49.0',
    })) as { dependencies: Record<string, string>; devDependencies: Record<string, string> }
    expect(out.dependencies['@pyreon/core']).toBe('^0.50.0')
    expect(out.devDependencies['@pyreon/cli']).toBe('^0.50.0')
    expect(out.dependencies.react, 'an unrelated dep is untouched').toBe('^18.0.0')
  })

  it('returns a NEW object rather than mutating the manifest', () => {
    // The caller re-serializes; mutating in place makes a `--dry-run`
    // that already changed something.
    const pkg = { dependencies: { '@pyreon/core': '^0.49.0' } }
    rewriteDeps(pkg as never, plan({ '@pyreon/core': '^0.49.0' }))
    expect(pkg.dependencies['@pyreon/core']).toBe('^0.49.0')
  })

  it('handles a manifest with no dependency blocks', () => {
    expect(() => rewriteDeps({} as never, plan())).not.toThrow()
  })
})

describe('version skew is detected and attributed', () => {
  const pkgs = (versions: Record<string, string>) =>
    Object.entries(versions).map(([name, version]) => ({ name, version, dir: `/n/${name}` }))

  it('reports NO skew when everything matches', () => {
    // The control for the two below.
    expect(detectSkew(pkgs({ '@pyreon/a': '1.0.0', '@pyreon/b': '1.0.0' }) as never).hasSkew)
      .toBe(false)
  })

  it('reports skew and names the DOMINANT version', () => {
    // The dominant version is what `upgrade` aligns to, so getting it
    // wrong rewrites the majority to match the minority.
    const r = detectSkew(pkgs({
      '@pyreon/a': '1.0.0',
      '@pyreon/b': '1.0.0',
      '@pyreon/c': '0.9.0',
    }) as never)
    expect(r.hasSkew).toBe(true)
    expect(r.dominant).toBe('1.0.0')
  })

  it('groups every package under its version', () => {
    const r = detectSkew(pkgs({ '@pyreon/a': '1.0.0', '@pyreon/c': '0.9.0' }) as never)
    expect(r.byVersion['0.9.0']).toEqual(['@pyreon/c'])
  })

  it('handles an empty install', () => {
    const r = detectSkew([])
    expect(r.hasSkew).toBe(false)
    expect(r.dominant, 'nothing to align to').toBeNull()
  })
})

describe('colour never carries information on its own', () => {
  /** Re-import under a chosen colour environment — the flag is import-time. */
  const withColor = async (on: boolean) => {
    vi.resetModules()
    vi.stubEnv('NO_COLOR', '')
    vi.stubEnv('FORCE_COLOR', on ? '1' : '0')
    return import('../info')
  }

  const REPORT = {
    cliVersion: '0.50.0',
    runtime: { node: 'v22.0.0', bun: '1.4.0', platform: 'darwin', arch: 'arm64' },
    project: {
      name: 'app',
      declared: { '@pyreon/core': '^0.50.0', '@pyreon/cli': '^0.49.0' },
      isZero: false,
    },
    installed: [
      { name: '@pyreon/core', version: '0.50.0', dir: '/n/core' },
      { name: '@pyreon/cli', version: '0.49.0', dir: '/n/cli' },
    ],
    skew: {
      versions: ['0.50.0', '0.49.0'],
      hasSkew: true,
      dominant: '0.50.0',
      byVersion: { '0.50.0': ['@pyreon/core'], '0.49.0': ['@pyreon/cli'] },
    },
  }

  it('renders the same FACTS with colour off as with it on', async () => {
    // Piped to a file or read in CI — exactly where someone reads this
    // when debugging a version problem — the ansi codes are gone.
    // Anything they were the only marker for is then invisible.
    const on = (await withColor(true)).formatInfo(REPORT as never)
    const off = (await withColor(false)).formatInfo(REPORT as never)
    expect(stripAnsi(on), 'both renders must carry the same text').toBe(off)
    expect(on, 'and the coloured one must actually be coloured').not.toBe(off)
  })

  it('states the skew in WORDS, not only in yellow', async () => {
    const off = (await withColor(false)).formatInfo(REPORT as never)
    expect(off).toContain('0.49.0')
    expect(off).toContain('@pyreon/cli')
  })

  it('renders a clean install without claiming skew', async () => {
    const off = (await withColor(false)).formatInfo({
      ...REPORT,
      installed: [{ name: '@pyreon/core', version: '0.50.0', dir: '/n/core' }],
      skew: {
        versions: ['0.50.0'], hasSkew: false, dominant: '0.50.0',
        byVersion: { '0.50.0': ['@pyreon/core'] },
      },
    } as never)
    expect(off).toContain('0.50.0')
  })

  it('renders with no project manifest and no packages', async () => {
    // `pyreon info` run outside a project. `name: null` must not reach
    // the output as the word "null" or "undefined".
    const off = (await withColor(false)).formatInfo({
      ...REPORT,
      project: { name: null, declared: {}, isZero: false },
      installed: [],
      skew: { versions: [], hasSkew: false, dominant: null, byVersion: {} },
    } as never)
    expect(off).not.toContain('undefined')
    expect(off).not.toContain('null')
  })
})
