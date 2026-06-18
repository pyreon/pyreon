// Targeted coverage for state-tree's residual branches.
import { describe, expect, it, vi } from 'vitest'
import { model } from '../model'
import { applyPatch } from '../patch'

type Shape = { name: string; age: number }

function makeAdapter() {
  const state = { mode: 'ok' as 'ok' | 'invalid' }
  const adapter = {
    _infer: undefined as unknown as Shape,
    validator: async () => ({}) as never,
    parse: (value: unknown) => {
      if (state.mode === 'invalid') {
        return { ok: false as const, issues: [{ path: 'name', message: 'forced invalid' }] }
      }
      return { ok: true as const, value: value as Shape }
    },
  }
  return { adapter, state }
}

describe('state-tree — patch suppressed via onValidationError (valid === undefined)', () => {
  it('an invalid patch with onValidationError returns without writing', () => {
    const { adapter, state } = makeAdapter()
    const onErr = vi.fn()
    const M = model({
      schema: adapter,
      initial: { name: 'a', age: 1 },
      onValidationError: onErr,
    })
    const m = M.create() as ReturnType<typeof M.create> & {
      name: () => string
      patch: (p: Partial<Shape>) => void
    }
    state.mode = 'invalid'
    m.patch({ name: 'bad' }) // validation fails → onValidationError → suppressed (no throw)
    expect(onErr).toHaveBeenCalled()
    expect(m.name()).toBe('a') // state unchanged
  })
})

describe('state-tree — applyPatch path validation', () => {
  it('applyPatch with an empty path throws', () => {
    const M = model({ state: { x: 1 } })
    const m = M.create()
    expect(() => applyPatch(m, { op: 'replace', path: '/', value: 2 })).toThrow(/empty path/)
  })
})
