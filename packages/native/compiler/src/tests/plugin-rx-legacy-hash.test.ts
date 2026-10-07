import { describe, expect, it } from 'vitest'
import type { ExprIR } from '../index'
import { rxPlugin } from './first-party-plugins'

// `moduleTag` derives synthesized struct names from a hash of the declarations. `rx.*` was a closed `rx-call` expression kind
// before it moved into @pyreon/rx; it must keep hashing as that kind did, or every struct name an rx-using file derives moves.
describe('@pyreon/rx legacy hash', () => {
  it('hashes as the closed rx-call kind did: kind, method, source, args — in that order', () => {
    const source: ExprIR = { kind: 'call', callee: { kind: 'identifier', name: 'xs' }, args: [] }
    const arg: ExprIR = { kind: 'literal', value: 2 }
    const e = { kind: 'ext-expr', plugin: '@pyreon/rx', type: 'rx-call', payload: { method: 'take' }, args: [source, arg] } as Extract<ExprIR, { kind: 'ext-expr' }>
    const hash = rxPlugin.exprs?.['rx-call']?.legacyHash?.(e)
    expect(JSON.stringify(hash)).toBe(JSON.stringify({ kind: 'rx-call', method: 'take', source, args: [arg] }))
  })
})
