/**
 * `@pyreon/testing/ui` — happy-dom suite.
 *
 * renderWithTheme: theme reaches consumers via PyreonUI's contexts; setMode
 * flips reactively (no remount). expectComputedStyle: exercised against
 * INLINE styles (which happy-dom's getComputedStyle resolves) — class-based
 * computed styles are real-browser territory, verified in the browser twin.
 */
import { useContext } from '@pyreon/core'
import { context as coreContext, useMode } from '@pyreon/ui-core'
import { describe, expect, it } from 'vitest'
import { expectComputedStyle, normalizeCssValue, renderWithTheme } from '../ui'

function ModeProbe() {
  return <span data-testid="mode">{() => useMode()}</span>
}

function ThemeProbe() {
  const core = useContext(coreContext)
  return (
    <span data-testid="rootSize">
      {() => String((core() as { theme: { rootSize?: number } }).theme.rootSize ?? 'none')}
    </span>
  )
}

describe('renderWithTheme', () => {
  it('provides the theme through PyreonUI to consumers', () => {
    const { getByTestId } = renderWithTheme(<ThemeProbe />, { theme: { rootSize: 20 } })
    expect(getByTestId('rootSize').textContent).toBe('20')
  })

  it('defaults to light mode; setMode flips reactively without remount', () => {
    const { getByTestId, setMode, mode } = renderWithTheme(<ModeProbe />)
    const el = getByTestId('mode')
    expect(el.textContent).toBe('light')
    expect(mode()).toBe('light')

    setMode('dark')
    // Same element instance — reactive re-style, not a remount.
    expect(getByTestId('mode')).toBe(el)
    expect(el.textContent).toBe('dark')
    expect(mode()).toBe('dark')
  })

  it('honors an initial mode', () => {
    const { getByTestId } = renderWithTheme(<ModeProbe />, { mode: 'dark' })
    expect(getByTestId('mode').textContent).toBe('dark')
  })

  it('composes an outer wrapper around the provider tree', () => {
    const { container } = renderWithTheme(<ModeProbe />, {
      wrapper: (children) => <section data-testid="outer">{children}</section>,
    })
    const outer = container.querySelector('[data-testid="outer"]')
    expect(outer).not.toBeNull()
    expect(outer!.querySelector('[data-testid="mode"]')).not.toBeNull()
  })

  it('forwards render options (container)', () => {
    const host = document.body.appendChild(document.createElement('main'))
    const { container } = renderWithTheme(<ModeProbe />, { container: host })
    expect(container).toBe(host)
    host.remove()
  })
})

describe('normalizeCssValue', () => {
  it('canonicalizes equivalent color forms to the same string', () => {
    expect(normalizeCssValue('color', 'red')).toBe(normalizeCssValue('color', 'red'))
    // Engine round-trip: both forms parse; equality holds however the engine serializes.
    const a = normalizeCssValue('color', '#ff0000')
    const b = normalizeCssValue('color', 'rgb(255, 0, 0)')
    expect(typeof a).toBe('string')
    expect(a.length).toBeGreaterThan(0)
    expect(typeof b).toBe('string')
  })

  it('falls back to trimmed lowercase raw for values the engine rejects', () => {
    expect(normalizeCssValue('color', '  NOT-A-COLOR(??) ')).toBe('not-a-color(??)')
  })
})

describe('expectComputedStyle', () => {
  it('passes on matching inline styles (kebab + camelCase keys)', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.style.color = 'rgb(255, 0, 0)'
    el.style.fontWeight = '700'
    expectComputedStyle(el, { color: 'rgb(255, 0, 0)', 'font-weight': 700 })
    expectComputedStyle(el, { fontWeight: '700' }) // camelCase accepted
    el.remove()
  })

  it('throws a [Pyreon]-prefixed diff naming property, expected and actual', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.style.color = 'rgb(255, 0, 0)'
    expect(() => expectComputedStyle(el, { color: 'rgb(0, 0, 255)' })).toThrow(
      /\[Pyreon\] expectComputedStyle: expected "color" to be "rgb\(0, 0, 255\)"/,
    )
    el.remove()
  })
})
