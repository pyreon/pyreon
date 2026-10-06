/**
 * The `createFlow` / `useFlow` recognizer: reads the literal `{ nodes, edges, … }`
 * config through the parser facade and returns the plugin's `flow-state`
 * declaration. Moved from the compiler's `parse.ts` (`tryDeclFromCreateFlow`);
 * the AST is read exactly as it was, through `ParseContext` instead of the
 * parser's own helpers.
 *
 * It DECLINES (returns `undefined`) when the config is not a literal it can
 * lower, after naming what is missing — the parser then continues as if the
 * plugin were absent.
 */
import type { AstNode, CallRecognizer, ExprIR, ExtPayload, ParseContext } from '@pyreon/native-compiler/plugin-api'
import { HANDLED_FLOW_EDGE_FIELDS, HANDLED_FLOW_NODE_FIELDS, droppedFlowFieldsWarning } from './lowering'
import { FLOW_STATE_TYPE } from './names'
import type { FlowStatePayload } from './types'

// The ESTree nodes are read structurally, exactly as the parser's own recognizer read them.
// oxlint-disable-next-line typescript/no-explicit-any
type AnyNode = any

function literalObjectKeys(ctx: ParseContext, obj: AstNode): string[] {
  const out: string[] = []
  for (const prop of (obj.properties as AstNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    const key = ctx.propKey(prop)
    if (key !== undefined) out.push(key)
    else if (ctx.hasDynamicKey(prop)) out.push('[computed key]')
  }
  return out
}

export const recognizeFlow: CallRecognizer = (call, ctx) => {
  const factory = call.callee
  if (factory !== 'createFlow' && factory !== 'useFlow') return undefined
  const name = ctx.declName
  const genericDataType = ctx.typeArg()
  const configArg = ctx.unwrap(ctx.args[0])
  if (!configArg || configArg.type !== 'ObjectExpression') {
    ctx.report(
      `${factory} declaration \`${name}\`: argument must be an object literal { nodes, edges } to lower natively. Falling back to silent-drop.`,
    )
    return undefined
  }
  const resolveStaticExpr = (input: AstNode | undefined): AstNode | undefined => ctx.resolveStatic(input)

  const literalString = (n: AnyNode | undefined): string | undefined =>
    n?.type === 'Literal' && typeof n.value === 'string' ? (n.value as string) : undefined
  const literalBool = (n: AnyNode | undefined): boolean | undefined =>
    n?.type === 'Literal' && typeof n.value === 'boolean' ? (n.value as boolean) : undefined
  const literalNumber = (n: AnyNode | undefined): number | undefined =>
    n?.type === 'Literal' && typeof n.value === 'number' ? (n.value as number) : undefined
  const objProp = (
    obj: AnyNode,
    key: string,
  ): AnyNode | undefined => {
    for (const prop of (obj.properties as AnyNode[] | undefined) ?? []) {
      if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
      const keyName = ctx.propKey(prop)
      if (keyName === key) return ctx.unwrap(prop.value as AnyNode | undefined)
    }
    return undefined
  }
  const literalPositions = (n: AnyNode | undefined): { x: ExprIR; y: ExprIR }[] | undefined => {
    if (!n || n.type !== 'ArrayExpression') return undefined
    const out: { x: ExprIR; y: ExprIR }[] = []
    for (const raw of (n.elements as AnyNode[] | undefined) ?? []) {
      const item = ctx.unwrap(raw)
      if (!item || item.type !== 'ObjectExpression') return undefined
      const x = objProp(item, 'x')
      const y = objProp(item, 'y')
      if (!x || !y) return undefined
      out.push({ x: ctx.expr(x), y: ctx.expr(y) })
    }
    return out
  }
  const literalFlowPosition = (n: AnyNode | undefined): string | undefined => {
    const direct = literalString(n)
    if (direct && ['top', 'right', 'bottom', 'left'].includes(direct.toLowerCase())) return direct.toLowerCase()
    if (n?.type === 'StaticMemberExpression' || n?.type === 'MemberExpression') {
      const positionName = (n.property as AnyNode | undefined)?.name
      if (typeof positionName === 'string' && ['top', 'right', 'bottom', 'left'].includes(positionName.toLowerCase())) return positionName.toLowerCase()
    }
    return undefined
  }
  const literalHandles = (n: AnyNode | undefined): { id?: string; type: string; position: string; offset?: number }[] | undefined => {
    if (!n || n.type !== 'ArrayExpression') return undefined
    const out: { id?: string; type: string; position: string; offset?: number }[] = []
    for (const raw of (n.elements as AnyNode[] | undefined) ?? []) {
      const item = ctx.unwrap(raw)
      if (!item || item.type !== 'ObjectExpression') return undefined
      const type = literalString(objProp(item, 'type'))
      const position = literalFlowPosition(objProp(item, 'position'))
      const idNode = objProp(item, 'id')
      const id = literalString(idNode)
      const offsetNode = objProp(item, 'offset')
      const offset = literalNumber(offsetNode)
      if (!type || !position || (idNode && id === undefined) || (offsetNode && offset === undefined)) return undefined
      out.push({ type, position, ...(id !== undefined ? { id } : {}), ...(offset !== undefined ? { offset } : {}) })
    }
    return out
  }
  type ParsedMarker = { type: string; color?: string; width?: number; height?: number; strokeWidth?: number }
  const literalMarker = (n: AnyNode | undefined): ParsedMarker | null | undefined => {
    if (!n) return undefined
    if (n.type === 'NullLiteral' || (n.type === 'Literal' && n.value === null)) return null
    const direct = literalString(n)
    const memberName = n.type === 'StaticMemberExpression' || n.type === 'MemberExpression' ? (n.property as AnyNode | undefined)?.name : undefined
    const markerType = (direct ?? (typeof memberName === 'string' ? memberName : '')).toLowerCase()
    if (markerType === 'arrow' || markerType === 'arrowclosed') return { type: markerType }
    if (n.type !== 'ObjectExpression') return undefined
    const typeNode = objProp(n, 'type')
    const directType = literalString(typeNode)
    const typeMember = typeNode?.type === 'StaticMemberExpression' || typeNode?.type === 'MemberExpression' ? (typeNode.property as AnyNode | undefined)?.name : undefined
    const type = (directType ?? (typeof typeMember === 'string' ? typeMember : '')).toLowerCase()
    if (type !== 'arrow' && type !== 'arrowclosed') return undefined
    const result: ParsedMarker = { type }
    const colorNode = objProp(n, 'color'); const color = literalString(colorNode)
    if (colorNode && color === undefined) return undefined
    if (color !== undefined) result.color = color
    for (const key of ['width', 'height', 'strokeWidth'] as const) {
      const valueNode = objProp(n, key); const value = literalNumber(valueNode)
      if (valueNode && value === undefined) return undefined
      if (value !== undefined) result[key] = value
    }
    return result
  }

  const droppedNodeFields = new Set<string>()
  const droppedEdgeFields = new Set<string>()
  const nodesOut: {
    id: string
    type?: string
    positionX: ExprIR
    positionY: ExprIR
    data: ExprIR
    width?: ExprIR
    height?: ExprIR
    draggable?: boolean
    selectable?: boolean
    connectable?: boolean
    focusable?: boolean
    ariaLabel?: string
    hidden?: boolean
    deletable?: boolean
    cssClass?: string
    style?: string
    parentId?: string
    extent?: [number, number, number, number]
    extentParent?: boolean
    expandParent?: boolean
    group?: boolean
    sourceHandles?: { id?: string; type: string; position: string; offset?: number }[]
    targetHandles?: { id?: string; type: string; position: string; offset?: number }[]
  }[] = []
  const edgesOut: {
    id: string
    source: string
    target: string
    sourceHandle?: string
    targetHandle?: string
    type?: string
    label?: string
    animated?: boolean
    focusable?: boolean
    ariaLabel?: string
    hidden?: boolean
    deletable?: boolean
    reconnectable?: boolean
    interactionWidth?: number
    data?: ExprIR
    cssClass?: string
    style?: string
    pathOptions?: { curvature?: number; borderRadius?: number; offset?: number }
    markerStart?: ParsedMarker
    markerEnd?: ParsedMarker | null
    waypoints?: { x: ExprIR; y: ExprIR }[]
  }[] = []
  let shapeOk = true

  const nodesArg = resolveStaticExpr(objProp(configArg, 'nodes'))
  if (nodesArg && nodesArg.type === 'ArrayExpression') {
    for (const el of (nodesArg.elements as AnyNode[] | undefined) ?? []) {
      const nodeLit = ctx.unwrap(el)
      if (!nodeLit || nodeLit.type !== 'ObjectExpression') {
        shapeOk = false
        continue
      }
      const idNode = objProp(nodeLit, 'id')
      const id = literalString(idNode)
      const positionArg = objProp(nodeLit, 'position')
      const dataArg = objProp(nodeLit, 'data')
      if (
        id === undefined ||
        !positionArg ||
        positionArg.type !== 'ObjectExpression' ||
        !dataArg ||
        dataArg.type !== 'ObjectExpression'
      ) {
        shapeOk = false
        continue
      }
      const posXNode = objProp(positionArg, 'x')
      const posYNode = objProp(positionArg, 'y')
      if (!posXNode || !posYNode) {
        shapeOk = false
        continue
      }
      const typeNode = objProp(nodeLit, 'type')
      const nodeClass = literalString(objProp(nodeLit, 'class'))
      const nodeStyle = literalString(objProp(nodeLit, 'style'))
      const widthNode = objProp(nodeLit, 'width')
      const heightNode = objProp(nodeLit, 'height')
      const typeLit = literalString(typeNode)
      const sourceHandlesNode = objProp(nodeLit, 'sourceHandles')
      const targetHandlesNode = objProp(nodeLit, 'targetHandles')
      const extentNode = objProp(nodeLit, 'extent')
      const extentParent = literalString(extentNode) === 'parent'
      const extent = (() => {
        if (extentNode?.type !== 'ArrayExpression') return undefined
        const pair = (extentNode.elements as AnyNode[] | undefined) ?? []
        if (pair.length !== 2 || pair[0]?.type !== 'ArrayExpression' || pair[1]?.type !== 'ArrayExpression') return undefined
        const lo = (pair[0].elements as AnyNode[] | undefined) ?? []
        const hi = (pair[1].elements as AnyNode[] | undefined) ?? []
        if (lo.length !== 2 || hi.length !== 2) return undefined
        const values = [literalNumber(lo[0]), literalNumber(lo[1]), literalNumber(hi[0]), literalNumber(hi[1])]
        return values.some((value) => value === undefined) ? undefined : values as [number, number, number, number]
      })()
      const sourceHandles = literalHandles(sourceHandlesNode)
      const targetHandles = literalHandles(targetHandlesNode)
      const stringFields = ['ariaLabel', 'parentId'] as const
      const boolFields = ['draggable', 'selectable', 'connectable', 'focusable', 'hidden', 'deletable', 'expandParent', 'group'] as const
      for (const k of literalObjectKeys(ctx, nodeLit)) if (!HANDLED_FLOW_NODE_FIELDS.has(k)) droppedNodeFields.add(k)
      if (typeNode && typeLit === undefined) droppedNodeFields.add('type (not a string literal)')
      if (objProp(nodeLit, 'class') && nodeClass === undefined) droppedNodeFields.add('class (not a string literal)')
      if (objProp(nodeLit, 'style') && nodeStyle === undefined) droppedNodeFields.add('style (not a string literal)')
      for (const k of stringFields) if (objProp(nodeLit, k) && literalString(objProp(nodeLit, k)) === undefined) droppedNodeFields.add(`${k} (not a string literal)`)
      for (const k of boolFields) if (objProp(nodeLit, k) && literalBool(objProp(nodeLit, k)) === undefined) droppedNodeFields.add(`${k} (not a boolean literal)`)
      if (sourceHandlesNode && sourceHandles === undefined) droppedNodeFields.add('sourceHandles (not a literal handle array)')
      if (targetHandlesNode && targetHandles === undefined) droppedNodeFields.add('targetHandles (not a literal handle array)')
      if (extentNode && !extentParent && extent === undefined) droppedNodeFields.add('extent (expected "parent" or a numeric [[minX, minY], [maxX, maxY]] literal)')
      const nodeZIndex = literalNumber(objProp(nodeLit, 'zIndex'))
      if (objProp(nodeLit, 'zIndex') && nodeZIndex === undefined) droppedNodeFields.add('zIndex (not a numeric literal)')
      nodesOut.push({
        ...(nodeZIndex !== undefined ? { zIndex: nodeZIndex } : {}),
        id,
        positionX: ctx.expr(posXNode),
        positionY: ctx.expr(posYNode),
        data: ctx.expr(dataArg),
        ...(typeLit !== undefined ? { type: typeLit } : {}),
        ...(nodeClass !== undefined ? { cssClass: nodeClass } : {}),
        ...(nodeStyle !== undefined ? { style: nodeStyle } : {}),
        ...(widthNode ? { width: ctx.expr(widthNode) } : {}),
        ...(heightNode ? { height: ctx.expr(heightNode) } : {}),
        ...Object.fromEntries(stringFields.flatMap((k) => {
          const value = literalString(objProp(nodeLit, k))
          return value === undefined ? [] : [[k, value]]
        })),
        ...Object.fromEntries(boolFields.flatMap((k) => {
          const value = literalBool(objProp(nodeLit, k))
          return value === undefined ? [] : [[k, value]]
        })),
        ...(sourceHandles !== undefined ? { sourceHandles } : {}),
        ...(targetHandles !== undefined ? { targetHandles } : {}),
        ...(extentParent ? { extentParent: true } : {}),
        ...(extent !== undefined ? { extent } : {}),
      })
    }
  } else if (nodesArg) {
    shapeOk = false
  }

  const edgesArg = resolveStaticExpr(objProp(configArg, 'edges'))
  if (edgesArg && edgesArg.type === 'ArrayExpression') {
    for (const el of (edgesArg.elements as AnyNode[] | undefined) ?? []) {
      const edgeLit = ctx.unwrap(el)
      if (!edgeLit || edgeLit.type !== 'ObjectExpression') {
        shapeOk = false
        continue
      }
      const idNode = objProp(edgeLit, 'id')
      const explicitId = literalString(idNode)
      const source = literalString(objProp(edgeLit, 'source'))
      const target = literalString(objProp(edgeLit, 'target'))
      const sourceHandleForId = literalString(objProp(edgeLit, 'sourceHandle'))
      const targetHandleForId = literalString(objProp(edgeLit, 'targetHandle'))
      if ((idNode && explicitId === undefined) || source === undefined || target === undefined) {
        shapeOk = false
        continue
      }
      const id = explicitId ?? `e-${source}${sourceHandleForId ? `-${sourceHandleForId}` : ''}-${target}${targetHandleForId ? `-${targetHandleForId}` : ''}`
      const edgeType = literalString(objProp(edgeLit, 'type'))
      const edgeLabel = literalString(objProp(edgeLit, 'label'))
      const edgeAnimated = literalBool(objProp(edgeLit, 'animated'))
      const edgeStringFields = ['sourceHandle', 'targetHandle', 'ariaLabel'] as const
      const edgeBoolFields = ['focusable', 'hidden', 'deletable', 'reconnectable'] as const
      const interactionWidth = literalNumber(objProp(edgeLit, 'interactionWidth'))
      const edgeDataNode = objProp(edgeLit, 'data')
      const edgeClass = literalString(objProp(edgeLit, 'class'))
      const edgeStyle = literalString(objProp(edgeLit, 'style'))
      const pathOptionsNode = objProp(edgeLit, 'pathOptions')
      const markerStartNode = objProp(edgeLit, 'markerStart')
      const markerEndNode = objProp(edgeLit, 'markerEnd')
      const markerStart = literalMarker(markerStartNode)
      const markerEnd = literalMarker(markerEndNode)
      const pathOptions = (() => {
        if (!pathOptionsNode) return undefined
        if (pathOptionsNode.type !== 'ObjectExpression') return null
        const result: { curvature?: number; borderRadius?: number; offset?: number } = {}
        for (const key of ['curvature', 'borderRadius', 'offset'] as const) {
          const valueNode = objProp(pathOptionsNode, key)
          const value = literalNumber(valueNode)
          if (valueNode && value === undefined) return null
          if (value !== undefined) result[key] = value
        }
        return result
      })()
      const waypointsNode = objProp(edgeLit, 'waypoints')
      const waypoints = literalPositions(waypointsNode)
      for (const k of literalObjectKeys(ctx, edgeLit)) if (!HANDLED_FLOW_EDGE_FIELDS.has(k)) droppedEdgeFields.add(k)
      if (objProp(edgeLit, 'type') && edgeType === undefined) droppedEdgeFields.add('type (not a string literal)')
      if (objProp(edgeLit, 'label') && edgeLabel === undefined) droppedEdgeFields.add('label (not a string literal)')
      if (objProp(edgeLit, 'animated') && edgeAnimated === undefined) droppedEdgeFields.add('animated (not a boolean literal)')
      for (const k of edgeStringFields) if (objProp(edgeLit, k) && literalString(objProp(edgeLit, k)) === undefined) droppedEdgeFields.add(`${k} (not a string literal)`)
      for (const k of edgeBoolFields) if (objProp(edgeLit, k) && literalBool(objProp(edgeLit, k)) === undefined) droppedEdgeFields.add(`${k} (not a boolean literal)`)
      if (objProp(edgeLit, 'interactionWidth') && interactionWidth === undefined) droppedEdgeFields.add('interactionWidth (not a numeric literal)')
      const edgeZIndex = literalNumber(objProp(edgeLit, 'zIndex'))
      if (objProp(edgeLit, 'zIndex') && edgeZIndex === undefined) droppedEdgeFields.add('zIndex (not a numeric literal)')
      if (edgeDataNode && edgeDataNode.type !== 'ObjectExpression') droppedEdgeFields.add('data (not an object literal)')
      if (objProp(edgeLit, 'class') && edgeClass === undefined) droppedEdgeFields.add('class (not a string literal)')
      if (objProp(edgeLit, 'style') && edgeStyle === undefined) droppedEdgeFields.add('style (not a string literal)')
      if (pathOptions === null) droppedEdgeFields.add('pathOptions (not a literal numeric options object)')
      if (markerStartNode && markerStart === undefined) droppedEdgeFields.add('markerStart (not a literal marker)')
      if (markerEndNode && markerEnd === undefined) droppedEdgeFields.add('markerEnd (not a literal marker or null)')
      if (waypointsNode && waypoints === undefined) droppedEdgeFields.add('waypoints (not an array literal of { x, y })')
      edgesOut.push({
        ...(edgeZIndex !== undefined ? { zIndex: edgeZIndex } : {}),
        id,
        source,
        target,
        ...(edgeType !== undefined ? { type: edgeType } : {}),
        ...(edgeLabel !== undefined ? { label: edgeLabel } : {}),
        ...(edgeAnimated !== undefined ? { animated: edgeAnimated } : {}),
        ...Object.fromEntries(edgeStringFields.flatMap((k) => {
          const value = literalString(objProp(edgeLit, k))
          return value === undefined ? [] : [[k, value]]
        })),
        ...Object.fromEntries(edgeBoolFields.flatMap((k) => {
          const value = literalBool(objProp(edgeLit, k))
          return value === undefined ? [] : [[k, value]]
        })),
        ...(interactionWidth !== undefined ? { interactionWidth } : {}),
        ...(edgeDataNode?.type === 'ObjectExpression' ? { data: ctx.expr(edgeDataNode) } : {}),
        ...(edgeClass !== undefined ? { cssClass: edgeClass } : {}),
        ...(edgeStyle !== undefined ? { style: edgeStyle } : {}),
        ...(pathOptions !== undefined && pathOptions !== null ? { pathOptions } : {}),
        ...(markerStart !== undefined && markerStart !== null ? { markerStart } : {}),
        ...(markerEndNode && markerEnd !== undefined ? { markerEnd } : {}),
        ...(waypoints !== undefined ? { waypoints } : {}),
      })
    }
  } else if (edgesArg) {
    shapeOk = false
  }

  if (!shapeOk) {
    ctx.report(
      `${factory} declaration \`${name}\`: \`nodes\`/\`edges\` must be literal arrays of object literals — each node needs a string \`id\`, a \`position: { x, y }\`, and an object-literal \`data\`; each edge needs string \`source\`/\`target\` (\`id\` is optional) — to lower natively (v1). Falling back to silent-drop.`,
    )
    return undefined
  }
  // Node data remains object-shaped, but different node types may naturally
  // carry different fields. The emitters synthesize their union shape and
  // make fields absent from any row optional.
  if (nodesOut.some((n) => n.data.kind !== 'object')) {
    ctx.report(
      `${factory} declaration \`${name}\`: every node's \`data\` must be an object literal so a native data model can be synthesized. Falling back to silent-drop.`,
    )
    return undefined
  }
  // An untyped empty seed has nothing to infer T from. An explicit
  // `createFlow<T>` / `useFlow<T>` does: preserve that public type identity
  // and let a native editor start empty, which is the ordinary creation path.
  if (nodesOut.length === 0 && genericDataType.kind === 'unknown') {
    ctx.report(
      `${factory} declaration \`${name}\`: an empty \`nodes: []\` has no literal or explicit generic to infer the row-data type from. Write \`${factory}<YourData>({ nodes: [], edges: [] })\` or seed a representative node. Falling back to silent-drop.`,
    )
    return undefined
  }

  // `minZoom`/`maxZoom` thread straight through — BOTH native constructors
  // already take them, so the runtime was never the blocker here; only this
  // reader was. A non-literal value (a variable, an expression) is left to the
  // unhandled-key warning below rather than half-lowered.
  const minZoom = literalNumber(objProp(configArg, 'minZoom'))
  const maxZoom = literalNumber(objProp(configArg, 'maxZoom'))
  const snapToGrid = literalBool(objProp(configArg, 'snapToGrid'))
  const snapGrid = literalNumber(objProp(configArg, 'snapGrid'))
  const extentNode = objProp(configArg, 'nodeExtent')
  const nodeExtent = (() => {
    if (extentNode?.type !== 'ArrayExpression') return undefined
    const pair = (extentNode.elements as AnyNode[] | undefined) ?? []
    if (pair.length !== 2 || pair[0]?.type !== 'ArrayExpression' || pair[1]?.type !== 'ArrayExpression') return undefined
    const lo = (pair[0].elements as AnyNode[] | undefined) ?? []
    const hi = (pair[1].elements as AnyNode[] | undefined) ?? []
    if (lo.length !== 2 || hi.length !== 2) return undefined
    return [literalNumber(lo[0]), literalNumber(lo[1]), literalNumber(hi[0]), literalNumber(hi[1])]
  })()
  const connectionRulesNode = objProp(configArg, 'connectionRules')
  const defaultMarkerEndNode = objProp(configArg, 'defaultMarkerEnd')
  const defaultMarkerEnd = literalMarker(defaultMarkerEndNode)
  const interactionBoolKeys = ['nodesDraggable', 'nodesConnectable', 'nodesSelectable', 'nodesFocusable', 'edgesFocusable', 'disableKeyboardA11y', 'nodesDeletable', 'edgesDeletable', 'edgesReconnectable', 'pannable', 'panOnDrag', 'panOnScroll', 'zoomable', 'zoomOnScroll', 'zoomOnPinch', 'zoomOnDoubleClick', 'selectionOnDrag', 'multiSelect', 'onlyRenderVisibleElements', 'snapToObjects', 'autoHistory', 'reducedMotion', 'preventScrolling', 'elevateNodesOnSelect', 'elevateEdgesOnSelect', 'autoPanOnNodeDrag', 'autoPanOnConnect'] as const
  const interactionBools = Object.fromEntries(interactionBoolKeys.flatMap((key) => { const value = literalBool(objProp(configArg, key)); return value === undefined ? [] : [[key, value]] })) as Partial<Record<(typeof interactionBoolKeys)[number], boolean>>
  const panOnDragNode = objProp(configArg, 'panOnDrag')
  const panOnDragButtons = panOnDragNode?.type === 'ArrayExpression'
    ? ((panOnDragNode.elements as AnyNode[] | undefined) ?? []).map(literalNumber)
    : undefined
  if (panOnDragButtons && panOnDragButtons.every((value) => value !== undefined)) {
    // Native phone/tablet input is the primary pointer (`button === 0` on
    // web). Preserve the array contract for that platform-relevant pointer:
    // `[0]` pans, while the Figma-style `[1, 2]` reserves touch drag for selection.
    interactionBools.panOnDrag = panOnDragButtons.includes(0)
  }
  const reducedMotionNode = objProp(configArg, 'reducedMotion')
  const reducedMotionAuto = literalString(reducedMotionNode) === 'auto'
  const edgeInteractionWidth = literalNumber(objProp(configArg, 'edgeInteractionWidth'))
  const connectionRadius = literalNumber(objProp(configArg, 'connectionRadius'))
  const panOnScrollSpeed = literalNumber(objProp(configArg, 'panOnScrollSpeed'))
  const nullableString = (key: string): string | null | undefined => {
    const configValue = objProp(configArg, key)
    if (configValue === undefined) return undefined
    if (configValue.type === 'Literal' && configValue.value === null) return null
    return literalString(configValue)
  }
  const modifierKeys = ['multiSelectionKey', 'selectionKey', 'zoomActivationKey'] as const
  const modifiers = Object.fromEntries(modifierKeys.flatMap((key) => {
    const value = nullableString(key)
    return value === undefined || (value !== null && !['shift', 'ctrl', 'meta', 'alt'].includes(value)) ? [] : [[key, value]]
  })) as Partial<Record<(typeof modifierKeys)[number], string | null>>
  const deleteKeysNode = objProp(configArg, 'deleteKeys')
  const deleteKeys = (() => {
    if (deleteKeysNode === undefined) return undefined
    if (deleteKeysNode.type === 'Literal' && deleteKeysNode.value === null) return null
    if (deleteKeysNode.type !== 'ArrayExpression') return undefined
    const values = ((deleteKeysNode.elements as AnyNode[] | undefined) ?? []).map(literalString)
    return values.some((value) => value === undefined) ? undefined : values as string[]
  })()
  const defaultEdgeType = literalString(objProp(configArg, 'defaultEdgeType'))
  const connectionLineType = literalString(objProp(configArg, 'connectionLineType'))
  const selectionMode = literalString(objProp(configArg, 'selectionMode'))
  const connectionMode = literalString(objProp(configArg, 'connectionMode'))
  const autoPanSpeed = literalNumber(objProp(configArg, 'autoPanSpeed'))
  const defaultEdgeOptionsNode = objProp(configArg, 'defaultEdgeOptions')
  const defaultEdgeOptions = (() => {
    if (defaultEdgeOptionsNode === undefined) return undefined
    if (defaultEdgeOptionsNode.type !== 'ObjectExpression') return null
    const out: NonNullable<FlowStatePayload['defaultEdgeOptions']> = {}
    const stringKeys = ['type', 'label', 'ariaLabel'] as const
    const boolKeys = ['animated', 'focusable', 'hidden', 'deletable', 'reconnectable'] as const
    for (const key of stringKeys) {
      const valueNode = objProp(defaultEdgeOptionsNode, key); const value = literalString(valueNode)
      if (valueNode && value === undefined) return null
      if (value !== undefined) out[key] = value
    }
    for (const key of boolKeys) {
      const valueNode = objProp(defaultEdgeOptionsNode, key); const value = literalBool(valueNode)
      if (valueNode && value === undefined) return null
      if (value !== undefined) out[key] = value
    }
    const widthNode = objProp(defaultEdgeOptionsNode, 'interactionWidth'); const width = literalNumber(widthNode)
    if (widthNode && width === undefined) return null
    if (width !== undefined) out.interactionWidth = width
    const pathNode = objProp(defaultEdgeOptionsNode, 'pathOptions')
    if (pathNode) {
      if (pathNode.type !== 'ObjectExpression') return null
      const path: { curvature?: number; borderRadius?: number; offset?: number } = {}
      for (const key of ['curvature', 'borderRadius', 'offset'] as const) {
        const valueNode = objProp(pathNode, key); const value = literalNumber(valueNode)
        if (valueNode && value === undefined) return null
        if (value !== undefined) path[key] = value
      }
      if (literalObjectKeys(ctx, pathNode).some((key) => !['curvature', 'borderRadius', 'offset'].includes(key))) return null
      out.pathOptions = path
    }
    const markerStartNode = objProp(defaultEdgeOptionsNode, 'markerStart'); const markerStart = literalMarker(markerStartNode)
    const markerEndNode = objProp(defaultEdgeOptionsNode, 'markerEnd'); const markerEnd = literalMarker(markerEndNode)
    if (markerStartNode && (markerStart === undefined || markerStart === null)) return null
    if (markerEndNode && markerEnd === undefined) return null
    if (markerStart !== undefined && markerStart !== null) out.markerStart = markerStart
    if (markerEndNode && markerEnd !== undefined) out.markerEnd = markerEnd
    const handled = new Set([...stringKeys, ...boolKeys, 'interactionWidth', 'pathOptions', 'markerStart', 'markerEnd'])
    if (literalObjectKeys(ctx, defaultEdgeOptionsNode).some((key) => !handled.has(key))) return null
    return out
  })()
  const fitView = literalBool(objProp(configArg, 'fitView'))
  const fitViewPadding = literalNumber(objProp(configArg, 'fitViewPadding'))
  const historyLimit = literalNumber(objProp(configArg, 'historyLimit'))
  const connectionRules = (() => {
    if (connectionRulesNode === undefined) return undefined
    if (connectionRulesNode.type !== 'ObjectExpression') return null
    const out: Record<string, string[]> = {}
    for (const prop of (connectionRulesNode.properties as AnyNode[] | undefined) ?? []) {
      if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') return null
      // A computed key (`{ [kind]: … }`) is only known at runtime → not a literal map.
      const key = ctx.propKey(prop)
      const rule = ctx.unwrap(prop.value)
      const outputs = rule?.type === 'ObjectExpression' ? objProp(rule, 'outputs') : undefined
      if (key === undefined || outputs?.type !== 'ArrayExpression') return null
      const values = ((outputs.elements as AnyNode[] | undefined) ?? []).map(literalString)
      if (values.some((value) => value === undefined)) return null
      out[key] = values as string[]
    }
    return out
  })()
  const validatorNode = objProp(configArg, 'isValidConnection')
  const connectionValidator = validatorNode !== undefined ? ctx.expr(validatorNode) : undefined

  // Every OTHER key the user wrote lowers to NOTHING. That is a behavioural
  // divergence from the same source line — `createFlow({ …, fitView: true })`
  // auto-fits on web and does not natively; `minZoom: 0.5` clamps zoom to 2x on
  // web and 4x natively — and it used to happen in total silence, which is what
  // makes this class expensive: the code compiles, runs, and is simply wrong on
  // one target. Naming the keys is the whole fix; the alternative (guessing a
  // native equivalent for `snapToGrid`) would be worse than saying so.
  // Node/edge FIELDS the native types do not carry — the same silent-drop
  // class as the config keys below, one level down (#3303 named the keys and
  // stopped there; `parentId`/`markerEnd`/`sourceHandle`/… still vanished).
  if (droppedNodeFields.size > 0) {
    ctx.report(droppedFlowFieldsWarning(`${factory} declaration \`${name}\``, 'node', [...droppedNodeFields]))
  }
  if (droppedEdgeFields.size > 0) {
    ctx.report(droppedFlowFieldsWarning(`${factory} declaration \`${name}\``, 'edge', [...droppedEdgeFields]))
  }
  const HANDLED_FLOW_CONFIG_KEYS = new Set(['nodes', 'edges', 'minZoom', 'maxZoom', 'snapToGrid', 'snapGrid', 'nodeExtent', 'defaultMarkerEnd', 'connectionRules', 'isValidConnection', ...interactionBoolKeys, 'edgeInteractionWidth', 'connectionRadius', 'panOnScrollSpeed', 'deleteKeys', ...modifierKeys, 'defaultEdgeType', 'connectionLineType', 'selectionMode', 'connectionMode', 'autoPanSpeed', 'defaultEdgeOptions', 'fitView', 'fitViewPadding', 'historyLimit'])
  const droppedKeys: string[] = []
  for (const prop of (configArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (ctx.hasDynamicKey(prop)) {
      droppedKeys.push(`${ctx.dynamicKeyText(prop)} (computed key)`)
      continue
    }
    const keyName = ctx.propKey(prop)
    if (keyName === undefined || HANDLED_FLOW_CONFIG_KEYS.has(keyName)) continue
    droppedKeys.push(keyName)
  }
  // `minZoom`/`maxZoom` written as a NON-literal are handled but unlowerable —
  // report them here too rather than letting a variable silently take defaults.
  for (const k of ['minZoom', 'maxZoom'] as const) {
    if (objProp(configArg, k) !== undefined && literalNumber(objProp(configArg, k)) === undefined) {
      droppedKeys.push(`${k} (not a numeric literal)`)
    }
  }
  if (objProp(configArg, 'snapToGrid') !== undefined && snapToGrid === undefined) droppedKeys.push('snapToGrid (not a boolean literal)')
  if (objProp(configArg, 'snapGrid') !== undefined && snapGrid === undefined) droppedKeys.push('snapGrid (not a numeric literal)')
  if (extentNode !== undefined && (nodeExtent === undefined || nodeExtent.some((n) => n === undefined))) droppedKeys.push('nodeExtent (not a numeric [[minX, minY], [maxX, maxY]] literal)')
  if (connectionRules === null) droppedKeys.push('connectionRules (not a literal { type: { outputs: string[] } } map)')
  if (defaultMarkerEndNode && defaultMarkerEnd === undefined) droppedKeys.push('defaultMarkerEnd (not a literal marker or null)')
  for (const key of interactionBoolKeys) {
    const valueNode = objProp(configArg, key)
    if (!valueNode || literalBool(valueNode) !== undefined) continue
    if (key === 'panOnDrag' && panOnDragButtons?.every((value) => value !== undefined)) continue
    if (key === 'reducedMotion' && reducedMotionAuto) continue
    droppedKeys.push(`${key} (not a supported literal)`)
  }
  if (objProp(configArg, 'edgeInteractionWidth') && edgeInteractionWidth === undefined) droppedKeys.push('edgeInteractionWidth (not a numeric literal)')
  if (objProp(configArg, 'connectionRadius') && connectionRadius === undefined) droppedKeys.push('connectionRadius (not a numeric literal)')
  if (objProp(configArg, 'panOnScrollSpeed') && panOnScrollSpeed === undefined) droppedKeys.push('panOnScrollSpeed (not a numeric literal)')
  if (deleteKeysNode !== undefined && deleteKeys === undefined) droppedKeys.push('deleteKeys (expected a string[] literal or null)')
  for (const key of modifierKeys) {
    const value = nullableString(key)
    if (objProp(configArg, key) !== undefined && (value === undefined || (value !== null && !['shift', 'ctrl', 'meta', 'alt'].includes(value)))) droppedKeys.push(`${key} (expected shift, ctrl, meta, alt, or null)`)
  }
  if (objProp(configArg, 'defaultEdgeType') && defaultEdgeType === undefined) droppedKeys.push('defaultEdgeType (not a string literal)')
  if (objProp(configArg, 'connectionLineType') && connectionLineType === undefined) droppedKeys.push('connectionLineType (not a string literal)')
  if (objProp(configArg, 'selectionMode') && !['partial', 'full'].includes(selectionMode ?? '')) droppedKeys.push('selectionMode (expected "partial" or "full")')
  if (objProp(configArg, 'connectionMode') && !['strict', 'loose'].includes(connectionMode ?? '')) droppedKeys.push('connectionMode (expected "strict" or "loose")')
  if (objProp(configArg, 'autoPanSpeed') && autoPanSpeed === undefined) droppedKeys.push('autoPanSpeed (not a numeric literal)')
  if (defaultEdgeOptions === null) droppedKeys.push('defaultEdgeOptions (not a supported literal edge-options object)')
  if (objProp(configArg, 'fitView') && fitView === undefined) droppedKeys.push('fitView (not a boolean literal)')
  if (objProp(configArg, 'fitViewPadding') && fitViewPadding === undefined) droppedKeys.push('fitViewPadding (not a numeric literal)')
  if (objProp(configArg, 'historyLimit') && historyLimit === undefined) droppedKeys.push('historyLimit (not a numeric literal)')
  if (droppedKeys.length > 0) {
    ctx.report(
      `${factory} declaration \`${name}\`: ${droppedKeys.map((k) => `\`${k}\``).join(', ')} ` +
        `${droppedKeys.length === 1 ? 'is' : 'are'} NOT lowered natively — the native PyreonFlowState ` +
        `uses its own defaults, so this diagram behaves differently on web than on iOS/Android from ` +
        `the SAME source. Literal node/edge seeds, zoom limits, grid snapping, and node extents cross today. ` +
        `Set the rest from hand-written native code, or keep the JSX editor on the \`@pyreon/flow/webview\` bridge.`,
    )
  }

  const payload: FlowStatePayload = {
    ...(factory === 'useFlow' ? { lifecycleOwned: true } : {}),
    ...(genericDataType.kind !== 'unknown' ? { dataType: genericDataType } : {}),
    nodes: nodesOut,
    edges: edgesOut,
    ...(minZoom !== undefined ? { minZoom } : {}),
    ...(maxZoom !== undefined ? { maxZoom } : {}),
    ...(snapToGrid !== undefined ? { snapToGrid } : {}),
    ...(snapGrid !== undefined ? { snapGrid } : {}),
    ...(nodeExtent !== undefined && nodeExtent.every((n) => n !== undefined) ? { nodeExtent: nodeExtent as [number, number, number, number] } : {}),
    ...(defaultMarkerEndNode && defaultMarkerEnd !== undefined ? { defaultMarkerEnd } : {}),
    ...interactionBools,
    ...(edgeInteractionWidth !== undefined ? { edgeInteractionWidth } : {}),
    ...(connectionRadius !== undefined ? { connectionRadius } : {}),
    ...(panOnScrollSpeed !== undefined ? { panOnScrollSpeed } : {}),
    ...(deleteKeys !== undefined ? { deleteKeys } : {}),
    ...modifiers,
    ...(defaultEdgeType !== undefined ? { defaultEdgeType } : {}),
    ...(connectionLineType !== undefined ? { connectionLineType } : {}),
    ...(selectionMode === 'partial' || selectionMode === 'full' ? { selectionMode } : {}),
    ...(connectionMode === 'strict' || connectionMode === 'loose' ? { connectionMode } : {}),
    ...(autoPanSpeed !== undefined ? { autoPanSpeed } : {}),
    ...(defaultEdgeOptions !== undefined && defaultEdgeOptions !== null ? { defaultEdgeOptions } : {}),
    ...(fitView !== undefined ? { fitView } : {}),
    ...(fitViewPadding !== undefined ? { fitViewPadding } : {}),
    ...(historyLimit !== undefined ? { historyLimit } : {}),
    ...(connectionRules !== undefined && connectionRules !== null ? { connectionRules } : {}),
    ...(connectionValidator !== undefined ? { connectionValidator } : {}),
  }
  return { type: FLOW_STATE_TYPE, payload: payload as unknown as ExtPayload }
}
