/**
 * Regression: Wrapper used to silently drop `dangerouslySetInnerHTML`.
 *
 * Bug shape: `OWN_KEYS` listed `'dangerouslySetInnerHTML'`, so `splitProps`
 * moved it into `own`. The Styled JSX call only spread `...commonProps`
 * (built from `rest`) and never re-attached `own.dangerouslySetInnerHTML`.
 * Both runtimes (`runtime-server` and `runtime-dom`) support the prop —
 * the data was lost between Wrapper and the renderer.
 */
import type { VNode } from '@pyreon/core'
import { describe, expect, it, vi } from 'vitest'

vi.mock('~/utils', () => ({
  IS_DEVELOPMENT: false,
}))

import Wrapper from '../helpers/Wrapper/component'

const asVNode = (v: unknown) => v as VNode

describe('Wrapper — dangerouslySetInnerHTML forwarding', () => {
  it('forwards dangerouslySetInnerHTML to the rendered Styled vnode (non-needsFix path)', () => {
    const html = { __html: '<svg>x</svg>' }
    const result = asVNode(
      Wrapper({
        tag: 'div',
        dangerouslySetInnerHTML: html,
      }),
    )

    // Bug-shape assertion: the prop must reach the rendered vnode.
    // Pre-fix this is `undefined` → SVG is silently dropped.
    expect(result.props.dangerouslySetInnerHTML).toBe(html)
  })

  it('drops children when dangerouslySetInnerHTML is present (mutually exclusive)', () => {
    const html = { __html: '<svg>x</svg>' }
    const result = asVNode(
      Wrapper({
        tag: 'div',
        dangerouslySetInnerHTML: html,
        // children would conflict — innerHTML wins.
        children: 'should be dropped',
      }),
    )

    // children slot must not coexist with innerHTML — runtime-server's
    // and runtime-dom's prop pipeline both treat them as inner-content
    // sources, and emitting both would result in either a malformed
    // tree or innerHTML being overwritten by the children mount.
    expect(result.children).toEqual([])
  })

  it('forwards dangerouslySetInnerHTML on the needsFix path (button/fieldset/legend)', () => {
    // button/fieldset/legend take the two-layer flex fix path. innerHTML
    // belongs on the inner styled node (where the actual content goes),
    // NOT on the outer wrapper.
    const html = { __html: '<span>label</span>' }
    const result = asVNode(
      Wrapper({
        tag: 'button',
        dangerouslySetInnerHTML: html,
      }),
    )

    // The `needsFix` branch should NOT trigger when innerHTML is set
    // (innerHTML replaces all children, including the inner flex-fix
    // layer). The simplest correct behavior: bypass needsFix when
    // innerHTML is present and forward the prop on the single Styled.
    expect(result.props.dangerouslySetInnerHTML).toBe(html)
  })
})
