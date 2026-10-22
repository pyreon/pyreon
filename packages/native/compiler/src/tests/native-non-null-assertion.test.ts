// TypeScript's non-null assertion `x!` force-unwraps an optional natively: Swift `x!`, Kotlin `x!!`.
//
// THE BUG: the parser treated `x!` as transparent — fine in JS, where it has no runtime effect, but natively an
// optional must be unwrapped before a member is read. `<Show when={() => u() !== null}>{u()!.name}</Show>` lowered to
// `u.name` on a `U?`: Swift "value of optional type 'U?' must be unwrapped", Kotlin "smart cast to 'U' is impossible,
// because 'u' is a delegated property". No warning on either target. `!` after a null check is how TypeScript is
// written whenever the narrowing cannot be expressed in the type system.
//
// The unwrap is emitted only when the argument's native type IS optional: an array element is non-optional natively,
// and a `!` there would itself fail to compile.
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const APP = [
  "import { Text, Show, Stack } from '@pyreon/primitives'",
  "import { signal } from '@pyreon/reactivity'",
  'type U = { name: string }',
  'function label(x: U | null): string {',
  '  return x!.name',
  '}',
  'export function App() {',
  '  const u = signal<U | null>(null)',
  "  const names = signal(['a', 'b'])",
  '  return (',
  '    <Stack>',
  "      <Show when={() => u() !== null} fallback={<Text>none</Text>}>",
  '        <Text>{u()!.name}</Text>',
  '      </Show>',
  '      <Text>{label(u())}</Text>',
  '      <Text>{names()[0]!}</Text>',
  '    </Stack>',
  '  )',
  '}',
].join('\n')

describe('Swift', () => {
  const out = transform(APP, { target: 'swift' })

  it('force-unwraps an optional and leaves a non-optional alone', () => {
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('Text(verbatim: "\\((u)!.name)")')
    expect(out.code).toContain('(x)!.name')
    // `names[0]` is non-optional in Swift, so no `!` (it would be "cannot force unwrap value of non-optional type").
    expect(out.code).toMatch(/names\[0\]\)"\)/)
    expect(out.code).not.toMatch(/names\[0\]\)!/)
  })

  it.skipIf(!isSwiftcAvailable())('typechecks', () => {
    const r = validateSwiftWithStubs(out.code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })
})

describe('Kotlin', () => {
  const out = transform(APP, { target: 'kotlin' })

  it('force-unwraps an optional with !! and leaves a non-null alone', () => {
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('(u)!!.name')
    expect(out.code).toContain('(x)!!.name')
    expect(out.code).not.toMatch(/names\[0(L)?\]\)!!/)
  })

  it.skipIf(!isKotlincAvailable())('compiles', () => {
    const r = validateKotlin(out.code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})
