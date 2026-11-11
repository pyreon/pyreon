// `<For each>` rejected a `readonly` array.
//
// `ForProps.each` was typed `T[] | (() => T[])`, so immutable data — an
// `as const` array, a `readonly X[]` prop, JSON imported `as const`, or an
// accessor returning `readonly X[]` — failed with:
//
//   The type 'readonly X[]' is 'readonly' and cannot be assigned to the
//   mutable type 'X[]'.
//
// For only READS the list (runtime-dom's `mountFor`, both SSR paths), so the
// prop is `readonly T[] | (() => readonly T[])`. Mutable arrays still assign to
// it. These are TYPE assertions: the file failing to typecheck IS the failure.
//
// Core's vitest config has no JSX transform, so the props are checked through a
// direct `For({...})` call — the same check JSX performs on `<For each={…}>`
// (a function component's props are its first parameter).

import { describe, expect, expectTypeOf, it } from 'vitest'
import { For } from '../for'
import type { ForProps } from '../for'
import type { VNode } from '../types'

interface Item {
  id: number
  label: string
}

const readonlyItems: readonly Item[] = [
  { id: 1, label: 'a' },
  { id: 2, label: 'b' },
]
const constItems = [
  { id: 1, label: 'a' },
  { id: 2, label: 'b' },
] as const
const mutableItems: Item[] = [{ id: 1, label: 'a' }]
const readonlyAccessor = (): readonly Item[] => readonlyItems
const mutableAccessor = (): Item[] => mutableItems

const row = (item: Item): VNode => ({ type: 'li', props: {}, children: [item.label], key: null })

describe('<For each> accepts readonly arrays', () => {
  it('accepts a readonly array', () => {
    const node = For({ each: readonlyItems, by: (r) => r.id, children: row })
    expect(node.props.each).toBe(readonlyItems)
  })

  it('accepts an accessor returning a readonly array', () => {
    const node = For({ each: readonlyAccessor, by: (r) => r.id, children: row })
    expect(node.props.each).toBe(readonlyAccessor)
  })

  it('accepts an `as const` tuple and infers the element type from it', () => {
    const node = For({
      each: constItems,
      by: (r) => {
        expectTypeOf(r.id).toEqualTypeOf<1 | 2>()
        return r.id
      },
      children: (r) => row({ id: r.id, label: r.label }),
    })
    expect(node).toBeTruthy()
  })

  it('infers T from a readonly array and from a readonly accessor', () => {
    For({
      each: readonlyItems,
      by: (r) => {
        expectTypeOf(r).toEqualTypeOf<Item>()
        return r.id
      },
      children: row,
    })
    For({
      each: () => readonlyItems,
      by: (r) => {
        expectTypeOf(r).toEqualTypeOf<Item>()
        return r.id
      },
      children: row,
    })
  })

  it('still accepts mutable arrays and mutable accessors (no regression)', () => {
    const props: ForProps<Item>[] = [
      { each: mutableItems, by: (r) => r.id, children: row },
      { each: mutableAccessor, by: (r) => r.id, children: row },
    ]
    expect(props).toHaveLength(2)
  })

  it('types `each` as the readonly union', () => {
    expectTypeOf<ForProps<Item>['each']>().toEqualTypeOf<
      readonly Item[] | (() => readonly Item[])
    >()
  })
})
