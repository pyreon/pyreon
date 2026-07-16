/**
 * #2348 runtime regression — component-child `{props.x}` must be LIVE.
 *
 * Pre-fix, the compiler's component-child stable-reference carve-out emitted
 * `{props.title}` BARE in child position: the automatic JSX runtime read the
 * compiler-emitted `_rp` getter ONCE at jsx() time and the child froze —
 * while the IDENTICAL expression as a component ATTR (`label={props.title}`)
 * was `_rp(() => …)`-wrapped and stayed live. This test mounts the issue's
 * exact shape through the REAL `@pyreon/compiler` transform (vitest's own
 * JSX transform masks the bug — the documented wrong-transform trap) and
 * asserts the attr/child A/B: flip the source signal → BOTH must update.
 *
 * SSR parity: the same source rendered by `renderToString` must produce the
 * same initial text as the client mount (accessor children are an
 * established shape on both runtimes — signal-call children already arrive
 * as accessors).
 *
 * Bisect (documented in the PR): revert the `propBacked` branch in
 * `handleJsxExpression` (compiler jsx.ts) → "child updates" fails with the
 * frozen value while "attr updates" still passes; restore → green.
 */
import { transformJSX } from '@pyreon/compiler'
import { transformSync } from 'esbuild'
import { Fragment, h, _rp, cx } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { _tpl, _bindText, _bindDirect, _mountSlot, _setChild, _setChildAt } from '../template'
import { _applyProps, _setAttr, _setStyle, bindPolymorphicText, mountChild } from '../index'

function stripImports(code: string): string {
  return code.replace(/^import\s+.*$/gm, '').trim()
}

function lowerResidualTsx(code: string): string {
  return transformSync(code, {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
}

const RUNTIME_DEPS = {
  _tpl,
  _bind,
  _bindText,
  _bindDirect,
  _applyProps,
  _setStyle,
  _setAttr,
  _mountSlot,
  _setChild,
  _setChildAt,
  bindPolymorphicText,
  _rp,
  _cx: cx,
  h,
  Fragment,
  signal,
  document,
} as const

const DEP_NAMES = Object.keys(RUNTIME_DEPS)
const DEP_VALUES = Object.values(RUNTIME_DEPS)

/** Compile SOURCE (must define `App`) with the REAL transform (client or SSR). */
function compileApp(
  source: string,
  globals: Record<string, unknown>,
  opts?: { ssr?: boolean },
): () => unknown {
  const { code } = transformJSX(source, 'test.tsx', opts?.ssr ? { ssr: true } : undefined)
  const body = lowerResidualTsx(stripImports(code).replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)
  return fn(...DEP_VALUES, ...Object.values(globals)) as () => unknown
}

// The issue's exact shape, one level deeper so the middle component's
// props are genuine compiler-emitted reactive props:
//   App (owns the signal) → Mid (the #2348 shape) → Heading (renders both)
const SOURCE = `
  const Heading = (props) => <h1><em data-part="attr">{props.label}</em><span data-part="child">{props.children}</span></h1>
  const Mid = (props) => <Heading label={props.title}>{props.title}</Heading>
  const App = () => <div><Mid title={title()} /></div>
`

describe('#2348 — component-child {props.x} is LIVE (compiled, real transform)', () => {
  it('flipping the source signal updates the ATTR and the CHILD identically', () => {
    const title = signal('first')
    const App = compileApp(SOURCE, { title })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const cleanup = mountChild(h(App as never, null), container) ?? (() => {})
    try {
      const attr = container.querySelector('[data-part="attr"]')!
      const child = container.querySelector('[data-part="child"]')!
      expect(attr.textContent).toBe('first')
      expect(child.textContent).toBe('first')

      title.set('second')

      expect(attr.textContent, 'attr path (always live)').toBe('second')
      // THE #2348 assertion — pre-fix this stayed 'first' (frozen) while
      // the attr above updated: the counter-intuitive split the issue names.
      expect(child.textContent, 'child path (frozen pre-#2348)').toBe('second')
    } finally {
      cleanup()
      container.remove()
    }
  })

  it('SSR renders the same initial content as the client mount (parity)', async () => {
    const title = signal('ssr-value')
    const App = compileApp(SOURCE, { title }, { ssr: true })
    const html = await renderToString(h(App as never, null) as never)
    const text = html.replace(/<!--[\s\S]*?-->/g, '')
    expect(text).toContain('ssr-value')
    // both the attr span and the child span carry the value
    expect(text.match(/ssr-value/g)?.length).toBeGreaterThanOrEqual(2)
  })
})
