/**
 * Compile-time type tests for Iterator + List overloads.
 *
 * The strict overloads on the public callable interface enforce per-mode
 * constraints that the loose runtime accepts:
 *
 *   - SimpleProps<T extends SimpleValue>   — `valueName` allowed, no `children`
 *   - ObjectProps<T extends ObjectValue>   — `valueName` FORBIDDEN, no `children`
 *   - ChildrenProps                        — `children` required, no `data`/`component`
 *
 * Regression: pre-fix, Pyreon's Iterator type collapsed all three modes into
 * one loose `Props` union, so `data={[1, {id:1}, null]}` typechecked but
 * failed at runtime. The overloads below verify the constraints fire.
 *
 * `// @ts-expect-error` lines are the load-bearing assertions: each one
 * MUST report a TS error or this file fails to compile (because of the
 * `--noUnusedLocals` / `--noUnusedParameters` semantics — `expect-error`
 * comments without an actual error are themselves errors).
 */

import { describe, expectTypeOf, it } from 'vitest'
import { h } from '@pyreon/core'
import Iterator from '../helpers/Iterator/component'
import List from '../List/component'
import type {
  ChildrenProps,
  ObjectProps,
  Props,
  SimpleProps,
} from '../helpers/Iterator/types'

describe('Iterator — Props<T> generic dispatch', () => {
  it('Props<string> narrows to SimpleProps<string>', () => {
    expectTypeOf<Props<string>>().toEqualTypeOf<SimpleProps<string>>()
  })

  it('Props<{ id: number; name: string }> narrows to ObjectProps<...>', () => {
    type User = { id: number; name: string }
    expectTypeOf<Props<User>>().toEqualTypeOf<ObjectProps<User>>()
  })

  it('Props<unknown> (default) falls back to loose props', () => {
    // The default Props (no T) MUST accept the legacy untyped call surface.
    // Smoke check: `data: any[]` shape continues to typecheck without
    // narrowing.
    type Default = Props
    const _ok: Default = { data: ['a', 1, null], component: 'div' }
    void _ok
  })
})

describe('Iterator — overload constraint enforcement', () => {
  const Item = (p: { children?: unknown }) => h('span', null, p.children as never)

  it('SimpleProps mode: valueName allowed, children rejected', () => {
    Iterator({
      data: ['a', 'b'] as string[],
      component: Item,
      valueName: 'text',
    })

    Iterator({
      data: ['a', 'b'] as string[],
      component: Item,
      // @ts-expect-error — primitive-array mode forbids `children`
      children: h('span', null, 'leaked'),
    })
  })

  it('ObjectProps mode: valueName FORBIDDEN, children rejected', () => {
    type Row = { id: number; label: string }
    Iterator({
      data: [{ id: 1, label: 'a' }] as Row[],
      component: Item,
    })

    Iterator({
      data: [{ id: 1, label: 'a' }] as Row[],
      component: Item,
      // @ts-expect-error — object-array mode forbids `valueName`
      valueName: 'row',
    })
  })

  it('ChildrenProps mode: data + component rejected', () => {
    Iterator({ children: h('span', null, 'hi') })

    Iterator({
      children: h('span', null, 'hi'),
      // @ts-expect-error — children mode forbids `data` (`data?: never` in ChildrenProps)
      data: [1, 2, 3],
    })

    // @ts-expect-error — children mode forbids `component` (whole-call
    // overload mismatch: TS reports at the call line not the prop line)
    Iterator({
      children: h('span', null, 'hi'),
      component: Item,
    })
  })
})

describe('List — generic flow + Element prop forwarding', () => {
  const Card = (p: { children?: unknown }) => h('div', null, p.children as never)

  it('inherits Iterator overload constraints', () => {
    type User = { id: number; name: string }
    List({
      data: [{ id: 1, name: 'Alice' }] as User[],
      component: Card,
      rootElement: true,
    })

    List({
      data: [{ id: 1, name: 'Alice' }] as User[],
      component: Card,
      // @ts-expect-error — object-array mode forbids `valueName` (inherited from Iterator)
      valueName: 'user',
    })
  })

  it('forwards Element layout props (tag, direction, alignX, …)', () => {
    List({
      data: ['a', 'b'] as string[],
      component: Card,
      valueName: 'text',
      rootElement: true,
      tag: 'ul',
      direction: 'rows',
      alignX: 'center',
    })
  })

  it('rejects Element label/content (List-specific blacklist)', () => {
    List({
      children: h('span', null, 'hi'),
      // @ts-expect-error — List forbids `label` (ListOnly: label?: never)
      label: 'oops',
    })

    List({
      children: h('span', null, 'hi'),
      // @ts-expect-error — List forbids `content` (ListOnly: content?: never)
      content: 'oops',
    })
  })
})

describe('Children-vs-data type discrimination', () => {
  it('ChildrenProps and SimpleProps are mutually exclusive', () => {
    // The strict overloads pick exactly one mode. ChildrenProps' `data: never`
    // and SimpleProps' `children: never` ensure they can't be unified into
    // one shape — verified at the type level here.
    type C = ChildrenProps
    type S = SimpleProps<string>
    expectTypeOf<C['data']>().toEqualTypeOf<undefined>()
    expectTypeOf<S['children']>().toEqualTypeOf<undefined>()
  })
})
