import type { ComponentFn } from '@pyreon/core'
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { hydrateRoot, mount } from '@pyreon/runtime-dom'
import { createApp } from './app'

// ─── Client entry factory ───────────────────────────────────────────────────

export interface StartClientOptions {
  /** Route definitions. */
  routes: RouteRecord[]
  /** Root layout component. */
  layout?: ComponentFn
}

/**
 * Start the client-side app — hydrates SSR content or mounts fresh for SPA.
 *
 * @example
 * import { routes } from "virtual:zero/routes"
 * import { startClient } from "@pyreon/zero/client"
 *
 * startClient({ routes })
 */
export function startClient(options: StartClientOptions) {
  const container = document.getElementById('app')
  if (!container) throw new Error('[zero] Missing #app container element')

  const { App } = createApp({
    routes: options.routes,
    routerMode: 'history',
    ...(options.layout ? { layout: options.layout } : {}),
  })

  const vnode = h(App, null)

  // If container has SSR content, hydrate. Otherwise mount fresh.
  if (container.childNodes.length > 0) {
    return hydrateRoot(container, vnode)
  }

  return mount(vnode, container)
}
