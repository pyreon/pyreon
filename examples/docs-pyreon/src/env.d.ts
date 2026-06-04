/// <reference types="vite/client" />

declare module '*.css' {
  const content: string
  export default content
}

declare module 'virtual:zero/routes' {
  import type { RouteRecord } from '@pyreon/router'
  export const routes: RouteRecord[]
}

declare module 'virtual:zero/route-middleware' {
  import type { RouteMiddlewareEntry } from '@pyreon/zero'
  export const routeMiddleware: RouteMiddlewareEntry[]
}

declare module 'virtual:zero/api-routes' {
  import type { ApiRouteEntry } from '@pyreon/zero/api-routes'
  export const apiRoutes: ApiRouteEntry[]
}

declare module 'virtual:pyreon-docs/nav' {
  export interface NavSection {
    title: string
    items: { title: string; href: string }[]
  }
  export const nav: NavSection[]
}

declare module 'virtual:zero-content/collections'
declare module 'virtual:zero-content/components'

/**
 * A compiled markdown page — emitted by `markdown-to-pyreon.ts`.
 * Exports:
 *   - `default`: the page component
 *   - `meta`: title, description, headings (for TOC), slug
 */
declare module '*.md' {
  import type { ComponentFn } from '@pyreon/core'
  export interface DocMeta {
    title: string
    description?: string
    slug: string
    headings: { level: number; text: string; id: string }[]
  }
  const Component: ComponentFn<Record<string, never>>
  export const meta: DocMeta
  export default Component
}
