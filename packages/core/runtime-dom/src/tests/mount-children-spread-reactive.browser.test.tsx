/** @jsxImportSource @pyreon/core */
/**
 * Regression specs for the mount.ts:404-410 children-merge spread bug
 * class. This is the structural root the sibling fix in `@pyreon/elements`
 * (Element / Text / Content `mergeProps` from `@pyreon/core`) addressed for those three
 * components by routing children THROUGH props (so the buggy branch is
 * skipped). This fix replaces the JS-level `{ ...vnode.props, children: ... }`
 * spread with a descriptor-copy via `Object.getOwnPropertyDescriptors` +
 * `Object.defineProperty`, closing the bug class for ANY caller — framework
 * or user-land — that uses the canonical `h(Comp, props, ...children)` JSX
 * compiled shape with reactive props.
 *
 * BUG SHAPE: when a parent component receives reactive props (so
 * `makeReactiveProps` has installed getter descriptors on them), and
 * forwards via `h(Inner, parentProps, ...children)`, mount.ts runs
 * `{ ...vnode.props, children: ... }` to merge `h()`'s positional
 * children into props. The JS-level object spread FIRES every getter on
 * `vnode.props` and stores the resolved value as a static data property.
 * `makeReactiveProps` then runs against the already-collapsed object,
 * sees no `_rp`-branded functions (the getters became strings/numbers/
 * objects), and returns it unchanged. The receiving component reads a
 * frozen snapshot — every reactive prop on every Pyreon component that
 * uses the canonical JSX-compiled call shape with children silently
 * loses reactivity.
 *
 * Each spec is bisect-load-bearing. Reverting mount.ts to the
 * spread form fails spec 1 and spec 3 (children-present forwarding
 * paths). Spec 2 stays GREEN regardless — control path, no children →
 * branch is skipped.
 */
import { _rp, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'

describe('mount.ts children-merge preserves reactive getter props', () => {
  it('reactive attribute survives h(Inner, parentProps, ...children) forwarding (children present → triggers buggy branch)', async () => {
    // Two-level chain:
    //   Outer receives `href` as an _rp-branded thunk. makeReactiveProps
    //   on Outer's props installs a GETTER descriptor for `href` on the
    //   props object Outer's body sees. Outer then forwards by calling
    //   h(Inner, props, 'label') — the 3rd arg is children. mount.ts hits
    //   the buggy branch (vnode.props.children === undefined → spread to
    //   merge h's children into props). The spread fires the `href`
    //   getter and stores '/a' as a static data property. Inner reads
    //   props.href via () => props.href inside applyProps' attribute
    //   binding — sees the static '/a' forever.
    const sig = signal(true)

    const Inner = (props: any) =>
      h('a', { href: () => props.href, 'data-testid': 'forwarded' }, props.children)

    const Outer = (props: any) => h(Inner, props, 'label')

    const { container } = mountInBrowser(
      h(Outer, { href: _rp(() => (sig() ? '/a' : '/b')) }),
    )

    const el = container.querySelector<HTMLAnchorElement>('[data-testid="forwarded"]')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('href')).toBe('/a')

    sig.set(false)
    await flush()
    expect(el.getAttribute('href')).toBe('/b')

    sig.set(true)
    await flush()
    expect(el.getAttribute('href')).toBe('/a')
  })

  it('control path: no children → branch skipped → reactive attribute works (should pass regardless of fix)', async () => {
    // Same forwarding chain but Outer calls h(Inner, props) with NO
    // children. vnode.children.length === 0 → mount.ts's spread branch
    // is skipped entirely → bug never fires. This test is the structural
    // CONTROL: post-fix it passes; pre-fix it ALSO passes (the buggy
    // branch is never taken). Locks in the assertion that the fix
    // doesn't break the no-children path.
    const sig = signal(true)

    const Inner = (props: any) =>
      h('a', { href: () => props.href, 'data-testid': 'no-children' })

    const Outer = (props: any) => h(Inner, props)

    const { container } = mountInBrowser(
      h(Outer, { href: _rp(() => (sig() ? '/a' : '/b')) }),
    )

    const el = container.querySelector<HTMLAnchorElement>('[data-testid="no-children"]')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('href')).toBe('/a')

    sig.set(false)
    await flush()
    expect(el.getAttribute('href')).toBe('/b')
  })

  it('reactive prop used as JSX text child survives forwarding (non-attribute consumer)', async () => {
    // Same forwarding shape; this time Inner reads `props.label` and
    // uses it as a JSX text child accessor. Tests the bug class against
    // a reactive NON-attribute prop (text-node binding goes through
    // _bindText, not applyProps). Confirms the structural fix covers
    // every downstream reactive consumer, not just attribute application.
    const sig = signal('first')

    const Inner = (props: any) =>
      h('span', { 'data-testid': 'text-forwarded' }, () => props.label)

    const Outer = (props: any) => h(Inner, props, 'ignored-children-arg')

    const { container } = mountInBrowser(
      h(Outer, { label: _rp(() => sig()) }),
    )

    const el = container.querySelector<HTMLSpanElement>('[data-testid="text-forwarded"]')!
    expect(el).not.toBeNull()
    expect(el.textContent).toBe('first')

    sig.set('second')
    await flush()
    expect(el.textContent).toBe('second')

    sig.set('third')
    await flush()
    expect(el.textContent).toBe('third')
  })
})
