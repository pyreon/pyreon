// Virtual modules from the release-candidate arm plugins in vite.config.ts.
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

// Virtual module from `solid2Plugin` in vite.config.ts (SolidJS 2.0 RC arm).
declare module 'virtual:solid2-rows' {
  export function Rows(props: { rows: () => unknown[]; selectedId: () => number | null }): Node
}
declare module 'solid-js-rc' {
  export function createSignal<T>(value: T): [() => T, (v: T) => void]
  export function flush(): void
}
declare module 'babel-preset-solid-rc'
