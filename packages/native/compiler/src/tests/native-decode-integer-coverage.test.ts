import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'

/**
 * Every native JSON decode target whose `number` lowers to an INTEGER is named — not only a declared struct's fields.
 *
 * TS `number` has no int/float split; PMTC lowers it to Swift `Int` / Kotlin `Long` unless a fractional literal proves
 * otherwise, so a fractional JSON value (`9.99`) fails the WHOLE decode on iOS and Android and the request's `data`
 * stays empty. `warnIntegerDecodeFields` named this for declared structs, but returned early when the file declared
 * none and never walked an inline object type, a `Record` value or a bare `number` target — so each of these compiled
 * with ZERO warnings and rejected `{"price":9.99}` / `[1, 2.5]` / `{"x":1.5}` at runtime (proven by executing the
 * emitted Codable / @Serializable decoders against those payloads in the audit that found it).
 */
const integerWarnings = (src: string): string[] => {
  const sw = transform(src, { target: 'swift' }).warnings.filter((w) => w.includes('INTEGER'))
  const kt = transform(src, { target: 'kotlin' }).warnings.filter((w) => w.includes('INTEGER'))
  expect(kt).toEqual(sw)

  return sw
}

const FETCH = (t: string, pre = ''): string => `import { useFetch } from '@pyreon/hooks'
${pre}
export function A() { const f = useFetch<${t}>('https://x/p'); return <Text>{'x'}</Text> }`

describe('integer decode targets are named wherever they sit', () => {
  it.each([
    ['an inline object type argument', FETCH('{ price: number }'), '`{ price }`, whose field `price`'],
    ['a bare number', FETCH('number'), 'targets `number`, an INTEGER'],
    ['a bare number[]', FETCH('number[]'), 'targets `number[]`, an INTEGER'],
    ['a bare Record<string, number>', FETCH('Record<string, number>'), 'targets `Record<string, number>`, an INTEGER'],
    ['a Record field of a declared struct', FETCH('R', 'type R = { totals: Record<string, number> }'), '`R`, whose field `totals`'],
    [
      'a useQuery inline type',
      `import { useQuery } from '@pyreon/query'
export function A() { const q = useQuery<{ total: number }>(() => ({ queryKey: ['t'], queryFn: () => fetch('https://x').then((r) => r.json()) })); return <Text>{'x'}</Text> }`,
      '`{ total }`, whose field `total`',
    ],
    ['a JSON.parse inline type', `export function A() { const v = JSON.parse('{}') as { avg: number }; return <Text>{String(v.avg)}</Text> }`, '`{ avg }`, whose field `avg`'],
  ])('%s', (_name, src, needle) => {
    const w = integerWarnings(src)
    expect(w).toHaveLength(1)
    expect(w[0]).toContain(needle)
  })

  it.each([
    ['an id-only shape', FETCH('{ id: number; name: string }')],
    ['a Double-typed field', FETCH('{ price: Double }', 'type Double = number')],
    ['a string target', FETCH('string[]')],
  ])('%s stays silent', (_name, src) => {
    expect(integerWarnings(src)).toEqual([])
  })
})
