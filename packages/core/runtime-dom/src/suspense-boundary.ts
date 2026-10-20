import type { SuspenseBoundary, VNodeChild } from '@pyreon/core'

type Cleanup = () => void
type Mount = (child: VNodeChild, parent: Node, anchor: Node | null) => Cleanup
type SuspenseAttach = (boundary: SuspenseBoundary, start: Comment, end: Comment, mount: Mount) => Cleanup

// The same registry symbol `@pyreon/core` keys the handler under.
const SUSPENSE_ATTACH = /* @__PURE__ */ Symbol.for('pyreon:suspense-attach')

/**
 * The DOM boundary handler of a `<Suspense>` component type, or `undefined` for
 * any other type.
 *
 * `<Suspense>` carries its handler (`attachSuspenseBoundary` in `@pyreon/core`)
 * under a registry symbol. Reading it from the component — instead of checking
 * `type === Suspense` and importing the handler here — means an app that never
 * renders a `<Suspense>` bundles neither the component nor its handler
 * (~0.5 KB gzipped on the keyed-table benchmark app).
 */
export function suspenseAttachOf(type: unknown): SuspenseAttach | undefined {
  return typeof type === 'function'
    ? ((type as unknown as Record<symbol, SuspenseAttach | undefined>)[SUSPENSE_ATTACH])
    : undefined
}
