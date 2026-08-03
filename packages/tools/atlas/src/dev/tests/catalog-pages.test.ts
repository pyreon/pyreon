/**
 * `pages` — the presentation overrides, and the ordering they drive.
 *
 * The invariant worth stating once: `name` is NOT overridable. It is what the
 * usage snippet writes, what the `source`/`lens` RPC looks up, and what an
 * agent imports. A `title` is a separate display field so relabelling a sidebar
 * entry can never desynchronise any of those.
 */
import { describe, expect, it } from 'vitest'
import type { ComponentIntelligence } from '../../core'
import { generateCatalogModule, sortEntries } from '../catalog-module'
import type { CatalogEntrySource } from '../catalog-module'

const entry = (name: string, file: string): CatalogEntrySource => ({
  component: {
    name,
    controls: [],
    axes: [],
    scenarios: [],
    tags: [],
    source: file,
  } satisfies ComponentIntelligence,
  file,
})

describe('sortEntries', () => {
  const entries = [
    entry('Alpha', '/r/forms/alpha.tsx'),
    entry('Beta', '/r/forms/beta.tsx'),
    entry('Gamma', '/r/layout/gamma.tsx'),
  ]

  it('is a NO-OP without config — an upgrade must not reshuffle a sidebar', () => {
    expect(sortEntries(entries, { root: '/r' }).map((e) => e.component.name)).toEqual([
      'Alpha',
      'Beta',
      'Gamma',
    ])
  })

  it('pins an ordered component to the top of ITS group', () => {
    const sorted = sortEntries(entries, { root: '/r', pages: { Beta: { order: 1 } } })
    expect(sorted.map((e) => e.component.name)).toEqual(['Beta', 'Alpha', 'Gamma'])
  })

  it('does not let an order pull a component out of its group', () => {
    // A plain global sort by `order` would put Gamma first and file it away
    // from Layout — the tree would scramble on a single config line.
    const sorted = sortEntries(entries, { root: '/r', pages: { Gamma: { order: -10 } } })
    expect(sorted.map((e) => e.component.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('sorts unordered components AFTER ordered ones, keeping discovery order', () => {
    const sorted = sortEntries(entries, { root: '/r', pages: { Beta: { order: 2 } } })
    expect(sorted.slice(0, 2).map((e) => e.component.name)).toEqual(['Beta', 'Alpha'])
  })

  it('follows a group OVERRIDE when deciding which group a component sorts within', () => {
    const sorted = sortEntries(entries, {
      root: '/r',
      pages: { Gamma: { group: 'Forms', order: 1 } },
    })
    expect(sorted.map((e) => e.component.name)).toEqual(['Gamma', 'Alpha', 'Beta'])
  })
})

describe('generateCatalogModule with pages', () => {
  const one = [entry('Button', '/r/forms/button.tsx')]

  it('emits the REAL name and the title SEPARATELY', () => {
    const code = generateCatalogModule(one, {
      root: '/r',
      pages: { Button: { title: 'Button (CTA)' } },
    })
    expect(code).toContain('name: "Button"')
    expect(code).toContain('title: "Button (CTA)"')
  })

  it('emits no title when none is configured', () => {
    const code = generateCatalogModule(one, { root: '/r' })
    expect(code).not.toContain('title:')
  })

  it('overrides the derived group', () => {
    const code = generateCatalogModule(one, { root: '/r', pages: { Button: { group: 'Actions' } } })
    expect(code).toContain('group: "Actions"')
    expect(code).not.toContain('group: "Forms"')
  })

  it('overrides the summary', () => {
    const code = generateCatalogModule(one, {
      root: '/r',
      pages: { Button: { summary: 'The primary action.' } },
    })
    expect(code).toContain('desc: "The primary action."')
  })

  it('ignores an override keyed to a component that does not exist', () => {
    const code = generateCatalogModule(one, { root: '/r', pages: { Nope: { title: 'X' } } })
    expect(code).toContain('name: "Button"')
    expect(code).not.toContain('"X"')
  })
})
