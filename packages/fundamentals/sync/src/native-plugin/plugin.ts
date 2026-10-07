// How `@pyreon/sync` crosses to native: the LWW-CRDT document and the signals synced through it.
//
//   `const doc = new PyreonCrdtDoc(actor?)`            → `PyreonCrdtDoc` (the doc a group of synced signals shares)
//   `const x = syncedSignal({ doc, key, initial })`    → `PyreonSyncedSignal<T>` (a `Signal<T>` view over one scalar key)
//
// v1 lowers a SCALAR synced signal (string / number / boolean initial) over a `doc` identifier that names a
// `new PyreonCrdtDoc(…)` binding; anything else reports why and declines, so the declaration falls through to the
// parser's remaining chain exactly as it did when this lived in the compiler. `x()` reads through Swift's
// `callAsFunction()` / Kotlin's `operator fun invoke()`, so the call keeps its parentheses; `x.set(v)` is a real method.
//
// SwiftUI declares both TYPED with no initializer and seeds them in the component's generated `init()`: a synced
// signal's initializer names the doc, and one `@State` cannot reference another at property initialization. Compose's
// `remember {}` blocks run sequentially, so there the declarations name each other directly.

import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  staticPropKey,
  unwrapTypeLayers,
  type CallRecognizer,
  type CompilerPlugin,
  type DeclEmitter,
  type EmitContext,
  type ExtDecl,
  type ModuleScanner,
  type ReceiverLowering,
  type ReceiverSite,
} from '@pyreon/native-compiler/plugin-api'
import { warnUnloweredCrdtMembers } from './crdt-surface'
import { syncStubs } from './stubs'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

const DOC_TYPE = 'crdt-doc'
const SIGNAL_TYPE = 'synced-signal'
export const SYNC_PLUGIN_NAME = '@pyreon/sync'

type Scalar = 'string' | 'double' | 'bool'

interface DocPayload {
  readonly actorLiteral?: string
}

interface SignalPayload {
  readonly docBinding: string
  readonly key: string
  readonly scalarType: Scalar
  readonly initialValue: string | number | boolean
  readonly map?: string
}

const docOf = (decl: ExtDecl): DocPayload => decl.payload as unknown as DocPayload
const signalOf = (decl: ExtDecl): SignalPayload => decl.payload as unknown as SignalPayload

/**
 * `new PyreonCrdtDoc(actor?)`. The actor id, if a string literal, is baked; otherwise (a `createActorId()` call, an
 * identifier, or no argument) the emit generates a fresh UUID. Only the constructor is a doc — a plain call is not.
 */
const recognizeDoc: CallRecognizer = (call, ctx) => {
  if (call.construct !== true) return undefined
  const actorArg = unwrapTypeLayers(ctx.args[0] as AnyNode | undefined)
  if (actorArg?.type === 'Literal' && typeof actorArg.value === 'string') {
    return { type: DOC_TYPE, payload: { actorLiteral: actorArg.value } }
  }
  return { type: DOC_TYPE }
}

const recognizeSyncedSignal: CallRecognizer = (_call, ctx) => {
  const name = ctx.declName
  const configArg = unwrapTypeLayers(ctx.args[0] as AnyNode | undefined)
  if (!configArg || configArg.type !== 'ObjectExpression') {
    ctx.report(
      `syncedSignal declaration \`${name}\`: argument must be an object literal { doc, key, initial } to lower natively. Falling back to silent-drop.`,
    )
    return undefined
  }

  let docBinding: string | undefined
  let key: string | undefined
  let map: string | undefined
  let initialValue: string | number | boolean | undefined
  let scalarType: Scalar | undefined
  for (const prop of (configArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (ctx.hasDynamicKey(prop)) {
      ctx.warnDynamicKey(prop, `syncedSignal declaration \`${name}\`: config`)
      continue
    }
    const keyName = staticPropKey(prop)
    if (!keyName) continue
    const valueNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (keyName === 'doc') {
      if (valueNode?.type === 'Identifier') docBinding = valueNode.name as string
    } else if (keyName === 'key') {
      if (valueNode?.type === 'Literal' && typeof valueNode.value === 'string') key = valueNode.value
    } else if (keyName === 'map') {
      if (valueNode?.type === 'Literal' && typeof valueNode.value === 'string') map = valueNode.value
    } else if (keyName === 'initial' && valueNode?.type === 'Literal') {
      const v = valueNode.value
      if (typeof v === 'string') {
        initialValue = v
        scalarType = 'string'
      } else if (typeof v === 'number') {
        initialValue = v
        scalarType = 'double'
      } else if (typeof v === 'boolean') {
        initialValue = v
        scalarType = 'bool'
      }
    }
  }

  if (!docBinding) {
    ctx.report(
      `syncedSignal declaration \`${name}\`: \`doc\` must reference a \`new PyreonCrdtDoc(...)\` binding by identifier. Falling back to silent-drop.`,
    )
    return undefined
  }
  if (key === undefined) {
    ctx.report(`syncedSignal declaration \`${name}\`: \`key\` must be a string literal. Falling back to silent-drop.`)
    return undefined
  }
  if (initialValue === undefined || !scalarType) {
    ctx.report(
      `syncedSignal declaration \`${name}\`: \`initial\` must be a string, number, or boolean literal (native v1 lowers scalar synced signals). Falling back to silent-drop.`,
    )
    return undefined
  }
  return {
    type: SIGNAL_TYPE,
    payload: { docBinding, key, scalarType, initialValue, ...(map !== undefined ? { map } : {}) },
  }
}

/** The CRDT surface totality warning: a web `CrdtDoc` / `CrdtMap` member with no native counterpart would be reproduced verbatim. */
const scanSync: ModuleScanner = (scan) => {
  const messages: string[] = []
  warnUnloweredCrdtMembers(scan.program as AnyNode, messages, scan.source)
  for (const message of messages) scan.report(message)
}

const swiftScalar = (scalar: Scalar): string => (scalar === 'string' ? 'String' : scalar === 'double' ? 'Double' : 'Bool')

function swiftInitial(scalar: Scalar, value: string | number | boolean, ctx: EmitContext): string {
  if (scalar === 'string') return ctx.stringLiteral(String(value))
  if (scalar === 'bool') return value ? 'true' : 'false'
  return String(value)
}

function kotlinInitial(scalar: Scalar, value: string | number | boolean, ctx: EmitContext): string {
  if (scalar === 'string') return ctx.stringLiteral(String(value))
  if (scalar === 'bool') return value ? 'true' : 'false'
  // A Double literal so `PyreonSyncedSignal<Double>` is inferred (JS number).
  return Number.isInteger(value as number) ? `${value}.0` : String(value)
}

const docDecl: DeclEmitter = {
  // The declaration was a closed `crdt-doc` compiler kind before it moved here; the struct names the compiler
  // derives from a declaration's shape hash it under that name, so emitted names did not move.
  legacyKind: DOC_TYPE,
  swiftInit: {
    order: 10,
    optionalSlotReason: 'its synced state already needs a generated init() that seeds it, and the optional-slot initializers cannot',
    lines(decl, ctx) {
      const { actorLiteral } = docOf(decl)
      const actor = actorLiteral !== undefined ? ctx.stringLiteral(actorLiteral) : 'UUID().uuidString'
      const name = ctx.ident(decl.name)
      return [`let ${name} = PyreonCrdtDoc(actor: ${actor})`, `_${name} = State(initialValue: ${name})`]
    },
  },
  swift: (decl, ctx) => `@State private var ${ctx.ident(decl.name)}: PyreonCrdtDoc`,
  kotlin(decl, ctx) {
    const { actorLiteral } = docOf(decl)
    const actor = actorLiteral !== undefined ? ctx.stringLiteral(actorLiteral) : 'java.util.UUID.randomUUID().toString()'
    return `val ${ctx.ident(decl.name)} = remember { PyreonCrdtDoc(${actor}) }`
  },
}

const signalDecl: DeclEmitter = {
  legacyKind: SIGNAL_TYPE,
  swiftInit: {
    order: 20,
    optionalSlotReason: 'its synced state already needs a generated init() that seeds it, and the optional-slot initializers cannot',
    lines(decl, ctx) {
      const { docBinding, key, scalarType, initialValue, map } = signalOf(decl)
      const mapArg = map !== undefined ? `map: ${ctx.stringLiteral(map)}, ` : ''
      return [
        `_${ctx.ident(decl.name)} = State(initialValue: PyreonSyncedSignal(doc: ${ctx.ident(docBinding)}, ${mapArg}key: ${ctx.stringLiteral(key)}, initial: ${swiftInitial(scalarType, initialValue, ctx)}))`,
      ]
    },
  },
  swift: (decl, ctx) => `@State private var ${ctx.ident(decl.name)}: PyreonSyncedSignal<${swiftScalar(signalOf(decl).scalarType)}>`,
  kotlin(decl, ctx) {
    const { docBinding, key, scalarType, initialValue, map } = signalOf(decl)
    const mapArg = map !== undefined ? `, ${ctx.stringLiteral(map)}` : ''
    return `val ${ctx.ident(decl.name)} = remember { PyreonSyncedSignal(${ctx.ident(docBinding)}, ${ctx.stringLiteral(key)}, ${kotlinInitial(scalarType, initialValue, ctx)}${mapArg}) }`
  },
}

/** `title()` — the zero-argument call on the synced signal itself keeps its parentheses on both targets (the facade is read through `callAsFunction()` / `invoke()`). */
function currentValueRead(site: ReceiverSite, ctx: { ident(name: string): string }): string | undefined {
  if (site.kind !== 'call') return undefined
  const { callee, args } = site.expr
  if (args.length !== 0 || callee.kind !== 'identifier' || callee.name !== site.receiver.name) return undefined
  return `${ctx.ident(callee.name)}()`
}

const signalReceiver: ReceiverLowering = {
  swift: { expr: currentValueRead },
  kotlin: { expr: currentValueRead },
}

/**
 * The `@pyreon/sync` native plugin. Shipped by `@pyreon/sync` itself and discovered from its manifest
 * (`pyreon.native.plugin`) when a source file imports the package.
 */
export const syncPlugin: CompilerPlugin = {
  name: SYNC_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: ['@pyreon/sync'],
  scanModule: scanSync,
  calls: { PyreonCrdtDoc: recognizeDoc, syncedSignal: recognizeSyncedSignal },
  // `syncedSignal` lowers to a `remember {}` / an `@State`, which has no meaning at file scope.
  componentOnlyCalls: ['syncedSignal'],
  decls: { [DOC_TYPE]: docDecl, [SIGNAL_TYPE]: signalDecl },
  receivers: { [SIGNAL_TYPE]: signalReceiver },
  stubs: syncStubs,
}
