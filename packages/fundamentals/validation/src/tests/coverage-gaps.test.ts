// Targeted coverage for the validation adapters' catch + nullish branches.
import { describe, expect, it } from 'vitest'
import { arktypeSchema } from '../arktype'
import { valibotSchema } from '../valibot'
import { zodSchema } from '../zod'

describe('validation adapters — non-Error thrown in parse → String(err)', () => {
  it('zod adapter stringifies a non-Error throw', () => {
    const a = zodSchema({ safeParse: () => { throw 'zod-string-error' } } as never)
    const r = a.parse!({})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]?.message).toBe('zod-string-error')
  })

  it('arktype adapter stringifies a non-Error throw', () => {
    const a = arktypeSchema(((): never => { throw 'ark-string-error' }) as never)
    const r = a.parse!({})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]?.message).toBe('ark-string-error')
  })

  it('valibot adapter stringifies a non-Error throw', () => {
    const a = valibotSchema({} as never, (() => { throw 'val-string-error' }) as never)
    const r = a.parse!({})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]?.message).toBe('val-string-error')
  })
})

describe('validation — valibot result with no issues → []', () => {
  it('a failed valibot result lacking `issues` yields an empty issue list', () => {
    const a = valibotSchema({} as never, (() => ({ success: false })) as never)
    const r = a.parse!({})
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues).toEqual([])
  })
})
