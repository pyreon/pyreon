// How `@pyreon/dnd` crosses to native: `const s = useSortable({ items, by, onReorder, axis? })` lowers to the
// `PyreonSortableState` engine both runtimes ship (list REORDER within one list). The web hook returns ref
// callbacks the author attaches to DOM nodes; on native `ref={s.containerRef}` / `ref={s.itemRef(key)}` become
// SwiftUI `.draggable` / `.dropDestination` and Compose long-press drag modifiers. The engine reads its source
// and reorder sink through closures over the component's own state, so they are bound where the compiler binds
// containers (`midOrder`): `.onAppear` on SwiftUI (a `@State` initializer cannot capture `self`), a `bind` call
// in the composable body on Compose.
//
// v1 lowers the four load-bearing options. Options that would silently do NOTHING natively — `groupId` /
// `onCrossListDrop` / `onCrossListReceive` (cross-list boards) and `label` (screen-reader announcement text) —
// WARN by name rather than being dropped without a word, because a board that quietly stops accepting
// cross-list drops on device is the worst possible failure.

import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  staticPropKey,
  unwrapTypeLayers,
  type CallRecognizer,
  type CompilerPlugin,
  type DeclEmitter,
  type EmitContext,
  type ExprIR,
  type ExtDecl,
  type RefModifierLowering,
  type StatementIR,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'
import { dndStubs } from './stubs'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

const SORTABLE_TYPE = 'sortable'
export const DND_PLUGIN_NAME = '@pyreon/dnd'

interface SortablePayload {
  readonly itemsBody: ExprIR
  readonly keyParam: string
  readonly keyBody: ExprIR
  readonly reorderParam: string
  readonly reorderBody: readonly StatementIR[]
  readonly axis: 'vertical' | 'horizontal'
}

const payloadOf = (decl: ExtDecl): SortablePayload => decl.payload as unknown as SortablePayload

const recognizeSortable: CallRecognizer = (_call, ctx) => {
  const name = ctx.declName
  const configArg = unwrapTypeLayers(ctx.args[0] as AnyNode | undefined)
  if (!configArg || configArg.type !== 'ObjectExpression') {
    ctx.report(
      `useSortable declaration \`${name}\`: argument must be an object literal { items, by, onReorder } to lower natively. Falling back to silent-drop.`,
    )
    return undefined
  }

  let itemsBody: ExprIR | undefined
  let keyParam: string | undefined
  let keyBody: ExprIR | undefined
  let reorderParam: string | undefined
  let reorderBody: StatementIR[] | undefined
  let axis: 'vertical' | 'horizontal' = 'vertical'

  for (const prop of (configArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (ctx.hasDynamicKey(prop)) {
      ctx.warnDynamicKey(prop, `useSortable declaration \`${name}\`: config`)
      continue
    }
    const keyName = staticPropKey(prop)
    if (!keyName) continue
    const valueNode = unwrapTypeLayers(prop.value as AnyNode | undefined)

    if (keyName === 'items') {
      // `items: () => rows()` — an expression-body getter, the same contract as createTableState's `data`.
      if ((valueNode?.type === 'ArrowFunctionExpression' || valueNode?.type === 'FunctionExpression') && valueNode.body?.type !== 'BlockStatement') {
        itemsBody = ctx.expr(valueNode.body as AnyNode)
      }
    } else if (keyName === 'by') {
      if (valueNode?.type === 'ArrowFunctionExpression' && (valueNode.params as AnyNode[] | undefined)?.length === 1 && valueNode.body?.type !== 'BlockStatement') {
        const p = ((valueNode.params as AnyNode[])[0] as AnyNode | undefined)?.name as string | undefined
        if (p !== undefined) {
          keyParam = p
          keyBody = ctx.expr(valueNode.body as AnyNode)
        }
      }
    } else if (keyName === 'onReorder') {
      // A VOID callback, so an expression body must lower to a bare expression statement — NOT a function declaration,
      // whose `return <expr>` is invalid inside a Kotlin lambda (`return` there targets the enclosing function, and an
      // assignment is not an expression).
      if (valueNode?.type === 'ArrowFunctionExpression') {
        const p = ((valueNode.params as AnyNode[] | undefined)?.[0] as AnyNode | undefined)?.name as string | undefined
        reorderParam = p ?? 'next'
        reorderBody =
          valueNode.body?.type === 'BlockStatement'
            ? ctx.statements(valueNode.body as AnyNode)
            : [{ kind: 'expr' as const, expr: ctx.expr(valueNode.body as AnyNode) }]
      }
    } else if (keyName === 'axis') {
      if (valueNode?.type === 'Literal' && valueNode.value === 'horizontal') axis = 'horizontal'
    } else if (keyName === 'groupId' || keyName === 'onCrossListDrop' || keyName === 'onCrossListReceive') {
      ctx.report(
        `useSortable declaration \`${name}\`: \`${keyName}\` (cross-list boards) has NO native lowering — the native engine reorders WITHIN one list only, so a drag between two lists will not fire on iOS/Android. Keep a cross-list board behind a \`<Web>\` escape hatch, or model the move explicitly (remove from one signal, insert into the other).`,
      )
    } else if (keyName === 'label') {
      ctx.report(
        `useSortable declaration \`${name}\`: \`label\` (screen-reader announcement text) is not used natively — VoiceOver/TalkBack announce the item's own accessibility label instead. Set \`accessibilityLabel\` on the row for a native-friendly announcement.`,
      )
    }
  }

  if (!itemsBody) {
    ctx.report(
      `useSortable declaration \`${name}\`: \`items\` must be an expression-body getter (\`() => rows()\`) to lower natively. Falling back to silent-drop.`,
    )
    return undefined
  }
  if (keyParam === undefined || !keyBody) {
    ctx.report(
      `useSortable declaration \`${name}\`: \`by\` must be a single-param expression-body arrow (\`(item) => item.id\`) to lower natively. Falling back to silent-drop.`,
    )
    return undefined
  }
  if (reorderParam === undefined || !reorderBody) {
    ctx.report(
      `useSortable declaration \`${name}\`: \`onReorder\` must be an arrow function (\`(next) => items.set(next)\`) to lower natively. Falling back to silent-drop.`,
    )
    return undefined
  }
  return { type: SORTABLE_TYPE, payload: { itemsBody, keyParam, keyBody, reorderParam, reorderBody, axis } as never }
}

const rowElement = (type: TypeIR): TypeIR => (type.kind === 'array' ? type.element : { kind: 'unknown' })

/**
 * The `by` key, coerced to `String`. The web `by` returns `string | number` (both are valid `<For by>` keys), but
 * the native engine keys on `String` so one drag payload type serves every row type — `String` already conforms
 * to `Transferable`, which is what lets a consumer's row type stay conformance-free. A string-typed key passes
 * through unchanged; anything else is interpolated (total, and identical to `String(describing:)` for the scalar
 * keys this accepts).
 */
const swiftKey = (ctx: EmitContext, key: ExprIR, at: number): string => {
  const emitted = ctx.expr(key, at)
  return ctx.inferType(key).kind === 'string' ? emitted : `"\\(${emitted})"`
}
const kotlinKey = (ctx: EmitContext, key: ExprIR, at: number): string => {
  const emitted = ctx.expr(key, at)
  return ctx.inferType(key).kind === 'string' ? emitted : `(${emitted}).toString()`
}

const sortableDecl: DeclEmitter = {
  // The declaration was a closed `sortable` compiler kind before it moved here; the struct names the compiler
  // derives from a declaration's shape hash it under that name, so emitted names did not move.
  legacyKind: SORTABLE_TYPE,
  lifecycle: {
    // A `.onAppear` on a transparent conditional would restart with every branch flip (see `DeclLifecycle.stableHost`).
    stableHost: true,
    midOrder: 20,
    swift(decl, ctx) {
      const { itemsBody, keyParam, keyBody, reorderParam, reorderBody } = payloadOf(decl)
      const name = ctx.ident(decl.name)
      // An empty callback body is ONE blank line (the statements joined), which a caller leaves unindented.
      const body = reorderBody.length === 0 ? [''] : ctx.statements(reorderBody, 10).map((st) => `    ${st}`)
      return [
        `.onAppear {`,
        `  ${name}.bind(`,
        `    items: { ${ctx.expr(itemsBody, 10)} },`,
        `    by: { ${ctx.ident(keyParam)} in ${swiftKey(ctx, keyBody, 10)} },`,
        `    onReorder: { ${ctx.ident(reorderParam)} in`,
        ...body,
        `    }`,
        `  )`,
        `}`,
      ]
    },
    kotlin(decl, ctx) {
      const { itemsBody, keyParam, keyBody, reorderParam, reorderBody } = payloadOf(decl)
      const body = reorderBody.length === 0 ? [''] : ctx.statements(reorderBody, 4).map((st) => `  ${st}`)
      return [
        `${ctx.ident(decl.name)}.bind({ ${ctx.expr(itemsBody, 2)} }, { ${ctx.ident(keyParam)} -> ${kotlinKey(ctx, keyBody, 2)} }) { ${ctx.ident(reorderParam)} ->`,
        ...body,
        `}`,
      ]
    },
  },
  swift(decl, ctx) {
    const { itemsBody, axis } = payloadOf(decl)
    const element = rowElement(ctx.inferType(itemsBody))
    const axisArg = axis === 'horizontal' ? 'axis: .horizontal' : ''
    return `@State private var ${ctx.ident(decl.name)} = PyreonSortableState<${ctx.rowType(element)}>(${axisArg})`
  },
  kotlin(decl, ctx) {
    const { itemsBody, axis } = payloadOf(decl)
    const element = rowElement(ctx.inferType(itemsBody))
    const axisArg = axis === 'horizontal' ? 'PyreonSortAxis.HORIZONTAL' : ''
    return `val ${ctx.ident(decl.name)} = remember { PyreonSortableState<${ctx.rowType(element)}>(${axisArg}) }`
  },
}

/** What a `ref` value binds: the sortable's container, or one item by key. `null` for every other ref, which keeps its existing behaviour. */
type SortableRefBinding = { readonly kind: 'container'; readonly state: string } | { readonly kind: 'item'; readonly state: string; readonly key: ExprIR }

function classifyRef(value: ExprIR, isSortable: (name: string) => boolean): SortableRefBinding | null {
  // `ref={s.containerRef}` — a bare member read.
  if (value.kind === 'member' && value.property === 'containerRef' && value.object.kind === 'identifier' && isSortable(value.object.name)) {
    return { kind: 'container', state: value.object.name }
  }
  // `ref={s.itemRef(key)}` — a one-argument call on the member.
  if (
    value.kind === 'call' &&
    value.callee.kind === 'member' &&
    value.callee.property === 'itemRef' &&
    value.callee.object.kind === 'identifier' &&
    isSortable(value.callee.object.name) &&
    value.args.length === 1
  ) {
    return { kind: 'item', state: value.callee.object.name, key: value.args[0] as ExprIR }
  }
  return null
}

const bindsSortable = (ctx: EmitContext) => (name: string) => ctx.decls(DND_PLUGIN_NAME, SORTABLE_TYPE).some((d) => d.name === name)

/**
 * `ref={s.containerRef}` / `ref={s.itemRef(key)}` → the sortable modifiers. Appended LAST so the drag wrapper sits
 * outside the element's own padding / background, which is what an author writing the SwiftUI by hand would do
 * (the lifted row carries its styling with it).
 */
const sortableRefs: RefModifierLowering = {
  swift(ref, _el, ctx) {
    const binding = classifyRef(ref, bindsSortable(ctx))
    if (binding === null) return undefined
    const state = ctx.ident(binding.state)
    return binding.kind === 'container' ? `.pyreonSortableContainer(${state})` : `.pyreonSortableItem(${state}, key: ${swiftKey(ctx, binding.key, 0)})`
  },
  kotlin(ref, _el, ctx) {
    const binding = classifyRef(ref, bindsSortable(ctx))
    if (binding === null) return undefined
    const state = ctx.ident(binding.state)
    return binding.kind === 'container' ? `.pyreonSortableContainer(${state})` : `.pyreonSortableItem(${state}, ${kotlinKey(ctx, binding.key, 0)})`
  },
}

/**
 * The `@pyreon/dnd` native plugin. Shipped by `@pyreon/dnd` itself and discovered from its manifest
 * (`pyreon.native.plugin`) when a source file imports the package.
 */
export const dndPlugin: CompilerPlugin = {
  name: DND_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: ['@pyreon/dnd'],
  calls: { useSortable: recognizeSortable },
  decls: { [SORTABLE_TYPE]: sortableDecl },
  refModifiers: sortableRefs,
  // `useSortable` lowers; the rest do not, and the reasons differ per hook rather than per package — so name the one
  // that crosses instead of letting the blanket "web-only" line imply none do.
  //
  // useDraggable / useDroppable take `element: () => HTMLElement | null` — an imperative DOM-registration shape with no
  // declarative analogue on either target. useDragMonitor is a page-global drag bus neither SwiftUI nor Compose
  // exposes. useFileDrop is an OS-level file drag between apps (iPad multitasking / Android multi-window), a different
  // model entirely.
  unlowered: {
    '@pyreon/dnd': {
      supported: ['useSortable'],
      advice:
        '`useSortable({ items, by, onReorder })` DOES lower — it emits the native PyreonSortableState engine, and `ref={s.containerRef}` / `ref={s.itemRef(key)}` become SwiftUI .draggable/.dropDestination + Compose long-press drag modifiers. The element-getter hooks (useDraggable/useDroppable) are imperative DOM registration, useDragMonitor is a page-global drag bus, and useFileDrop is OS-level file DnD — none of the three has a native analogue',
    },
  },
  stubs: dndStubs,
}
