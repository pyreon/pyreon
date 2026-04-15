/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { sheet } from '@pyreon/styler'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { PyreonUI } from '@pyreon/ui-core'
import { afterEach, describe, expect, it } from 'vitest'
import { Col, Container, Row } from '../index'
import gridTheme from '../theme'

// Real-Chromium smoke for @pyreon/coolgrid.
//
// Vitest browser mode runs at a small viewport (≈414px), so we assert
// RATIOS against the actual rendered Row width rather than pegging
// absolute pixels to a Container max-width that gets capped by the
// viewport.
//
// Wraps in `PyreonUI` (the unified provider that replaces the
// deprecated `<Provider>` from @pyreon/unistyle), matching production
// usage.

describe('@pyreon/coolgrid in real browser', () => {
  afterEach(() => {
    sheet.clearCache()
  })

  it('Container mounts and Chromium computes flex layout', () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme: gridTheme }, h(Container, { id: 'c' }, 'hello')),
    )
    const el = container.querySelector<HTMLElement>('#c')!
    const cs = getComputedStyle(el)
    expect(cs.display).toBe('flex')
    expect(cs.flexDirection).toBe('column')
    expect(el.textContent).toContain('hello')
    unmount()
  })

  it('Col size=6 in a 12-col grid yields 50% width of its Row', () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme: gridTheme },
        h(Container, null, h(Row, { id: 'row' }, h(Col, { id: 'half', size: 6 }, 'half'))),
      ),
    )
    const row = container.querySelector<HTMLElement>('#row')!
    const half = container.querySelector<HTMLElement>('#half')!
    const ratio = half.getBoundingClientRect().width / row.getBoundingClientRect().width
    expect(ratio).toBeGreaterThan(0.495)
    expect(ratio).toBeLessThan(0.505)
    unmount()
  })

  it('Col size=2 in a 6-col grid yields ~33% — grid columns aren\'t hardcoded to 12', () => {
    // Explicitly overrides `grid.columns` to 6 to prove the math is
    // `size / columns`, not `size / 12`.
    const theme = { ...gridTheme, grid: { ...gridTheme.grid, columns: 6 } }
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h(Container, null, h(Row, { id: 'row' }, h(Col, { id: 'third', size: 2 }, 't'))),
      ),
    )
    const row = container.querySelector<HTMLElement>('#row')!
    const third = container.querySelector<HTMLElement>('#third')!
    const ratio = third.getBoundingClientRect().width / row.getBoundingClientRect().width
    expect(ratio).toBeGreaterThan(0.33)
    expect(ratio).toBeLessThan(0.34)
    // flex-basis emitted from size/columns
    expect(getComputedStyle(third).flexBasis).toBe('33.3333%')
    unmount()
  })

  it('two Cols of size 6 each lay out side-by-side (sum ≈ 100% of Row)', () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme: gridTheme },
        h(
          Container,
          null,
          h(
            Row,
            { id: 'row' },
            h(Col, { id: 'a', size: 6 }, 'A'),
            h(Col, { id: 'b', size: 6 }, 'B'),
          ),
        ),
      ),
    )
    const row = container.querySelector<HTMLElement>('#row')!
    const a = container.querySelector<HTMLElement>('#a')!
    const b = container.querySelector<HTMLElement>('#b')!
    const ar = a.getBoundingClientRect()
    const br = b.getBoundingClientRect()
    expect(br.left).toBeGreaterThanOrEqual(ar.right - 1)
    const sum = ar.width + br.width
    const rowW = row.getBoundingClientRect().width
    expect(sum / rowW).toBeGreaterThan(0.99)
    expect(sum / rowW).toBeLessThan(1.01)
    unmount()
  })

  it('flex-basis on Col is the literal percentage authored from size/columns', () => {
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme: gridTheme },
        h(Container, null, h(Row, null, h(Col, { id: 'c', size: 3 }, 'q'))),
      ),
    )
    const el = container.querySelector<HTMLElement>('#c')!
    expect(getComputedStyle(el).flexBasis).toBe('25%')
    unmount()
  })

  it('`gap` subtracts from Col flex-basis via calc() — different emit path', () => {
    // With gap set on Row, Col's widthStyles takes the
    // `calc(${width}% - ${g}px)` branch (see Col/styled.ts:37).
    // Chromium resolves the calc() and produces a width strictly less
    // than the gap-less 50% value, which is the load-bearing behavior.
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme: gridTheme },
        h(
          Container,
          null,
          h(
            Row,
            { id: 'row', gap: 24 },
            h(Col, { id: 'g', size: 6 }, 'G'),
          ),
        ),
      ),
    )
    const row = container.querySelector<HTMLElement>('#row')!
    const col = container.querySelector<HTMLElement>('#g')!
    const cs = getComputedStyle(col)
    // Chromium preserves the `calc(... - 24px)` literal in computed style.
    expect(cs.flexBasis).toMatch(/calc\([^)]+- 24px\)/)
    const colW = col.getBoundingClientRect().width
    const rowW = row.getBoundingClientRect().width
    // Gap subtraction: col width should be less than exactly 50%
    expect(colW).toBeLessThan(rowW * 0.5)
    // …but not dramatically so — confirms it's a subtraction, not a failure
    expect(colW).toBeGreaterThan(rowW * 0.4)
    unmount()
  })

  it('responsive `size` array applies a per-breakpoint width at the current viewport', () => {
    // The responsive-per-breakpoint feature: `size={[12, 6, 4]}`
    // means "size 12 on xs, 6 on sm, 4 on md+". At the vitest browser
    // viewport (~414px), xs is the only applicable breakpoint, so
    // size=12 should apply (100% width of Row).
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme: gridTheme },
        h(
          Container,
          null,
          h(
            Row,
            { id: 'row' },
            h(Col, { id: 'r', size: [12, 6, 4] } as any, 'x'),
          ),
        ),
      ),
    )
    const row = container.querySelector<HTMLElement>('#row')!
    const col = container.querySelector<HTMLElement>('#r')!
    expect(window.innerWidth).toBeLessThan(576) // below the `sm` breakpoint
    const ratio = col.getBoundingClientRect().width / row.getBoundingClientRect().width
    // xs size=12 on 12-column grid → 100% of Row
    expect(ratio).toBeGreaterThan(0.99)
    expect(ratio).toBeLessThan(1.01)
    unmount()
  })
})
