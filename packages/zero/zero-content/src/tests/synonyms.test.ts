/**
 * Search synonym / jargon expansion — Phase 1a.
 *
 * Unit specs for `expandSynonyms` + an integration spec proving the
 * expansion works end-to-end through the REAL shared `MINISEARCH_OPTIONS`
 * (a query for "reactive" finds a doc indexed only under "signal"). This is
 * the relevance gap plain keyword search — and VitePress's default — can't
 * close.
 */
import MiniSearch from 'minisearch'
import { describe, expect, it } from 'vitest'
import { MINISEARCH_OPTIONS } from '../_shared/minisearch-options'
import { expandSynonyms, SYNONYM_GROUPS } from '../_shared/synonyms'

describe('expandSynonyms — query-term expansion', () => {
  it('expands a jargon term to its whole synonym group', () => {
    const out = expandSynonyms('reactive')
    expect(Array.isArray(out)).toBe(true)
    expect(out).toContain('signal')
    expect(out).toContain('reactive')
    expect(out).toContain('reactivity')
  })

  it('is bidirectional — any group member expands to the same group', () => {
    expect(expandSynonyms('signal')).toEqual(expandSynonyms('reactive'))
    expect(expandSynonyms('hydrate')).toEqual(expandSynonyms('hydration'))
  })

  it('lowercases (matching default index-time processing)', () => {
    expect(expandSynonyms('Signal')).toContain('signal')
    expect(expandSynonyms('PROPS')).toContain('attributes')
  })

  it('returns the bare lowercased term for non-jargon words (no expansion)', () => {
    expect(expandSynonyms('button')).toBe('button')
    expect(expandSynonyms('Tooltip')).toBe('tooltip')
  })

  it('every group is conservative — no term belongs to two groups', () => {
    const seen = new Map<string, number>()
    SYNONYM_GROUPS.forEach((group, gi) => {
      for (const term of group) {
        expect(seen.has(term), `"${term}" appears in two groups`).toBe(false)
        seen.set(term, gi)
      }
    })
  })
})

describe('synonyms — end-to-end through MINISEARCH_OPTIONS', () => {
  // A tiny index: one doc per concept, each using ONLY the canonical term.
  const docs = [
    { id: '1', title: 'Reactivity', headings: 'createSignal', body: 'A signal is the unit of state.', description: '', url: '/docs/reactivity', collection: 'docs', slug: 'reactivity' },
    { id: '2', title: 'SSR', headings: 'Hydrate', body: 'The client hydrates the server HTML.', description: '', url: '/docs/ssr', collection: 'docs', slug: 'ssr' },
    { id: '3', title: 'Router', headings: 'Navigation', body: 'Define routes and navigate between them.', description: '', url: '/docs/router', collection: 'docs', slug: 'router' },
    { id: '4', title: 'Tooltip', headings: 'Tooltip', body: 'A floating label on hover.', description: '', url: '/docs/tooltip', collection: 'docs', slug: 'tooltip' },
  ]

  function freshIndex(): MiniSearch {
    const ms = new MiniSearch(MINISEARCH_OPTIONS)
    ms.addAll(docs)
    return ms
  }

  it('finds the "signal" doc when the user searches "reactive"', () => {
    const hits = freshIndex().search('reactive')
    expect(hits.map((h) => h.id)).toContain('1')
  })

  it('finds the "hydrate" doc when the user searches "hydration"', () => {
    const hits = freshIndex().search('hydration')
    expect(hits.map((h) => h.id)).toContain('2')
  })

  it('finds the "navigation" doc when the user searches "routing"', () => {
    const hits = freshIndex().search('routing')
    expect(hits.map((h) => h.id)).toContain('3')
  })

  it('does NOT over-expand — a non-jargon query stays precise', () => {
    const hits = freshIndex().search('tooltip')
    expect(hits.map((h) => h.id)).toEqual(['4'])
  })
})
