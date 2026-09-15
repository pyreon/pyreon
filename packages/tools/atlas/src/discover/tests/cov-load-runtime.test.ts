/**
 * `loadRuntime` — which capabilities the harness gets, and which it refuses.
 *
 * Every field here is an all-or-nothing contract, and the failure mode of
 * getting one wrong is a SILENT FALSE PASS: a `renderToString` without the
 * matching `onHydrationMismatch` reports a serene zero mismatches for every
 * scenario, and a graph reader from the wrong module measures an empty graph
 * and calls every component leak-free. So each half is asserted present when
 * the project has it and ABSENT when it does not.
 *
 * Driven through the `ModuleLoader` seam — the injection point the whole file
 * is designed around — with modules that are the real shapes, not spies.
 */
import { describe, expect, it } from 'vitest'
import type { ModuleLoader } from '../load'
import { loadComponent, loadRuntime, runtimeLoader } from '../load'

/** A vite-kind loader over a fixed module table. */
const viteLoader = (modules: Record<string, Record<string, unknown> | Error>): ModuleLoader => ({
  kind: 'vite',
  close: async () => {},
  load: async (file: string) => {
    const mod = modules[file]
    if (mod === undefined) throw new Error(`Cannot find module '${file}'`)
    if (mod instanceof Error) throw mod
    return mod
  },
})

const core = { h: () => null, registerErrorHandler: () => () => {} }
const dom = { mount: () => () => {}, hydrateRoot: () => () => {}, onHydrationMismatch: () => () => {} }

describe('loadRuntime — what the loader must be', () => {
  it('refuses a RUNTIME loader outright', async () => {
    // Atlas's own copy would be a SECOND framework instance: components compiled
    // against one copy mounted with another, and every verdict about the split.
    expect(await loadRuntime(runtimeLoader())).toBeUndefined()
  })

  it('builds a runtime from a vite loader that resolves the framework', async () => {
    const runtime = await loadRuntime(
      viteLoader({
        '@pyreon/core': core,
        '@pyreon/runtime-dom': dom,
        '@pyreon/reactivity': {},
        '@pyreon/runtime-server': { renderToString: () => '<p></p>' },
      }),
    )
    expect(runtime?.h).toBeTypeOf('function')
    expect(runtime?.mount).toBeTypeOf('function')
  })

  it('is undefined when `h` or `mount` is not callable', async () => {
    const noH = await loadRuntime(
      viteLoader({ '@pyreon/core': { h: 'nope' }, '@pyreon/runtime-dom': dom, '@pyreon/reactivity': {} }),
    )
    expect(noH).toBeUndefined()

    const noMount = await loadRuntime(
      viteLoader({ '@pyreon/core': core, '@pyreon/runtime-dom': { mount: 42 }, '@pyreon/reactivity': {} }),
    )
    expect(noMount).toBeUndefined()
  })

  it('reports the failure and returns undefined when the framework will not resolve', async () => {
    const seen: string[] = []
    const runtime = await loadRuntime(viteLoader({}), (message) => seen.push(message))
    expect(runtime).toBeUndefined()
    expect(seen[0]).toContain('@pyreon/core')
  })

  it('does not require a failure callback to survive a failure', async () => {
    expect(await loadRuntime(viteLoader({}))).toBeUndefined()
  })
})

describe('the reactive-graph reader — present only with a registry', () => {
  it('is omitted when the project s reactivity has no graph reader (a production build)', async () => {
    const runtime = await loadRuntime(
      viteLoader({ '@pyreon/core': core, '@pyreon/runtime-dom': dom, '@pyreon/reactivity': {} }),
    )
    // Absent rather than zero: the leak check must SKIP, not report a clean bill.
    expect(runtime?.reactiveGraphSize).toBeUndefined()
  })

  it('reads the graph, and RE-RESOLVES the module on every read', async () => {
    // A reference captured once reads a dead registry forever after a Vite dep
    // re-optimisation swaps the instance mid-scan.
    let nodes = [1, 2]
    let loads = 0
    const loader: ModuleLoader = {
      kind: 'vite',
      close: async () => {},
      load: async (file: string) => {
        if (file === '@pyreon/core') return core
        if (file === '@pyreon/runtime-dom') return dom
        if (file === '@pyreon/reactivity') {
          loads += 1
          return { getReactiveGraph: () => ({ nodes }) }
        }
        throw new Error(`no ${file}`)
      },
    }
    const runtime = await loadRuntime(loader)
    expect(await runtime?.reactiveGraphSize?.()).toBe(2)
    const before = loads
    nodes = [1, 2, 3]
    expect(await runtime?.reactiveGraphSize?.()).toBe(3)
    expect(loads).toBeGreaterThan(before)
  })
})

describe('the SSR half — all three pieces or none', () => {
  const load = async (server: Record<string, unknown> | undefined, domMod: Record<string, unknown> = dom) =>
    loadRuntime(
      viteLoader({
        '@pyreon/core': core,
        '@pyreon/runtime-dom': domMod,
        '@pyreon/reactivity': {},
        ...(server ? { '@pyreon/runtime-server': server } : {}),
      }),
    )

  it('is present when the project ships a renderer', async () => {
    const runtime = await load({ renderToString: () => '<p></p>' })
    expect(runtime?.renderToString).toBeTypeOf('function')
    expect(runtime?.hydrateRoot).toBeTypeOf('function')
    expect(runtime?.onHydrationMismatch).toBeTypeOf('function')
  })

  it('is absent — but the runtime still MOUNTS — with no `@pyreon/runtime-server`', async () => {
    // A component library with no SSR story is a legitimate project: the parity
    // check skips with that reason rather than failing every component.
    const runtime = await load(undefined)
    expect(runtime?.mount).toBeTypeOf('function')
    expect(runtime?.renderToString).toBeUndefined()
  })

  it('is absent when the server module resolves without a `renderToString`', async () => {
    expect((await load({}))?.renderToString).toBeUndefined()
  })

  it('is absent when `hydrateRoot` is missing — half a check is not a check', async () => {
    const runtime = await load({ renderToString: () => '<p></p>' }, {
      mount: () => () => {},
      onHydrationMismatch: () => () => {},
    })
    expect(runtime?.mount).toBeTypeOf('function')
    expect(runtime?.renderToString).toBeUndefined()
  })

  it('is absent when `onHydrationMismatch` is missing — the silent-false-pass shape', async () => {
    const runtime = await load({ renderToString: () => '<p></p>' }, {
      mount: () => () => {},
      hydrateRoot: () => () => {},
    })
    expect(runtime?.renderToString).toBeUndefined()
    expect(runtime?.onHydrationMismatch).toBeUndefined()
  })
})

describe('loadComponent through an injected loader', () => {
  it('names the export it could not find, with the SOURCE', async () => {
    const result = await loadComponent('/p/Button.tsx', 'Button', viteLoader({ '/p/Button.tsx': { Other: () => null } }))
    expect(result.component).toBeUndefined()
    expect(result.reason).toContain('/p/Button.tsx')
    expect(result.reason).toContain('no callable export named "Button"')
  })

  it('reports a non-Error throw as a reason rather than "[object Object]"-ing', async () => {
    const loader: ModuleLoader = {
      kind: 'vite',
      close: async () => {},
      load: async () => {
        throw 'boom'
      },
    }
    const result = await loadComponent('/p/Button.tsx', 'Button', loader)
    expect(result.reason).toContain('could not import')
    expect(result.reason).toContain('boom')
  })

  it('takes the named export in preference to the default', async () => {
    const named = () => 'named'
    const result = await loadComponent(
      '/p/Button.tsx',
      'Button',
      viteLoader({ '/p/Button.tsx': { Button: named, default: () => 'default' } }),
    )
    expect(result.component).toBe(named)
  })
})
