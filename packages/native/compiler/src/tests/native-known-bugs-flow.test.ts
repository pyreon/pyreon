// @pyreon/flow native lowering — four silent-failure classes found by the
// 2026-09 coverage campaign, each fixed on BOTH emitters.
//
// 1. Patch fields silently DROPPED. `flow.updateNode(id, { position: pt })`
//    with a non-literal `position` (likewise `sourceHandles` /
//    `targetHandles`, and an `updateEdge` `waypoints`) emitted `node.copy()` /
//    `{ node in }` — the web moved the node, native did nothing, no warning.
//    Now: a literal lowers to the native constructor, a NON-literal passes
//    through as written (the rule `addNode` already follows), and only a
//    literal of the right kind but the wrong shape (a point missing a
//    coordinate) is dropped — with a named warning.
//    Sibling sites found: `updateEdge` markers and `pathOptions` that are not
//    static (a computed marker, an options variable, an unknown key) were
//    dropped with no warning — now named; and every positional point / connection argument
//    (`panTo`, `paste`, `updateNodePosition`, `add/updateEdgeWaypoint`,
//    `clampToExtent`, `getSnapLines`, `isValidConnection`) fell through a
//    bad literal to an anonymous `__ObjN` with no warning — now named.
// 2. Unsupported OPTIONS shapes (`zoomTo(2, { speed })`, `reconnectEdge(id,
//    { zzz })`, `setViewport({ q })`, `setCenter(x, y, { bad })`, plus
//    `zoomIn/zoomOut`, `fitView`, `animateViewport`, and `layout` with a
//    non-literal options object) fell through to an uncompilable generic call
//    with no warning. They still fall through (the same emitted-as-written
//    fallback an unported member gets) but are named first. Sibling:
//    `layout(algo, { bogus })` silently DROPPED unknown keys — now named.
// 3. `<path d={p.path}>` with `p` a LOCAL path-helper result emitted
//    `result: path()` — the connection line's accessor spelling — a function
//    the edge component does not have. `.path` is now classified by what it
//    is read off (flow-lowering.ts `classifyFlowPathMember`): a path-helper
//    call or a const bound to one passes the result itself; the props param
//    keeps `path()`; anything else is SVG path data.
// 4. The `<NodeToolbar>` "only lowers inside a registered component" warning
//    was REACHABLE but tested the wrong thing: it fired for a toolbar a
//    registered node component held inside a conditional (wrong reason),
//    and did NOT fire for a toolbar in a component no `nodeTypes` map
//    registers (dropped silently). It now checks both facts and says which.
//
// Bisect (each fix reverted alone, this file run, then restored):
//   1. revert the updateNode/updateEdge pass-through → the position /
//      handles / waypoints specs fail (`expected … to contain 'position = …'`),
//      as does the converted it.fails in cov-kotlin-c-2026-09.
//   2. remove the option warnings → `expected '' to contain 'zoomTo(...)'`.
//   3. revert emitSwift/KotlinFlowCustomPath to the old member arm →
//      `expected '…result: path()…' not to contain 'result: path()'`.
//   4. revert to the old NodeToolbar condition → the unregistered-component
//      spec fails (no warning), the conditional spec reads the wrong reason.
// (Exact messages recorded in the PR report.)

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

/**
 * `swiftc -typecheck` against the REAL SDK and the REAL runtime sources (the
 * flow engine included), no stubs — the `real-runtime-typecheck.test.ts`
 * recipe. Returns the error lines, or null when it compiles.
 */
function compileAgainstRealRuntime(code: string): string | null {
  const repo = resolve(import.meta.dirname, '../../../../..')
  const sources: string[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const e of entries) {
      if (e === 'node_modules' || e === 'lib' || e === '.build' || e === 'Package.swift') continue
      if (e.toLowerCase() === 'tests' || /Tests?\.swift$/.test(e)) continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.swift')) sources.push(p)
    }
  }
  for (const root of ['packages/fundamentals', 'packages/core', 'packages/native/runtime-swift', 'packages/native/router-swift']) walk(join(repo, root))
  if (sources.length < 40) return `only ${sources.length} runtime sources found`
  const dir = mkdtempSync(join(tmpdir(), 'pyreon-flow-known-bugs-'))
  try {
    const app = join(dir, 'ProbeApp.swift')
    writeFileSync(app, `import SwiftUI\nimport Foundation\n${code}`, 'utf8')
    const sdk = execFileSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' }).trim()
    execFileSync('xcrun', ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios17.0-simulator', '-sdk', sdk, app, ...sources], { encoding: 'utf8', stdio: 'pipe' })
    return null
  } catch (err) {
    const e = err as { stderr?: string | Buffer; stdout?: string | Buffer; message?: string }
    const out = [e.stderr, e.stdout].map((x) => (typeof x === 'string' ? x : x?.toString('utf8')) ?? '').join('\n')
    return out.split('\n').filter((l) => l.includes('error:')).slice(0, 12).join('\n') || (e.message ?? 'swiftc failed')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const run = (src: string, target: 'swift' | 'kotlin') => {
  const r = transform(src, { target })
  return { code: r.code, warnings: r.warnings.join('\n') }
}

/** A component with a `createFlow` binding and one button per call. */
const FLOW = (calls: string[]) => `
import { createFlow } from '@pyreon/flow'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } }],
    edges: [{ id: 'e1', source: '1', target: '1' }],
  })
  return (
    <Stack>
      <Text>{flow.nodes().length}</Text>
${calls.map((c, i) => `      <Button onPress={() => ${c}}>b${i}</Button>`).join('\n')}
    </Stack>
  )
}`

describe('1. updateNode / updateEdge patch fields are never silently dropped', () => {
  const nonLiteral = FLOW([
    `flow.updateNode('1', { position: flow.nodes()[0].position })`,
    `flow.updateNode('1', { sourceHandles: flow.nodes()[0].sourceHandles, targetHandles: flow.nodes()[0].targetHandles })`,
    `flow.updateEdge('e1', { waypoints: flow.edges()[0].waypoints })`,
  ])

  it('Kotlin: a non-literal position / handles / waypoints pass through as written', () => {
    const { code } = run(nonLiteral, 'kotlin')
    expect(code).toContain('node.copy(position = flow.nodes[0].position)')
    expect(code).toContain('node.copy(sourceHandles = flow.nodes[0].sourceHandles, targetHandles = flow.nodes[0].targetHandles)')
    expect(code).toContain('edge.copy(waypoints = flow.edges[0].waypoints)')
  })

  it('Swift: the same three pass through as assignments', () => {
    const { code } = run(nonLiteral, 'swift')
    expect(code).toContain('{ node in node.position = flow.nodes[0].position }')
    expect(code).toContain('{ node in node.sourceHandles = flow.nodes[0].sourceHandles; node.targetHandles = flow.nodes[0].targetHandles }')
    expect(code).toContain('{ edge in edge.waypoints = flow.edges[0].waypoints }')
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin pass-through compiles', { timeout: 120_000 }, () => {
    const v = validateKotlin(run(nonLiteral, 'kotlin').code)
    expect(v.ok, v.error ?? '').toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('the Swift pass-through compiles', { timeout: 120_000 }, () => {
    const v = validateSwiftWithStubs(run(nonLiteral, 'swift').code)
    expect(v.ok, v.error ?? '').toBe(true)
  })

  it.skipIf(!isSwiftUIAvailable())('the Swift pass-through compiles against the REAL flow runtime', { timeout: 240_000 }, () => {
    expect(compileAgainstRealRuntime(run(nonLiteral, 'swift').code)).toBeNull()
  })

  it('a literal of the wrong SHAPE is dropped and NAMED, on both targets', () => {
    const src = FLOW([
      `flow.updateNode('1', { position: { x: 1 } })`,
      `flow.updateNode('1', { sourceHandles: [{ position: 'top' }] })`,
      `flow.updateEdge('e1', { waypoints: [{ x: 1 }] })`,
    ])
    for (const target of ['swift', 'kotlin'] as const) {
      const { warnings } = run(src, target)
      expect(warnings, target).toContain('updateNode(...) field `position` is a literal the native port cannot build')
      expect(warnings, target).toContain('updateNode(...) field `sourceHandles` is a literal the native port cannot build')
      expect(warnings, target).toContain('updateEdge(...) field `waypoints` is a literal the native port cannot build')
    }
  })

  it('updateEdge markers / pathOptions that cannot be built are dropped and NAMED (they used to vanish)', () => {
    const src = FLOW([`flow.updateEdge('e1', { markerStart: pickMarker(), pathOptions: opts })`, `flow.updateEdge('e1', { pathOptions: { curvature: 1, junk: 2 } })`])
    for (const target of ['swift', 'kotlin'] as const) {
      const { warnings } = run(src, target)
      expect(warnings, target).toContain('updateEdge(...) field `markerStart` was DROPPED natively')
      expect(warnings, target).toContain('updateEdge(...) field `pathOptions` was DROPPED natively')
      expect(warnings, target).toContain('updateEdge(...) field `pathOptions.junk` was DROPPED natively')
    }
  })

  it('a bad positional point / connection literal is NAMED instead of emitting an anonymous struct silently', () => {
    const src = FLOW([
      `flow.panTo({ x: 1 })`,
      `flow.updateNodePosition('1', { y: 2 })`,
      `flow.addEdgeWaypoint('e1', { x: 1 })`,
      `flow.isValidConnection({ source: '1' })`,
    ])
    for (const target of ['swift', 'kotlin'] as const) {
      const { warnings } = run(src, target)
      expect(warnings, target).toContain('`panTo(...)` argument 1 is a literal the native port cannot build')
      expect(warnings, target).toContain('`updateNodePosition(...)` argument 2 is a literal the native port cannot build')
      expect(warnings, target).toContain('`addEdgeWaypoint(...)` argument 2 is a literal the native port cannot build')
      expect(warnings, target).toContain('`isValidConnection(...)` argument 1 is a literal the native port cannot build')
    }
  })

  it('a COMPLETE literal still lowers and warns nothing', () => {
    const src = FLOW([`flow.updateNode('1', { position: { x: 1, y: 2 } })`, `flow.panTo({ x: 1, y: 2 })`])
    for (const target of ['swift', 'kotlin'] as const) {
      expect(run(src, target).warnings, target).not.toContain('cannot build')
    }
  })
})

describe('1b. addEdge and the createFlow seed name a marker / pathOptions they cannot lower', () => {
  // addEdge lowered ONLY literal markers and a literal pathOptions object and
  // SKIPPED everything else with no warning — the updateEdge fix above named
  // the same shapes, so the two paths disagreed about one edge field.
  const add = FLOW([
    `flow.addEdge({ source: '1', target: '1', markerEnd: someMarker, markerStart: pickStart(), pathOptions: opts })`,
    `flow.addEdge({ source: '1', target: '1', pathOptions: { curvature: 0.4, wobble: 2 } })`,
  ])
  const ok = FLOW([`flow.addEdge({ source: '1', target: '1', markerEnd: 'arrowclosed', pathOptions: { curvature: 0.4 } })`])
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: non-literal markers, a non-literal pathOptions and an unknown pathOptions key are named`, () => {
      const { warnings } = run(add, target)
      expect(warnings).toContain('addEdge(...) field `markerEnd` was DROPPED natively')
      expect(warnings).toContain('addEdge(...) field `markerStart` was DROPPED natively')
      expect(warnings).toContain('addEdge(...) field `pathOptions` was DROPPED natively (the web applies it) — it lowers only as an inline object literal')
      expect(warnings).toContain('addEdge(...) field `pathOptions.wobble` was DROPPED natively')
    })
    it(`${target}: literal markers and known pathOptions keys lower silently`, () => {
      const r = run(ok, target)
      expect(r.warnings).not.toContain('DROPPED')
      expect(r.code).toContain(target === 'swift' ? 'curvature: 0.4' : 'curvature = 0.4')
    })
  }
  it('the createFlow SEED names the same shapes (it already routed them through the dropped-fields warning)', () => {
    const seed = `import { createFlow } from '@pyreon/flow'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({
    nodes: [{ id: '1', position: { x: 0, y: 0 }, data: { label: 'A' } }],
    edges: [{ id: 'e1', source: '1', target: '1', markerEnd: someMarker, pathOptions: opts }],
  })
  return <Stack><Text>{flow.nodes().length}</Text></Stack>
}`
    for (const target of ['swift', 'kotlin'] as const) {
      const { warnings } = run(seed, target)
      expect(warnings, target).toContain('markerEnd (not a literal marker or null)')
      expect(warnings, target).toContain('pathOptions (not a literal numeric options object)')
    }
  })
})

describe('2. unsupported option shapes on flow members are named', () => {
  const src = FLOW([
    `flow.zoomTo(2, { speed: 3 })`,
    `flow.reconnectEdge('e1', { zzz: 1 })`,
    `flow.setViewport({ q: 1 })`,
    `flow.setCenter(1, 2, { bad: 1 })`,
    `flow.zoomIn(opts)`,
    `flow.layout('layered', { direction: 'DOWN', bogus: 1 })`,
    `flow.layout('layered', layoutOpts)`,
  ])

  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: every declined options argument gets a named warning`, () => {
      const { warnings } = run(src, target)
      expect(warnings).toContain('`zoomTo(...)` options use the unsupported key `speed`')
      expect(warnings).toContain('`reconnectEdge(...)` options use the unsupported key `zzz`')
      expect(warnings).toContain('`setViewport(...)` options use the unsupported key `q`')
      expect(warnings).toContain('`setCenter(...)` options use the unsupported key `bad`')
      expect(warnings).toContain('`zoomIn(...)` options are passed as a non-literal value')
      expect(warnings).toContain('`layout(...)` option `bogus` has no native counterpart and was DROPPED')
      expect(warnings).toContain('`layout(...)` options are passed as a non-literal value')
    })
  }

  it('supported options stay silent', () => {
    const ok = FLOW([`flow.zoomTo(2, { duration: 300 })`, `flow.setViewport({ x: 1, y: 2, zoom: 1 })`, `flow.layout('layered', { direction: 'DOWN' })`])
    for (const target of ['swift', 'kotlin'] as const) {
      const { warnings } = run(ok, target)
      expect(warnings, target).not.toContain('options use')
      expect(warnings, target).not.toContain('no native counterpart')
    }
  })
})

const EDGE = (body: string, extraImports = '') => `import { createFlow, Flow, getStraightPath, getBezierPath${extraImports}, type EdgeComponentProps } from '@pyreon/flow'
function Wire(props: EdgeComponentProps) {
${body}
}
export function Diagram() {
  const flow = createFlow({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [{ id: 'ab', source: 'a', target: 'a', type: 'w' }] })
  return <Flow instance={flow} edgeTypes={{ w: Wire }} />
}`

describe('3. a LOCAL path-helper result reaches result: as the local', () => {
  const local = EDGE(`  const p = getStraightPath({ sourceX: props.sourceX(), sourceY: props.sourceY(), targetX: props.targetX(), targetY: props.targetY() })
  return <path d={p.path} />`)

  it('Swift passes the local, not an undefined `path()`', () => {
    const { code } = run(local, 'swift')
    expect(code).toContain('PyreonFlowCustomEdgePath(result: p,')
    expect(code).not.toContain('result: path()')
  })

  it('Kotlin passes the local, not an undefined `path()`', () => {
    const { code } = run(local, 'kotlin')
    expect(code).toContain('PyreonFlowCustomEdgePath(result = p,')
    expect(code).not.toContain('result = path()')
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit compiles', { timeout: 120_000 }, () => {
    const v = validateSwiftWithStubs(run(local, 'swift').code)
    expect(v.ok, v.error ?? '').toBe(true)
  })

  it.skipIf(!isSwiftUIAvailable())('the Swift emit compiles against the REAL flow runtime', { timeout: 240_000 }, () => {
    expect(compileAgainstRealRuntime(run(local, 'swift').code)).toBeNull()
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', { timeout: 120_000 }, () => {
    const v = validateKotlin(run(local, 'kotlin').code)
    expect(v.ok, v.error ?? '').toBe(true)
  })

  it('a helper call inline still passes the call; any other `.path` is SVG path data', () => {
    const inline = EDGE(`  return <path d={getBezierPath({ sourceX: props.sourceX(), sourceY: props.sourceY(), targetX: props.targetX(), targetY: props.targetY() }).path} />`)
    expect(run(inline, 'swift').code).toContain('PyreonFlowCustomEdgePath(result: pyreonBezierPath(')
    const other = EDGE(`  const shape = { path: 'M 0 0 L 10 10' }
  return <path d={shape.path} />`)
    expect(run(other, 'swift').code).toContain('result: PyreonFlowPathResult(svgPath: shape.path)')
    expect(run(other, 'kotlin').code).toContain('result = pyreonFlowPathResultFromSvg(shape.path)')
  })
})

describe('2b. setCenter options: the reader accepts exactly what the message says', () => {
  // `setCenter(x, y, opts)` takes its position as the first two arguments;
  // the native `setCenter(_:_:zoom:duration:)` has no `x`/`y` labels. The
  // reader used to share `setViewport`'s `{ x, y, zoom, duration }` key set,
  // so `{ x: 5 }` "lowered" to a duplicate label that fails the build while
  // the warning (on other keys) said only zoom/duration were supported.
  const bad = FLOW([`flow.setCenter(1, 2, { x: 5, zoom: 2 })`])
  const ok = FLOW([`flow.setCenter(1, 2, { zoom: 2, duration: 200 })`])
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: an x/y key in setCenter options is named, not emitted as a label`, () => {
      const r = run(bad, target)
      expect(r.warnings).toContain('`setCenter(...)` options use the unsupported key `x`')
      expect(r.warnings).toContain('only an object literal with `zoom`, `duration` lowers')
      // Not lowered to labelled args (`setCenter(1, 2, x: 5, …)`); the warned
      // fallback is the emitted-as-written call every declined member gets.
      expect(r.code).not.toContain(target === 'swift' ? 'setCenter(1, 2, x: 5' : 'setCenter(1.0, 2.0, x = 5.0')
    })
    it(`${target}: zoom/duration lower silently`, () => {
      const r = run(ok, target)
      expect(r.warnings).not.toContain('setCenter')
      expect(r.code).toContain(target === 'swift' ? 'flow.setCenter(1, 2, zoom: 2, duration: 200)' : 'flow.setCenter(1.0, 2.0, zoom = 2.0, duration = 200.0)')
    })
  }
  it.skipIf(!isSwiftcAvailable())('swiftc (stubs) accepts the zoom/duration emit', () => {
    const r = validateSwiftWithStubs(run(ok, 'swift').code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 180_000)
  it.skipIf(!isKotlincAvailable())('kotlinc accepts the zoom/duration emit', () => {
    const r = validateKotlin(run(ok, 'kotlin').code)
    expect(r.ok, r.error ?? '').toBe(true)
  }, 180_000)
})

describe('4. <NodeToolbar> drop warnings name the actual reason', () => {
  const src = `import { createFlow, Flow, NodeToolbar, type NodeComponentProps } from '@pyreon/flow'
import { Stack, Text } from '@pyreon/primitives'
function Static(props: NodeComponentProps<{ label: string }>) {
  return <Stack><NodeToolbar><Text>s</Text></NodeToolbar><Text>a</Text></Stack>
}
function Gated(props: NodeComponentProps<{ label: string }>) {
  return <Stack>{props.selected() && <NodeToolbar><Text>g</Text></NodeToolbar>}<Text>b</Text></Stack>
}
function Mixed(props: NodeComponentProps<{ label: string }>) {
  return <Stack><NodeToolbar><Text>m1</Text></NodeToolbar>{props.selected() && <NodeToolbar><Text>m2</Text></NodeToolbar>}</Stack>
}
function Loose() { return <Stack><NodeToolbar><Text>l</Text></NodeToolbar></Stack> }
export function App() {
  const flow = createFlow({ nodes: [{ id: '1', type: 's', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [] })
  return <Stack><Flow instance={flow} nodeTypes={{ s: Static, g: Gated, m: Mixed }} /><Loose /></Stack>
}`

  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: registered+conditional and unregistered are named differently; registered+static is silent`, () => {
      const { warnings } = run(src, target)
      expect(warnings).toContain('<NodeToolbar> in node component `Gated` is not a static JSX child')
      expect(warnings).toContain('<NodeToolbar> in `Loose` only lowers inside a component registered by a literal <Flow nodeTypes')
      expect(warnings).not.toContain('`Static`')
    })
    it(`${target}: the check is per TOOLBAR — one static + one conditional in the same component names the conditional one`, () => {
      // Per-component, \`Mixed\` counted as "has a lowered toolbar" and its
      // gated second toolbar vanished without a warning.
      const { warnings } = run(src, target)
      expect(warnings).toContain('<NodeToolbar> in node component `Mixed` is not a static JSX child')
    })
  }
})
