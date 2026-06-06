/// <reference types="vite/client" />

// Build-time constant set by @pyreon/zero's vite-plugin `define`. Carries
// the resolved router base (e.g. `/pyreon/preview/` for the preview
// deploy, `/` for local dev). See `packages/zero/zero/src/vite-plugin.ts`
// (`__ZERO_BASE__` define) — `configResolved` syncs it to the final
// resolved base, so it honors `--base` CLI overrides too (PR #1395).
declare const __ZERO_BASE__: string

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

declare module 'virtual:zero-content/collections'
declare module 'virtual:zero-content/components'
