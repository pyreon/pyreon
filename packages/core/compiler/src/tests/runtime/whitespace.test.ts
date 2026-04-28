// @vitest-environment happy-dom
/// <reference lib="dom" />
import { signal } from '@pyreon/reactivity'
import { describe, expect, it } from 'vitest'
import { flush } from '@pyreon/test-utils/browser'
import { compileAndMount } from './harness'

/**
 * Compiler-runtime tests — JSX text/expression whitespace handling.
 *
 * The #352 whitespace bug stripped same-line spaces adjacent to
 * expressions: `<p>doubled: {x}</p>` rendered "doubled:0" instead of
 * "doubled: 0". The fix implements React/Babel's
 * `cleanJSXElementLiteralChild` algorithm. This file pins down the
 * matrix: same-line text±expression, multi-line text, fragments,
 * leading/trailing/internal whitespace.
 */

describe('compiler-runtime — JSX whitespace', () => {
  it('preserves trailing space before expression on same line', async () => {
    const x = signal(7)
    const { container, unmount } = compileAndMount(
      `<div><p id="p">doubled: {x()}</p></div>`,
      { x },
    )
    expect(container.querySelector('#p')!.textContent).toBe('doubled: 7')
    unmount()
  })

  // Regression: when an expression sits BETWEEN static text segments
  // on the same line, the compiler used to append the dynamic text
  // node to the parent's children AFTER all static text via
  // `appendChild`. Whitespace was preserved correctly (#352), but
  // positioning was wrong:
  //   `<p>{x()} remaining</p>` → template `<p> remaining</p>` +
  //   appended text → renders as " remaining3" instead of "3 remaining".
  // Fix: extend `analyzeChildren.useMixed` to fire whenever ≥2 of
  // {element, text, expression} are present (not just element+nonElement).
  // Then placeholder-based positional mounting puts the dynamic text in
  // the right slot via `replaceChild`.
  it('preserves leading space after expression on same line', async () => {
    const x = signal(3)
    const { container, unmount } = compileAndMount(
      `<div><p id="p">{x()} remaining</p></div>`,
      { x },
    )
    expect(container.querySelector('#p')!.textContent).toBe('3 remaining')
    unmount()
  })

  it('preserves spaces on BOTH sides of expression', async () => {
    const x = signal('cat')
    const { container, unmount } = compileAndMount(
      `<div><p id="p">a {x()} b</p></div>`,
      { x },
    )
    expect(container.querySelector('#p')!.textContent).toBe('a cat b')
    unmount()
  })

  it('multi-line JSX with indentation collapses correctly', async () => {
    const x = signal('inner')
    // Multi-line JSX expression. Whitespace inside the JSX literal between
    // <p> and {x()} is treated by React/Babel cleanJSX as "indentation"
    // and collapses; same for between {x()} and </p>.
    const { container, unmount } = compileAndMount(
      `<div>
        <p id="p">
          {x()}
        </p>
      </div>`,
      { x },
    )
    expect(container.querySelector('#p')!.textContent?.trim()).toBe('inner')
    unmount()
  })

  it('reactive text updates without losing surrounding whitespace', async () => {
    const x = signal(0)
    const { container, unmount } = compileAndMount(
      `<div><p id="p">count: {x()} items</p></div>`,
      { x },
    )
    expect(container.querySelector('#p')!.textContent).toBe('count: 0 items')
    x.set(42)
    await flush()
    expect(container.querySelector('#p')!.textContent).toBe('count: 42 items')
    unmount()
  })

  it('reactive text at end of paragraph updates correctly', async () => {
    // The expression-at-END shape works because the dynamic text node is
    // appended to the parent — which happens to match the source order
    // when there's no text after.
    const x = signal(0)
    const { container, unmount } = compileAndMount(
      `<div><p id="p">count: {x()}</p></div>`,
      { x },
    )
    expect(container.querySelector('#p')!.textContent).toBe('count: 0')
    x.set(42)
    await flush()
    expect(container.querySelector('#p')!.textContent).toBe('count: 42')
    unmount()
  })
})
