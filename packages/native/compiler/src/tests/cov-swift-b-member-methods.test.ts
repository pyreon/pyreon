// Branch-coverage matrices for the Swift member-call lowering table
// (`emit-swift.ts`, the `switch (prop)` inside the `e.callee.kind === 'member'`
// arm). Each spec pairs the shape that TAKES an arm with the neighbouring
// shape that must NOT — the wrong arity, the wrong receiver type, or the
// negative-argument form that deliberately falls through to the generic
// verbatim re-emit.
//
// The arity guards are the load-bearing half: nearly every entry is
// `if (e.args.length === N)` followed by `break`, and a `break` lands on the
// generic re-emit, which is what produced the historical SILENT invalid-Swift
// class these mappings exist to close. So the "wrong arity" assertion is
// always "the mapped Swift member is ABSENT and the verbatim JS name survives".

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

/** A component whose computeds are emitted as Swift expressions. */
function sw(decls: string): string {
  return transform(
    `import { Stack, Text } from '@pyreon/primitives'
import { computed, signal } from '@pyreon/reactivity'
export function App() {
  const nums = signal<number[]>([3, 1, 2])
  const strs = signal<string[]>(['a', 'b'])
  const s = signal<string>('hello')
  const n = signal<number>(7)
${decls}
  return (<Stack><Text>x</Text></Stack>)
}`,
    { target: 'swift' },
  ).code
}

function warnings(decls: string): string[] {
  return transform(
    `import { Stack, Text } from '@pyreon/primitives'
import { computed, signal } from '@pyreon/reactivity'
export function App() {
  const nums = signal<number[]>([3, 1, 2])
  const strs = signal<string[]>(['a', 'b'])
  const s = signal<string>('hello')
  const n = signal<number>(7)
${decls}
  return (<Stack><Text>x</Text></Stack>)
}`,
    { target: 'swift' },
  ).warnings
}

describe('Swift member-call lowering — arity and receiver-type guards', () => {
  it('toString(): number receiver → String(x); a STRING receiver keeps the verbatim call', () => {
    const out = sw(`  const a = computed(() => n().toString())
  const b = computed(() => s().toString())`)
    expect(out).toContain('String(n)')
    // The string receiver never reaches the `tsT.kind === 'number'` arm, so
    // the generic re-emit survives.
    expect(out).toContain('s.toString()')
  })

  it('toString(arg) is NOT lowered — the 0-arg guard rejects it', () => {
    // `Number.prototype.toString(radix)` has no Swift analogue; the arity
    // guard is what keeps the wrong lowering (`String(n)`, dropping the
    // radix) from shipping.
    const out = sw(`  const a = computed(() => n().toString(16))`)
    expect(out).toContain('n.toString(16)')
    expect(out).not.toContain('String(n)')
  })

  it('trim(): 0-arg → trimmingCharacters; an argument falls through', () => {
    expect(sw(`  const a = computed(() => s().trim())`)).toContain(
      's.trimmingCharacters(in: .whitespacesAndNewlines)',
    )
    const withArg = sw(`  const a = computed(() => s().trim(1))`)
    expect(withArg).not.toContain('trimmingCharacters')
    expect(withArg).toContain('s.trim(1)')
  })

  it('some/every/filter/find/findLast/includes: the 1-arg predicate arms', () => {
    const out = sw(`  const a = computed(() => nums().some((x) => x > 1))
  const b = computed(() => nums().every((x) => x > 1))
  const c = computed(() => nums().filter((x) => x > 1))
  const d = computed(() => nums().find((x) => x > 1))
  const e2 = computed(() => nums().findLast((x) => x > 1))
  const f = computed(() => nums().includes(3))`)
    expect(out).toContain('nums.contains(where:')
    expect(out).toContain('nums.allSatisfy(')
    expect(out).toContain('nums.filter(')
    expect(out).toContain('nums.first(where:')
    expect(out).toContain('nums.last(where:')
    expect(out).toContain('nums.contains(3)')
  })

  it('push: 1 arg → append; >1 → append(contentsOf:)', () => {
    const out = sw(`  const a = computed(() => { const out: number[] = []; out.push(1); out.push(2, 3); return out })`)
    expect(out).toContain('append(1)')
    expect(out).toContain('append(contentsOf: [2, 3])')
  })

  it('lastIndexOf: array → lastIndex(of:) ?? -1; a STRING receiver warns NAMED', () => {
    const arr = sw(`  const a = computed(() => nums().lastIndexOf(2))`)
    expect(arr).toContain('(nums.lastIndex(of: 2) ?? -1)')

    const w = warnings(`  const a = computed(() => s().lastIndexOf('l'))`)
    expect(w.some((x) => x.includes('.lastIndexOf on a non-array receiver'))).toBe(true)
  })

  it('indexOf: string receiver → range(of:)+distance; array → firstIndex(of:) ?? -1', () => {
    const out = sw(`  const a = computed(() => s().indexOf('l'))
  const b = computed(() => nums().indexOf(2))`)
    expect(out).toContain('s.range(of: "l")')
    expect(out).toContain('distance(from: s.startIndex')
    expect(out).toContain('(nums.firstIndex(of: 2) ?? -1)')
  })

  it('charAt / charCodeAt: the 1-arg arms; 0-arg falls through', () => {
    const out = sw(`  const a = computed(() => s().charAt(0))
  const b = computed(() => s().charCodeAt(0))`)
    expect(out).toContain('String(Array(s)[0])')
    expect(out).toContain('Double(Array(s.utf16)[Int(0)])')

    const bare = sw(`  const a = computed(() => s().charAt())`)
    expect(bare).toContain('s.charAt()')
    expect(bare).not.toContain('String(Array(s)')
  })

  it('startsWith / endsWith → hasPrefix / hasSuffix; 2-arg falls through', () => {
    const out = sw(`  const a = computed(() => s().startsWith('he'))
  const b = computed(() => s().endsWith('lo'))`)
    expect(out).toContain('s.hasPrefix("he")')
    expect(out).toContain('s.hasSuffix("lo")')

    const two = sw(`  const a = computed(() => s().startsWith('he', 1))`)
    expect(two).not.toContain('hasPrefix')
    expect(two).toContain('s.startsWith("he", 1)')
  })

  it('join: a non-String element array maps through String.init first', () => {
    const out = sw(`  const a = computed(() => nums().join('-'))
  const b = computed(() => strs().join('-'))`)
    expect(out).toContain('nums.map { String($0) }.joined(separator: "-")')
    // A [String] receiver joins directly — no per-element String.init.
    expect(out).toContain('strs.joined(separator: "-")')
    expect(out).not.toContain('strs.map { String($0) }')
  })

  it('join with TWO args is not lowered (the `<= 1` guard)', () => {
    const out = sw(`  const a = computed(() => strs().join('-', 'x'))`)
    expect(out).not.toContain('joined(separator:')
    expect(out).toContain('strs.join("-", "x")')
  })

  it('split: the 1-arg arm; 0-arg falls through', () => {
    expect(sw(`  const a = computed(() => s().split(','))`)).toContain(
      's.components(separatedBy: ",")',
    )
    const bare = sw(`  const a = computed(() => s().split())`)
    expect(bare).not.toContain('components(separatedBy:')
    expect(bare).toContain('s.split()')
  })

  it('substring: 1-arg → dropFirst; 2-arg → dropFirst+prefix; a NEGATIVE arg falls through', () => {
    const one = sw(`  const a = computed(() => s().substring(1))`)
    expect(one).toContain('String(s.dropFirst(1))')

    const two = sw(`  const a = computed(() => s().substring(1, 3))`)
    expect(two).toContain('String(s.dropFirst(1).prefix(max(0, (3) - (1))))')

    // A unary-minus argument is the `noNegative` false arm: JS's
    // substring clamps negatives to 0, which the dropFirst lowering does
    // not model, so it must NOT lower.
    const neg = sw(`  const a = computed(() => s().substring(-1))`)
    expect(neg).not.toContain('dropFirst')
    expect(neg).toContain('s.substring(')
  })

  it('padStart / padEnd: omitted pad → " "; a 1-char literal pad; a MULTI-char pad falls through', () => {
    const dflt = sw(`  const a = computed(() => s().padStart(8))`)
    expect(dflt).toContain('String(repeating: " ", count: max(0, (8) - s.count))')
    expect(dflt).toMatch(/\(String\(repeating: " ".*\) \+ s\)/)

    const end = sw(`  const a = computed(() => s().padEnd(8, '0'))`)
    expect(end).toMatch(/\(s \+ String\(repeating: "0"/)

    // Multi-char pad: JS truncates the pad to fit, Swift's
    // String(repeating:count:) repeats the WHOLE string — so it must not lower.
    const multi = sw(`  const a = computed(() => s().padStart(8, 'ab'))`)
    expect(multi).not.toContain('String(repeating:')
    expect(multi).toContain('s.padStart(8, "ab")')
  })

  it('padStart with ZERO args falls through (the `>= 1` guard)', () => {
    const out = sw(`  const a = computed(() => s().padStart())`)
    expect(out).not.toContain('String(repeating:')
    expect(out).toContain('s.padStart()')
  })

  it('repeat / concat: the 1-arg arms; other arities fall through', () => {
    const out = sw(`  const a = computed(() => s().repeat(3))
  const b = computed(() => nums().concat(nums()))`)
    expect(out).toContain('String(repeating: s, count: 3)')
    expect(out).toContain('(nums + nums)')

    const bad = sw(`  const a = computed(() => s().repeat())
  const b = computed(() => nums().concat())`)
    expect(bad).toContain('s.`repeat`()')
    expect(bad).toContain('nums.concat()')
  })

  it('at: on an ARRAY resolves the index; on a STRING it warns NAMED and does not lower', () => {
    const arr = sw(`  const a = computed(() => nums().at(-1))`)
    expect(arr).toContain('indices.contains(')

    const w = warnings(`  const a = computed(() => s().at(0))`)
    expect(w.some((x) => x.includes('String.at has no Swift lowering'))).toBe(true)
    expect(sw(`  const a = computed(() => s().at(0))`)).not.toContain('indices.contains(')
  })

  it('at with 0 args falls through', () => {
    const out = sw(`  const a = computed(() => nums().at())`)
    expect(out).toContain('nums.at()')
    expect(out).not.toContain('indices.contains(')
  })

  it('slice: 0/1/2-arg forward forms on both a string and an array receiver', () => {
    const out = sw(`  const a = computed(() => strs().slice())
  const b = computed(() => strs().slice(1))
  const c = computed(() => strs().slice(1, 2))
  const d = computed(() => s().slice(1, 3))`)
    expect(out).toContain('Array(strs)')
    expect(out).toContain('Array(strs.dropFirst(1))')
    expect(out).toContain('Array(strs.dropFirst(1).prefix(max(0, (2) - (1))))')
    expect(out).toContain('String(s.dropFirst(1).prefix(max(0, (3) - (1))))')
  })

  it('slice on a NUMBER receiver has no wrap and falls through (the `wrap === null` arm)', () => {
    const out = sw(`  const a = computed(() => n().slice(1))`)
    expect(out).toContain('n.slice(1)')
    expect(out).not.toContain('dropFirst')
  })

  it('findIndex: the 1-arg arm wraps `?? -1` to keep the JS sentinel', () => {
    const out = sw(`  const a = computed(() => nums().findIndex((x) => x > 1))`)
    expect(out).toContain('(nums.firstIndex(where:')
    expect(out).toContain('?? -1)')
  })

  it('replaceAll: the 2-arg arm; other arities fall through', () => {
    expect(sw(`  const a = computed(() => s().replaceAll('a', 'b'))`)).toContain(
      's.replacingOccurrences(of: "a", with: "b")',
    )
    const one = sw(`  const a = computed(() => s().replaceAll('a'))`)
    expect(one).not.toContain('replacingOccurrences')
    expect(one).toContain('s.replaceAll("a")')
  })

  it('flat / reverse: the 0-arg arms; an argument falls through', () => {
    const out = sw(`  const a = computed(() => nums().reverse())`)
    expect(out).toContain('Array(nums.reversed())')

    const withArg = sw(`  const a = computed(() => nums().reverse(1))`)
    expect(withArg).toContain('nums.reverse(1)')
    expect(withArg).not.toContain('reversed()')
  })

  it('toFixed: a LITERAL digit count lowers; a DYNAMIC one falls through', () => {
    const lit = sw(`  const a = computed(() => n().toFixed(2))`)
    expect(lit).toContain('String(format: "%.2f", n)')

    const zero = sw(`  const a = computed(() => n().toFixed())`)
    expect(zero).toContain('String(format: "%.0f", n)')

    // A non-literal digit count is the `digits === null` arm.
    const dyn = sw(`  const a = computed(() => n().toFixed(n()))`)
    expect(dyn).not.toContain('String(format:')
    expect(dyn).toContain('n.toFixed(n)')
  })

  it('toUpperCase / toLowerCase: the 0-arg arms; an argument falls through', () => {
    const out = sw(`  const a = computed(() => s().toUpperCase())
  const b = computed(() => s().toLowerCase())`)
    expect(out).toContain('s.uppercased()')
    expect(out).toContain('s.lowercased()')

    const withArg = sw(`  const a = computed(() => s().toUpperCase('x'))`)
    expect(withArg).toContain('s.toUpperCase("x")')
    expect(withArg).not.toContain('uppercased()')
  })

  it('sort with NO comparator warns `no-comparator`; a non-arrow comparator warns `shape`', () => {
    const none = warnings(`  const a = computed(() => nums().sort())`)
    expect(none.some((x) => x.toLowerCase().includes('sort'))).toBe(true)

    const shape = warnings(`  const cmp = (x: number, y: number) => x - y
  const a = computed(() => nums().sort(cmp))`)
    expect(shape.some((x) => x.toLowerCase().includes('sort'))).toBe(true)
  })

  it('toLocaleString(): degrades to String(x) with a NAMED warning; an argument falls through', () => {
    const out = sw(`  const a = computed(() => n().toLocaleString())`)
    expect(out).toContain('String(n)')
    expect(
      warnings(`  const a = computed(() => n().toLocaleString())`).some((x) =>
        x.includes('.toLocaleString() has no native locale-formatting equivalent'),
      ),
    ).toBe(true)

    const withArg = sw(`  const a = computed(() => n().toLocaleString('en'))`)
    expect(withArg).toContain('n.toLocaleString("en")')
  })
})

describe('Swift member-call lowering — Map / Set receiver vocabulary', () => {
  const MAPSRC = (body: string) =>
    `import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const m = new Map<string, number>()
  const st = new Set<string>()
  const go = () => {
${body}
  }
  return (<Stack><Text onPress={go}>x</Text></Stack>)
}`

  // The receiver is inlined (`[String: Int]()`), so the assertions match on
  // the METHOD each arm rewrites to, which is what the arm decides.
  it('Map: set/get/has/delete/clear each take their own arm', () => {
    const out = transform(
      MAPSRC(`    m.set('a', 1)
    const g = m.get('a')
    const h = m.has('a')
    m.delete('a')
    m.clear()`),
      { target: 'swift' },
    ).code
    expect(out).toContain('["a"] = 1')
    expect(out).toContain('let g = ([String: Int]())["a"]')
    expect(out).toContain('!= nil)')
    expect(out).toContain('.removeValue(forKey: "a")')
    expect(out).toContain('.removeAll()')
  })

  it('Set: add/has/delete/clear each take their own arm', () => {
    const out = transform(
      MAPSRC(`    st.add('a')
    const h = st.has('a')
    st.delete('a')
    st.clear()`),
      { target: 'swift' },
    ).code
    expect(out).toContain('.insert("a")')
    expect(out).toContain('.contains("a")')
    expect(out).toContain('.remove("a")')
    expect(out).toContain('.removeAll()')
  })

  it('a WRONG-arity Map/Set call skips the vocabulary and falls through', () => {
    const out = transform(
      MAPSRC(`    const h = m.has()
    st.add()
    st.clear(1)`),
      { target: 'swift' },
    ).code
    // `has()` with no key never reaches the `!= nil` subscript form.
    expect(out).toContain('.has()')
    expect(out).toContain('.add()')
    expect(out).toContain('.clear(1)')
    expect(out).not.toContain('.insert()')
    expect(out).not.toContain('.removeAll()')
  })
})
