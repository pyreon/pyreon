import { describe, expect, it, vi } from 'vitest'
import { assembleNested, useForm } from '../use-form'

// P2 — nested / array field paths. Dotted field keys (`address.city`,
// `items.0.qty`) assemble into a nested object / array in values() / onSubmit.
// Built on P4's registerField; a flat form is unaffected.

describe('assembleNested (pure)', () => {
  it('passes a flat map through unchanged', () => {
    expect(assembleNested({ a: 1, b: 'x' })).toEqual({ a: 1, b: 'x' })
  })
  it('nests a dotted object path', () => {
    expect(assembleNested({ 'address.city': 'Berlin' })).toEqual({ address: { city: 'Berlin' } })
  })
  it('builds an array from numeric segments', () => {
    expect(assembleNested({ 'items.0.qty': 1, 'items.1.qty': 2 })).toEqual({
      items: [{ qty: 1 }, { qty: 2 }],
    })
  })
  it('array of scalars', () => {
    expect(assembleNested({ 'tags.0': 'a', 'tags.1': 'b' })).toEqual({ tags: ['a', 'b'] })
  })
  it('mixes flat + nested + array', () => {
    expect(
      assembleNested({ name: 'n', 'a.b': 1, 'list.0.x': 9 }),
    ).toEqual({ name: 'n', a: { b: 1 }, list: [{ x: 9 }] })
  })
  it('deep nesting', () => {
    expect(assembleNested({ 'a.b.c.d': 5 })).toEqual({ a: { b: { c: { d: 5 } } } })
  })
})

describe('useForm — nested/array paths via registerField (P2)', () => {
  it('values() assembles nested object fields', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    form.registerField('address.city', 'Berlin')
    form.registerField('address.zip', '10115')
    expect(form.getValues()).toEqual({ address: { city: 'Berlin', zip: '10115' } })
  })

  it('values() assembles an array of objects', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    form.registerField('items.0.qty', 1)
    form.registerField('items.1.qty', 2)
    expect(form.getValues()).toEqual({ items: [{ qty: 1 }, { qty: 2 }] })
  })

  it('setFieldValue + register work on a dotted path', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    form.registerField('user.name', '')
    form.setFieldValue('user.name', 'Ada')
    const reg = form.register('user.name')
    reg.onInput({ target: { value: 'Grace' } } as unknown as Event)
    expect(form.getValues()).toEqual({ user: { name: 'Grace' } })
  })

  it('getValues(parent) reads the assembled array/object', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    form.registerField('items.0.qty', 5)
    expect(form.getValues('items')).toEqual([{ qty: 5 }])
  })

  it('onSubmit receives the assembled nested structure', async () => {
    const onSubmit = vi.fn()
    const form = useForm<Record<string, unknown>>({ initialValues: { title: 't' }, onSubmit })
    form.registerField('meta.author', 'me')
    await form.handleSubmit()
    expect(onSubmit).toHaveBeenCalledWith({ title: 't', meta: { author: 'me' } })
  })

  it('per-leaf validation participates in validity', async () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    form.registerField('address.city', '', (v) => (v ? undefined : 'City required'))
    expect(await form.validate()).toBe(false)
    form.setFieldValue('address.city', 'Berlin')
    expect(await form.validate()).toBe(true)
  })

  it('a flat form is unchanged (no assembly)', () => {
    const form = useForm<{ a: number; b: string }>({
      initialValues: { a: 1, b: 'x' },
      onSubmit: () => {},
    })
    expect(form.getValues()).toEqual({ a: 1, b: 'x' })
  })

  it('an OBJECT-valued top-level field (no dotted key) stays whole', () => {
    const form = useForm<{ address: { city: string } }>({
      initialValues: { address: { city: 'init' } },
      onSubmit: () => {},
    })
    expect(form.getValues()).toEqual({ address: { city: 'init' } })
  })
})
