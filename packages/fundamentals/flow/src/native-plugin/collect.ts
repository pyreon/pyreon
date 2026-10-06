/**
 * Per-file collection for the flow lowering: renderer components, static
 * handles, node resizers and toolbars. See {@link FlowFile}.
 */
import { type ComponentIR, type EmitContext, type EmitPreparation, type ExprIR } from '@pyreon/native-compiler/plugin-api'
import { collectFlowRendererComponents, nodeResizerTargetsAnotherNode } from './lowering'

export type StaticFlowHandle = { id?: string; type: string; position: string; offset?: number }

export type StaticFlowNodeResizer = { minWidth: number; minHeight: number; handleSize: number; showEdgeHandles: boolean }

export type StaticFlowNodeToolbar = {
  position: string
  align: string
  offset: number
  showOnSelect: boolean
  selectedOverride?: boolean
  nodeIdOverride?: string
  contentComponent: string
}

/**
 * Everything the flow lowering learns about the file's components BEFORE any
 * of them is emitted: which components render flow nodes / edges, and the
 * static handle / resizer / toolbar configuration each node renderer declares.
 * Both targets read the same record (the collection is target-neutral).
 */
export interface FlowFile {
  /** Components a `<Flow>` renders nodes, edges or the connection line with. */
  renderers: Set<string>
  /** The NODE renderers among them (where a toolbar / resizer means something). */
  nodeRenderers: Set<string>
  handles: Map<string, StaticFlowHandle[]>
  invalidHandles: Set<string>
  resizers: Map<string, StaticFlowNodeResizer>
  invalidResizers: Set<string>
  foreignResizers: Set<string>
  toolbars: Map<string, StaticFlowNodeToolbar[]>
  invalidToolbars: Set<string>
  /** Toolbar elements the up-front extraction lifted into their own components (by identity). */
  extractedToolbars: WeakSet<ExprIR>
}

const FILE_KEY = '@pyreon/flow:file'

/** The per-file record (created empty on first read; `prepareFlowFile` fills it). */
export function flowFileOf(ctx: EmitContext): FlowFile {
  return ctx.fileState<FlowFile>(FILE_KEY, () => ({
    renderers: new Set(),
    nodeRenderers: new Set(),
    handles: new Map(),
    invalidHandles: new Set(),
    resizers: new Map(),
    invalidResizers: new Set(),
    foreignResizers: new Set(),
    toolbars: new Map(),
    invalidToolbars: new Set(),
    extractedToolbars: new WeakSet(),
  }))
}

export function collectStaticFlowNodeToolbars(expr: ExprIR): Extract<ExprIR, { kind: 'jsx-element' }>[] {
  if (expr.kind !== 'jsx-fragment' && expr.kind !== 'jsx-element') return []
  if (expr.kind === 'jsx-element' && expr.tag === 'NodeToolbar') return [expr]
  return expr.children.flatMap((child) => child.kind === 'expr' ? collectStaticFlowNodeToolbars(child.expr) : [])
}

export function collectStaticFlowNodeResizer(expr: ExprIR, propsParamName?: string): { config?: StaticFlowNodeResizer; invalid: boolean; foreignNodeId?: boolean } {
  if (expr.kind !== 'jsx-fragment' && expr.kind !== 'jsx-element') return { invalid: false }
  if (expr.kind === 'jsx-element' && expr.tag === 'NodeResizer') {
    const read = (name: string): string | number | boolean | undefined => {
      const attr = expr.attrs.find((entry) => entry.kind === 'attr' && entry.name === name)
      return attr?.kind === 'attr' && attr.value.kind === 'literal' ? attr.value.value ?? undefined : undefined
    }
    const invalid = ['minWidth', 'minHeight', 'handleSize'].some((name) => expr.attrs.some((entry) => entry.kind === 'attr' && entry.name === name) && typeof read(name) !== 'number') ||
      expr.attrs.some((entry) => entry.kind === 'attr' && entry.name === 'showEdgeHandles') && typeof read('showEdgeHandles') !== 'boolean'
    return { invalid, foreignNodeId: nodeResizerTargetsAnotherNode(expr, propsParamName), config: {
      minWidth: typeof read('minWidth') === 'number' ? read('minWidth') as number : 50,
      minHeight: typeof read('minHeight') === 'number' ? read('minHeight') as number : 30,
      handleSize: typeof read('handleSize') === 'number' ? read('handleSize') as number : 8,
      showEdgeHandles: read('showEdgeHandles') === true,
    } }
  }
  for (const child of expr.children) if (child.kind === 'expr') {
    const found = collectStaticFlowNodeResizer(child.expr, propsParamName)
    if (found.config || found.invalid) return found
  }
  return { invalid: false }
}

export function collectStaticFlowHandles(expr: ExprIR): { handles: StaticFlowHandle[]; invalid: boolean } {
  if (expr.kind === 'jsx-fragment' || expr.kind === 'jsx-element') {
    const nested = expr.children
      .filter((child) => child.kind === 'expr')
      .map((child) => collectStaticFlowHandles(child.expr))
    if (expr.kind === 'jsx-fragment' || expr.tag !== 'Handle') return { handles: nested.flatMap((entry) => entry.handles), invalid: nested.some((entry) => entry.invalid) }
  } else return { handles: [], invalid: false }
  const attr = (name: string) => expr.attrs.find((entry) => entry.kind === 'attr' && entry.name === name)
  const literal = (name: string): string | number | undefined => {
    const entry = attr(name)
    if (entry?.kind !== 'attr') return undefined
    if (entry.value.kind === 'literal' && (typeof entry.value.value === 'string' || typeof entry.value.value === 'number')) return entry.value.value
    if (entry.value.kind === 'member' && entry.value.object.kind === 'identifier' && entry.value.object.name === 'Position') return entry.value.property.toLowerCase()
    return undefined
  }
  const type = literal('type'), position = literal('position'), id = literal('id'), offset = literal('offset')
  if (typeof type !== 'string' || typeof position !== 'string') {
    return { handles: [], invalid: true }
  }
  return { handles: [{ ...(typeof id === 'string' ? { id } : {}), type, position, ...(typeof offset === 'number' ? { offset } : {}) }], invalid: false }
}

/**
 * The file-level preparation both emitters run before emitting any component:
 * record the renderer components, extract each node renderer's static handles,
 * resizer and toolbars, and hand back the synthesized components the toolbar
 * contents become (emitted after the file's own).
 */
export const prepareFlowFile: EmitPreparation = ({ components, moduleConst }, ctx) => {
  const file = flowFileOf(ctx)
  file.renderers = collectFlowRendererComponents(components, moduleConst)
  file.nodeRenderers = collectFlowRendererComponents(components, moduleConst, 'nodeTypes')
  const flowToolbarComponents: ComponentIR[] = []
  const usedComponentNames = new Set(components.map((component) => component.name))
  for (const component of components) {
    const result = collectStaticFlowHandles(component.returnExpr)
    file.handles.set(component.name, result.handles)
    if (result.invalid) file.invalidHandles.add(component.name)
    const resizer = collectStaticFlowNodeResizer(component.returnExpr, component.propsParamName)
    if (resizer.config) file.resizers.set(component.name, resizer.config)
    if (resizer.invalid) file.invalidResizers.add(component.name)
    if (resizer.foreignNodeId) file.foreignResizers.add(component.name)
    const toolbars = collectStaticFlowNodeToolbars(component.returnExpr)
    for (const toolbar of toolbars) file.extractedToolbars.add(toolbar)
    if (toolbars.length > 0) {
      const parsedToolbars: StaticFlowNodeToolbar[] = []
      for (const [toolbarIndex, toolbar] of toolbars.entries()) {
      let contentComponent = `${component.name}PyreonNodeToolbar${toolbarIndex || ''}`
      while (usedComponentNames.has(contentComponent)) contentComponent += '_'
      usedComponentNames.add(contentComponent)
      const read = (name: string): unknown => {
        const entry = toolbar.attrs.find((candidate) => candidate.kind === 'attr' && candidate.name === name)
        return entry?.kind === 'attr' && entry.value.kind === 'literal' ? entry.value.value : undefined
      }
      const has = (name: string): boolean => toolbar.attrs.some((entry) => entry.kind === 'attr' && entry.name === name)
      const selectedExpr = toolbar.attrs.find((entry) => entry.kind === 'attr' && entry.name === 'selected')
      const selectedValue = selectedExpr?.kind === 'attr' ? selectedExpr.value : undefined
      const selectedUsesNode = selectedValue?.kind === 'identifier' && selectedValue.name === 'selected' || selectedValue?.kind === 'member' && selectedValue.property === 'selected'
      const nodeIdExpr = toolbar.attrs.find((entry) => entry.kind === 'attr' && entry.name === 'nodeId')
      const nodeIdValue = nodeIdExpr?.kind === 'attr' ? nodeIdExpr.value : undefined
      const nodeIdUsesNode = nodeIdValue?.kind === 'identifier' && (nodeIdValue.name === 'id' || nodeIdValue.name === 'nodeId') || nodeIdValue?.kind === 'member' && (nodeIdValue.property === 'id' || nodeIdValue.property === 'nodeId')
      const position = read('position'), align = read('align'), offset = read('offset'), showOnSelect = read('showOnSelect'), selected = read('selected'), nodeId = read('nodeId')
      const invalid = (has('position') && typeof position !== 'string') ||
        (has('align') && typeof align !== 'string') ||
        (has('offset') && typeof offset !== 'number') ||
        (has('showOnSelect') && typeof showOnSelect !== 'boolean') ||
        (has('selected') && typeof selected !== 'boolean' && !selectedUsesNode) ||
        (has('nodeId') && typeof nodeId !== 'string' && !nodeIdUsesNode)
      parsedToolbars.push({
        position: typeof position === 'string' ? position : 'top',
        align: typeof align === 'string' ? align : 'center',
        offset: typeof offset === 'number' ? offset : 8,
        showOnSelect: typeof showOnSelect === 'boolean' ? showOnSelect : true,
        ...(!selectedUsesNode ? { selectedOverride: typeof selected === 'boolean' ? selected : false } : {}),
        ...(typeof nodeId === 'string' ? { nodeIdOverride: nodeId } : {}),
        contentComponent,
      })
      if (invalid) file.invalidToolbars.add(component.name)
      flowToolbarComponents.push({
        ...component,
        name: contentComponent,
        returnExpr: { kind: 'jsx-fragment', children: toolbar.children },
      })
      }
      file.toolbars.set(component.name, parsedToolbars)
    }
  }
  return { components: flowToolbarComponents }
}
