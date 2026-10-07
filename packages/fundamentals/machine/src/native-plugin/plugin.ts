// How `@pyreon/machine` crosses to native: `const m = createMachine({ initial, states })` becomes the
// `PyreonMachine` reactive container both runtimes ship (an `@State` on SwiftUI, a `remember {}` on
// Compose), seeded with the literal initial state and transition table. Method calls
// (`m.send` / `m.matches` / `m.can` / `m.nextEvents`) flow through unchanged because the runtime
// container defines them; `m()` reads the current state through Swift's `callAsFunction()` / Kotlin's
// `operator fun invoke()`, so the call keeps its parentheses (a bare identifier would be the container).

import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  staticPropKey,
  unwrapTypeLayers,
  type CallRecognizer,
  type CompilerPlugin,
  type DeclEmitter,
  type ExtDecl,
  type ReceiverLowering,
  type ReceiverSite,
} from '@pyreon/native-compiler/plugin-api'
import { machineStubs } from './stubs'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

const MACHINE_TYPE = 'machine'
export const MACHINE_PLUGIN_NAME = '@pyreon/machine'

interface MachinePayload {
  readonly initial: string
  readonly transitions: Readonly<Record<string, Readonly<Record<string, string>>>>
}

const payloadOf = (decl: ExtDecl): MachinePayload => decl.payload as unknown as MachinePayload

/**
 * Reads the literal `initial` string and the literal `states` map (state → `on` → event → next state).
 * A config that is not a literal reports why and DECLINES, so the declaration falls through to the
 * parser's remaining chain exactly as it did when this lived in the compiler. The `as const` on
 * `initial: 'idle' as const` is unwrapped.
 */
const recognizeMachine: CallRecognizer = (_call, ctx) => {
  const name = ctx.declName
  const configArg = ctx.args[0] as AnyNode | undefined
  if (!configArg || configArg.type !== 'ObjectExpression') {
    ctx.report(
      `createMachine declaration \`${name}\`: config argument is not an object literal — emit needs the literal { initial, states } shape to bake the transition table. Falling back to silent-drop.`,
    )
    return undefined
  }

  let initial: string | undefined
  let statesNode: AnyNode | undefined
  for (const prop of (configArg.properties as AnyNode[] | undefined) ?? []) {
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') continue
    if (ctx.hasDynamicKey(prop)) {
      ctx.warnDynamicKey(prop, `createMachine declaration \`${name}\`: config`)
      continue
    }
    const keyName = staticPropKey(prop)
    if (!keyName) continue
    const valueNode = unwrapTypeLayers(prop.value as AnyNode | undefined)
    if (keyName === 'initial') {
      if (valueNode?.type === 'Literal' && typeof valueNode.value === 'string') initial = valueNode.value
    } else if (keyName === 'states') {
      statesNode = valueNode
    }
  }

  if (!initial) {
    ctx.report(
      `createMachine declaration \`${name}\`: \`initial\` field is missing or not a string literal — required to seed PyreonMachine. Falling back to silent-drop.`,
    )
    return undefined
  }
  if (!statesNode || statesNode.type !== 'ObjectExpression') {
    ctx.report(
      `createMachine declaration \`${name}\`: \`states\` field is missing or not an object literal — required to bake the transition table. Falling back to silent-drop.`,
    )
    return undefined
  }

  // { stateName: { on: { EVENT: nextState } } }. An empty state (`done: {}`) is a valid terminal state.
  const transitions: Record<string, Record<string, string>> = {}
  for (const stateProp of (statesNode.properties as AnyNode[] | undefined) ?? []) {
    if (stateProp?.type !== 'Property' && stateProp?.type !== 'ObjectProperty') continue
    if (ctx.hasDynamicKey(stateProp)) {
      ctx.warnDynamicKey(stateProp, `createMachine declaration \`${name}\`: states`)
      continue
    }
    const stateName = staticPropKey(stateProp)
    if (!stateName) continue
    const stateConfig = unwrapTypeLayers(stateProp.value as AnyNode | undefined)
    transitions[stateName] = {}
    if (stateConfig?.type !== 'ObjectExpression') continue
    for (const innerProp of (stateConfig.properties as AnyNode[] | undefined) ?? []) {
      if (innerProp?.type !== 'Property' && innerProp?.type !== 'ObjectProperty') continue
      if (ctx.hasDynamicKey(innerProp)) {
        ctx.warnDynamicKey(innerProp, `createMachine declaration \`${name}\`: state \`${stateName}\``)
        continue
      }
      if (staticPropKey(innerProp) !== 'on') continue
      const eventsMap = unwrapTypeLayers(innerProp.value as AnyNode | undefined)
      if (eventsMap?.type !== 'ObjectExpression') continue
      for (const eventProp of (eventsMap.properties as AnyNode[] | undefined) ?? []) {
        if (eventProp?.type !== 'Property' && eventProp?.type !== 'ObjectProperty') continue
        if (ctx.hasDynamicKey(eventProp)) {
          ctx.warnDynamicKey(eventProp, `createMachine declaration \`${name}\`: state \`${stateName}\` \`on\``)
          continue
        }
        const eventName = staticPropKey(eventProp)
        const next = unwrapTypeLayers(eventProp.value as AnyNode | undefined)
        if (eventName && next?.type === 'Literal' && typeof next.value === 'string') {
          transitions[stateName]![eventName] = next.value
        }
      }
    }
  }

  return { type: MACHINE_TYPE, payload: { initial, transitions } }
}

const machineDecl: DeclEmitter = {
  // The declaration was a closed `machine` compiler kind before it moved here; the struct names the
  // compiler derives from a declaration's shape hash it under that name, so emitted names did not move.
  legacyKind: MACHINE_TYPE,
  swift(decl, ctx) {
    const { initial, transitions } = payloadOf(decl)
    const lit = ctx.stringLiteral
    const entries = Object.entries(transitions)
      .map(([state, events]) => {
        const eventEntries = Object.entries(events)
          .map(([event, next]) => `${lit(event)}: ${lit(next)}`)
          .join(', ')
        // An empty inner event map is `[:]`: a bare `[]` parses as an empty Array and fails typecheck against `[String: String]`.
        return `${lit(state)}: ${eventEntries === '' ? '[:]' : `[${eventEntries}]`}`
      })
      .join(', ')
    return `@State private var ${ctx.ident(decl.name)} = PyreonMachine(initial: ${lit(initial)}, transitions: ${entries === '' ? '[:]' : `[${entries}]`})`
  },
  kotlin(decl, ctx) {
    const { initial, transitions } = payloadOf(decl)
    const lit = ctx.stringLiteral
    const entries = Object.entries(transitions)
      .map(([state, events]) => {
        const ev = Object.entries(events)
          .map(([event, next]) => `${lit(event)} to ${lit(next)}`)
          .join(', ')
        return `${lit(state)} to ${ev === '' ? 'mapOf()' : `mapOf(${ev})`}`
      })
      .join(', ')
    return `val ${ctx.ident(decl.name)} = remember { PyreonMachine(initial = ${lit(initial)}, transitions = ${entries === '' ? 'mapOf()' : `mapOf(${entries})`}) }`
  },
}

/**
 * `m()` — the zero-argument call on the machine binding itself — keeps its parentheses on both targets:
 * the container is read through `callAsFunction()` / `invoke()`, so dropping them would emit the
 * container where the author wrote the current state. Everything else on the binding flows through.
 */
function currentStateRead(site: ReceiverSite, ctx: { ident(name: string): string }): string | undefined {
  if (site.kind !== 'call') return undefined
  const { callee, args } = site.expr
  if (args.length !== 0 || callee.kind !== 'identifier' || callee.name !== site.receiver.name) return undefined
  return `${ctx.ident(callee.name)}()`
}

const machineReceiver: ReceiverLowering = {
  swift: { expr: currentStateRead },
  kotlin: { expr: currentStateRead },
}

/**
 * The `@pyreon/machine` native plugin. Shipped by `@pyreon/machine` itself and discovered from its
 * manifest (`pyreon.native.plugin`) when a source file imports the package.
 */
export const machinePlugin: CompilerPlugin = {
  name: MACHINE_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: ['@pyreon/machine'],
  calls: { createMachine: recognizeMachine },
  componentOnlyCalls: ['createMachine'],
  decls: { [MACHINE_TYPE]: machineDecl },
  receivers: { [MACHINE_TYPE]: machineReceiver },
  stubs: machineStubs,
}
