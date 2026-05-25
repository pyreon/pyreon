// Happy-DOM unit tests for the 6 web primitives.
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

import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import { Button, Field, Inline, Press, Stack, Text } from '../index'

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
    const { container, unmount } = mountTest(
      h(Stack, { direction: 'row' }, h('span', null, 'a')),
    )
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
    const { container, unmount } = mountTest(
      h(Stack, { align: 'center' }, h('span', null, 'a')),
    )
    expect((container.firstElementChild as HTMLDivElement).style.alignItems).toBe('center')
    unmount()
  })

  it('justify="between" maps to flex justifyContent: space-between', () => {
    const { container, unmount } = mountTest(
      h(Stack, { justify: 'between' }, h('span', null, 'a')),
    )
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
    const { container, unmount } = mountTest(
      h(Stack, { margin: 3 }, h('span', null, 'a')),
    )
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
    const { container, unmount } = mountTest(
      h(Stack, { radius: 'md' }, h('span', null, 'a')),
    )
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
    const { container, unmount } = mountTest(
      h(Button, { onPress: () => {}, disabled: true }, 'X'),
    )
    const btn = container.firstElementChild as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.style.opacity).toBe('0.5')
    expect(btn.style.cursor).toBe('not-allowed')
    unmount()
  })

  it('disabled blocks onPress', () => {
    let n = 0
    const { container, unmount } = mountTest(
      h(Button, { onPress: () => n++, disabled: true }, 'X'),
    )
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
    root.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    )
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
