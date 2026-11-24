// Every public read accessor of `useForm` / `useFieldArray` TRACKS: a
// computed/effect built on it re-runs when what it read changes. Pre-fix,
// `useFieldArray().values()`, `form.values()`, `form.getValues()`,
// `form.getValues(name)` and `form.errors()` all `.peek()`ed, so a derived
// "is this list dirty?" computed was evaluated once and never again (#4824).
import { computed, effect } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { useFieldArray } from '../use-field-array'
import { useForm } from '../use-form'

describe('useFieldArray().values() tracks (#4824)', () => {
  it('a computed over values() sees item.value.set, append, remove, move, replace', () => {
    const a = useFieldArray([{ x: 1 }])
    const viaValues = computed(() => JSON.stringify(a.values()))
    expect(viaValues()).toBe('[{"x":1}]')

    a.items()[0]!.value.set({ x: 2 })
    expect(viaValues()).toBe('[{"x":2}]')

    a.append({ x: 3 })
    expect(viaValues()).toBe('[{"x":2},{"x":3}]')

    a.update(1, { x: 4 })
    expect(viaValues()).toBe('[{"x":2},{"x":4}]')

    a.move(1, 0)
    expect(viaValues()).toBe('[{"x":4},{"x":2}]')

    a.remove(0)
    expect(viaValues()).toBe('[{"x":2}]')

    a.replace([{ x: 9 }])
    expect(viaValues()).toBe('[{"x":9}]')
  })

  it('an effect over values() re-runs on an item edit', () => {
    const a = useFieldArray(['a'])
    const seen: string[][] = []
    const e = effect(() => {
      seen.push(a.values())
    })
    a.update(0, 'b')
    a.prepend('z')
    e.dispose()
    expect(seen).toEqual([['a'], ['b'], ['z', 'b']])
  })
})

describe('useForm read accessors track', () => {
  it('values() re-derives on setFieldValue and keeps the cached object between changes', () => {
    const form = useForm({ initialValues: { a: '', b: 0 }, onSubmit: () => {} })
    const json = computed(() => JSON.stringify(form.values()))
    expect(json()).toBe('{"a":"","b":0}')
    form.setFieldValue('a', 'x')
    expect(json()).toBe('{"a":"x","b":0}')
    const snap = form.values()
    expect(form.values()).toBe(snap)
  })

  it('values() sees a direct fields.x.value.set (no stale cached snapshot)', () => {
    const form = useForm({ initialValues: { a: '' }, onSubmit: () => {} })
    const a = computed(() => form.values().a)
    expect(a()).toBe('')
    form.fields.a.value.set('direct')
    expect(a()).toBe('direct')
    expect(form.values().a).toBe('direct')
  })

  it('getValues() and getValues(name) track', () => {
    const form = useForm({ initialValues: { a: 1, b: 2 }, onSubmit: () => {} })
    const all = computed(() => form.getValues().a + form.getValues().b)
    const one = computed(() => form.getValues('b'))
    expect([all(), one()]).toEqual([3, 2])
    form.setFieldValue('b', 5)
    expect([all(), one()]).toEqual([6, 5])
  })

  it('values() tracks the field set (registerField / unregisterField)', () => {
    const form = useForm({ initialValues: { a: '' }, onSubmit: () => {} })
    const keys = computed(() => Object.keys(form.values()).join(','))
    expect(keys()).toBe('a')
    form.registerField('extra', 'v')
    expect(keys()).toBe('a,extra')
    form.unregisterField('extra')
    expect(keys()).toBe('a')
  })

  it('errors() tracks field errors', async () => {
    const form = useForm({
      initialValues: { a: '' },
      validators: { a: (v) => (v ? undefined : 'required') },
      onSubmit: () => {},
    })
    const errs = computed(() => JSON.stringify(form.errors()))
    expect(errs()).toBe('{}')
    await form.validate()
    expect(errs()).toBe('{"a":"required"}')
    form.setFieldError('a', undefined)
    expect(errs()).toBe('{}')
  })

  it('dirtyFields() / touchedFields() track a field registered later', () => {
    const form = useForm({ initialValues: { a: '' }, onSubmit: () => {} })
    const dirty = computed(() => Object.keys(form.dirtyFields()).join(','))
    expect(dirty()).toBe('')
    form.registerField('late', '')
    form.setFieldValue('late' as 'a', 'changed')
    expect(dirty()).toBe('late')
  })
})
