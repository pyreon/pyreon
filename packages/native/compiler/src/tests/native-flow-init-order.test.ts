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

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SWIFT_FLOW_STATE_INIT_LABELS } from '../flow-lowering'
import { transform } from '../index'
import { isSwiftcAvailable, isSwiftUIAvailable, validateSwiftWithStubs } from '../validate'

const REPO = resolve(import.meta.dirname, '../../../../..')

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
    const sources: string[] = []
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir)) {
        if (['node_modules', 'lib', '.build', 'Package.swift'].includes(e)) continue
        if (e.toLowerCase() === 'tests' || /Tests?\.swift$/.test(e)) continue
        const p = join(dir, e)
        if (statSync(p).isDirectory()) walk(p)
        else if (p.endsWith('.swift')) sources.push(p)
      }
    }
    for (const r of ['packages/fundamentals', 'packages/core', 'packages/native/runtime-swift', 'packages/native/router-swift']) walk(join(REPO, r))
    expect(sources.length).toBeGreaterThan(40)
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-flow-init-'))
    try {
      const app = join(dir, 'App.swift')
      writeFileSync(app, `import SwiftUI\nimport Foundation\n${transform(FULL, { target: 'swift' }).code}`)
      const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim()
      try {
        execFileSync('xcrun', ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios17.0-simulator', '-sdk', sdk, app, ...sources], { stdio: 'pipe' })
      } catch (err) {
        const e = err as { stderr?: Buffer }
        expect.fail(String(e.stderr ?? '').split('\n').filter((l) => l.includes('error:')).slice(0, 8).join('\n'))
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 300_000)
})
