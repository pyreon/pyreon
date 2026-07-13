/**
 * PZ-05 + PZ-02 runtime regression — template child/attr classification.
 *
 * Every spec compiles REAL JSX source through `transformJSX` (the actual
 * `@pyreon/compiler` client transform — not vitest's JSX transform, which
 * masks template-codegen bugs) and mounts the emitted `_tpl` code.
 *
 * PZ-05 — TS type-only layers (`as` / `satisfies` / `!`) and parens were
 * OPAQUE to the template classifier: `{(() => name()) as never}` /
 * `{(() => name())}` fell through to the STATIC bake arm and rendered the
 * function SOURCE as literal text (`textContent = (() => name())`); the
 * attr form setAttribute'd the source string. Post-fix the wrapped forms
 * compile byte-identically to the bare forms — live bindings.
 *
 * PZ-02 — a call to an in-file JSX-returning helper (`{cell(x)}`) was
 * classified as reactive TEXT (`_bind(() => { __t0.data = cell(x) })`) →
 * "[object Object]" in the DOM. SSR mounted the shape correctly, so the
 * client fix ALSO removes a guaranteed SSR↔client hydration mismatch.
 * Post-fix the call routes through `_mountSlot(() => (cell(x)), …)`.
 *
 * Sources are lowered with esbuild `loader: 'tsx'` after the Pyreon
 * transform (erases the TS casts under test + lowers residual JSX to `h()`)
 * so `new Function` can evaluate the emitted body — the same downstream
 * step Vite's esbuild pass performs in production.
 */
import { transformJSX } from '@pyreon/compiler'
import { transformSync } from 'esbuild'
import { Fragment, h, _rp, cx } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { _tpl, _bindText, _bindDirect, _mountSlot, _setChild, _setChildAt } from '../template'
import {
  _applyProps,
  _setAttr,
  _setStyle,
  bindPolymorphicText,
  hydrateRoot,
  mountChild,
  onHydrationMismatch,
} from '../index'

const strip = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')

function stripImports(code: string): string {
  return code.replace(/^import\s+.*$/gm, '').trim()
}

/**
 * Lower the Pyreon transform's residual TS/JSX (casts under test, JSX left
 * for the bundler) to executable JS — the production pipeline's esbuild step.
 */
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

/**
 * Compile a component SOURCE (must define `App`) with the real client
 * transform, evaluate it with runtime deps + test globals, mount `App`,
 * and return the container. console.error is captured into `errors`.
 */
function compileMountComponent(
  source: string,
  globals: Record<string, unknown>,
  errors: unknown[],
): { container: HTMLDivElement; cleanup: () => void; code: string } {
  const { code } = transformJSX(source, 'test.tsx')
  const body = lowerResidualTsx(stripImports(code).replace(/^export\s+/gm, ''))
  const fn = new Function(...DEP_NAMES, ...Object.keys(globals), `${body}\nreturn App`)
  const App = fn(...DEP_VALUES, ...Object.values(globals)) as () => unknown
  const container = document.createElement('div')
  document.body.appendChild(container)
  const origError = console.error
  console.error = (...args: unknown[]) => {
    errors.push(args)
  }
  let cleanup: () => void = () => {}
  try {
    cleanup = mountChild(h(App as never, null), container) ?? (() => {})
  } catch (err) {
    errors.push(err)
  } finally {
    console.error = origError
  }
  return { container, cleanup, code }
}

/** Run `fn` with console.error captured into `errors`. */
function capturingErrors(errors: unknown[], fn: () => void): void {
  const origError = console.error
  console.error = (...args: unknown[]) => {
    errors.push(args)
  }
  try {
    fn()
  } catch (err) {
    errors.push(err)
  } finally {
    console.error = origError
  }
}

describe('PZ-05 — TS-cast/paren-wrapped accessors render LIVE (compiled, real transform)', () => {
  it('paren-wrapped accessor child renders live text and updates on signal set', () => {
    // Parens alone reproduce the bug class in pure JS — same unwrap loop
    // handles parens + TS casts, so this spec is load-bearing for the seam.
    const name = signal('alice')
    const errors: unknown[] = []
    const { container, cleanup } = compileMountComponent(
      `
export function App() {
  return <div>{(() => name())}</div>
}
`,
      { name },
      errors,
    )
    expect(errors, 'mount errors').toEqual([])
    // Pre-fix: textContent = the function SOURCE ("() => name()").
    expect(strip(container.innerHTML)).toBe('<div>alice</div>')
    capturingErrors(errors, () => name.set('bob'))
    expect(errors, 'update errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div>bob</div>')
    cleanup()
  })

  it('cast accessor child (as never) renders live text and updates', () => {
    const name = signal('alice')
    const errors: unknown[] = []
    const { container, cleanup } = compileMountComponent(
      `
export function App() {
  return <div>{(() => name()) as never}</div>
}
`,
      { name },
      errors,
    )
    expect(errors, 'mount errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div>alice</div>')
    capturingErrors(errors, () => name.set('bob'))
    expect(errors, 'update errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div>bob</div>')
    cleanup()
  })

  it('cast accessor ATTR (as never) binds live and updates', () => {
    const tip = signal('first')
    const errors: unknown[] = []
    const { container, cleanup } = compileMountComponent(
      `
export function App() {
  return <div title={(() => tip()) as never}>hi</div>
}
`,
      { tip },
      errors,
    )
    expect(errors, 'mount errors').toEqual([])
    const el = container.firstElementChild as HTMLDivElement
    // Pre-fix: title = the function SOURCE string.
    expect(el.getAttribute('title')).toBe('first')
    capturingErrors(errors, () => tip.set('second'))
    expect(errors, 'update errors').toEqual([])
    expect(el.getAttribute('title')).toBe('second')
    cleanup()
  })
})

describe('PZ-02 — JSX-returning local-helper calls MOUNT (compiled, real transform)', () => {
  it('{cell(x)} mounts the returned element — no "[object Object]"', () => {
    const errors: unknown[] = []
    const { container, cleanup } = compileMountComponent(
      `
const cell = (v: string) => <b>{v}</b>
export function App() {
  return <td>{cell('active')}</td>
}
`,
      {},
      errors,
    )
    expect(errors, 'mount errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<td><b>active</b></td>')
    expect(container.innerHTML).not.toContain('[object Object]')
    cleanup()
  })

  it('reactive arg re-renders the mounted slot on signal set', () => {
    const status = signal('todo')
    const errors: unknown[] = []
    const { container, cleanup } = compileMountComponent(
      `
const cell = (v: string) => <b>{v}</b>
export function App() {
  return <td>{cell(status())}</td>
}
`,
      { status },
      errors,
    )
    expect(errors, 'mount errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<td><b>todo</b></td>')
    capturingErrors(errors, () => status.set('done'))
    expect(errors, 'update errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<td><b>done</b></td>')
    cleanup()
  })

  it('conditional string|VNode helper renders BOTH branches across a flip', () => {
    const label = signal('x')
    const errors: unknown[] = []
    const { container, cleanup } = compileMountComponent(
      `
const cell = (v: string) => v !== 'none' ? <b>{v}</b> : 'empty'
export function App() {
  return <td>{cell(label())}</td>
}
`,
      { label },
      errors,
    )
    expect(errors, 'mount errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<td><b>x</b></td>')
    capturingErrors(errors, () => label.set('none'))
    expect(errors, 'flip errors').toEqual([])
    // String return renders as TEXT — _mountSlot/mountChild handles both.
    expect(strip(container.innerHTML)).toBe('<td>empty</td>')
    capturingErrors(errors, () => label.set('y'))
    expect(errors, 're-flip errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<td><b>y</b></td>')
    cleanup()
  })

  it('SSR → hydrate parity: SSR mounts the helper, client now matches (no mismatch)', async () => {
    // SSR side: the h()-composed equivalent of the SSR transform output
    // (`<div>{() => cell(s())}</div>` — the SSR renderer CALLS the accessor
    // and mounts the returned VNode; this always worked). A `<div>` parent
    // (not `<td>`) because the spec's own `container.innerHTML = html` step
    // parses in body context, where a bare `<td>` is dropped by the HTML
    // parser (foster-parenting) — a test-harness artifact, not a framework
    // shape.
    const s = signal('active')
    const cell = (v: string) => h('b', null, v)
    const ssrTree = h('div', null, (() => cell(s())) as never)
    const html = await renderToString(ssrTree as never)
    expect(strip(html)).toBe('<div><b>active</b></div>')

    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = html

    // Client side: the REAL compiled output (post-fix: _mountSlot route).
    // The helper must be IN-FILE for the routing — compile the full module.
    const full = transformJSX(
      `
const cell = (v: string) => <b>{v}</b>
export function App() {
  return <div>{cell(s())}</div>
}
`,
      'test.tsx',
    )
    expect(full.code).toContain('_mountSlot(() => (cell(s()))')
    const body = lowerResidualTsx(stripImports(full.code).replace(/^export\s+/gm, ''))
    const fn = new Function(...DEP_NAMES, 's', `${body}\nreturn App`)
    const App = fn(...DEP_VALUES, s) as () => unknown

    const mismatches: unknown[] = []
    const offMismatch = onHydrationMismatch((ctx) => {
      mismatches.push(ctx)
    })
    const errors: unknown[] = []
    capturingErrors(errors, () => {
      hydrateRoot(container, h(App as never, null))
    })
    offMismatch()
    expect(errors, 'hydration errors').toEqual([])
    expect(mismatches, 'hydration mismatches').toEqual([])
    // Pre-fix the client bound "[object Object]" TEXT where SSR had <b>.
    expect(strip(container.innerHTML), 'post-hydrate').toBe('<div><b>active</b></div>')
    expect(container.innerHTML).not.toContain('[object Object]')
    // Reactivity survives hydration — the slot re-renders on signal set.
    capturingErrors(errors, () => s.set('done'))
    expect(errors, 'post-hydrate update errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div><b>done</b></div>')
  })

  it('SSR → hydrate parity: a STATIC {items} VNode[] child mounts without DUPLICATING the SSR nodes', async () => {
    // The duplication-risk case: `_setChild(el, items)` calls mountChild which
    // APPENDS. During hydration the SSR `<ul>` already holds the `<li>` nodes,
    // so a naive append would double them. `_tpl` hydration REPLACES the SSR
    // subtree with the fresh mount (no adopt), so the count must stay exact.
    const items = [h('li', null, 'a'), h('li', null, 'b'), h('li', null, 'c')]
    const ssrTree = h('ul', null, items)
    const html = await renderToString(ssrTree as never)
    expect(strip(html)).toBe('<ul><li>a</li><li>b</li><li>c</li></ul>')

    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = html

    const full = transformJSX(
      `export function App({ items }) { return <ul>{items}</ul> }`,
      'test.tsx',
    )
    expect(full.code).toContain('_setChild(')
    const body = lowerResidualTsx(stripImports(full.code).replace(/^export\s+/gm, ''))
    const fn = new Function(...DEP_NAMES, 'items', `${body}\nreturn App`)
    const App = fn(...DEP_VALUES, items) as (p: unknown) => unknown

    const mismatches: unknown[] = []
    const offMismatch = onHydrationMismatch((ctx) => mismatches.push(ctx))
    const errors: unknown[] = []
    capturingErrors(errors, () => {
      hydrateRoot(container, h(App as never, { items }))
    })
    offMismatch()
    expect(errors, 'hydration errors').toEqual([])
    expect(mismatches, 'hydration mismatches').toEqual([])
    // EXACT count — 3, not 6 (no duplication of the SSR-rendered nodes).
    expect(container.querySelectorAll('li').length, 'no duplication').toBe(3)
    expect(strip(container.innerHTML), 'post-hydrate DOM matches SSR').toBe(
      '<ul><li>a</li><li>b</li><li>c</li></ul>',
    )
    expect(container.innerHTML).not.toContain('[object Object]')
  })

  it('SSR → hydrate parity: a REACTIVE {props.items} VNode[] child matches SSR + swaps', async () => {
    const items = signal([h('li', null, 'x'), h('li', null, 'y')])
    // SSR renders the accessor-called array (the h()-composed SSR shape).
    const ssrTree = h('ul', null, (() => items()) as never)
    const html = await renderToString(ssrTree as never)
    expect(strip(html)).toBe('<ul><li>x</li><li>y</li></ul>')

    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = html

    const full = transformJSX(
      `export function App(props) { return <ul>{props.items}</ul> }`,
      'test.tsx',
    )
    expect(full.code).toContain('bindPolymorphicText(')
    const body = lowerResidualTsx(stripImports(full.code).replace(/^export\s+/gm, ''))
    const fn = new Function(...DEP_NAMES, `${body}\nreturn App`)
    const App = fn(...DEP_VALUES) as (p: unknown) => unknown

    const mismatches: unknown[] = []
    const offMismatch = onHydrationMismatch((ctx) => mismatches.push(ctx))
    const errors: unknown[] = []
    capturingErrors(errors, () => {
      hydrateRoot(container, h(App as never, { items }))
    })
    offMismatch()
    expect(errors, 'hydration errors').toEqual([])
    expect(mismatches, 'hydration mismatches').toEqual([])
    expect(container.querySelectorAll('li').length, 'no duplication').toBe(2)
    expect(strip(container.innerHTML)).toBe('<ul><li>x</li><li>y</li></ul>')

    capturingErrors(errors, () =>
      items.set([h('li', null, 'p'), h('li', null, 'q'), h('li', null, 'r')]),
    )
    expect(errors, 'post-hydrate update errors').toEqual([])
    expect(container.querySelectorAll('li').length).toBe(3)
    expect(strip(container.innerHTML)).toBe('<ul><li>p</li><li>q</li><li>r</li></ul>')
  })
})
