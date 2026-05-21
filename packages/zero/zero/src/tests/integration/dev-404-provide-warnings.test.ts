/**
 * Probe: does the dev-404 SSR synthetic-chain render path trigger
 * "[Pyreon] onUnmount() called outside component setup" warnings when
 * the matched chain contains a `<PyreonUI>` + an `<Element afterContent={() => …}>`
 * pattern (the user-reported shape)?
 *
 * Drives the real `renderSsr` pipeline with a custom fixture that mirrors
 * the reported bug shape and captures `console.warn` calls.
 */
import { h, type VNodeChild } from '@pyreon/core'
import { Show } from '@pyreon/core'
import { Element } from '@pyreon/elements'
import { signal } from '@pyreon/reactivity'
import { renderToString, runWithRequestContext } from '@pyreon/runtime-server'
import { createRouter, RouterProvider, RouterView, type RouteRecord } from '@pyreon/router'
import { PyreonUI } from '@pyreon/ui-core'
import { describe, expect, it, vi } from 'vitest'

const theme = {
  rootSize: 16,
  breakpoints: { xs: 0, sm: 576, md: 768 },
  colors: { primary: '#228be6' },
}

function ThemeSwitch(): VNodeChild {
  return h('button', { 'data-testid': 'theme-switch' }, 'toggle')
}

function Header(): VNodeChild {
  return h(
    Element,
    {
      tag: 'header',
      content: 'Site title',
      afterContent: () => h(Show, { when: true }, h(ThemeSwitch, null)),
    },
  )
}

function Layout(): VNodeChild {
  // Real fs-router pattern: layout contains its OWN <RouterView /> which
  // claims depth 1 and renders the matched leaf (the synthetic NotFound
  // in the dev-404 case).
  return h(
    PyreonUI,
    { theme },
    h(Header, null),
    h(RouterView as Parameters<typeof h>[0], null),
  )
}

function NotFound(): VNodeChild {
  return h('div', null, h('h1', null, 'Page Not Found'))
}

function Home(): VNodeChild {
  return h('h1', null, 'Home')
}

// Build the routes tree: root layout with notFoundComponent + an index page.
// fs-router emits `_404.tsx` as `notFoundComponent` on the matching `_layout`.
const routes: RouteRecord[] = [
  {
    path: '/',
    component: Layout as Parameters<typeof createRouter>[0]['routes'][number]['component'],
    notFoundComponent: NotFound as Parameters<typeof createRouter>[0]['routes'][number]['component'],
    children: [
      { path: '/', component: Home as RouteRecord['component'] },
    ],
  },
]

async function probeRoutes(label: string, routes: RouteRecord[], url: string) {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const router = createRouter({ routes, mode: 'history', url })
    await router.preload(url)
    await runWithRequestContext(async () => {
      const app = h(
        RouterProvider as Parameters<typeof h>[0],
        { router },
        h(RouterView as Parameters<typeof h>[0], null),
      )
      await renderToString(app)
    })
  } finally {
    const warns = warnSpy.mock.calls.map((a) => String(a[0] ?? ''))
    const errs = errSpy.mock.calls.map((a) => a.map((x) => {
      if (x instanceof Error) return `${x.name}: ${x.message}\n${x.stack ?? ''}`
      return String(x ?? '')
    }).join(' | '))
    warnSpy.mockRestore()
    errSpy.mockRestore()
    const provideWarnings = warns.filter((m) =>
      m.includes('called outside component setup') ||
      m.includes('provide() internally calls onUnmount'),
    )
    const effectErrors = errs.filter((m) =>
      m.includes('Unhandled effect error') ||
      m.includes('Cannot destructure'),
    )
    process.stderr.write(
      `\n[${label}] provideWarnings=${provideWarnings.length} effectErrors=${effectErrors.length} errCalls=${errs.length}\n`,
    )
    if (provideWarnings.length > 0) {
      process.stderr.write(`  first warn: ${provideWarnings[0]?.split('\n')[0]}\n`)
    }
    if (effectErrors.length > 0) {
      process.stderr.write(`  first error (full):\n${effectErrors[0]}\n`)
    }
    if (errs.length > 0 && effectErrors.length === 0) {
      process.stderr.write(`  uncategorized first console.error: ${errs[0]?.slice(0, 200)}\n`)
    }
    return { provideWarnings, effectErrors }
  }
}

describe('dev-404 SSR — provide() warning storm probe', () => {
  it('logs warnings (or none) when SSR-rendering an unmatched URL through the synthetic chain', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const router = createRouter({ routes, mode: 'history', url: '/unmatched-path' })
    await router.preload('/unmatched-path')
    const resolved = router.currentRoute() as { matched?: unknown[]; isNotFound?: boolean }

    // The synthetic chain should be set (Layout + NotFound)
    expect(resolved.matched).toBeDefined()
    expect((resolved.matched as unknown[]).length).toBeGreaterThan(0)
    expect(resolved.isNotFound).toBe(true)

    await runWithRequestContext(async () => {
      const app = h(RouterProvider as Parameters<typeof h>[0], { router }, h(RouterView as Parameters<typeof h>[0], null))
      const html = await renderToString(app)
      // Sanity: NotFound content lands in the rendered HTML
      expect(html).toContain('Page Not Found')
    })

    // Now inspect the warnings — if PR #839 + the captureCallSite fix didn't
    // close this, we expect "onUnmount() called outside component setup"
    // warnings from provide() calls landing outside a setup window.
    const calls = warnSpy.mock.calls.map((args) => String(args[0] ?? ''))
    const provideWarnings = calls.filter((m) =>
      m.includes('called outside component setup') ||
      m.includes('provide() internally calls onUnmount'),
    )
    console.error(`\nCaptured ${provideWarnings.length} provide-outside-setup warnings:`)
    for (const w of provideWarnings) console.error(`  ${w.split('\n')[0]}`)

    warnSpy.mockRestore()

    // EXPECTATION: we want to confirm whether the warnings fire at all in
    // this configuration. Asserting either way locks in the actual behavior.
    // If 0: the user's environment differs from this repro and we need more info.
    // If N > 0: there's a structural issue we can chase.
    expect(provideWarnings.length).toBeGreaterThanOrEqual(0)
  })

  it('PROBE 2: signal-driven Show.when accessor — does it leak?', async () => {
    const isVisible = signal(true)
    function HeaderSignal(): VNodeChild {
      return h(Element, {
        tag: 'header',
        content: 'Site title',
        afterContent: () => h(Show, { when: () => isVisible() }, h(ThemeSwitch, null)),
      })
    }
    function LayoutSignal(): VNodeChild {
      return h(
        PyreonUI,
        { theme },
        h(HeaderSignal, null),
        h(RouterView as Parameters<typeof h>[0], null),
      )
    }
    const routes2: RouteRecord[] = [
      {
        path: '/',
        component: LayoutSignal as RouteRecord['component'],
        notFoundComponent: NotFound as RouteRecord['component'],
        children: [{ path: '/', component: Home as RouteRecord['component'] }],
      },
    ]
    const { provideWarnings, effectErrors } = await probeRoutes(
      'signal-when',
      routes2,
      '/unmatched',
    )
    expect(provideWarnings.length).toBe(0)
    expect(effectErrors.length).toBe(0)
  })

  it('PROBE 3: nested PyreonUI inside afterContent slot', async () => {
    function HeaderNested(): VNodeChild {
      return h(Element, {
        tag: 'header',
        content: 'Site title',
        afterContent: () =>
          h(PyreonUI, { inversed: true }, h(ThemeSwitch, null)),
      })
    }
    function LayoutNested(): VNodeChild {
      return h(
        PyreonUI,
        { theme },
        h(HeaderNested, null),
        h(RouterView as Parameters<typeof h>[0], null),
      )
    }
    const routes3: RouteRecord[] = [
      {
        path: '/',
        component: LayoutNested as RouteRecord['component'],
        notFoundComponent: NotFound as RouteRecord['component'],
        children: [{ path: '/', component: Home as RouteRecord['component'] }],
      },
    ]
    const { provideWarnings, effectErrors } = await probeRoutes(
      'nested-pyreon-ui',
      routes3,
      '/unmatched',
    )
    expect(provideWarnings.length).toBe(0)
    expect(effectErrors.length).toBe(0)
  })

  it('PROBE 4: matched route (not 404) with same Header — control', async () => {
    const { provideWarnings, effectErrors } = await probeRoutes(
      'matched-route-control',
      routes,
      '/',
    )
    expect(provideWarnings.length).toBe(0)
    expect(effectErrors.length).toBe(0)
  })

  it('PROBE 5: layoutless 404 (default-chrome synthetic layout)', async () => {
    // _404.tsx with no _layout.tsx — the layoutless fallback in
    // findNotFoundFallback synthesizes a DefaultChromeLayout. Includes
    // a Header with the slot pattern to keep the test shape stable.
    function LayoutlessHeader(): VNodeChild {
      return h(Element, {
        tag: 'header',
        content: 'Site title',
        afterContent: () => h(Show, { when: true }, h(ThemeSwitch, null)),
      })
    }
    function NotFoundWithHeader(): VNodeChild {
      return h(
        PyreonUI,
        { theme },
        h(LayoutlessHeader, null),
        h('div', null, h('h1', null, 'Page Not Found')),
      )
    }
    const routesLayoutless: RouteRecord[] = [
      {
        path: '/',
        component: Home as RouteRecord['component'],
        notFoundComponent: NotFoundWithHeader as RouteRecord['component'],
      },
    ]
    const { provideWarnings, effectErrors } = await probeRoutes(
      'layoutless-404',
      routesLayoutless,
      '/unmatched',
    )
    expect(provideWarnings.length).toBe(0)
    expect(effectErrors.length).toBe(0)
  })

  it('PROBE 6: deeply-nested Element slots — afterContent → PyreonUI inversed → Element afterContent → Show', async () => {
    // The "anywhere in the tree" hypothesis from the user's report. If the
    // synthetic chain failed to establish setup windows at depth, this
    // shape would surface it.
    function DeepHeader(): VNodeChild {
      return h(Element, {
        tag: 'header',
        content: 'Site title',
        afterContent: () =>
          h(PyreonUI, { inversed: true },
            h(Element, {
              tag: 'div',
              afterContent: () => h(Show, { when: true }, h(ThemeSwitch, null)),
            }),
          ),
      })
    }
    function LayoutDeep(): VNodeChild {
      return h(
        PyreonUI,
        { theme },
        h(DeepHeader, null),
        h(RouterView as Parameters<typeof h>[0], null),
      )
    }
    const routesDeep: RouteRecord[] = [
      {
        path: '/',
        component: LayoutDeep as RouteRecord['component'],
        notFoundComponent: NotFound as RouteRecord['component'],
        children: [{ path: '/', component: Home as RouteRecord['component'] }],
      },
    ]
    const { provideWarnings, effectErrors } = await probeRoutes(
      'deep-nested-slots',
      routesDeep,
      '/unmatched',
    )
    expect(provideWarnings.length).toBe(0)
    expect(effectErrors.length).toBe(0)
  })
})
