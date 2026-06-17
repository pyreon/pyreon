// Targeted coverage for the residual branches in the web primitives that
// the main `primitives.test.tsx` happy-path suite doesn't reach — mostly
// the FALSE side of defensive guards, the plain-value (non-signal) form of
// reactive props, and the asset-name `src` dispatch. Each test names the
// exact source branch it exercises.

import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { Button, Field, Image, Press, Text, Toggle, WebView } from '../index'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.()
})

function mountTest(vnode: ReturnType<typeof h>): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const unmount = mount(vnode, container)
  cleanups.push(() => {
    unmount()
    document.body.removeChild(container)
  })
  return container
}

describe('<Button> — unknown variant falls back to primary (Button.tsx variantStyle ??)', () => {
  it('an out-of-vocabulary variant resolves to the primary chrome', () => {
    const root = mountTest(
      // cast: variant is a typed union; a dynamic runtime value can still
      // miss the map, which is what the `?? VARIANT_STYLES.primary` guards.
      h(Button, { onPress: () => {}, variant: 'nope' as never }, 'X'),
    ).firstElementChild as HTMLButtonElement
    // primary background = blue-600 (happy-dom keeps the hex verbatim)
    expect(root.style.backgroundColor).toBe('#2563eb')
  })
})

describe('<Field> — plain string value (Field.tsx getValue non-function branch)', () => {
  it('a non-signal string `value` is read directly', () => {
    const input = mountTest(
      h(Field, { value: 'plain text', onChangeText: () => {} }),
    ).firstElementChild as HTMLInputElement
    expect(input.value).toBe('plain text')
  })

  it('an out-of-vocabulary kind falls back to type="text" (Field.tsx KIND_TO_TYPE ??)', () => {
    const input = mountTest(
      h(Field, { value: '', onChangeText: () => {}, kind: 'weird' as never }),
    ).firstElementChild as HTMLInputElement
    expect(input.type).toBe('text')
  })
})

describe('<Toggle> — plain boolean value (Toggle.tsx getValue non-function branch)', () => {
  it('a non-signal boolean `value` is read directly', () => {
    const input = mountTest(
      h(Toggle, { value: true, onChange: () => {} }),
    ).firstElementChild as HTMLInputElement
    expect(input.checked).toBe(true)
  })
})

describe('<Image> — src dispatch (Image.tsx src ternary)', () => {
  it('a bare asset name resolves under /assets/', () => {
    const img = mountTest(h(Image, { src: 'logo.png', alt: '' }))
      .firstElementChild as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/assets/logo.png')
  })

  it('an http(s) URL passes through untouched', () => {
    const img = mountTest(
      h(Image, { src: 'https://cdn.example.com/x.png', alt: '' }),
    ).firstElementChild as HTMLImageElement
    expect(img.getAttribute('src')).toBe('https://cdn.example.com/x.png')
  })

  it('a path-style src (contains a slash) passes through untouched', () => {
    const img = mountTest(h(Image, { src: './nested/x.png', alt: '' }))
      .firstElementChild as HTMLImageElement
    expect(img.getAttribute('src')).toBe('./nested/x.png')
  })
})

describe('<Press> — guard false-branches', () => {
  it('a non-Enter/non-Space key does NOT trigger onPress (Press.tsx onKeyDown if)', () => {
    let n = 0
    const root = mountTest(h(Press, { onPress: () => n++ }, 'tap'))
      .firstElementChild as HTMLDivElement
    root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }),
    )
    expect(n).toBe(0)
  })

  it('a pointerup with no prior pointerdown is a no-op (Press.tsx onPointerUp timer-undefined branch)', () => {
    // onLongPress present → onPointerUp wired; firing it WITHOUT a preceding
    // pointerdown exercises the `longPressTimer === undefined` (false) path.
    const root = mountTest(
      h(Press, { onPress: () => {}, onLongPress: () => {} }, 'x'),
    ).firstElementChild as HTMLDivElement
    expect(() =>
      root.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })),
    ).not.toThrow()
  })
})

describe('<Text> — defensive guards + font', () => {
  it('an out-of-vocabulary size leaves font-size unset (Text.tsx px guard false)', () => {
    const span = mountTest(h(Text, { size: 'huge' as never }, 'x'))
      .firstElementChild as HTMLSpanElement
    expect(span.style.fontSize).toBe('')
  })

  it('an out-of-vocabulary weight leaves font-weight unset (Text.tsx w guard false)', () => {
    const span = mountTest(h(Text, { weight: 'heavy' as never }, 'x'))
      .firstElementChild as HTMLSpanElement
    expect(span.style.fontWeight).toBe('')
  })

  it('a custom font sets font-family (Text.tsx font branch)', () => {
    const span = mountTest(h(Text, { font: 'Inter' }, 'x'))
      .firstElementChild as HTMLSpanElement
    expect(span.style.fontFamily).toBe('Inter')
  })
})

describe('<WebView> — neither html nor src (WebView.tsx else-if false)', () => {
  it('with neither prop, the iframe carries no srcdoc/src', () => {
    const frame = mountTest(h(WebView, {} as never))
      .firstElementChild as HTMLIFrameElement
    expect(frame.tagName).toBe('IFRAME')
    expect(frame.hasAttribute('srcdoc')).toBe(false)
    expect(frame.getAttribute('src')).toBeNull()
  })
})
