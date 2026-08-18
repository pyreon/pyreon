/**
 * Cross-framework APP-PAGE hydration benchmark — SSR HTML → interactive, for a
 * STATICALLY COMPOSED page rather than a keyed row list.
 *
 * Why a separate scenario from bench-hydration.ts: that bench's page is a
 * `<For>` of `<tr>` rows, and a `<For>` list is (measured) already fully
 * adopted by Pyreon's hydrator. This one is the ordinary app-page shape —
 * cards / form rows / nested sections composed as components — which is where
 * Pyreon's compiled-template hydration path actually differs.
 *
 * Fairness protocol (same as the row-list bench):
 *  - each framework hydrates the HTML its OWN server renderer produced over
 *    the shared page module, and the fixture generator asserts all four
 *    fixtures are byte-identical after normalising private hydration markers;
 *  - per-iteration reset (untimed): tear down the previous root, re-inject the
 *    fixture HTML fresh;
 *  - timed region: the framework's own documented hydration entry point plus
 *    its own commit semantics (React `flushSync`, mirroring impl/react.ts);
 *  - GATES per iteration, OUTSIDE the timed region: structural correctness
 *    (component counts + text) and real-click INTERACTIVITY. A framework that
 *    silently no-ops fails loudly instead of posting a fast number.
 *
 * NOTE on the adoption gate: unlike bench-hydration.ts, node ADOPTION is
 * REPORTED here, not gated. Adoption is the quantity under test in the A/B
 * that motivated this scenario, so gating on it would make one arm unrunnable.
 * The correctness + interactivity gates are what keep a no-op honest.
 */
import { hydrateRoot as pyreonHydrate } from '@pyreon/runtime-dom'
import { h as ph2 } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { AppPage } from './apppage-pyreon'
import * as React from 'react'
import * as ReactDOMClient from 'react-dom/client'
import { flushSync } from 'react-dom'
import { hydrate as preactHydrate, render as preactRender } from 'preact'
import { createSSRApp } from 'vue'
import type { BenchSuite } from '../runner'
import { bench } from '../runner'
import { APPPAGE_COMPONENTS, APPPAGE_ROWS, APPPAGE_SECTIONS } from './apppage-descriptor'
import { preactAppPage, reactAppPage, vueAppPage } from './apppage-shared'

type Teardown = () => void

interface Target {
  name: string
  html: string
  hydrate: (container: HTMLElement) => Promise<Teardown> | Teardown
}

const makeTargets = (html: Record<string, string>): Target[] => [
  {
    name: 'Pyreon',
    html: html.pyreon!,
    hydrate(container) {
      const selected = signal<string | null>(null)
      const dispose = pyreonHydrate(
        container,
        ph2(AppPage as never, {
          selected: () => selected(),
          onSelect: (id: string) => selected.set(id),
        }),
      )
      return () => dispose()
    },
  },
  {
    name: 'React 19',
    html: html.react!,
    hydrate(container) {
      function App() {
        const [sel, set] = React.useState<string | null>(null)
        return reactAppPage(sel, set)
      }
      let root!: ReactDOMClient.Root
      flushSync(() => {
        root = ReactDOMClient.hydrateRoot(container, React.createElement(App))
      })
      return () => root.unmount()
    },
  },
  {
    name: 'Preact',
    html: html.preact!,
    hydrate(container) {
      const onSelect = (id: string | null) => {
        preactRender(preactAppPage(id, onSelect), container)
      }
      preactHydrate(preactAppPage(null, onSelect), container)
      return () => {
        preactRender(null, container)
      }
    },
  },
  {
    name: 'Vue 3',
    html: html.vue!,
    hydrate(container) {
      const { component } = vueAppPage()
      const app = createSSRApp(component)
      app.mount(container)
      return () => app.unmount()
    },
  },
]

export async function runAppPage(
  frameworkName: string,
  container: HTMLElement,
): Promise<BenchSuite> {
  const fixtures = (await fetch('/apppage-fixtures.json').then((r) => {
    if (!r.ok) {
      throw new Error('[apppage] fixtures missing — run scripts/gen-apppage-fixtures.ts first')
    }
    return r.json()
  })) as { html: Record<string, string> }

  const target = makeTargets(fixtures.html).find((t) => t.name === frameworkName)
  if (!target) throw new Error(`[apppage] unknown framework: ${frameworkName}`)
  const suite: BenchSuite = { framework: target.name, container, results: [] }

  const host = document.createElement('div')
  container.appendChild(host)

  let teardown: Teardown | null = null
  let probeNodes: Node[] = []
  let retainedLast = -1

  /** Every element + text node under `host`, document order. */
  const snapshot = (): Node[] => {
    const out: Node[] = []
    const w = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n)
    return out
  }

  const inject = () => {
    if (teardown) {
      teardown()
      teardown = null
    }
    host.innerHTML = target.html
    probeNodes = snapshot()
  }

  inject()

  await bench(
    `hydrate app page (${APPPAGE_COMPONENTS} components, static composition)`,
    suite,
    async () => {
      teardown = await target.hydrate(host)
    },
    {
      reset: inject,
      verify: () => {
        // 1) Structure intact — the page really is the whole page.
        const rows = host.querySelectorAll('.row')
        const heads = host.querySelectorAll('.sec-hd')
        if (rows.length !== APPPAGE_SECTIONS * APPPAGE_ROWS || heads.length !== APPPAGE_SECTIONS) {
          throw new Error(
            `[apppage:${target.name}] structure gate FAILED — expected ${APPPAGE_SECTIONS} headers ` +
              `+ ${APPPAGE_SECTIONS * APPPAGE_ROWS} rows, got ${heads.length} + ${rows.length}`,
          )
        }
        // 2) Content intact — a framework that rendered an empty shell fails.
        const lastHint = host.querySelectorAll('.row-hint')[APPPAGE_SECTIONS * APPPAGE_ROWS - 1]
        const want = `help ${APPPAGE_SECTIONS - 1}.${APPPAGE_ROWS - 1}`
        if (lastHint?.textContent !== want) {
          throw new Error(
            `[apppage:${target.name}] content gate FAILED — last hint "${lastHint?.textContent}" != "${want}"`,
          )
        }
        // 3) ADOPTION — measured, not gated (it is the quantity under test).
        const after = new Set(snapshot())
        retainedLast = probeNodes.filter((n) => after.has(n)).length

        // 4) INTERACTIVITY — a real click must flip the Save button's class.
        const btn = host.querySelector('.page-save') as HTMLElement | null
        if (!btn) throw new Error(`[apppage:${target.name}] interactivity gate FAILED — no button`)
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        return new Promise<void>((res, rej) => {
          requestAnimationFrame(() =>
            setTimeout(() => {
              const cls = (host.querySelector('.page-save') as HTMLElement).className
              if (!cls.includes('active')) {
                rej(
                  new Error(
                    `[apppage:${target.name}] interactivity gate FAILED — click did not activate (class="${cls}")`,
                  ),
                )
              } else res()
            }, 0),
          )
        })
      },
    },
  )

  // Publish the adoption diagnostic alongside the timing.
  ;(globalThis as { __appPageAdoption?: unknown }).__appPageAdoption = {
    framework: target.name,
    retained: retainedLast,
    total: probeNodes.length,
  }

  if (teardown) (teardown as Teardown)()
  host.remove()
  return suite
}

export const APPPAGE_FRAMEWORKS = ['Pyreon', 'React 19', 'Preact', 'Vue 3']
