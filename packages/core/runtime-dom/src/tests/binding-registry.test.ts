/**
 * DOM→signal correlation (`nodesForElement`) — the exact `_bindText`
 * text-node→source tag that powers the overlay's Inspect picker.
 *
 * These drive the REAL `_bindText` binding (not a mock), so the tag is captured
 * exactly as it is in a compiled app. Reset the reactive registry per-test so
 * ids don't collide across cases.
 */
import { __resetReactiveDevtoolsForTesting, computed, signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _tagTextBinding, nodesForElement } from '../binding-registry'
import { _bindText } from '../template'

// _bindText's structural source param ({ _v?, direct? }) — a signal/computed
// satisfies it, but the callable type isn't assignable without a widening cast.
type TextSource = Parameters<typeof _bindText>[0]

describe('binding-registry — nodesForElement (DOM→signal)', () => {
  beforeEach(() => {
    __resetReactiveDevtoolsForTesting()
  })
  afterEach(() => {
    __resetReactiveDevtoolsForTesting()
  })

  it('correlates a text node to the signal that drives it', () => {
    const count = signal(5, { name: 'count' })
    const el = document.createElement('span')
    const text = document.createTextNode('')
    el.appendChild(text)
    document.body.appendChild(el)

    const dispose = _bindText(count as unknown as TextSource, text)

    const bound = nodesForElement(el)
    expect(bound).toHaveLength(1)
    expect(bound[0]!.name).toBe('count')
    expect(bound[0]!.kind).toBe('signal')
    expect(bound[0]!.node).toBe(text)

    dispose()
    el.remove()
  })

  it('collects multiple bound descendants, deduped, in document order', () => {
    const a = signal(1, { name: 'a' })
    const b = signal(2, { name: 'b' })
    const root = document.createElement('div')
    const t1 = document.createTextNode('')
    const inner = document.createElement('span')
    const t2 = document.createTextNode('')
    inner.appendChild(t2)
    root.append(t1, inner)
    document.body.appendChild(root)

    _bindText(a as unknown as TextSource, t1)
    _bindText(b as unknown as TextSource, t2)

    expect(nodesForElement(root).map((n) => n.name)).toEqual(['a', 'b'])
    root.remove()
  })

  it('returns [] for an element with only static text', () => {
    const el = document.createElement('div')
    el.textContent = 'static'
    document.body.appendChild(el)
    expect(nodesForElement(el)).toEqual([])
    el.remove()
  })

  it('correlates computed sources too (kind "derived")', () => {
    const n = signal(2)
    const doubled = computed(() => n() * 2)
    const el = document.createElement('span')
    const text = document.createTextNode('')
    el.appendChild(text)
    document.body.appendChild(el)

    _bindText(doubled as unknown as TextSource, text)

    const bound = nodesForElement(el)
    expect(bound).toHaveLength(1)
    expect(bound[0]!.kind).toBe('derived')
    el.remove()
  })

  it('returns [] when the element has no DOM document (SSR / detached host)', () => {
    // The `!doc || no-createTreeWalker` guard is the SSR/production-safe path
    // documented in `nodesForElement`'s JSDoc — a host with no `ownerDocument`
    // (or a document object without `createTreeWalker`) yields no correlation
    // rather than throwing. Model both halves of the guard.
    expect(nodesForElement({ ownerDocument: null } as unknown as Element)).toEqual([])
    expect(nodesForElement({ ownerDocument: {} as Document } as unknown as Element)).toEqual([])
  })

  it('skips a tagged text node whose source is not in the live graph', () => {
    // `_bindText` tags a text node with its source's graph-node id. If that id
    // is no longer present in `getReactiveGraph()` (disposed / GC'd source, or a
    // stale tag surviving a devtools reset), the walker must SKIP it — never
    // surface a phantom `BoundReactiveNode` with an undefined name/kind.
    const el = document.createElement('span')
    const text = document.createTextNode('x')
    el.appendChild(text)
    document.body.appendChild(el)

    // A fabricated id that provably isn't in the (reset) reactive graph.
    _tagTextBinding(text, 9_999_999)

    expect(nodesForElement(el)).toEqual([])
    el.remove()
  })
})
