// Branch coverage — `src/parse.ts` ~8500-10500: the declaration recognizers
// that sit between the useQuery helpers and the router extraction.
//
//   - useQuery helpers: `endpointQueryCallInArrow` / `arrowReturnedObject` /
//     `tryQueryKeyParts` / `tryQueryFnValue` / `parseFetchInitObject`
//   - `@pyreon/rx` namespace + standalone-import lowering (`tryRxNamespaceLowering`)
//   - `createMachine` / `new QueryClient()` / `new PyreonCrdtDoc()` / `syncedSignal`
//   - `createFlow` / `useFlow` — node/edge field readers, config-key readers,
//     and the NAMED dropped-field / dropped-key warnings (the silent-drop class)
//   - `createTableState` / `useSortable` / `createI18n`
//   - `createRouter` route-array extraction (guards / loaders)
//
// Each spec pairs the source shape that takes a branch with the neighbour that
// must not, and asserts the emitted code, the parsed IR, or the named warning.

import { describe, expect, it } from 'vitest'
import { firstPartyCompiler, transform } from './first-party-plugins'
import type { FlowStatePayload, FlowStateDecl } from '../../../../fundamentals/flow/src/native-plugin/types'
import { parsePyreon } from '../parse'
import type { DeclIR } from '../types'

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })
const warn = (r: { warnings: string[] }) => r.warnings.join('\n')

// ---------------------------------------------------------------------------
// useQuery helpers
// ---------------------------------------------------------------------------

const Q_IMPORTS = `import { signal } from '@pyreon/reactivity'
import { useQuery } from '@pyreon/query'
type Resp = { ok: boolean }
`
const qApp = (b: string) =>
  `${Q_IMPORTS}export function App(){\n  const n = signal(1)\n${b}\n  return <Text>x</Text>\n}`
const q = (opts: string) => swift(qApp(`  const q = useQuery<Resp>(${opts})`))
const OK_FN = `queryFn: () => fetch('https://x')`

describe('parse.ts — useQuery options-function shapes', () => {
  it('rejects a non-arrow options argument by name', () => {
    expect(warn(q(`{ queryKey: ['a'], ${OK_FN} }`))).toContain(
      'useQuery expects an options function `() => ({ queryKey, queryFn, staleTime })`; got ObjectExpression',
    )
    expect(warn(swift(qApp('  const q = useQuery<Resp>()')))).toContain('got nothing')
  })

  it('reads a block-body options function returning an object (plain + parenthesized)', () => {
    expect(q(`() => { return { queryKey: ['a'], ${OK_FN} } }`).code).toContain('queryKey: "a"')
    expect(q(`() => { return ({ queryKey: ['b'], ${OK_FN} }) }`).code).toContain('queryKey: "b"')
  })

  it('a block body that returns a NON-object, or a concise non-object, is the generic bail', () => {
    const generic = 'useQuery options function must return an object literal'
    expect(warn(q('() => { return 5 }'))).toContain(generic)
    expect(warn(q('() => { const a = 1 }'))).toContain(generic)
    expect(warn(q('() => 5'))).toContain(generic)
    expect(warn(q('() => (5)'))).toContain(generic)
  })

  it('a concise body calling a NON-endpoint `.query()` is not claimed as the endpoint form', () => {
    const r = swift(qApp('  const api = { query: () => 1 }\n  const q = useQuery<Resp>(() => api.query())'))
    expect(warn(r)).toContain('useQuery options function must return an object literal')
  })

  it('names a non-array queryKey and an empty array queryKey', () => {
    expect(warn(q(`() => ({ queryKey: 'a', ${OK_FN} })`))).toContain(
      'useQuery queryKey must be an ARRAY of string/number literals or expressions',
    )
    expect(warn(q(`() => ({ queryKey: [], ${OK_FN} })`))).toContain('got ArrayExpression')
    expect(warn(q(`() => ({ queryKey: [...xs], ${OK_FN} })`))).toContain('got ArrayExpression')
  })

  it('bakes a numeric-literal key part and interpolates an expression part', () => {
    expect(q(`() => ({ queryKey: ['a', 2], ${OK_FN} })`).code).toContain('queryKey: "a:2"')
    const dyn = q(`() => ({ queryKey: [n(), 'a'], ${OK_FN} })`)
    expect(dyn.warnings).toEqual([])
    expect(dyn.code).toContain('\\(n):a')
  })

  it('staleTime: a numeric literal is baked; a non-literal warns and defaults to 0', () => {
    expect(q(`() => ({ queryKey: ['a'], ${OK_FN}, staleTime: 5000 })`).code).toContain('staleSeconds: 5')
    expect(warn(q(`() => ({ queryKey: ['a'], ${OK_FN}, staleTime: n() })`))).toContain(
      'useQuery staleTime must be a number literal (ms) to lower to native; got CallExpression',
    )
  })
})

describe('parse.ts — tryQueryFnValue (direct-value queryFn)', () => {
  it('a single-return block body lowers to a direct resolve', () => {
    expect(q(`() => ({ queryKey: ['a'], queryFn: () => { return { ok: true } } })`).code).toContain('q.resolve(')
    expect(q(`() => ({ queryKey: ['a'], queryFn: function () { return { ok: true } } })`).code).toContain(
      'q.resolve(',
    )
  })

  it('a multi-statement block, an empty return, an await, or a non-function bails by name', () => {
    const msg = 'useQuery queryFn must be an inline'
    expect(warn(q(`() => ({ queryKey: ['a'], queryFn: () => { const a = 1; return a } })`))).toContain(msg)
    expect(warn(q(`() => ({ queryKey: ['a'], queryFn: () => { return } })`))).toContain(msg)
    expect(warn(q(`() => ({ queryKey: ['a'], queryFn: async () => await load() })`))).toContain(msg)
    expect(warn(q(`() => ({ queryKey: ['a'], queryFn: 5 })`))).toContain(msg)
  })

  it('a `fetch(<call>)` URL is neither an inline fetch nor a direct value', () => {
    expect(warn(q(`() => ({ queryKey: ['a'], queryFn: () => fetch(mk()) })`))).toContain(
      'useQuery queryFn must be an inline',
    )
  })
})

describe('parse.ts — parseFetchInitObject (queryFn fetch init)', () => {
  const fi = (init: string) => q(`() => ({ queryKey: ['a'], queryFn: () => fetch('https://x', ${init}) })`)

  it('a non-object init warns and stays a plain GET', () => {
    const r = fi('opts')
    expect(warn(r)).toContain('useQuery queryFn fetch init must be an object literal to lower to native; got Identifier')
    expect(r.code).not.toContain('method: .post')
  })

  it('bakes method / body / headers literals', () => {
    const r = fi(`{ method: 'put', body: 'payload', headers: { 'x-a': 'b', auth: 'c', n: 1, [k]: 'z', ...more } }`)
    // The computed `[k]` header is NAMED (it used to vanish silently).
    expect(r.warnings).toEqual([
      expect.stringContaining('useQuery queryFn fetch headers: the computed key `[k]` is only known at runtime'),
    ])
    expect(r.code).toContain('method: .put')
    expect(r.code).toContain('"payload"')
    expect(r.code).toContain('"x-a": "b"')
    expect(r.code).toContain('"auth": "c"')
  })

  it('warns by name for a non-literal method / body / headers and skips odd keys', () => {
    const r = fi(`{ method: m, body: b(), headers: h, [dyn]: 1, 2: 'x', ...spread }`)
    const w = warn(r)
    expect(w).toContain('useQuery queryFn fetch method must be a string literal to lower to native; got Identifier')
    expect(w).toContain('useQuery queryFn fetch body must be a string literal to lower to native; got CallExpression')
    expect(w).toContain('useQuery queryFn fetch headers must be an object literal to lower to native; got Identifier')
  })

  it('a quoted-key method and an all-non-literal header map emit no headers', () => {
    const r = fi(`{ 'method': 'DELETE', headers: { a: 1 } }`)
    expect(r.code).toContain('method: .delete')
    expect(r.code).not.toContain('headers:')
  })
})

// ---------------------------------------------------------------------------
// @pyreon/rx
// ---------------------------------------------------------------------------

const rxApp = (imports: string, b: string) =>
  `import { signal } from '@pyreon/reactivity'\n${imports}\nexport function App(){\n  const nums = signal([1, 2, 3])\n${b}\n  return <Text>{String(r())}</Text>\n}`

describe('parse.ts — tryRxNamespaceLowering', () => {
  it('the rx namespace form lowers a v1 method', () => {
    const r = swift(rxApp(`import { rx } from '@pyreon/rx'`, '  const r = rx.filter(nums, (x) => x > 1)'))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('.filter')
  })

  it('a standalone import resolves through the IMPORT map (aliased)', () => {
    const r = swift(rxApp(`import { filter as keep } from '@pyreon/rx'`, '  const r = keep(nums, (x) => x > 1)'))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('.filter')
  })

  it('pipe() is named as unlowerable, not emitted as closures', () => {
    const r = swift(rxApp(`import { pipe } from '@pyreon/rx'`, '  const r = pipe(nums, (xs) => xs)'))
    expect(warn(r)).toContain('pipe() has no native lowering')
  })

  it('a missing source argument, and a non-v1 method, warn by name', () => {
    expect(warn(swift(rxApp(`import { rx } from '@pyreon/rx'`, '  const r = rx.filter()')))).toContain(
      'rx.filter requires a signal source as its first argument.',
    )
    expect(warn(swift(rxApp(`import { rx } from '@pyreon/rx'`, '  const r = rx.combine(nums, nums)')))).toContain(
      'rx.combine is not yet lowered to native',
    )
  })

  it('a member call on a non-`rx` object, a computed member, or an unimported bare name is not rx', () => {
    for (const b of [
      '  const other = { filter: (a: number[]) => a }\n  const r = other.filter(nums)',
      "  const r = rx['filter'](nums, (x) => x > 1)",
      '  const r = filter(nums, (x) => x > 1)',
    ]) {
      const w = warn(swift(rxApp(`import { rx } from '@pyreon/rx'`, b)))
      expect(w).not.toContain('rx.filter')
    }
  })

  it('the `rx` specifier itself is not recorded as a standalone transform', () => {
    const r = swift(rxApp(`import { rx, map } from '@pyreon/rx'\nimport * as all from '@pyreon/rx'`, '  const r = map(nums, (x) => x * 2)'))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('.map')
  })
})

// ---------------------------------------------------------------------------
// createMachine
// ---------------------------------------------------------------------------

const machineApp = (cfg: string) =>
  `import { createMachine } from '@pyreon/machine'\nexport function App(){\n  const m = createMachine(${cfg})\n  return <Text>{m()}</Text>\n}`

describe('parse.ts — tryDeclFromCreateMachine', () => {
  it('reads string-literal keys, `as const` values, terminal states, and skips odd entries', () => {
    const r = swift(
      machineApp(`{
    'initial': 'idle' as const,
    ...extra,
    states: {
      idle: { on: { GO: 'run', 'STOP': 'done', [dyn]: 'x', BAD: 1 }, entry: 1, ...s },
      'run': { on: 'nope' },
      done: {},
      odd: 5,
      ...more,
    },
  }`),
    )
    const w = warn(r)
    // The one computed key (`[dyn]`) is named; nothing else warns.
    expect(r.warnings).toEqual([
      expect.stringContaining('createMachine declaration `m`: state `idle` `on`: the computed key `[dyn]`'),
    ])
    expect(w).toContain('createMachine declaration')
    expect(r.code).toContain('"idle"')
    expect(r.code).toContain('"GO"')
    expect(r.code).toContain('"STOP"')
    expect(r.code).not.toContain('"BAD"')
  })

  it('warns for a non-object config, a missing/non-literal initial, and missing states', () => {
    expect(warn(swift(machineApp('cfg')))).toContain('config argument is not an object literal')
    expect(warn(swift(machineApp('')))).toContain('config argument is not an object literal')
    expect(warn(swift(machineApp('{ initial: 1, states: {} }')))).toContain('`initial` field is missing or not a string literal')
    expect(warn(swift(machineApp(`{ initial: 'a' }`)))).toContain('`states` field is missing or not an object literal')
    expect(warn(swift(machineApp(`{ initial: 'a', states: s }`)))).toContain('`states` field is missing')
  })
})

// ---------------------------------------------------------------------------
// QueryClient / PyreonCrdtDoc / syncedSignal
// ---------------------------------------------------------------------------

describe('parse.ts — new QueryClient() / new PyreonCrdtDoc()', () => {
  it('a `new QueryClient()` binding emits nothing', () => {
    const r = swift(
      `import { QueryClient } from '@pyreon/query'\nexport function App(){\n  const client = new QueryClient()\n  return <Text>x</Text>\n}`,
    )
    expect(r.code).not.toContain('client')
  })

  it('a literal actor id is baked; a non-literal one generates a UUID', () => {
    const doc = (arg: string) =>
      swift(
        `import { PyreonCrdtDoc } from '@pyreon/sync'\nexport function App(){\n  const doc = new PyreonCrdtDoc(${arg})\n  return <Text>x</Text>\n}`,
      ).code
    expect(doc(`'actor-1'`)).toContain('"actor-1"')
    expect(doc('')).toContain('UUID')
  })
})

const syncedApp = (cfg: string) =>
  `import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
export function App(){
  const doc = new PyreonCrdtDoc('a')
  const v = syncedSignal(${cfg})
  return <Text>{String(v())}</Text>
}`

describe('parse.ts — tryDeclFromSyncedSignal', () => {
  it('lowers string / number / boolean initials, a quoted key, and a map name', () => {
    expect(swift(syncedApp(`{ doc, key: 'k', initial: 'x' }`)).warnings).toEqual([])
    expect(swift(syncedApp(`{ doc, 'key': 'k', initial: 2 }`)).warnings).toEqual([])
    const r = swift(syncedApp(`{ doc: doc, key: 'k', initial: true, map: 'm', ...rest }`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"m"')
  })

  it('warns by name for each missing/unlowerable field', () => {
    expect(warn(swift(syncedApp('cfg')))).toContain('argument must be an object literal { doc, key, initial }')
    expect(warn(swift(syncedApp(`{ doc: getDoc(), key: 'k', initial: 1 }`)))).toContain(
      '`doc` must reference a `new PyreonCrdtDoc(...)` binding',
    )
    expect(warn(swift(syncedApp(`{ doc, key: k, initial: 1 }`)))).toContain('`key` must be a string literal')
    expect(warn(swift(syncedApp(`{ doc, key: 'k', initial: null }`)))).toContain('`initial` must be a string, number, or boolean literal')
    expect(warn(swift(syncedApp(`{ doc, key: 'k', initial: [1] }`)))).toContain('`initial` must be a string')
    expect(warn(swift(syncedApp(`{ doc, key: 'k', map: m, initial: 'x' }`)))).toEqual('')
  })
})

// ---------------------------------------------------------------------------
// createFlow / useFlow
// ---------------------------------------------------------------------------

// The `createFlow` declaration is the flow plugin's `ext` declaration now; the payload carries what the
// closed `flow-state` kind did, so the tests keep reading it through the same shape.
type FlowDecl = FlowStateDecl
const asFlowDecl = (d: DeclIR | undefined): FlowDecl | undefined =>
  d?.kind === 'ext' && d.type === 'flow-state' ? { ...(d.payload as unknown as FlowStatePayload), name: d.name } : undefined

const flowSrc = (cfg: string, factory = 'createFlow', pre = '', generic = '') => `import { ${factory} } from '@pyreon/flow'
${pre}
export function App(){
  const flow = ${factory}${generic}(${cfg})
  return <Text>{flow.nodes().length}</Text>
}`

const parseFlow = (cfg: string, factory = 'createFlow', pre = '', generic = '') => {
  const r = parsePyreon(flowSrc(cfg, factory, pre, generic), undefined, { registries: firstPartyCompiler.registries })
  const decl = asFlowDecl(r.components[0]?.decls.find((d) => d.kind === 'ext' && d.type === 'flow-state'))
  return { decl, warnings: r.warnings.join('\n') }
}

const N1 = `{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }`
const N2 = `{ id: 'b', position: { x: 1, y: 2 }, data: { label: 'B' } }`
const withNode = (extra: string) => `{ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' }, ${extra} }], edges: [] }`
const withEdge = (extra: string) => `{ nodes: [${N1}, ${N2}], edges: [{ source: 'a', target: 'b', ${extra} }] }`
const withCfg = (extra: string) => `{ nodes: [${N1}], edges: [], ${extra} }`

describe('parse.ts — createFlow node readers', () => {
  it('reads every literal node field onto the IR', () => {
    const { decl, warnings } = parseFlow(
      withNode(`type: 'input', class: 'c', style: 's', width: 10, height: 20, zIndex: 3, ariaLabel: 'L', parentId: 'p',
        draggable: false, selectable: true, connectable: false, focusable: true, hidden: false, deletable: true, expandParent: true, group: false,
        extent: [[0, 0], [100, 100]],
        sourceHandles: [{ id: 'h', type: 'source', position: 'Right', offset: 4 }],
        targetHandles: [{ type: 'target', position: Position.Left }]`),
    )
    expect(warnings).not.toContain('NOT lowered')
    const n = decl!.nodes[0] as FlowDecl['nodes'][number] & { zIndex?: number }
    expect(n).toMatchObject({
      id: 'a',
      type: 'input',
      cssClass: 'c',
      style: 's',
      zIndex: 3,
      ariaLabel: 'L',
      parentId: 'p',
      draggable: false,
      expandParent: true,
      extent: [0, 0, 100, 100],
      sourceHandles: [{ id: 'h', type: 'source', position: 'right', offset: 4 }],
      targetHandles: [{ type: 'target', position: 'left' }],
    })
  })

  it("`extent: 'parent'` is the parent-clamp flag, not a numeric extent", () => {
    expect(parseFlow(withNode(`extent: 'parent'`)).decl!.nodes[0]).toMatchObject({ extentParent: true })
  })

  it('names every non-literal node field as dropped', () => {
    const { warnings } = parseFlow(
      withNode(`type: t, class: c, style: s, ariaLabel: l, draggable: d, zIndex: z, extent: e,
        sourceHandles: hs, targetHandles: [{ type: 'target', position: 'middle' }], custom: 1`),
    )
    for (const s of [
      'type (not a string literal)',
      'class (not a string literal)',
      'style (not a string literal)',
      'ariaLabel (not a string literal)',
      'draggable (not a boolean literal)',
      'zIndex (not a numeric literal)',
      'extent (expected "parent"',
      'sourceHandles (not a literal handle array)',
      'targetHandles (not a literal handle array)',
      'custom',
    ]) {
      expect(warnings).toContain(s)
    }
  })

  it('rejects malformed extents (wrong arity, non-array pair, non-numeric)', () => {
    for (const e of ['[[0, 0]]', '[1, 2]', '[[0, 0], [1]]', '[[0, a], [1, 1]]']) {
      expect(parseFlow(withNode(`extent: ${e}`)).warnings).toContain('extent (expected "parent"')
    }
  })

  it('rejects handle items that are non-objects, lack type/position, or carry non-literal id/offset', () => {
    for (const h of [
      '[1]',
      `[{ position: 'top' }]`,
      `[{ type: 'source' }]`,
      `[{ type: 'source', position: 'top', id: x }]`,
      `[{ type: 'source', position: 'top', offset: o }]`,
      `[{ type: 'source', position: side.foo }]`,
    ]) {
      expect(parseFlow(withNode(`sourceHandles: ${h}`)).warnings).toContain('sourceHandles (not a literal handle array)')
    }
  })

  it('bails the whole flow for a malformed node (non-object, no id, no position/data, no x/y)', () => {
    const bail = 'must be literal arrays of object literals'
    for (const nodes of [
      '[1]',
      `[{ position: { x: 0, y: 0 }, data: {} }]`,
      `[{ id: 'a', data: {} }]`,
      `[{ id: 'a', position: p, data: {} }]`,
      `[{ id: 'a', position: { x: 0, y: 0 } }]`,
      `[{ id: 'a', position: { x: 0, y: 0 }, data: d }]`,
      `[{ id: 'a', position: { x: 0 }, data: {} }]`,
      'nodesVar()',
    ]) {
      const r = parseFlow(`{ nodes: ${nodes}, edges: [] }`)
      expect(r.decl).toBeUndefined()
      expect(r.warnings).toContain(bail)
    }
  })

  it('resolves a `nodes` identifier through a module-scope static const', () => {
    const r = parseFlow('{ nodes: seed, edges: [] }', 'createFlow', `const seed = [${N1}]`)
    expect(r.decl?.nodes[0]?.id).toBe('a')
  })
})

describe('parse.ts — createFlow edge readers', () => {
  it('derives a deterministic id from source/handles/target when `id` is absent', () => {
    expect(parseFlow(withEdge('')).decl!.edges[0]!.id).toBe('e-a-b')
    expect(parseFlow(withEdge(`sourceHandle: 's', targetHandle: 't'`)).decl!.edges[0]!.id).toBe('e-a-s-b-t')
  })

  it('reads every literal edge field onto the IR', () => {
    const { decl, warnings } = parseFlow(
      withEdge(`id: 'e', type: 'step', label: 'L', animated: true, ariaLabel: 'A', focusable: false, hidden: false, deletable: true, reconnectable: false,
        interactionWidth: 12, zIndex: 2, data: { w: 1 }, class: 'c', style: 's', pathOptions: { curvature: 0.5, borderRadius: 4, offset: 2 },
        markerStart: 'arrow', markerEnd: { type: MarkerType.ArrowClosed, color: 'red', width: 10, height: 11, strokeWidth: 2 },
        waypoints: [{ x: 1, y: 2 }]`),
    )
    expect(warnings).not.toContain('NOT lowered')
    const e = decl!.edges[0] as FlowDecl['edges'][number] & { zIndex?: number }
    expect(e).toMatchObject({
      id: 'e',
      type: 'step',
      label: 'L',
      animated: true,
      ariaLabel: 'A',
      reconnectable: false,
      interactionWidth: 12,
      zIndex: 2,
      cssClass: 'c',
      style: 's',
      pathOptions: { curvature: 0.5, borderRadius: 4, offset: 2 },
      markerStart: { type: 'arrow' },
      markerEnd: { type: 'arrowclosed', color: 'red', width: 10, height: 11, strokeWidth: 2 },
    })
    expect(e.data?.kind).toBe('object')
    expect(e.waypoints).toHaveLength(1)
  })

  it('`markerEnd: null` explicitly clears the default marker; a member marker type reads through', () => {
    expect(parseFlow(withEdge('markerEnd: null')).decl!.edges[0]!.markerEnd).toBeNull()
    expect(parseFlow(withEdge('markerStart: MarkerType.Arrow')).decl!.edges[0]!.markerStart).toEqual({ type: 'arrow' })
  })

  it('names every non-literal edge field as dropped', () => {
    const { warnings } = parseFlow(
      withEdge(`type: t, label: l, animated: a, sourceHandle: sh, focusable: f, interactionWidth: w, zIndex: z, data: d, class: c, style: s,
        pathOptions: p, markerStart: m, markerEnd: 'diamond', waypoints: [{ x: 1 }], extra: 1`),
    )
    for (const s of [
      'type (not a string literal)',
      'label (not a string literal)',
      'animated (not a boolean literal)',
      'sourceHandle (not a string literal)',
      'focusable (not a boolean literal)',
      'interactionWidth (not a numeric literal)',
      'zIndex (not a numeric literal)',
      'data (not an object literal)',
      'class (not a string literal)',
      'style (not a string literal)',
      'pathOptions (not a literal numeric options object)',
      'markerStart (not a literal marker)',
      'markerEnd (not a literal marker or null)',
      'waypoints (not an array literal of { x, y })',
      'extra',
    ]) {
      expect(warnings).toContain(s)
    }
  })

  it('rejects a pathOptions entry that is not numeric, and malformed marker objects', () => {
    expect(parseFlow(withEdge('pathOptions: { curvature: c }')).warnings).toContain('pathOptions (not a literal numeric')
    for (const m of [
      `{ type: 'diamond' }`,
      `{ type: 'arrow', color: c }`,
      `{ type: 'arrow', width: w }`,
      `{ type: Marker.Custom }`,
      '5',
    ]) {
      expect(parseFlow(withEdge(`markerStart: ${m}`)).warnings).toContain('markerStart (not a literal marker)')
    }
    expect(parseFlow(withEdge('waypoints: [1]')).warnings).toContain('waypoints (not an array literal')
    expect(parseFlow(withEdge('waypoints: w')).warnings).toContain('waypoints (not an array literal')
  })

  it('bails for a malformed edge (non-object, non-literal id, missing endpoints) or a non-array edges', () => {
    const bail = 'must be literal arrays of object literals'
    for (const edges of ['[1]', `[{ id: x, source: 'a', target: 'b' }]`, `[{ source: 'a' }]`, 'es']) {
      expect(parseFlow(`{ nodes: [${N1}], edges: ${edges} }`).warnings).toContain(bail)
    }
  })
})

describe('parse.ts — createFlow bails + generic data type', () => {
  it('a non-object argument is named', () => {
    expect(parseFlow('cfg').warnings).toContain('argument must be an object literal { nodes, edges }')
    expect(parseFlow('', 'useFlow').warnings).toContain('useFlow declaration `flow`: argument must be an object literal')
  })

  it('an empty untyped seed warns; an explicit generic accepts it', () => {
    expect(parseFlow('{ nodes: [], edges: [] }').warnings).toContain('an empty `nodes: []` has no literal or explicit generic')
    const typed = parseFlow('{ nodes: [], edges: [] }', 'createFlow', 'type D = { label: string }', '<D>')
    expect(typed.decl?.dataType).toBeDefined()
  })

  it('useFlow marks the state lifecycle-owned', () => {
    expect(parseFlow(withCfg(''), 'useFlow').decl?.lifecycleOwned).toBe(true)
  })
})

describe('parse.ts — createFlow config readers', () => {
  it('reads every literal config key onto the IR', () => {
    const { decl, warnings } = parseFlow(
      withCfg(`minZoom: 0.5, maxZoom: 3, snapToGrid: true, snapGrid: 15, nodeExtent: [[0, 0], [500, 400]],
        defaultMarkerEnd: 'arrowclosed', connectionRules: { input: { outputs: ['a', 'b'] }, 'out': { outputs: [] } },
        isValidConnection: (c) => true, nodesDraggable: false, panOnDrag: [1, 2], reducedMotion: 'auto',
        edgeInteractionWidth: 8, connectionRadius: 20, panOnScrollSpeed: 0.5, deleteKeys: ['Backspace'],
        multiSelectionKey: 'shift', selectionKey: null, defaultEdgeType: 'smoothstep', connectionLineType: 'straight',
        selectionMode: 'full', connectionMode: 'loose', autoPanSpeed: 7, fitView: true, fitViewPadding: 0.2, historyLimit: 50,
        defaultEdgeOptions: { type: 'step', label: 'x', animated: true, interactionWidth: 3, pathOptions: { offset: 1 },
          markerStart: 'arrow', markerEnd: null }`),
    )
    expect(warnings).not.toContain('NOT lowered')
    expect(decl).toMatchObject({
      minZoom: 0.5,
      maxZoom: 3,
      snapToGrid: true,
      snapGrid: 15,
      nodeExtent: [0, 0, 500, 400],
      defaultMarkerEnd: { type: 'arrowclosed' },
      connectionRules: { input: ['a', 'b'], out: [] },
      nodesDraggable: false,
      panOnDrag: false,
      edgeInteractionWidth: 8,
      connectionRadius: 20,
      panOnScrollSpeed: 0.5,
      deleteKeys: ['Backspace'],
      multiSelectionKey: 'shift',
      selectionKey: null,
      defaultEdgeType: 'smoothstep',
      connectionLineType: 'straight',
      selectionMode: 'full',
      connectionMode: 'loose',
      autoPanSpeed: 7,
      fitView: true,
      fitViewPadding: 0.2,
      historyLimit: 50,
      defaultEdgeOptions: {
        type: 'step',
        label: 'x',
        animated: true,
        interactionWidth: 3,
        pathOptions: { offset: 1 },
        markerStart: { type: 'arrow' },
        markerEnd: null,
      },
    })
    expect(decl!.connectionValidator).toBeDefined()
  })

  it('`panOnDrag: [0]` keeps primary-pointer panning; `deleteKeys: null` disables deletion', () => {
    const { decl } = parseFlow(withCfg('panOnDrag: [0], deleteKeys: null, selectionMode: \'partial\', connectionMode: \'strict\''))
    expect(decl).toMatchObject({ panOnDrag: true, deleteKeys: null, selectionMode: 'partial', connectionMode: 'strict' })
  })

  it('names every unlowerable config key', () => {
    const { warnings } = parseFlow(
      withCfg(`minZoom: z, maxZoom: m(), snapToGrid: s, snapGrid: g, nodeExtent: [[0, 0], [x, 1]], connectionRules: r,
        defaultMarkerEnd: 'diamond', nodesDraggable: d, panOnDrag: [a], reducedMotion: 'sometimes', edgeInteractionWidth: w,
        connectionRadius: r2, panOnScrollSpeed: p, deleteKeys: [k], multiSelectionKey: 'hyper', selectionKey: s2,
        defaultEdgeType: t, connectionLineType: t2, selectionMode: 'lasso', connectionMode: m2, autoPanSpeed: a2,
        defaultEdgeOptions: o, fitView: f, fitViewPadding: fp, historyLimit: h, nope: 1, 'quoted': 2, [dyn]: 3`),
    )
    for (const s of [
      'minZoom (not a numeric literal)',
      'maxZoom (not a numeric literal)',
      'snapToGrid (not a boolean literal)',
      'snapGrid (not a numeric literal)',
      'nodeExtent (not a numeric',
      'connectionRules (not a literal',
      'defaultMarkerEnd (not a literal marker or null)',
      'nodesDraggable (not a supported literal)',
      'panOnDrag (not a supported literal)',
      'reducedMotion (not a supported literal)',
      'edgeInteractionWidth (not a numeric literal)',
      'connectionRadius (not a numeric literal)',
      'panOnScrollSpeed (not a numeric literal)',
      'deleteKeys (expected a string[] literal or null)',
      'multiSelectionKey (expected shift, ctrl, meta, alt, or null)',
      'selectionKey (expected shift',
      'defaultEdgeType (not a string literal)',
      'connectionLineType (not a string literal)',
      'selectionMode (expected "partial" or "full")',
      'connectionMode (expected "strict" or "loose")',
      'autoPanSpeed (not a numeric literal)',
      'defaultEdgeOptions (not a supported literal edge-options object)',
      'fitView (not a boolean literal)',
      'fitViewPadding (not a numeric literal)',
      'historyLimit (not a numeric literal)',
      '`nope`',
      '`quoted`',
    ]) {
      expect(warnings).toContain(s)
    }
    expect(warnings).toContain('are NOT lowered natively')
  })

  it('a single dropped key reads "is", not "are"', () => {
    expect(parseFlow(withCfg('nope: 1')).warnings).toContain('`nope` is NOT lowered natively')
  })

  it('rejects malformed nodeExtent / connectionRules shapes', () => {
    for (const e of ['e', '[[0, 0]]', '[1, 2]', '[[0], [1, 1]]']) {
      expect(parseFlow(withCfg(`nodeExtent: ${e}`)).warnings).toContain('nodeExtent (not a numeric')
    }
    for (const r of ['{ ...x }', '{ a: 1 }', '{ a: { outputs: o } }', '{ a: { outputs: [x] } }', '{ [k]: { outputs: [] } }']) {
      expect(parseFlow(withCfg(`connectionRules: ${r}`)).warnings).toContain('connectionRules (not a literal')
    }
    // A NUMERIC key is a static key — JS stores it as the string "5", and the
    // web looks rules up by `node.type`, so a node type "5" matches it.
    expect(parseFlow(withCfg(`connectionRules: { 5: { outputs: ['a'] } }`)).decl?.connectionRules).toEqual({ 5: ['a'] })
  })

  it('rejects each unsupported defaultEdgeOptions shape', () => {
    for (const o of [
      '{ type: t }',
      '{ animated: a }',
      '{ interactionWidth: w }',
      '{ pathOptions: p }',
      '{ pathOptions: { curvature: c } }',
      '{ pathOptions: { bend: 1 } }',
      '{ markerStart: null }',
      "{ markerStart: 'diamond' }",
      "{ markerEnd: 'diamond' }",
      '{ unknownKey: 1 }',
    ]) {
      expect(parseFlow(withCfg(`defaultEdgeOptions: ${o}`)).warnings).toContain('defaultEdgeOptions (not a supported literal')
    }
  })
})

// ---------------------------------------------------------------------------
// createTableState / useSortable / createI18n
// ---------------------------------------------------------------------------

const tableApp = (cfg: string) =>
  `import { signal } from '@pyreon/reactivity'
import { createTableState } from '@pyreon/table'
export function App(){
  const rows = signal([{ id: 1, name: 'a' }])
  const t = createTableState(${cfg})
  return <Text>x</Text>
}`

describe('parse.ts — tryDeclFromCreateTableState', () => {
  it('lowers data getter + string-id columns + numeric pageSize, skipping odd entries', () => {
    const r = swift(
      tableApp(`{ 'data': () => rows(), pageSize: 10, ...rest, columns: [{ id: 'name', 'header': 'N', [k]: 1, ...c }, 5, { id: 1 }] }`),
    )
    // Only the computed column key is named.
    expect(r.warnings).toEqual([
      expect.stringContaining('createTableState declaration `t`: column: the computed key `[k]`'),
    ])
    expect(r.code).toContain('"name"')
  })

  it('warns for a non-object config, a block-body data, and no string-id column', () => {
    expect(warn(swift(tableApp('cfg')))).toContain('argument must be an object literal { data, columns, pageSize }')
    expect(warn(swift(tableApp(`{ data: () => { return rows() }, columns: [{ id: 'a' }] }`)))).toContain(
      '`data` must be an expression-body getter',
    )
    expect(warn(swift(tableApp(`{ data: () => rows(), pageSize: p, columns: [{ id: x }] }`)))).toContain(
      'needs at least one `columns: [{ id }]` entry',
    )
  })
})

const sortApp = (cfg: string) =>
  `import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
export function App(){
  const items = signal([{ id: 'a' }])
  const s = useSortable(${cfg})
  return <Text>x</Text>
}`

describe('parse.ts — tryDeclFromUseSortable', () => {
  const OK = `items: () => items(), by: (it) => it.id, onReorder: (next) => items.set(next)`

  it('lowers the four load-bearing options, horizontal axis, and a block-body reorder', () => {
    const r = swift(sortApp(`{ ${OK}, axis: 'horizontal', 'label2': 1, ...more }`))
    expect(warn(r)).not.toContain('useSortable declaration')
    expect(r.code).toContain('horizontal')
    const block = swift(sortApp(`{ items: () => items(), by: (it) => it.id, onReorder: () => { items.set([]) } }`))
    expect(warn(block)).not.toContain('useSortable declaration')
    expect(swift(sortApp(`{ ${OK}, axis: 'vertical' }`)).code).not.toContain('horizontal')
  })

  it('names the cross-list and label options that have no native lowering', () => {
    const w = warn(swift(sortApp(`{ ${OK}, groupId: 'g', onCrossListDrop: () => {}, onCrossListReceive: () => {}, label: 'x' }`)))
    expect(w).toContain('`groupId` (cross-list boards) has NO native lowering')
    expect(w).toContain('`onCrossListDrop` (cross-list boards)')
    expect(w).toContain('`onCrossListReceive` (cross-list boards)')
    expect(w).toContain('`label` (screen-reader announcement text) is not used natively')
  })

  it('warns for a non-object config and each unlowerable required option', () => {
    expect(warn(swift(sortApp('cfg')))).toContain('argument must be an object literal { items, by, onReorder }')
    expect(warn(swift(sortApp(`{ items: () => { return items() }, by: (it) => it.id, onReorder: (n) => items.set(n) }`)))).toContain(
      '`items` must be an expression-body getter',
    )
    for (const by of ['(a, b) => a.id', '(it) => { return it.id }', 'key', '({ id }) => id']) {
      expect(warn(swift(sortApp(`{ items: () => items(), by: ${by}, onReorder: (n) => items.set(n) }`)))).toContain(
        '`by` must be a single-param expression-body arrow',
      )
    }
    expect(warn(swift(sortApp(`{ items: () => items(), by: (it) => it.id, onReorder: handler }`)))).toContain(
      '`onReorder` must be an arrow function',
    )
  })
})

const i18nApp = (cfg: string, pre = '') =>
  `import { createI18n } from '@pyreon/i18n/core'
${pre}
export function App(){
  const i18n = createI18n(${cfg})
  return <Text>{i18n.t('hello')}</Text>
}`

describe('parse.ts — tryDeclFromCreateI18n', () => {
  it('reads literal / const-resolved locales and one-level messages, skipping odd entries', () => {
    const r = parsePyreon(
      i18nApp(
        `{ 'locale': LOC, fallbackLocale: 'en', ...rest, messages: { en: { hello: 'Hi', 'a.b': 'AB', nested: { x: 'y' }, [k]: 'z', ...m }, 'cs': 'bad', ...z } }`,
        `const LOC = 'cs'`,
      ),
    )
    const d = r.components[0]!.decls.find((x) => x.kind === 'i18n') as Extract<DeclIR, { kind: 'i18n' }>
    expect(d).toMatchObject({ locale: 'cs', fallbackLocale: 'en', messages: { en: { hello: 'Hi', 'a.b': 'AB' }, cs: {} } })
  })

  it('omits fallbackLocale when absent', () => {
    const r = parsePyreon(i18nApp(`{ locale: 'en', messages: { en: {} } }`))
    const d = r.components[0]!.decls.find((x) => x.kind === 'i18n')!
    expect('fallbackLocale' in d).toBe(false)
  })

  it('warns for a non-object config, a missing locale, and missing messages', () => {
    expect(warn(swift(i18nApp('cfg')))).toContain('config argument is not an object literal')
    expect(warn(swift(i18nApp(`{ locale: l, messages: {} }`)))).toContain('`locale` field is missing or not a string literal')
    expect(warn(swift(i18nApp(`{ locale: 'en', messages: m }`)))).toContain('`messages` field is missing or not an object literal')
  })
})

// ---------------------------------------------------------------------------
// createRouter route extraction
// ---------------------------------------------------------------------------

const routerSrc = (cfg: string) => `function Home(){ return <Text>h</Text> }
function authGuard(p){ return true }
function App(){
  const router = createRouter(${cfg})
  return <RouterProvider router={router}><Home/></RouterProvider>
}`

describe('parse.ts — router global guards + route loaders', () => {
  it('names an inline / member / other-shape global guard instead of dropping it silently', () => {
    const r = swift(
      routerSrc(`{ routes: [{ path: '/', component: Home }], beforeEach: [authGuard, (to) => true, guards.auth, 'x'] }`),
    )
    const w = warn(r)
    expect(w).toContain('router `beforeEach`: an inline function guard is not lowered')
    expect(w).toContain('router `beforeEach`: a member expression guard')
    expect(w).toContain('router `beforeEach`: a Literal guard')
  })

  it('a block-body beforeEnter guard and block-body / bad-param loaders warn with the route path', () => {
    const w = warn(
      swift(
        routerSrc(`{ routes: [
          { path: '/a', component: Home, beforeEnter: () => { return true } },
          { path: '/b', component: Home, loader: () => { return 1 } },
          { path: '/c', component: Home, loader: (a, b) => 1 },
          { path: '/d', component: Home, loader: ({ params }) => 1 },
          { path: '/e', component: Home, loader: (ctx) => ctx.request },
        ] }`),
      ),
    )
    expect(w).toContain('Per-route `beforeEnter` guard for route "/a" is a block-body arrow')
    expect(w).toContain('Route `loader` for route "/b" is a block-body arrow')
    expect(w).toContain('Route `loader` for route "/c" has an unsupported parameter shape')
    expect(w).toContain('Route `loader` for route "/d" has an unsupported parameter shape')
    expect(w).toContain('Route `loader` for route "/e" reads `ctx` for something other than `ctx.params.*`')
  })

  it('names "a route" when the offending key precedes `path`', () => {
    const w = warn(swift(routerSrc(`{ routes: [{ loader: () => { return 1 }, beforeEnter: () => { return 1 }, path: '/z', component: Home }] }`)))
    expect(w).toContain('Route `loader` for a route is a block-body arrow')
    expect(w).toContain('Per-route `beforeEnter` guard for a route')
  })
})

describe('parse.ts — Kotlin parity spot-checks for the lowered recognizers', () => {
  it('a createMachine and a flow both lower on Kotlin too', () => {
    expect(kotlin(machineApp(`{ initial: 'a', states: { a: { on: { GO: 'b' } }, b: {} } }`)).code).toContain('"GO"')
    expect(kotlin(flowSrc(withCfg('minZoom: 0.5'))).code).toContain('0.5')
  })
})

// ---------------------------------------------------------------------------
// Second pass — the residual arms: computed-expression keys (neither an
// Identifier nor a Literal, so the key reader returns undefined), destructured
// bindings (every recognizer requires an Identifier id), absent optional
// config fields, and the router/form readers' skip arms.
// ---------------------------------------------------------------------------

const declsOf = (src: string) => parsePyreon(src).components[0]?.decls ?? []

describe('parse.ts — useQuery residual arms', () => {
  it('an unrecognised fetch-init key (`mode`) is ignored, not mis-read as a header', () => {
    const r = q(`() => ({ queryKey: ['a'], queryFn: () => fetch('https://x', { mode: 'cors', method: 'POST' }) })`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('method: .post')
    expect(r.code).not.toContain('cors')
  })

  it('a numeric-keyed header is a static key (JS stores it as the string "1")', () => {
    const r = q(`() => ({ queryKey: ['a'], queryFn: () => fetch('https://x', { headers: { 1: 'x', a: 'b' } }) })`)
    expect(r.code).toContain('"a": "b"')
    expect(r.code).toContain('"1": "x"')
  })

  it('a direct-value queryFn whose returned array has a hole still lowers (the null hole is walked past)', () => {
    expect(q(`() => ({ queryKey: ['a'], queryFn: () => [1, , 2] })`).code).toContain('q.resolve(')
  })
})

describe('parse.ts — rx callee shapes that are not rx', () => {
  it('a call whose callee is neither a member nor an identifier is left alone', () => {
    const r = swift(rxApp(`import { rx } from '@pyreon/rx'`, '  const r = (fnA || fnB)(nums)'))
    expect(warn(r)).not.toContain('rx.')
  })
})

// A computed NON-literal key is only known at runtime. These readers used to
// skip it silently (or, where they only checked `key.type === 'Identifier'`,
// MISREAD `[k]` as the key "k"); every one now NAMES it and lowers the rest.
describe('parse.ts — computed-expression keys are named by every literal-config reader', () => {
  it('createMachine: config / state / `on` / event keys', () => {
    // The machine is the `@pyreon/machine` plugin's `ext` declaration; its payload carries the transition table.
    const decl = parsePyreon(
      machineApp(`{ [a + b]: 1, id: 'm', initial: 'idle', states: {
        [a + b]: {},
        idle: { [a + b]: 1, 'on': { [a + b]: 'x', GO: 'run' }, after: { T: 'x' } },
        run: { on: { ...back, BACK: 'idle' } },
      } }`),
      undefined,
      { registries: firstPartyCompiler.registries },
    ).components[0]?.decls.find((d) => d.kind === 'ext' && d.type === 'machine') as Extract<DeclIR, { kind: 'ext' }>
    expect((decl.payload as { transitions: unknown }).transitions).toEqual({ idle: { GO: 'run' }, run: { BACK: 'idle' } })
    const w = warn(swift(machineApp(`{ [a + b]: 1, initial: 'idle', states: { idle: { on: { [a + b]: 'x', GO: 'idle' } } } }`)))
    expect(w).toContain('createMachine declaration `m`: config: the computed key `[a + b]`')
    expect(w).toContain('createMachine declaration `m`: state `idle` `on`: the computed key `[a + b]`')
  })

  it('syncedSignal: a computed key is named, the rest lowers', () => {
    expect(swift(syncedApp(`{ [a + b]: 1, doc, key: 'k', initial: 1 }`)).warnings).toEqual([
      expect.stringContaining('syncedSignal declaration `v`: config: the computed key `[a + b]`'),
    ])
  })

  it('createFlow: node literal / objProp / config readers', () => {
    const { decl, warnings } = parseFlow(
      `{ [a + b]: 1, ...spread, nodes: [{ ...base, [a + b]: 2, 'id': 'a', position: { x: 0, y: 0 }, data: { v: 1 } }], edges: [] }`,
    )
    expect(decl?.nodes[0]?.id).toBe('a')
    // The computed node key is named as a dropped field; the config one as a dropped key.
    expect(warnings).toContain('[computed key]')
    expect(warnings).toContain('`[a + b] (computed key)`')
  })

  it('createTableState: config + column keys', () => {
    const d = declsOf(tableApp(`{ [a + b]: 1, data: () => rows(), columns: [{ [a + b]: 'x', id: 'name' }] }`)).find(
      (x) => x.kind === 'table-state',
    ) as Extract<DeclIR, { kind: 'table-state' }>
    expect(d.columns).toEqual([{ id: 'name' }])
  })

  it('useSortable: a computed key is skipped', () => {
    const d = declsOf(sortApp('{ [a + b]: 1, items: () => items(), by: (it) => it.id, onReorder: (n) => items.set(n) }'))
    expect(d.some((x) => x.kind === 'sortable')).toBe(true)
  })

  it('createI18n: config / locale / message keys', () => {
    const d = declsOf(
      i18nApp(`{ [a + b]: 1, locale: 'en', extra: true, messages: { [a + b]: {}, en: { [a + b]: 'z', hi: 'Hi', n: 1 } } }`),
    ).find((x) => x.kind === 'i18n') as Extract<DeclIR, { kind: 'i18n' }>
    expect(d.messages).toEqual({ en: { hi: 'Hi' } })
  })

  it('createFlow: a computed config key is named in the dropped-keys warning', () => {
    const { warnings } = parseFlow(withCfg('[a + b]: 1, bogus: 2'))
    expect(warnings).toContain('`[a + b] (computed key)`, `bogus` are NOT lowered natively')
  })
})

describe('parse.ts — createFlow residual arms', () => {
  it('an absent `nodes` (typed) or absent `edges` is an empty list, not a bail', () => {
    const noNodes = parseFlow('{ edges: [] }', 'createFlow', 'type D = { label: string }', '<D>')
    expect(noNodes.decl?.nodes).toEqual([])
    const noEdges = parseFlow(`{ nodes: [${N1}] }`)
    expect(noEdges.decl?.edges).toEqual([])
  })

  it('a partial pathOptions keeps only the keys written', () => {
    expect(parseFlow(withEdge('pathOptions: { curvature: 0.3 }')).decl!.edges[0]!.pathOptions).toEqual({ curvature: 0.3 })
  })

  it('a marker object whose `type` is a computed member lookup is not a literal marker', () => {
    expect(parseFlow(withEdge(`markerEnd: { type: MarkerType['arrow'] }`)).warnings).toContain(
      'markerEnd (not a literal marker or null)',
    )
  })

  it('a non-literal selectionMode is named with the expected values', () => {
    expect(parseFlow(withCfg('selectionMode: sm')).warnings).toContain('selectionMode (expected "partial" or "full")')
  })

  it('node data spread from a base object still counts as an object literal', () => {
    expect(parseFlow(`{ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { ...base, v: 1 } }], edges: [] }`).decl?.nodes).toHaveLength(1)
  })
})

describe('parse.ts — createTableState / useSortable residual arms', () => {
  it('a FunctionExpression data getter (always a block body) is not an expression-body getter', () => {
    expect(warn(swift(tableApp(`{ data: function () { return rows() }, columns: [{ id: 'a' }] }`)))).toContain(
      '`data` must be an expression-body getter',
    )
    expect(warn(swift(sortApp(`{ items: function () { return items() }, by: (it) => it.id, onReorder: (n) => items.set(n) }`)))).toContain(
      '`items` must be an expression-body getter',
    )
  })

  it('a non-array `columns` contributes no columns', () => {
    expect(warn(swift(tableApp('{ data: () => rows(), columns: cols }')))).toContain('needs at least one `columns: [{ id }]` entry')
  })
})

describe('parse.ts — createI18n residual arms', () => {
  it('a non-literal fallbackLocale is dropped (no fallback), not mis-baked', () => {
    const d = declsOf(i18nApp(`{ locale: 'en', fallbackLocale: fb(), messages: { en: {} } }`)).find((x) => x.kind === 'i18n')!
    expect('fallbackLocale' in d).toBe(false)
  })
})

const formApp = (cfg: string) =>
  `import { useForm } from '@pyreon/form'\nexport function App(){\n  const f = useForm(${cfg})\n  return <Text>x</Text>\n}`

describe('parse.ts — tryExtractFormInitialValues', () => {
  it('keeps identifier-, string- and numeric-keyed string literals; skips spreads and non-string values', () => {
    const d = declsOf(formApp(`{ initialValues: { ...base, email: 'a@b', 'name': 'n', 1: 'x', age: 3, tag: t } }`)).find(
      (x) => x.kind === 'form',
    ) as Extract<DeclIR, { kind: 'form' }>
    expect(d.initialValues).toEqual([
      { key: 'email', value: 'a@b' },
      { key: 'name', value: 'n' },
      { key: '1', value: 'x' },
    ])
  })

  it('a non-object config or initialValues yields an empty seed', () => {
    for (const cfg of ['cfg', '{ initialValues: iv }', '']) {
      const d = declsOf(formApp(cfg)).find((x) => x.kind === 'form') as Extract<DeclIR, { kind: 'form' }>
      expect(d.initialValues).toEqual([])
    }
  })
})

describe('parse.ts — parseRouteArray residual arms', () => {
  const routes = (r: string, extra = '') => swift(routerSrc(`{ routes: ${r}${extra} }`))

  it('a config with no `routes` keeps the bare-instance emit', () => {
    expect(swift(routerSrc('{ mode: "history" }')).code).toContain('PyreonRouter')
  })

  it('a non-object route element bails the whole table', () => {
    expect(routes('[Home]').code).not.toContain('matchPath')
  })

  it('a literal redirect is captured; spreads, non-literal paths/redirects are skipped', () => {
    const r = routes(`[{ ...base, path: '/', component: Home }, { path: '/old', redirect: '/' }, { path: '/x', redirect: r, component: Home }]`)
    expect(r.code).toContain('matchPath(path, "/old")')
    expect(r.code).toContain('matchPath(path, "/x")')
    // A route whose path is not a string literal has no dispatch key — the table bails to the bare instance.
    expect(routes(`[{ path: p, component: Home }]`).code).not.toContain('matchPath')
  })

  it('a non-arrow beforeEnter / loader is ignored without a block-body warning', () => {
    const w = warn(routes(`[{ path: '/', component: Home, beforeEnter: guard, loader: load }]`))
    expect(w).not.toContain('beforeEnter')
    expect(w).not.toContain('Route `loader`')
  })

  it('an empty or malformed `children` array leaves the route childless', () => {
    for (const c of ['[]', '[1]', 'kids']) {
      expect(routes(`[{ path: '/', component: Home, children: ${c} }]`).code).toContain('PyreonRouter')
    }
  })

  it('a bad-param / residual-ctx loader BEFORE `path` names "a route"', () => {
    const w = warn(
      routes(`[{ loader: (a, b) => 1, path: '/a', component: Home }, { loader: (ctx) => ctx.request, path: '/b', component: Home }]`),
    )
    expect(w).toContain('Route `loader` for a route has an unsupported parameter shape')
    expect(w).toContain('Route `loader` for a route reads `ctx` for something other than')
  })

  it('an array HOLE in a global guard list is skipped without a warning', () => {
    const w = warn(routes(`[{ path: '/', component: Home }]`, ', beforeEach: [, authGuard]'))
    expect(w).not.toContain('router `beforeEach`')
  })
})

describe('parse.ts — KNOWN BUG: a computed `[ident]` key is read as the literal identifier name', () => {
  // The literal-config readers test `key.type === 'Identifier'` without
  // checking `prop.computed`, so `{ [kind]: … }` is read as the key "kind"
  // rather than the VALUE of `kind`. A computed key is not statically known;
  // it should be named as unlowerable, never silently renamed.
  it('createFlow connectionRules: `{ [kind]: { outputs } }` should be named, not lowered under the key "kind"', () => {
    const { decl, warnings } = parseFlow(withCfg(`connectionRules: { [kind]: { outputs: ['a'] } }`), 'createFlow', `const kind = 'input'`)
    expect(decl?.connectionRules).toBeUndefined()
    expect(warnings).toContain('connectionRules (not a literal')
  })
})
