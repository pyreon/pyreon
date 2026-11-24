/**
 * #4800 — a `<For>` inside another `<For>`'s row: removing or replacing the
 * INNER list's first row must not dispose anything the OUTER row owns.
 *
 * `runRowCallback` pools one collector `EffectScope` across rows and only
 * hands it to a row that registered something. It read the pooled slot
 * without claiming it, so an inner `<For>` mounted inside an outer row's
 * callback ran its first row's callback with the SAME collector the outer row
 * was still filling. The inner first row then kept the outer row's collector
 * as its own scope and stopped it on removal: in 0.54 that disposed the inner
 * `<For>`'s own effect (registered with the scope), so the list stopped
 * updating after it replaced its first row; after `_effectOwned` (#4778) the
 * list itself survived, but an `effect()` the outer row callback creates was
 * still disposed with an unrelated inner row. A row now claims the collector
 * before its callback runs; only an empty one goes back to the pool.
 *
 * Compiled through the real compiler with the vite-plugin's options, so the
 * rows are `_tpl` templates with `renderEffect` attribute bindings, exactly as
 * in the report.
 *
 * Bisect (runRowCallback reverted to read-without-claim): the outer-row
 * `effect()` cases fail (`['R2:4']` instead of `['R1:4', 'R2:4']`); with the
 * inner `<For>`'s effect also scope-registered again (its 0.54 shape) the
 * issue's own repro fails with `'a1,b,c'` instead of `'a1,b2,c'`.
 */
import { transformJSX } from '@pyreon/compiler'
import * as core from '@pyreon/core'
import * as reactivity from '@pyreon/reactivity'
import { transformSync } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import * as runtime from '../index'
import * as template from '../template'

const RUNTIME: Record<string, unknown> = { ...core, ...reactivity, ...template, ...runtime }
const NAMES = Object.keys(RUNTIME).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n))

type M = { id: string; round: string; t: string }

function load(src: string, globals: Record<string, unknown>): { App: () => unknown; out: string } {
  const out = transformJSX(src, 'nested-for.tsx', { templatizeComponentChildren: true }).code
  const body = transformSync(out.replace(/^\s*import\s.*$/gm, ''), {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
  }).code
  const fn = new Function(...NAMES, ...Object.keys(globals), `${body}\nreturn App`)

  return { App: fn(...NAMES.map((n) => RUNTIME[n]), ...Object.values(globals)) as () => unknown, out }
}

const mounted: (() => void)[] = []

afterEach(() => {
  for (const u of mounted.splice(0)) u()
  document.body.innerHTML = ''
})

function mountApp(App: () => unknown): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  mounted.push(runtime.mount(core.h(App as never, null), container))

  return container
}

const buttons = (root: HTMLElement) =>
  [...root.querySelectorAll('button')].map((b) => b.textContent).join(',')

const matchesOf = (a: string, b: string, extra = false): M[] => [
  { id: 'a', round: 'R1', t: a },
  { id: 'b', round: 'R1', t: b },
  { id: 'c', round: 'R2', t: '' },
  ...(extra ? [{ id: 'd', round: 'R2', t: '' }] : []),
]

/** The report's component: rounds × matches, each button labelled from the list's source. */
const ISSUE_SRC = `
const matches = () => cur()?.ms ?? []
const rounds = () => [...new Set(matches().map((m) => m.round))]
const label = (m) => \`\${m.id} of \${matches().length}\`
function App() {
  return (
    <div>
      <For each={rounds} by={(k) => k}>
        {(k) => (
          <section>
            <For each={() => matches().filter((m) => m.round === k)} by={(m) => \`\${m.id}:\${m.t}\`}>
              {(m) => <button aria-label={\`match \${label(m)}\`}>{\`\${m.id}\${m.t}\`}</button>}
            </For>
          </section>
        )}
      </For>
    </div>
  )
}`

/** The outer row callback creates an effect before building the inner list. */
const OUTER_EFFECT_SRC = `
const matches = () => cur()?.ms ?? []
const rounds = () => [...new Set(matches().map((m) => m.round))]
function App() {
  return (
    <div>
      <For each={rounds} by={(k) => k}>
        {(k) => {
          effect(() => { log.push(k + ':' + matches().length) })
          return (
            <section>
              <For each={() => matches().filter((m) => m.round === k)} by={(m) => m.id + ':' + m.t}>
                {(m) => <button aria-label={'x ' + matches().length}>{m.id + m.t}</button>}
              </For>
            </section>
          )
        }}
      </For>
    </div>
  )
}`

describe('nested <For>: the inner list keeps updating after its first row changes (#4800)', () => {
  const cases: Array<[string, Array<[M[], string]>]> = [
    ['replace row a, then row b (the report)', [[matchesOf('1', ''), 'a1,b,c'], [matchesOf('1', '2'), 'a1,b2,c']]],
    ['replace row a twice', [[matchesOf('1', ''), 'a1,b,c'], [matchesOf('2', ''), 'a2,b,c']]],
    ['replace row b, then row a', [[matchesOf('', '1'), 'a,b1,c'], [matchesOf('1', '1'), 'a1,b1,c']]],
    ['replace a and b in one update', [[matchesOf('1', '2'), 'a1,b2,c'], [matchesOf('3', '2'), 'a3,b2,c']]],
    [
      'remove row a, then change row b',
      [[matchesOf('', '').slice(1), 'b,c'], [matchesOf('', '2').slice(1), 'b2,c']],
    ],
  ]
  for (const [name, steps] of cases) {
    it(name, () => {
      const cur = reactivity.signal<{ ms: M[] } | null>({ ms: matchesOf('', '') })
      const { App, out } = load(ISSUE_SRC, { cur })
      const root = mountApp(App)
      expect(buttons(root), out).toBe('a,b,c')
      for (const [ms, expected] of steps) {
        cur.set({ ms })
        expect(buttons(root), out).toBe(expected)
      }
    })
  }
})

describe("nested <For>: an inner row's removal never disposes what the outer row owns (#4800)", () => {
  for (const [name, change] of [
    ['inner first row replaced', matchesOf('1', '')],
    ['inner first row removed', matchesOf('', '').slice(1)],
  ] as const) {
    it(`an effect() in the outer row callback keeps running: ${name}`, () => {
      const cur = reactivity.signal<{ ms: M[] } | null>({ ms: matchesOf('', '') })
      const log: string[] = []
      const { App, out } = load(OUTER_EFFECT_SRC, { cur, log, effect: reactivity.effect })
      const root = mountApp(App)
      cur.set({ ms: change })
      log.length = 0
      cur.set({ ms: [...change, { id: 'd', round: 'R2', t: '' }] })
      expect(log, out).toEqual([`R1:${change.length + 1}`, `R2:${change.length + 1}`])
      expect(buttons(root)).toContain('d')
    })
  }

  it('the outer row still disposes its own effect when IT is removed', () => {
    const cur = reactivity.signal<{ ms: M[] } | null>({ ms: matchesOf('', '') })
    const log: string[] = []
    const { App, out } = load(OUTER_EFFECT_SRC, { cur, log, effect: reactivity.effect })
    const root = mountApp(App)
    cur.set({ ms: matchesOf('', '').filter((m) => m.round === 'R2') })
    expect(buttons(root), out).toBe('c')
    log.length = 0
    cur.set({ ms: [{ id: 'c', round: 'R2', t: '1' }] })
    expect(log).toEqual(['R2:1'])
  })
})
