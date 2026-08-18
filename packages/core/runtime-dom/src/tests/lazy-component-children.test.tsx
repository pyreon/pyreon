/**
 * Lazy component children — a component's SOLE JSX child is built when the
 * component READS `props.children`, not when the `jsx(Comp, …)` argument is
 * evaluated.
 *
 * The bug this fixes, verbatim from a pre-fix run of the first spec below:
 *
 *   <Provider><div class="k">{readCtx()}</div></Provider>
 *     client       → <div class="k">DEFAULT</div>     ← wrong
 *     SSR          → <div class="k">PROVIDED</div>    ← right
 *     SSR+ssrTemplate → <div class="k">DEFAULT</div>  ← wrong
 *
 * `_tpl(html, bind)` / `_ssr([…], …)` are ARGUMENTS of the call that receives
 * them, so they run before `Provider`'s body — before its `provide()`. Every
 * binding the template creates snapshots the active context owner at
 * construction (`renderEffect` captures it there), so the whole element child
 * resolved context against the WRONG owner. `ssrTemplate` is default-on via the
 * vite-plugin, so the two SSR columns above also disagreed with each other.
 *
 * Every spec compiles REAL source through `transformJSX` — vitest's own JSX
 * transform never produces `_tpl`/`_ssr`, so it cannot see this class at all
 * (see `.claude/rules/test-environment-parity.md`).
 *
 * Both JSX runtimes are exercised. They deliver children by DIFFERENT routes —
 * classic `h(Comp, null, child)` puts it in `vnode.children` (merged into props
 * by mount/hydrate/SSR), automatic `jsx(Comp, { children })` puts it in
 * `props.children` directly — and the laziness has to survive both.
 */
import { transformJSX } from '@pyreon/compiler'
import { transformSync } from 'esbuild'
import {
  _lc,
  Fragment,
  Show,
  createContext,
  h,
  provide,
  useContext,
  type VNodeChild,
} from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import * as RuntimeServer from '@pyreon/runtime-server'
import * as JsxRuntime from '@pyreon/core/jsx-runtime'
import { hydrateRoot, mountChild, onHydrationMismatch } from '../index'
import * as Template from '../template'

const stripImports = (code: string) => code.replace(/^import\s+.*$/gm, '')

/** Runtime bindings the compiled client emit can reference. */
const CLIENT_DEPS: Record<string, unknown> = {
  h,
  Fragment,
  _lc,
  _tpl: Template._tpl,
  _bindText: Template._bindText,
  _bindDirect: Template._bindDirect,
  _mountSlot: Template._mountSlot,
  _setChild: Template._setChild,
  _setChildAt: Template._setChildAt,
}

const SSR_DEPS: Record<string, unknown> = {
  h,
  Fragment,
  _lc,
  _ssr: (RuntimeServer as Record<string, unknown>)._ssr,
  _esc: (RuntimeServer as Record<string, unknown>)._esc,
  _ssrNode: (RuntimeServer as Record<string, unknown>)._ssrNode,
  _ssrChildren: (RuntimeServer as Record<string, unknown>)._ssrChildren,
  _ssrDeferred: (RuntimeServer as Record<string, unknown>)._ssrDeferred,
}

type Runtime = 'classic' | 'automatic'

/**
 * Lower the Pyreon transform's residual JSX the way a real build does.
 *
 * The automatic runtime is the one production uses (`jsxImportSource:
 * "@pyreon/core"`); esbuild aliases its imports (`jsx as _jsx`), so the alias
 * names are read back off the emitted import statement rather than assumed.
 */
function lower(code: string, runtime: Runtime): { js: string; extra: Record<string, unknown> } {
  if (runtime === 'classic') {
    const js = transformSync(code, {
      loader: 'tsx',
      jsx: 'transform',
      jsxFactory: 'h',
      jsxFragment: 'Fragment',
    }).code
    return { js: stripImports(js), extra: {} }
  }
  const out = transformSync(code, {
    loader: 'tsx',
    jsx: 'automatic',
    jsxImportSource: '@pyreon/core',
  }).code
  const jsxRuntime = JsxRuntime as unknown as Record<string, unknown>
  const extra: Record<string, unknown> = {}
  const importRe = /import\s*\{([^}]*)\}\s*from\s*"[^"]*jsx-runtime"/g
  for (const m of out.matchAll(importRe)) {
    for (const part of (m[1] as string).split(',')) {
      const [orig, alias] = part.split(' as ').map((s) => s.trim())
      if (!orig) continue
      extra[alias ?? orig] = jsxRuntime[orig]
    }
  }
  return { js: stripImports(out), extra }
}

/** Compile + evaluate `src`, returning its `App` binding. */
function build(
  src: string,
  userDeps: Record<string, unknown>,
  opts: { ssr?: boolean; runtime?: Runtime } = {},
): (props?: Record<string, unknown>) => VNodeChild {
  const runtime = opts.runtime ?? 'classic'
  const transformed = transformJSX(
    src,
    'case.tsx',
    opts.ssr === true ? { ssr: true, ssrTemplate: true } : {},
  ).code
  const { js, extra } = lower(stripImports(transformed), runtime)
  const deps = { ...(opts.ssr === true ? SSR_DEPS : CLIENT_DEPS), ...extra, ...userDeps }
  // oxlint-disable-next-line no-new-func
  return new Function(...Object.keys(deps), `${js}\nreturn App`)(
    ...Object.values(deps),
  ) as (props?: Record<string, unknown>) => VNodeChild
}

function mountToString(App: unknown): string {
  const container = document.createElement('div')
  mountChild(h(App as never, null), container, null)
  return container.innerHTML
}

const runtimes: Runtime[] = ['classic', 'automatic']

// ─────────────────────────────────────────────────────────────────────────────

describe('lazy component children — context ordering (the shipped bug)', () => {
  /** A provider whose child must not be built before its `provide()` runs. */
  function makeProvider() {
    const Ctx = createContext<string>('DEFAULT')
    const readCtx = () => useContext(Ctx)
    const Provider = (props: { children?: unknown }) => {
      provide(Ctx, 'PROVIDED')
      return props.children as VNodeChild
    }
    return { readCtx, Provider }
  }

  for (const runtime of runtimes) {
    it(`[${runtime}] a provider's own element child reads the PROVIDED value`, () => {
      const { readCtx, Provider } = makeProvider()
      const App = build(
        `const App = () => <Provider><div class="k">{readCtx()}</div></Provider>`,
        { Provider, readCtx },
        { runtime },
      )
      // Pre-fix this was `<div class="k">DEFAULT</div>` — the template's
      // `_bindText` ran as a `jsx()` argument, before `provide()`.
      expect(mountToString(App)).toBe('<div class="k">PROVIDED</div>')
    })

    it(`[${runtime}] the accessor form is fixed too — deferring the READ was never enough`, () => {
      // `{() => readCtx()}` looks like it should escape the ordering because the
      // read is deferred, but `renderEffect` snapshots the context owner when it
      // is CONSTRUCTED, and construction is the eager `_tpl` call. Both forms
      // therefore needed the same fix, and a spec for only the bare form would
      // have left the one users are told to reach for still broken.
      const { readCtx, Provider } = makeProvider()
      const App = build(
        `const App = () => <Provider><div class="k">{() => readCtx()}</div></Provider>`,
        { Provider, readCtx },
        { runtime },
      )
      expect(mountToString(App)).toBe('<div class="k">PROVIDED</div>')
    })
  }

  it('SSR under ssrTemplate agrees with the client', async () => {
    const { readCtx, Provider } = makeProvider()
    const src = `const App = () => <Provider><div class="k">{readCtx()}</div></Provider>`
    const html = await renderToString(
      h(build(src, { Provider, readCtx }, { ssr: true }) as never, null) as never,
    )
    // Pre-fix: `DEFAULT` here and `PROVIDED` from the non-ssrTemplate SSR path,
    // i.e. the same source rendered two different pages depending on a flag the
    // vite-plugin sets automatically.
    expect(html).toContain('PROVIDED')
    expect(html).not.toContain('DEFAULT')
  })

  it('plain SSR (no ssrTemplate) was already correct and is unchanged', async () => {
    const { readCtx, Provider } = makeProvider()
    const out = transformJSX(
      `const App = () => <Provider><div class="k">{readCtx()}</div></Provider>`,
      'case.tsx',
      { ssr: true },
    ).code
    // No template is emitted at all on this path, so nothing to defer.
    expect(out).not.toContain('_lc(')
    const { js } = lower(stripImports(out), 'classic')
    // oxlint-disable-next-line no-new-func
    const App = new Function('h', 'Fragment', 'Provider', 'readCtx', `${js}\nreturn App`)(
      h,
      Fragment,
      Provider,
      readCtx,
    )
    expect(await renderToString(h(App as never, null) as never)).toContain('PROVIDED')
  })
})

describe('lazy component children — the children CONTRACT is unchanged', () => {
  // The laziness rides `_lc`'s REACTIVE_PROP brand, so the existing
  // `makeReactiveProps` step turns it into a property GETTER. That is what keeps
  // every structural consumer working: they read `props.children` and get the
  // VALUE, exactly as before. A bare accessor would have handed all of them a
  // function — the documented breakage class.
  for (const runtime of runtimes) {
    it(`[${runtime}] props.children is a VALUE, never a function`, () => {
      let seenType = ''
      let seenIsArray: boolean | null = null
      const Probe = (props: { children?: unknown }) => {
        seenType = typeof props.children
        seenIsArray = Array.isArray(props.children)
        return props.children as VNodeChild
      }
      const App = build(
        `const App = () => <Probe><div class="k"><span>x</span></div></Probe>`,
        { Probe },
        { runtime },
      )
      mountToString(App)
      expect(seenType).toBe('object')
      expect(seenIsArray).toBe(false)
    })
  }

  it('reading props.children TWICE builds the subtree ONCE', () => {
    // Memoization is a contract, not an optimisation: `Show` reads children
    // inside an accessor, `Element` reads them through a slot resolver, and a
    // second build would produce a second detached DOM tree with its own
    // bindings.
    let builds = 0
    const count = (): number => ++builds
    let first: unknown
    let second: unknown
    const Probe = (props: { children?: unknown }) => {
      first = props.children
      second = props.children
      return props.children as VNodeChild
    }
    const App = build(
      `const App = () => <Probe><div class="k">{count()}</div></Probe>`,
      { Probe, count },
      {},
    )
    expect(mountToString(App)).toBe('<div class="k">1</div>')
    expect(builds).toBe(1)
    expect(first).toBe(second)
  })

  it('a component that NEVER reads children builds nothing and leaves no live binding', () => {
    // The eager form built the subtree and wired its `renderEffect` regardless,
    // so a component that dropped its children left an orphaned subscription
    // alive for the page's lifetime with nothing able to dispose it (leak class
    // H). An unread thunk runs no code at all.
    let builds = 0
    const sig = signal(0)
    const read = (): number => {
      builds++
      return sig()
    }
    const Drop = (_props: { children?: unknown }) => h('em', null, 'no children')
    const App = build(`const App = () => <Drop><div class="k">{read()}</div></Drop>`, {
      Drop,
      read,
    })
    expect(mountToString(App)).toBe('<em>no children</em>')
    expect(builds).toBe(0)
    sig.set(1)
    expect(builds).toBe(0)
  })

  it('resolving children inside a tracking scope does not leak a subscription outward', () => {
    // The eager call site ran outside any tracking frame; a getter can be read
    // from inside one (`@pyreon/elements`' Wrapper reads `own.children` in a
    // reactive accessor), so `_lc` runs its thunk under `untrack` to keep the
    // pre-existing subscription shape.
    const sig = signal(0)
    let outerRuns = 0
    const readIt = (): number => sig()
    const Probe = (props: { children?: unknown }) => {
      const container = document.createElement('div')
      effect(() => {
        outerRuns++
        // Reading the getter here would subscribe the OUTER effect to every
        // signal the template touches if the thunk ran tracked.
        void props.children
      })
      mountChild(props.children as VNodeChild, container, null)
      return h('em', null, container.textContent)
    }
    const App = build(`const App = () => <Probe><div class="k">{readIt()}</div></Probe>`, {
      Probe,
      readIt,
    })
    mountToString(App)
    expect(outerRuns).toBe(1)
    sig.set(1)
    // Still 1 — the template's own binding re-ran, the outer effect did not.
    expect(outerRuns).toBe(1)
  })
})

describe('lazy component children — control flow keeps working', () => {
  // `<Show>` is a component with a sole element child, so it is one of the most
  // common shapes the trigger fires on — and it reads `props.children` from
  // inside a reactive accessor, which is the read position `_lc`'s `untrack`
  // exists for. Toggling it exercises build-on-first-read, the memoized second
  // read, and re-mount of the same instance.
  it('<Show> builds its child on first TRUE and reuses it across toggles', () => {
    let builds = 0
    const label = (): string => `v${++builds}`
    const cond = signal(false)
    const App = build(
      `const App = () => <Show when={cond}><div class="k">{label()}</div></Show>`,
      { Show, cond, label },
    )
    const container = document.createElement('div')
    mountChild(h(App as never, null), container, null)

    // Not shown yet — the template must not have been built.
    expect(builds).toBe(0)
    expect(container.querySelector('div.k')).toBeNull()

    cond.set(true)
    expect(container.querySelector('div.k')?.textContent).toBe('v1')
    expect(builds).toBe(1)

    cond.set(false)
    expect(container.querySelector('div.k')).toBeNull()

    // Re-shown: the SAME memoized instance comes back. This matches the eager
    // behaviour exactly — `_tpl` produced ONE NativeItem there too, and `Show`
    // mounted/unmounted that one instance — so the memo preserves the semantics
    // rather than introducing new ones.
    cond.set(true)
    expect(container.querySelector('div.k')?.textContent).toBe('v1')
    expect(builds).toBe(1)
  })
})

describe('lazy component children — SSR ⇄ hydration parity', () => {
  it('hydrates the provider subtree with no mismatch and the PROVIDED value', async () => {
    const Ctx = createContext<string>('DEFAULT')
    const readCtx = () => useContext(Ctx)
    const Provider = (props: { children?: unknown }) => {
      provide(Ctx, 'PROVIDED')
      return props.children as VNodeChild
    }
    const src = `const App = () => <Provider><div class="k"><span>{readCtx()}</span></div></Provider>`

    const html = await renderToString(
      h(build(src, { Provider, readCtx }, { ssr: true }) as never, null) as never,
    )
    expect(html).toContain('PROVIDED')

    const container = document.createElement('div')
    container.innerHTML = html

    const mismatches: unknown[] = []
    const off = onHydrationMismatch((m) => mismatches.push(m))
    try {
      hydrateRoot(container, h(build(src, { Provider, readCtx }) as never, null))
    } finally {
      off()
    }
    expect(mismatches).toEqual([])
    // Post-hydration DOM matches the SSR DOM, and the context value survived the
    // handoff — pre-fix the client half of this rendered DEFAULT while the SSR
    // half rendered PROVIDED (under ssrTemplate both were DEFAULT).
    expect(container.textContent).toBe('PROVIDED')
    expect(container.querySelector('div.k > span')).not.toBeNull()

    // NOTE ON ADOPTION: a NativeItem is SWAPPED at hydration, not adopted —
    // `hydrate.ts` builds the template fresh and replaces the SSR subtree
    // ("Correctness-first; adopting hydration is a compiler-side follow-up").
    // That is pre-existing and unchanged here: laziness moves WHEN `_tpl` runs,
    // not what hydration does with its result. The repo's own adoption counter
    // gate (`hydrate-tpl-adoption.test.tsx`) is the ratchet for that, and it
    // stays green — which is the check that matters, because widening
    // adopt→swap is the second, independent blocker recorded in PR #2914.
  })
})

describe('lazy component children — shapes that deliberately stay EAGER', () => {
  it('a render-prop child is untouched (arity would be ambiguous under a thunk)', () => {
    // `<For>{(item) => …}</For>` and every headless `*Base` primitive give a
    // FUNCTION child a meaning of their own. The trigger is a compiled template
    // call in child position, and an arrow function is not one — so these never
    // enter the lazy path and a thunk can never be mistaken for a render prop.
    const out = transformJSX(
      `const App = () => <For each={xs} by={r => r.id}>{(row) => <li><b>{row.n}</b></li>}</For>`,
      'case.tsx',
    ).code
    expect(out).not.toContain('_lc(')
  })

  it('MULTIPLE children stay eager — the documented residual', () => {
    // With >1 child `props.children` is an ARRAY. Making it lazy means either an
    // array of thunks (which every structural consumer would have to unwrap) or
    // a new runtime branch that resolves such arrays — a contract change, not a
    // shape. Pinned here so a future PR closing it has a target, and so the
    // boundary cannot drift silently.
    const out = transformJSX(
      `const App = () => <Provider><div><b>a</b></div><div><i>b</i></div></Provider>`,
      'case.tsx',
    ).code
    expect(out).toContain('{_tpl(')
    expect(out).not.toContain('_lc(')
  })

  it('a meaningful TEXT sibling makes the template non-sole, so it stays eager', () => {
    const out = transformJSX(
      `const App = () => <Provider>hello <div><b>a</b></div></Provider>`,
      'case.tsx',
    ).code
    expect(out).not.toContain('_lc(')
  })

  it('newline-only whitespace is elided, so an indented sole child IS lazy', () => {
    const out = transformJSX(
      `const App = () => (
  <Provider>
    <div><b>a</b></div>
  </Provider>
)`,
      'case.tsx',
    ).code
    expect(out).toContain('_lc(() => _tpl(')
  })
})
