/**
 * "Why did this update?" — the rendering half, against hand-built causes.
 *
 * `update-cause.test.ts` drives a REAL cascade, which is the load-bearing test:
 * it proves the chain the framework reconstructs is the chain a reader sees.
 * What a real cascade cannot produce on demand is the DEGENERATE input — an
 * anonymous node, a creation site with no line, a target with no location at
 * all — and those are exactly the cells this panel renders. So these pin the
 * shaping against causes constructed directly.
 */
import { describe, expect, it } from 'vitest'
import type { UpdateCause } from '@pyreon/reactivity'
import { causeSteps, causeSummary, explainText } from '../update-cause'

type Link = UpdateCause['target']

const link = (over: Partial<Link> & { id: number }): Link => ({
  kind: 'signal',
  name: '',
  ts: 0,
  ...over,
})

const cause = (target: Link, chain: Link[], rootReached = true): UpdateCause => ({
  target,
  chain,
  rootReached,
})

describe('where — the creation site cell', () => {
  it('renders `dir/file:line` when the location is complete', () => {
    const steps = causeSteps(
      cause(link({ id: 1, loc: { file: '/a/b/src/Button.tsx', line: 42, col: 3 } }), []),
    )
    expect(steps[0]!.where).toBe('src/Button.tsx:42')
  })

  it('renders the file ALONE when the line is unknown, rather than `file:undefined`', () => {
    // `line: 0` is the shape a stack frame with no line produces; the cell
    // must not read `file:0`.
    const steps = causeSteps(
      cause(link({ id: 1, loc: { file: '/a/b/src/Button.tsx', line: 0, col: 0 } }), []),
    )
    expect(steps[0]!.where).toBe('src/Button.tsx')
  })

  it('renders an EMPTY cell when there is no location — never a fabricated path', () => {
    expect(causeSteps(cause(link({ id: 1 }), []))[0]!.where).toBe('')
    expect(causeSteps(cause(link({ id: 1, loc: { file: '', line: 1, col: 1 } }), []))[0]!.where).toBe('')
  })
})

describe('causeSteps — naming', () => {
  it('names an anonymous chain link and an anonymous target by id, not with an empty cell', () => {
    const steps = causeSteps(
      cause(link({ id: 9, kind: 'effect' }), [link({ id: 3, kind: 'signal' })]),
    )
    expect(steps.map((s) => s.name)).toEqual(['#3', '#9'])
  })

  it('prefers a real name wherever there is one', () => {
    const steps = causeSteps(
      cause(link({ id: 9, kind: 'effect', name: 'render' }), [link({ id: 3, name: 'count' })]),
    )
    expect(steps.map((s) => s.name)).toEqual(['count', 'render'])
  })

  it('renders ROOT-FIRST with the target last, and marks only the target', () => {
    const steps = causeSteps(
      cause(link({ id: 9, kind: 'effect', name: 'render' }), [
        link({ id: 1, kind: 'signal', name: 'count' }),
        link({ id: 2, kind: 'derived', name: 'doubled' }),
      ]),
    )
    expect(steps.map((s) => [s.name, s.relation, s.isTarget])).toEqual([
      ['count', 'changed', false],
      ['doubled', 're-derived', false],
      ['render', 'ran', true],
    ])
  })
})

describe('causeSummary — naming and honesty', () => {
  it('names an anonymous ORIGIN by id', () => {
    expect(causeSummary(cause(link({ id: 9, name: 'render', kind: 'effect' }), [link({ id: 4 })]))).toBe(
      'render updated because #4 changed, 1 hop away.',
    )
  })

  it('names an anonymous TARGET by id in the direct-set case', () => {
    expect(causeSummary(cause(link({ id: 7 }), []))).toBe(
      '#7 IS the origin — it was set directly, not by another node.',
    )
  })

  it('names an anonymous target by id in the chained case too', () => {
    expect(causeSummary(cause(link({ id: 7, kind: 'effect' }), [link({ id: 1, name: 'count' })]))).toBe(
      '#7 updated because count changed, 1 hop away.',
    )
  })

  it('pluralises multiple hops', () => {
    const summary = causeSummary(
      cause(link({ id: 9, name: 'render', kind: 'effect' }), [
        link({ id: 1, name: 'count' }),
        link({ id: 2, name: 'doubled', kind: 'derived' }),
      ]),
    )
    expect(summary).toBe('render updated because count changed, 2 hops away.')
  })
})

describe('explainText — the framework rendering, for pasting into an issue', () => {
  it('is the framework’s own text, not a second rendering that can drift from it', () => {
    const text = explainText(
      cause(link({ id: 9, kind: 'effect', name: 'render' }), [link({ id: 1, name: 'count' })]),
    )
    expect(typeof text).toBe('string')
    expect(text.length).toBeGreaterThan(0)
    expect(text).toContain('count')
    expect(text).toContain('render')
  })
})
