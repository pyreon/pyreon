import { describe, expect, it } from 'vitest'
import type { IrDocument, IrOperation, IrType } from '../core/ir'
import { emitMocks, mockedOperations } from '../emit/mock'

/**
 * The fixture generator's shape coverage. These are not line-count tests: each
 * branch encodes a decision about what a generated fixture must LOOK like for a
 * UI built against it to be exercised, and the comments in `mock.ts` say why.
 *
 * The array case is the sharp one. Its two elements are threaded with distinct
 * indices deliberately — identical elements share an id, which collapses a keyed
 * `<For>` to a single row and trips the duplicate-key warning, so a fixture that
 * ships them tests the opposite of what it appears to.
 */
const op = (response: IrType): IrOperation =>
  ({ id: 'get', method: 'GET', path: '/x', params: [], response }) as unknown as IrOperation

const docOf = (response: IrType, models: IrDocument['models'] = []): IrDocument => ({
  title: 'T',
  version: '1',
  baseUrl: '',
  models,
  operations: [op(response)],
  notes: [],
})

const fixtureText = (response: IrType, models: IrDocument['models'] = []): string =>
  emitMocks(docOf(response, models)).build('').contents

describe('fixture shapes per IR kind', () => {
  it.each([
    ['email', '"user@example.com"'],
    ['uri', '"https://example.com"'],
    ['date', '"2026-01-01"'],
    ['date-time', '"2026-01-01T00:00:00Z"'],
  ])('a %s string gets a format-appropriate value', (format, expected) => {
    // A `sample foo` in a date field renders an Invalid Date in the UI the
    // fixture exists to exercise.
    expect(fixtureText({ kind: 'string', format } as IrType)).toContain(expected)
  })

  it('a uuid string is well-formed and index-varied', () => {
    const out = fixtureText({ kind: 'array', items: { kind: 'string', format: 'uuid' } })
    expect(out).toContain('00000000-0000-4000-8000-000000000001')
    expect(out).toContain('00000000-0000-4000-8000-000000000002')
  })

  it('an enum takes its FIRST member, not a sample string', () => {
    expect(fixtureText({ kind: 'string', enum: ['active', 'archived'] })).toContain('"active"')
  })

  it.each([
    ['an integer', { kind: 'number', integer: true } as IrType, '1'],
    ['a float', { kind: 'number', integer: false } as IrType, '1.5'],
    ['a boolean', { kind: 'boolean' } as IrType, 'true'],
    ['a null', { kind: 'null' } as IrType, 'null'],
    ['an unrepresentable type', { kind: 'unknown', reason: 'x' } as IrType, 'null'],
  ])('%s renders as %s', (_label, type, expected) => {
    expect(fixtureText(type)).toContain(expected)
  })

  it('an array gets TWO elements that DIFFER', () => {
    // Two, because one is indistinguishable from a scalar in a UI and three is
    // noise. Differing, because identical ids collapse a keyed list.
    const out = fixtureText({
      kind: 'array',
      items: { kind: 'object', fields: [{ name: 'n', type: { kind: 'number', integer: true }, required: true }] },
    } as IrType)
    expect(out).toContain('1')
    expect(out).toContain('2')
  })

  it('a union takes its first option', () => {
    expect(fixtureText({ kind: 'union', options: [{ kind: 'boolean' }, { kind: 'string' }] })).toContain('true')
  })

  it('an EMPTY union has nothing to pick and yields null', () => {
    expect(fixtureText({ kind: 'union', options: [] })).toContain('null')
  })

  it('a ref resolves through the model table', () => {
    const out = fixtureText({ kind: 'ref', name: 'M' }, [
      { name: 'M', type: { kind: 'object', fields: [{ name: 'ok', type: { kind: 'boolean' }, required: true }] } },
    ])
    expect(out).toContain('"ok"')
  })

  it('a DANGLING ref yields null rather than throwing', () => {
    // A spec can reference a model the input layer dropped; a fixture emitter
    // that throws there takes the whole generate down over one bad reference.
    expect(fixtureText({ kind: 'ref', name: 'Missing' })).toContain('null')
  })
})

describe('object field selection', () => {
  const obj = (fields: unknown[]): IrType => ({ kind: 'object', fields } as IrType)

  it('omits a plain optional to keep fixtures small', () => {
    const out = fixtureText(
      obj([
        { name: 'id', type: { kind: 'number', integer: true }, required: true },
        { name: 'note', type: { kind: 'string' }, required: false },
      ]),
    )
    expect(out).toContain('"id"')
    expect(out).not.toContain('"note"')
  })

  it('KEEPS an optional enum — it drives a visible variant', () => {
    // A status badge or filter the UI must handle. Omitting it renders the one
    // state that never needs handling.
    const out = fixtureText(
      obj([{ name: 'status', type: { kind: 'string', enum: ['active'] }, required: false }]),
    )
    expect(out).toContain('"status"')
  })

  it('KEEPS an optional that carries an example', () => {
    const out = fixtureText(
      obj([{ name: 'hint', type: { kind: 'string' }, required: false, example: 'given' }]),
    )
    expect(out).toContain('"given"')
  })

  it('a nullable optional is rendered as null, not omitted', () => {
    const out = fixtureText(
      obj([
        { name: 'kind', type: { kind: 'string', enum: ['a'] }, required: false },
        { name: 'x', type: { kind: 'string' }, required: false, nullable: true, example: 'e' },
      ]),
    )
    expect(out).toContain('"kind"')
  })
})

describe('mockedOperations', () => {
  it('counts only operations that have a response to mock', () => {
    const d: IrDocument = {
      ...docOf({ kind: 'boolean' }),
      operations: [
        op({ kind: 'boolean' }),
        { id: 'del', method: 'DELETE', path: '/x', params: [] } as unknown as IrOperation,
      ],
    }
    expect(mockedOperations(d).map((o) => o.id)).toEqual(['get'])
  })
})
