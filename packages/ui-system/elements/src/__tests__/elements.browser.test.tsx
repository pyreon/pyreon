/** @jsxImportSource @pyreon/core */
import { describe, expect, it, vi } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { Element } from '../Element'
import { Portal } from '../Portal'
import { Text } from '../Text'

describe('@pyreon/elements browser smoke', () => {
  it('Element mounts into real DOM with structural rendering', () => {
    const { container, unmount } = mountInBrowser(
      <Element tag="div" data-id="el"><span>hello</span></Element>,
    )
    const el = container.querySelector('[data-id="el"]')
    expect(el?.tagName.toLowerCase()).toBe('div')
    expect(el?.querySelector('span')?.textContent).toBe('hello')
    unmount()
  })

  it('Element forwards a reactive text child to the DOM', async () => {
    const label = signal('hello')
    const { container, unmount } = mountInBrowser(
      <Element tag="div">
        <span data-id="lbl">{() => label()}</span>
      </Element>,
    )
    const lbl = container.querySelector('[data-id="lbl"]')
    expect(lbl?.textContent).toBe('hello')
    label.set('world')
    await flush()
    expect(lbl?.textContent).toBe('world')
    unmount()
  })

  it('Text renders as inline element', () => {
    const { container, unmount } = mountInBrowser(<Text tag="span" data-id="t">hi</Text>)
    const el = container.querySelector('[data-id="t"]')
    expect(el?.tagName.toLowerCase()).toBe('span')
    expect(el?.textContent).toBe('hi')
    unmount()
  })

  it('Portal projects children to document.body by default', () => {
    const { unmount } = mountInBrowser(
      <Portal>
        <div data-portal-id="p">portal-content</div>
      </Portal>,
    )
    const projected = document.querySelector('[data-portal-id="p"]')
    expect(projected?.textContent).toBe('portal-content')
    unmount()
    expect(document.querySelector('[data-portal-id="p"]')).toBeNull()
  })

  it('runs in a real browser — Vitest defines `process.env.NODE_ENV !== "production"`', () => {
    // Sanity check the test env: dev gates use bundler-agnostic
    // `process.env.NODE_ENV !== 'production'`. Every modern bundler
    // (incl. Vitest's Vite) replaces this at build time. In a real-browser
    // test run the literal lands as `"development" !== "production"` →
    // `true`, so dev warnings fire as expected.
    expect(process.env.NODE_ENV).not.toBe('production')
  })

  // Void HTML elements via Element must not trip runtime-dom's
  // "<X> is a void element and cannot have children" warning.
  // Wrapper used to leak an `undefined` child into the vnode for void tags.
  describe('void HTML element tags', () => {
    const voidTags: Array<'hr' | 'br' | 'input' | 'img'> = ['hr', 'br', 'input', 'img']

    for (const tag of voidTags) {
      it(`<${tag}> mounts without "void element" console.warn`, () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { container, unmount } = mountInBrowser(<Element tag={tag} data-id={tag} />)
        const el = container.querySelector(`[data-id="${tag}"]`)
        expect(el?.tagName.toLowerCase()).toBe(tag)
        const voidWarnings = warnSpy.mock.calls.filter((args) =>
          typeof args[0] === 'string' && args[0].includes('void element'),
        )
        expect(voidWarnings).toEqual([])
        warnSpy.mockRestore()
        unmount()
      })
    }
  })

  // Regression: Wrapper used to silently drop dangerouslySetInnerHTML.
  // The unit test asserts Wrapper forwards the prop on the rendered
  // vnode; this real-Chromium test asserts the SVG actually appears in
  // the DOM after mount — the user-visible bug shape was "renders empty
  // <div></div> instead of inlined SVG".
  describe('dangerouslySetInnerHTML — real-Chromium DOM proof', () => {
    it('inlines an SVG via Element + dangerouslySetInnerHTML', () => {
      const { container, unmount } = mountInBrowser(
        <Element
          tag="div"
          data-id="logo"
          dangerouslySetInnerHTML={{
            __html: '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>',
          }}
        />,
      )
      const root = container.querySelector('[data-id="logo"]')
      expect(root).toBeTruthy()
      // The SVG must actually be in the DOM, not lost between Wrapper and
      // the renderer. Pre-fix this assertion failed: container had
      // <div data-id="logo"></div> with no children.
      const svg = root?.querySelector('svg')
      expect(svg).toBeTruthy()
      expect(svg?.tagName.toLowerCase()).toBe('svg')
      expect(svg?.querySelector('rect')).toBeTruthy()
      unmount()
    })

    it('inlines markup on a button (needsFix path)', () => {
      const { container, unmount } = mountInBrowser(
        <Element
          tag="button"
          data-id="btn"
          dangerouslySetInnerHTML={{ __html: '<strong>Save</strong>' }}
        />,
      )
      const btn = container.querySelector('[data-id="btn"]')
      expect(btn).toBeTruthy()
      // The bold text must reach the DOM. The needsFix gate's existing
      // `!own.dangerouslySetInnerHTML` clause skips the two-layer fix,
      // so this falls into the !needsFix branch and the fix's
      // `if (innerHTML)` path takes over.
      expect(btn?.querySelector('strong')?.textContent).toBe('Save')
      unmount()
    })
  })
})
