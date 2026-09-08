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

/**
 * The overlay layers a mounted `<Flow>` owns: HTML edge labels live INSIDE
 * the viewport (they pan and zoom with the graph), node toolbars live in the
 * container (they follow their node but are never scaled). `null` on the
 * server and outside a `<Flow>` — consumers fall back to inline rendering.
 */
export interface FlowLayers {
  edgeLabels: HTMLElement
  toolbars: HTMLElement
}

export const FlowLayersContext = createContext<FlowLayers | null>(null)
