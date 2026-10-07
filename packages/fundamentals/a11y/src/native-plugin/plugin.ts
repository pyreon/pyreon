// How `@pyreon/a11y` crosses to native: the imperative `announce("msg", { politeness })` becomes a call on
// `PyreonA11y`, the runtime object that speaks a message through VoiceOver (`UIAccessibility.post`) or TalkBack
// (`announceForAccessibility`). The message is the first argument; an options object's `politeness: 'assertive'`
// sets `assertive` (default polite); a `clear` option is dropped in v1. The rest of the package (VisuallyHidden /
// LiveRegion / SkipLink / createA11yId) is DOM-based and has no native lowering.
//
// The callee is whatever local name the file imported `announce` as, so the plugin's `scanModule` records the
// local names and its `callExprs` recognizer matches a call against them.

import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  hasDynamicKey,
  staticPropKey,
  type CallExprRecognizer,
  type CompilerPlugin,
  type ExprEmitter,
  type ExtExprIR,
  type ModuleScanner,
} from '@pyreon/native-compiler/plugin-api'
import { a11yStubs } from './stubs'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

const ANNOUNCE_EXPR = 'announce-call'
export const A11Y_PLUGIN_NAME = '@pyreon/a11y'

const NAMES_KEY = '@pyreon/a11y:names'

const assertiveOf = (e: ExtExprIR): boolean => (e.payload as unknown as { assertive: boolean }).assertive

/** The local names the file bound the `announce` import to (`import { announce as say }` → `say`). */
const announceNames = (source: { fileState<T>(key: string, init: () => T): T }): Set<string> =>
  source.fileState<Set<string>>(NAMES_KEY, () => new Set())

const scanA11y: ModuleScanner = (scan) => {
  const names = announceNames(scan)
  for (const node of scan.body as readonly AnyNode[]) {
    if (node.type !== 'ImportDeclaration' || node.source?.value !== '@pyreon/a11y') continue
    for (const spec of (node.specifiers as AnyNode[] | undefined) ?? []) {
      if (spec.type === 'ImportSpecifier' && spec.imported?.name === 'announce') {
        const local = spec.local?.name
        if (typeof local === 'string') names.add(local)
      }
    }
  }
}

const recognizeAnnounce: CallExprRecognizer = (site, ctx) => {
  const names = announceNames(ctx)
  const callee = site.callee as AnyNode
  if (names.size === 0 || callee?.type !== 'Identifier' || !names.has(callee.name)) return undefined
  const argNodes = site.args as readonly AnyNode[]
  const message = argNodes[0] ? ctx.expr(argNodes[0]) : ({ kind: 'literal', value: '' } as const)
  let assertive = false
  const opts = argNodes[1]
  if (opts?.type === 'ObjectExpression') {
    for (const prop of (opts.properties as AnyNode[] | undefined) ?? []) {
      if (hasDynamicKey(prop)) {
        ctx.warnDynamicKey(prop, 'announce() options')
        continue
      }
      const key = staticPropKey(prop)
      const val = prop.value
      if (key === 'politeness' && (val?.type === 'Literal' || val?.type === 'StringLiteral') && val.value === 'assertive') {
        assertive = true
      }
    }
  }
  return { type: ANNOUNCE_EXPR, payload: { assertive }, args: [message] }
}

const announceExpr: ExprEmitter = {
  swift: (e, ctx) => `PyreonA11y.announce(${ctx.expr(e.args[0]!)}, assertive: ${assertiveOf(e)})`,
  kotlin: (e, ctx) => `PyreonA11y.announce(${ctx.expr(e.args[0]!)}, ${assertiveOf(e)})`,
  // The node was a closed `announce-call` compiler kind before it moved here; the struct names the compiler derives
  // from an expression's shape hash it under that name, so emitted names did not move.
  legacyHash: (e) => ({ kind: ANNOUNCE_EXPR, message: e.args[0], assertive: assertiveOf(e) }),
}

/**
 * The `@pyreon/a11y` native plugin. Shipped by `@pyreon/a11y` itself and discovered from its manifest
 * (`pyreon.native.plugin`) when a source file imports the package.
 */
export const a11yPlugin: CompilerPlugin = {
  name: A11Y_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: ['@pyreon/a11y'],
  scanModule: scanA11y,
  callExprs: recognizeAnnounce,
  exprs: { [ANNOUNCE_EXPR]: announceExpr },
  // `announce` lowers; the remaining exports are DOM-based. Per export, not per package: a module can be only PARTLY
  // unlowered, and warning on the one that lowers would print "has NO native lowering" above the code that does.
  unlowered: {
    '@pyreon/a11y': {
      supported: ['announce'],
      advice:
        'the live-region helpers are DOM-based — native a11y goes through the `accessibilityLabel` / `accessibilityHidden` props on the canonical primitives (or `announce(...)`, which lowers), which lower on all three targets',
    },
  },
  stubs: a11yStubs,
}
