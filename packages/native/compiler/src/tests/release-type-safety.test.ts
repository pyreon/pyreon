import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateSwiftTypecheck,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const prefix = `import { Stack, Text } from '@pyreon/primitives'
import { computed } from '@pyreon/reactivity'`

const cases = [
  [
    'zero-argument helpers',
    `${prefix}
function greeting(): string { return 'ready' }
function answer(): number { return 42 }
function enabled(): boolean { return true }
export function App() {
  const message = computed(() => greeting())
  const n = computed(() => answer())
  const yes = computed(() => enabled())
  return <Stack><Text>{() => message()}</Text><Text>{() => String(n())}</Text><Text>{() => String(yes())}</Text></Stack>
}`,
  ],
  [
    'distinct nested prop types',
    `${prefix}
export function App(props: { one: { meta: { a: number } }; two: { meta: { b: string } } }) {
  return <Stack><Text>{() => String(props.one.meta.a)}</Text><Text>{() => props.two.meta.b}</Text></Stack>
}`,
  ],
  [
    'optional member families',
    `${prefix}
export function App(props: { data: { rows?: string[]; label?: string; meta?: { n: number } } }) {
  const rows = computed(() => props.data.rows?.length)
  const label = computed(() => props.data.label?.length)
  const n = computed(() => props.data.meta?.n)
  return <Stack><Text>{() => String(rows() ?? 0)}</Text><Text>{() => String(label() ?? 0)}</Text><Text>{() => String(n() ?? 0)}</Text></Stack>
}`,
  ],
] as const

describe.each(cases)('%s produces buildable native code', (_name, source) => {
  it.skipIf(!isSwiftcAvailable())('Swift', () => {
    const emitted = transform(source, { target: 'swift' })
    expect(emitted.warnings).toEqual([])
    const result = validateSwiftWithStubs(emitted.code)
    expect(result.skipped).not.toBe(true)
    expect(result.ok, result.error).toBe(true)
  })
  it.skipIf(!isSwiftUIAvailable())('SwiftUI SDK', () => {
    const emitted = transform(source, { target: 'swift' })
    expect(emitted.warnings).toEqual([])
    const result = validateSwiftTypecheck(emitted.code)
    expect(result.skipped).not.toBe(true)
    expect(result.ok, result.error).toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Kotlin', () => {
    const emitted = transform(source, { target: 'kotlin' })
    expect(emitted.warnings).toEqual([])
    const result = validateKotlin(emitted.code)
    expect(result.skipped).not.toBe(true)
    expect(result.ok, result.error).toBe(true)
  })
})
