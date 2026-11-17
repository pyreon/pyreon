// How `@pyreon/machine` crosses to native: `const m = createMachine({ initial, states })` becomes the
// `PyreonMachine` reactive container both runtimes ship (an `@State` on SwiftUI, a `remember {}` on
// Compose), seeded with the literal initial state and transition table. Method calls
// (`m.send` / `m.matches` / `m.can` / `m.nextEvents`) flow through unchanged because the runtime
// container defines them; `m()` reads the current state through Swift's `callAsFunction()` / Kotlin's
// `operator fun invoke()`, so the call keeps its parentheses (a bare identifier would be the container).

import {
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
    if (prop?.type !== 'Property' && prop?.type !== 'ObjectProperty') {
      ctx.report(
        `createMachine declaration \`${name}\`: the config contains a spread, which cannot be read at compile time — what it carries is IGNORED on iOS and Android. Write it out literally.`,
      )
      continue
    }
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
    if (stateProp?.type !== 'Property' && stateProp?.type !== 'ObjectProperty') {
      ctx.report(
        `createMachine declaration \`${name}\`: \`states\` contains a spread, which cannot be read at compile time — what it carries is IGNORED on iOS and Android. Write it out literally.`,
      )
      continue
    }
    if (ctx.hasDynamicKey(stateProp)) {
      ctx.warnDynamicKey(stateProp, `createMachine declaration \`${name}\`: states`)
      continue
    }
    const stateName = staticPropKey(stateProp)
    if (!stateName) continue
    const stateConfig = unwrapTypeLayers(stateProp.value as AnyNode | undefined)
    transitions[stateName] = {}
    if (stateConfig?.type !== 'ObjectExpression') {
      ctx.report(
        `createMachine declaration \`${name}\`: state \`${stateName}\` is not an object literal — it lowers as a state with NO transitions on iOS and Android.`,
      )
      continue
    }
    transitions[stateName] = readStateTransitions(name, stateName, stateConfig, ctx)
  }

  return { type: MACHINE_TYPE, payload: { initial, transitions } }
}

/** One state's `on` map as event → next state; every entry that cannot lower is reported, never skipped in silence. */
function readStateTransitions(
  name: string,
  stateName: string,
  stateConfig: AnyNode,
  ctx: Parameters<CallRecognizer>[1],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const innerProp of (stateConfig.properties as AnyNode[] | undefined) ?? []) {
    if (innerProp?.type !== 'Property' && innerProp?.type !== 'ObjectProperty') {
      ctx.report(
        `createMachine declaration \`${name}\`: state \`${stateName}\` contains a spread, which cannot be read at compile time — what it carries is IGNORED on iOS and Android. Write it out literally.`,
      )
      continue
    }
    if (ctx.hasDynamicKey(innerProp)) {
      ctx.warnDynamicKey(innerProp, `createMachine declaration \`${name}\`: state \`${stateName}\``)
      continue
    }
    const innerKey = staticPropKey(innerProp)
    if (innerKey !== 'on') {
      // `always`, `entry`, `exit`, `meta`, … used to vanish with no word: an `always` transition never fired.
      ctx.report(
        `createMachine declaration \`${name}\`: state \`${stateName}\` key \`${innerKey ?? '…'}\` has no native lowering and is IGNORED on iOS and Android — only \`on: { EVENT: 'next' }\` transitions lower.`,
      )
      continue
    }
    const eventsMap = unwrapTypeLayers(innerProp.value as AnyNode | undefined)
    if (eventsMap?.type !== 'ObjectExpression') {
      ctx.report(
        `createMachine declaration \`${name}\`: state \`${stateName}\` \`on\` must be an object literal to lower to native — its transitions are IGNORED, so send() does nothing in this state on iOS and Android.`,
      )
      continue
    }
    readEventTransitions(name, stateName, eventsMap, out, ctx)
  }

  return out
}

/** The entries of one `on: { … }` map into `out` (event → next state). */
function readEventTransitions(
  name: string,
  stateName: string,
  eventsMap: AnyNode,
  out: Record<string, string>,
  ctx: Parameters<CallRecognizer>[1],
): void {
  for (const eventProp of (eventsMap.properties as AnyNode[] | undefined) ?? []) {
    if (eventProp?.type !== 'Property' && eventProp?.type !== 'ObjectProperty') {
      ctx.report(
        `createMachine declaration \`${name}\`: state \`${stateName}\` \`on\` contains a spread, which cannot be read at compile time — its transitions are IGNORED on iOS and Android.`,
      )
      continue
    }
    if (ctx.hasDynamicKey(eventProp)) {
      ctx.warnDynamicKey(eventProp, `createMachine declaration \`${name}\`: state \`${stateName}\` \`on\``)
      continue
    }
    const eventName = staticPropKey(eventProp)
    const next = unwrapTypeLayers(eventProp.value as AnyNode | undefined)
    if (!eventName) continue
    if (next?.type === 'Literal' && typeof next.value === 'string') {
      out[eventName] = next.value
      continue
    }
    // `{ target: 'open' }` is the same transition written as an object. Anything more (a `guard`, `actions`, an
    // array of candidates) has no native lowering; it used to be dropped with no word, so send() did nothing.
    const target = objectTargetOnly(next)
    if (target !== undefined) {
      out[eventName] = target
      continue
    }
    ctx.report(
      `createMachine declaration \`${name}\`: transition \`${stateName}\` --${eventName}--> must be a state name or \`{ target: 'state' }\` to lower to native — a guarded / multi-target / action-carrying transition is IGNORED, so send('${eventName}') does nothing in \`${stateName}\` on iOS and Android.`,
    )
  }
}

/** The target of an object-form transition whose ONLY key is `target` (a string literal), else undefined. */
function objectTargetOnly(node: AnyNode | undefined): string | undefined {
  if (node?.type !== 'ObjectExpression') return undefined
  const props = (node.properties as AnyNode[] | undefined) ?? []
  if (props.length !== 1) return undefined
  const only = props[0]
  if ((only?.type !== 'Property' && only?.type !== 'ObjectProperty') || staticPropKey(only) !== 'target') return undefined
  const v = unwrapTypeLayers(only.value as AnyNode | undefined)

  return v?.type === 'Literal' && typeof v.value === 'string' ? v.value : undefined
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
  apiVersion: 2,
  modules: ['@pyreon/machine'],
  calls: { createMachine: recognizeMachine },
  componentOnlyCalls: ['createMachine'],
  decls: { [MACHINE_TYPE]: machineDecl },
  receivers: { [MACHINE_TYPE]: machineReceiver },
  stubs: machineStubs,
}
