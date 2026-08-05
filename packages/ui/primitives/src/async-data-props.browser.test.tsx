/**
 * A list-shaped primitive must survive its data not having arrived yet.
 *
 * `TreeBase.data` and `ComboboxBase.options` are REQUIRED props, so TypeScript
 * already rejects the case where one was simply forgotten. The case that
 * reaches runtime is the legitimate one:
 *
 *     <Tree data={query.data} />          // undefined while the fetch is in flight
 *     <Combobox options={query.data} />
 *
 * Both used to throw a hard `TypeError` there — `for (const node of undefined)`
 * and `undefined.filter` — from inside an effect, which Pyreon routes to the
 * error handler and which can take the surrounding subtree down. A crash is a
 * wildly disproportionate answer to "not loaded yet"; rendering nothing is what
 * every list-shaped primitive does.
 *
 * The reactivity specs are the load-bearing half. The guard has to be an
 * ACCESSOR (`() => own.data ?? []`) rather than a captured const — `own.data`
 * is a getter, so reading it once at setup would freeze the list at whatever
 * was passed on the first render, and the arriving data would never appear.
 * That failure is invisible to a spec that only checks the empty case, which is
 * exactly the shape this fix is about.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import {
  ComboboxBase,
  type ComboboxOption,
  type ComboboxState,
  TreeBase,
  type TreeNode,
  type TreeState,
} from './index'

const TREE: TreeNode[] = [
  { id: '1', label: 'One', children: [{ id: '1a', label: 'Alpha' }] },
  { id: '2', label: 'Two' },
]
const OPTS: ComboboxOption[] = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
]

/**
 * Build props whose `key` is a live GETTER — the shape a reactive prop has.
 *
 * `<Tree data={query.data} />` is lowered by the compiler to an `_rp` thunk,
 * which `makeReactiveProps` turns into a getter on the props object, and
 * `splitProps` then copies that DESCRIPTOR onto `own`.
 *
 * The getter is defined on the OBJECT HANDED TO `h()`, never on one that is
 * later spread. An earlier version of this file built the getter separately and
 * let the mount helper do `{ ...props, children }` — and that spread FIRES the
 * getter and stores its resolved value, which is the value-copy anti-pattern
 * this repo documents and, ironically, a cousin of the bug under test. It made
 * the reactivity specs fail against a correct implementation.
 */
const reactiveProps = (
  key: string,
  read: () => unknown,
  children: unknown,
): Record<string, unknown> => {
  const props: Record<string, unknown> = { children }
  Object.defineProperty(props, key, { get: read, enumerable: true, configurable: true })
  return props
}

const mountTree = (props: Record<string, unknown>): TreeState => {
  let captured: TreeState | undefined
  const child = (s: TreeState) => {
    captured = s
    return h('div', null)
  }
  // `children` is assigned rather than spread in, for the reason above.
  props.children = child
  mountInBrowser(h(TreeBase as never, props))
  if (!captured) throw new Error('render child did not run')
  return captured
}

const mountCombo = (props: Record<string, unknown>): ComboboxState => {
  let captured: ComboboxState | undefined
  const child = (s: ComboboxState) => {
    captured = s
    return h('div', null)
  }
  props.children = child
  mountInBrowser(h(ComboboxBase as never, props))
  if (!captured) throw new Error('render child did not run')
  return captured
}

describe('TreeBase — data that has not arrived', () => {
  it('mounts and reports an empty tree instead of throwing', () => {
    const s = mountTree({ data: undefined })
    expect(s.visibleNodes()).toEqual([])
  })

  it('every data-reading helper is safe, not just the first one to run', () => {
    // Three separate call sites read the data, and each had its own chance to
    // forget the guard — which is why it is normalized in one place. A spec
    // that only exercised `visibleNodes` would have passed with two of them
    // still broken.
    const s = mountTree({ data: undefined })
    expect(s.visibleNodes()).toEqual([])
    expect(() => s.onKeyDown(new KeyboardEvent('keydown', { key: '*', cancelable: true }))).not.toThrow()
    expect(() => s.getItemProps('missing', 0, false)).not.toThrow()
  })

  it('renders the data once it ARRIVES — the guard must not freeze the list', () => {
    const data = signal<TreeNode[] | undefined>(undefined)
    const s = mountTree(reactiveProps('data', () => data(), undefined))
    expect(s.visibleNodes()).toEqual([])
    data.set(TREE)
    expect(s.visibleNodes().map((n) => n.node.id)).toEqual(['1', '2'])
  })
})

describe('ComboboxBase — options that have not arrived', () => {
  it('mounts and reports no options instead of throwing', () => {
    const s = mountCombo({ options: undefined })
    expect(s.filtered()).toEqual([])
  })

  it('every option-reading helper is safe', () => {
    const s = mountCombo({ options: undefined })
    expect(s.filtered()).toEqual([])
    expect(() => s.select('anything')).not.toThrow()
    expect(() => s.getOptionProps('anything', 0)).not.toThrow()
  })

  it('renders the options once they ARRIVE', () => {
    const options = signal<ComboboxOption[] | undefined>(undefined)
    const s = mountCombo(reactiveProps('options', () => options(), undefined))
    expect(s.filtered()).toEqual([])
    options.set(OPTS)
    expect(s.filtered().map((o) => o.value)).toEqual(['a', 'b'])
  })
})
