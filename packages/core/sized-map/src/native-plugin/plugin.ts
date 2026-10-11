// How `@pyreon/sized-map` crosses to native: `new SizedMap<K, V>({ maxEntries: N, lru?: B })`, a bounded FIFO/LRU map.
//
//   Swift   → `PyreonSizedMap<K, V>(maxEntries: N, lru: true)`
//   Kotlin  → `PyreonSizedMap<K, V>(maxEntries = NL, lru = true)`
//
// The class is the runtime the package ships. Generic arguments are REQUIRED, for the reason `new Map<K, V>()` states —
// neither target can infer element types from later use sites — and the option object must be a literal: a computed cap
// cannot be baked into the emit (the same conservative rule useFetch applies to its URL).
//
// The construction is gated on the IMPORT: `SizedMap` is a plausible name for a user's own class, and mis-lowering
// someone else's constructor is worse than not lowering ours. The scan resolves lexical import identity for both expression and declaration
// sites; a local binding with the same spelling is never claimed.

import {
  staticPropKey,
  type AstNode,
  type CallExprRecognizer,
  type CompilerPlugin,
  type DeclConstructRecognizer,
  type DeclEmitter,
  type ExtDecl,
  type ExprEmitter,
  type ExtExprIR,
  type ModuleScanner,
  type ParseContext,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'
import { sizedMapStubs } from './stubs'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

export const SIZED_MAP_PLUGIN_NAME = '@pyreon/sized-map'
const EXPR_TYPE = 'new-sized-map'
const REFERENCE_KEY = '@pyreon/sized-map:import-reference'
type ImportReference = (node: AstNode) => boolean

interface SizedMapPayload {
  readonly keyType: TypeIR
  readonly valueType: TypeIR
  readonly maxEntries: number
  readonly lru: boolean
}

const sizedMapOf = (e: ExtExprIR | ExtDecl): SizedMapPayload =>
  e.payload as unknown as SizedMapPayload

/** Share one lexical import check between expression and declaration lowering. */
const scanSizedMap: ModuleScanner = (scan) => {
  if (
    !scan.body.some(
      (node) =>
        node.type === 'ImportDeclaration' &&
        (node.source as AnyNode)?.value === SIZED_MAP_PLUGIN_NAME,
    )
  )
    return
  if (typeof scan.isImportedReference !== 'function')
    throw new Error(
      '[Pyreon] Upgrade @pyreon/native-compiler: the SizedMap plugin requires ModuleScan.isImportedReference.',
    )
  scan.fileState<ImportReference>(
    REFERENCE_KEY,
    () => (node) => scan.isImportedReference(node, SIZED_MAP_PLUGIN_NAME, 'SizedMap'),
  )
}
const isSizedMapReference = (node: AstNode, ctx: Pick<ParseContext, 'fileState'>): boolean =>
  ctx.fileState<ImportReference>(REFERENCE_KEY, () => () => false)(node)

const recognizeSizedMap: CallExprRecognizer = (site, ctx) => {
  if (site.construct !== true) return undefined
  const callee = site.callee as AnyNode
  if (!isSizedMapReference(site.callee, ctx)) return undefined
  const calleeName = callee.name as string
  const typeArgs = ctx.typeArgs(site.node)
  // Anything but the two type arguments is not this lowering's shape: decline, and the parser reports it as it would any construction.
  if (typeArgs.length !== 2) return undefined
  const optsNode = site.args[0] as AnyNode | undefined
  const readNum = (key: string): number | undefined => {
    for (const prop of (optsNode?.properties as AnyNode[] | undefined) ?? []) {
      if (staticPropKey(prop) === key && prop.value?.type === 'Literal') {
        const v = prop.value.value
        if (typeof v === 'number') return v
        if (typeof v === 'boolean') return v ? 1 : 0
      }
    }
    return undefined
  }
  const maxEntries = readNum('maxEntries')
  if (optsNode?.type !== 'ObjectExpression' || maxEntries === undefined) {
    // A non-literal cap cannot be baked in. Reporting and claiming (`null`) stops the parser reporting the SAME call a second time
    // as an unsupported class construction.
    ctx.report(
      `[${ctx.loc(site.node)}] new ${calleeName}(...) lowers only with a LITERAL \`{ maxEntries: N }\` option object — a computed cap cannot be baked into the native emit. Use a literal, or keep the call behind a \`<Web>\` escape hatch.`,
    )
    return null
  }
  return {
    type: EXPR_TYPE,
    payload: {
      keyType: typeArgs[0]!,
      valueType: typeArgs[1]!,
      maxEntries,
      lru: readNum('lru') === 1,
    },
  }
}

const sizedMapExpr: ExprEmitter = {
  // The node was a closed `new-sized-map` expression kind before it moved here; the struct names the compiler derives from
  // an expression's shape hash it under that name, so emitted names did not move.
  legacyHash: (e) => ({ kind: EXPR_TYPE, ...sizedMapOf(e) }),
  // A SizedMap reads as a map at every use site (`m.get(k)` yields V), so downstream inference types it exactly like the
  // built-in — but the native value is a CLASS, not a dictionary: seeding a file-scope const as a map would re-spell
  // `seen.size` as `.count`, which the class does not have. Its own member surface is emitted verbatim.
  typing: {
    type: (e) => ({ kind: 'map', key: sizedMapOf(e).keyType, value: sizedMapOf(e).valueType }),
    seedsModuleConst: false,
  },
  // `lru` is emitted only when true so the default-FIFO call stays as short as the source that produced it.
  swift(e, ctx) {
    const { keyType, valueType, maxEntries, lru } = sizedMapOf(e)
    return `PyreonSizedMap<${ctx.typeText(keyType)}, ${ctx.typeText(valueType)}>(maxEntries: ${maxEntries}${lru ? ', lru: true' : ''})`
  },
  kotlin(e, ctx) {
    const { keyType, valueType, maxEntries, lru } = sizedMapOf(e)
    return `PyreonSizedMap<${ctx.typeText(keyType)}, ${ctx.typeText(valueType)}>(maxEntries = ${maxEntries}L${lru ? ', lru = true' : ''})`
  },
}

/** Component setup owns this container; an expression elsewhere remains an expression. */
const recognizeSizedMapDecl: DeclConstructRecognizer = (site, ctx) => {
  if (!isSizedMapReference(site.callee, ctx)) return undefined
  // Reuse the expression recognizer's exact option/type validation and diagnostic.
  const expression = ctx.expr(site.node)
  if (
    expression.kind !== 'ext-expr' ||
    expression.plugin !== SIZED_MAP_PLUGIN_NAME ||
    expression.type !== EXPR_TYPE
  )
    return null
  return { type: EXPR_TYPE, payload: expression.payload }
}

const sizedMapDecl: DeclEmitter = {
  typing: {
    member: (_decl, property) => (property === 'size' ? { kind: 'number' } : undefined),
    methodReturn(decl, method) {
      const { keyType, valueType } = sizedMapOf(decl)
      if (method === 'get') return { kind: 'union', branches: [valueType, { kind: 'undefined' }] }
      if (method === 'has' || method === 'delete') return { kind: 'boolean' }
      if (method === 'keys') return { kind: 'array', element: keyType }
      if (method === 'values') return { kind: 'array', element: valueType }
      if (method === 'entries') return { kind: 'array', element: { kind: 'unknown' } }
      return undefined
    },
  },
  swift(decl, ctx) {
    const { keyType, valueType, maxEntries, lru } = sizedMapOf(decl)
    return `@State private var ${ctx.ident(decl.name)} = PyreonSizedMap<${ctx.typeText(keyType)}, ${ctx.typeText(valueType)}>(maxEntries: ${maxEntries}${lru ? ', lru: true' : ''})`
  },
  kotlin(decl, ctx) {
    const { keyType, valueType, maxEntries, lru } = sizedMapOf(decl)
    return `val ${ctx.ident(decl.name)} = remember { PyreonSizedMap<${ctx.typeText(keyType)}, ${ctx.typeText(valueType)}>(maxEntries = ${maxEntries}L${lru ? ', lru = true' : ''}) }`
  },
}

/**
 * The `@pyreon/sized-map` native plugin. Shipped by `@pyreon/sized-map` itself and discovered from its manifest
 * (`pyreon.native.plugin`) when a source file imports the package.
 */
export const sizedMapPlugin: CompilerPlugin = Object.freeze({
  name: SIZED_MAP_PLUGIN_NAME,
  apiVersion: 2,
  modules: Object.freeze([SIZED_MAP_PLUGIN_NAME]),
  scanModule: scanSizedMap,
  callExprs: recognizeSizedMap,
  declConstructs: recognizeSizedMapDecl,
  decls: Object.freeze({ [EXPR_TYPE]: sizedMapDecl }),
  exprs: Object.freeze({ [EXPR_TYPE]: sizedMapExpr }),
  stubs: sizedMapStubs,
})
