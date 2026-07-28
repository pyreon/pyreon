// A reactive accessor was legal as a SOLE child and rejected among MULTIPLE
// children.
//
// `VNodeChild`'s array arm was `VNodeChildAtom[]` — atoms only — so:
//
//   <Text>{count}</Text>          ✅  sole child, hits the accessor arm
//   <Text>Count: {count}</Text>   ❌  two children, hits the atoms-only arm
//
// The second is the most common reactive pattern there is, and it failed on the
// canonical `@pyreon/primitives` while the IDENTICAL shape on a DOM element
// compiled — because the JSX runtime already types children as
// `VNodeChild | VNodeChild[]`. The runtime has always mounted accessors
// anywhere in a children array; only the type disagreed.
//
// Fixed at the root (`VNodeChild`), not at `ChildrenProp`. Widening
// ChildrenProp was tried first and broke 11 internal `h()` call sites in the
// primitives' own web implementations — fixing the wrong layer. The root fix
// needed ZERO call-site changes, which is the tell that it was the right one.
//
// These are TYPE assertions: the file failing to compile IS the failure.

import { describe, expect, it } from 'vitest'
import type { VNodeChild, VNodeChildAccessor } from '../types'

const accessor: () => number = () => 1
const node = { type: 'div', props: {}, children: [] } as unknown as VNodeChild

describe('VNodeChild accepts accessors among multiple children', () => {
  it('accepts an accessor as a SOLE child (unchanged)', () => {
    const sole: VNodeChild = accessor
    expect(typeof sole).toBe('function')
  })

  it('accepts an accessor ALONGSIDE text — the pattern that used to fail', () => {
    // `<Text>Count: {count}</Text>` lowers to exactly this shape.
    const mixed: VNodeChild = ['Count: ', accessor]
    expect(mixed).toHaveLength(2)
  })

  it('accepts an accessor alongside a VNode', () => {
    const mixed: VNodeChild = [node, accessor]
    expect(mixed).toHaveLength(2)
  })

  it('accepts several accessors together', () => {
    const many: VNodeChild = [accessor, ' and ', accessor]
    expect(many).toHaveLength(3)
  })

  it('still accepts a plain atom array (no regression)', () => {
    const atoms: VNodeChild = ['a', 1, true, null, undefined]
    expect(atoms).toHaveLength(5)
  })

  it('lets an accessor RETURN an array containing accessors', () => {
    // The return type needed the same widening, or `h(Fragment, null, () => …)`
    // in suspense.ts could not express its own children.
    const nested: VNodeChildAccessor = () => ['a', accessor]
    expect(nested()).toHaveLength(2)
  })

  it('an accessor returning a bare atom still works', () => {
    const atom: VNodeChildAccessor = () => 'hello'
    expect(atom()).toBe('hello')
  })
})
