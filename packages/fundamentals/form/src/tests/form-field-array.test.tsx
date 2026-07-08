import { describe, expect, it, vi } from 'vitest'
import { useFieldArray } from '../use-field-array'
import { useForm } from '../use-form'

// P1 — form-bound field array. Items live IN the form (via registerField +
// nested-path assembly), so their values reach values()/onSubmit and per-item
// validators gate isValid — unlike the standalone useFieldArray.

describe('useFieldArray(form, name) — form-bound (P1)', () => {
  it('append registers an object item that reaches getValues() as an array', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    const items = useFieldArray<{ qty: number }>(form, 'items')
    items.append({ qty: 1 })
    items.append({ qty: 2 })
    expect(form.getValues().items).toEqual([{ qty: 1 }, { qty: 2 }])
    expect(items.length()).toBe(2)
  })

  it('item values reach onSubmit', async () => {
    const onSubmit = vi.fn()
    const form = useForm<Record<string, unknown>>({ initialValues: { title: 't' }, onSubmit })
    const items = useFieldArray<{ name: string }>(form, 'guests')
    items.append({ name: 'Ada' })
    await form.handleSubmit()
    expect(onSubmit).toHaveBeenCalledWith({ title: 't', guests: [{ name: 'Ada' }] })
  })

  it('scalar items (a tag list)', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    const tags = useFieldArray<string>(form, 'tags')
    tags.append('a')
    tags.append('b')
    expect(form.getValues().tags).toEqual(['a', 'b'])
  })

  it('binding a sub-field via register updates the item value', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    const items = useFieldArray<{ qty: number }>(form, 'items')
    items.append({ qty: 0 })
    const itemName = items.items()[0]!.name // "items.0"
    form.register(`${itemName}.qty`, { type: 'number' }).onInput({
      target: { valueAsNumber: 7 },
    } as unknown as Event)
    expect(form.getValues().items).toEqual([{ qty: 7 }])
  })

  it('remove drops the item + reindexes (values preserved)', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    const items = useFieldArray<{ n: number }>(form, 'items')
    items.append({ n: 0 })
    items.append({ n: 1 })
    items.append({ n: 2 })
    items.remove(1)
    expect(form.getValues().items).toEqual([{ n: 0 }, { n: 2 }])
    expect(items.length()).toBe(2)
  })

  it('stable keys survive remove (for keyed <For>)', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    const items = useFieldArray<string>(form, 'xs')
    items.append('a')
    items.append('b')
    const keyOfB = items.items()[1]!.key
    items.remove(0) // remove 'a'
    // 'b' kept its stable key even though its index shifted 1 → 0
    expect(items.items()[0]!.key).toBe(keyOfB)
    expect(form.getValues().xs).toEqual(['b'])
  })

  it('move + swap reorder the assembled array', () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    const items = useFieldArray<number>(form, 'nums')
    items.append(1)
    items.append(2)
    items.append(3)
    items.move(0, 2) // [2,3,1]
    expect(form.getValues().nums).toEqual([2, 3, 1])
    items.swap(0, 2) // [1,3,2]
    expect(form.getValues().nums).toEqual([1, 3, 2])
  })

  it('per-item validation gates form validity', async () => {
    const form = useForm<Record<string, unknown>>({ initialValues: {}, onSubmit: () => {} })
    const items = useFieldArray<{ email: string }>(form, 'people')
    items.append({ email: '' })
    // Register a validator on the item's leaf (via the form).
    form.registerField('people.0.email', '', (v) => (v ? undefined : 'Required'))
    expect(await form.validate()).toBe(false)
    form.setFieldValue('people.0.email', 'a@b.com')
    expect(await form.validate()).toBe(true)
  })

  it('seeds from existing initialValues array', () => {
    const form = useForm<Record<string, unknown>>({
      initialValues: { items: [{ qty: 5 }] },
      onSubmit: () => {},
    })
    const items = useFieldArray<{ qty: number }>(form, 'items')
    expect(items.length()).toBe(1)
    items.append({ qty: 9 })
    expect(form.getValues().items).toEqual([{ qty: 5 }, { qty: 9 }])
  })

  it('the standalone overload still works (no form)', () => {
    const tags = useFieldArray<string>(['x'])
    tags.append('y')
    expect(tags.values()).toEqual(['x', 'y'])
  })
})
