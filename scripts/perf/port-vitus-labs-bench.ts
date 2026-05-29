/**
 * Paired before/after micro-benchmarks for the vitus-labs ui-system perf
 * port. Each bench has TWO implementations — `before` mirrors the
 * pre-port code, `after` mirrors the ported code — and runs both N times
 * to produce a median + min + delta.
 *
 * Honest framing: micro-benchmarks measure isolated hot paths under tight
 * loops; they DO NOT measure real-app aggregate impact (page mount, SSR
 * stream throughput) — for that, see the e2e benchmark in
 * `examples/benchmark/`. The micro deltas here exist to PROVE each port
 * is structurally faster on its own merits, not to claim a real-app
 * headline number.
 *
 * Reproduce: `bun scripts/perf/port-vitus-labs-bench.ts`
 *
 * Methodology:
 *   - 3 warmup runs (discarded) per implementation
 *   - 7 timed runs per implementation
 *   - report median of timed runs
 *   - delta = ((before_median - after_median) / before_median) * 100
 *     (positive % = after is faster)
 *   - JIT noise floor ~±2%; treat anything in that band as "no change"
 *
 * Both implementations operate on the SAME inputs in the SAME process,
 * so JIT warmup state is equivalent before each timed run.
 */

const WARMUP = 3
const RUNS = 7

type Bench = {
  name: string
  iterations: number
  setup?: () => unknown
  before: (state: unknown) => void
  after: (state: unknown) => void
  upstream?: string
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)] as number
}
const min = (xs: number[]): number => xs.reduce((a, b) => (a < b ? a : b), Infinity)

const runBench = (
  name: string,
  iterations: number,
  fn: (state: unknown) => void,
  state: unknown,
) => {
  for (let w = 0; w < WARMUP; w++) {
    for (let i = 0; i < iterations; i++) fn(state)
  }
  const samples: number[] = []
  for (let r = 0; r < RUNS; r++) {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) fn(state)
    samples.push(performance.now() - start)
  }
  return { name, median: median(samples), min: min(samples) }
}

// ============================================================================
// styler — HTML_PROPS Set vs null-prototype object lookup
// ============================================================================
const HTML_PROPS_LIST = [
  'children',
  'className',
  'class',
  'style',
  'id',
  'role',
  'tabIndex',
  'onClick',
  'onMouseEnter',
  'onFocus',
  'onBlur',
  'onInput',
  'onChange',
  'value',
  'type',
  'name',
  'href',
  'src',
  'alt',
  'title',
  'disabled',
  'readOnly',
  'placeholder',
  'autoFocus',
  'autoComplete',
  'maxLength',
  'minLength',
  'min',
  'max',
  'step',
  'pattern',
  'required',
  'multiple',
  'accept',
  'action',
  'method',
  'target',
  'rel',
  'download',
  'hidden',
] as const

const HTML_PROPS_SET = new Set<string>(HTML_PROPS_LIST)
const HTML_PROPS_OBJ: Record<string, true> = Object.create(null)
for (const k of HTML_PROPS_LIST) HTML_PROPS_OBJ[k] = true

// 5-key mix: 4 hits + 1 miss (realistic buildProps shape)
const LOOKUP_MIX = ['onClick', 'className', 'value', '$rocketstyle', 'href']

// ============================================================================
// styler — splitAtRules charCodeAt
// ============================================================================
const splitRulesBefore = (text: string): string[] => {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        out.push(text.slice(start, i + 1))
        start = i + 1
      }
    }
  }
  return out
}

const splitRulesAfter = (text: string): string[] => {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c === 123 /* { */) depth++
    else if (c === 125 /* } */) {
      depth--
      if (depth === 0) {
        out.push(text.slice(start, i + 1))
        start = i + 1
      }
    }
  }
  return out
}

// ============================================================================
// unistyle — shouldNormalize: Object.values.some vs for-in
// ============================================================================
const shouldNormalizeBefore = (props: Record<string, any>) =>
  Object.values(props).some((item) => typeof item === 'object' || Array.isArray(item))

const shouldNormalizeAfter = (props: Record<string, any>) => {
  for (const key in props) {
    const item = props[key]
    if (typeof item === 'object' || Array.isArray(item)) return true
  }
  return false
}

// ============================================================================
// unistyle — createMediaQueries: reduce vs for-in
// ============================================================================
const fakeCss = (..._args: any[]) => 'css'

const createMediaQueriesBefore = (breakpoints: Record<string, number>, rootSize: number) =>
  Object.keys(breakpoints).reduce<Record<string, any>>((acc, key) => {
    const breakpointValue = breakpoints[key]!
    if (breakpointValue === 0) {
      acc[key] = (...args: any[]) => fakeCss(...args)
    } else if (breakpointValue != null) {
      const emSize = breakpointValue / rootSize
      acc[key] = (...args: any[]) => fakeCss(emSize, ...args)
    }
    return acc
  }, {})

const createMediaQueriesAfter = (breakpoints: Record<string, number>, rootSize: number) => {
  const acc: Record<string, any> = {}
  for (const key in breakpoints) {
    const breakpointValue = breakpoints[key]!
    if (breakpointValue === 0) {
      acc[key] = (...args: any[]) => fakeCss(...args)
    } else if (breakpointValue != null) {
      const emSize = breakpointValue / rootSize
      acc[key] = (...args: any[]) => fakeCss(emSize, ...args)
    }
  }
  return acc
}

// ============================================================================
// unistyle — shallowEqual: Object.keys vs for-in counting
// ============================================================================
const shallowEqualBefore = (
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean => {
  if (a === b) return true
  if (!a || !b) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const key of keysA) {
    if (a[key] !== b[key]) return false
  }
  return true
}

const shallowEqualAfter = (
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean => {
  if (a === b) return true
  if (!a || !b) return false
  let aCount = 0
  for (const key in a) {
    aCount++
    if (a[key] !== b[key]) return false
  }
  let bCount = 0
  for (const _ in b) bCount++
  return aCount === bCount
}

// ============================================================================
// unistyle — alignContent isReverted: array.includes vs ===
// ============================================================================
const isRevertedBefore = (direction: string) => ['inline', 'reverseInline'].includes(direction)

const isRevertedAfter = (direction: string) =>
  direction === 'inline' || direction === 'reverseInline'

// ============================================================================
// rocketstyle — pickStyledAttrs: Object.keys.reduce vs for-in
// ============================================================================
const KEYWORDS: Record<string, true> = {
  state: true,
  size: true,
  variant: true,
  hover: true,
  active: true,
  focus: true,
  pressed: true,
  disabled: true,
  readOnly: true,
}

const pickStyledAttrsBefore = (props: Record<string, unknown>, keywords: Record<string, true>) =>
  Object.keys(props).reduce<Record<string, unknown>>((acc, key) => {
    if (keywords[key] && props[key]) acc[key] = props[key]
    return acc
  }, {})

const pickStyledAttrsAfter = (props: Record<string, unknown>, keywords: Record<string, true>) => {
  const result: Record<string, unknown> = {}
  for (const key in props) {
    if (keywords[key] && props[key]) result[key] = props[key]
  }
  return result
}

// ============================================================================
// attrs — removeUndefinedProps: reduce vs for-in
// ============================================================================
const removeUndefinedPropsBefore = (props: Record<string, unknown>) =>
  Object.keys(props).reduce<Record<string, unknown>>((acc, key) => {
    if (props[key] !== undefined) acc[key] = props[key]
    return acc
  }, {})

const removeUndefinedPropsAfter = (props: Record<string, unknown>) => {
  const result: Record<string, unknown> = {}
  for (const key in props) {
    const value = props[key]
    if (value !== undefined) result[key] = value
  }
  return result
}

// ============================================================================
// elements — Overlay CLICK_CLOSE_KINDS: includes vs Set.has
// ============================================================================
const CLICK_CLOSE_KINDS_SET: ReadonlySet<string> = new Set([
  'click',
  'clickOnTrigger',
  'clickOutsideContent',
])

const overlayCheckBefore = (openOn: string, closeOn: string) =>
  openOn === 'click' || ['click', 'clickOnTrigger', 'clickOutsideContent'].includes(closeOn)

const overlayCheckAfter = (openOn: string, closeOn: string) =>
  openOn === 'click' || CLICK_CLOSE_KINDS_SET.has(closeOn)

// ============================================================================
// styler — CSSResult._staticResolved cache (8 nested-static repeats)
// ============================================================================
class FakeStaticResult {
  _isDynamic: boolean | undefined = false
  _staticResolved: string | undefined = undefined
  resolveCount = 0
  constructor(readonly content: string) {}
}

const resolveBefore = (r: FakeStaticResult): string => {
  // Always re-walks: simulates the strings/values resolution that the
  // pre-port path paid every time.
  r.resolveCount++
  let acc = ''
  for (let i = 0; i < 50; i++) acc += r.content
  return acc
}

const resolveAfter = (r: FakeStaticResult): string => {
  if (r._isDynamic === false) {
    if (r._staticResolved === undefined) {
      r.resolveCount++
      let acc = ''
      for (let i = 0; i < 50; i++) acc += r.content
      r._staticResolved = acc
    }
    return r._staticResolved
  }
  r.resolveCount++
  let acc = ''
  for (let i = 0; i < 50; i++) acc += r.content
  return acc
}

// ============================================================================
// hooks — useBreakpoint buildSortedBpTuples: Object.entries.sort vs for-in.sort
// ============================================================================
const buildSortedBpTuplesBefore = (breakpoints: Record<string, number>) =>
  Object.entries(breakpoints).sort(([, a], [, b]) => a - b)

const buildSortedBpTuplesAfter = (breakpoints: Record<string, number>) => {
  const tuples: [string, number][] = []
  for (const name in breakpoints) {
    const value = breakpoints[name]
    if (typeof value === 'number') tuples.push([name, value])
  }
  return tuples.sort(([, a], [, b]) => a - b)
}

// ============================================================================
// Build the bench suite
// ============================================================================
const benches: Bench[] = [
  // NOTE: styler.hashUpdate 4-char unroll measured in Bun JIT noise band
  // (+1.6% short / +2.1% long, both within ±2%). Reverted to the simple
  // single-char loop — only ship optimizations that show measurably better
  // under Pyreon's runtime.
  {
    name: 'styler.HTML_PROPS lookup (5-key mix: 4 hits + 1 miss)',
    iterations: 500_000,
    setup: () => null,
    before: () => {
      let r = 0
      for (const k of LOOKUP_MIX) if (HTML_PROPS_SET.has(k)) r++
      return r
    },
    after: () => {
      let r = 0
      for (const k of LOOKUP_MIX) if (k in HTML_PROPS_OBJ) r++
      return r
    },
    upstream: 'styler be471b19: +19.0% (5-lookup mix)',
  },
  {
    name: 'styler.splitRules (10 rules, charCodeAt vs str[i])',
    iterations: 50_000,
    setup: () => {
      // 10 small rules
      const rule = '.a{color:red;}.b{font:12px;}.c{padding:5px;}.d{margin:10px;}'
      return rule + rule + rule.slice(0, 100)
    },
    before: (s) => {
      splitRulesBefore(s as string)
    },
    after: (s) => {
      splitRulesAfter(s as string)
    },
    upstream: 'styler c483cabc',
  },
  {
    name: 'styler.CSSResult._staticResolved (8 repeat resolves)',
    iterations: 20_000,
    setup: () => {
      // Fresh instance per iteration set; reset cache before each suite.
      return null
    },
    before: () => {
      const r = new FakeStaticResult('color:red;')
      for (let i = 0; i < 8; i++) resolveBefore(r)
    },
    after: () => {
      const r = new FakeStaticResult('color:red;')
      for (let i = 0; i < 8; i++) resolveAfter(r)
    },
    upstream: 'styler 754cd203: +149% (2.5× speedup)',
  },
  {
    name: 'unistyle.createMediaQueries (5-breakpoint theme)',
    iterations: 50_000,
    setup: () => ({ xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 }),
    before: (s) => {
      createMediaQueriesBefore(s as Record<string, number>, 16)
    },
    after: (s) => {
      createMediaQueriesAfter(s as Record<string, number>, 16)
    },
    upstream: 'unistyle e573e6c4: +15.9%',
  },
  {
    name: 'unistyle.shouldNormalize (5-key static — most-common miss case)',
    iterations: 500_000,
    setup: () => ({ color: 'red', fontSize: 14, padding: '5px', margin: '10px', display: 'flex' }),
    before: (s) => {
      shouldNormalizeBefore(s as Record<string, any>)
    },
    after: (s) => {
      shouldNormalizeAfter(s as Record<string, any>)
    },
    upstream: 'unistyle e573e6c4: +20.3%',
  },
  {
    name: 'unistyle.shallowEqual (5-key equal — common steady-state)',
    iterations: 500_000,
    setup: () => {
      const a = { color: 'red', font: 14, pad: 5, margin: 10, display: 'flex' }
      const b = { color: 'red', font: 14, pad: 5, margin: 10, display: 'flex' }
      return [a, b]
    },
    before: ([a, b]: any) => {
      shallowEqualBefore(a, b)
    },
    after: ([a, b]: any) => {
      shallowEqualAfter(a, b)
    },
    upstream: 'unistyle e573e6c4: +4.0%',
  },
  {
    name: 'unistyle.alignContent isReverted (mixed: inline + rows + reverseInline)',
    iterations: 1_000_000,
    setup: () => ['inline', 'rows', 'reverseInline', 'reverseRows'],
    before: (s) => {
      for (const d of s as string[]) isRevertedBefore(d)
    },
    after: (s) => {
      for (const d of s as string[]) isRevertedAfter(d)
    },
    upstream: 'unistyle e573e6c4: +0.3% (noise; allocation real but tiny)',
  },
  {
    name: 'rocketstyle.pickStyledAttrs (10-prop input, 4 keywords)',
    iterations: 200_000,
    setup: () => ({
      state: 'primary',
      size: 'medium',
      variant: 'rounded',
      hover: { bg: 'gray' },
      onClick: () => {},
      class: 'foo',
      id: 'bar',
      tabIndex: 0,
      href: '#',
      title: 'tip',
    }),
    before: (s) => {
      pickStyledAttrsBefore(s as Record<string, unknown>, KEYWORDS)
    },
    after: (s) => {
      pickStyledAttrsAfter(s as Record<string, unknown>, KEYWORDS)
    },
    upstream: 'rocketstyle 00fdadc2',
  },
  {
    name: 'attrs.removeUndefinedProps (10-prop input, 3 undefined)',
    iterations: 200_000,
    setup: () => ({
      a: 1,
      b: 'x',
      c: undefined,
      d: { nested: 1 },
      e: undefined,
      f: 0,
      g: false,
      h: undefined,
      i: 'y',
      j: null,
    }),
    before: (s) => {
      removeUndefinedPropsBefore(s as Record<string, unknown>)
    },
    after: (s) => {
      removeUndefinedPropsAfter(s as Record<string, unknown>)
    },
    upstream: 'attrs b003de47',
  },
  {
    name: 'elements.Overlay click-close check (mixed openOn/closeOn)',
    iterations: 1_000_000,
    setup: () => [
      ['click', 'click'],
      ['hover', 'clickOnTrigger'],
      ['manual', 'clickOutsideContent'],
      ['click', 'hover'],
    ],
    before: (s) => {
      for (const [o, c] of s as [string, string][]) overlayCheckBefore(o, c)
    },
    after: (s) => {
      for (const [o, c] of s as [string, string][]) overlayCheckAfter(o, c)
    },
    upstream: 'elements 804dd0e2',
  },
  // NOTE: elements.Iterator filterValidItems + detectKind fusion measured
  // -16.3% on a 20-item all-valid complex list — V8's .filter() is
  // hyper-optimized for arrays with primitive predicates; manual fusion
  // loses for small all-valid inputs. Reverted to the two-pass shape.
  {
    name: 'hooks.useBreakpoint buildSortedBpTuples (5-breakpoint input)',
    iterations: 500_000,
    setup: () => ({ xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 }),
    before: (s) => {
      buildSortedBpTuplesBefore(s as Record<string, number>)
    },
    after: (s) => {
      buildSortedBpTuplesAfter(s as Record<string, number>)
    },
    upstream: 'hooks 4549648a: +80.3%',
  },
]

// ============================================================================
// Run + report
// ============================================================================
const fmt = (n: number) => n.toFixed(2).padStart(7)
const fmtPct = (n: number) => {
  const s = n >= 0 ? `+${n.toFixed(1)}%` : `${n.toFixed(1)}%`
  return s.padStart(8)
}

console.log('')
console.log('vitus-labs ui-system perf port — paired before/after micro-benchmarks')
console.log(`Warmup: ${WARMUP} runs (discarded); timed: ${RUNS} runs; report: median (and min)`)
console.log(`Runtime: Bun ${Bun.version}`)
console.log('')
console.log(
  '─'.repeat(64),
  '\n',
  '  bench'.padEnd(56),
  'before',
  ' after',
  ' delta',
  '\n',
  '  '.padEnd(56),
  ' (ms)',
  '  (ms)',
  '',
)
console.log('─'.repeat(96))

for (const b of benches) {
  const stateBefore = b.setup ? b.setup() : null
  const stateAfter = b.setup ? b.setup() : null
  const before = runBench(b.name, b.iterations, b.before, stateBefore)
  const after = runBench(b.name, b.iterations, b.after, stateAfter)
  const delta = ((before.median - after.median) / before.median) * 100
  const minDelta = ((before.min - after.min) / before.min) * 100
  console.log(
    `  ${b.name.padEnd(56).slice(0, 56)} ${fmt(before.median)} ${fmt(after.median)} ${fmtPct(delta)}`,
  )
  console.log(
    `    min: before=${before.min.toFixed(2)}ms  after=${after.min.toFixed(2)}ms  Δ=${fmtPct(minDelta).trim()}  (${b.iterations.toLocaleString()} iters)`,
  )
  if (b.upstream) console.log(`    upstream: ${b.upstream}`)
  console.log('')
}

console.log('─'.repeat(96))
console.log('')
console.log('Honest framing:')
console.log('  • Micro-benches isolate ONE hot path under tight loops; real-app aggregate')
console.log('    deltas are smaller (these paths are 1-10% of mount-time, not 100%).')
console.log('  • Anything in ±2% is JIT noise — treat as no change.')
console.log('  • Upstream deltas were measured under vitest in a different Node/V8 build;')
console.log('    Bun + V8 may behave differently per-bench.')
console.log('')
