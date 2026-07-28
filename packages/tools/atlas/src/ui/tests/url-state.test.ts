/**
 * URL state and nested hierarchy.
 *
 * A shared link is UNTRUSTED input — hand-edited, truncated by a chat client,
 * or written by a different Atlas version — so most of what matters here is how
 * a bad one degrades.
 */
import { describe, expect, it } from 'vitest'
import type { WorkbenchComponent } from '../catalog'
import {
  buildHierarchy,
  countUnder,
  filterHierarchy,
  flattenHierarchy,
  splitPath,
} from '../hierarchy'
import { parseUrlState, serializeUrlState, urlStateChanged } from '../url-state'

const comp = (id: string, group: string): WorkbenchComponent =>
  ({ id, name: id, group, status: 'stable', controls: [], render: () => null }) as unknown as WorkbenchComponent

describe('round-tripping', () => {
  it('survives a full round trip', () => {
    const state = {
      c: 'button',
      p: 'controls',
      args: { label: 'Save', count: 3, on: true },
      viewport: 'tablet',
      locale: 'ar',
    }
    expect(parseUrlState(serializeUrlState(state))).toEqual(state)
  })

  it('omits defaults, so a shared link stays readable', () => {
    // A link nobody can read is a link nobody shares.
    const query = serializeUrlState({ c: 'button', viewport: 'full', background: 'theme', locale: 'en' })
    expect(query).toBe('c=button')
  })

  it('writes `dark` only when it is off', () => {
    // The workbench defaults to dark; spelling out the common case is noise.
    expect(serializeUrlState({ dark: true })).toBe('')
    expect(serializeUrlState({ dark: false })).toBe('dark=0')
    expect(parseUrlState('dark=0').dark).toBe(false)
  })

  it('accepts a leading `?`', () => {
    expect(parseUrlState('?c=badge').c).toBe('badge')
  })
})

describe('args are one JSON parameter, on purpose', () => {
  it('carries values of several types', () => {
    const args = { label: 'x', n: 1, flag: false, nested: { a: 1 } }
    expect(parseUrlState(serializeUrlState({ args })).args).toEqual(args)
  })

  it('survives a control named like a reserved key', () => {
    // Flattening args into the query string would make `?c=…` ambiguous between
    // "the component" and "a prop named c", and the collision would surface as
    // a control silently not applying.
    const state = { c: 'button', args: { c: 'prop-value', p: 'other' } }
    const parsed = parseUrlState(serializeUrlState(state))
    expect(parsed.c).toBe('button')
    expect(parsed.args).toEqual({ c: 'prop-value', p: 'other' })
  })
})

describe('a malformed link degrades, never discards', () => {
  it('keeps the rest when args are unparseable', () => {
    const parsed = parseUrlState('c=button&p=a11y&args=%7Bnot-json')
    expect(parsed.c).toBe('button')
    expect(parsed.p).toBe('a11y')
    expect(parsed.args).toBeUndefined()
  })

  it('rejects args that are not a plain object', () => {
    // An array or scalar would spread into nonsense.
    expect(parseUrlState(`args=${encodeURIComponent('[1,2]')}`).args).toBeUndefined()
    expect(parseUrlState(`args=${encodeURIComponent('"str"')}`).args).toBeUndefined()
    expect(parseUrlState(`args=${encodeURIComponent('null')}`).args).toBeUndefined()
  })

  it('ignores parameters it does not understand', () => {
    // A link from a newer Atlas must still select the component.
    expect(parseUrlState('c=button&fromTheFuture=1').c).toBe('button')
  })

  it('returns an empty state for an empty query', () => {
    expect(parseUrlState('')).toEqual({})
  })
})

describe('change detection', () => {
  it('does not report a change when nothing meaningful moved', () => {
    // Otherwise the back button walks through every keystroke in a text control.
    expect(urlStateChanged({ c: 'a' }, { c: 'a' })).toBe(false)
    expect(urlStateChanged({ c: 'a', viewport: 'full' }, { c: 'a' })).toBe(false)
    expect(urlStateChanged({ c: 'a' }, { c: 'b' })).toBe(true)
  })
})

describe('hierarchy', () => {
  it('nests a slash-separated group path', () => {
    const tree = buildHierarchy([comp('input', 'Forms/Inputs'), comp('btn', 'Forms')])
    expect(tree).toHaveLength(1)
    expect(tree[0]!.name).toBe('Forms')
    expect(tree[0]!.items.map((i) => i.id)).toEqual(['btn'])
    expect(tree[0]!.children[0]!.name).toBe('Inputs')
    expect(tree[0]!.children[0]!.path).toBe('Forms/Inputs')
  })

  it('keeps FIRST-SEEN order rather than sorting', () => {
    // Catalog order is a curatorial choice — Foundations before Feedback —
    // and sorting would silently discard it.
    const tree = buildHierarchy([comp('a', 'Zed'), comp('b', 'Alpha')])
    expect(tree.map((n) => n.name)).toEqual(['Zed', 'Alpha'])
  })

  it('never drops a component with an unusable group', () => {
    // Losing a component from the sidebar is worse than an untidy group name.
    const tree = buildHierarchy([comp('orphan', ''), comp('odd', '//')])
    expect(countUnder(tree[0]!)).toBe(2)
    expect(tree[0]!.name).toBe('Components')
  })

  it('counts descendants', () => {
    const tree = buildHierarchy([
      comp('a', 'Forms'),
      comp('b', 'Forms/Inputs'),
      comp('c', 'Forms/Inputs/Text'),
    ])
    expect(countUnder(tree[0]!)).toBe(3)
  })

  it('flattens depth-first, the order a sidebar renders', () => {
    const tree = buildHierarchy([comp('a', 'A/B'), comp('c', 'C')])
    expect(flattenHierarchy(tree).map((n) => n.path)).toEqual(['A', 'A/B', 'C'])
  })

  it('drops branches left empty by a filter', () => {
    // A group header for a hidden match reads as a broken filter.
    const tree = buildHierarchy([comp('a', 'Forms/Inputs'), comp('b', 'Feedback')])
    const filtered = filterHierarchy(tree, new Set(['b']))
    expect(filtered.map((n) => n.name)).toEqual(['Feedback'])
  })

  it('keeps an ancestor whose descendant matches', () => {
    const tree = buildHierarchy([comp('deep', 'Forms/Inputs/Text')])
    const filtered = filterHierarchy(tree, new Set(['deep']))
    expect(filtered[0]!.name).toBe('Forms')
    expect(filtered[0]!.children[0]!.children[0]!.items[0]!.id).toBe('deep')
  })
})

describe('splitPath', () => {
  it('drops empty segments', () => {
    expect(splitPath('Forms//Inputs/')).toEqual(['Forms', 'Inputs'])
    expect(splitPath('  ')).toEqual([])
  })
})
