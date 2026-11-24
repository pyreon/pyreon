/**
 * The component under test never sees the WORKBENCH's router.
 *
 * `atlas dev` / `atlas build` run the workbench as a routed zero app, and an
 * embedded workbench sits inside its host's router. A previewed component
 * calling `useRoute()` read the workbench's route (`/button/`), and one calling
 * `useRouter().push()` navigated the workbench away. Every preview path
 * (canvas, Theme Lab appearance, role cards) renders inside a memory router of
 * its own.
 *
 * Mounted through the real `h()` + `mount`, under a real history router, the
 * way the app shell mounts the workbench.
 *
 * @vitest-environment happy-dom
 */
import { h, type VNodeChild } from '@pyreon/core'
import { createRouter, RouterProvider, useRoute, useRouter } from '@pyreon/router'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { WorkbenchCatalog } from '../catalog'
import { createModel } from '../model'

const seen: { path: string; router: unknown }[] = []

function Probe(): VNodeChild {
  const route = useRoute()
  seen.push({ path: route().path, router: useRouter() })
  return h('span', null, 'probe')
}

const CATALOG: WorkbenchCatalog = {
  components: [{ id: 'probe', name: 'Probe', group: 'G', controls: [], render: () => h(Probe, null) }],
}

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  seen.length = 0
  history.replaceState(null, '', '/')
})

function mountUnderWorkbenchRouter(child: () => VNodeChild): unknown {
  history.replaceState(null, '', '/probe')
  const workbench = createRouter({ routes: [{ path: '/:component', component: () => null }], mode: 'history' })
  const el = document.createElement('div')
  document.body.appendChild(el)
  const dispose = mount(h(RouterProvider, { router: workbench }, h(() => child(), null)), el)
  cleanups.push(() => {
    dispose()
    el.remove()
  })
  return workbench
}

describe('previews render under a router of their own', () => {
  it('the canvas preview: useRoute() is not the workbench route, useRouter() is not its router', () => {
    const m = createModel(CATALOG, {})
    const workbench = mountUnderWorkbenchRouter(() => m.preview())
    expect(seen).toHaveLength(1)
    expect(seen[0]!.router).not.toBe(workbench)
    expect(seen[0]!.path).toBe('/')
  })

  it('an appearance preview (Theme Lab) and a role card are isolated too', () => {
    const m = createModel(CATALOG, {})
    const workbench = mountUnderWorkbenchRouter(() => [m.preview({ dark: true }), m.previewAs('anonymous').node])
    expect(seen).toHaveLength(2)
    for (const s of seen) expect(s.router).not.toBe(workbench)
  })

  it('a push from the component moves ITS router, never the page', async () => {
    const m = createModel(CATALOG, {})
    mountUnderWorkbenchRouter(() => m.preview())
    await (seen[0]!.router as { push: (p: string) => Promise<unknown> }).push('/elsewhere')
    expect(location.pathname).toBe('/probe')
  })
})
