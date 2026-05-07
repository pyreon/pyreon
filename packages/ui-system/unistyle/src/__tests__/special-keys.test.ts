import { describe, expect, it } from 'vitest'
import styles from '../styles/styles/index'

const mockCss = (strings: TemplateStringsArray, ...vals: any[]) => {
  let r = ''
  for (let i = 0; i < strings.length; i++) {
    r += strings[i]
    if (i < vals.length) r += String(vals[i])
  }
  return r
}

// Regression: kind: 'special' descriptors (`fullScreen`, `hideEmpty`,
// `clearFix`, `extendCss`, `backgroundImage`, `animation`) only carry an
// `id` field — no `key` / `keys`. The keyToIndices builder used to walk
// only `d.key` / `d.keys`, so special descriptors were never indexed.
//
// In single-special-property themes the bug was masked by the fallback
// path (`if (fragments.length === 0 && Object.keys(t).length > 0)` triggers
// a full-scan that hits processSpecial). The moment ANY non-special key is
// also present in the theme — the real-world shape, e.g. `<Overlay>` with
// `{ fullScreen: true, background: 'rgba(0,0,0,0.5)' }` — the fast path
// processes `background`, fragments.length === 1, fallback skipped, the
// special is silently dropped.
//
// Fix: index `d.id` alongside `d.key` / `d.keys` so the fast path resolves
// special descriptors directly.
describe('kind: special descriptors paired with non-special properties', () => {
  it('fullScreen + background → both render', () => {
    const result = styles({
      theme: { fullScreen: true, background: 'rgba(0,0,0,0.5)' },
      css: mockCss,
      rootSize: 16,
    })
    const output = String(result)
    expect(output).toContain('position: fixed;')
    expect(output).toContain('top: 0;')
    expect(output).toContain('background: rgba(0,0,0,0.5);')
  })

  it('hideEmpty + color → both render', () => {
    const result = styles({
      theme: { hideEmpty: true, color: 'red' },
      css: mockCss,
      rootSize: 16,
    })
    const normalized = String(result).replace(/\s+/g, ' ')
    expect(normalized).toContain('&:empty { display: none; }')
    expect(normalized).toContain('color: red;')
  })

  it('clearFix + padding → both render', () => {
    const result = styles({
      theme: { clearFix: true, padding: 8 },
      css: mockCss,
      rootSize: 16,
    })
    const normalized = String(result).replace(/\s+/g, ' ')
    expect(normalized).toContain("&::after { clear: both; content: ''; display: table; }")
    expect(normalized).toContain('padding:')
    expect(normalized).toContain('0.5rem')
  })

  it('extendCss + color → both render', () => {
    const result = styles({
      theme: { extendCss: 'border: 1px solid red;', color: 'blue' },
      css: mockCss,
      rootSize: 16,
    })
    const output = String(result)
    expect(output).toContain('border: 1px solid red;')
    expect(output).toContain('color: blue;')
  })

  it('backgroundImage + color → both render', () => {
    const result = styles({
      theme: { backgroundImage: 'https://example.com/img.png', color: 'green' },
      css: mockCss,
      rootSize: 16,
    })
    const output = String(result)
    expect(output).toContain('background-image: url(https://example.com/img.png);')
    expect(output).toContain('color: green;')
  })

  it('animation + color → both render', () => {
    const result = styles({
      theme: { animation: 'fadeIn 1s ease-in', color: 'purple' },
      css: mockCss,
      rootSize: 16,
    })
    const output = String(result)
    expect(output).toContain('animation:')
    expect(output).toContain('fadeIn 1s ease-in')
    expect(output).toContain('color: purple;')
  })

  it('multiple specials + non-specials → all render', () => {
    const result = styles({
      theme: {
        fullScreen: true,
        hideEmpty: true,
        clearFix: true,
        extendCss: 'outline: 2px dashed orange;',
        color: 'red',
        padding: 16,
      },
      css: mockCss,
      rootSize: 16,
    })
    const normalized = String(result).replace(/\s+/g, ' ')
    expect(normalized).toContain('position: fixed;')
    expect(normalized).toContain('&:empty { display: none; }')
    expect(normalized).toContain("&::after { clear: both; content: ''; display: table; }")
    expect(normalized).toContain('outline: 2px dashed orange;')
    expect(normalized).toContain('color: red;')
    expect(normalized).toContain('padding:')
    expect(normalized).toContain('1rem')
  })
})
