// Virtual modules compiled by `vite-rivals.ts` (see `rival-sources.ts`).
declare module 'virtual:rival-vue/*' {
  import type { RenderFunction } from 'vue'
  export const render: RenderFunction
}

declare module 'virtual:rival-solid/virtual-tanstack' {
  export function mountList(scroller: HTMLElement, count: number, rowSize: number, overscan: number): () => void
}

declare module 'virtual:rival-solid/table-tanstack' {
  export function mountTable<T>(
    host: HTMLElement,
    initial: T[],
    features: unknown,
    columns: unknown,
    onReady: (table: any) => void,
  ): { dispose: () => void; setData: (rows: T[]) => void }
}
