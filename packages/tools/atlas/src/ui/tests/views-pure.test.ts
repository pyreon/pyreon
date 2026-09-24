/**
 * Pure decisions inside two views — what the Controls panel lets a text box
 * edit, and which tiles the Theme Lab can honestly show.
 */
import { describe, expect, it } from 'vitest'
import { describeLockedValue, isTextEditable } from '../views/panels/ControlsPanel'
import { labTiles } from '../views/lab/LabView'

describe('isTextEditable', () => {
  it('edits scalars and blanks', () => {
    for (const v of ['x', '', 3, true, undefined, null]) expect(isTextEditable(v)).toBe(true)
  })

  it('refuses structure a keystroke would destroy (a render function, options, a vnode)', () => {
    for (const v of [() => null, [1, 2], { a: 1 }, { type: 'div', props: {} }])
      expect(isTextEditable(v)).toBe(false)
  })
})

describe('describeLockedValue', () => {
  it('summarises instead of printing a function source or [object Object]', () => {
    expect(describeLockedValue(() => 1)).toBe('ƒ render function')
    expect(describeLockedValue([1])).toBe('[1 item]')
    expect(describeLockedValue([1, 2, 3, 4])).toBe('[4 items]')
    expect(describeLockedValue({ type: 'div', props: {}, children: [] })).toBe('<element>')
    expect(describeLockedValue({ a: 1 })).toBe('{"a":1}')
    expect(describeLockedValue({ long: 'x'.repeat(80) })).toMatch(/…$/)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(describeLockedValue(cyclic)).toBe('{…}')
    expect(describeLockedValue(7)).toBe('7')
  })
})

describe('labTiles', () => {
  it('shows every brand for an unwrapped catalog, or a wrapper that reads `brand`', () => {
    expect(labTiles(false, { mode: false, brand: false })).toEqual({ brands: true, note: '' })
    expect(labTiles(true, { mode: true, brand: true })).toEqual({ brands: true, note: '' })
  })

  it('says brands cannot apply — instead of tiling identical cards — when a wrapper ignores them', () => {
    const plan = labTiles(true, { mode: true, brand: false })
    expect(plan.brands).toBe(false)
    expect(plan.note).toMatch(/does not read `brand`/)
    expect(plan.note).not.toMatch(/`mode` either/)
    expect(labTiles(true, { mode: false, brand: false }).note).toMatch(/`mode` either/)
  })
})
