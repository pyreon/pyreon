// How `useDraggable` / `useDroppable` cross to native: the declaration, its binding, and the `ref={d.ref}` modifier.
//
//   `const { ref, isDragging } = useDraggable({ data: { id: card.id, kind: 'card' } })`
//        → a `PyreonDraggableState` bound to the data object; `ref={ref}` becomes the platform drag source
//          (SwiftUI `.onDrag`, Compose `dragAndDropSource` from a long press).
//   `const { ref, isOver, overEdge } = useDroppable({ canDrop, onDrop, edges })`
//        → a `PyreonDroppableState<Source>` bound to the callbacks; `ref={ref}` becomes the platform drop target
//          (SwiftUI `.onDrop(of:delegate:)`, Compose `dragAndDropTarget`).
//
// The payload is JSON text and the two hooks never share a type: the draggable carries a map of scalars (the object
// literal it was written with) and the droppable decodes it into the type its `onDrop` / `canDrop` parameter is
// ANNOTATED with — `(src: Card) => …`. That annotation is therefore required, and its absence is reported rather than
// guessed.
//
// What does NOT cross is reported BY NAME at the declaration, because a drag that quietly stops calling a handler is
// the failure this lowering must never have: `onDragStart` / `onDragEnd` / `preview` / `handle` / `element` / `sticky`
// have no native counterpart, `onDragEnter` cannot receive the source (the platform delivers the payload only at drop
// time), and `canDrop` is evaluated when the drop lands rather than while hovering.

import {
  staticPropKey,
  unwrapTypeLayers,
  type CallRecognizer,
  type DeclEmitter,
  type EmitContext,
  type ExprIR,
  type ExtDecl,
  type StatementIR,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

export const DND_PLUGIN = '@pyreon/dnd'
export const DRAGGABLE_TYPE = 'draggable'
export const DROPPABLE_TYPE = 'droppable'

const EDGES = new Set(['top', 'bottom', 'left', 'right'])

interface DraggablePayload {
  readonly fields: readonly { readonly name: string; readonly value: ExprIR }[]
  readonly disabled: ExprIR | null
}

interface Callback {
  readonly params: readonly string[]
  readonly body: readonly StatementIR[]
}

interface DroppablePayload {
  readonly source: TypeIR
  readonly edges: readonly string[]
  readonly canDrop: { readonly param: string; readonly expr: ExprIR } | null
  readonly onDrop: Callback | null
  readonly onDragEnter: Callback | null
  readonly onDragLeave: Callback | null
}

const draggableOf = (decl: ExtDecl): DraggablePayload => decl.payload as unknown as DraggablePayload
const droppableOf = (decl: ExtDecl): DroppablePayload => decl.payload as unknown as DroppablePayload

/** Options with no native counterpart, each with the reason — reported (never silently dropped) when written. */
const DRAGGABLE_UNSUPPORTED: Readonly<Record<string, string>> = {
  onDragStart:
    'has no native counterpart — SwiftUI reports no callback when a drag starts or ends. Read `isDragging()` for the dragging state instead',
  onDragEnd:
    'has no native counterpart — SwiftUI reports no callback when a drag ends or is cancelled. Do the work in the droppable `onDrop` instead',
  preview: 'is not used natively — the platform draws the dragged view itself',
  handle: 'is not used natively — the whole view is the drag source',
  element: 'is not used natively — attach `ref={…}` to the view instead',
}

const DROPPABLE_UNSUPPORTED: Readonly<Record<string, string>> = {
  data: "(the target's own data) is not used natively — a drop reports the SOURCE's data only",
  sticky: 'is not used natively — the platform tracks hover itself',
  element: 'is not used natively — attach `ref={…}` to the view instead',
}

/** Unwrap `() => ({ … })` / `{ … }` to the object literal, or `null`. */
function objectOf(node: AnyNode | undefined): AnyNode | null {
  const value = unwrapTypeLayers(node)
  if (value?.type === 'ObjectExpression') return value
  if (
    (value?.type === 'ArrowFunctionExpression' || value?.type === 'FunctionExpression') &&
    value.body?.type !== 'BlockStatement'
  ) {
    const body = unwrapTypeLayers(value.body)
    if (body?.type === 'ObjectExpression') return body
  }
  return null
}

const recognizeDraggable: CallRecognizer = (_call, ctx) => {
  const name = ctx.declName
  const config = unwrapTypeLayers(ctx.args[0] as AnyNode | undefined)
  if (!config || config.type !== 'ObjectExpression') {
    ctx.report(
      `useDraggable declaration \`${name}\`: argument must be an object literal { data } to lower natively. Falling back to silent-drop.`,
    )
    return undefined
  }
  let fields: { name: string; value: ExprIR }[] | null = null
  let disabled: ExprIR | null = null

  for (const prop of (config.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (ctx.hasDynamicKey(prop)) {
      ctx.warnDynamicKey(prop, `useDraggable declaration \`${name}\`: config`)
      continue
    }
    const key = staticPropKey(prop)
    if (!key) continue
    const valueNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (key === 'data') {
      const literal = objectOf(valueNode)
      if (!literal) {
        ctx.report(
          `useDraggable declaration \`${name}\`: \`data\` must be an object literal ({ id: card.id }) or an arrow returning one to lower natively — the payload is the literal's fields. Falling back to silent-drop.`,
        )
        return undefined
      }
      fields = []
      for (const field of (literal.properties as AnyNode[] | undefined) ?? []) {
        const fieldKey = field?.type === 'Property' || field?.type === 'ObjectProperty' ? staticPropKey(field) : undefined
        if (!fieldKey || ctx.hasDynamicKey(field)) {
          ctx.report(
            `useDraggable declaration \`${name}\`: every \`data\` field needs a static key (no spread, no computed key) to lower natively. Falling back to silent-drop.`,
          )
          return undefined
        }
        fields.push({ name: fieldKey, value: ctx.expr(field.value as AnyNode) })
      }
    } else if (key === 'disabled') {
      if (valueNode?.type === 'Literal' && typeof valueNode.value === 'boolean') {
        disabled = ctx.expr(valueNode as AnyNode)
      } else if (
        (valueNode?.type === 'ArrowFunctionExpression' || valueNode?.type === 'FunctionExpression') &&
        valueNode.body?.type !== 'BlockStatement'
      ) {
        disabled = ctx.expr(valueNode.body as AnyNode)
      } else {
        ctx.report(
          `useDraggable declaration \`${name}\`: \`disabled\` must be a boolean literal or an expression-body getter (\`() => locked()\`) to lower natively; it is ignored, so the view stays draggable.`,
        )
      }
    } else if (DRAGGABLE_UNSUPPORTED[key] !== undefined) {
      ctx.report(`useDraggable declaration \`${name}\`: \`${key}\` ${DRAGGABLE_UNSUPPORTED[key]}.`)
    }
  }

  if (fields === null) {
    ctx.report(
      `useDraggable declaration \`${name}\`: \`data\` is required to lower natively — it is the payload a drop receives. Falling back to silent-drop.`,
    )
    return undefined
  }
  return { type: DRAGGABLE_TYPE, payload: { fields, disabled } as never }
}

/**
 * Parse a droppable callback: its parameter names + types and its statements. An EXPRESSION body is a bare expression
 * statement, not the function declaration's `return <expr>` — the callbacks are void, and a `return` inside a Kotlin
 * lambda targets the enclosing function (and an assignment is not an expression there). `canDrop` is the exception and
 * reads the returned expression itself.
 */
function parseCallback(ctx: Parameters<CallRecognizer>[1], name: string, node: AnyNode, voidBody = true) {
  const fn = ctx.functionDeclaration(name, node)
  const body: readonly StatementIR[] =
    voidBody && node.body?.type !== 'BlockStatement'
      ? [{ kind: 'expr' as const, expr: ctx.expr(node.body as AnyNode) }]
      : fn.body
  return { params: fn.params, body }
}

const recognizeDroppable: CallRecognizer = (_call, ctx) => {
  const name = ctx.declName
  const config = unwrapTypeLayers(ctx.args[0] as AnyNode | undefined)
  if (!config || config.type !== 'ObjectExpression') {
    ctx.report(
      `useDroppable declaration \`${name}\`: argument must be an object literal { onDrop } to lower natively. Falling back to silent-drop.`,
    )
    return undefined
  }

  let source: TypeIR | null = null
  let edges: string[] = []
  let canDrop: DroppablePayload['canDrop'] = null
  let onDrop: Callback | null = null
  let onDragEnter: Callback | null = null
  let onDragLeave: Callback | null = null

  /** Record the source type from a callback's first parameter, once; report a disagreement. */
  const takeSource = (type: TypeIR, where: string): boolean => {
    if (type.kind === 'unknown') {
      ctx.report(
        `useDroppable declaration \`${name}\`: the source parameter of \`${where}\` needs a type annotation (\`(src: Card) => …\`) — the payload is JSON, and the annotation is what it is decoded into. Falling back to silent-drop.`,
      )
      return false
    }
    if (source !== null && JSON.stringify(source) !== JSON.stringify(type)) {
      ctx.report(
        `useDroppable declaration \`${name}\`: \`canDrop\` and \`onDrop\` annotate different source types — a droppable decodes ONE payload type. Falling back to silent-drop.`,
      )
      return false
    }
    source = type
    return true
  }

  for (const prop of (config.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (ctx.hasDynamicKey(prop)) {
      ctx.warnDynamicKey(prop, `useDroppable declaration \`${name}\`: config`)
      continue
    }
    const key = staticPropKey(prop)
    if (!key) continue
    const valueNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    const isFn = valueNode?.type === 'ArrowFunctionExpression' || valueNode?.type === 'FunctionExpression'

    if (key === 'edges') {
      if (valueNode?.type !== 'ArrayExpression') continue
      edges = ((valueNode.elements as AnyNode[] | undefined) ?? [])
        .map((el) => (el?.type === 'Literal' && typeof el.value === 'string' ? (el.value as string) : ''))
        .filter((edge) => EDGES.has(edge))
    } else if (key === 'canDrop') {
      if (!isFn) continue
      const fn = parseCallback(ctx, `${name}_canDrop`, valueNode, false)
      const only = fn.body.length === 1 ? fn.body[0] : undefined
      const first = fn.params[0]
      if (only?.kind !== 'return' || only.expr === undefined || first === undefined) {
        ctx.report(
          `useDroppable declaration \`${name}\`: \`canDrop\` must be a one-parameter expression-body arrow (\`(src: Card) => src.kind === 'card'\`) to lower natively — dropping it would accept drops the web rejects. Falling back to silent-drop.`,
        )
        return undefined
      }
      if (!takeSource(first.type, 'canDrop')) return undefined
      canDrop = { param: first.name, expr: only.expr }
    } else if (key === 'onDrop') {
      if (!isFn) continue
      const fn = parseCallback(ctx, `${name}_onDrop`, valueNode)
      const first = fn.params[0]
      if (first === undefined) {
        ctx.report(
          `useDroppable declaration \`${name}\`: \`onDrop\` must take the source as its first parameter (\`(src: Card, loc) => …\`) to lower natively. Falling back to silent-drop.`,
        )
        return undefined
      }
      if (!takeSource(first.type, 'onDrop')) return undefined
      onDrop = { params: fn.params.map((p) => p.name), body: fn.body }
    } else if (key === 'onDragEnter' || key === 'onDragLeave') {
      if (!isFn) continue
      const fn = parseCallback(ctx, `${name}_${key}`, valueNode)
      if (fn.params.length > 0) {
        ctx.report(
          `useDroppable declaration \`${name}\`: \`${key}\` cannot receive the source natively — the platform delivers the payload only when the drop lands. Read \`isOver()\` for hover state; the callback is ignored.`,
        )
        continue
      }
      const callback = { params: [], body: fn.body }
      if (key === 'onDragEnter') onDragEnter = callback
      else onDragLeave = callback
    } else if (DROPPABLE_UNSUPPORTED[key] !== undefined) {
      ctx.report(`useDroppable declaration \`${name}\`: \`${key}\` ${DROPPABLE_UNSUPPORTED[key]}.`)
    }
  }

  if (source === null) {
    ctx.report(
      `useDroppable declaration \`${name}\`: needs \`onDrop\` (or \`canDrop\`) with an ANNOTATED source parameter (\`(src: Card) => …\`) to lower natively — the payload is JSON and the annotation is what it decodes into. Falling back to silent-drop.`,
    )
    return undefined
  }
  return { type: DROPPABLE_TYPE, payload: { source, edges, canDrop, onDrop, onDragEnter, onDragLeave } as never }
}

export const dragDropCalls = { useDraggable: recognizeDraggable, useDroppable: recognizeDroppable }

const swiftEdge = (edge: string): string => `.${edge}`
const kotlinEdge = (edge: string): string => `PyreonDropEdge.${edge.toUpperCase()}`

/** A callback body as closure statements, indented under the closure's opening line. */
function bodyLines(ctx: EmitContext, body: readonly StatementIR[], at: number, pad: string): string[] {
  return body.length === 0 ? [''] : ctx.statements(body, at).map((line) => `${pad}${line}`)
}

const draggableDecl: DeclEmitter = {
  lifecycle: {
    // A `.onAppear` on a transparent conditional would restart with every branch flip (see `DeclLifecycle.stableHost`).
    stableHost: true,
    midOrder: 20,
    swift(decl, ctx) {
      const { fields, disabled } = draggableOf(decl)
      const name = ctx.ident(decl.name)
      const data = fields.length === 0 ? '[:]' : `[${fields.map((f) => `"${f.name}": PyreonDragValue(${ctx.expr(f.value, 10)})`).join(', ')}]`
      const off = disabled === null ? '' : `, disabled: { ${ctx.expr(disabled, 10)} }`
      return [`.onAppear {`, `  ${name}.bind(data: { ${data} }${off})`, `}`]
    },
    kotlin(decl, ctx) {
      const { fields, disabled } = draggableOf(decl)
      const name = ctx.ident(decl.name)
      const data = fields.length === 0 ? 'emptyMap()' : `mapOf(${fields.map((f) => `"${f.name}" to ${ctx.expr(f.value, 2)}`).join(', ')})`
      const off = disabled === null ? '' : `, { ${ctx.expr(disabled, 2)} }`
      return [`${name}.bind({ ${data} }${off})`]
    },
  },
  swift(decl, ctx) {
    return `@State private var ${ctx.ident(decl.name)} = PyreonDraggableState()`
  },
  kotlin(decl, ctx) {
    return `val ${ctx.ident(decl.name)} = remember { PyreonDraggableState() }`
  },
}

const droppableDecl: DeclEmitter = {
  lifecycle: {
    stableHost: true,
    midOrder: 20,
    swift(decl, ctx) {
      const { canDrop, onDrop, onDragEnter, onDragLeave } = droppableOf(decl)
      const name = ctx.ident(decl.name)
      const lines: string[] = [`.onAppear {`, `  ${name}.bind(`]
      const parts: string[][] = []
      if (canDrop) parts.push([`    canDrop: { ${ctx.ident(canDrop.param)} in ${ctx.expr(canDrop.expr, 10)} }`])
      if (onDrop) {
        const [src, loc] = onDrop.params
        parts.push([
          `    onDrop: { ${ctx.ident(src as string)}, ${loc === undefined ? '_' : ctx.ident(loc)} in`,
          ...bodyLines(ctx, onDrop.body, 10, '      '),
          `    }`,
        ])
      }
      if (onDragEnter) parts.push([`    onDragEnter: {`, ...bodyLines(ctx, onDragEnter.body, 10, '      '), `    }`])
      if (onDragLeave) parts.push([`    onDragLeave: {`, ...bodyLines(ctx, onDragLeave.body, 10, '      '), `    }`])
      parts.forEach((part, i) => {
        const last = part.length - 1
        lines.push(...part.map((line, j) => (j === last && i < parts.length - 1 ? `${line},` : line)))
      })
      lines.push(`  )`, `}`)
      return lines
    },
    kotlin(decl, ctx) {
      const { canDrop, onDrop, onDragEnter, onDragLeave } = droppableOf(decl)
      const name = ctx.ident(decl.name)
      const lines: string[] = [`${name}.bind(`]
      const parts: string[][] = []
      if (canDrop) parts.push([`  canDrop = { ${ctx.ident(canDrop.param)} -> ${ctx.expr(canDrop.expr, 4)} }`])
      if (onDrop) {
        const [src, loc] = onDrop.params
        parts.push([
          `  onDrop = { ${ctx.ident(src as string)}, ${loc === undefined ? '_' : ctx.ident(loc)} ->`,
          ...bodyLines(ctx, onDrop.body, 4, '    '),
          `  }`,
        ])
      }
      if (onDragEnter) parts.push([`  onDragEnter = {`, ...bodyLines(ctx, onDragEnter.body, 4, '    '), `  }`])
      if (onDragLeave) parts.push([`  onDragLeave = {`, ...bodyLines(ctx, onDragLeave.body, 4, '    '), `  }`])
      parts.forEach((part, i) => {
        const last = part.length - 1
        lines.push(...part.map((line, j) => (j === last && i < parts.length - 1 ? `${line},` : line)))
      })
      lines.push(`)`)
      return lines
    },
  },
  swift(decl, ctx) {
    const { source, edges } = droppableOf(decl)
    const edgeArg = edges.length === 0 ? '' : `edges: [${edges.map(swiftEdge).join(', ')}]`
    return `@State private var ${ctx.ident(decl.name)} = PyreonDroppableState<${ctx.rowType(source)}>(${edgeArg})`
  },
  kotlin(decl, ctx) {
    const { source, edges } = droppableOf(decl)
    const type = ctx.rowType(source)
    const edgeList = edges.length === 0 ? 'emptyList()' : `listOf(${edges.map(kotlinEdge).join(', ')})`
    return `val ${ctx.ident(decl.name)} = remember { PyreonDroppableState<${type}>(${edgeList}, { pyreonDecodeDrag<${type}>(it) }) }`
  },
}

export const dragDropDecls = { [DRAGGABLE_TYPE]: draggableDecl, [DROPPABLE_TYPE]: droppableDecl }

/**
 * `ref={d.ref}` where `d` is a `useDraggable` / `useDroppable` declaration → the platform drag source / drop target.
 * `undefined` for every other ref, which keeps its existing behaviour (and falls through to the sortable lowering).
 */
export function dragDropRef(
  ref: ExprIR,
  ctx: EmitContext,
  quote: (modifier: string, name: string) => string,
): string | undefined {
  if (ref.kind !== 'member' || ref.property !== 'ref' || ref.object.kind !== 'identifier') return undefined
  const name = ref.object.name
  if (ctx.decls(DND_PLUGIN, DRAGGABLE_TYPE).some((d) => d.name === name)) return quote('pyreonDraggable', ctx.ident(name))
  if (ctx.decls(DND_PLUGIN, DROPPABLE_TYPE).some((d) => d.name === name)) return quote('pyreonDroppable', ctx.ident(name))
  return undefined
}
