/**
 * Regression: Wrapper used to silently drop `dangerouslySetInnerHTML`.
 *
 * Bug shape: `OWN_KEYS` listed `'dangerouslySetInnerHTML'`, so `splitProps`
 * moved it into `own`. The Styled JSX call only spread `...commonProps`
 * (built from `rest`) and never re-attached `own.dangerouslySetInnerHTML`.
 * Both runtimes (`runtime-server` and `runtime-dom`) support the prop —
 * the data was lost between Wrapper and the renderer.
 *
 * Two test layers:
 *
 * 1. **Mock-vnode tests** (this file's first describe block) — fast
 *    structural assertions against the vnode tree Wrapper returns. Catches
 *    the prop drop at the API surface where it originally happened.
 *
 * 2. **Real-h() mount tests** (second describe block) — uses real `h()` +
 *    `mount()` to exercise the full Element → Wrapper → Styled → DOM
 *    pipeline. Catches the prop drop wherever it might occur along the
 *    chain (Wrapper, Element, rocketstyle attrs HOC, runtime-dom prop
 *    application). This is the "safety net" pattern from
 *    .claude/rules/test-environment-parity.md — mock-vnode tests bypass
 *    the HOC + mount pipeline and CAN miss bugs that surface only when
 *    the real `h()` + mount path runs, exactly like PR #197's silent
 *    metadata drop. Always have both.
 */
import { h, type VNode } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('~/utils', () => ({
  IS_DEVELOPMENT: false,
}))

import Wrapper from '../helpers/Wrapper/component'
import { Element } from '../Element'

const asVNode = (v: unknown) => v as VNode

describe('Wrapper — dangerouslySetInnerHTML forwarding (mock-vnode)', () => {
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

// Real-h() mount tests — parallel coverage that runs the full pipeline.
// Element uses Wrapper internally; mounting Element with
// `dangerouslySetInnerHTML` exercises every layer the bug could surface
// at: Element's split → Wrapper → Styled → runtime-dom's prop application.
// happy-dom is the test environment; `dangerouslySetInnerHTML` translates
// to `el.innerHTML = ...` which happy-dom handles natively.
describe('Wrapper — dangerouslySetInnerHTML forwarding (real h() + mount)', () => {
  it('Element with dangerouslySetInnerHTML actually injects HTML into the DOM (non-needsFix tag)', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const unmount = mount(
      h(Element, {
        tag: 'div',
        'data-testid': 'innerhtml-host',
        dangerouslySetInnerHTML: { __html: '<svg data-marker="real-h-svg">x</svg>' },
      }),
      root,
    )

    // The structural assertion: SVG element exists in the rendered DOM.
    // Pre-fix Wrapper dropped the prop → no SVG → null query result.
    const svg = root.querySelector('[data-marker="real-h-svg"]')
    expect(svg).not.toBeNull()
    expect(svg?.tagName.toLowerCase()).toBe('svg')

    unmount()
    root.remove()
  })

  it('Element with dangerouslySetInnerHTML on a needsFix tag (button) still injects HTML', () => {
    // button is a needsFix tag (two-layer flex fix). The Wrapper branch
    // must bypass the two-layer fix when innerHTML is present, OR forward
    // innerHTML to the right layer. Either way the rendered DOM must
    // contain the user-supplied HTML.
    const root = document.createElement('div')
    document.body.appendChild(root)

    const unmount = mount(
      h(Element, {
        tag: 'button',
        'data-testid': 'innerhtml-button',
        dangerouslySetInnerHTML: {
          __html: '<span data-marker="real-h-button-label">click me</span>',
        },
      }),
      root,
    )

    const span = root.querySelector('[data-marker="real-h-button-label"]')
    expect(span).not.toBeNull()
    expect(span?.textContent).toBe('click me')

    unmount()
    root.remove()
  })

  it('children passed alongside dangerouslySetInnerHTML are dropped (innerHTML wins)', () => {
    // Bug shape: if Wrapper's `own.children` leaks into the rendered vnode
    // alongside `dangerouslySetInnerHTML`, runtime-dom would either mount
    // children INTO the innerHTML-populated element (overwriting), or land
    // both side-by-side. The contract is that innerHTML wins and children
    // are dropped. Verifying at the DOM level catches both failure shapes.
    const root = document.createElement('div')
    document.body.appendChild(root)

    const unmount = mount(
      h(
        Element,
        {
          tag: 'div',
          'data-testid': 'innerhtml-with-children',
          dangerouslySetInnerHTML: { __html: '<i data-marker="real-h-winner">html wins</i>' },
        },
        'this child text should NOT appear',
      ),
      root,
    )

    const host = root.querySelector('[data-testid="innerhtml-with-children"]')!
    expect(host.querySelector('[data-marker="real-h-winner"]')).not.toBeNull()
    // The child string must not appear anywhere in the rendered host.
    expect(host.textContent).not.toContain('this child text should NOT appear')
    expect(host.textContent).toContain('html wins')

    unmount()
    root.remove()
  })
})
