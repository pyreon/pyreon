/**
 * PZ-08 runtime regression — a reactive/conditional slot BEFORE static
 * siblings must not break the compiled template's sibling ref-walk.
 *
 * Every spec compiles REAL JSX source through `transformJSX` (the actual
 * `@pyreon/compiler` client transform — not vitest's JSX transform, which
 * masks template-codegen bugs; see anti-patterns "the flow package's
 * vitest-browser tests use a JSX transform that does NOT match the real
 * compiler") and mounts the emitted `_tpl` code.
 *
 * Pre-fix failure modes locked here:
 *  1. `_setStyle(__e0, …)` where `__e0 = __root.firstChild.nextSibling` was
 *     evaluated AFTER `_mountSlot` mutated the child list → __e0 is the
 *     slot's `<!--pyreon-->` marker comment → TypeError (reading
 *     'setProperty' / style of a Comment).
 *  2. Falsy STATIC conditional (`{show && <em/>}`, show=false): `_mountSlot`
 *     removes the placeholder outright → the sibling walk overshoots to
 *     null → TypeError on `setAttribute`.
 *  3. TWO adjacent slots, first initially truthy: the second slot's inline
 *     placeholder walk resolved to the FIRST slot's reactive marker, which
 *     `_mountSlot` then removeChild()d — slot 0's next falsy→truthy re-flip
 *     crashed `insertBefore` against the detached marker and SILENTLY LOST
 *     the subtree (works on single flips — only the double flip fires it).
 *
 * Fix: the compiler hoists ALL pristine-clone node captures (element walks,
 * text captures, placeholder consts) ABOVE any `_mountSlot`/`replaceChild`
 * mutation — phase-1 `refLines` / phase-2 `bindLines`.
 */
import { transformJSX } from '@pyreon/compiler'
import { transformSync } from 'esbuild'
import { Fragment, h, _rp, cx } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { _tpl, _bindText, _bindDirect, _mountSlot } from '../template'
import {
  _applyProps,
  _setStyle,
  disableHydrationWarnings,
  hydrateRoot,
  mountChild,
} from '../index'

const strip = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')

function stripImports(code: string): string {
  return code.replace(/^import\s+.*$/gm, '').trim()
}

/**
 * The Pyreon transform leaves JSX INSIDE slot accessors for the downstream
 * bundler pass (production: Vite's esbuild step with the @pyreon/core JSX
 * runtime). Lower that residual JSX to `h()` calls so `new Function` can
 * evaluate the emitted body.
 */
function lowerResidualJsx(code: string): string {
  return transformSync(code, {
    loader: 'jsx',
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
  _mountSlot,
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
 * and return the container. console.error is captured into `errors` for
 * the caller to assert on (the reactive re-flip failure surfaces as an
 * unhandled effect error, not a synchronous throw).
 */
function compileMountComponent(
  source: string,
  globals: Record<string, unknown>,
  errors: unknown[],
): { container: HTMLDivElement; cleanup: () => void } {
  const { code } = transformJSX(source, 'test.tsx')
  const body = lowerResidualJsx(stripImports(code).replace(/^export\s+/gm, ''))
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
  return { container, cleanup }
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

describe('PZ-08 — slot before static siblings (compiled, real transform)', () => {
  it('reactive ternary slot before a styled sibling: style lands on the RIGHT div, both states', () => {
    for (const initial of [true, false]) {
      const banner = signal(initial)
      const errors: unknown[] = []
      const { container, cleanup } = compileMountComponent(
        `
export function App() {
  return <div>{banner() ? <b>on</b> : <span>off</span>}<div style={styles.card}>card content</div></div>
}
`,
        { banner, styles: { card: { color: 'red' } } },
        errors,
      )
      expect(errors, `initial=${initial}: mount errors`).toEqual([])
      // container IS a div, so `div > div` would match the template root —
      // grab the card as the root's LAST element child explicitly.
      const card = container.firstElementChild!.lastElementChild as HTMLDivElement
      expect(card, `initial=${initial}: card div exists`).not.toBeNull()
      expect(card.textContent, `initial=${initial}`).toBe('card content')
      expect(card.style.color, `initial=${initial}: style on the right node`).toBe('red')
      expect(strip(container.innerHTML), `initial=${initial}: full DOM`).toBe(
        `<div>${initial ? '<b>on</b>' : '<span>off</span>'}<div style="color: red;">card content</div></div>`,
      )
      // Flip — the slot swaps in place; the sibling is untouched.
      capturingErrors(errors, () => banner.set(!initial))
      expect(errors, `initial=${initial}: flip errors`).toEqual([])
      expect(strip(container.innerHTML), `initial=${initial}: post-flip DOM`).toBe(
        `<div>${initial ? '<span>off</span>' : '<b>on</b>'}<div style="color: red;">card content</div></div>`,
      )
      cleanup()
    }
  })

  it('falsy STATIC conditional before an attr-bearing sibling: no null-deref, attr lands', () => {
    const errors: unknown[] = []
    const { container, cleanup } = compileMountComponent(
      `
const show = false
export function App() {
  return <div>{show && <em>x</em>}<div id={"a" + "b"}>after</div></div>
}
`,
      {},
      errors,
    )
    expect(errors, 'mount errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div><div id="ab">after</div></div>')
    cleanup()
  })

  it('reactive slot before a reactive-text sibling: text binds to the RIGHT node', () => {
    const conds = signal(true)
    const zoom = signal(1)
    const errors: unknown[] = []
    const { container, cleanup } = compileMountComponent(
      `
export function App() {
  return <div>{conds() && <button>b</button>}<div>{zoom()}</div></div>
}
`,
      { conds, zoom },
      errors,
    )
    expect(errors, 'mount errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div><button>b</button><div>1</div></div>')
    capturingErrors(errors, () => zoom.set(42))
    expect(errors, 'zoom update errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div><button>b</button><div>42</div></div>')
    cleanup()
  })

  // The coordinator-verified PZ-04 shape: two adjacent slots, slot 0
  // initially TRUTHY. Pre-fix, slot 1's inline placeholder walk resolved to
  // slot 0's reactive marker and _mountSlot REMOVED it; slot 0's next
  // falsy→truthy re-flip then threw insertBefore against the detached
  // marker (unhandled effect error) and the subtree was silently lost.
  // Single flips are accidentally correct — the DOUBLE flip is load-bearing.
  it('two adjacent slots, slot0 truthy→false→TRUE double-flip: no error, position preserved (client mount)', () => {
    const loading = signal(true)
    const items = signal([1])
    const errors: unknown[] = []
    const { container, cleanup } = compileMountComponent(
      `
export function App() {
  return <div>{loading() && <span class="spinner">spin</span>}{items().length && <span class="list">list</span>}<p>after</p></div>
}
`,
      { loading, items },
      errors,
    )
    expect(errors, 'mount errors').toEqual([])
    expect(strip(container.innerHTML), 'initial').toBe(
      '<div><span class="spinner">spin</span><span class="list">list</span><p>after</p></div>',
    )
    capturingErrors(errors, () => loading.set(false))
    expect(errors, 'true→false errors').toEqual([])
    expect(strip(container.innerHTML), 'after true→false').toBe(
      '<div><span class="list">list</span><p>after</p></div>',
    )
    capturingErrors(errors, () => loading.set(true))
    expect(errors, 'false→TRUE re-flip errors').toEqual([])
    expect(strip(container.innerHTML), 'after false→TRUE re-flip (position!)').toBe(
      '<div><span class="spinner">spin</span><span class="list">list</span><p>after</p></div>',
    )
    // And the second slot still works too.
    capturingErrors(errors, () => items.set([]))
    expect(errors, 'items flip errors').toEqual([])
    expect(strip(container.innerHTML), 'after items → []').toBe(
      '<div><span class="spinner">spin</span>0<p>after</p></div>',
    )
    cleanup()
  })

  it('two adjacent slots double-flip: SSR → hydrate variant', async () => {
    disableHydrationWarnings()
    const loading = signal(true)
    const items = signal([1])
    // SSR side: the h()-composed equivalent of the SSR transform output
    // (`{() => loading() && <span/>}{() => items().length && <span/>}<p/>`).
    const ssrTree = h(
      'div',
      null,
      (() => loading() && h('span', { class: 'spinner' }, 'spin')) as never,
      (() => items().length && h('span', { class: 'list' }, 'list')) as never,
      h('p', null, 'after'),
    )
    const html = await renderToString(ssrTree as never)
    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = html

    // Client side: the REAL compiled output.
    const { code } = transformJSX(
      `
export function App() {
  return <div>{loading() && <span class="spinner">spin</span>}{items().length && <span class="list">list</span>}<p>after</p></div>
}
`,
      'test.tsx',
    )
    const body = lowerResidualJsx(stripImports(code).replace(/^export\s+/gm, ''))
    const fn = new Function(...DEP_NAMES, 'loading', 'items', `${body}\nreturn App`)
    const App = fn(...DEP_VALUES, loading, items) as () => unknown

    const errors: unknown[] = []
    capturingErrors(errors, () => {
      hydrateRoot(container, h(App as never, null))
    })
    expect(errors, 'hydration errors').toEqual([])
    expect(strip(container.innerHTML), 'post-hydrate').toBe(
      '<div><span class="spinner">spin</span><span class="list">list</span><p>after</p></div>',
    )
    capturingErrors(errors, () => loading.set(false))
    expect(errors, 'true→false errors').toEqual([])
    capturingErrors(errors, () => loading.set(true))
    expect(errors, 'false→TRUE re-flip errors').toEqual([])
    expect(strip(container.innerHTML), 'after false→TRUE re-flip (position!)').toBe(
      '<div><span class="spinner">spin</span><span class="list">list</span><p>after</p></div>',
    )
  })
})
