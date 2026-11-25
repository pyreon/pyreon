import { describe, expect, it } from 'vitest'
import {
  captureDomShape,
  compareDomShapes,
  type DomShapeObservation,
  fnv1a,
  formatDomShapeMismatches,
} from '../../../../../examples/benchmark/dom-shape'

/**
 * The deep-tree scenario mounted with `''`: Solid created no leaf text node,
 * Pyreon created an empty one, and the per-arm verifier (leaf count) passed
 * both. `bench-scenarios.ts` now fails a run whose arms built different DOMs.
 */

/** A 2-leaf tree; `leafText === null` means the leaf has no text node at all. */
function tree(leafText: string | null, comment = false): HTMLElement {
  const root = document.createElement('div')
  const treeRoot = document.createElement('div')
  treeRoot.className = 'tree-root'
  for (let i = 0; i < 2; i++) {
    const leaf = document.createElement('span')
    leaf.className = 'leaf'
    if (leafText !== null) leaf.appendChild(document.createTextNode(leafText))
    treeRoot.appendChild(leaf)
  }
  if (comment) treeRoot.appendChild(document.createComment('marker'))
  root.appendChild(treeRoot)
  return root
}

const obs = (arm: string, root: HTMLElement, op = 'mount', pass = 1): DomShapeObservation => ({
  arm,
  op,
  pass,
  shape: captureDomShape(root),
})

describe('captureDomShape', () => {
  it('counts node types below the root and hashes tags and text', () => {
    const s = captureDomShape(tree('alpha', true))
    expect(s).toEqual({
      elements: 3,
      texts: 2,
      emptyTexts: 0,
      anchorTexts: 0,
      comments: 1,
      tagHash: fnv1a('DIV,SPAN,SPAN'),
      textLength: 10,
      textHash: fnv1a('alphaalpha'),
    })
  })

  it('counts an empty text node beside other nodes as an anchor, not content', () => {
    // Svelte 5's block anchor: a comment followed by an empty text node.
    const root = tree('alpha')
    const branch = root.firstChild as HTMLElement
    branch.insertBefore(document.createTextNode(''), branch.firstChild)
    branch.insertBefore(document.createComment(''), branch.firstChild)
    const s = captureDomShape(root)
    expect(s.texts).toBe(2)
    expect(s.emptyTexts).toBe(0)
    expect(s.anchorTexts).toBe(1)
    expect(compareDomShapes([obs('Svelte 5', root), obs('Pyreon', tree('alpha'))])).toEqual([])
  })

  it('sees an empty text node that textContent and a leaf count cannot', () => {
    const withEmpty = captureDomShape(tree(''))
    const without = captureDomShape(tree(null))
    expect(withEmpty.textHash).toBe(without.textHash)
    expect(withEmpty.elements).toBe(without.elements)
    expect(withEmpty.texts - without.texts).toBe(2)
    expect(withEmpty.emptyTexts).toBe(2)
  })
})

describe('compareDomShapes', () => {
  it('fails the old deep-tree fixture and names the arms on each side', () => {
    const mismatches = compareDomShapes([
      obs('Pyreon', tree('')),
      obs('Vanilla JS', tree('')),
      obs('SolidJS', tree(null)),
      obs('SolidJS 2.0', tree(null)),
    ])
    expect(mismatches.map((m) => m.field).sort()).toEqual(['emptyTexts', 'texts'])
    const texts = mismatches.find((m) => m.field === 'texts')!
    expect(texts.groups).toEqual([
      { value: 2, arms: ['Pyreon (pass 1)', 'Vanilla JS (pass 1)'] },
      { value: 0, arms: ['SolidJS (pass 1)', 'SolidJS 2.0 (pass 1)'] },
    ])
    const lines = formatDomShapeMismatches('tree', mismatches)
    expect(lines[0]).toContain('tree / mount')
    expect(lines.join('\n')).toContain('SolidJS 2.0 (pass 1)')
  })

  it('passes the fixed fixture (non-empty initial value)', () => {
    expect(
      compareDomShapes([
        obs('Pyreon', tree('alpha')),
        obs('SolidJS', tree('alpha')),
        obs('React 19', tree('alpha')),
      ]),
    ).toEqual([])
  })

  it('catches different text and different elements', () => {
    const text = compareDomShapes([obs('A', tree('alpha')), obs('B', tree('bravo'))])
    expect(text.map((m) => m.field)).toEqual(['textHash'])
    const b = tree('alpha')
    b.firstChild!.appendChild(document.createElement('i'))
    const el = compareDomShapes([obs('A', tree('alpha')), obs('B', b)])
    expect(el.map((m) => m.field)).toEqual(['elements', 'tagHash'])
  })

  it('counts a Svelte 5 arm’s lone empty text (an empty {#each} anchor) as an anchor', () => {
    const emptyList = (anchor: boolean) => {
      const root = document.createElement('div')
      const tbody = document.createElement('tbody')
      if (anchor) tbody.appendChild(document.createTextNode(''))
      root.appendChild(tbody)
      return root
    }
    expect(
      compareDomShapes([obs('Svelte 5', emptyList(true)), obs('Pyreon', emptyList(false))]),
    ).toEqual([])
    // The same node in any other arm is an empty content slot and fails the gate.
    expect(
      compareDomShapes([obs('Vue 3', emptyList(true)), obs('Pyreon', emptyList(false))]).map(
        (m) => m.field,
      ),
    ).toEqual(['texts', 'emptyTexts'])
    // An asymmetric empty value still fails through the other arms.
    expect(
      compareDomShapes([
        obs('Svelte 5', tree('')),
        obs('Pyreon', tree('')),
        obs('SolidJS', tree(null)),
      ]).length,
    ).toBeGreaterThan(0)
  })

  it('does not compare comments (framework bookkeeping) unless asked to', () => {
    const o = [obs('A', tree('alpha')), obs('B', tree('alpha', true))]
    expect(compareDomShapes(o)).toEqual([])
    expect(compareDomShapes(o, ['comments']).map((m) => m.field)).toEqual(['comments'])
  })

  it('compares per op, and an arm against itself across passes', () => {
    const o = [
      obs('A', tree('alpha'), 'mount', 1),
      obs('A', tree('bravo'), 'update', 1),
      obs('A', tree('alpha'), 'mount', 2),
      obs('A', tree(null), 'mount', 3),
    ]
    const m = compareDomShapes(o)
    expect(new Set(m.map((x) => x.op))).toEqual(new Set(['mount']))
    expect(m.find((x) => x.field === 'texts')!.groups[1]!.arms).toEqual(['A (pass 3)'])
  })
})
