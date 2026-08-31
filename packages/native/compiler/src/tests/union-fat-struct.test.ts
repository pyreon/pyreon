// A discriminated union of object shapes lowers to a FAT STRUCT.
//
// The blocker this closes, measured on the chart engine: a draw-command list
// is `DrawCmd[]` where DrawCmd is a union of object shapes. Each variant
// literal used to fall back to a Swift TUPLE — and heterogeneous tuples
// cannot share an array, so the whole geometry pipeline was uncompilable on
// native for want of ONE type to put in `[DrawCmd]`.
//
// The fat struct is that type: the union of every branch's fields, required
// where universal and same-typed, optional elsewhere. The emitters needed no
// changes — optional struct fields already default (nil / null) precisely so
// a subset literal compiles, and the struct-selection subset rung already
// resolves such literals. Registering the struct IS the feature.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const DRAW_CMDS = `
  type Pt = { x: Double; y: Double }
  type DrawCmd =
    | { kind: 'line'; from: Pt; to: Pt; stroke: string; width: Double }
    | { kind: 'circle'; center: Pt; radius: Double; fill: string }

  function grid(w: Double): DrawCmd[] {
    const out: DrawCmd[] = []
    out.push({ kind: 'line', from: { x: 0.0, y: 0.0 }, to: { x: w, y: 0.0 }, stroke: 'grey', width: 1.0 })
    out.push({ kind: 'circle', center: { x: w, y: w }, radius: 3.0, fill: 'red' })
    return out
  }
  export function P() {
    return <Stack><Text>{String(grid(10.0).length)}</Text></Stack>
  }
`

const swift = transform(DRAW_CMDS, { target: 'swift' }).code
const kotlin = transform(DRAW_CMDS, { target: 'kotlin' }).code

describe('union of object shapes → fat struct', () => {
  it('declares ONE struct with the merged fields, optionals defaulted', () => {
    expect(swift).toContain('struct DrawCmd')
    // Universal + same-typed field: required.
    expect(swift).toMatch(/var kind: String\n/)
    // Branch-specific fields: optional with a nil default, so a literal
    // that omits them still satisfies the memberwise initializer.
    expect(swift).toContain('var from: Pt? = nil')
    expect(swift).toContain('var center: Pt? = nil')
    expect(swift).toContain('var fill: String? = nil')
  })

  it('resolves each variant literal to the fat struct — no tuples', () => {
    // The failure mode this replaces: `(kind: "line", from: Pt(...), ...)`
    // tuples, which cannot share an array.
    expect(swift).toContain('DrawCmd(kind: "line", from: Pt(x: 0.0, y: 0.0)')
    expect(swift).toContain('DrawCmd(kind: "circle", center: Pt(x: w, y: w)')
    // The tuple fallback emitted `out.append((kind: "line", ...)` — a bare
    // parenthesized tuple. Its signature is the double paren.
    expect(swift).not.toContain('append((kind:')
  })

  it('types the accumulator array by the struct name', () => {
    expect(swift).toContain('var out: [DrawCmd] = []')
  })

  it('emits the Kotlin twin — data class with null defaults, no maps', () => {
    expect(kotlin).toContain('data class DrawCmd(')
    expect(kotlin).toContain('var from: Pt? = null')
    expect(kotlin).toContain('DrawCmd(kind = "line", from = Pt(x = 0.0, y = 0.0)')
    expect(kotlin).toContain('DrawCmd(kind = "circle", center = Pt(x = w, y = w)')
  })

  it.runIf(isSwiftUIAvailable())('the emitted Swift type-checks', () => {
    const r = validateSwiftWithStubs(swift)
    expect(r.ok ? [] : [r.error]).toEqual([])
  })

  it.runIf(isKotlincAvailable())('the emitted Kotlin compiles', async () => {
    const r = await validateKotlin(kotlin)
    expect(r.ok ? [] : [r.error]).toEqual([])
  })
})

describe('the gate stays honest about what it cannot merge', () => {
  it('bails BY NAME when one field has different types across branches', () => {
    const r = transform(
      `
      type Mixed =
        | { kind: 'a'; value: string }
        | { kind: 'b'; value: Double }
      export function P() { return <Text>x</Text> }
      `,
      { target: 'swift' },
    )
    expect(r.warnings.some((w) => String(w).includes('"value" has DIFFERENT types'))).toBe(true)
    expect(r.code).not.toContain('struct Mixed')
  })

  it('leaves string-literal unions to the enum path', () => {
    const r = transform(
      `
      type Filter = 'all' | 'active'
      export function P() { return <Text>x</Text> }
      `,
      { target: 'swift' },
    )
    expect(r.code).not.toContain('struct Filter')
  })

  it('skips a mixed object-or-primitive union', () => {
    const r = transform(
      `
      type Odd = { kind: 'a' } | string
      export function P() { return <Text>x</Text> }
      `,
      { target: 'swift' },
    )
    expect(r.code).not.toContain('struct Odd')
  })

  it('a field optional in ONE branch and required in another stays optional', () => {
    const r = transform(
      `
      type Cmd =
        | { kind: 'a'; label?: string }
        | { kind: 'b'; label: string; size: Double }
      export function P() { return <Text>x</Text> }
      `,
      { target: 'swift' },
    )
    // label is present in both branches but optional in one — the merged
    // field must accept the omitting branch's literals.
    expect(r.code).toContain('var label: String? = nil')
    expect(r.code).toContain('var size: Double? = nil')
  })
})
