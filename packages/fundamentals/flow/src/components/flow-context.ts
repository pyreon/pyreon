import { createContext } from '@pyreon/core'
import type { FlowInstance } from '../types'

/**
 * Carries the active `FlowInstance` down to child components rendered inside
 * `<Flow>` (MiniMap, Controls, …) so the documented `<Flow instance={flow}>`
 * `<MiniMap />``</Flow>` pattern works without threading `instance` to every
 * child. Children resolve `props.instance ?? useContext(FlowContext)`; an
 * explicit `instance` prop still wins (e.g. a MiniMap of a different graph).
 *
 * The instance is stable for the lifetime of the graph (not reactive), so a
 * plain context — read once at child mount — is the right shape.
 */
export const FlowContext = createContext<FlowInstance | null>(null)
