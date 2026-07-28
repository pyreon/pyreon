/**
 * rocketstyle → Element prop forwarding, asserted at the DOM.
 *
 * Two silent no-ops surfaced while building the Atlas workbench on this stack:
 * `innerRef={fn}` never fired (only `ref` did), and an ACCESSOR-valued generic
 * attribute (`dir={() => 'rtl'}`) produced no attribute at all. Both typecheck,
 * neither errors — the app just quietly misses a ref or an attribute, which is
 * the worst failure shape. These pin the real rendered outcome.
 */
import { h } from '@pyreon/core'
import { mountReactive } from '@pyreon/test-utils'
import rocketstyle from '@pyreon/rocketstyle'
import { describe, expect, it } from 'vitest'
import { Element } from '@pyreon/elements'

const El = rocketstyle({ useBooleans: false })({
  name: 'FwdEl',
  component: Element as never,
})

const mount = (props: Record<string, unknown>) => {
  const { container } = mountReactive(() => h(El as never, { 'data-t': '1', ...props }))
  return container as HTMLElement
}

describe('rocketstyle → Element: attributes', () => {
  it('forwards a STATIC generic attribute (control)', () => {
    expect(mount({ dir: 'rtl' }).querySelector('[data-t]')?.getAttribute('dir')).toBe('rtl')
  })

  it('forwards an ACCESSOR-valued generic attribute', () => {
    expect(mount({ dir: () => 'rtl' }).querySelector('[data-t]')?.getAttribute('dir')).toBe('rtl')
  })
})

describe('rocketstyle → Element: refs', () => {
  it('fires `ref` with the DOM node (control)', () => {
    let node: unknown = null
    mount({ ref: (n: unknown) => { node = n } })
    expect(node).not.toBeNull()
  })

  it('fires `innerRef` with the DOM node', () => {
    // Element documents `innerRef` as first-class (`own.ref ?? own.innerRef`),
    // and styler aliases it — so it must survive rocketstyle too, or the
    // convention silently breaks for every rocketstyle-wrapped component.
    let node: unknown = null
    mount({ innerRef: (n: unknown) => { node = n } })
    expect(node, 'innerRef never fired').not.toBeNull()
  })
})
