// Real-Chromium browser smoke tests for the implemented web primitives.
//
// Validates that each primitive renders the expected DOM shape AND
// the token-resolved inline styles materialize as real computed
// CSS values. Catches regressions in token resolution + DOM shape
// that happy-dom can't reliably detect.

import { afterEach, describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
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
      h(Stack, { direction: 'row', align: 'center', justify: 'between' }, h('span', null, 'a')),
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
    const { container, unmount } = mountInBrowser(h(Press, { onPress: () => pressed++ }, 'tap'))
    const root = container.firstElementChild as HTMLDivElement
    root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await flush()
    expect(pressed).toBe(1)
    unmount()
  })

  it('Space key triggers onPress (ARIA-button keyboard contract)', async () => {
    let pressed = 0
    const { container, unmount } = mountInBrowser(h(Press, { onPress: () => pressed++ }, 'tap'))
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

  it('addTodo-style flow with keyboard events (Playwright shape)', async () => {
    // Closer to Playwright's fill() — uses keyboard events. If the
    // signal→input.value chain breaks anywhere here, this is where
    // it surfaces.
    const draft = signal('')
    const addTodo = () => draft.set('')
    const { container, unmount } = mountInBrowser(
      h(Field, {
        value: draft,
        onChangeText: (next: string) => draft.set(next),
        onSubmit: addTodo,
      }),
    )
    const input = container.firstElementChild as HTMLInputElement
    input.focus()

    // Type using keydown + InputEvent (Playwright's actual sequence).
    const typeChar = async (ch: string) => {
      // Browser sets input.value before firing input event.
      input.value = input.value + ch
      input.dispatchEvent(
        new InputEvent('input', {
          inputType: 'insertText',
          data: ch,
          bubbles: true,
        }),
      )
      await flush()
    }
    for (const ch of 'hello') await typeChar(ch)
    expect(draft()).toBe('hello')
    expect(input.value).toBe('hello')

    // Press Enter via keyboard event.
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        bubbles: true,
        cancelable: true,
      }),
    )
    await flush()
    expect(draft()).toBe('')
    // The CRITICAL assertion — the input.value property must reflect ''.
    expect(input.value).toBe('')
    unmount()
  })

  it('addTodo-style flow: type → onSubmit fires → draft.set("") clears the input', async () => {
    // This mirrors the EXACT flow from native-todomvc-web's TodoApp:
    //   - user types into the field (each char → onInput → draft.set)
    //   - user presses Enter → onSubmit → addTodo()
    //   - addTodo's last line: draft.set('')
    // The input should clear. PR #951's e2e claimed it doesn't — this
    // repro asserts the real-Chromium contract. If it FAILS, there's a
    // real bug in Pyreon's reactive-prop update path for <input value>.
    const draft = signal('')
    let submitCount = 0
    const addTodo = () => {
      submitCount++
      // Clear the draft (matches the TodoApp flow).
      draft.set('')
    }
    const { container, unmount } = mountInBrowser(
      h(Field, {
        value: draft,
        onChangeText: (next: string) => draft.set(next),
        onSubmit: addTodo,
      }),
    )
    const input = container.firstElementChild as HTMLInputElement
    expect(input.value).toBe('')

    // Simulate typing 'Buy milk' character by character (Playwright's
    // field.fill() does this internally — each char fires input event).
    for (const ch of 'Buy milk') {
      input.value = input.value + ch
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await flush()
    }
    expect(draft()).toBe('Buy milk')
    expect(input.value).toBe('Buy milk')

    // Press Enter — onSubmit fires → addTodo → draft.set('').
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    await flush()
    expect(submitCount).toBe(1)
    expect(draft()).toBe('')
    // The reactive binding on `value` must propagate '' back to the
    // input.value PROPERTY. The #951 e2e claimed this fails; this assertion
    // is the canonical test of the contract.
    expect(input.value).toBe('')
    unmount()
  })

  it('value as getter (Pyreon compiler `_rp` shape) — signal write reflects to input.value (CRITICAL — real #951 gap #2 repro)', async () => {
    // CRITICAL regression test. The prior #955 contract tests passed
    // `value: signal` DIRECTLY — they never exercised the
    // production-emit shape where Pyreon's compiler wraps signal-
    // shaped props as `_rp(() => signal())` thunks, then
    // `makeReactiveProps` (in mount.ts) converts them to GETTER
    // descriptors on props.
    //
    // The bug: Field.tsx's setup-time read `const innerGetValue =
    // unwrapValue(props.value)` would fire the getter ONCE, capturing
    // the CURRENT value as a string. Subsequent signal writes never
    // re-fired the renderEffect because the link to the signal was
    // broken at the property-read step.
    //
    // This test simulates the production prop shape by defining the
    // `value` prop as a GETTER (via Object.defineProperty), not a
    // plain assignment. If Field reads `props.value` at setup time
    // (the bug), the test FAILS — the input doesn't clear after the
    // signal-driven set('').
    const draft = signal('initial')
    // Build the props object with a getter for `value` — mirrors what
    // `makeReactiveProps` produces from a compiler `_rp(() => signal())`.
    const fieldProps = {
      onChangeText: (next: string) => draft.set(next),
    } as Record<string, unknown>
    Object.defineProperty(fieldProps, 'value', {
      get: () => draft(),
      enumerable: true,
      configurable: true,
    })
    const { container, unmount } = mountInBrowser(
      // h() preserves the descriptor when we pass an object built this way.
      h(Field, fieldProps as never),
    )
    const input = container.firstElementChild as HTMLInputElement
    expect(input.value).toBe('initial')

    // Signal write that the bug used to swallow.
    draft.set('')
    await flush()
    expect(draft()).toBe('')
    // CRITICAL: this assertion is what fails when Field reads
    // `props.value` at setup time (the pre-fix bug). It passes only
    // when Field defers the read into the reactive thunk.
    expect(input.value).toBe('')

    // Round-trip: simulated user typing → signal-driven clear.
    input.value = 'after typing'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    expect(draft()).toBe('after typing')
    draft.set('')
    await flush()
    expect(input.value).toBe('')
    unmount()
  })

  it('signal write reflects to input.value PROPERTY (the #951 gap #2 regression)', async () => {
    // Repro of the gap documented in #951's e2e spec: `draft.set('')`
    // after submit didn't clear the input. The cause is real-Chromium-
    // specific (happy-dom passes this assertion silently). Lock the
    // contract here so any regression in @pyreon/runtime-dom's prop
    // forwarding for <input value> surfaces immediately.
    const value = signal('initial')
    const { container, unmount } = mountInBrowser(
      h(Field, {
        value,
        onChangeText: (next: string) => value.set(next),
      }),
    )
    const input = container.firstElementChild as HTMLInputElement
    expect(input.value).toBe('initial')

    // Programmatic signal write — equivalent to addTodo()'s draft.set('')
    // after a submit. The reactive binding on `value` must propagate
    // back to the input's .value PROPERTY (NOT just the attribute —
    // for controlled-input semantics, the property is the live value).
    value.set('')
    await flush()
    expect(input.value).toBe('')

    // Another write after a typed character to prove the chain still
    // works after both directions have fired.
    input.value = 'mid-cycle'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
    expect(value()).toBe('mid-cycle')
    value.set('reset')
    await flush()
    expect(input.value).toBe('reset')
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

describe('<Heading> — web', () => {
  it('renders a semantic <h2> with the scale font-size + bold weight', () => {
    const { container, unmount } = mountInBrowser(
      h(Heading, { level: 2, color: 'primary' }, 'Section'),
    )
    const root = container.firstElementChild as HTMLHeadingElement
    expect(root.tagName).toBe('H2')
    expect(root.textContent).toBe('Section')
    const cs = getComputedStyle(root)
    expect(cs.fontSize).toBe('24px')
    expect(cs.fontWeight).toBe('700')
    expect(cs.color).toBe('rgb(37, 99, 235)')
    unmount()
  })
})

describe('<Image> — web', () => {
  it('renders an <img> with src/alt + object-fit + resolved dimensions', () => {
    const { container, unmount } = mountInBrowser(
      h(Image, {
        src: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
        alt: 'pixel',
        fit: 'contain',
        width: 64,
        height: 64,
      }),
    )
    const img = container.firstElementChild as HTMLImageElement
    expect(img.tagName).toBe('IMG')
    expect(img.alt).toBe('pixel')
    // object-fit is the real-browser-verified bit (computed value).
    expect(getComputedStyle(img).objectFit).toBe('contain')
    // Dimensions: assert the resolved inline style (deterministic across
    // headless rendering — computed width can be clamped by the
    // broken/placeholder-image box in some Chromium builds).
    expect(img.style.width).toBe('64px')
    expect(img.style.height).toBe('64px')
    unmount()
  })
})

describe('<Icon> — web', () => {
  it('references an SVG sprite symbol the app provides + inherits text color', () => {
    // App-provided sprite — the documented zero-bundle pattern.
    const sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    sprite.style.display = 'none'
    sprite.innerHTML = '<symbol id="check" viewBox="0 0 16 16"><path d="M2 8l4 4 8-8" /></symbol>'
    document.body.appendChild(sprite)

    const { container, unmount } = mountInBrowser(
      // currentColor inheritance: parent sets a known color.
      h(
        'div',
        { style: 'color: rgb(220, 38, 38)' },
        h(Icon, { name: 'check', size: 'lg', 'aria-label': 'done' }),
      ),
    )
    const svg = container.querySelector('svg') as SVGElement
    const use = svg.firstElementChild as SVGUseElement
    expect(use.tagName.toLowerCase()).toBe('use')
    expect(use.getAttribute('href')).toBe('#check')
    const cs = getComputedStyle(svg)
    expect(cs.width).toBe('24px')
    expect(cs.height).toBe('24px')
    // fill: currentColor resolves to the inherited red.
    expect(cs.fill).toBe('rgb(220, 38, 38)')
    // Meaningful icon (aria-label) is NOT aria-hidden.
    expect(svg.getAttribute('aria-hidden')).toBe(null)
    expect(svg.getAttribute('aria-label')).toBe('done')

    document.body.removeChild(sprite)
    unmount()
  })
})

describe('<Layer> — web', () => {
  it('renders a relative grid container; align → place-items', () => {
    const { container, unmount } = mountInBrowser(
      h(Layer, { align: 'center', padding: 'md' }, h('span', null, 'base')),
    )
    const root = container.firstElementChild as HTMLDivElement
    expect(root.tagName).toBe('DIV')
    const cs = getComputedStyle(root)
    expect(cs.position).toBe('relative')
    expect(cs.display).toBe('grid')
    expect(cs.placeItems).toContain('center')
    expect(cs.padding).toBe('12px')
    unmount()
  })

  it('positioning context: an absolutely-positioned child anchors to the Layer', () => {
    const { container, unmount } = mountInBrowser(
      h(
        Layer,
        { style: { width: '200px', height: '200px' } },
        h('div', { style: 'position:absolute; top:0; left:0; width:10px; height:10px' }, ''),
      ),
    )
    const root = container.firstElementChild as HTMLDivElement
    const child = root.firstElementChild as HTMLDivElement
    const rootRect = root.getBoundingClientRect()
    const childRect = child.getBoundingClientRect()
    // Child's top-left anchors to the Layer's box (relative context works).
    expect(Math.round(childRect.left)).toBe(Math.round(rootRect.left))
    expect(Math.round(childRect.top)).toBe(Math.round(rootRect.top))
    unmount()
  })
})

describe('<Scroll> — web', () => {
  it('vertical scroller: overflow-y auto, overflow-x hidden', () => {
    const { container, unmount } = mountInBrowser(
      h(Scroll, { style: { height: '50px' } }, h('div', { style: 'height:500px' }, 'tall')),
    )
    const root = container.firstElementChild as HTMLDivElement
    const cs = getComputedStyle(root)
    expect(cs.overflowY).toBe('auto')
    expect(cs.overflowX).toBe('hidden')
    // Tall child overflows → the container is actually scrollable.
    expect(root.scrollHeight).toBeGreaterThan(root.clientHeight)
    unmount()
  })

  it('axis="horizontal" flips the scrolled axis', () => {
    const { container, unmount } = mountInBrowser(
      h(Scroll, { axis: 'horizontal' }, h('span', null, 'a')),
    )
    const cs = getComputedStyle(container.firstElementChild as HTMLDivElement)
    expect(cs.overflowX).toBe('auto')
    expect(cs.overflowY).toBe('hidden')
    unmount()
  })
})

describe('<Spacer> — web', () => {
  it('grows to fill free main-axis space inside an Inline', () => {
    const { container, unmount } = mountInBrowser(
      h(
        Inline,
        { style: { width: '300px' } },
        h(Text, { 'data-testid': 'left' }, 'L'),
        h(Spacer, null),
        h(Text, { 'data-testid': 'right' }, 'R'),
      ),
    )
    const row = container.firstElementChild as HTMLDivElement
    const left = row.querySelector('[data-testid="left"]') as HTMLElement
    const right = row.querySelector('[data-testid="right"]') as HTMLElement
    const rowRect = row.getBoundingClientRect()
    const leftRect = left.getBoundingClientRect()
    const rightRect = right.getBoundingClientRect()
    // The Spacer pushes the two ends apart: left hugs the start, right hugs the end.
    expect(Math.round(leftRect.left)).toBeCloseTo(Math.round(rowRect.left), -1)
    expect(Math.round(rightRect.right)).toBeCloseTo(Math.round(rowRect.right), -1)
    // There's a real gap between them (the Spacer consumed it).
    expect(rightRect.left - leftRect.right).toBeGreaterThan(100)
    unmount()
  })
})

describe('<Modal> — web', () => {
  it('signal-driven open enters native modal mode (top-layer); close exits', async () => {
    const open = signal(false)
    const { container, unmount } = mountInBrowser(
      h(
        Modal,
        { open, onClose: () => open.set(false) },
        h('button', { 'data-testid': 'inside' }, 'OK'),
      ),
    )
    const dlg = container.querySelector('dialog') as HTMLDialogElement
    expect(dlg.open).toBe(false)

    // Open: showModal() puts it in the top layer + the ::backdrop appears.
    open.set(true)
    await flush()
    expect(dlg.open).toBe(true)
    // matches(':modal') is true ONLY for showModal() (not the `open` attr).
    expect(dlg.matches(':modal')).toBe(true)

    // Close via the signal.
    open.set(false)
    await flush()
    expect(dlg.open).toBe(false)
    unmount()
  })

  it('Escape routes through onClose (preventDefault keeps the signal authoritative)', async () => {
    const open = signal(true)
    let closes = 0
    const { container, unmount } = mountInBrowser(
      h(
        Modal,
        {
          open,
          onClose: () => {
            closes++
            open.set(false)
          },
        },
        h('p', null, 'body'),
      ),
    )
    const dlg = container.querySelector('dialog') as HTMLDialogElement
    await flush()
    expect(dlg.open).toBe(true)

    // Real cancel event (what the browser fires on Escape).
    dlg.dispatchEvent(new Event('cancel', { cancelable: true }))
    await flush()
    expect(closes).toBe(1)
    // onClose flipped the signal → effect closed it.
    expect(dlg.open).toBe(false)
    unmount()
  })

  it('focus moves into the dialog on open (native focus trap)', async () => {
    const open = signal(false)
    const { container, unmount } = mountInBrowser(
      h(
        Modal,
        { open, onClose: () => open.set(false) },
        h('button', { 'data-testid': 'first' }, 'First'),
      ),
    )
    const dlg = container.querySelector('dialog') as HTMLDialogElement
    open.set(true)
    await flush()
    // showModal() moves focus to the first focusable descendant (or the
    // dialog itself); either way the active element is within the dialog.
    expect(dlg.contains(document.activeElement)).toBe(true)
    open.set(false)
    await flush()
    unmount()
  })
})

describe('<Link> — web', () => {
  afterEach(() => resetPrimitivesConfig())

  it('internal link click is intercepted by init({ navigate }) — real left-click, no reload', async () => {
    const navigated: string[] = []
    init({ navigate: (to) => navigated.push(to) })
    const { container, unmount } = mountInBrowser(
      h(Link, { to: '/about', 'data-testid': 'go' }, 'About'),
    )
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.tagName).toBe('A')
    expect(a.getAttribute('href')).toBe('/about')

    // Drop a sentinel — a full reload would wipe it; intercepted nav keeps it.
    ;(window as unknown as { __linkSentinel?: number }).__linkSentinel = 42
    a.click() // real browser left-click
    await flush()
    expect(navigated).toEqual(['/about'])
    expect((window as unknown as { __linkSentinel?: number }).__linkSentinel).toBe(42)
    delete (window as unknown as { __linkSentinel?: number }).__linkSentinel
    unmount()
  })

  it('without init, the internal link is a plain navigable <a href>', () => {
    // NOTE: don't click here — with no configured navigate the anchor is a
    // real link, and a left-click would actually navigate the test iframe
    // (correct behavior, but it tears down the runner). The not-intercepted /
    // not-preventDefault contract is covered by the happy-dom unit tests; in
    // the browser we assert the rendered href is a real navigable URL
    // (right-click / open-in-new-tab / SEO / no-JS all work).
    const { container, unmount } = mountInBrowser(h(Link, { to: '/about' }, 'About'))
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe('/about')
    expect(a.getAttribute('target')).toBe(null)
    unmount()
  })

  it('external link is a plain new-tab anchor (no onClick interception)', () => {
    // Don't click a real target=_blank anchor in the browser runner (popup /
    // network). Assert the anchor contract; the "external is never
    // intercepted by navigate" behavior is covered by the happy-dom unit test.
    init({ navigate: () => {} })
    const { container, unmount } = mountInBrowser(
      h(Link, { to: 'https://example.com', external: true }, 'Site'),
    )
    const a = container.querySelector('a') as HTMLAnchorElement
    expect(a.href).toContain('https://example.com')
    expect(a.target).toBe('_blank')
    expect(a.rel).toBe('noopener noreferrer')
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

describe('<Toggle> — web', () => {
  it('value as getter (Pyreon compiler `_rp` shape) — signal write reflects to input.checked (#951 gap #2 sibling fix)', async () => {
    // Same reactive-prop-read bug as Field — Toggle was reading
    // `props.value` at setup time, capturing the boolean, breaking
    // signal tracking. Fixed by deferring the read into the thunk.
    // This test simulates the production prop shape (getter from
    // makeReactiveProps) and asserts the binding round-trips.
    const checked = signal(false)
    const props = {
      onChange: (next: boolean) => checked.set(next),
    } as Record<string, unknown>
    Object.defineProperty(props, 'value', {
      get: () => checked(),
      enumerable: true,
      configurable: true,
    })
    const { container, unmount } = mountInBrowser(h(Toggle, props as never))
    const input = container.firstElementChild as HTMLInputElement
    expect(input.type).toBe('checkbox')
    expect(input.checked).toBe(false)

    // Signal-driven flip — input.checked must follow.
    checked.set(true)
    await flush()
    expect(input.checked).toBe(true)

    // Simulated user click → onChange → signal flips back
    input.checked = false
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()
    expect(checked()).toBe(false)
    unmount()
  })
})
