/**
 * The API contract diff — what `lathe check --fail-on-breaking` gates on.
 *
 * A MISSED breaking change is the failure that matters: the gate passes,
 * the client regenerates, and code that was correct yesterday is wrong
 * at runtime today. Nobody sees a diff line, because there wasn't one.
 *
 * The mirror failure is a false breaking change, which is nearly as bad
 * in practice — a gate that cries wolf on every additive spec edit gets
 * bypassed, and then it is not a gate at all. So the severity split is
 * the contract worth pinning in BOTH directions: adding an optional
 * param is additive, making an existing one required is breaking, and
 * the two must never be confused.
 *
 * The `version` field guards the other silent mode. When the RENDERING
 * changes shape, an old baseline diffs as a thousand unrelated changes —
 * so a stale baseline has to be reported as stale rather than drowned in
 * noise the reader then learns to ignore.
 */
import { describe, expect, it } from 'vitest'
import { diffSurface, extractSurface, renderType } from '../core/surface'
import type { ApiSurface } from '../core/surface'
import type { IrDocument, IrOperation, IrType } from '../core/ir'

const op = (over: Partial<IrOperation> = {}): IrOperation => ({
  id: 'getUser',
  method: 'GET',
  path: '/users/{id}',
  pathParams: [],
  queryParams: [],
  ...over,
} as IrOperation)

const param = (name: string, required = true, type: IrType = { kind: 'string' }) =>
  ({ name, type, required, nullable: false })

const doc = (over: Partial<IrDocument> = {}): IrDocument => ({
  title: 'T', version: '1', baseUrl: '', models: [], operations: [], notes: [], ...over,
} as IrDocument)

const surface = (over: Partial<IrDocument> = {}): ApiSurface => extractSurface(doc(over))
const diff = (was: Partial<IrDocument>, now: Partial<IrDocument>) =>
  diffSurface(surface(was), surface(now))
const codes = (cs: ReturnType<typeof diff>) => cs.map((c) => c.code)
const breaking = (cs: ReturnType<typeof diff>) =>
  cs.filter((c) => c.severity === 'breaking').map((c) => c.code)

describe('an identical spec produces NO changes', () => {
  it('is quiet when nothing moved', () => {
    // The control, and the property that keeps the gate usable: a gate
    // that reports on every run is one people learn to bypass.
    const d = { operations: [op()], models: [{ name: 'U', type: { kind: 'string' } as IrType }] }
    expect(diff(d, d)).toEqual([])
  })
})

describe('operations', () => {
  it('reports a REMOVED operation as breaking', () => {
    // Every caller of it breaks at runtime.
    const cs = diff({ operations: [op()] }, { operations: [] })
    expect(codes(cs)).toContain('operation-removed')
    expect(breaking(cs)).toContain('operation-removed')
  })

  it('reports an ADDED operation as additive', () => {
    const cs = diff({ operations: [] }, { operations: [op()] })
    expect(codes(cs)).toContain('operation-added')
    expect(breaking(cs), 'adding an endpoint breaks nobody').not.toContain('operation-added')
  })

  it('reports a MOVED operation as breaking', () => {
    // Same id, different path — the generated call now requests a URL
    // the server does not serve, and the failure is a 404 at runtime.
    const cs = diff({ operations: [op()] }, { operations: [op({ path: '/v2/users/{id}' })] })
    expect(codes(cs)).toContain('operation-moved')
    expect(breaking(cs)).toContain('operation-moved')
  })

  it('reports a METHOD change as breaking too', () => {
    const cs = diff({ operations: [op()] }, { operations: [op({ method: 'POST' })] })
    expect(breaking(cs).length).toBeGreaterThan(0)
  })
})

describe('parameters — the severity split is the whole contract', () => {
  const withParams = (params: ReturnType<typeof param>[]) =>
    ({ operations: [op({ queryParams: params })] })

  it('an ADDED OPTIONAL param is additive', () => {
    // The commonest spec edit there is. Reporting it breaking makes the
    // gate fire on ordinary work.
    const cs = diff(withParams([]), withParams([param('page', false)]))
    expect(codes(cs)).toContain('param-added')
    expect(breaking(cs)).toEqual([])
  })

  it('an ADDED REQUIRED param is breaking', () => {
    // Existing correct calls now omit something the server demands.
    const cs = diff(withParams([]), withParams([param('page', true)]))
    expect(breaking(cs).length, 'a new required param breaks every caller').toBeGreaterThan(0)
  })

  it('an existing param becoming REQUIRED is breaking', () => {
    // The subtle one — nothing was added or removed, only tightened.
    const cs = diff(withParams([param('page', false)]), withParams([param('page', true)]))
    expect(codes(cs)).toContain('param-now-required')
    expect(breaking(cs)).toContain('param-now-required')
  })

  it('a param becoming OPTIONAL is not breaking', () => {
    // Loosening cannot break an existing caller.
    const cs = diff(withParams([param('page', true)]), withParams([param('page', false)]))
    expect(breaking(cs)).toEqual([])
  })

  it('a param TYPE change is breaking', () => {
    // `string` → `number` compiles in the generated client and fails at
    // the server.
    const cs = diff(
      withParams([param('page')]),
      withParams([param('page', true, { kind: 'number', integer: true })]),
    )
    expect(codes(cs)).toContain('param-type-changed')
    expect(breaking(cs)).toContain('param-type-changed')
  })

  it('a REMOVED param is reported', () => {
    // Deliberately not asserting a severity: a caller that keeps sending
    // a param the server dropped is ignored, not rejected, so this is a
    // judgement the diff makes and the spec records rather than dictates.
    const cs = diff(withParams([param('page')]), withParams([]))
    expect(cs.length, 'the removal must appear in the diff at all').toBeGreaterThan(0)
  })
})

describe('bodies and responses', () => {
  it('a changed request body is breaking, and names both sides', () => {
    // The message is what tells the reader whether they can adapt.
    const cs = diff(
      { operations: [op({ body: { kind: 'string' } })] },
      { operations: [op({ body: { kind: 'number', integer: true } })] },
    )
    const change = cs.find((c) => c.code === 'body-changed')
    expect(change?.severity).toBe('breaking')
    expect(change?.detail, 'both the old and new shape').toMatch(/string/)
    // `integer`, not `number` — the rendering distinguishes them, and a
    // diff that said "number" would hide an int/float contract change.
    expect(change?.detail).toMatch(/integer/)
  })

  it('ADDING a body where there was none is breaking, and says "none"', () => {
    // The `?? 'none'` arm — `undefined → number` in a diff line reads as
    // a bug in the tool.
    const cs = diff({ operations: [op()] }, { operations: [op({ body: { kind: 'string' } })] })
    const change = cs.find((c) => c.code === 'body-changed')
    expect(change?.detail).toContain('none')
    expect(change?.detail).not.toContain('undefined')
  })

  it('a changed response is breaking, in both directions', () => {
    const added = diff({ operations: [op()] }, { operations: [op({ response: { kind: 'string' } })] })
    expect(codes(added)).toContain('response-changed')
    const removed = diff({ operations: [op({ response: { kind: 'string' } })] }, { operations: [op()] })
    const change = removed.find((c) => c.code === 'response-changed')
    expect(change?.detail).toContain('none')
    expect(change?.detail).not.toContain('undefined')
  })
})

describe('models', () => {
  const withModel = (fields: Array<[string, boolean]>) => ({
    models: [{
      name: 'User',
      type: {
        kind: 'object',
        fields: fields.map(([name, required]) => param(name, required)),
      } as IrType,
    }],
  })

  it('an ADDED model is additive', () => {
    const cs = diff({ models: [] }, withModel([['id', true]]))
    expect(codes(cs)).toContain('model-added')
    expect(breaking(cs)).toEqual([])
  })

  it('a REMOVED model is breaking', () => {
    const cs = diff(withModel([['id', true]]), { models: [] })
    expect(breaking(cs).length).toBeGreaterThan(0)
  })

  it('a removed FIELD is breaking', () => {
    const cs = diff(withModel([['id', true], ['name', true]]), withModel([['id', true]]))
    expect(breaking(cs).length, 'callers read that field').toBeGreaterThan(0)
  })

  it('an added OPTIONAL field is additive', () => {
    const cs = diff(withModel([['id', true]]), withModel([['id', true], ['note', false]]))
    expect(breaking(cs)).toEqual([])
  })
})

describe('changes are ordered so the important ones are read first', () => {
  it('sorts breaking before additive, then by subject', () => {
    // A long diff is skimmed. Burying a removal under twenty additions
    // is how it gets missed.
    const cs = diff(
      { operations: [op({ id: 'zed' }), op({ id: 'gone', path: '/gone' })] },
      { operations: [op({ id: 'zed' }), op({ id: 'added', path: '/added' })] },
    )
    const severities = cs.map((c) => c.severity)
    const firstAdditive = severities.indexOf('additive')
    if (firstAdditive >= 0) {
      expect(severities.slice(firstAdditive), 'no breaking change after an additive one')
        .not.toContain('breaking')
    }
  })
})

describe('the surface renders types as stable, readable strings', () => {
  it('renders each kind', () => {
    expect(renderType({ kind: 'string' })).toBe('string')
    // An integer renders distinctly from a float — the two are a real
    // contract difference for a caller.
    expect(renderType({ kind: 'number', integer: true })).toBe('integer')
    expect(renderType({ kind: 'number', integer: false })).toBe('number')
    expect(renderType({ kind: 'boolean' })).toBe('boolean')
    expect(renderType({ kind: 'array', items: { kind: 'string' } })).toBe('string[]')
    expect(renderType({ kind: 'ref', name: 'User' })).toBe('User')
    // A format is the more specific contract, so it wins over `string`.
    expect(renderType({ kind: 'string', format: 'uuid' })).toBe('uuid')
  })

  it('renders an ABSENT type as void, never undefined', () => {
    // It lands in a diff line a human reads.
    expect(renderType(undefined)).toBe('void')
  })

  it('SORTS a union and an object, so reordering is not a change', () => {
    // A spec that reorders its `oneOf` has not changed its contract. A
    // diff that says otherwise trains people to ignore it.
    const a = renderType({ kind: 'union', options: [{ kind: 'string' }, { kind: 'boolean' }] })
    const b = renderType({ kind: 'union', options: [{ kind: 'boolean' }, { kind: 'string' }] })
    expect(a).toBe(b)
    const o1 = renderType({ kind: 'object', fields: [param('b'), param('a')] })
    const o2 = renderType({ kind: 'object', fields: [param('a'), param('b')] })
    expect(o1).toBe(o2)
  })

  it('elides past a depth bound rather than recursing forever', () => {
    let type: IrType = { kind: 'string' }
    for (let i = 0; i < 12; i++) {
      type = { kind: 'object', fields: [param('f', true, type)] } as IrType
    }
    expect(renderType(type)).toContain('…')
  })

  it('bounds a deeply nested inline object rather than recursing forever', () => {
    // `ref` closes recursion in the IR, but a nested inline object can
    // still be arbitrarily deep.
    let type: IrType = { kind: 'string' }
    for (let i = 0; i < 40; i++) {
      type = { kind: 'object', fields: [param('f', true, type)] } as IrType
    }
    let out = ''
    expect(() => { out = renderType(type) }).not.toThrow()
    expect(out.length).toBeGreaterThan(0)
  })

  it('marks optional fields with ?', () => {
    const rendered = renderType({
      kind: 'object', fields: [param('a', true), param('b', false)],
    })
    expect(rendered).toContain('b?:')
    expect(rendered).not.toContain('a?:')
  })

  it('stamps a version, so a stale baseline is reported as stale', () => {
    // Without it, a change to the RENDERING diffs as a thousand
    // unrelated changes and the reader learns to ignore the gate.
    expect(surface().version).toBe(1)
  })
})
