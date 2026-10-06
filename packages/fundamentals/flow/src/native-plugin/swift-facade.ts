/**
 * The scoped slot the moved Swift flow emitters read the compiler through — the
 * Swift half of `facade.ts` (see it for why a slot rather than a parameter).
 */

import type { ExprIR, SwiftEmitContext } from '@pyreon/native-compiler/plugin-api'
import { createContextSlot, sharedHost } from './facade'
import { flowFileOf, type FlowFile } from './collect'
import { FLOW_PLUGIN_NAME, FLOW_STATE_TYPE } from './names'
import type { FlowStatePayload } from './types'

const slot = createContextSlot<SwiftEmitContext>('Swift', 'withSwiftContext')

/** Run `fn` with `ctx` installed as the context the flow emitters read; restore the previous one afterwards. */
export const withSwiftContext = slot.run

/** The facade, read through the slot: the shared members plus the Swift-only ones. */
export const host = Object.freeze({
  ...sharedHost(slot.current),
  handlerName: (handler: ExprIR): string | undefined => slot.current().handlerName(handler),
  inlineConsts: (e: ExprIR): ExprIR => slot.current().inlineConsts(e),
  flowFile: (): FlowFile => flowFileOf(slot.current()),
  /** True when `name` is bound to a `createFlow` / `useFlow` declaration of the component being emitted. */
  isFlowState: (name: string): boolean => slot.current().decls(FLOW_PLUGIN_NAME, FLOW_STATE_TYPE).some((d) => d.name === name),
  /** True when the flow `name` seeds nodes whose `data` carries a `label` field (so the default node shows it). */
  hasLabelData: (name: string): boolean => {
    const decl = slot.current().decls(FLOW_PLUGIN_NAME, FLOW_STATE_TYPE).find((d) => d.name === name)
    if (decl === undefined) return false
    return (decl.payload as unknown as FlowStatePayload).nodes.some((node) => node.data.kind === 'object' && node.data.fields.some((field) => field.name === 'label'))
  },
})
