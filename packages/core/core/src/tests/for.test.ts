import { For, ForSymbol } from '../for'
import { h } from '../h'
import type { VNode } from '../types'

describe('For', () => {
  test('returns VNode with ForSymbol type', () => {
    const node = For({
      each: () => [1, 2, 3],
      by: (item) => item,
      children: (item) => h('li', null, String(item)),
    })
    expect(node.type).toBe(ForSymbol)
  })

  test('VNode has empty children array', () => {
    const node = For({
      each: () => [],
      by: (item: number) => item,
      children: (item) => h('span', null, String(item)),
    })
    expect(node.children).toEqual([])
  })

  test('VNode has null key', () => {
    const node = For({
      each: () => [1],
      by: (item) => item,
      children: (item) => h('li', null, String(item)),
    })
    expect(node.key).toBeNull()
  })

  test('props contain each, by, children functions', () => {
    const eachFn = () => ['a', 'b']
    const byFn = (item: string) => item
    const childFn = (item: string) => h('span', null, item)
    const node = For({ each: eachFn, by: byFn, children: childFn })

    const props = node.props as unknown as {
      each: typeof eachFn
      by: typeof byFn
      children: typeof childFn
    }
    expect(props.each).toBe(eachFn)
    expect(props.by).toBe(byFn)
    expect(props.children).toBe(childFn)
  })

  test('ForSymbol is a unique symbol', () => {
    expect(typeof ForSymbol).toBe('symbol')
    expect(ForSymbol.toString()).toContain('pyreon.For')
  })

  test('works with object items', () => {
    interface Item {
      id: number
      name: string
    }
    const items: Item[] = [
      { id: 1, name: 'one' },
      { id: 2, name: 'two' },
    ]
    const node = For<Item>({
      each: () => items,
      by: (item) => item.id,
      children: (item) => h('li', null, item.name),
    })
    expect(node.type).toBe(ForSymbol)
    const props = node.props as unknown as { each: () => Item[] }
    expect(props.each()).toBe(items)
  })

  test('works with string keys', () => {
    const node = For({
      each: () => [{ slug: 'hello' }, { slug: 'world' }],
      by: (item) => item.slug,
      children: (item) => h('div', null, item.slug),
    })
    expect(node.type).toBe(ForSymbol)
  })

  test('children function produces VNodes', () => {
    const childFn = (n: number) => h('li', { key: n }, String(n))
    const node = For({
      each: () => [1, 2, 3],
      by: (n) => n,
      children: childFn,
    })
    const props = node.props as unknown as { children: typeof childFn }
    const result = props.children(1)
    expect((result as VNode).type).toBe('li')
    expect((result as VNode).key).toBe(1)
  })

  // Regression: `ForProps.each` previously typed as `() => T[]` only.
  // Users writing `<For each={items}>` (with `items: T[]` directly) hit
  // a confusing TS error: `Type 'T[]' is not assignable to type
  // '() => T[]'`. The runtime in `runtime-dom/src/mount.ts:144-147`
  // already accepted both shapes — only the type was forcing the
  // accessor form. Type now accepts `T[] | (() => T[])` so users with
  // already-resolved arrays don't need to wrap them in a thunk just to
  // satisfy the type.
  test('each accepts T[] directly (not just () => T[])', () => {
    // TypeScript-level test: this would not compile pre-fix.
    const items = [1, 2, 3]
    const childFn = (n: number): VNode => h('li', { key: n }, String(n))
    const node = For<number>({ each: items, by: (n) => n, children: childFn })
    expect(node.type).toBe(ForSymbol as unknown as string)
    // Both shapes still work — function form continues to typecheck.
    const node2 = For<number>({
      each: () => items,
      by: (n) => n,
      children: childFn,
    })
    expect(node2.type).toBe(ForSymbol as unknown as string)
  })
})
