/**
 * USER code that runs during teardown can throw: an `onUnmount` hook, the
 * cleanup an `onMount` callback returns, an `onCleanup` registered in `onMount`
 * (a scope cleanup), a ref callback receiving `null`, an effect's cleanup. A
 * throw must be logged and reported and must not stop the teardown around it:
 * a removed `<For>` row goes, the other rows stay, a root dispose finishes and
 * does not throw. On the mount AND the hydrate path. Before the fix several of
 * these escaped the `<For>` reconciler as "Unhandled effect error" and left
 * every row on screen, or threw out of the root's unmount. Real compiler,
 * `renderToString` and `hydrateRoot`, compared with a client `mount()`.
 */
import { transformJSX } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { For, Fragment, h, onMount, onUnmount } from '@pyreon/core'
import { effect, onCleanup, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as dom from '../index'
import { hydrateRoot, mount } from '../index'

const DEPS: Record<string, unknown> = {
  ...Object.fromEntries(Object.entries(dom).filter(([k]) => k.startsWith('_'))),
  ...Object.fromEntries(Object.entries(core).filter(([k]) => k.startsWith('_'))),
  h,
  Fragment,
  For,
}

const lower = (code: string) =>
  transformSync(code.replace(/^import[^\n]*\n/gm, ''), {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code

function compile(src: string, scope: Record<string, unknown>, side: 'client' | 'ssr'): () => unknown {
  const { code } = transformJSX(src, 'case.tsx', side === 'ssr' ? { ssr: true } : {})
  const deps = { ...DEPS, ...scope }

  return new Function(...Object.keys(deps), `${lower(code)}\nreturn App`)(...Object.values(deps)) as () => unknown
}

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

const strip = (s: string) => s.replace(/<!--[^>]*-->/g, '')

/** Render `src` (hydrated over its SSR output, or mounted), run `act`, return the DOM, what `act` threw, and the errors it logged. */
async function run(src: string, scope: Record<string, unknown>, mode: 'hydrate' | 'mount', act: (dispose: () => void) => void) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  const errors: string[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(' '))
  })
  let thrown: unknown = null
  try {
    let dispose: () => void
    if (mode === 'hydrate') {
      host.innerHTML = await renderToString(h(compile(src, scope, 'ssr') as never, null) as never)
      dispose = hydrateRoot(host, h(compile(src, scope, 'client') as never, null))
    } else {
      dispose = mount(h(compile(src, scope, 'client') as never, null), host)
    }
    // Only what the teardown logs is this test's business.
    errors.length = 0
    try {
      act(dispose)
    } catch (err) {
      thrown = err
    }
  } finally {
    spy.mockRestore()
  }

  return { html: strip(host.innerHTML), errors, thrown }
}

const boom = () => {
  throw new Error('boom')
}

/** Each source of user teardown code, as a row component, and what it logs. */
const SOURCES: [string, () => unknown, string][] = [
  [
    'onUnmount hook',
    () => {
      onUnmount(boom)
      return h('b', null, 'x')
    },
    '[Pyreon] Error in onUnmount hook of <Boom>: Error: boom',
  ],
  [
    'onMount cleanup',
    () => {
      onMount(() => boom)
      return h('b', null, 'x')
    },
    '[Pyreon] Error in onUnmount hook of <Boom>: Error: boom',
  ],
  [
    'onCleanup in onMount (a scope cleanup)',
    () => {
      onMount(() => {
        onCleanup(boom)
      })

      return h('b', null, 'x')
    },
    '[pyreon] Unhandled effect error: Error: boom',
  ],
  [
    'ref callback receiving null',
    () => h('b', { ref: (el: Element | null) => el === null && boom() }, 'x'),
    '[Pyreon] Error in ref callback: Error: boom',
  ],
  [
    'onCleanup in an effect',
    () => {
      effect(() => {
        onCleanup(() => {
          if (!live) boom()
        })
      })

      return h('b', null, 'x')
    },
    '[pyreon] Unhandled effect error: Error: boom',
  ],
]

// The effect source throws only at teardown: `renderToString` runs the same
// component on the server and disposes its effects there, which runs the
// cleanup once before the client ever hydrates.
let live = true

const ROWS_SRC =
  'const App = () => <ul><For each={() => rows()} by={(r) => r.id}>{(r) => <li><Boom /></li>}</For></ul>'

describe('user code that throws during teardown', () => {
  for (const [name, make, logged] of SOURCES) {
    const Boom = Object.defineProperty(make, 'name', { value: 'Boom' })
    for (const mode of ['hydrate', 'mount'] as const) {
      it(`${name} | ${mode} | a removed <For> row goes, the others stay`, async () => {
        const rows = signal([{ id: 1 }, { id: 2 }, { id: 3 }])
        live = true
        const r = await run(ROWS_SRC, { rows, Boom }, mode, () => {
          live = false
          rows.set(rows().slice(1))
        })
        expect(r.thrown).toBe(null)
        expect(r.html).toBe('<ul><li><b>x</b></li><li><b>x</b></li></ul>')
        expect(r.errors).toEqual([logged])
      })

      it(`${name} | ${mode} | a cleared <For> goes entirely`, async () => {
        const rows = signal([{ id: 1 }, { id: 2 }])
        live = true
        const r = await run(ROWS_SRC, { rows, Boom }, mode, () => {
          live = false
          rows.set([])
        })
        expect(r.thrown).toBe(null)
        expect(r.html).toBe('<ul></ul>')
        expect(r.errors).toEqual([logged, logged])
      })

      it(`${name} | ${mode} | the root disposed: nothing escapes, nothing stays`, async () => {
        live = true
        const r = await run('const App = () => <div><Boom /></div>', { Boom }, mode, (dispose) => {
          live = false
          dispose()
        })
        expect(r.thrown).toBe(null)
        expect(r.html).toBe('')
        expect(r.errors).toEqual([logged])
      })
    }
  }

  for (const mode of ['hydrate', 'mount'] as const) {
    it(`a compiled template ref receiving null | ${mode} | a removed <For> row goes`, async () => {
      const rows = signal([{ id: 1 }, { id: 2 }, { id: 3 }])
      const R = (el: Element | null) => el === null && boom()
      const src = 'const App = () => <ul><For each={() => rows()} by={(r) => r.id}>{(r) => <li ref={R}>x</li>}</For></ul>'
      const r = await run(src, { rows, R }, mode, () => rows.set(rows().slice(1)))
      expect(r.thrown).toBe(null)
      expect(r.html).toBe('<ul><li>x</li><li>x</li></ul>')
      expect(r.errors).toEqual(['[Pyreon] Error in ref callback: Error: boom'])
    })
  }

  // A falsy ref (`ref={cond && r}`, JS / h() / compat callers) is no ref:
  // releasing it must not touch it, or the dispose throws a TypeError and the
  // child's onUnmount never runs.
  for (const mode of ['hydrate', 'mount'] as const) {
    for (const falsy of [false, 0, ''] as const) {
      it(`a falsy ref (${JSON.stringify(falsy)}) | ${mode} | the root disposes and the child unmounts`, async () => {
        const ran: string[] = []
        const Child = () => {
          onUnmount(() => {
            ran.push('child')
          })

          return h('b', null, 'x')
        }
        const r = await run('const App = () => h("div", { ref: F }, h(Child, null))', { F: falsy, Child }, mode, (dispose) => dispose())
        expect(r.thrown).toBe(null)
        expect(r.html).toBe('')
        expect(ran).toEqual(['child'])
        expect(r.errors).toEqual([])
      })
    }

    // A behaviour lock: a row's element is released by the list, not through
    // the element's ref cleanup, so this passes before the fix too.
    it(`behaviour lock: a falsy ref in a <For> row | ${mode} | the removed row goes`, async () => {
      const rows = signal([{ id: 1 }, { id: 2 }])
      const src = 'const App = () => <ul><For each={() => rows()} by={(r) => r.id}>{(r) => h("li", { ref: false }, "x")}</For></ul>'
      const r = await run(src, { rows }, mode, () => rows.set(rows().slice(1)))
      expect(r.thrown).toBe(null)
      expect(r.html).toBe('<ul><li>x</li></ul>')
      expect(r.errors).toEqual([])
    })

    it(`an object ref whose current setter throws | ${mode} | reported, the root still disposes`, async () => {
      const ran: string[] = []
      const Child = () => {
        onUnmount(() => {
          ran.push('child')
        })

        return h('b', null, 'x')
      }
      const R = {
        set current(el: Element | null) {
          if (el === null) boom()
        },
      }
      const r = await run('const App = () => h("div", { ref: R }, h(Child, null))', { R, Child }, mode, (dispose) => dispose())
      expect(r.thrown).toBe(null)
      expect(r.html).toBe('')
      expect(ran).toEqual(['child'])
      expect(r.errors).toEqual(['[Pyreon] Error in ref callback: Error: boom'])
    })
  }

  it('a later hook still runs after one that throws', async () => {
    const ran: string[] = []
    const Two = () => {
      onUnmount(boom)
      onUnmount(() => {
        ran.push('second')
      })

      return h('b', null, 'x')
    }
    const r = await run('const App = () => <div><Two /></div>', { Two }, 'hydrate', (dispose) => dispose())
    expect(ran).toEqual(['second'])
    expect(r.errors).toEqual(['[Pyreon] Error in onUnmount hook of <Two>: Error: boom'])
  })
})
