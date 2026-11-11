// A whole literal outside the 32-bit range (`3000000000`, an epoch-millisecond timestamp) is a Double in every typing
// pass — inference, the struct-field refinement, a signal seed — but the emitters printed it as an integer literal, so a
// declaration with no expected type was an integer while its readers expected a Double:
//
//   const big = 3000000000; String(big)   →  Swift `let big = 3000000000` … `pyreonNumString(big)`
//                                             error: cannot convert value of type 'Int' to expected argument type 'Double'
//
// One rule now decides it for every reader and both emitters (`number-literal.ts`). Negative literals are a unary minus
// over the literal, so each position is also written negative.
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const SOURCE = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
type Event = { name: string; at: number }
const EPOCH = 1709251200000
const BEFORE = -3000000000
export function App() {
  const big = 3000000000
  const neg = -3000000000
  const small = 7
  const startsAt = signal(1792656000000)
  const back = signal(-2200000000)
  const events = signal<Event[]>([{ name: 'a', at: 1709251200000 }, { name: 'b', at: -2200000000 }])
  const later = () => startsAt.set(startsAt() + 60000)
  const label = () => \`\${big} \${neg} \${EPOCH + small} \${BEFORE}\`
  return (
    <Stack>
      <Text>{String(big)}{String(neg)}{String(small)}{String(EPOCH)}{String(BEFORE)}</Text>
      <Text>{String(startsAt())}{String(back())}{label()}</Text>
      <Text>{String(events()[0]!.at > big)}{String(events().length)}</Text>
      <Button onPress={later}>later</Button>
    </Stack>
  )
}`

describe('a whole literal past the 32-bit range is spelled as the Double it is typed as', () => {
  it('Swift: declarations, a module const, a negative, a signal seed and a struct field', () => {
    const { code } = transform(SOURCE, { target: 'swift' })
    expect(code).toContain('let big = 3000000000.0')
    expect(code).toContain('let neg = -3000000000.0')
    expect(code).toMatch(/let EPOCH(: Double)? = 1709251200000\.0/)
    expect(code).toMatch(/let BEFORE(: Double)? = -3000000000\.0/)
    expect(code).toMatch(/var startsAt: Double = 1792656000000\.0/)
    expect(code).toMatch(/var back: Double = -2200000000\.0/)
    expect(code).toContain('var at: Double')
    // A literal inside the 32-bit range is untouched.
    expect(code).toContain('let small = 7')
  })

  it('Kotlin: the same positions are Double literals, never a Long', () => {
    const { code } = transform(SOURCE, { target: 'kotlin' })
    expect(code).toContain('val big = 3000000000.0')
    expect(code).toContain('val neg = -3000000000.0')
    expect(code).toMatch(/val EPOCH(: Double)? = 1709251200000\.0/)
    expect(code).toMatch(/mutableStateOf\(1792656000000\.0\)/)
    expect(code).toMatch(/mutableStateOf\(-2200000000\.0\)/)
    expect(code).toContain('var at: Double')
    expect(code).not.toMatch(/\d{10,}L\b/)
    expect(code).toContain('val small = 7L')
  })

  it('compiles on both toolchains', () => {
    if (isSwiftcAvailable()) expect(validateSwiftWithStubs(transform(SOURCE, { target: 'swift' }).code).error ?? '').toBe('')
    if (isKotlincAvailable()) expect(validateKotlin(transform(SOURCE, { target: 'kotlin' }).code).error ?? '').toBe('')
  }, 180_000)
})
