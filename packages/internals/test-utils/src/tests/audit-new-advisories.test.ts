// The PR dependency-advisory gate.
//
// A bare `bun audit --audit-level=high` in a required PR check reds EVERY open
// PR the moment an advisory is published against a dependency already on main
// — PRs that touch nothing but docs included. In 2026-10/11 that froze merges
// for four days. The gate now blocks only what a PR introduces.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ACCEPTANCES_FILE,
  type Acceptance,
  type Advisory,
  acceptanceProblems,
  applyAcceptances,
  atLeast,
  diffAdvisories,
  parseAudit,
} from '../../../../../scripts/audit-new-advisories'

const adv = (pkg: string, id: number, severity = 'high'): Advisory => ({
  pkg,
  id,
  severity,
  title: `${pkg} issue`,
  url: `https://github.com/advisories/GHSA-${pkg}`,
  vulnerableVersions: '<=1.0.0',
})

describe('parseAudit', () => {
  it('flattens the `{ pkg: Advisory[] }` shape bun audit emits', () => {
    const json = JSON.stringify({
      'follow-redirects': [{ id: 1, severity: 'high', title: 't', url: 'u' }],
      joi: [
        { id: 2, severity: 'high', title: 't2', url: 'u2' },
        { id: 3, severity: 'moderate', title: 't3', url: 'u3' },
      ],
    })
    expect(parseAudit(json).map((a) => `${a.pkg}#${a.id}`)).toEqual([
      'follow-redirects#1',
      'joi#2',
      'joi#3',
    ])
  })

  it('treats empty output as no advisories', () => {
    expect(parseAudit('')).toEqual([])
    expect(parseAudit('{}')).toEqual([])
  })

  it('throws on non-JSON so a failed audit cannot read as clean', () => {
    expect(() => parseAudit('error: registry unreachable')).toThrow()
  })
})

describe('atLeast', () => {
  const list = [adv('a', 1, 'low'), adv('b', 2, 'moderate'), adv('c', 3, 'high'), adv('d', 4, 'critical')]

  it('keeps high and critical at level high', () => {
    expect(atLeast(list, 'high').map((a) => a.pkg)).toEqual(['c', 'd'])
  })

  it('keeps an unknown severity (fail closed)', () => {
    expect(atLeast([adv('x', 9, 'severe')], 'high')).toHaveLength(1)
  })
})

describe('diffAdvisories', () => {
  it('a pre-existing advisory is NOT attributed to the PR', () => {
    // The 2026-11 shape: both advisories already in main's lockfile.
    const base = [adv('follow-redirects', 1), adv('joi', 2)]
    const head = [adv('follow-redirects', 1), adv('joi', 2)]
    const { introduced, preexisting } = diffAdvisories(head, base)
    expect(introduced).toEqual([])
    expect(preexisting).toHaveLength(2)
  })

  it('an advisory absent from the base IS the PR\'s doing', () => {
    const { introduced } = diffAdvisories([adv('joi', 2), adv('evil', 7)], [adv('joi', 2)])
    expect(introduced.map((a) => a.pkg)).toEqual(['evil'])
  })

  it('identity is package + id: the same id on another package is new', () => {
    const { introduced } = diffAdvisories([adv('b', 1)], [adv('a', 1)])
    expect(introduced).toHaveLength(1)
  })

  it('a PR that fixes advisories introduces nothing', () => {
    expect(diffAdvisories([], [adv('joi', 2)]).introduced).toEqual([])
  })
})

describe('applyAcceptances', () => {
  const entry: Acceptance = {
    pkg: 'glob',
    ghsa: 'GHSA-glob',
    vulnerableVersions: '<=1.0.0',
    accepted: '2026-11-18',
    expires: '2026-12-18',
    reason: 'no fixed release',
  }

  it('an advisory with a live entry does not block', () => {
    const r = applyAcceptances([adv('glob', 1)], [entry], '2026-11-20')
    expect(r.blocking).toEqual([])
    expect(r.accepted).toHaveLength(1)
    expect(r.lapsed).toEqual([])
  })

  it('an advisory with no entry blocks', () => {
    const r = applyAcceptances([adv('other', 2)], [entry], '2026-11-20')
    expect(r.blocking.map((a) => a.pkg)).toEqual(['other'])
    expect(r.accepted).toEqual([])
  })

  it('the entry lapses when the vulnerable range changes (a fix shipped)', () => {
    const fixed = { ...adv('glob', 1), vulnerableVersions: '<1.0.1' }
    const r = applyAcceptances([fixed], [entry], '2026-11-20')
    expect(r.blocking).toHaveLength(1)
    expect(r.lapsed[0]).toContain('Bump the lockfile')
  })

  it('the entry holds on its expiry date and lapses the day after', () => {
    expect(applyAcceptances([adv('glob', 1)], [entry], '2026-12-18').blocking).toEqual([])
    const r = applyAcceptances([adv('glob', 1)], [entry], '2026-12-19')
    expect(r.blocking).toHaveLength(1)
    expect(r.lapsed[0]).toContain('expired on 2026-12-18')
  })

  it('an entry for the same GHSA on another package does not apply', () => {
    const other = { ...adv('glob', 1), pkg: 'globber' }
    expect(applyAcceptances([other], [entry], '2026-11-20').blocking).toHaveLength(1)
  })
})

describe('acceptanceProblems', () => {
  const ok: Acceptance = {
    pkg: 'glob',
    ghsa: 'GHSA-glob',
    vulnerableVersions: '<=1.0.0',
    accepted: '2026-11-18',
    expires: '2026-12-18',
    reason: 'no fixed release',
  }

  it('accepts a 30-day entry', () => {
    expect(acceptanceProblems([ok])).toEqual([])
  })

  it('rejects an entry that stands longer than 30 days', () => {
    expect(acceptanceProblems([{ ...ok, expires: '2026-12-19' }])).toHaveLength(1)
  })

  it('rejects an entry that expires before it was accepted', () => {
    expect(acceptanceProblems([{ ...ok, expires: '2026-11-18' }])).toHaveLength(1)
  })

  it('rejects an empty reason and a malformed date', () => {
    expect(acceptanceProblems([{ ...ok, reason: ' ' }])).toHaveLength(1)
    expect(acceptanceProblems([{ ...ok, accepted: '18.11.2026' }])).toHaveLength(1)
  })

  it('the committed list is well-formed', () => {
    const list = JSON.parse(readFileSync(ACCEPTANCES_FILE, 'utf8')) as Acceptance[]
    expect(acceptanceProblems(list)).toEqual([])
  })
})
