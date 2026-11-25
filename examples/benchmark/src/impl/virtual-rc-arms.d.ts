// Virtual modules from the release-candidate / second-major arm plugins in vite.config.ts.
// Vue 3.6 Vapor (RC):
declare module 'virtual:vue-vapor-runtime' {
  export function createVaporApp(component: unknown): { mount(el: Element): unknown; unmount(): void }
  export function nextTick(): Promise<void>
  export function triggerRef(ref: unknown): void
}
declare module 'virtual:rows-vue-vapor' {
  import type { Row } from '../runner'
  const component: unknown
  export default component
  export function onRowsVaporReady(
    cb: (handles: { rows: { value: Row[] }; selectedId: { value: number | null } }) => void,
  ): void
}

// Virtual modules from `solid2Plugin` in vite.config.ts (SolidJS 2.0 arms;
// sources in solid2-sources.ts).
declare module 'virtual:solid2/rows' {
  export function Rows(props: { rows: () => unknown[]; selectedId: () => number | null }): Node
}
declare module 'virtual:solid2/tree' {
  export function createTree(depth: number): { mount(host: HTMLElement): () => void; setValue(v: string): void }
}
declare module 'virtual:solid2/effects' {
  export function createEffectList(
    rowCount: number,
    sink: { values: number[]; runs: number },
  ): { mount(host: HTMLElement): () => void; applyAll(next: number[]): void; applyOne(index: number, value: number): void }
}
declare module 'virtual:solid2/memo' {
  export function mountMemoWall(
    host: HTMLElement,
    count: number,
    bucketOf: (n: number) => number,
  ): { setSource(n: number): void; dispose(): void }
}
declare module 'virtual:solid2/maplist' {
  export interface Solid2MapRow {
    id: number
    label: () => string
    setLabel(v: string): void
    done: () => boolean
    setDone(v: boolean): void
  }
  export function makeRow(plain: { id: number; label: string; done: boolean }): Solid2MapRow
  export function mountMapList(host: HTMLElement): {
    rows: () => Solid2MapRow[]
    setRows(next: Solid2MapRow[]): void
    dispose(): void
  }
}
declare module 'solid-js-2' {
  export function createSignal<T>(value: T): [() => T, (v: T) => void]
  export function flush(): void
}
