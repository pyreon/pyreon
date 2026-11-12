// `PyreonFlowState`'s Swift initializer binds its labeled arguments in
// DECLARATION order ("argument 'connectionRadius' must precede argument
// 'autoHistory'"). The emitter used to append config arguments in whatever
// order its source listed them, so `createFlow({ autoHistory, connectionRadius
// })` did not compile on iOS — and the stub declared `connectionRules` in a
// different place from the runtime, so the stub gate could not see it either.
//
// The emitter now sorts by SWIFT_FLOW_STATE_INIT_LABELS; the list itself is
// locked against the real runtime initializer AND the stub by
// native-flow-state.test.ts. This file drives a broad config — two dozen
// constructor-lowered keys, written deliberately out of declaration order —
// through the emitter and both compile gates, so a key added to the lowering
// but not to the ordering list fails here rather than on a device.
//
// Bisect-load-bearing: dropping the sort fails the order spec and the stub +
// real-SDK compile of the full-config fixture with "must precede argument".

import { describe, expect, it } from 'vitest'
import { SWIFT_FLOW_STATE_INIT_LABELS } from '../../../../fundamentals/flow/src/native-plugin/lowering'
import { transform, validateSwiftWithStubs } from './first-party-plugins'
import { isSwiftcAvailable, isSwiftUIAvailable } from '../validate'
import { runtimeSwiftSources, swiftErrorLines, typecheckAgainstRealRuntime } from './real-runtime-swift'

const FULL = `import { createFlow } from '@pyreon/flow'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    edges: [],
    preventScrolling: false, autoHistory: false, historyLimit: 20, fitViewPadding: 0.2, fitView: true,
    defaultEdgeType: 'step', snapToObjects: false, multiSelect: false, autoPanSpeed: 4, connectionMode: 'loose',
    zoomOnPinch: false, panOnScrollSpeed: 0.3, pannable: false, connectionRadius: 9, edgeInteractionWidth: 30,
    nodesDraggable: false, defaultMarkerEnd: null, connectionRules: { a: { outputs: ['b'] } }, snapGrid: 10,
    snapToGrid: true, maxZoom: 3, minZoom: 0.5,
  })
  return (<Stack><Text>{flow.nodes().length}</Text></Stack>)
}`

describe('a createFlow with its config written out of declaration order', () => {
  it('emits the arguments in declaration order', () => {
    const { code, warnings } = transform(FULL, { target: 'swift' })
    expect(warnings).toEqual([])
    const call = code.match(/PyreonFlowState<[^>]+>\((.*)\)\n/)?.[1] ?? ''
    const labels = [...call.matchAll(/(?:^|, )(\w+): /g)].map((m) => m[1]!).filter((l) => SWIFT_FLOW_STATE_INIT_LABELS.includes(l))
    const ranks = labels.map((l) => SWIFT_FLOW_STATE_INIT_LABELS.indexOf(l))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(labels).toContain('historyLimit')
  })

  it.skipIf(!isSwiftcAvailable())('compiles against the stub', () => {
    const r = validateSwiftWithStubs(transform(FULL, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 120_000)

  it.runIf(isSwiftUIAvailable())('compiles against the real SDK + runtime', () => {
    const sources = runtimeSwiftSources()
    expect(sources.length).toBeGreaterThan(40)
    const diagnostics = typecheckAgainstRealRuntime(
      [{ name: 'App.swift', code: transform(FULL, { target: 'swift' }).code }],
      { sources },
    )
    if (diagnostics !== null) expect.fail(swiftErrorLines(diagnostics, 8))
  }, 300_000)
})
