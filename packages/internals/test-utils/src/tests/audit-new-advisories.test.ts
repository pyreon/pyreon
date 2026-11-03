// The PR dependency-advisory gate.
//
// A bare `bun audit --audit-level=high` in a required PR check reds EVERY open
// PR the moment an advisory is published against a dependency already on main
// — PRs that touch nothing but docs included. In 2026-10/11 that froze merges
// for four days. The gate now blocks only what a PR introduces.

import { describe, expect, it } from 'vitest'
import {
  type Advisory,
  atLeast,
  diffAdvisories,
  parseAudit,
} from '../../../../../scripts/audit-new-advisories'

const adv = (pkg: string, id: number, severity = 'high'): Advisory => ({
  pkg,
  id,
  severity,
  title: `${pkg} issue`,
  url: '',
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
