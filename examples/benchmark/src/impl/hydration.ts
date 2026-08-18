/**
 * Cross-framework HYDRATION benchmark — SSR HTML → interactive.
 *
 * Measures: with the server HTML already in the DOM (injected untimed each
 * iteration), how long until the framework has ADOPTED the existing nodes and
 * wired interactivity. This is the client half of SSR — the cost every
 * SSR/SSG page pays before first interaction works.
 *
 * Fairness protocol:
 *  - Each framework hydrates the HTML its OWN server renderer produced over
 *    the SAME shared component module (see hydration-shared.ts + the fixture
 *    generator) — markup/tree drift is structurally impossible.
 *  - Per-iteration reset (untimed): tear down the previous root, re-inject
 *    the fixture HTML fresh.
 *  - Timed region: hydrate call + that framework's own commit semantics
 *    (React's post-hydration lane wait mirrors impl/react.ts's convention;
 *    Pyreon/Preact/Vue commit synchronously) + a forced layout read.
 *  - ADOPTION GATE (the load-bearing one): before hydrating, capture a
 *    reference to a mid-table <td>; after, assert `isSameNode` — a framework
 *    that silently re-rendered instead of adopting fails the run rather than
 *    posting a fast number. Plus row-count + post-hydration INTERACTIVITY
 *    (real click → selected class) verified each iteration OUTSIDE the timed
 *    region.
 */
import { hydrateRoot as pyreonHydrate } from '@pyreon/runtime-dom'
import { h as ph2 } from '@pyreon/core'
import { signal, createSelector } from '@pyreon/reactivity'
import { PyreonCompiledApp } from './hydration-pyreon-compiled'
import * as React from 'react'
import * as ReactDOMClient from 'react-dom/client'
import { flushSync } from 'react-dom'
import { hydrate as preactHydrate, render as preactRender } from 'preact'
import { createSSRApp } from 'vue'
import type { BenchSuite } from '../runner'
import { bench } from '../runner'
import {
  HYDRATION_ROW_COUNT,
  preactApp,
  reactApp,
  vueApp,
  type FixtureRow,
} from './hydration-shared'


type Teardown = () => void

interface HydrationTarget {
  name: string
  html: string
  /** Hydrate over `container` (already holding `html`); resolve when committed
   * + interactive. Returns teardown for the next iteration's reset. */
  hydrate: (container: HTMLElement) => Promise<Teardown> | Teardown
  /** Trigger a selection via the framework's state (used by the gate AFTER a
   * real click already proved event wiring). */
  verifyClickTarget?: undefined
}

const makeTargets = (fixtures: {
  rows: FixtureRow[]
  html: Record<string, string>
}): HydrationTarget[] => {
  const rows = fixtures.rows
  return [
  {
    name: 'Pyreon',
    html: fixtures.html.pyreon!,
    hydrate(container) {
      const __s0 = performance.now()
      const rowState = rows.map((r) => ({ id: r.id, label: signal(r.label) }))
      const rowsSig = signal(rowState)
      const selectedId = signal<number | null>(null)
      const isSelected = createSelector(selectedId)
      // DIAGNOSTIC: app-state construction, not hydration. Pyreon's shared page
      // gives every row its OWN `signal` label; Vue's gives every row a plain
      // string and keeps ONE `ref` for selection. That is 1000 signal
      // allocations + 1000 subscriptions inside Pyreon's timed region with no
      // counterpart in Vue's — a modelling asymmetry, not a hydration cost.
      ;((globalThis as { __hydrationState?: number[] }).__hydrationState ??= []).push(
        performance.now() - __s0,
      )
      // COMPILED app (what real Pyreon apps ship): rows are _tpl templates;
      // hydration adopts the SSR rows through the compiled binds.
      const dispose = pyreonHydrate(
        container,
        ph2(PyreonCompiledApp as never, {
          rows: () => rowsSig(),
          isSelected,
          onSelect: (id: number) => selectedId.set(id),
        }),
      )
      return () => dispose()
    },
  },
  {
    name: 'React 19',
    html: fixtures.html.react!,
    hydrate(container) {
      function App() {
        const [selected, set] = React.useState<number | null>(null)
        return reactApp(rows, selected, set)
      }
      // `flushSync` forces the hydration render to COMMIT synchronously —
      // the same convention impl/react.ts documents for the DOM suite. The
      // previous shape awaited `requestAnimationFrame → setTimeout(0)` INSIDE
      // the timed region, folding a full animation frame of browser
      // scheduling latency into React's number while Pyreon/Preact/Vue
      // returned synchronously — the exact artifact the DOM suite removed.
      // The adoption + interactivity gates (verify) still referee that the
      // commit really happened: a non-committed hydration fails the click
      // gate loudly rather than posting a fast number.
      let root!: ReactDOMClient.Root
      flushSync(() => {
        root = ReactDOMClient.hydrateRoot(container, React.createElement(App))
      })
      return () => root.unmount()
    },
  },
  {
    name: 'Preact',
    html: fixtures.html.preact!,
    hydrate(container) {
      // Preact hydrates statelessly here; selection re-render goes through a
      // fresh render of the same tree on click (component-level state is not
      // needed for the adoption/interactivity gates — the click handler
      // re-renders with the selected id, preact diffs in place).
      const onSelect = (id: number | null) => {
        preactRender(preactApp(rows, id, onSelect), container)
      }
      preactHydrate(preactApp(rows, null, onSelect), container)
      return () => {
        preactRender(null, container)
      }
    },
  },
  {
    name: 'Vue 3',
    html: fixtures.html.vue!,
    hydrate(container) {
      const { component } = vueApp(rows)
      const app = createSSRApp(component)
      app.mount(container)
      return () => app.unmount()
    },
  },
  ]
}

export async function runHydration(
  frameworkName: string,
  container: HTMLElement,
): Promise<BenchSuite> {
  // Fixtures are generated into public/ by scripts/gen-hydration-fixtures.ts
  // and fetched at runtime — no build-time/typecheck dependency on the
  // generated file (it is gitignored).
  const fixtures = (await fetch('/hydration-fixtures.json').then((r) => {
    if (!r.ok) throw new Error('[hydration] fixtures missing — run scripts/gen-hydration-fixtures.ts first')
    return r.json()
  })) as { rows: FixtureRow[]; html: Record<string, string> }
  const targets = makeTargets(fixtures)
  const target = targets.find((t) => t.name === frameworkName)
  if (!target) throw new Error(`[hydration] unknown framework: ${frameworkName}`)
  const suite: BenchSuite = { framework: target.name, container, results: [] }

  const host = document.createElement('div')
  container.appendChild(host)

  let teardown: Teardown | null = null
  let adoptionProbe: Element | null = null
  // SPLIT DIAGNOSTIC. The runner's timed region is `hydrate()` + a forced
  // `getBoundingClientRect()`. On a 1000-row table that layout flush is the
  // DOMINANT term (~5ms of ~6ms), and it is browser-internal work sized by the
  // SSR DOM rather than by the framework's walk — so a headline hydration
  // number pools two very different costs. Recording the hydrate half here
  // lets the driver report `walk` and `layout` separately. One extra
  // `performance.now()` pair per iteration (~30ns against ~6ms).
  const walkSamples: number[] = []
  ;((globalThis as { __hydrationWalk?: Record<string, number[]> }).__hydrationWalk ??= {})[
    target.name
  ] = walkSamples

  // FULL retention census, not a single probe. The one-node gate below proves
  // that ONE mid-table node survived; it cannot distinguish "adopted every row"
  // from "adopted the row I happened to sample". Counting all of them is what
  // actually answers whether the framework hydrated or silently re-rendered.
  let preRows: Element[] = []
  const inject = () => {
    if (teardown) {
      teardown()
      teardown = null
    }
    host.innerHTML = target.html
    // Mid-table adoption probe, captured BEFORE hydration.
    adoptionProbe = host.querySelectorAll('td')[HYDRATION_ROW_COUNT]! // row ~500's first td
    preRows = [...host.querySelectorAll('tr')]
  }

  inject()

  await bench(
    'hydrate 1,000 rows (SSR HTML → interactive)',
    suite,
    async () => {
      const t0 = performance.now()
      teardown = await target.hydrate(host)
      walkSamples.push(performance.now() - t0)
    },
    {
      reset: inject,
      verify: () => {
        // 1) Row count intact.
        const trs = host.querySelectorAll('tr')
        if (trs.length !== HYDRATION_ROW_COUNT) {
          throw new Error(`[hydration:${target.name}] expected ${HYDRATION_ROW_COUNT} rows, got ${trs.length}`)
        }
        // 2) ADOPTION: the pre-hydration node must still be IN the DOM —
        //    hydration adopts, it does not re-create.
        if (!adoptionProbe || !host.contains(adoptionProbe)) {
          throw new Error(`[hydration:${target.name}] adoption gate FAILED — pre-hydration node was replaced (silent re-render, not hydration)`)
        }
        // 2b) RETENTION CENSUS — how many of the pre-hydration rows survived,
        //     not just the sampled one. Reported (not fatal): frameworks differ
        //     legitimately in what they adopt, and the point is to make the
        //     number visible rather than to referee it.
        let kept = 0
        for (const el of preRows) if (el.isConnected) kept++
        ;(globalThis as { __hydrationRetention?: Record<string, string> }).__hydrationRetention = {
          ...(globalThis as { __hydrationRetention?: Record<string, string> })
            .__hydrationRetention,
          [target.name]: `${kept}/${preRows.length}`,
        }
        // 3) INTERACTIVITY: real click on row 500's <a> must apply the
        //    selected class (delegated/attached handlers are live).
        const link = trs[499]!.querySelector('a')!
        link.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return new Promise<void>((res, rej) => {
          // Allow async frameworks one frame to commit the selection.
          requestAnimationFrame(() =>
            setTimeout(() => {
              const cls = trs[499]!.className
              if (cls !== 'danger') {
                rej(
                  new Error(`[hydration:${target.name}] interactivity gate FAILED — click did not select (class="${cls}")`),
                )
              } else res()
            }, 0),
          )
        })
      },
    },
  )

  if (teardown) (teardown as Teardown)()
  host.remove()
  return suite
}

export const HYDRATION_FRAMEWORKS = ['Pyreon', 'React 19', 'Preact', 'Vue 3']
