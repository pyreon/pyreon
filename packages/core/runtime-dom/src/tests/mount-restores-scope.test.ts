/**
 * `mountComponent` / `hydrateComponent` used to END by resetting the current
 * effect scope to `null` instead of restoring the one that was current before.
 *
 * The scope is current while a parent's `onMount` runs (`runInScope`). When
 * that onMount synchronously mounted a child component (a signal write that
 * flips a `<Show>`), the child's mount reset the scope to `null` on its way
 * out, so every `effect()` the onMount created AFTER that point had no owner:
 * unmounting the parent left it subscribed and running, forever.
 */
import * as core from '@pyreon/core'
import { h, onMount, Show } from '@pyreon/core'
import * as reactivity from '@pyreon/reactivity'
import { effect, signal } from '@pyreon/reactivity'
import { createRequire } from 'node:module'
import { transformJSX_JS } from '@pyreon/compiler'
import { transformSync } from 'esbuild'
import { describe, expect, it } from 'vitest'
import * as runtimeDom from '../index'
import { hydrateRoot, mount } from '../index'

const backends: [string, (source: string) => string][] = [
  ['JavaScript', (source) => transformJSX_JS(source, 'restore-scope.tsx').code],
]

try {
  const native = createRequire(import.meta.url)('../../../compiler/native/pyreon-compiler.node') as {
    transformJsx: (source: string, filename: string, ssr: boolean, known: null) => { code: string }
  }
  backends.push(['Rust', (source) => native.transformJsx(source, 'restore-scope.tsx', false, null).code])
} catch {
  // JavaScript remains covered without the optional addon.
}

/** The shape under test, through `h()`. Returns the run counter and the trigger. */
function setup() {
  const open = signal(false)
  const tick = signal(0)
  const counter = { runs: 0 }
  const Child = () => h('span', null, 'child')
  const Parent = () => {
    onMount(() => {
      // Synchronously mounts <Child> inside this onMount.
      open.set(true)
      effect(() => {
        tick()
        counter.runs++
      })
    })

    return h('div', null, h(Show, { when: () => open() }, h(Child, null)))
  }

  return { Parent, tick, counter }
}

describe('a component mount restores the previous effect scope', () => {
  it('h(): an onMount effect created after a synchronous child mount is disposed on unmount', () => {
    const { Parent, tick, counter } = setup()
    const container = document.createElement('div')
    const unmount = mount(h(Parent, null), container)
    expect(container.textContent).toBe('child')
    expect(counter.runs).toBe(1)
    unmount()
    tick.set(1)
    expect(counter.runs).toBe(1)
  })

  it('hydrate: the same shape is disposed on unmount', () => {
    const { Parent, tick, counter } = setup()
    const container = document.createElement('div')
    container.innerHTML = '<div><!--$--><!--/$--></div>'
    const unmount = hydrateRoot(container, h(Parent, null))
    expect(container.textContent).toBe('child')
    expect(counter.runs).toBe(1)
    unmount()
    tick.set(1)
    expect(counter.runs).toBe(1)
  })

  it.each(backends)('compiled (%s): the same shape is disposed on unmount', (_name, compile) => {
    const source = `
      function Child() { return <span>child</span> }
      function Parent() {
        onMount(() => {
          open.set(true)
          effect(() => { tick(); counter.runs++ })
        })
        return <div><Show when={() => open()}><Child /></Show></div>
      }`
    const output = compile(source)
    // Bind every name the compiled module imports from the framework.
    const modules: Record<string, Record<string, unknown>> = {
      '@pyreon/core': core,
      '@pyreon/reactivity': reactivity,
      '@pyreon/runtime-dom': runtimeDom,
    }
    const bindings: Record<string, unknown> = {}
    for (const m of output.matchAll(/^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm)) {
      const mod = modules[m[2] as string]
      expect(mod, `unexpected import ${m[2]}`).toBeDefined()
      for (const spec of (m[1] as string).split(',')) {
        const [imported, local] = spec.trim().split(/\s+as\s+/)
        if (imported) bindings[(local ?? imported).trim()] = mod![imported.trim()]
      }
    }
    // JSX the compiler leaves for the runtime (component elements) goes through h().
    const body = transformSync(output.replace(/^import.*$/gm, ''), {
      loader: 'tsx',
      jsxFactory: '__h',
      jsxFragment: '__Fragment',
    }).code
    expect(body).not.toMatch(/^import /m)
    const open = signal(false)
    const tick = signal(0)
    const counter = { runs: 0 }
    const free = { __h: h, __Fragment: core.Fragment, onMount, effect, Show, open, tick, counter }
    const names = [...Object.keys(bindings), ...Object.keys(free)]
    const values = [...Object.values(bindings), ...Object.values(free)]
    const Parent = new Function(...names, `${body}; return Parent`)(...values) as core.ComponentFn
    expect(output).toContain('_tpl')
    const container = document.createElement('div')
    const unmount = mount(h(Parent, null), container)
    expect(container.textContent).toBe('child')
    expect(counter.runs).toBe(1)
    unmount()
    tick.set(1)
    expect(counter.runs).toBe(1)
  })
})
