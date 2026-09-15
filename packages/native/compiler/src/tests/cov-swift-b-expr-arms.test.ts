// Branch-coverage matrices for the Swift EXPRESSION emit arms that the
// existing suites reach only incidentally: truthiness negation by inferred
// type, string `.length`, bitwise parenthesisation, `++`/`--`, the optional-
// call form, the map-typed object literal, and the `useForm` accessor rewrite.
//
// The truthiness family is the sharp one: JS `!x` is a TRUTHINESS test and
// Swift has none, so every inferred-type arm emits a DIFFERENT comparison.
// Getting the arm wrong is a silent wrong answer, not a compile error, which
// is why each type is asserted against its own spelling here.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

function sw(decls: string, ret = '<Text>x</Text>'): string {
  return transform(
    `import { Stack, Text } from '@pyreon/primitives'
import { computed, signal } from '@pyreon/reactivity'
export function App() {
  const n = signal<number>(1)
  const s = signal<string>('')
  const b = signal<boolean>(false)
  const opt = signal<string | undefined>(undefined)
  const nums = signal<number[]>([])
${decls}
  return (<Stack>${ret}</Stack>)
}`,
    { target: 'swift' },
  ).code
}

describe('unary `!` — one arm per inferred operand type', () => {
  it('NUMBER: !x → (x == 0); !!x → (x != 0)', () => {
    const out = sw(`  const a = computed(() => !n())
  const c = computed(() => !!n())`)
    expect(out).toContain('(n == 0)')
    expect(out).toContain('(n != 0)')
  })

  it('STRING: !x → isEmpty; !!x → !isEmpty', () => {
    const out = sw(`  const a = computed(() => !s())
  const c = computed(() => !!s())`)
    expect(out).toContain('(s).isEmpty')
    expect(out).toContain('!(s).isEmpty')
  })

  it('BOOLEAN: !x stays `!x`; !!x collapses to the bare read', () => {
    const out = sw(`  const a = computed(() => !b())
  const c = computed(() => !!b())`)
    expect(out).toContain('!b')
    expect(out).toMatch(/private var c: Bool \{ b \}/)
  })

  it('OPTIONAL: !x → (x == nil); !!x → (x != nil)', () => {
    const out = sw(`  const a = computed(() => !opt())
  const c = computed(() => !!opt())`)
    expect(out).toContain('(opt == nil)')
    expect(out).toContain('(opt != nil)')
  })

  it('a NON-`!` unary is emitted verbatim', () => {
    expect(sw(`  const a = computed(() => -n())`)).toContain('-n')
  })
})

describe('`.length` — the receiver-type split (UTF-16 parity)', () => {
  it('a STRING receiver reads utf16.count; an ARRAY receiver keeps .count', () => {
    const out = sw(`  const a = computed(() => s().length)
  const c = computed(() => nums().length)`)
    expect(out).toContain('s.utf16.count')
    expect(out).toContain('nums.count')
    expect(out).not.toContain('nums.utf16')
  })

  it('an OPTIONAL string receiver unwraps the union before deciding', () => {
    expect(sw(`  const a = computed(() => (opt() ?? '').length)`)).toContain('utf16.count')
  })
})

describe('binary — bitwise parenthesisation vs plain arithmetic', () => {
  it('a COMPOUND bitwise operand is parenthesised (Swift precedence differs from JS)', () => {
    const out = sw(`  const a = computed(() => n() & (n() + 1))
  const c = computed(() => n() | (n() + 1))
  const d = computed(() => n() ^ (n() + 1))
  const e2 = computed(() => n() << (n() + 1))
  const f = computed(() => n() >> (n() + 1))`)
    for (const op of ['&', '|', '^', '<<', '>>']) {
      expect(out, op).toContain(`n ${op} (n + 1)`)
    }
  })

  it('SIMPLE bitwise operands take no extra parens', () => {
    expect(sw(`  const a = computed(() => n() & 3)`)).toContain('n & 3')
  })

  it('plain `+` is emitted without the bitwise parenthesisation', () => {
    expect(sw(`  const a = computed(() => n() + n())`)).toContain('n + n')
  })
})

describe('update expressions — ++ and --', () => {
  it('`x++` and `x--` each emit their own step inside the value-returning IIFE', () => {
    const out = sw(`  const go = () => { let i = 0; const a = i++; const c = i--; }`, '<Text>y</Text>')
    expect(out).toContain('+= 1')
    expect(out).toContain('-= 1')
  })
})

describe('template literals — quasi escaping and interpolation', () => {
  it('quasis and expressions alternate into one interpolated Swift string', () => {
    expect(sw('  const a = computed(() => `a${n()}b${s()}c`)')).toContain('"a\\(n)b\\(s)c"')
  })

  it('a template with NO expressions is a plain literal', () => {
    expect(sw('  const a = computed(() => `plain`)')).toContain('"plain"')
  })
})

describe('optional call — `f?.()` and `obj.f?.()`', () => {
  it('an optional call on a bare identifier uses Swift optional-call syntax', () => {
    const out = transform(
      `import { Stack, Text } from '@pyreon/primitives'
export function App(props: { onDone?: () => void }) {
  const go = () => { props.onDone?.() }
  return (<Stack><Text onPress={go}>x</Text></Stack>)
}`,
      { target: 'swift' },
    ).code
    expect(out).toContain('?(')
  })

  it('a NON-optional call has no `?`', () => {
    const out = transform(
      `import { Stack, Text } from '@pyreon/primitives'
export function App(props: { onDone: () => void }) {
  const go = () => { props.onDone() }
  return (<Stack><Text onPress={go}>x</Text></Stack>)
}`,
      { target: 'swift' },
    ).code
    expect(out).toContain('onDone()')
    expect(out).not.toContain('onDone?(')
  })
})

describe('object literals under a MAP expectation', () => {
  it('an EMPTY literal under a Record<> annotation is the empty dictionary', () => {
    const out = sw(`  const m: Record<string, number> = {}`)
    expect(out).toContain('[:]')
  })

  it('a POPULATED literal under a Record<> annotation is a dictionary, not a struct', () => {
    const out = sw(`  const m: Record<string, number> = { a: 1, b: 2 }`)
    expect(out).toContain('["a": 1, "b": 2]')
  })
})

describe('useForm accessor rewrite — values / errors / touched', () => {
  const form = (expr: string) =>
    transform(
      `import { Stack, Text } from '@pyreon/primitives'
import { useForm } from '@pyreon/form'
export function App() {
  const form = useForm({ initialValues: { name: '' } })
  return (<Stack><Text>{${expr}}</Text></Stack>)
}`,
      { target: 'swift' },
    ).code

  it('values / errors default to "" and touched defaults to false', () => {
    expect(form('form.values().name')).toContain('(form.values["name"] ?? "")')
    expect(form('form.errors().name')).toContain('(form.errors["name"] ?? "")')
    expect(form('form.touched().name')).toContain('(form.touched["name"] ?? false)')
  })

  it('a DIFFERENT form property is not rewritten', () => {
    expect(form('form.isValid')).not.toContain('?? ""')
  })
})
