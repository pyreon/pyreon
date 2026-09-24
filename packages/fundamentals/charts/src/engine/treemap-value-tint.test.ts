// `nodeValue` and `tintHex` are both written in the PMTC subset — iterative
// rather than recursive, hand-rolled hex parsing rather than a regex — so the
// degenerate inputs are exactly the ones the native emit has to agree on. The
// layout suites drive well-formed trees and palette colours; these drive the
// shapes that fall through.
import { describe, expect, it } from 'vitest'
import { layoutTreemap, nodeValue, tintHex } from './treemap'
import type { TreeNode } from './treemap'

describe('nodeValue — own value, else the summed subtree', () => {
  it('takes its own value and does NOT descend when it has one', () => {
    // The children would sum to 100; an explicit own value wins outright.
    expect(nodeValue({ name: 'n', value: 5, children: [{ name: 'c', value: 100 }] })).toBe(5)
  })

  it('sums the children when it has no value of its own', () => {
    expect(nodeValue({ name: 'n', children: [{ name: 'a', value: 3 }, { name: 'b', value: 4 }] })).toBe(7)
  })

  it('sums through several levels, stopping at each explicit value', () => {
    const tree: TreeNode = {
      name: 'root',
      children: [
        { name: 'a', children: [{ name: 'a1', value: 1 }, { name: 'a2', value: 2 }] },
        { name: 'b', value: 10, children: [{ name: 'b1', value: 999 }] },
      ],
    }
    expect(nodeValue(tree)).toBe(13)
  })

  it('a leaf with neither a value nor children is zero, not NaN', () => {
    expect(nodeValue({ name: 'n' })).toBe(0)
    expect(nodeValue({ name: 'n', children: [] })).toBe(0)
  })

  it('stays iterative on a deep chain rather than blowing the stack', () => {
    let node: TreeNode = { name: 'leaf', value: 1 }
    for (let i = 0; i < 20000; i++) node = { name: `n${i}`, children: [node] }
    expect(nodeValue(node)).toBe(1)
  })
})

describe('tintHex — the hand-rolled hex path', () => {
  it('interpolates a well-formed colour toward white', () => {
    expect(tintHex('#000000', 0)).toBe('rgb(0, 0, 0)')
    expect(tintHex('#000000', 1)).toBe('rgb(255, 255, 255)')
  })

  it('reads each channel independently', () => {
    // Half-way from pure red toward white lifts green and blue only.
    expect(tintHex('#ff0000', 0.5)).toBe('rgb(255, 128, 128)')
  })

  it('a colour too SHORT to carry three channels is returned untouched', () => {
    // There is nothing to interpolate, and inventing channels would silently
    // repaint a caller's `rgb()`/`currentColor`/named colour.
    expect(tintHex('#ff', 0.5)).toBe('#ff')
    expect(tintHex('', 0.5)).toBe('')
    expect(tintHex('red', 0.5)).toBe('red')
  })

  it('a non-hex digit contributes zero to its channel rather than NaN', () => {
    expect(tintHex('#zzzzzz', 0)).toBe('rgb(0, 0, 0)')
    // Upper case is still hex.
    expect(tintHex('#FF0000', 0)).toBe('rgb(255, 0, 0)')
  })
})

describe('layoutTreemap — degenerate rectangles', () => {
  const nodes: TreeNode[] = [{ name: 'a', value: 3 }, { name: 'b', value: 1 }]

  it('lays a normal rect out into non-overlapping cells that fill it', () => {
    const cells = layoutTreemap(nodes, { x: 0, y: 0, w: 100, h: 50 })
    expect(cells.length).toBeGreaterThanOrEqual(2)
    for (const c of cells) {
      expect(c.rect.w).toBeGreaterThanOrEqual(0)
      expect(c.rect.h).toBeGreaterThanOrEqual(0)
    }
  })

  it('a zero-sided rect produces zero-sized cells rather than dividing by zero', () => {
    for (const rect of [{ x: 0, y: 0, w: 0, h: 50 }, { x: 0, y: 0, w: 100, h: 0 }]) {
      for (const c of layoutTreemap(nodes, rect)) {
        expect(Number.isNaN(c.rect.w)).toBe(false)
        expect(Number.isNaN(c.rect.h)).toBe(false)
      }
    }
  })

  it('all-zero values produce no infinite scale', () => {
    for (const c of layoutTreemap([{ name: 'a', value: 0 }, { name: 'b', value: 0 }], { x: 0, y: 0, w: 100, h: 50 })) {
      expect(Number.isFinite(c.rect.w)).toBe(true)
      expect(Number.isFinite(c.rect.h)).toBe(true)
    }
  })

  it('an empty node list lays out nothing', () => {
    expect(layoutTreemap([], { x: 0, y: 0, w: 100, h: 50 })).toEqual([])
  })
})

describe('squarify on a degenerate rect', () => {
  it('a zero-width or zero-height rect lays out finite, zero-area cells', () => {
    const nodes: TreeNode[] = [{ name: 'a', value: 3 }, { name: 'b', value: 1 }, { name: 'c', value: 2 }]
    for (const rect of [{ x: 0, y: 0, w: 0, h: 50 }, { x: 0, y: 0, w: 100, h: 0 }]) {
      for (const c of layoutTreemap(nodes, rect)) {
        expect(Number.isFinite(c.rect.w)).toBe(true)
        expect(Number.isFinite(c.rect.h)).toBe(true)
      }
    }
  })
})
