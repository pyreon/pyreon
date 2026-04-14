import { onUnmount } from '@pyreon/core'
import { createFlow } from './flow'
import type { FlowConfig, FlowInstance } from './types'

/**
 * Component-scoped wrapper around `createFlow` that auto-disposes the
 * instance when the calling component unmounts. Use this inside a
 * component body to avoid the manual `onUnmount(() => flow.dispose())`
 * boilerplate.
 *
 * @example
 * ```tsx
 * const MyDiagram = () => {
 *   const flow = useFlow<MyData>({
 *     nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { kind: 'start' } }],
 *     edges: [],
 *   })
 *   return <Flow instance={flow}><Background /></Flow>
 * }
 * ```
 *
 * For flows owned outside the component tree (singleton, app store, etc.)
 * keep using `createFlow` directly and dispose manually.
 */
export function useFlow<TData = Record<string, unknown>>(
  config: FlowConfig<TData>,
): FlowInstance<TData> {
  const instance = createFlow<TData>(config)
  onUnmount(() => {
    instance.dispose()
  })
  return instance
}
