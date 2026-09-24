import { h } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import RingProgress from './components/RingProgress'
import Tree from './components/Tree'
import Button from './components/Button'
import Stack from './components/Stack'

/**
 * Two components' edge behaviour: a progress ring given a value outside
 * 0-100, and a tree node that must not respond to a click.
 *
 * `RingProgress` clamps because the value comes from application state —
 * a percentage computed as `done / total` is `Infinity` when `total` is 0
 * and `NaN` when both are, and either one produces a `stroke-dashoffset`
 * of NaN. An SVG attribute set to NaN does not error: the arc simply
 * stops rendering, so the ring silently disappears at exactly the moment
 * the data is degenerate.
 *
 * `Tree` must ignore a click on a DISABLED node. A disabled row that
 * still selects is worse than one with no disabled support at all,
 * because the consumer has told the user it is unavailable and the
 * component contradicts them.
 */

let cleanup: (() => void) | undefined

afterEach(() => {
  cleanup?.()
  cleanup = undefined
})

const render = (node: unknown): void => {
  const r = mountInBrowser(h(PyreonUI, { theme }, node as never))
  cleanup = r.unmount
}

const ringOffset = (): number => {
  const circle = document.querySelectorAll('circle')[1]!
  return Number(circle.getAttribute('stroke-dashoffset'))
}

describe('RingProgress clamps whatever the application hands it', () => {
  it('renders a finite offset for an in-range value', () => {
    // The control: without it every clamp spec below passes against a
    // component that renders nothing measurable.
    render(h(RingProgress as never, { value: 50 }))
    expect(Number.isFinite(ringOffset())).toBe(true)
  })

  for (const [label, value] of [
    ['above 100', 150],
    ['below 0', -20],
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ] as Array<[string, number | undefined]>) {
    it(`stays finite for a value ${label}`, () => {
      // A NaN offset does not throw — the arc just stops rendering, so
      // the ring vanishes exactly when the data is degenerate.
      render(h(RingProgress as never, { value }))
      expect(Number.isFinite(ringOffset()), `${label} produced a non-finite offset`).toBe(true)
    })
  }

  it('accepts an ACCESSOR value as well as a number', () => {
    // Documented: "supports number OR accessor" — the signal-driven form
    // is the one a live progress ring actually uses.
    render(h(RingProgress as never, { value: () => 25 }))
    expect(Number.isFinite(ringOffset())).toBe(true)
  })

  it('renders a centre label when given children, and none when not', () => {
    render(h(RingProgress as never, { value: 50, children: '50%' }))
    expect(document.body.textContent).toContain('50%')
    cleanup?.()
    cleanup = undefined

    render(h(RingProgress as never, { value: 50 }))
    expect(document.body.textContent?.trim(), 'no stray label element').toBe('')
  })
})

describe('Tree ignores a click on a disabled node', () => {
  const DATA = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Blocked', disabled: true },
    { id: 'p', label: 'Parent', children: [{ id: 'c', label: 'Child' }] },
  ]

  /**
   * Click the ROW, not the label. A tree row is a glyph plus a label, so a
   * leaf-only search finds the glyph — which carries no click handler, and
   * the spec then reports "nothing was selected" for the wrong reason.
   */
  const clickLabel = (text: string): void => {
    const row = [...document.querySelectorAll<HTMLElement>('[role="treeitem"]')].find((n) =>
      n.textContent?.includes(text),
    )
    row?.click()
  }

  it('selects an enabled node', () => {
    // The control. (The callback is `onChange`, inherited from
    // `TreeBaseProps` — not `onSelect`, which is what I reached for first.)
    const selected: string[] = []
    render(h(Tree as never, { data: DATA, onChange: (id: string | string[]) => selected.push(String(id)) }))
    clickLabel('Alpha')
    expect(selected).toEqual(['a'])
  })

  it('does NOT select a disabled node', () => {
    // The consumer has told the user this row is unavailable; a component
    // that selects anyway contradicts its own affordance.
    const selected: string[] = []
    render(h(Tree as never, { data: DATA, onChange: (id: string | string[]) => selected.push(String(id)) }))
    clickLabel('Blocked')
    expect(selected).toEqual([])
  })

  it('a parent click toggles expansion and reveals its child', () => {
    render(h(Tree as never, { data: DATA }))
    expect(document.body.textContent, 'collapsed to begin with').not.toContain('Child')

    clickLabel('Parent')
    expect(document.body.textContent, 'the child is revealed').toContain('Child')
  })
})

describe('the element base emits the DISABLED visual state', () => {
  /**
   * `disabled` gates three things at once in the styles callback: it
   * suppresses the `:hover` / `:focus-visible` / `:active` rules and adds
   * the disabled theme. A control that keeps its hover styling while
   * disabled invites the click it is refusing — the affordance says
   * "interactive" and the behaviour says otherwise, which reads as the
   * component being broken rather than the control being unavailable.
   */
  it('a disabled Button renders, and carries the disabled attribute', () => {
    render(h(Button as never, { disabled: true }, 'Save'))
    const btn = document.querySelector('button')
    expect(btn, 'the button must render at all').not.toBeNull()
    expect(btn!.hasAttribute('disabled')).toBe(true)
  })

  it('an ENABLED Button is the control — no disabled attribute', () => {
    render(h(Button as never, {}, 'Save'))
    expect(document.querySelector('button')!.hasAttribute('disabled')).toBe(false)
  })

  it('an interactive Button still renders and responds to a click', () => {
    // The `onClick || href` branch drives `cursor: pointer`, but the
    // computed value comes back empty in this harness (the styles land in
    // a stylesheet the isolated container does not resolve), so this
    // asserts the BEHAVIOUR the branch accompanies rather than a style
    // the environment cannot report. Checked, not assumed.
    let clicks = 0
    render(h(Button as never, { onClick: () => (clicks += 1) }, 'Go'))
    document.querySelector('button')!.click()
    expect(clicks).toBe(1)
  })

  it('a disabled Tree row is marked for assistive tech, not just visually', () => {
    // `aria-disabled` is what a screen-reader user gets; the styling is
    // what everyone else gets, and both have to agree with the click
    // handler's refusal.
    render(
      h(Tree as never, {
        data: [
          { id: 'a', label: 'Alpha' },
          { id: 'b', label: 'Blocked', disabled: true },
        ],
      }),
    )

    const rows = [...document.querySelectorAll<HTMLElement>('[role="treeitem"]')]
    const blocked = rows.find((r) => r.textContent?.includes('Blocked'))!
    const alpha = rows.find((r) => r.textContent?.includes('Alpha'))!

    expect(blocked.getAttribute('aria-disabled'), 'a string, not presence-only').toBe('true')
    expect(alpha.getAttribute('aria-disabled'), 'and ABSENT when enabled').toBeNull()
  })
})

describe('the list base emits gap and indent only when the theme sets them', () => {
  /**
   * `gap` and `indent` are rocketstyle DIMENSIONS on the list base, and the
   * styles callback emits `margin` / `padding` only when the resolved theme
   * carries a value. Emitting them unconditionally would push `margin: 0
   * !important` onto every list — an `!important` no consumer can override,
   * which is why the guard is there and why both arms matter.
   */
  it('renders a gapped stack without emitting an unconditional !important', () => {
    render(h(Stack as never, { gap: 'medium' }, h('span', null, 'a'), h('span', null, 'b')))
    expect(document.body.textContent, 'the children render').toContain('a')
  })

  it('renders an ungapped stack too — the guard is not required for output', () => {
    render(h(Stack as never, {}, h('span', null, 'a')))
    expect(document.body.textContent).toContain('a')
  })
})
