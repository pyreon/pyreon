// Real-Chromium browser smoke tests for the 6 proof-of-concept primitives.
//
// Validates that each primitive renders the expected DOM shape AND
// the token-resolved inline styles materialize as real computed
// CSS values. Catches regressions in token resolution + DOM shape
// that happy-dom can't reliably detect.

import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { Button, Field, Inline, Press, Stack, Text } from '../index'

describe('<Stack> — web', () => {
  it('renders a flex column div with token-resolved gap + padding', () => {
    const { container, unmount } = mountInBrowser(
      h(Stack, { gap: 4, padding: 'md' }, h('span', null, 'a'), h('span', null, 'b')),
    )
    const root = container.firstElementChild as HTMLDivElement
    expect(root.tagName).toBe('DIV')
    const cs = getComputedStyle(root)
    expect(cs.display).toBe('flex')
    expect(cs.flexDirection).toBe('column')
    expect(cs.gap).toBe('16px') // theme.space[4] = 16
    expect(cs.padding).toBe('12px') // theme.space.md = 12
    expect(root.children.length).toBe(2)
    unmount()
  })

  it('honors direction="row" + align="center" + justify="between"', () => {
    const { container, unmount } = mountInBrowser(
      h(
        Stack,
        { direction: 'row', align: 'center', justify: 'between' },
        h('span', null, 'a'),
      ),
    )
    const cs = getComputedStyle(container.firstElementChild as HTMLDivElement)
    expect(cs.flexDirection).toBe('row')
    expect(cs.alignItems).toBe('center')
    expect(cs.justifyContent).toBe('space-between')
    unmount()
  })
})

describe('<Inline> — web', () => {
  it('renders flex-direction:row by default (sugar over Stack)', () => {
    const { container, unmount } = mountInBrowser(
      h(Inline, { gap: 2 }, h('span', null, 'a'), h('span', null, 'b')),
    )
    const cs = getComputedStyle(container.firstElementChild as HTMLDivElement)
    expect(cs.flexDirection).toBe('row')
    expect(cs.gap).toBe('8px') // theme.space[2] = 8
    unmount()
  })
})

describe('<Text> — web', () => {
  it('renders a span with token-resolved color + size', () => {
    const { container, unmount } = mountInBrowser(
      h(Text, { color: 'primary', size: 'lg', weight: 'bold' }, 'hello'),
    )
    const root = container.firstElementChild as HTMLSpanElement
    expect(root.tagName).toBe('SPAN')
    expect(root.textContent).toBe('hello')
    const cs = getComputedStyle(root)
    expect(cs.color).toBe('rgb(37, 99, 235)') // primary = #2563eb
    expect(cs.fontSize).toBe('20px') // size "lg"
    expect(cs.fontWeight).toBe('700') // weight "bold"
    unmount()
  })

  it('truncate adds ellipsis CSS', () => {
    const { container, unmount } = mountInBrowser(
      h(Text, { truncate: true }, 'long-text-that-would-truncate'),
    )
    const cs = getComputedStyle(container.firstElementChild as HTMLSpanElement)
    expect(cs.overflow).toBe('hidden')
    expect(cs.textOverflow).toBe('ellipsis')
    expect(cs.whiteSpace).toBe('nowrap')
    unmount()
  })
})

describe('<Button> — web', () => {
  it('renders a <button> with primary variant + onPress wired to onClick', async () => {
    let clicked = 0
    const { container, unmount } = mountInBrowser(
      h(Button, { onPress: () => clicked++ }, 'Click me'),
    )
    const btn = container.firstElementChild as HTMLButtonElement
    expect(btn.tagName).toBe('BUTTON')
    expect(btn.type).toBe('button')
    expect(btn.textContent).toBe('Click me')
    const cs = getComputedStyle(btn)
    expect(cs.backgroundColor).toBe('rgb(37, 99, 235)') // primary blue
    expect(cs.color).toBe('rgb(255, 255, 255)')

    btn.click()
    await flush()
    expect(clicked).toBe(1)
    unmount()
  })

  it('secondary variant uses white background + dark text', () => {
    const { container, unmount } = mountInBrowser(
      h(Button, { onPress: () => {}, variant: 'secondary' }, 'OK'),
    )
    const cs = getComputedStyle(container.firstElementChild as HTMLButtonElement)
    expect(cs.backgroundColor).toBe('rgb(255, 255, 255)')
    expect(cs.color).toBe('rgb(17, 24, 39)') // gray-900
    unmount()
  })

  it('disabled prevents click + sets disabled attr + opacity 0.5', async () => {
    let clicked = 0
    const { container, unmount } = mountInBrowser(
      h(Button, { onPress: () => clicked++, disabled: true }, 'No'),
    )
    const btn = container.firstElementChild as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(getComputedStyle(btn).opacity).toBe('0.5')
    btn.click()
    await flush()
    expect(clicked).toBe(0)
    unmount()
  })
})

describe('<Press> — web', () => {
  it('renders a div with role="button" + tabIndex=0 + click handler', async () => {
    let pressed = 0
    const { container, unmount } = mountInBrowser(
      h(Press, { onPress: () => pressed++ }, h('span', null, 'tap me')),
    )
    const root = container.firstElementChild as HTMLDivElement
    expect(root.tagName).toBe('DIV')
    expect(root.getAttribute('role')).toBe('button')
    expect(root.tabIndex).toBe(0)
    root.click()
    await flush()
    expect(pressed).toBe(1)
    unmount()
  })

  it('Enter key triggers onPress (ARIA-button keyboard contract)', async () => {
    let pressed = 0
    const { container, unmount } = mountInBrowser(
      h(Press, { onPress: () => pressed++ }, 'tap'),
    )
    const root = container.firstElementChild as HTMLDivElement
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flush()
    expect(pressed).toBe(1)
    unmount()
  })

  it('Space key triggers onPress (ARIA-button keyboard contract)', async () => {
    let pressed = 0
    const { container, unmount } = mountInBrowser(
      h(Press, { onPress: () => pressed++ }, 'tap'),
    )
    const root = container.firstElementChild as HTMLDivElement
    root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    await flush()
    expect(pressed).toBe(1)
    unmount()
  })

  it('disabled blocks click + sets tabIndex=-1 + aria-disabled=true', async () => {
    let pressed = 0
    const { container, unmount } = mountInBrowser(
      h(Press, { onPress: () => pressed++, disabled: true }, 'no'),
    )
    const root = container.firstElementChild as HTMLDivElement
    expect(root.tabIndex).toBe(-1)
    expect(root.getAttribute('aria-disabled')).toBe('true')
    root.click()
    await flush()
    expect(pressed).toBe(0)
    unmount()
  })
})

describe('<Field> — web', () => {
  it('renders an <input> wired to a signal', async () => {
    const value = signal('initial')
    const { container, unmount } = mountInBrowser(
      h(Field, {
        value,
        onChangeText: (next: string) => value.set(next),
        placeholder: 'Type here',
      }),
    )
    const input = container.firstElementChild as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.type).toBe('text')
    expect(input.placeholder).toBe('Type here')
    expect(input.value).toBe('initial')

    // Simulate user typing — fires onInput, which calls onChangeText.
    input.value = 'updated'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    expect(value()).toBe('updated')
    unmount()
  })

  it('kind="email" maps to <input type="email">', () => {
    const value = signal('')
    const { container, unmount } = mountInBrowser(
      h(Field, {
        value,
        onChangeText: (next: string) => value.set(next),
        kind: 'email',
      }),
    )
    const input = container.firstElementChild as HTMLInputElement
    expect(input.type).toBe('email')
    unmount()
  })

  it('kind="password" maps to <input type="password">', () => {
    const value = signal('')
    const { container, unmount } = mountInBrowser(
      h(Field, {
        value,
        onChangeText: (next: string) => value.set(next),
        kind: 'password',
      }),
    )
    const input = container.firstElementChild as HTMLInputElement
    expect(input.type).toBe('password')
    unmount()
  })

  it('Enter key triggers onSubmit when provided', async () => {
    const value = signal('')
    let submitted = 0
    const { container, unmount } = mountInBrowser(
      h(Field, {
        value,
        onChangeText: (next: string) => value.set(next),
        onSubmit: () => submitted++,
      }),
    )
    const input = container.firstElementChild as HTMLInputElement
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flush()
    expect(submitted).toBe(1)
    unmount()
  })
})

describe('composition smoke — primitives compose like normal JSX', () => {
  it('Stack > Inline > Text + Button renders the expected structure', () => {
    const { container, unmount } = mountInBrowser(
      h(
        Stack,
        { gap: 3, padding: 'md' },
        h(Text, { size: 'lg', weight: 'bold' }, 'Title'),
        h(
          Inline,
          { gap: 2, align: 'center' },
          h(Text, null, 'Click:'),
          h(Button, { onPress: () => {}, variant: 'primary' }, 'OK'),
        ),
      ),
    )
    const outer = container.firstElementChild as HTMLDivElement
    expect(outer.tagName).toBe('DIV')
    expect(getComputedStyle(outer).flexDirection).toBe('column')

    const title = outer.children[0] as HTMLSpanElement
    expect(title.tagName).toBe('SPAN')
    expect(title.textContent).toBe('Title')

    const inline = outer.children[1] as HTMLDivElement
    expect(getComputedStyle(inline).flexDirection).toBe('row')

    const button = inline.children[1] as HTMLButtonElement
    expect(button.tagName).toBe('BUTTON')
    expect(button.textContent).toBe('OK')
    unmount()
  })
})
