/**
 * Compile-time type tests for Iterator + List overloads.
 *
 * The public callable interface ships FOUR overloads in priority order:
 *
 *   1. SimpleProps<T extends SimpleValue>   — `valueName` allowed, no `children`
 *   2. ObjectProps<T extends ObjectValue>   — `valueName` FORBIDDEN, no `children`
 *   3. ChildrenProps                        — `children` required, no `data`/`component`
 *   4. LooseProps                           — fallback for forwarding patterns
 *
 * The first three drive per-mode T inference and stricter constraints for
 * direct callers. The 4th (LooseProps — added in PR #229's mirror) exists
 * so that wide-union props produced by `@pyreon/rocketstyle`'s 4-overload-
 * aware `ExtractProps` (PR #222 mirror) have a binding home. Pre-fallback
 * the wide union failed to bind to any narrow overload and TS reported
 * "no overload matches this call" at every forwarding site.
 *
 * Trade-off: adding the loose fallback intentionally weakens the strict
 * per-mode constraints for DIRECT callers too — a call that doesn't match
 * Simple / Object / Children will now match LooseProps and compile. This
 * matches vitus-labs's design choice (PR #229): forwarding-pattern support
 * is more valuable than mixed-shape rejection at the type level. Runtime
 * still picks the right mode based on the data shape.
 *
 * Regression: pre-PR-5 (4-overload `ExtractProps`), Pyreon's Iterator type
 * collapsed all three narrow modes when wrapped through `rocketstyle()` /
 * `attrs()` — only the LAST overload's props survived. PR #5 + PR #7
 * together restore the full union AND give it a binding home.
 */

import { describe, expectTypeOf, it } from 'vitest'
import { h } from '@pyreon/core'
import Iterator from '../helpers/Iterator/component'
import List from '../List/component'
import type {
  ChildrenProps,
  LooseProps,
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

describe('Iterator — happy-path overload selection', () => {
  const Item = (p: { children?: unknown }) => h('span', null, p.children as never)

  it('SimpleProps mode: valueName allowed', () => {
    // Direct call with primitive data + valueName → SimpleProps overload
    Iterator({
      data: ['a', 'b'] as string[],
      component: Item,
      valueName: 'text',
    })

    // Mixed shape (children + data) now falls through to LooseProps — by
    // design after PR #229's mirror. Strict per-mode rejection is no longer
    // enforced at the type level; runtime picks the right path based on
    // which props are present. This compiles and that's intentional.
    Iterator({
      data: ['a', 'b'] as string[],
      component: Item,
      children: h('span', null, 'leaked'),
    })
  })

  it('ObjectProps mode: valueName FORBIDDEN by Object overload but accepted by Loose', () => {
    type Row = { id: number; label: string }
    Iterator({
      data: [{ id: 1, label: 'a' }] as Row[],
      component: Item,
    })

    // `valueName: 'row'` doesn't match ObjectProps' `valueName?: never`, but
    // the LooseProps fallback accepts it. Pre-PR-7 this errored; now it's a
    // legal forwarding shape.
    Iterator({
      data: [{ id: 1, label: 'a' }] as Row[],
      component: Item,
      valueName: 'row',
    })
  })

  it('ChildrenProps mode: clean form picked when only children supplied', () => {
    Iterator({ children: h('span', null, 'hi') })

    // Mixing children with data / component used to be a hard error.
    // Post-PR-7 the LooseProps fallback accepts these — runtime decides
    // which mode fires based on which fields are populated.
    Iterator({
      children: h('span', null, 'hi'),
      data: [1, 2, 3],
    })

    Iterator({
      children: h('span', null, 'hi'),
      component: Item,
    })
  })
})

describe('Iterator + List — LooseProps fallback for forwarding patterns (PR #7)', () => {
  const Item = (p: { children?: unknown }) => h('span', null, p.children as never)

  it('LooseProps shape binds via the 4th overload (no overload-mismatch error)', () => {
    // The motivating shape: a wide-union props object produced by
    // `Partial<(typeof Wrapper)['$$types']>` (rocketstyle's $$types after
    // PR #5's 4-overload ExtractProps distributes the union). Without the
    // loose fallback overload, this fails at every forwarding call site
    // with "no overload matches this call" — the wide union doesn't bind
    // to SimpleProps<T> / ObjectProps<T> / ChildrenProps individually.
    const looseForwarded: LooseProps = {
      data: ['a', 'b'],
      component: Item,
      valueName: 'text',
    }
    Iterator(looseForwarded)
    // Cast preserves the LooseProps binding (the conditional Props<T>
    // exposes LooseProps when T defaults to unknown).
    Iterator(looseForwarded as Props)
  })

  it('partial / empty shapes are accepted via LooseProps', () => {
    // Empty object — no narrow overload matches (data missing for Simple/
    // Object, children missing for Children) but LooseProps' fields are
    // all optional. This is the genuine forwarding shape from props spread.
    const empty: LooseProps = {}
    Iterator(empty)

    // Object with just `data` (no component) — falls through to LooseProps.
    Iterator({ data: ['a'] as string[] } as LooseProps)
  })

  it('List inherits the LooseProps fallback overload', () => {
    const looseForwarded: LooseProps = {
      data: [{ id: 1, name: 'A' }],
      component: Item,
    }
    // List's 4th overload mirrors Iterator's — wide unions bind here too.
    List({ ...looseForwarded, rootElement: true })
  })

  it('the loose fallback is the 4th overload (order matters for inference)', () => {
    // Direct callers that DO match SimpleProps shape should still drive
    // T inference from `data` — i.e. the overload picked at the call site
    // is the FIRST one matching, not LooseProps. This is what preserves
    // the strict per-mode constraints for the direct-caller happy path.
    //
    // We can't introspect "which overload TS picked" directly, but we CAN
    // prove SimpleProps<T>'s `valueName?: string` survives — a LooseProps
    // pick would lose the per-mode field constraints. The fact that the
    // existing `expectTypeOf<Props<string>>().toEqualTypeOf<SimpleProps<string>>()`
    // in the first describe block passes is the structural anchor.
    type Props_string = Props<string>
    expectTypeOf<Props_string>().toEqualTypeOf<SimpleProps<string>>()
    // Negative: when T is unparameterized, Props falls back to LooseProps
    // by design (the `unknown extends T` clause in Props<T>'s definition).
    expectTypeOf<Props>().toEqualTypeOf<LooseProps>()
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

    // ObjectProps mode forbids `valueName`, but the LooseProps fallback
    // accepts it — same trade-off as Iterator (see top-of-file comment).
    List({
      data: [{ id: 1, name: 'Alice' }] as User[],
      component: Card,
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
