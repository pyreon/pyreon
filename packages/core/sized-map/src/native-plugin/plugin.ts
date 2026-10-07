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
// someone else's constructor is worse than not lowering ours. The scan records the local name(s) the file bound to the
// export; a user's own `SizedMap` is never seen.

import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  staticPropKey,
  type CallExprRecognizer,
  type CompilerPlugin,
  type ExprEmitter,
  type ExtExprIR,
  type ModuleScanner,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'
import { sizedMapStubs } from './stubs'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

export const SIZED_MAP_PLUGIN_NAME = '@pyreon/sized-map'
const EXPR_TYPE = 'new-sized-map'
const NAMES_KEY = '@pyreon/sized-map:names'

interface SizedMapPayload {
  readonly keyType: TypeIR
  readonly valueType: TypeIR
  readonly maxEntries: number
  readonly lru: boolean
}

const sizedMapOf = (e: ExtExprIR): SizedMapPayload => e.payload as unknown as SizedMapPayload

/** Record the local name(s) the file binds to `SizedMap` imported from `@pyreon/sized-map`. */
const scanSizedMap: ModuleScanner = (scan) => {
  const names = scan.fileState(NAMES_KEY, () => new Set<string>())
  for (const node of scan.body as readonly AnyNode[]) {
    if (node.type !== 'ImportDeclaration') continue
    if (node.source?.value !== SIZED_MAP_PLUGIN_NAME) continue
    for (const spec of (node.specifiers as AnyNode[] | undefined) ?? []) {
      if (spec.type === 'ImportSpecifier' && spec.imported?.name === 'SizedMap') {
        const local = spec.local?.name
        if (typeof local === 'string') names.add(local)
      }
    }
  }
}

const recognizeSizedMap: CallExprRecognizer = (site, ctx) => {
  if (site.construct !== true) return undefined
  const callee = site.callee as AnyNode
  if (callee.type !== 'Identifier') return undefined
  const calleeName = callee.name as string
  if (!ctx.fileState(NAMES_KEY, () => new Set<string>()).has(calleeName)) return undefined
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
  return { type: EXPR_TYPE, payload: { keyType: typeArgs[0]!, valueType: typeArgs[1]!, maxEntries, lru: readNum('lru') === 1 } }
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

/**
 * The `@pyreon/sized-map` native plugin. Shipped by `@pyreon/sized-map` itself and discovered from its manifest
 * (`pyreon.native.plugin`) when a source file imports the package.
 */
export const sizedMapPlugin: CompilerPlugin = Object.freeze({
  name: SIZED_MAP_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: Object.freeze([SIZED_MAP_PLUGIN_NAME]),
  scanModule: scanSizedMap,
  callExprs: recognizeSizedMap,
  exprs: Object.freeze({ [EXPR_TYPE]: sizedMapExpr }),
  stubs: sizedMapStubs,
})
