// `d.toJSON()`, `d.valueOf()` and `Date.prototype.…` on native.
//
// Natively a date IS its epoch milliseconds (date-lowering.ts). `toJSON` was deliberately left out of the by-name date
// rewrite (other objects define it — a flow's snapshot), so `d.toJSON()` was emitted verbatim against a `Double`, and
// `d.valueOf()` and `Date.prototype.toISOString.call(d)` the same way: three native build failures with ZERO warnings.
// Found during issue triage. `toJSON` / `valueOf` are now decided by the receiver's type (no JavaScript number has a
// `toJSON`), lowering to what `toISOString()` and the value itself lower to; a `.prototype` that survives into the
// emit, and the Date setters that were missing from the JavaScript-only method list, are named.
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const both = ['swift', 'kotlin'] as const

const app = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
type Ev = { title: string; at: Date }
function stamp(d: Date): string { return d.toJSON() }
export function App() {
  const due = signal(new Date('2026-03-10T09:30:00Z'))
  const events = signal<Ev[]>([{ title: 'a', at: new Date(0) }])
  const iso = computed(() => due().toJSON())
  const same = computed(() => due().toJSON() === due().toISOString())
  const ms = computed(() => due().valueOf() + events()[0]!.at.valueOf())
  const now = new Date().toJSON()
  return (<Stack><Text>{iso()}</Text><Text>{String(same())}</Text><Text>{ms()}</Text><Text>{now}</Text><Text>{stamp(due())}</Text></Stack>)
}
`

describe('d.toJSON() and d.valueOf() lower', () => {
  it('swift: toJSON is the ISO string toISOString lowers to; valueOf is the milliseconds', () => {
    const { code, warnings } = transform(app, { target: 'swift' })
    expect(warnings).toEqual([])
    expect(code).not.toMatch(/\.toJSON\(|\.valueOf\(/)
    expect(code).toContain('func stamp(_ d: Double) -> String { pyreonDateISO(d) }')
    expect(code).toContain('pyreonDateISO(due) == pyreonDateISO(due)')
    expect(code).toContain('pyreonDateISO((Date().timeIntervalSince1970 * 1000))')
  })
  it('kotlin: the same', () => {
    const { code, warnings } = transform(app, { target: 'kotlin' })
    expect(warnings).toEqual([])
    expect(code).not.toMatch(/\.toJSON\(|\.valueOf\(/)
    expect(code).toContain('pyreonDateISO(d)')
    expect(code).toContain('pyreonDateISO(System.currentTimeMillis().toDouble())')
  })
  it.skipIf(!isSwiftcAvailable())('swift: the emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(app, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlin: the emit compiles', () => {
    const r = validateKotlin(transform(app, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})

describe('what cannot lower is named', () => {
  const unlowered = `import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const d = new Date(0)
  const a = Date.prototype.toISOString.call(d)
  const o = { k: 1 }
  const has = Object.prototype.hasOwnProperty.call(o, 'k')
  const reset = () => { d.setTime(5); d.setUTCHours(1) }
  return (<Stack><Text>{a}</Text><Text>{String(has)}</Text><Button onPress={reset}>r</Button></Stack>)
}
`
  for (const target of both) {
    it(`${target}: Date.prototype / Object.prototype and the Date setters`, () => {
      const { warnings } = transform(unlowered, { target })
      const all = warnings.join('\n')
      expect(all).toContain('Date.prototype has no native counterpart')
      expect(all).toContain('Object.prototype has no native counterpart')
      expect(all).toContain('.setTime(…) is a JavaScript method with no')
      expect(all).toContain('.setUTCHours(…) is a JavaScript method with no')
    })
  }
  it('a .prototype only inside a string is not named', () => {
    const src = `import { Text } from '@pyreon/primitives'
export function App() {
  return <Text>{'Date.prototype is web-only'}</Text>
}
`
    for (const target of both) expect(transform(src, { target }).warnings.join('\n')).not.toContain('.prototype has no native counterpart')
  })
})
