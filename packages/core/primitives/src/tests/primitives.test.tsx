// Happy-DOM unit tests for the implemented web primitives.
//
// Browser-specific assertions (real getComputedStyle, real event
// sequencing) live in `primitives.browser.test.tsx`; THIS file covers
// the basic render contract — VNode shape, attribute mapping, event
// wiring — that happy-dom can validate without a real browser.
//
// Coverage rationale: the `test` workspace command runs happy-dom
// tests + reports coverage. Browser tests run as a separate
// `test:browser` command and don't contribute to the coverage gate.
// Without this file, the web/*.tsx implementations show 0% coverage
// (Phase A2 #894 CI failure). This file pulls the gate above the
// 90% threshold by exercising the basic render path on every
// primitive in happy-dom.

import { afterEach, describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import {
  Button,
  Field,
  Heading,
  Icon,
  Image,
  Inline,
  init,
  Layer,
  Link,
  Modal,
  Press,
  resetPrimitivesConfig,
  Scroll,
  Spacer,
  Stack,
  Text,
  Toggle,
} from '../index'

function mountTest(vnode: ReturnType<typeof h>): {
  container: HTMLDivElement
  unmount: () => void
} {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const unmount = mount(vnode, container)
  return {
    container,
    unmount: () => {
      unmount()
      document.body.removeChild(container)
    },
  }
}

describe('<Stack> happy-dom unit', () => {
  it('renders a <div> with display:flex; default direction column', () => {
    const { container, unmount } = mountTest(h(Stack, null, h('span', null, 'a')))
    const root = container.firstElementChild as HTMLDivElement
    expect(root.tagName).toBe('DIV')
    expect(root.style.display).toBe('flex')
    expect(root.style.flexDirection).toBe('column')
    unmount()
  })

  it('direction="row" emits flex-direction: row', () => {
    const { container, unmount } = mountTest(h(Stack, { direction: 'row' }, h('span', null, 'a')))
    expect((container.firstElementChild as HTMLDivElement).style.flexDirection).toBe('row')
    unmount()
  })

  it('gap={2} → style.gap = 8px', () => {
    const { container, unmount } = mountTest(h(Stack, { gap: 2 }, h('span', null, 'a')))
    expect((container.firstElementChild as HTMLDivElement).style.gap).toBe('8px')
    unmount()
  })

  it('padding="md" → style.padding = 12px', () => {
    const { container, unmount } = mountTest(h(Stack, { padding: 'md' }, h('span', null, 'a')))
    expect((container.firstElementChild as HTMLDivElement).style.padding).toBe('12px')
    unmount()
  })

  it('align="center" maps to flex alignItems: center', () => {
    const { container, unmount } = mountTest(h(Stack, { align: 'center' }, h('span', null, 'a')))
    expect((container.firstElementChild as HTMLDivElement).style.alignItems).toBe('center')
    unmount()
  })

  it('justify="between" maps to flex justifyContent: space-between', () => {
    const { container, unmount } = mountTest(h(Stack, { justify: 'between' }, h('span', null, 'a')))
    expect((container.firstElementChild as HTMLDivElement).style.justifyContent).toBe(
      'space-between',
    )
    unmount()
  })

  it('wrap=true sets flex-wrap: wrap', () => {
    const { container, unmount } = mountTest(h(Stack, { wrap: true }, h('span', null, 'a')))
    expect((container.firstElementChild as HTMLDivElement).style.flexWrap).toBe('wrap')
    unmount()
  })

  it('paddingX/paddingY map to per-axis padding', () => {
    const { container, unmount } = mountTest(
      h(Stack, { paddingX: 2, paddingY: 3 }, h('span', null, 'a')),
    )
    const s = (container.firstElementChild as HTMLDivElement).style
    expect(s.paddingLeft).toBe('8px')
    expect(s.paddingRight).toBe('8px')
    expect(s.paddingTop).toBe('12px')
    expect(s.paddingBottom).toBe('12px')
    unmount()
  })

  it('marginX/marginY map to per-axis margin', () => {
    const { container, unmount } = mountTest(
      h(Stack, { marginX: 1, marginY: 4 }, h('span', null, 'a')),
    )
    const s = (container.firstElementChild as HTMLDivElement).style
    expect(s.marginLeft).toBe('4px')
    expect(s.marginRight).toBe('4px')
    expect(s.marginTop).toBe('16px')
    expect(s.marginBottom).toBe('16px')
    unmount()
  })

  it('margin (uniform) maps to style.margin', () => {
    const { container, unmount } = mountTest(h(Stack, { margin: 3 }, h('span', null, 'a')))
    expect((container.firstElementChild as HTMLDivElement).style.margin).toBe('12px')
    unmount()
  })

  it('background token → backgroundColor', () => {
    const { container, unmount } = mountTest(
      h(Stack, { background: 'primary' }, h('span', null, 'a')),
    )
    // happy-dom normalizes hex → rgb the same as browsers.
    expect((container.firstElementChild as HTMLDivElement).style.backgroundColor).toMatch(
      /rgb\(37,\s*99,\s*235\)|#2563eb/i,
    )
    unmount()
  })

  it('radius token → borderRadius', () => {
    const { container, unmount } = mountTest(h(Stack, { radius: 'md' }, h('span', null, 'a')))
    expect((container.firstElementChild as HTMLDivElement).style.borderRadius).toBe('8px')
    unmount()
  })

  it('children render into the div', () => {
    const { container, unmount } = mountTest(
      h(Stack, null, h('span', null, 'a'), h('span', null, 'b')),
    )
    const root = container.firstElementChild as HTMLDivElement
    expect(root.children.length).toBe(2)
    expect(root.children[0]!.textContent).toBe('a')
    expect(root.children[1]!.textContent).toBe('b')
    unmount()
  })
})

describe('<Inline> happy-dom unit', () => {
  it('always renders flex-direction: row (sugar over Stack)', () => {
    const { container, unmount } = mountTest(h(Inline, null, h('span', null, 'a')))
    expect((container.firstElementChild as HTMLDivElement).style.flexDirection).toBe('row')
    unmount()
  })

  it('gap prop propagates', () => {
    const { container, unmount } = mountTest(h(Inline, { gap: 3 }, h('span', null, 'a')))
    expect((container.firstElementChild as HTMLDivElement).style.gap).toBe('12px')
    unmount()
  })
})

describe('<Text> happy-dom unit', () => {
  it('renders a <span> with text content', () => {
    const { container, unmount } = mountTest(h(Text, null, 'hello'))
    const root = container.firstElementChild as HTMLSpanElement
    expect(root.tagName).toBe('SPAN')
    expect(root.textContent).toBe('hello')
    unmount()
  })

  it('color token → style.color', () => {
    const { container, unmount } = mountTest(h(Text, { color: 'primary' }, 'x'))
    expect((container.firstElementChild as HTMLSpanElement).style.color).toMatch(
      /rgb\(37,\s*99,\s*235\)|#2563eb/i,
    )
    unmount()
  })

  it('size sm → font-size 14px', () => {
    const { container, unmount } = mountTest(h(Text, { size: 'sm' }, 'x'))
    expect((container.firstElementChild as HTMLSpanElement).style.fontSize).toBe('14px')
    unmount()
  })

  it('size lg → font-size 20px', () => {
    const { container, unmount } = mountTest(h(Text, { size: 'lg' }, 'x'))
    expect((container.firstElementChild as HTMLSpanElement).style.fontSize).toBe('20px')
    unmount()
  })

  it('weight bold → font-weight 700', () => {
    const { container, unmount } = mountTest(h(Text, { weight: 'bold' }, 'x'))
    expect((container.firstElementChild as HTMLSpanElement).style.fontWeight).toBe('700')
    unmount()
  })

  it('weight medium → font-weight 500', () => {
    const { container, unmount } = mountTest(h(Text, { weight: 'medium' }, 'x'))
    expect((container.firstElementChild as HTMLSpanElement).style.fontWeight).toBe('500')
    unmount()
  })

  it('truncate sets ellipsis CSS', () => {
    const { container, unmount } = mountTest(h(Text, { truncate: true }, 'x'))
    const s = (container.firstElementChild as HTMLSpanElement).style
    expect(s.overflow).toBe('hidden')
    expect(s.textOverflow).toBe('ellipsis')
    expect(s.whiteSpace).toBe('nowrap')
    unmount()
  })
})

describe('<Heading> happy-dom unit', () => {
  it('default level 1 → <h1> with bold weight + scale font-size', () => {
    const { container, unmount } = mountTest(h(Heading, null, 'Title'))
    const root = container.firstElementChild as HTMLHeadingElement
    expect(root.tagName).toBe('H1')
    expect(root.textContent).toBe('Title')
    expect(root.style.fontSize).toBe('32px')
    expect(root.style.fontWeight).toBe('700')
    unmount()
  })

  it('level prop picks the matching <hN> element + scale size', () => {
    for (const [level, px] of [
      [2, '24px'],
      [3, '20px'],
      [4, '18px'],
      [5, '16px'],
      [6, '14px'],
    ] as const) {
      const { container, unmount } = mountTest(h(Heading, { level }, 'x'))
      const root = container.firstElementChild as HTMLHeadingElement
      expect(root.tagName).toBe(`H${level}`)
      expect(root.style.fontSize).toBe(px)
      unmount()
    }
  })

  it('color token → style.color', () => {
    const { container, unmount } = mountTest(h(Heading, { color: 'primary' }, 'x'))
    expect((container.firstElementChild as HTMLHeadingElement).style.color).toMatch(
      /rgb\(37,\s*99,\s*235\)|#2563eb/i,
    )
    unmount()
  })

  it('resets default heading margin to 0', () => {
    const { container, unmount } = mountTest(h(Heading, null, 'x'))
    expect((container.firstElementChild as HTMLHeadingElement).style.margin).toBe('0px')
    unmount()
  })
})

describe('<Image> happy-dom unit', () => {
  it('renders an <img> with src + alt + default object-fit:cover', () => {
    const { container, unmount } = mountTest(h(Image, { src: '/a.png', alt: 'a photo' }))
    const img = container.firstElementChild as HTMLImageElement
    expect(img.tagName).toBe('IMG')
    expect(img.getAttribute('src')).toBe('/a.png')
    expect(img.getAttribute('alt')).toBe('a photo')
    expect(img.style.objectFit).toBe('cover')
    unmount()
  })

  it('fit prop maps to object-fit', () => {
    const { container, unmount } = mountTest(h(Image, { src: '/a.png', alt: '', fit: 'contain' }))
    expect((container.firstElementChild as HTMLImageElement).style.objectFit).toBe('contain')
    unmount()
  })

  it('numeric width/height → px; string passes through', () => {
    const { container, unmount } = mountTest(
      h(Image, { src: '/a.png', alt: '', width: 200, height: '50%' }),
    )
    const img = container.firstElementChild as HTMLImageElement
    expect(img.style.width).toBe('200px')
    expect(img.style.height).toBe('50%')
    unmount()
  })

  it('renders no children (void element)', () => {
    const { container, unmount } = mountTest(h(Image, { src: '/a.png', alt: 'x' }))
    expect((container.firstElementChild as HTMLImageElement).children.length).toBe(0)
    unmount()
  })
})

describe('<Icon> happy-dom unit', () => {
  it('renders an <svg> with a <use href="#name"> sprite reference', () => {
    const { container, unmount } = mountTest(h(Icon, { name: 'check' }))
    const svg = container.firstElementChild as SVGElement
    expect(svg.tagName.toLowerCase()).toBe('svg')
    const use = svg.firstElementChild as SVGUseElement
    expect(use.tagName.toLowerCase()).toBe('use')
    expect(use.getAttribute('href')).toBe('#check')
    unmount()
  })

  it('default size md → 20px square; fill currentColor', () => {
    const { container, unmount } = mountTest(h(Icon, { name: 'x' }))
    const svg = container.firstElementChild as SVGElement
    expect(svg.style.width).toBe('20px')
    expect(svg.style.height).toBe('20px')
    expect(svg.style.fill).toBe('currentColor')
    unmount()
  })

  it('size sm/lg map to 16px/24px', () => {
    const sm = mountTest(h(Icon, { name: 'x', size: 'sm' }))
    expect((sm.container.firstElementChild as SVGElement).style.width).toBe('16px')
    sm.unmount()
    const lg = mountTest(h(Icon, { name: 'x', size: 'lg' }))
    expect((lg.container.firstElementChild as SVGElement).style.width).toBe('24px')
    lg.unmount()
  })

  it('color token → fill', () => {
    const { container, unmount } = mountTest(h(Icon, { name: 'x', color: 'danger' }))
    expect((container.firstElementChild as SVGElement).style.fill).toMatch(
      /rgb\(220,\s*38,\s*38\)|#dc2626/i,
    )
    unmount()
  })

  it('decorative by default → aria-hidden="true"', () => {
    const { container, unmount } = mountTest(h(Icon, { name: 'x' }))
    expect((container.firstElementChild as SVGElement).getAttribute('aria-hidden')).toBe('true')
    unmount()
  })

  it('consumer aria-label drops the aria-hidden default (meaningful icon)', () => {
    const { container, unmount } = mountTest(h(Icon, { name: 'x', 'aria-label': 'Success' }))
    const svg = container.firstElementChild as SVGElement
    expect(svg.getAttribute('aria-hidden')).toBe(null)
    expect(svg.getAttribute('aria-label')).toBe('Success')
    unmount()
  })
})

describe('<Button> happy-dom unit', () => {
  it('renders a <button type=button> with primary variant by default', () => {
    const { container, unmount } = mountTest(h(Button, { onPress: () => {} }, 'OK'))
    const btn = container.firstElementChild as HTMLButtonElement
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.type).toBe('button')
    expect(btn.textContent).toBe('OK')
    expect(btn.style.backgroundColor).toMatch(/rgb\(37,\s*99,\s*235\)|#2563eb/i)
    unmount()
  })

  it('secondary variant', () => {
    const { container, unmount } = mountTest(
      h(Button, { onPress: () => {}, variant: 'secondary' }, 'X'),
    )
    const btn = container.firstElementChild as HTMLButtonElement
    expect(btn.style.backgroundColor).toMatch(/rgb\(255,\s*255,\s*255\)|#ffffff/i)
    unmount()
  })

  it('ghost variant', () => {
    const { container, unmount } = mountTest(
      h(Button, { onPress: () => {}, variant: 'ghost' }, 'X'),
    )
    const btn = container.firstElementChild as HTMLButtonElement
    expect(btn.style.backgroundColor).toBe('transparent')
    unmount()
  })

  it('danger variant', () => {
    const { container, unmount } = mountTest(
      h(Button, { onPress: () => {}, variant: 'danger' }, 'X'),
    )
    const btn = container.firstElementChild as HTMLButtonElement
    expect(btn.style.backgroundColor).toMatch(/rgb\(220,\s*38,\s*38\)|#dc2626/i)
    unmount()
  })

  it('onPress fires on click', () => {
    let n = 0
    const { container, unmount } = mountTest(h(Button, { onPress: () => n++ }, 'X'))
    ;(container.firstElementChild as HTMLButtonElement).click()
    expect(n).toBe(1)
    unmount()
  })

  it('disabled sets the disabled attr + opacity 0.5 + cursor not-allowed', () => {
    const { container, unmount } = mountTest(h(Button, { onPress: () => {}, disabled: true }, 'X'))
    const btn = container.firstElementChild as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.style.opacity).toBe('0.5')
    expect(btn.style.cursor).toBe('not-allowed')
    unmount()
  })

  it('disabled blocks onPress', () => {
    let n = 0
    const { container, unmount } = mountTest(h(Button, { onPress: () => n++, disabled: true }, 'X'))
    ;(container.firstElementChild as HTMLButtonElement).click()
    expect(n).toBe(0)
    unmount()
  })
})

describe('<Press> happy-dom unit', () => {
  it('renders a <div role=button tabindex=0>', () => {
    const { container, unmount } = mountTest(
      h(Press, { onPress: () => {} }, h('span', null, 'tap')),
    )
    const root = container.firstElementChild as HTMLDivElement
    expect(root.tagName).toBe('DIV')
    expect(root.getAttribute('role')).toBe('button')
    expect(root.tabIndex).toBe(0)
    unmount()
  })

  it('onPress fires on click', () => {
    let n = 0
    const { container, unmount } = mountTest(h(Press, { onPress: () => n++ }, 'tap'))
    ;(container.firstElementChild as HTMLDivElement).click()
    expect(n).toBe(1)
    unmount()
  })

  it('Enter key triggers onPress (ARIA-button keyboard contract)', () => {
    let n = 0
    const { container, unmount } = mountTest(h(Press, { onPress: () => n++ }, 'tap'))
    const root = container.firstElementChild as HTMLDivElement
    root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    expect(n).toBe(1)
    unmount()
  })

  it('Space key triggers onPress', () => {
    let n = 0
    const { container, unmount } = mountTest(h(Press, { onPress: () => n++ }, 'tap'))
    const root = container.firstElementChild as HTMLDivElement
    root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    expect(n).toBe(1)
    unmount()
  })

  it('disabled sets tabIndex=-1 + aria-disabled + blocks click', () => {
    let n = 0
    const { container, unmount } = mountTest(
      h(Press, { onPress: () => n++, disabled: true }, 'tap'),
    )
    const root = container.firstElementChild as HTMLDivElement
    expect(root.tabIndex).toBe(-1)
    expect(root.getAttribute('aria-disabled')).toBe('true')
    expect(root.style.cursor).toBe('not-allowed')
    root.click()
    expect(n).toBe(0)
    unmount()
  })

  it('onLongPress fires after 500ms pointerdown without release', async () => {
    let long = 0
    const { container, unmount } = mountTest(
      h(Press, { onPress: () => {}, onLongPress: () => long++ }, 'x'),
    )
    const root = container.firstElementChild as HTMLDivElement
    root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 550))
    expect(long).toBe(1)
    unmount()
  })

  it('onLongPress is cancelled by pointerup before 500ms', async () => {
    let long = 0
    const { container, unmount } = mountTest(
      h(Press, { onPress: () => {}, onLongPress: () => long++ }, 'x'),
    )
    const root = container.firstElementChild as HTMLDivElement
    root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 100))
    root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 500))
    expect(long).toBe(0)
    unmount()
  })

  it('pointerleave also cancels the long-press timer', async () => {
    let long = 0
    const { container, unmount } = mountTest(
      h(Press, { onPress: () => {}, onLongPress: () => long++ }, 'x'),
    )
    const root = container.firstElementChild as HTMLDivElement
    root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 50))
    root.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 500))
    expect(long).toBe(0)
    unmount()
  })

  it('disabled blocks onLongPress even after the timer fires', async () => {
    let long = 0
    const { container, unmount } = mountTest(
      h(Press, { onPress: () => {}, onLongPress: () => long++, disabled: true }, 'x'),
    )
    const root = container.firstElementChild as HTMLDivElement
    // disabled means onPointerDown is undefined → timer never starts
    root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 600))
    expect(long).toBe(0)
    unmount()
  })
})

describe('<Link> happy-dom unit', () => {
  // Each test owns the global navigation config; reset after every one.
  afterEach(() => resetPrimitivesConfig())

  it('internal link renders a real <a href={to}> (NOT hash-prefixed, NOT new-tab)', () => {
    const { container, unmount } = mountTest(h(Link, { to: '/about' }, 'About'))
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a).not.toBe(null)
    expect(a.getAttribute('href')).toBe('/about')
    expect(a.textContent).toBe('About')
    expect(a.getAttribute('target')).toBe(null)
    unmount()
  })

  it('external link renders a plain <a target=_blank rel=noopener noreferrer>', () => {
    const { container, unmount } = mountTest(
      h(Link, { to: 'https://example.com', external: true }, 'Site'),
    )
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe('https://example.com')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    expect(a.textContent).toBe('Site')
    unmount()
  })

  it('with init({ navigate }), a plain left-click is intercepted → navigate(to) + preventDefault', () => {
    const calls: string[] = []
    init({ navigate: (to) => calls.push(to) })
    const { container, unmount } = mountTest(h(Link, { to: '/about' }, 'About'))
    const a = container.querySelector('a') as HTMLAnchorElement
    const evt = new MouseEvent('click', { button: 0, bubbles: true, cancelable: true })
    a.dispatchEvent(evt)
    expect(calls).toEqual(['/about'])
    expect(evt.defaultPrevented).toBe(true)
    unmount()
  })

  it('WITHOUT init, a left-click is NOT intercepted (plain full-load <a>)', () => {
    const { container, unmount } = mountTest(h(Link, { to: '/about' }, 'About'))
    const a = container.querySelector('a') as HTMLAnchorElement
    const evt = new MouseEvent('click', { button: 0, bubbles: true, cancelable: true })
    a.dispatchEvent(evt)
    // No navigate configured → browser default nav, not prevented.
    expect(evt.defaultPrevented).toBe(false)
    unmount()
  })

  it('modifier-click (metaKey) is NOT intercepted even with init (open-in-new-tab affordance)', () => {
    const calls: string[] = []
    init({ navigate: (to) => calls.push(to) })
    const { container, unmount } = mountTest(h(Link, { to: '/about' }, 'About'))
    const a = container.querySelector('a') as HTMLAnchorElement
    const evt = new MouseEvent('click', {
      button: 0,
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    a.dispatchEvent(evt)
    expect(calls).toEqual([])
    expect(evt.defaultPrevented).toBe(false)
    unmount()
  })

  it('external link is never intercepted, even with init({ navigate })', () => {
    const calls: string[] = []
    init({ navigate: (to) => calls.push(to) })
    const { container, unmount } = mountTest(h(Link, { to: 'https://x.com', external: true }, 'X'))
    const a = container.querySelector('a') as HTMLAnchorElement
    const evt = new MouseEvent('click', { button: 0, bubbles: true, cancelable: true })
    a.dispatchEvent(evt)
    // External anchors carry no onClick handler at all.
    expect(calls).toEqual([])
    expect(evt.defaultPrevented).toBe(false)
    unmount()
  })

  it('forwards data-* passthrough + style onto the anchor (internal + external)', () => {
    const internal = mountTest(
      h(Link, { to: '/about', 'data-testid': 'nav-about', style: { color: 'red' } }, 'About'),
    )
    const ai = internal.container.querySelector('a') as HTMLAnchorElement
    expect(ai.getAttribute('data-testid')).toBe('nav-about')
    expect(ai.style.color).toBe('red')
    internal.unmount()

    const external = mountTest(
      h(Link, { to: 'https://x.com', external: true, 'data-testid': 'ext' }, 'X'),
    )
    expect(
      (external.container.querySelector('a') as HTMLAnchorElement).getAttribute('data-testid'),
    ).toBe('ext')
    external.unmount()
  })
})

describe('init() config', () => {
  afterEach(() => resetPrimitivesConfig())

  it('merges across calls (later call overrides only the keys it sets)', () => {
    const a: string[] = []
    const b: string[] = []
    init({ navigate: (to) => a.push(to) })
    init({}) // no navigate key → preserves the previous handler
    const { container, unmount } = mountTest(h(Link, { to: '/x' }, 'X'))
    ;(container.querySelector('a') as HTMLAnchorElement).dispatchEvent(
      new MouseEvent('click', { button: 0, bubbles: true, cancelable: true }),
    )
    expect(a).toEqual(['/x'])
    expect(b).toEqual([])
    init({ navigate: (to) => b.push(to) }) // overrides navigate
    ;(container.querySelector('a') as HTMLAnchorElement).dispatchEvent(
      new MouseEvent('click', { button: 0, bubbles: true, cancelable: true }),
    )
    expect(b).toEqual(['/x'])
    unmount()
  })

  it('resetPrimitivesConfig() clears the configured navigate', () => {
    const calls: string[] = []
    init({ navigate: (to) => calls.push(to) })
    resetPrimitivesConfig()
    const { container, unmount } = mountTest(h(Link, { to: '/y' }, 'Y'))
    const evt = new MouseEvent('click', { button: 0, bubbles: true, cancelable: true })
    ;(container.querySelector('a') as HTMLAnchorElement).dispatchEvent(evt)
    expect(calls).toEqual([])
    expect(evt.defaultPrevented).toBe(false)
    unmount()
  })
})

describe('<Field> happy-dom unit', () => {
  it('renders an <input type=text> by default', () => {
    const v = signal('')
    const { container, unmount } = mountTest(
      h(Field, { value: v, onChangeText: (next: string) => v.set(next) }),
    )
    const input = container.firstElementChild as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.type).toBe('text')
    unmount()
  })

  it('kind="email" → type="email"', () => {
    const v = signal('')
    const { container, unmount } = mountTest(
      h(Field, { value: v, onChangeText: (next: string) => v.set(next), kind: 'email' }),
    )
    expect((container.firstElementChild as HTMLInputElement).type).toBe('email')
    unmount()
  })

  it('kind="password" → type="password"', () => {
    const v = signal('')
    const { container, unmount } = mountTest(
      h(Field, { value: v, onChangeText: (next: string) => v.set(next), kind: 'password' }),
    )
    expect((container.firstElementChild as HTMLInputElement).type).toBe('password')
    unmount()
  })

  it('kind="number" → type="number"', () => {
    const v = signal('')
    const { container, unmount } = mountTest(
      h(Field, { value: v, onChangeText: (next: string) => v.set(next), kind: 'number' }),
    )
    expect((container.firstElementChild as HTMLInputElement).type).toBe('number')
    unmount()
  })

  it('kind="search" → type="search"', () => {
    const v = signal('')
    const { container, unmount } = mountTest(
      h(Field, { value: v, onChangeText: (next: string) => v.set(next), kind: 'search' }),
    )
    expect((container.firstElementChild as HTMLInputElement).type).toBe('search')
    unmount()
  })

  it('kind="tel" → type="tel"', () => {
    const v = signal('')
    const { container, unmount } = mountTest(
      h(Field, { value: v, onChangeText: (next: string) => v.set(next), kind: 'tel' }),
    )
    expect((container.firstElementChild as HTMLInputElement).type).toBe('tel')
    unmount()
  })

  it('kind="url" → type="url"', () => {
    const v = signal('')
    const { container, unmount } = mountTest(
      h(Field, { value: v, onChangeText: (next: string) => v.set(next), kind: 'url' }),
    )
    expect((container.firstElementChild as HTMLInputElement).type).toBe('url')
    unmount()
  })

  it('placeholder attribute renders', () => {
    const v = signal('')
    const { container, unmount } = mountTest(
      h(Field, {
        value: v,
        onChangeText: (next: string) => v.set(next),
        placeholder: 'Type here',
      }),
    )
    expect((container.firstElementChild as HTMLInputElement).placeholder).toBe('Type here')
    unmount()
  })

  it('onInput propagates to onChangeText', () => {
    const v = signal('')
    let observed = ''
    const { container, unmount } = mountTest(
      h(Field, {
        value: v,
        onChangeText: (next: string) => {
          observed = next
          v.set(next)
        },
      }),
    )
    const input = container.firstElementChild as HTMLInputElement
    input.value = 'typed'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(observed).toBe('typed')
    unmount()
  })

  it('Enter key triggers onSubmit when provided', () => {
    const v = signal('')
    let submitted = 0
    const { container, unmount } = mountTest(
      h(Field, {
        value: v,
        onChangeText: (next: string) => v.set(next),
        onSubmit: () => submitted++,
      }),
    )
    const input = container.firstElementChild as HTMLInputElement
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    expect(submitted).toBe(1)
    unmount()
  })

  it('non-Enter keys do NOT trigger onSubmit', () => {
    const v = signal('')
    let submitted = 0
    const { container, unmount } = mountTest(
      h(Field, {
        value: v,
        onChangeText: (next: string) => v.set(next),
        onSubmit: () => submitted++,
      }),
    )
    const input = container.firstElementChild as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(submitted).toBe(0)
    unmount()
  })

  it('disabled attribute + opacity', () => {
    const v = signal('')
    const { container, unmount } = mountTest(
      h(Field, {
        value: v,
        onChangeText: (next: string) => v.set(next),
        disabled: true,
      }),
    )
    const input = container.firstElementChild as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(input.style.opacity).toBe('0.5')
    unmount()
  })
})

describe('<Toggle> happy-dom unit', () => {
  it('renders an <input type=checkbox> wired to a signal', () => {
    const v = signal(false)
    const { container, unmount } = mountTest(
      h(Toggle, { value: v, onChange: (next: boolean) => v.set(next) }),
    )
    const input = container.firstElementChild as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.type).toBe('checkbox')
    expect(input.checked).toBe(false)
    unmount()
  })

  it('initial value=true → input.checked=true', () => {
    const v = signal(true)
    const { container, unmount } = mountTest(
      h(Toggle, { value: v, onChange: (next: boolean) => v.set(next) }),
    )
    const input = container.firstElementChild as HTMLInputElement
    expect(input.checked).toBe(true)
    unmount()
  })

  it('change event fires onChange with the new boolean', () => {
    const v = signal(false)
    let observed: boolean | undefined
    const { container, unmount } = mountTest(
      h(Toggle, {
        value: v,
        onChange: (next: boolean) => {
          observed = next
          v.set(next)
        },
      }),
    )
    const input = container.firstElementChild as HTMLInputElement
    input.checked = true
    input.dispatchEvent(new Event('change', { bubbles: true }))
    expect(observed).toBe(true)
    expect(v()).toBe(true)
    unmount()
  })

  it('disabled disables the input + dims the style', () => {
    const v = signal(false)
    const { container, unmount } = mountTest(
      h(Toggle, {
        value: v,
        onChange: (next: boolean) => v.set(next),
        disabled: true,
      }),
    )
    const input = container.firstElementChild as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(input.style.opacity).toBe('0.5')
    expect(input.style.cursor).toBe('not-allowed')
    unmount()
  })
})

describe('<Layer> happy-dom unit', () => {
  it('renders a <div> with position:relative + display:grid', () => {
    const { container, unmount } = mountTest(h(Layer, null, h('span', null, 'a')))
    const root = container.firstElementChild as HTMLDivElement
    expect(root.tagName).toBe('DIV')
    expect(root.style.position).toBe('relative')
    expect(root.style.display).toBe('grid')
    unmount()
  })

  it('align maps directly to grid place-items (native grid keyword)', () => {
    const { container, unmount } = mountTest(h(Layer, { align: 'center' }, h('span', null, 'a')))
    expect((container.firstElementChild as HTMLDivElement).style.placeItems).toBe('center')
    unmount()
  })

  it('no align prop → no place-items emitted', () => {
    const { container, unmount } = mountTest(h(Layer, null, h('span', null, 'a')))
    expect((container.firstElementChild as HTMLDivElement).style.placeItems).toBe('')
    unmount()
  })

  it('BaseLayoutProps (padding/background/radius) apply', () => {
    const { container, unmount } = mountTest(
      h(Layer, { padding: 'md', background: 'surface', radius: 'lg' }, h('span', null, 'a')),
    )
    const s = (container.firstElementChild as HTMLDivElement).style
    expect(s.padding).toBe('12px')
    expect(s.borderRadius).toBe('16px')
    expect(s.backgroundColor).toMatch(/rgb\(255,\s*255,\s*255\)|#ffffff/i)
    unmount()
  })

  it('children pass through into the grid container', () => {
    const { container, unmount } = mountTest(
      h(Layer, null, h('span', null, 'base'), h('span', null, 'overlay')),
    )
    const root = container.firstElementChild as HTMLDivElement
    expect(root.children.length).toBe(2)
    expect(root.children[0]!.textContent).toBe('base')
    expect(root.children[1]!.textContent).toBe('overlay')
    unmount()
  })
})

describe('<Scroll> happy-dom unit', () => {
  it('vertical by default → overflow-y:auto, overflow-x:hidden', () => {
    const { container, unmount } = mountTest(h(Scroll, null, h('span', null, 'a')))
    const s = (container.firstElementChild as HTMLDivElement).style
    expect(s.overflowY).toBe('auto')
    expect(s.overflowX).toBe('hidden')
    unmount()
  })

  it('axis="horizontal" → overflow-x:auto, overflow-y:hidden', () => {
    const { container, unmount } = mountTest(
      h(Scroll, { axis: 'horizontal' }, h('span', null, 'a')),
    )
    const s = (container.firstElementChild as HTMLDivElement).style
    expect(s.overflowX).toBe('auto')
    expect(s.overflowY).toBe('hidden')
    unmount()
  })

  it('BaseLayoutProps (padding/margin) apply', () => {
    const { container, unmount } = mountTest(
      h(Scroll, { padding: 2, marginY: 3 }, h('span', null, 'a')),
    )
    const s = (container.firstElementChild as HTMLDivElement).style
    expect(s.padding).toBe('8px')
    expect(s.marginTop).toBe('12px')
    expect(s.marginBottom).toBe('12px')
    unmount()
  })

  it('children render into the scroll container', () => {
    const { container, unmount } = mountTest(
      h(Scroll, null, h('span', null, 'a'), h('span', null, 'b')),
    )
    const root = container.firstElementChild as HTMLDivElement
    expect(root.children.length).toBe(2)
    unmount()
  })

  it('full BaseLayoutProps surface (per-axis padding/margin + uniform margin)', () => {
    const { container, unmount } = mountTest(
      h(Scroll, { paddingX: 2, paddingY: 3, margin: 1, marginX: 4 }, h('span', null, 'a')),
    )
    const s = (container.firstElementChild as HTMLDivElement).style
    expect(s.paddingLeft).toBe('8px')
    expect(s.paddingRight).toBe('8px')
    expect(s.paddingTop).toBe('12px')
    expect(s.paddingBottom).toBe('12px')
    // Uniform `margin` is applied first, then `marginX` overrides L/R —
    // the browser collapses both into the `4px 16px` shorthand (top/bottom
    // 4px, left/right 16px). Exercises both helper branches.
    expect(s.marginLeft).toBe('16px')
    expect(s.marginRight).toBe('16px')
    expect(s.marginTop).toBe('4px')
    expect(s.marginBottom).toBe('4px')
    unmount()
  })
})

describe('<Spacer> happy-dom unit', () => {
  it('renders a <div> with flex: 1 1 auto', () => {
    const { container, unmount } = mountTest(h(Spacer, null))
    const root = container.firstElementChild as HTMLDivElement
    expect(root.tagName).toBe('DIV')
    // happy-dom expands the `flex` shorthand into longhands.
    expect(root.style.flexGrow).toBe('1')
    expect(root.style.flexShrink).toBe('1')
    expect(root.style.flexBasis).toBe('auto')
    unmount()
  })

  it('renders no children (self-closing)', () => {
    const { container, unmount } = mountTest(h(Spacer, null))
    expect((container.firstElementChild as HTMLDivElement).children.length).toBe(0)
    unmount()
  })
})

describe('<Modal> happy-dom unit', () => {
  it('renders a <dialog> element with the children inside', () => {
    const { container, unmount } = mountTest(
      h(Modal, { open: signal(false), onClose: () => {} }, h('p', null, 'body')),
    )
    const dlg = container.firstElementChild as HTMLDialogElement
    expect(dlg.tagName).toBe('DIALOG')
    expect(dlg.querySelector('p')?.textContent).toBe('body')
    unmount()
  })

  it('open=true → dialog is open; flipping the signal false → closed', () => {
    const open = signal(true)
    const { container, unmount } = mountTest(
      h(Modal, { open, onClose: () => open.set(false) }, h('p', null, 'x')),
    )
    const dlg = container.firstElementChild as HTMLDialogElement
    expect(dlg.open).toBe(true)
    open.set(false)
    expect(dlg.open).toBe(false)
    unmount()
  })

  it('accepts a plain boolean `open` (value form of ValueOrSignal)', () => {
    const { container, unmount } = mountTest(
      h(Modal, { open: true, onClose: () => {} }, h('p', null, 'x')),
    )
    expect((container.firstElementChild as HTMLDialogElement).open).toBe(true)
    unmount()
  })

  it('opening reactively (false → true) shows the dialog', () => {
    const open = signal(false)
    const { container, unmount } = mountTest(
      h(Modal, { open, onClose: () => open.set(false) }, h('p', null, 'x')),
    )
    const dlg = container.firstElementChild as HTMLDialogElement
    expect(dlg.open).toBe(false)
    open.set(true)
    expect(dlg.open).toBe(true)
    unmount()
  })

  it('Escape (cancel event) calls onClose + preventDefault (signal stays source of truth)', () => {
    const open = signal(true)
    let closeCount = 0
    const { container, unmount } = mountTest(
      h(Modal, { open, onClose: () => closeCount++ }, h('p', null, 'x')),
    )
    const dlg = container.firstElementChild as HTMLDialogElement
    const evt = new Event('cancel', { cancelable: true })
    dlg.dispatchEvent(evt)
    expect(closeCount).toBe(1)
    expect(evt.defaultPrevented).toBe(true)
    unmount()
  })

  it('backdrop click (outside the dialog box) calls onClose', () => {
    const open = signal(true)
    let closeCount = 0
    const { container, unmount } = mountTest(
      h(Modal, { open, onClose: () => closeCount++ }, h('p', null, 'x')),
    )
    const dlg = container.firstElementChild as HTMLDialogElement
    // getBoundingClientRect is 0×0 in happy-dom, so any positive coord
    // is "outside" → backdrop.
    dlg.dispatchEvent(new MouseEvent('click', { clientX: 9999, clientY: 9999, bubbles: true }))
    expect(closeCount).toBe(1)
    unmount()
  })

  it('content click (inside the dialog box) does NOT call onClose', () => {
    const open = signal(true)
    let closeCount = 0
    const { container, unmount } = mountTest(
      h(Modal, { open, onClose: () => closeCount++ }, h('p', null, 'x')),
    )
    const dlg = container.firstElementChild as HTMLDialogElement
    // Coord (0,0) is within the 0×0 rect (left/top/right/bottom all 0).
    dlg.dispatchEvent(new MouseEvent('click', { clientX: 0, clientY: 0, bubbles: true }))
    expect(closeCount).toBe(0)
    unmount()
  })
})

describe('HTML pass-through attrs (data-* / aria-* / id / class / style)', () => {
  // Phase D follow-up — surfaced by #951's native-todomvc-web e2e gate:
  // primitives were dropping consumer's `data-testid`, `aria-*`, `id`,
  // `class` because render fns only forwarded hardcoded keys. Fix:
  // every primitive routes through `collectPassthroughAttrs` +
  // `mergePassthroughStyle`.

  it('<Stack data-testid> reaches the rendered DOM', () => {
    const { container, unmount } = mountTest(
      h(Stack, { 'data-testid': 'my-stack', children: 'hi' }),
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-testid')).toBe('my-stack')
    unmount()
  })

  it('<Stack aria-label + id + class> all forward', () => {
    const { container, unmount } = mountTest(
      h(Stack, {
        'aria-label': 'menu',
        id: 'main-menu',
        class: 'shadow-lg',
        children: 'hi',
      }),
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('aria-label')).toBe('menu')
    expect(root.id).toBe('main-menu')
    expect(root.getAttribute('class')).toBe('shadow-lg')
    unmount()
  })

  it('<Inline data-testid> reaches the rendered DOM', () => {
    const { container, unmount } = mountTest(
      h(Inline, { 'data-testid': 'my-inline', children: 'hi' }),
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-testid')).toBe('my-inline')
    unmount()
  })

  it('<Text data-testid> reaches the rendered DOM', () => {
    const { container, unmount } = mountTest(h(Text, { 'data-testid': 'my-text', children: 'hi' }))
    const root = container.firstElementChild as HTMLElement
    expect(root.tagName).toBe('SPAN')
    expect(root.getAttribute('data-testid')).toBe('my-text')
    unmount()
  })

  it('<Button data-testid + aria-pressed> reach the rendered DOM', () => {
    const { container, unmount } = mountTest(
      h(Button, {
        'data-testid': 'my-btn',
        'aria-pressed': 'true',
        onPress: () => {},
        children: 'Click',
      }),
    )
    const btn = container.firstElementChild as HTMLButtonElement
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.getAttribute('data-testid')).toBe('my-btn')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    unmount()
  })

  it('<Press data-testid> reaches the rendered DOM (preserving role=button)', () => {
    const { container, unmount } = mountTest(
      h(Press, {
        'data-testid': 'my-press',
        onPress: () => {},
        children: 'Press me',
      }),
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-testid')).toBe('my-press')
    // Existing semantics preserved.
    expect(root.getAttribute('role')).toBe('button')
    unmount()
  })

  it('<Field data-testid + aria-describedby> reach the rendered DOM', () => {
    const v = signal('')
    const { container, unmount } = mountTest(
      h(Field, {
        'data-testid': 'my-field',
        'aria-describedby': 'hint',
        value: v,
        onChangeText: (next: string) => v.set(next),
      }),
    )
    const input = container.firstElementChild as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.getAttribute('data-testid')).toBe('my-field')
    expect(input.getAttribute('aria-describedby')).toBe('hint')
    unmount()
  })

  it('<Heading data-testid + id> reach the rendered DOM', () => {
    const { container, unmount } = mountTest(
      h(Heading, { 'data-testid': 'my-h', id: 'sec', children: 'Hi' }),
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.tagName).toBe('H1')
    expect(root.getAttribute('data-testid')).toBe('my-h')
    expect(root.id).toBe('sec')
    unmount()
  })

  it('<Image data-testid + aria-label> reach the rendered DOM', () => {
    const { container, unmount } = mountTest(
      h(Image, { 'data-testid': 'my-img', 'aria-label': 'hero', src: '/h.png', alt: 'hero' }),
    )
    const img = container.firstElementChild as HTMLImageElement
    expect(img.getAttribute('data-testid')).toBe('my-img')
    expect(img.getAttribute('aria-label')).toBe('hero')
    unmount()
  })

  it('<Icon data-testid> reaches the rendered DOM', () => {
    const { container, unmount } = mountTest(h(Icon, { 'data-testid': 'my-icon', name: 'star' }))
    expect((container.firstElementChild as SVGElement).getAttribute('data-testid')).toBe('my-icon')
    unmount()
  })

  it('<Modal data-testid + aria-label> reach the rendered <dialog>', () => {
    const { container, unmount } = mountTest(
      h(Modal, {
        'data-testid': 'my-modal',
        'aria-label': 'Settings',
        open: signal(false),
        onClose: () => {},
        children: h('p', null, 'x'),
      }),
    )
    const dlg = container.firstElementChild as HTMLElement
    expect(dlg.tagName).toBe('DIALOG')
    expect(dlg.getAttribute('data-testid')).toBe('my-modal')
    expect(dlg.getAttribute('aria-label')).toBe('Settings')
    unmount()
  })

  it('<Layer data-testid> reaches the rendered DOM', () => {
    const { container, unmount } = mountTest(
      h(Layer, { 'data-testid': 'my-layer', children: 'hi' }),
    )
    expect((container.firstElementChild as HTMLElement).getAttribute('data-testid')).toBe(
      'my-layer',
    )
    unmount()
  })

  it('<Scroll data-testid> reaches the rendered DOM', () => {
    const { container, unmount } = mountTest(
      h(Scroll, { 'data-testid': 'my-scroll', children: 'hi' }),
    )
    expect((container.firstElementChild as HTMLElement).getAttribute('data-testid')).toBe(
      'my-scroll',
    )
    unmount()
  })

  it('<Spacer data-testid + style override> forward', () => {
    const { container, unmount } = mountTest(
      h(Spacer, { 'data-testid': 'my-spacer', style: { 'flex-grow': '0' } }),
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-testid')).toBe('my-spacer')
    // Consumer override wins on conflict.
    expect(root.style.flexGrow).toBe('0')
    unmount()
  })

  it('consumer `style` object MERGES with the primitive computed style; consumer wins on conflict', () => {
    const { container, unmount } = mountTest(
      h(Stack, {
        gap: 2,
        // Conflict on `gap` — consumer wins. New `color` key adds.
        style: { gap: '99px', color: 'red' },
        children: 'hi',
      }),
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.style.color).toBe('red')
    expect(root.style.gap).toBe('99px')
    unmount()
  })

  it('consumer `style` string concatenates onto the computed style', () => {
    const { container, unmount } = mountTest(
      h(Stack, {
        gap: 2,
        style: 'color: blue',
        children: 'hi',
      }),
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.style.color).toBe('blue')
    // Primitive's computed gap survives (string append).
    expect(root.style.gap).toBe('8px')
    unmount()
  })
})
