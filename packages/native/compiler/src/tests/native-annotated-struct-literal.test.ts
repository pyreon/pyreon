// `const e: Struct = { … }` — the annotation names the struct, and it must
// win over the literal's field set. Two shipped shapes said otherwise, found
// when the crossing chart engine grew `chrome.ts`: a literal that OMITTED an
// optional field matched no struct and emitted a TUPLE (`(label: c.name,
// color: c.color)` into a `[LegendEntry]` — uncompilable), and a literal whose
// fields also spelled another struct picked THAT one (`{ label, value, color }`
// annotated `TooltipRow` emitted `Slice(...)`). A declared return type already
// steered `return { … }`; a declared local type now steers the same way.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `import { Text } from '@pyreon/primitives'
interface Slice { value: number; label: string; color: string }
interface TooltipRow { label: string; value: number; color: string }
interface LegendEntry { label: string; color: string; muted?: boolean }
export function C() {
  const row: TooltipRow = { label: 'a', value: 1.5, color: '#000000' }
  const e: LegendEntry = { label: 'a', color: '#000000' }
  const s: Slice = { value: 2.5, label: 'b', color: '#111111' }
  return <Text>{row.label + e.label + s.label}</Text>
}`

describe('an annotated local steers its object literal to the named struct', () => {
  it('Swift: the annotated struct wins over a same-shaped sibling, and an omitted optional field is no tuple', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('let row = TooltipRow(label: "a", value: 1.5, color: "#000000")')
    expect(r.code).toContain('let e = LegendEntry(label: "a", color: "#000000")')
    expect(r.code).toContain('let s = Slice(value: 2.5, label: "b", color: "#111111")')
    expect(r.code).not.toContain('= (label: "a", color: "#000000")')
  })
  it('Kotlin: the same three declarations construct their annotated data classes', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val row = TooltipRow(label = "a", value = 1.5, color = "#000000")')
    expect(r.code).toContain('val e = LegendEntry(label = "a", color = "#000000")')
    expect(r.code).toContain('val s = Slice(value = 2.5, label = "b", color = "#111111")')
  })
})
