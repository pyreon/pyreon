// F2's machine check: every portable Flow method is proven on both native
// engines, not just emitted.
//
// A method counts when it is either
//   - called in the web-ORACLE region of the Swift fixture, which the flow
//     package generates from `native-parity-fixture.ts` and locks byte-for-byte
//     (the Kotlin region is generated from the same scenarios), or
//   - named in HAND_ASSERTED, and called in BOTH hand-written native fixtures.
//     These are the methods an oracle comparison cannot express: callbacks,
//     animation and lifecycle.
// A method in neither place fails, so a method added to the lowering without a
// behavioural proof cannot land silently.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOWERED_FLOW_METHODS } from '../flow-lowering'

const read = (rel: string) => readFileSync(new URL(`../../../../fundamentals/flow/native/tests/${rel}`, import.meta.url), 'utf8')
const swift = read('PyreonFlowStateTests.swift')
const kotlin = read('PyreonFlowStateTest.kt')
const region = swift.slice(swift.indexOf('<flow-parity:start>'), swift.indexOf('<flow-parity:end>'))
const kotlinRegion = kotlin.slice(kotlin.indexOf('<flow-parity:start>'), kotlin.indexOf('<flow-parity:end>'))
const engineSource = (rel: string) => readFileSync(new URL(`../../../../fundamentals/flow/${rel}`, import.meta.url), 'utf8')

/** The web method names whose native spelling differs. */
const NATIVE_NAME: Record<string, string> = {
  _setNodeMeasurement: 'updateNodeMeasurement',
  _clearNodeMeasurement: 'clearNodeMeasurement',
  getNodes: 'nodes',
  getEdges: 'edges',
  getViewport: 'viewport',
}

const CALLBACK = 'a callback: there is no oracle value to compare, so each fixture fires it and asserts the payload'
const HAND_ASSERTED: Record<string, string> = {
  focusNode: 'animates the viewport; the fixtures assert its landing point per target',
  animateViewport: 'animation timing is per-target; the fixtures assert start, reduced-motion and end',
  dispose: 'lifecycle: the fixtures assert listeners stop after it',
  onConnect: CALLBACK, onViewportChange: CALLBACK, onNodeClick: CALLBACK, onNodeDoubleClick: CALLBACK,
  onNodeDragStart: CALLBACK, onNodeDrag: CALLBACK, onNodeDragEnd: CALLBACK, onEdgeClick: CALLBACK,
  onSelectionChange: CALLBACK, onNodesDelete: CALLBACK, onEdgesDelete: CALLBACK, onNodesChange: CALLBACK,
  onEdgesChange: CALLBACK, onConnectStart: CALLBACK, onConnectEnd: CALLBACK, onPaneClick: CALLBACK,
}

const calls = (text: string, name: string) => new RegExp(`\\.${name}\\b`).test(text)

describe('every portable Flow method has a behavioural proof on both native engines', () => {
  for (const method of LOWERED_FLOW_METHODS) {
    const native = NATIVE_NAME[method] ?? method
    it(method, () => {
      if (method in HAND_ASSERTED) {
        expect(calls(swift, native), `${method}: not exercised by the Swift fixture`).toBe(true)
        expect(calls(kotlin, native), `${method}: not exercised by the Kotlin fixture`).toBe(true)
        return
      }
      expect(
        new RegExp(`\\bf\\.${native}\\b`).test(region),
        `${method}: not exercised by any web-oracle parity scenario. Add one to native-parity-fixture.ts, or, if an oracle cannot express it, list it in HAND_ASSERTED with the reason.`,
      ).toBe(true)
    })
  }

  it('HAND_ASSERTED names only real portable methods', () => {
    for (const method of Object.keys(HAND_ASSERTED)) expect(LOWERED_FLOW_METHODS.has(method), method).toBe(true)
  })
})

// The config half of F2. Every constructor field of the native engine is
// either set by a web-oracle scenario on BOTH targets, or classified here with
// the reason an engine-level oracle cannot see it. The field list is read from
// the Kotlin constructor itself, so a field added to the engine without a
// decision fails this suite.

const kotlinEngine = engineSource('native/kotlin/com/pyreon/runtime/PyreonFlowState.kt')
const swiftEngine = engineSource('native/swift/PyreonFlowState.swift')
const webEngine = engineSource('src/flow.ts')

function engineConfigFields(): string[] {
  const start = kotlinEngine.indexOf('class PyreonFlowState<T>(')
  const body = kotlinEngine.slice(start, kotlinEngine.indexOf('\n) {', start))
  const names: string[] = []
  for (const line of body.split('\n').slice(1)) {
    const m = /^\s*(?:private val |val |var )?(\w+)\s*:/.exec(line)
    if (m) names.push(m[1]!)
  }
  return names
}

/** Kotlin constructor name -> the Swift spelling, where they differ. */
const SWIFT_CONFIG_NAME: Record<string, string> = { fitViewOnLoad: 'fitView' }

const DATA = 'the graph itself, not configuration: every scenario constructs it'
const GESTURE = 'read only by the web COMPONENT (a gesture or keyboard path), never by createFlow, so there is no engine oracle; the native engine reads it inside its own gesture handling, proven by the device suites'
const RENDER = 'a renderer default: the web engine never reads it, the native view layer does'
const CONFIG_NOT_ORACLED: Record<string, string> = {
  nodes: DATA, edges: DATA, viewport: DATA,
  reducedMotion: 'motion policy: animateViewport is HAND_ASSERTED above, and both fixtures pin reducedMotion explicitly',
  fitViewOnLoad: 'applied once when the view first lays out, which is a view-lifecycle event rather than an engine call; the fixtures assert the flag is retained',
  defaultMarkerEnd: RENDER, connectionLineType: RENDER, edgeInteractionWidth: RENDER,
  nodesFocusable: RENDER, edgesFocusable: RENDER, onlyRenderVisibleElements: RENDER, snapToObjects: GESTURE,
  nodesDraggable: GESTURE, nodesConnectable: GESTURE, nodesSelectable: GESTURE, edgesReconnectable: GESTURE,
  disableKeyboardA11y: GESTURE, connectionRadius: GESTURE, selectionMode: GESTURE,
  pannable: GESTURE, panOnDrag: GESTURE, panOnScroll: GESTURE, panOnScrollSpeed: GESTURE,
  zoomable: GESTURE, zoomOnScroll: GESTURE, zoomOnPinch: GESTURE, zoomOnDoubleClick: GESTURE, selectionOnDrag: GESTURE,
  deleteKeys: GESTURE, multiSelectionKey: GESTURE, selectionKey: GESTURE, zoomActivationKey: GESTURE, preventScrolling: GESTURE,
}

/** Web spelling of a native config field, for the "the web engine really does not read it" check. */
const WEB_CONFIG_NAME: Record<string, string> = { connectionValidator: 'isValidConnection' }

describe('every native Flow config field is proven on both engines or classified', () => {
  const fields = engineConfigFields()

  it('reads a plausible field list from the Kotlin constructor', () => {
    expect(fields.length).toBeGreaterThan(40)
    expect(fields).toContain('connectionRules')
  })

  for (const field of fields) {
    it(field, () => {
      const swiftName = SWIFT_CONFIG_NAME[field] ?? field
      expect(new RegExp(`\\b${swiftName}\\b`).test(swiftEngine), `${field}: the Swift engine has no ${swiftName}`).toBe(true)
      const reason = CONFIG_NOT_ORACLED[field]
      if (reason === undefined) {
        const set = (text: string, name: string) => new RegExp(`\\b${name}\\s*[:=]`).test(text)
        expect(set(region, swiftName), `${field}: no web-oracle scenario sets it on Swift. Add a config scenario to native-parity-fixture.ts, or classify it in CONFIG_NOT_ORACLED with the reason.`).toBe(true)
        expect(set(kotlinRegion, field), `${field}: no web-oracle scenario sets it on Kotlin`).toBe(true)
        return
      }
      // A GESTURE or RENDER field is exempt only because the web engine never
      // reads it; if createFlow starts reading it, it needs an oracle scenario.
      if (reason === GESTURE || reason === RENDER) {
        const webName = WEB_CONFIG_NAME[field] ?? field
        expect(new RegExp(`\\b${webName}\\b`).test(webEngine), `${field}: createFlow now reads it, so it needs a parity scenario, not an exemption`).toBe(false)
      }
    })
  }

  it('CONFIG_NOT_ORACLED names only real engine fields', () => {
    for (const field of Object.keys(CONFIG_NOT_ORACLED)) expect(fields, field).toContain(field)
  })
})
