// How `@pyreon/table` crosses to native: `const t = createTableState({ data, columns, pageSize })` lowers to the
// `PyreonTableState` engine both runtimes ship (the dependency-free sort / filter / paginate / select core of the
// web package). v1 lowers `data: () => <expr>` (the reactive row source), `columns: [{ id }]` (string ids, the
// default `row[id]` accessor) and an optional numeric `pageSize`; anything else reports why and declines. The
// TanStack-backed `useTable` is the web render surface and has no native analogue.
//
// The engine reads its source through a closure over the component's own state, so on SwiftUI the source is bound
// in `.onAppear` (a `@State` initializer cannot capture `self`) and on Compose it is passed to the constructor
// (`remember` runs sequentially, so the closure can name the row signal directly).

import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  staticPropKey,
  unwrapTypeLayers,
  type CallRecognizer,
  type CompilerPlugin,
  type DeclEmitter,
  type ExprIR,
  type ExtDecl,
  type ReceiverLowering,
  type ReceiverSite,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'
import { tableStubs } from './stubs'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

const TABLE_TYPE = 'table-state'
export const TABLE_PLUGIN_NAME = '@pyreon/table'

interface TablePayload {
  readonly dataBody: ExprIR
  readonly pageSize: number
  readonly columns: readonly { readonly id: string }[]
}

const payloadOf = (decl: ExtDecl): TablePayload => decl.payload as unknown as TablePayload

/** The properties the engine exposes as stored values: the web reads them as signals, so the call drops its parentheses. */
const PROPERTY_READS: ReadonlySet<string> = new Set(['page', 'sortColumn', 'sortDirection', 'filterValue'])

const recognizeTable: CallRecognizer = (_call, ctx) => {
  const name = ctx.declName
  const configArg = unwrapTypeLayers(ctx.args[0] as AnyNode | undefined)
  if (!configArg || configArg.type !== 'ObjectExpression') {
    ctx.report(
      `createTableState declaration \`${name}\`: argument must be an object literal { data, columns, pageSize } to lower natively. Falling back to silent-drop.`,
    )
    return undefined
  }

  let dataBody: ExprIR | undefined
  let pageSize = 0
  const columns: { id: string }[] = []
  for (const prop of (configArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (ctx.hasDynamicKey(prop)) {
      ctx.warnDynamicKey(prop, `createTableState declaration \`${name}\`: config`)
      continue
    }
    const keyName = staticPropKey(prop)
    if (!keyName) continue
    const valueNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (keyName === 'data') {
      if ((valueNode?.type === 'ArrowFunctionExpression' || valueNode?.type === 'FunctionExpression') && valueNode.body?.type !== 'BlockStatement') {
        dataBody = ctx.expr(valueNode.body as AnyNode)
      }
    } else if (keyName === 'pageSize') {
      if (valueNode?.type === 'Literal' && typeof valueNode.value === 'number') pageSize = valueNode.value
    } else if (keyName === 'columns' && valueNode?.type === 'ArrayExpression') {
      for (const el of (valueNode.elements as AnyNode[] | undefined) ?? []) {
        const col = unwrapTypeLayers(el)
        if (col?.type !== 'ObjectExpression') continue
        for (const cp of (col.properties as AnyNode[] | undefined) ?? []) {
          if (cp?.type !== 'Property' && cp?.type !== 'ObjectProperty') continue
          if (ctx.hasDynamicKey(cp)) {
            ctx.warnDynamicKey(cp, `createTableState declaration \`${name}\`: column`)
            continue
          }
          const cv = unwrapTypeLayers(cp.value as AnyNode | undefined)
          if (staticPropKey(cp) === 'id' && cv?.type === 'Literal' && typeof cv.value === 'string') columns.push({ id: cv.value })
        }
      }
    }
  }

  if (!dataBody) {
    ctx.report(
      `createTableState declaration \`${name}\`: \`data\` must be an expression-body getter (\`() => rows\`) to lower natively. Falling back to silent-drop.`,
    )
    return undefined
  }
  if (columns.length === 0) {
    ctx.report(
      `createTableState declaration \`${name}\`: needs at least one \`columns: [{ id }]\` entry with a string id to lower natively (v1). Falling back to silent-drop.`,
    )
    return undefined
  }
  return { type: TABLE_TYPE, payload: { dataBody, pageSize, columns } as never }
}

/** The element type of the rows the data getter yields, or `unknown` when it is not an array. */
const rowElement = (type: TypeIR): TypeIR => (type.kind === 'array' ? type.element : { kind: 'unknown' })

/** A PyreonCell expression for a table column, chosen by the field's type. */
function swiftCell(fieldType: TypeIR | undefined, expr: string): string {
  if (fieldType?.kind === 'string') return `.string(${expr})`
  if (fieldType?.kind === 'number') return `.number(Double(${expr}))`
  // Total fallback (bool / enum / unknown) — stringify so comparison stays defined.
  return `.string("\\(${expr})")`
}

function kotlinCell(fieldType: TypeIR | undefined, expr: string): string {
  if (fieldType?.kind === 'string') return `PyreonCell.Str(${expr})`
  if (fieldType?.kind === 'number') return `PyreonCell.Num((${expr}).toDouble())`
  return `PyreonCell.Str("${'$'}{${expr}}")`
}

const tableDecl: DeclEmitter = {
  // The declaration was a closed `table-state` compiler kind before it moved here; the struct names the compiler
  // derives from a declaration's shape hash it under that name, so emitted names did not move.
  legacyKind: TABLE_TYPE,
  lifecycle: {
    // A `.onAppear` on a transparent conditional would restart with every branch flip (see `DeclLifecycle.stableHost`).
    stableHost: true,
    midOrder: 10,
    swift(decl, ctx) {
      return [`.onAppear { ${ctx.ident(decl.name)}.setData { ${ctx.expr(payloadOf(decl).dataBody, 8)} } }`]
    },
  },
  swift(decl, ctx) {
    const { dataBody, pageSize, columns } = payloadOf(decl)
    const element = rowElement(ctx.inferType(dataBody))
    const fields = ctx.rowFields(element)
    const cols = columns
      .map((c) => {
        const field = fields.find((x) => x.name === c.id)
        return `PyreonTableColumn(id: ${ctx.stringLiteral(c.id)}, accessor: { ${swiftCell(field?.type, `$0.${ctx.ident(c.id)}`)} })`
      })
      .join(', ')
    const pageArg = pageSize > 0 ? `, pageSize: ${pageSize}` : ''
    return `@State private var ${ctx.ident(decl.name)} = PyreonTableState<${ctx.rowType(element)}>(columns: [${cols}]${pageArg})`
  },
  kotlin(decl, ctx) {
    const { dataBody, pageSize, columns } = payloadOf(decl)
    const element = rowElement(ctx.inferType(dataBody))
    const fields = ctx.rowFields(element)
    const cols = columns
      .map((c) => {
        const field = fields.find((x) => x.name === c.id)
        return `PyreonTableColumn(${ctx.stringLiteral(c.id)}) { ${kotlinCell(field?.type, `it.${ctx.ident(c.id)}`)} }`
      })
      .join(', ')
    const pageArg = pageSize > 0 ? `, ${pageSize}` : ''
    return `val ${ctx.ident(decl.name)} = remember { PyreonTableState<${ctx.rowType(element)}>({ ${ctx.expr(dataBody, 2)} }, listOf(${cols})${pageArg}) }`
  },
}

/** `t.page()` — a property read on the engine, spelled as the stored value; its METHODS (rows / pageCount / toggleSort / …) keep their parentheses. */
function propertyRead(site: ReceiverSite, ctx: { ident(name: string): string }): string | undefined {
  if (site.kind !== 'call') return undefined
  const { callee, args } = site.expr
  if (
    args.length !== 0 ||
    callee.kind !== 'member' ||
    callee.object.kind !== 'identifier' ||
    callee.object.name !== site.receiver.name ||
    !PROPERTY_READS.has(callee.property)
  ) {
    return undefined
  }
  return `${ctx.ident(callee.object.name)}.${ctx.ident(callee.property)}`
}

const tableReceiver: ReceiverLowering = {
  swift: { expr: propertyRead },
  kotlin: { expr: propertyRead },
}

/**
 * The `@pyreon/table` native plugin. Shipped by `@pyreon/table` itself and discovered from its manifest
 * (`pyreon.native.plugin`) when a source file imports the package.
 */
export const tablePlugin: CompilerPlugin = {
  name: TABLE_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: ['@pyreon/table'],
  calls: { createTableState: recognizeTable },
  decls: { [TABLE_TYPE]: tableDecl },
  receivers: { [TABLE_TYPE]: tableReceiver },
  // `createTableState` lowers; the TanStack-backed render surface (getRowModel / getVisibleCells / flexRender) does not.
  unlowered: {
    '@pyreon/table': {
      supported: ['createTableState'],
      advice:
        "`createTableState({ data, columns, pageSize })` LOWERS to the native PyreonTableState engine — render its `rows()` with `<For>` + primitives. The TanStack-backed `useTable` (getRowModel / getVisibleCells / flexRender) is the WEB render surface with no native analogue; keep it behind a `<Web>` branch",
    },
  },
  stubs: tableStubs,
}
