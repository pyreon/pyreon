import { describe, expect, it } from 'vitest'
import { mapCompatDomProps, shallowEqualProps } from '../compat-shared'

describe('shallowEqualProps', () => {
  it('equal for same-key same-value objects', () => {
    expect(shallowEqualProps({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true)
  })

  it('not equal when a value differs', () => {
    expect(shallowEqualProps({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('not equal when key counts differ', () => {
    expect(shallowEqualProps({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('uses Object.is semantics (NaN equal, ±0 distinct)', () => {
    expect(shallowEqualProps({ n: NaN }, { n: NaN })).toBe(true)
    expect(shallowEqualProps({ z: 0 }, { z: -0 })).toBe(false)
  })

  it('empty objects are equal', () => {
    expect(shallowEqualProps({}, {})).toBe(true)
  })
})

describe('mapCompatDomProps', () => {
  it('no-op for component (non-string) type', () => {
    const Comp = () => null
    const p: Record<string, unknown> = { className: 'x', htmlFor: 'y' }
    mapCompatDomProps(p, Comp)
    expect(p).toEqual({ className: 'x', htmlFor: 'y' })
  })

  it('className → class, htmlFor → for', () => {
    const p: Record<string, unknown> = { className: 'btn', htmlFor: 'email' }
    mapCompatDomProps(p, 'label')
    expect(p).toEqual({ class: 'btn', for: 'email' })
  })

  it('onChange → onInput on input/textarea/select', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      const fn = () => {}
      const p: Record<string, unknown> = { onChange: fn }
      mapCompatDomProps(p, tag)
      expect(p).toEqual({ onInput: fn })
    }
  })

  it('onChange does not clobber an explicit onInput', () => {
    const onChange = () => {}
    const onInput = () => {}
    const p: Record<string, unknown> = { onChange, onInput }
    mapCompatDomProps(p, 'input')
    expect(p).toEqual({ onInput })
  })

  it('onChange left alone on non-form elements', () => {
    const onChange = () => {}
    const p: Record<string, unknown> = { onChange }
    mapCompatDomProps(p, 'div')
    expect(p).toEqual({ onChange })
  })

  it('autoFocus → autofocus', () => {
    const p: Record<string, unknown> = { autoFocus: true }
    mapCompatDomProps(p, 'input')
    expect(p).toEqual({ autofocus: true })
  })

  it('defaultValue/defaultChecked → value/checked only when uncontrolled', () => {
    const a: Record<string, unknown> = { defaultValue: 'd', defaultChecked: true }
    mapCompatDomProps(a, 'input')
    expect(a).toEqual({ value: 'd', checked: true })

    const b: Record<string, unknown> = {
      defaultValue: 'd',
      value: 'controlled',
      defaultChecked: true,
      checked: false,
    }
    mapCompatDomProps(b, 'input')
    expect(b).toEqual({
      defaultValue: 'd',
      value: 'controlled',
      defaultChecked: true,
      checked: false,
    })
  })

  it('strips authoring-only props with no DOM equivalent', () => {
    const p: Record<string, unknown> = {
      suppressHydrationWarning: true,
      suppressContentEditableWarning: true,
    }
    mapCompatDomProps(p, 'div')
    expect(p).toEqual({})
  })
})
