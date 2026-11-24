/**
 * A component's USER teardown callbacks (`onUnmount`, and the cleanup an
 * `onMount` callback returns) can throw. `mountComponent` logged and reported
 * such a throw and went on tearing down; `hydrateComponent` ran them bare, so
 * removing a hydrated `<For>` row whose component threw escaped as "Unhandled
 * effect error", and the rows stayed on screen. Both now share
 * `runUnmountHooks` (`mount.ts`). Real compiler, `renderToString` and
 * `hydrateRoot`, compared with a client `mount()`.
 */
import { transformJSX } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import { For, Fragment, h, onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
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

/** Render `src` (hydrated over its SSR output, or mounted), run `act`, return the DOM and the logged errors. */
async function run(src: string, scope: Record<string, unknown>, mode: 'hydrate' | 'mount', act: (dispose: () => void) => void) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  hosts.push(host)
  const errors: string[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(' '))
  })
  try {
    let dispose: () => void
    if (mode === 'hydrate') {
      host.innerHTML = await renderToString(h(compile(src, scope, 'ssr') as never, null) as never)
      dispose = hydrateRoot(host, h(compile(src, scope, 'client') as never, null))
    } else {
      dispose = mount(h(compile(src, scope, 'client') as never, null), host)
    }
    expect(errors).toEqual([])
    act(dispose)
  } finally {
    spy.mockRestore()
  }

  return { html: strip(host.innerHTML), errors }
}

const ROWS_SRC =
  'const App = () => <ul><For each={() => rows()} by={(r) => r.id}>{(r) => <li><Boom /></li>}</For></ul>'

describe('a user teardown callback that throws, in a hydrated component', () => {
  for (const kind of ['onUnmount', 'onMount cleanup'] as const) {
    const Boom = () => {
      if (kind === 'onUnmount') {
        onUnmount(() => {
          throw new Error('unmount-boom')
        })
      } else {
        onMount(() => () => {
          throw new Error('unmount-boom')
        })
      }

      return h('b', null, 'x')
    }

    for (const mode of ['hydrate', 'mount'] as const) {
      it(`${kind} | ${mode} | a removed <For> row goes, the throw is logged`, async () => {
        const rows = signal([{ id: 1 }, { id: 2 }, { id: 3 }])
        const r = await run(ROWS_SRC, { rows, Boom }, mode, () => rows.set(rows().slice(1)))
        expect(r.html).toBe('<ul><li><b>x</b></li><li><b>x</b></li></ul>')
        expect(r.errors).toEqual(['[Pyreon] Error in onUnmount hook of <Boom>: Error: unmount-boom'])
      })

      it(`${kind} | ${mode} | a cleared <For> goes entirely`, async () => {
        const rows = signal([{ id: 1 }, { id: 2 }])
        const r = await run(ROWS_SRC, { rows, Boom }, mode, () => rows.set([]))
        expect(r.html).toBe('<ul></ul>')
        expect(r.errors.length).toBe(2)
        expect(r.errors.every((e) => e.startsWith('[Pyreon] Error in onUnmount hook of <Boom>'))).toBe(true)
      })

      it(`${kind} | ${mode} | the root disposed: the throw does not escape`, async () => {
        const r = await run('const App = () => <div><Boom /></div>', { Boom }, mode, (dispose) => dispose())
        expect(r.html).toBe('')
        expect(r.errors).toEqual(['[Pyreon] Error in onUnmount hook of <Boom>: Error: unmount-boom'])
      })
    }
  }

  it('a later hook still runs after one that throws', async () => {
    const ran: string[] = []
    const Two = () => {
      onUnmount(() => {
        throw new Error('first')
      })
      onUnmount(() => {
        ran.push('second')
      })

      return h('b', null, 'x')
    }
    const r = await run('const App = () => <div><Two /></div>', { Two }, 'hydrate', (dispose) => dispose())
    expect(ran).toEqual(['second'])
    expect(r.errors).toEqual(['[Pyreon] Error in onUnmount hook of <Two>: Error: first'])
  })
})
