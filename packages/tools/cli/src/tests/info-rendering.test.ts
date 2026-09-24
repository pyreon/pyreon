/**
 * `pyreon info`'s report rendering, and the `--json` surface.
 *
 * `info.test.ts` covers `detectSkew` and the three headline states. What it
 * does not reach is the rendering that decides what a user actually LEARNS,
 * and this command exists for one diagnostic in particular: version skew is
 * what later fires `[Pyreon] Duplicate @pyreon/X detected` at runtime, in a
 * stack trace that points at the guard rather than at the mismatch. `info`
 * is where that becomes legible.
 *
 * So the branches here are the difference between a useful report and a
 * misleading one:
 *
 *   * **Off-version packages are highlighted**, and the dominant version is
 *     not. A report that paints everything the same makes the reader scan
 *     twenty rows for the two that differ.
 *   * **A long list truncates to `+N more`** — but the COUNT must still be
 *     right, or the reader concludes fewer packages are affected than are.
 *   * **Declared-but-not-installed says so.** An empty `node_modules` and a
 *     project with no Pyreon deps look identical otherwise, and the remedy
 *     (run install) only applies to one of them.
 */
import { describe, expect, it, vi } from 'vitest'
import { detectSkew, formatInfo, type InfoReport, type InstalledPyreonPkg } from '../info'

const ESC = String.fromCharCode(27)

const pkgs = (spec: Record<string, string>): InstalledPyreonPkg[] =>
  Object.entries(spec).map(([name, version]) => ({ name, version }))

const report = (over: Partial<InfoReport> = {}): InfoReport => {
  const installed = over.installed ?? pkgs({ '@pyreon/core': '0.52.0' })
  return {
    cliVersion: '0.52.0',
    runtime: { node: '24.0.0', bun: null, platform: 'darwin', arch: 'arm64' },
    project: { name: 'app', declared: {}, isZero: false },
    installed,
    skew: detectSkew(installed),
    ...over,
  } as InfoReport
}

describe('detectSkew orders by how many packages sit on each version', () => {
  it('the DOMINANT version is the one most packages are on, not the highest', () => {
    // The dominant version is the alignment target the report leads with.
    // Picking the highest instead would tell a user to move twelve packages
    // to match two.
    //
    // The majority version is deliberately the one that sorts LAST
    // alphabetically. With the majority also sorting first, a name-ordered
    // implementation produces the same answer and the spec proves nothing —
    // verified by bisect, which is why the fixture is this way round.
    const skew = detectSkew(
      pkgs({ a: '0.52.0', b: '0.52.0', c: '0.52.0', d: '0.50.0' }),
    )
    expect(skew.hasSkew).toBe(true)
    expect(skew.dominant, 'three beat one, and name order would say 0.50.0').toBe('0.52.0')
    expect(skew.versions[0]).toBe('0.52.0')
  })

  it('groups every package under its version', () => {
    const skew = detectSkew(pkgs({ a: '1.0.0', b: '2.0.0', c: '1.0.0' }))
    expect(skew.byVersion['1.0.0']).toEqual(['a', 'c'])
    expect(skew.byVersion['2.0.0']).toEqual(['b'])
  })

  it('one version across many packages is NOT skew', () => {
    // The control. A false positive here sends a user to fix a healthy tree.
    const skew = detectSkew(pkgs({ a: '1.0.0', b: '1.0.0', c: '1.0.0' }))
    expect(skew.hasSkew).toBe(false)
    expect(skew.dominant).toBe('1.0.0')
  })
})

describe('the skew report tells the reader which packages are wrong', () => {
  it('names every version and the packages on it', () => {
    const out = formatInfo(
      report({ installed: pkgs({ '@pyreon/core': '0.50.0', '@pyreon/router': '0.52.0' }) }),
    )
    expect(out).toContain('Version skew')
    expect(out).toContain('0.50.0')
    expect(out).toContain('0.52.0')
    expect(out).toContain('@pyreon/core')
    expect(out).toContain('@pyreon/router')
  })

  it('points at the duplicate-instance guard, which is how skew actually surfaces', () => {
    // The connection a user cannot make on their own: the runtime error
    // names the guard, not the mismatch.
    const out = formatInfo(
      report({ installed: pkgs({ a: '0.50.0', b: '0.52.0' }) }),
    )
    expect(out).toContain('Duplicate @pyreon/X detected')
    expect(out).toMatch(/Align them to one version/)
  })

  it('truncates a long list but keeps the COUNT honest', () => {
    // `+N more` is the only thing telling the reader how many are affected.
    // An off-by-one here understates the blast radius of the fix.
    const many: Record<string, string> = { '@pyreon/keep': '1.0.0' }
    for (let i = 0; i < 7; i++) many[`@pyreon/p${i}`] = '2.0.0'
    const out = formatInfo(report({ installed: pkgs(many) }))

    expect(out, 'seven shown as four plus three').toContain('+3 more')
  })

  it('does NOT truncate a list of four', () => {
    // The boundary. Truncating at the threshold would hide a package while
    // saying `+0 more`.
    const four: Record<string, string> = { '@pyreon/keep': '1.0.0' }
    for (let i = 0; i < 4; i++) four[`@pyreon/p${i}`] = '2.0.0'
    const out = formatInfo(report({ installed: pkgs(four) }))
    expect(out).not.toContain('more')
    for (let i = 0; i < 4; i++) expect(out).toContain(`@pyreon/p${i}`)
  })

  it('confirms alignment when there is no skew', () => {
    const out = formatInfo(report({ installed: pkgs({ a: '0.52.0', b: '0.52.0' }) }))
    expect(out).toContain('All @pyreon packages on 0.52.0')
    expect(out).not.toContain('Version skew')
  })
})

describe('the runtime and project lines adapt to what is present', () => {
  it('shows a bun line only when running under bun', () => {
    const withBun = formatInfo(
      report({ runtime: { node: '24.0.0', bun: '1.4.0', platform: 'darwin', arch: 'arm64' } }),
    )
    expect(withBun).toContain('bun')
    expect(withBun).toContain('v1.4.0')

    // The control — an absent bun must not render an empty or `vnull` row.
    const withoutBun = formatInfo(report())
    expect(withoutBun).not.toContain('vnull')
    expect(withoutBun.split('\n').some((l) => l.trim().startsWith('bun'))).toBe(false)
  })

  it('marks a zero app, and does not mark a plain one', () => {
    const zero = formatInfo(
      report({ project: { name: 'shop', declared: { '@pyreon/zero': '^1' }, isZero: true } }),
    )
    expect(zero).toContain('(zero app)')
    expect(formatInfo(report())).not.toContain('(zero app)')
  })

  it('says so when package.json has no name, rather than printing nothing', () => {
    const out = formatInfo(report({ project: { name: null, declared: {}, isZero: false } }))
    expect(out).toContain('(no package.json name)')
  })
})

describe('an empty node_modules is distinguished from having no deps', () => {
  it('reports the declared count and the remedy when nothing is installed', () => {
    // These two states look identical without this branch, and only one of
    // them is fixed by running install.
    const out = formatInfo(
      report({
        installed: [],
        project: { name: 'app', declared: { '@pyreon/core': '^1', '@pyreon/router': '^1' }, isZero: false },
      }),
    )
    expect(out).toContain('No @pyreon/* packages installed')
    expect(out).toContain('2 declared')
    expect(out).toMatch(/run install/i)
  })

  it('omits the remedy when nothing is declared either', () => {
    // Telling a project with no Pyreon dependencies to run install is
    // advice for a problem it does not have.
    const out = formatInfo(report({ installed: [] }))
    expect(out).toContain('No @pyreon/* packages installed')
    expect(out).not.toMatch(/declared in package\.json/)
  })
})

describe('info() honours --json', () => {
  it('emits the whole report as one parseable object', async () => {
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.join(' ')))
    const { info } = await import('../info')

    const code = info({ json: true })
    expect(code, 'info is non-gating — always 0').toBe(0)
    expect(logs).toHaveLength(1)

    const parsed = JSON.parse(logs[0]!) as InfoReport
    expect(parsed.runtime.platform).toBe(process.platform)
    expect(parsed.skew, 'the skew report is the point of the command').toBeDefined()
    expect(Array.isArray(parsed.installed)).toBe(true)
    vi.restoreAllMocks()
  })

  it('the human path emits no escape codes when stdout is not a TTY', async () => {
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.join(' ')))
    const { info } = await import('../info')

    info({})
    expect(logs.join('\n'), 'a redirected report must stay greppable').not.toContain(ESC)
    vi.restoreAllMocks()
  })
})
