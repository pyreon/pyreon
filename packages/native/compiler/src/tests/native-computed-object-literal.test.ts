// A computed whose value is an object literal is typed as the struct the emit synthesizes for it, not `Any`.
//
// THE BUG: inference cannot name an anonymous literal (the `__ObjN` struct is synthesized at emit time), so Swift
// annotated the getter `private var stats: Any { __Obj0(...) }`, and the first field read failed the typecheck —
// "value of type 'Any' has no member 'sum'" — with no warning. Grouping derived values into one computed is an
// ordinary way to write it. Kotlin was unaffected: `derivedStateOf` infers its own type.
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const APP = [
  "import { Text, Stack } from '@pyreon/primitives'",
  "import { signal, computed } from '@pyreon/reactivity'",
  'export function App() {',
  '  const a = signal(1)',
  '  const stats = computed(() => ({ sum: a() + 1, doubled: a() * 2 }))',
  '  const total = computed(() => stats().sum + stats().doubled)',
  "  const rows = computed(() => [{ id: 1, label: 'x' }, { id: 2, label: 'y' }])",
  '  const pick = computed(() => {',
  '    const n = a() + 1',
  '    return { n, big: n > 5 }',
  '  })',
  '  return (',
  '    <Stack>',
  '      <Text>{String(stats().sum)} {String(total())}</Text>',
  '      <Text>{rows()[0].label}</Text>',
  "      <Text>{pick().big ? 'big' : 'small'} {String(pick().n)}</Text>",
  '    </Stack>',
  '  )',
  '}',
].join('\n')

describe('Swift', () => {
  const out = transform(APP, { target: 'swift' })

  it('annotates each computed with its synthesized struct, and types a downstream field read', () => {
    expect(out.warnings).toEqual([])
    expect(out.code).not.toMatch(/private var \w+: Any\b/)
    expect(out.code).toMatch(/private var stats: (__Obj\d+\w*) \{ \(\1\(sum:/)
    expect(out.code).toContain('private var total: Int { stats.sum + stats.doubled }')
    expect(out.code).toMatch(/private var rows: \[(__Obj\d+\w*)\] \{ \[\1\(id: 1/)
    expect(out.code).toMatch(/private var pick: __Obj\d+\w* \{\n/)
  })

  it.skipIf(!isSwiftcAvailable())('typechecks', () => {
    const r = validateSwiftWithStubs(out.code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })
})

describe('Kotlin (unchanged control)', () => {
  const out = transform(APP, { target: 'kotlin' })

  it.skipIf(!isKotlincAvailable())('compiles', () => {
    expect(out.warnings).toEqual([])
    const r = validateKotlin(out.code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})
