/**
 * PZ-02 (single-signal fast path) regression — `_bindText` VNode upgrade.
 *
 * A signal whose VALUE is a VNode / NativeItem / VNode[] bound as JSX text
 * used to String()-coerce to "[object Object]": the compiler's single-signal
 * fast path (`tryDirectSignalRef`) routes `{sig()}`, `{() => sig()}` AND
 * no-arg helper calls `{helper()}` to `_bindText` — which was text-only.
 * The 0.42.0 `bindPolymorphicText` fixed the GENERAL reactive-text path;
 * this suite locks the fast-path fix: on the first VNode-shaped value the
 * binding permanently upgrades to a subtree mount (swap core shared with
 * `bindPolymorphicText`), while string/number-only bindings keep the raw
 * `.data` write path untouched.
 *
 * Every spec compiles REAL JSX source through `transformJSX` (the actual
 * `@pyreon/compiler` client transform — not vitest's JSX transform, which
 * masks template-codegen bugs) and mounts the emitted `_tpl` code.
 */
import { transformJSX } from '@pyreon/compiler'
import { transformSync } from 'esbuild'
import { createContext, Fragment, h, provide, useContext, _rp, cx } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { _tpl, _bindText, _bindDirect, _mountSlot, _setChild, _setChildAt } from '../template'
import {
  _applyProps,
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

describe('_bindText VNode upgrade — direct-signal fast path (compiled, real transform)', () => {
  it('{sig()} with a VNode value MOUNTS the subtree, swaps, and returns to text', () => {
    const node = signal<unknown>(h('b', null, 'hi'))
    const errors: unknown[] = []
    const { container, cleanup, code } = compileMountComponent(
      `
export function App() {
  return <div>{node()}</div>
}
`,
      { node },
      errors,
    )
    // Lock the routing: this shape must stay on the `_bindText` fast path —
    // the fix is a RUNTIME upgrade, not a compiler reroute.
    expect(code).toContain('_bindText(node,')
    expect(errors, 'mount errors').toEqual([])
    // Pre-fix: <div>[object Object]</div>.
    expect(strip(container.innerHTML)).toBe('<div><b>hi</b></div>')
    expect(container.innerHTML).not.toContain('[object Object]')

    // VNode → VNode swap goes through the polymorphic path.
    capturingErrors(errors, () => node.set(h('i', null, 'bye')))
    expect(errors, 'swap errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div><i>bye</i></div>')

    // VNode → STRING restores the text binding.
    capturingErrors(errors, () => node.set('plain'))
    expect(errors, 'to-string errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div>plain</div>')

    // STRING → VNode again (the binding stays permanently polymorphic).
    capturingErrors(errors, () => node.set(h('u', null, 'again')))
    expect(errors, 're-upgrade errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div><u>again</u></div>')
    cleanup()
    expect(strip(container.innerHTML), 'cleanup removes the subtree').toBe('')
  })

  it('{() => sig()} takes the SAME fast path and mounts (the stale escape-hatch claim)', () => {
    const node = signal<unknown>(h('b', null, 'hi'))
    const errors: unknown[] = []
    const { container, cleanup, code } = compileMountComponent(
      `
export function App() {
  return <div>{() => node()}</div>
}
`,
      { node },
      errors,
    )
    // The accessor form does NOT avoid the fast path — same `_bindText` emit.
    expect(code).toContain('_bindText(node,')
    expect(errors, 'mount errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div><b>hi</b></div>')
    capturingErrors(errors, () => node.set('text'))
    expect(errors, 'update errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div>text</div>')
    cleanup()
  })

  it('string-first binding upgrades on a LATER VNode set (unsub-during-dispatch) and restores', () => {
    const node = signal<unknown>('plain')
    const errors: unknown[] = []
    const { container, cleanup } = compileMountComponent(
      `
export function App() {
  return <div>{node()}</div>
}
`,
      { node },
      errors,
    )
    expect(errors, 'mount errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div>plain</div>')
    // String → string stays on the raw .data path.
    capturingErrors(errors, () => node.set('still text'))
    expect(strip(container.innerHTML)).toBe('<div>still text</div>')
    // LATER upgrade: the direct subscriber is swapped mid-dispatch.
    capturingErrors(errors, () => node.set(h('b', null, 'up')))
    expect(errors, 'upgrade errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div><b>up</b></div>')
    capturingErrors(errors, () => node.set('back'))
    expect(errors, 'restore errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div>back</div>')
    // Subsequent string updates still render (the polymorphic path owns them now).
    capturingErrors(errors, () => node.set('final'))
    expect(strip(container.innerHTML)).toBe('<div>final</div>')
    cleanup()
    expect(strip(container.innerHTML), 'cleanup removes the text').toBe('')
  })

  it('VNode[] value mounts every element', () => {
    const items = signal<unknown>([h('li', null, 'a'), h('li', null, 'b')])
    const errors: unknown[] = []
    const { container, cleanup } = compileMountComponent(
      `
export function App() {
  return <ul>{items()}</ul>
}
`,
      { items },
      errors,
    )
    expect(errors, 'mount errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<ul><li>a</li><li>b</li></ul>')
    capturingErrors(errors, () => items.set([h('li', null, 'x')]))
    expect(errors, 'swap errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<ul><li>x</li></ul>')
    cleanup()
  })

  it('mixed content keeps static siblings intact across upgrade + downgrade', () => {
    const node = signal<unknown>('mid')
    const errors: unknown[] = []
    const { container, cleanup } = compileMountComponent(
      `
export function App() {
  return <div>x{node()}y</div>
}
`,
      { node },
      errors,
    )
    expect(errors, 'mount errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div>xmidy</div>')
    capturingErrors(errors, () => node.set(h('b', null, 'M')))
    expect(errors, 'upgrade errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div>x<b>M</b>y</div>')
    capturingErrors(errors, () => node.set('m2'))
    expect(errors, 'downgrade errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div>xm2y</div>')
    cleanup()
  })

  it('in-file signal(<b>hi</b>) — a NativeItem value — mounts and survives a text round-trip', () => {
    const errors: unknown[] = []
    const { container, cleanup, code } = compileMountComponent(
      `
const node = signal(<b>hi</b>)
export function App() {
  return <div>{node()}</div>
}
`,
      {},
      errors,
    )
    expect(code).toContain('_bindText(node,')
    expect(errors, 'mount errors').toEqual([])
    // Pre-fix: <div>[object Object]</div> (a `_tpl()` NativeItem stringified).
    expect(strip(container.innerHTML)).toBe('<div><b>hi</b></div>')
    cleanup()
    expect(strip(container.innerHTML)).toBe('')
  })

  it('an upgrade at a LATER set mounts context-consuming components under the SETUP owner', () => {
    // The mounted VNode reads a context provided by App's OWN setup frame.
    // The upgrade happens inside a signal dispatch (no ambient owner), so
    // this only renders 'VAL' if _bindText captured the owner at setup —
    // the anti-patterns "captured context owner for re-runs" discipline.
    const Ctx = createContext<string>('DEFAULT')
    const Reader = () => useContext(Ctx)
    const node = signal<unknown>('plain')
    const errors: unknown[] = []
    const { container, cleanup } = compileMountComponent(
      `
export function App() {
  provide(Ctx, 'VAL')
  return <div>{node()}</div>
}
`,
      { node, provide, Ctx },
      errors,
    )
    expect(errors, 'mount errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div>plain</div>')
    capturingErrors(errors, () => node.set(h(Reader as never, null)))
    expect(errors, 'upgrade errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div>VAL</div>')
    cleanup()
  })

  it('non-VNode objects and plain string arrays keep the historical String() coercion', () => {
    // Scope guard: the upgrade discriminator matches _setChild's — only
    // VNode/NativeItem-bearing values mount. Plain objects/arrays stringify
    // exactly as before (documented gap, consistent with the static path).
    const obj = signal<unknown>({ a: 1 })
    const errors: unknown[] = []
    const warns: unknown[] = []
    const origWarn = console.warn
    console.warn = (...args: unknown[]) => warns.push(args)
    try {
      const { container, cleanup } = compileMountComponent(
        `
export function App() {
  return <div>{obj()}</div>
}
`,
        { obj },
        errors,
      )
      expect(errors, 'mount errors').toEqual([])
      expect(strip(container.innerHTML)).toBe('<div>[object Object]</div>')
      capturingErrors(errors, () => obj.set(['a', 'b']))
      expect(strip(container.innerHTML)).toBe('<div>a,b</div>')
      cleanup()
    } finally {
      console.warn = origWarn
    }
  })
})

describe('_bindText VNode upgrade — bare-callable fallback path ({helper()}, cross-file shape)', () => {
  it('{helper()} returning a VNode mounts and re-renders reactively', () => {
    // `helper` is a GLOBAL (cross-file shape) — the compiler cannot see its
    // body, so `{helper()}` stays on the `_bindText` fallback (renderEffect)
    // path. Pre-fix: "[object Object]"; `{helper(arg)}` mounted correctly —
    // the inconsistency this fix removes.
    const label = signal('one')
    const helper = () => h('b', null, label())
    const errors: unknown[] = []
    const { container, cleanup, code } = compileMountComponent(
      `
export function App() {
  return <div>{helper()}</div>
}
`,
      { helper },
      errors,
    )
    expect(code).toContain('_bindText(helper,')
    expect(errors, 'mount errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div><b>one</b></div>')
    expect(container.innerHTML).not.toContain('[object Object]')
    // The fallback renderEffect tracked label() — a set re-runs the helper
    // and the upgraded binding re-mounts the fresh VNode.
    capturingErrors(errors, () => label.set('two'))
    expect(errors, 'update errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div><b>two</b></div>')
    cleanup()
    expect(strip(container.innerHTML), 'cleanup removes the subtree').toBe('')
  })

  it('{helper()} flipping string → VNode → string swaps both ways', () => {
    const mode = signal<'text' | 'node'>('text')
    const helper = () => (mode() === 'node' ? h('b', null, 'N') : 'T')
    const errors: unknown[] = []
    const { container, cleanup } = compileMountComponent(
      `
export function App() {
  return <div>{helper()}</div>
}
`,
      { helper },
      errors,
    )
    expect(errors, 'mount errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div>T</div>')
    capturingErrors(errors, () => mode.set('node'))
    expect(errors, 'upgrade errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div><b>N</b></div>')
    capturingErrors(errors, () => mode.set('text'))
    expect(errors, 'downgrade errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div>T</div>')
    cleanup()
  })
})

describe('_bindText VNode upgrade — SSR → hydrate parity', () => {
  it('SSR renders the subtree; the hydrated compiled client now matches (no [object Object])', async () => {
    // SSR side: the SSR transform leaves `{sig()}` as an accessor child —
    // the server CALLS it and renders the returned VNode (always worked).
    const node = signal<unknown>(h('b', null, 'hi'))
    const ssrTree = h('div', null, (() => node()) as never)
    const html = await renderToString(ssrTree as never)
    expect(strip(html)).toBe('<div><b>hi</b></div>')

    const container = document.createElement('div')
    document.body.appendChild(container)
    container.innerHTML = html

    // Client side: the REAL compiled output — `_bindText` fast path.
    const full = transformJSX(
      `
export function App() {
  return <div>{node()}</div>
}
`,
      'test.tsx',
    )
    expect(full.code).toContain('_bindText(node,')
    const body = lowerResidualTsx(stripImports(full.code).replace(/^export\s+/gm, ''))
    const fn = new Function(...DEP_NAMES, 'node', `${body}\nreturn App`)
    const App = fn(...DEP_VALUES, node) as () => unknown

    const mismatches: unknown[] = []
    const offMismatch = onHydrationMismatch((ctx) => mismatches.push(ctx))
    const errors: unknown[] = []
    capturingErrors(errors, () => {
      hydrateRoot(container, h(App as never, null))
    })
    offMismatch()
    expect(errors, 'hydration errors').toEqual([])
    expect(mismatches, 'hydration mismatches').toEqual([])
    // Pre-fix the client bound "[object Object]" TEXT where SSR had <b>.
    expect(strip(container.innerHTML), 'post-hydrate').toBe('<div><b>hi</b></div>')
    expect(container.innerHTML).not.toContain('[object Object]')
    // Reactivity survives hydration — swap to text and back.
    capturingErrors(errors, () => node.set('done'))
    expect(errors, 'post-hydrate update errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div>done</div>')
    capturingErrors(errors, () => node.set(h('i', null, 're')))
    expect(errors, 'post-hydrate re-upgrade errors').toEqual([])
    expect(strip(container.innerHTML)).toBe('<div><i>re</i></div>')
  })
})
