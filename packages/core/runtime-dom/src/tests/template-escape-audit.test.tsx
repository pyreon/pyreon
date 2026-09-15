/**
 * 2026-09 compiler audit — the DOM half. Each spec compiles through the REAL
 * `transformJSX` (vitest's own JSX transform never emits `_tpl`, so it cannot
 * reproduce any of these) and mounts the emitted code, asserting the rendered
 * DOM against what the h() path / oxc produce for the same source.
 */
import { transformJSX } from '@pyreon/compiler'
import { transformSync } from 'esbuild'
import { Fragment, h, _rp, _rpd, cx } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { _tpl, _bindText, _bindDirect, _setChild, _setChildAt } from '../template'
import {
  _applyProps,
  _bindSpread,
  _setAttr,
  _setClass,
  _setStyle,
  _setValue,
  _setHtml,
  bindPolymorphicText,
  mountChild,
  _bindProp,
} from '../index'

const DEPS = {
  _tpl, _bind, _bindText, _bindProp, _bindDirect, _setChild, _setChildAt, bindPolymorphicText,
  _applyProps, _bindSpread, _setStyle, _setClass, _setAttr, _setValue, _setHtml, _rp, _rpd,
  _cx: cx, h, Fragment, signal, document,
} as const

function mountSource(source: string, globals: Record<string, unknown> = {}) {
  const { code } = transformJSX(source, 'test.tsx')
  // A shape the compiler bails to h() leaves JSX in the output — finish it the
  // way Vite would (esbuild, classic runtime against the same `h`).
  const finished = transformSync(code.replace(/^import\s+.*$/gm, ''), {
    loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment',
  }).code
  const body = finished.trim().replace(/;$/, '')
  const fn = new Function(...Object.keys(DEPS), ...Object.keys(globals), `return ${body}`)
  const result = fn(...Object.values(DEPS), ...Object.values(globals))
  const container = document.createElement('div')
  document.body.appendChild(container)
  const cleanup = mountChild(result, container)
  return { container, cleanup, code }
}

describe('template attribute baking matches the h() path', () => {
  it('a multi-line JSX attribute renders its line terminators verbatim', () => {
    const { container, cleanup, code } = mountSource('<div title="a\n   b\r\nc">y</div>')
    expect(code).toContain('_tpl(')
    expect(container.firstElementChild!.getAttribute('title')).toBe('a\n   b\r\nc')
    cleanup()
  })

  it('a JSX attribute entity decodes once — `title="a&quot;b"` is `a"b`, not the source text', () => {
    const { container, cleanup } = mountSource('<p title="a&quot;b" data-y="&lt;">z</p>')
    expect(container.firstElementChild!.getAttribute('title')).toBe('a"b')
    expect(container.firstElementChild!.getAttribute('data-y')).toBe('<')
    cleanup()
  })

  it('a template-literal attribute renders its cooked value', () => {
    const { container, cleanup } = mountSource('<div title={`a\\tb`}>y</div>')
    expect(container.firstElementChild!.getAttribute('title')).toBe('a\tb')
    cleanup()
  })
})

describe('raw-text elements keep their content byte-for-byte', () => {
  it('<style> static text is not entity-corrupted', () => {
    const css = '.a { color: red }\n.b > i { top: 0 }'
    const { container, cleanup } = mountSource('<div><style>{css}</style></div>', { css })
    expect(container.querySelector('style')!.textContent).toBe(css)
    cleanup()
  })

  it('<script> static text is not entity-corrupted', () => {
    const js = 'if (a && b < c) x()'
    const { container, cleanup } = mountSource('<div><script>{js}</script></div>', { js })
    expect(container.querySelector('script')!.textContent).toBe(js)
    cleanup()
  })
})

describe('a plain attribute after a spread wins over the spread key', () => {
  it('static `rel`/`href` after `{...p}` beat the caller-controlled values', () => {
    const p = { rel: 'EVIL', href: 'http:alert(1)', id: 'fromSpread' }
    const { container, cleanup } = mountSource('<a {...p} rel="noopener" href="/safe">x</a>', { p })
    const a = container.firstElementChild!
    expect(a.getAttribute('rel')).toBe('noopener')
    expect(a.getAttribute('href')).toBe('/safe')
    expect(a.getAttribute('id')).toBe('fromSpread')
    cleanup()
  })

  it('a spread AFTER a plain attribute still wins (unchanged template path)', () => {
    const p = { rel: 'fromSpread' }
    const { container, cleanup, code } = mountSource('<a rel="static" {...p}>x</a>', { p })
    expect(code).toContain('_tpl(')
    expect(container.firstElementChild!.getAttribute('rel')).toBe('fromSpread')
    cleanup()
  })
})

describe('signal auto-call respects every shadowing binding', () => {
  it('a `catch (error)` binding sharing a module signal name is not auto-called', () => {
    const src = `import { signal } from "@pyreon/reactivity"
const error = signal(null)
const f = () => { try { throw new Error("boom") } catch (error) { return <p>{error.message}</p> } }
f()`
    const { code } = transformJSX(src, 'test.tsx')
    const body = transformSync(code.replace(/^import\s+.*$/gm, ''), {
      loader: 'jsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'Fragment',
    }).code.trim()
    const fn = new Function(...Object.keys(DEPS), `${body.replace(/f\(\);?\s*$/, 'return f()')}`)
    const result = fn(...Object.values(DEPS))
    const container = document.createElement('div')
    // Pre-fix this threw `error is not a function` inside the catch block.
    const cleanup = mountChild(result, container)
    expect(container.textContent).toBe('boom')
    cleanup()
  })
})
