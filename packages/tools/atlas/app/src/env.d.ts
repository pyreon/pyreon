/// <reference types="vite/client" />

declare module 'virtual:atlas/shell' {
  export const title: string
}

declare module 'virtual:atlas/catalog' {
  export const catalog: import('../../src/ui/catalog').WorkbenchCatalog
  /** Component module id → swap in a re-evaluated namespace (dev HMR). */
  export const __atlasHot: Map<string, (mod: unknown) => void>
}

declare module 'virtual:zero/routes' {
  export const routes: import('@pyreon/router').RouteRecord[]
}
