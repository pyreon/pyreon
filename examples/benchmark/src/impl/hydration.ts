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
      const rowState = rows.map((r) => ({ id: r.id, label: signal(r.label) }))
      const rowsSig = signal(rowState)
      const selectedId = signal<number | null>(null)
      const isSelected = createSelector(selectedId)
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
    async hydrate(container) {
      function App() {
        const [selected, set] = React.useState<number | null>(null)
        return reactApp(rows, selected, set)
      }
      const root = ReactDOMClient.hydrateRoot(container, React.createElement(App))
      // React hydration commits on its own lane — wait for it (same
      // rAF→setTimeout convention as impl/react.ts's commit wait).
      await new Promise<void>((res) =>
        requestAnimationFrame(() => setTimeout(res, 0)),
      )
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

  const inject = () => {
    if (teardown) {
      teardown()
      teardown = null
    }
    host.innerHTML = target.html
    // Mid-table adoption probe, captured BEFORE hydration.
    adoptionProbe = host.querySelectorAll('td')[HYDRATION_ROW_COUNT]! // row ~500's first td
  }

  inject()

  await bench(
    'hydrate 1,000 rows (SSR HTML → interactive)',
    suite,
    async () => {
      teardown = await target.hydrate(host)
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
