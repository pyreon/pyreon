/**
 * How the public custom-node / custom-edge / connection-line PROPS TYPES resolve
 * to the object shape a component's parameters are read from. They are imported
 * from `@pyreon/flow` rather than declared in the consumer's file, so without
 * this the parser sees an unresolvable named type and emits a zero-prop
 * component whose body references unbound `data` / `selected` fields. Each has
 * a closed structural contract. Moved from the compiler's `parse.ts`
 * (`resolvePropsObjectType`).
 */

import type { PropsTypeResolver, TypeIR } from '@pyreon/native-compiler/plugin-api'

const accessor = (returnType: TypeIR): TypeIR => ({ kind: 'function', params: [], returnType })

/** `NodeComponentProps<Data>` — `id`, and `data` / `selected` / `dragging` as accessors. The inline `Data` object is lifted to a struct named after the component. */
export const nodeComponentProps: PropsTypeResolver = {
  liftInlineArg: { suffix: 'Data' },
  resolve(type, ctx) {
    if (type.args.length > 1) return undefined
    const inline = type.args[0]
    const lifted = inline?.kind === 'object' ? ctx.liftedStruct(inline) : undefined
    const dataType: TypeIR = lifted !== undefined ? { kind: 'typeRef', name: lifted, args: [] } : (inline ?? { kind: 'unknown' as const })
    return {
      kind: 'object',
      fields: [
        { name: 'id', type: { kind: 'string' } },
        { name: 'data', type: accessor(dataType) },
        { name: 'selected', type: accessor({ kind: 'boolean' }) },
        { name: 'dragging', type: accessor({ kind: 'boolean' }) },
      ],
    }
  },
}

/** `EdgeComponentProps` — the edge, its endpoints and label position. */
export const edgeComponentProps: PropsTypeResolver = {
  resolve(type) {
    if (type.args.length !== 0) return undefined
    const numberAccessor = accessor({ kind: 'number', float: true })
    const positionAccessor = accessor({ kind: 'typeRef', name: 'PyreonFlowPosition', args: [] })
    return {
      kind: 'object',
      fields: [
        { name: 'edge', type: { kind: 'typeRef', name: 'PyreonFlowEdge', args: [] } },
        { name: 'sourceX', type: numberAccessor },
        { name: 'sourceY', type: numberAccessor },
        { name: 'targetX', type: numberAccessor },
        { name: 'targetY', type: numberAccessor },
        { name: 'sourcePosition', type: positionAccessor },
        { name: 'targetPosition', type: positionAccessor },
        { name: 'selected', type: accessor({ kind: 'boolean' }) },
        { name: 'labelX', type: numberAccessor },
        { name: 'labelY', type: numberAccessor },
      ],
    }
  },
}

/** `ConnectionLineProps` — the in-progress connection's endpoints and path. */
export const connectionLineProps: PropsTypeResolver = {
  resolve(type) {
    if (type.args.length !== 0) return undefined
    const numberAccessor = accessor({ kind: 'number', float: true })
    return {
      kind: 'object',
      fields: [
        { name: 'sourceX', type: numberAccessor },
        { name: 'sourceY', type: numberAccessor },
        { name: 'targetX', type: numberAccessor },
        { name: 'targetY', type: numberAccessor },
        { name: 'sourcePosition', type: accessor({ kind: 'typeRef', name: 'PyreonFlowPosition', args: [] }) },
        { name: 'path', type: accessor({ kind: 'typeRef', name: 'PyreonFlowPathResult', args: [] }) },
      ],
    }
  },
}
