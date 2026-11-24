/// <reference types="vite/client" />

declare module 'virtual:atlas/shell' {
  export const title: string
}

declare module 'virtual:atlas/catalog' {
  export const catalog: import('../../src/ui/catalog').WorkbenchCatalog
}

declare module 'virtual:zero/routes' {
  export const routes: import('@pyreon/router').RouteRecord[]
}
