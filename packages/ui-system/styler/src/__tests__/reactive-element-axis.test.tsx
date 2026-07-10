/**
 * Reactive `$element` / `$text` accessor axis on DynamicStyled.
 *
 * `@pyreon/elements` passes `$element` (Wrapper/Content layout bundles) and
 * `$text` (Text extraStyles) as FUNCTION ACCESSORS when any feeding prop is
 * getter-shaped (a compiler `_rp()`-emitted signal-driven layout/css prop).
 * DynamicStyled treats a function-valued `$element`/`$text` exactly like the
 * $rocketstyle/$rocketstate accessors: read TRACKED inside the class
 * computed → signal change re-resolves the class → renderEffect swaps
 * classList on the SAME DOM element (no remount).
 *
 * The reactive path deliberately BYPASSES elClassCache + CPSE — see the
 * `bypassElCacheAndCpse` comment in styled.tsx (a CPSE-agnostic className
 * stored by a static Element sharing an interned bundle identity would leak
 * broken var()-only styles into the reactive path).
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { setStyleExtraction, styled } from '../styled'

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

let cleanups: (() => void)[] = []
const mountInDom = (vnode: ReturnType<typeof h>) => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(vnode, root)
  cleanups.push(() => {
    dispose()
    root.remove()
  })
  return root
}

afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
  setStyleExtraction(false)
})

const Box = styled('div')`
  color: ${(p: { $element?: { color?: string } }) => p.$element?.color};
` as unknown as (props: Record<string, unknown>) => ReturnType<typeof h>

const Txt = styled('span')`
  color: ${(p: { $text?: { color?: string } }) => p.$text?.color};
` as unknown as (props: Record<string, unknown>) => ReturnType<typeof h>

describe('DynamicStyled — reactive $element accessor', () => {
  it('re-resolves the class when the accessor-read signal flips (same element)', async () => {
    const color = signal('rgb(1, 2, 3)')
    const root = mountInDom(
      h(Box as never, {
        'data-testid': 'rx-el',
        $element: () => ({ color: color() }),
      }),
    )
    await flush()
    const el = root.querySelector('[data-testid="rx-el"]') as HTMLElement
    expect(el).not.toBeNull()
    const before = el.className
    expect(before).toMatch(/pyr-/)

    color.set('rgb(4, 5, 6)')
    await flush()
    expect(root.querySelector('[data-testid="rx-el"]')).toBe(el)
    expect(el.className).toMatch(/pyr-/)
    expect(el.className).not.toBe(before)
  })

  it('static $element object keeps the classic (non-computed) path', async () => {
    const root = mountInDom(
      h(Box as never, {
        'data-testid': 'static-el',
        $element: { color: 'rgb(7, 8, 9)' },
      }),
    )
    await flush()
    const el = root.querySelector('[data-testid="static-el"]') as HTMLElement
    expect(el.className).toMatch(/pyr-/)
  })

  it('reactive $element under CPSE keeps CLASSIC full-value resolution (bypass)', async () => {
    // A trivially-invertible rewrite stub: replaces the declaration value
    // with a var() and captures it — enough to prove the bypass (the
    // reactive path must NOT get the agnostic class, whose vars it could
    // never update on re-resolve).
    setStyleExtraction(true, (cssText, varsOut) => {
      varsOut['--u-test'] = 'captured'
      return cssText.replace(/color:[^;]+;/, 'color: var(--u-test);')
    })
    const color = signal('rgb(10, 20, 30)')
    const root = mountInDom(
      h(Box as never, {
        'data-testid': 'cpse-el',
        $element: () => ({ color: color() }),
      }),
    )
    await flush()
    const el = root.querySelector('[data-testid="cpse-el"]') as HTMLElement
    // Classic resolution: no CPSE style vars on the element.
    expect(el.getAttribute('style') ?? '').not.toContain('--u-test')
    const before = el.className
    color.set('rgb(11, 21, 31)')
    await flush()
    expect(el.className).not.toBe(before)
  })
})

describe('DynamicStyled — reactive $text accessor', () => {
  it('re-resolves the class when the accessor-read signal flips', async () => {
    const color = signal('rgb(2, 4, 6)')
    const root = mountInDom(
      h(Txt as never, {
        'data-testid': 'rx-text',
        $text: () => ({ color: color() }),
      }),
    )
    await flush()
    const el = root.querySelector('[data-testid="rx-text"]') as HTMLElement
    const before = el.className
    expect(before).toMatch(/pyr-/)

    color.set('rgb(6, 4, 2)')
    await flush()
    expect(root.querySelector('[data-testid="rx-text"]')).toBe(el)
    expect(el.className).not.toBe(before)
  })
})
