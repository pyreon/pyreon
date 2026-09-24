/**
 * Branch-coverage battery for the Plain Mode pre-pass (`transformPlain`).
 *
 * Each case pairs the source shape that TAKES an arm with the neighbour that
 * must NOT, and every case is ALSO compared byte-for-byte against the Rust
 * mirror (`native/src/plain.rs`) — byte-equality is the dialect's contract,
 * so a shape added here that diverges is a real finding, not a test bug.
 *
 * Companion to `plain.test.ts` (feature semantics) and
 * `plain-native-equivalence.test.ts` (corpus + fuzz equivalence).
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transformPlain } from '../plain'

const require2 = createRequire(import.meta.url)
type NativeWarning = { message: string; line: number; column: number; code: string }
let nativePlain:
  | ((
      code: string,
      filename: string,
      knownSignals: string[] | null,
    ) => { code: string; warnings: NativeWarning[] } | null)
  | null = null
try {
  const native = require2(join(__dirname, '..', '..', 'native', 'pyreon-compiler.node'))
  if (typeof native.transformPlain === 'function') nativePlain = native.transformPlain
} catch {
  // Native binary not built — the equivalence half skips, the JS half still runs.
}
const describeNative = nativePlain ? describe : describe.skip

const HEADER = `'use plain'\nimport { state, derived, effect } from '@pyreon/core/plain'\n`

interface Case {
  name: string
  code: string
  filename?: string
  knownSignals?: string[]
  /** Assertions over the JS output — the arm's OBSERVABLE consequence. */
  assert: (out: { code: string; warnings: Array<{ message: string }> }) => void
}

const run = (c: Case) => {
  const out = transformPlain(
    c.code,
    c.filename ?? 'cov.tsx',
    c.knownSignals ? { knownSignals: c.knownSignals } : {},
  )
  expect(out, `transformPlain returned null for "${c.name}"`).not.toBeNull()
  return out!
}

const CASES: Case[] = [
  // ── getLang: every extension arm ──────────────────────────────────────────
  {
    name: 'getLang — .pyreon activates the jsx parser',
    code: `${HEADER}let n = state(1)\nexport const App = () => <b>{n}</b>\n`,
    filename: 'view.pyreon',
    assert: ({ code }) => {
      expect(code).toContain('const n = signal(1)')
      expect(code).toContain('{n()}')
    },
  },
  {
    name: 'getLang — .js / .mjs / .cjs parse as plain JS',
    code: `'use plain'\nimport { state } from '@pyreon/core/plain'\nlet n = state(1)\nexport const read = () => n\n`,
    filename: 'store.mjs',
    assert: ({ code }) => {
      expect(code).toContain('const n = signal(1)')
      expect(code).toContain('=> n()')
    },
  },
  {
    name: 'getLang — .cjs',
    code: `'use plain'\nimport { state } from '@pyreon/core/plain'\nlet n = state(2)\nexport const read = () => n\n`,
    filename: 'store.cjs',
    assert: ({ code }) => expect(code).toContain('const n = signal(2)'),
  },
  {
    name: 'getLang — .js',
    code: `'use plain'\nimport { state } from '@pyreon/core/plain'\nlet n = state(3)\nexport const read = () => n\n`,
    filename: 'store.js',
    assert: ({ code }) => expect(code).toContain('const n = signal(3)'),
  },
  {
    name: 'getLang — .mts / .cts parse as ts',
    code: `'use plain'\nimport { state } from '@pyreon/core/plain'\nlet n = state<number>(4)\nexport const read = () => n\n`,
    filename: 'store.mts',
    assert: ({ code }) => expect(code).toContain('signal<number>(4)'),
  },
  {
    name: 'getLang — an UNKNOWN extension falls back to tsx',
    code: `${HEADER}let n = state(6)\nexport const App = () => <b>{n}</b>\n`,
    filename: 'view.unknownext',
    assert: ({ code }) => {
      expect(code).toContain('const n = signal(6)')
      expect(code).toContain('{n()}')
    },
  },
  {
    name: 'getLang — .cts',
    code: `'use plain'\nimport { state } from '@pyreon/core/plain'\nlet n = state<number>(5)\nexport const read = () => n\n`,
    filename: 'store.cts',
    assert: ({ code }) => expect(code).toContain('signal<number>(5)'),
  },

  // ── reactivity-import specifier shapes ────────────────────────────────────
  {
    name: 'reactivity import carrying an INLINE type specifier still merges',
    code: `'use plain'\nimport { state } from '@pyreon/core/plain'\nimport { type Signal, batch } from '@pyreon/reactivity'\nlet a = state(1)\nexport const f = (): Signal<number> => batch(() => { a = 2 })\n`,
    assert: ({ code }) => {
      // `type Signal` is NOT recorded as an available runtime name, so the
      // injected `signal` is appended to the SAME import statement.
      expect(code).toContain("import { type Signal, batch, signal } from '@pyreon/reactivity'")
    },
  },
  {
    name: 'a TYPE-ONLY reactivity import is not reused as the merge anchor',
    code: `'use plain'\nimport { state } from '@pyreon/core/plain'\nimport type { Signal } from '@pyreon/reactivity'\nlet a = state(1)\nexport const read = (): Signal<number> => a\n`,
    assert: ({ code }) => {
      expect(code).toContain("import type { Signal } from '@pyreon/reactivity'")
      expect(code).toContain("import { signal } from '@pyreon/reactivity'")
    },
  },

  // ── deep-state path recording: string computed key, private field ─────────
  {
    name: 'deep-state STRING computed key hoists; a private field is skipped',
    code:
      `${HEADER}let user = state({ name: 'a' })\nlet gate = state(false)\n` +
      `effect(() => { if (gate) log(user['name']) })\n` +
      `export class K { #x = 1; m() { effect(() => { log(this.#x) }) } }\n`,
    assert: ({ code }) => {
      expect(code).toContain(`user()['name'])`) // hoisted into the prologue
      // The private-field read is NOT a store path — nothing hoisted for it.
      expect(code).not.toContain('void (this.#x)')
    },
  },

  // ── anonymous default declarations ───────────────────────────────────────
  {
    name: 'anonymous `export default function` is walked (id-less)',
    code: `${HEADER}let a = state(1)\nexport default function () { return a + 1 }\n`,
    assert: ({ code }) => expect(code).toContain('return a() + 1'),
  },
  {
    name: 'anonymous `export default class` is walked (id-less)',
    code: `${HEADER}let a = state(1)\nexport default class { m() { return a } }\n`,
    assert: ({ code }) => expect(code).toContain('return a()'),
  },

  // ── array/object pattern holes + rest ────────────────────────────────────
  {
    name: 'array HOLES in declarations, params and array literals are skipped',
    code:
      `${HEADER}let a = state(1)\nconst [, b] = src\n` +
      `const f = ([, c]) => c\nconst arr = [, a]\nexport const read = () => [b, f, arr]\n`,
    assert: ({ code }) => {
      expect(code).toContain('const arr = [, a()]')
      // `c` is a shadowed param, never rewritten.
      expect(code).toContain('([, c]) => c')
    },
  },
  {
    name: 'a REST element in a non-component param pattern walks its defaults',
    code: `${HEADER}let a = state(1)\nconst g = ({ q = a, ...rest }) => [q, rest]\n`,
    assert: ({ code }) => expect(code).toContain('{ q = a(), ...rest }'),
  },

  // ── generic visitors: regex objects, array holes, nested functions ────────
  {
    name: 'declaresNameDeep sees a nested `class props` and picks __props',
    code:
      `${HEADER}export function Card({ label }) {\n  const r = /x/g\n  class props {}\n  return <b title={String(r)}>{label}</b>\n}\n`,
    assert: ({ code }) => {
      expect(code).toContain('export function Card(__props)')
      expect(code).toContain('{__props.label}')
    },
  },
  {
    name: 'containsJsxReturn skips nested function declarations and array holes',
    code: `${HEADER}let a = state(1)\nexport function plainHelper() {\n  function inner() { return <b/> }\n  const holes = [, 1]\n  return [inner, holes, a]\n}\n`,
    assert: ({ code }) => {
      // The OUTER function is not a component (its own JSX lives in a nested
      // function declaration), so no props rewrite happens; `a` still reads.
      expect(code).toContain('return [inner, holes, a()]')
    },
  },
  {
    name: 'statementContainsReturn walks arrows, regexes and array holes',
    code:
      `${HEADER}let gate = state(false)\nlet b = state(2)\n` +
      `effect(() => { if (gate) { const f = () => 1; const rr = /y/; const hl = [, 2]; log(f, rr, hl, b) } })\n`,
    assert: ({ code }) => expect(code).toContain('void (b())'),
  },
  {
    name: 'mentionsReactive walks arrays, regexes, non-props members and TS layers',
    code:
      `${HEADER}export function View(props) {\n` +
      `  if (cfg.flag && /z/.test(s) && helper([1])) return <p>a</p>\n` +
      `  return <b>b</b>\n}\n`,
    assert: ({ code }) => {
      // Nothing in the test is reactive → no tail wrap.
      expect(code).not.toContain('return () => {')
    },
  },
  {
    name: 'mentionsReactive skips a TS typeAnnotation key on the test',
    code:
      `${HEADER}export function View2(props) {\n` +
      `  if ((cfgv as number) > 1) return <p>a</p>\n  return <b>b</b>\n}\n`,
    assert: ({ code }) => expect(code).not.toContain('return () => {'),
  },

  // ── component param shapes ───────────────────────────────────────────────
  {
    name: 'a component whose first param is an ARRAY pattern is left alone',
    code: `${HEADER}export function Tuple([first, second]) { return <b>{first}{second}</b> }\n`,
    assert: ({ code }) => expect(code).toContain('export function Tuple([first, second])'),
  },

  // ── statement breadth ────────────────────────────────────────────────────
  {
    name: 'a bare `for (;;)` (no init/test/update) walks its body',
    code: `${HEADER}let a = state(1)\nexport function loopy() { for (;;) { log(a); break } }\n`,
    assert: ({ code }) => expect(code).toContain('log(a())'),
  },
  {
    name: 'for-of heads: pattern left, shadow left, derived left',
    code:
      `${HEADER}let a = state(0)\nconst d = derived(a + 1)\nlet plain = 0\n` +
      `export function heads() {\n  for ([plain] of list) { log(plain) }\n  for (plain of list) { log(plain) }\n  for (d of list) { log(d) }\n}\n`,
    assert: ({ warnings }) => {
      const msgs = warnings.map((w) => w.message)
      expect(msgs.some((m) => m.includes('`for (d of …)` writes plain state'))).toBe(true)
      // The pattern head and the plain shadow head produce NO warning.
      expect(msgs.filter((m) => m.includes('writes plain state per iteration'))).toHaveLength(1)
    },
  },
  {
    name: 'try/finally without a handler, and catch without a param',
    code:
      `${HEADER}let a = state(1)\nexport function t1() { try { log(a) } finally { log(a) } }\n` +
      `export function t2() { try { log(a) } catch { log(a) } }\n`,
    assert: ({ code }) => expect(code.match(/log\(a\(\)\)/g) ?? []).toHaveLength(4),
  },
  {
    name: '`export * from` falls through the statement switch untouched',
    code: `${HEADER}let a = state(1)\nexport * from './other'\nexport const read = () => a\n`,
    assert: ({ code }) => {
      expect(code).toContain("export * from './other'")
      expect(code).toContain('=> a()')
    },
  },

  // ── marker calls with no arguments ───────────────────────────────────────
  {
    name: 'argument-less state() / derived() / effect()',
    code: `${HEADER}let z = state()\nconst dz = derived()\neffect()\nexport const read = () => [z, dz]\n`,
    assert: ({ code, warnings }) => {
      expect(code).toContain('const z = signal()')
      expect(code).toContain('const dz = computed()')
      expect(warnings.some((w) => w.message.includes('effect() expects a function callback'))).toBe(
        true,
      )
    },
  },

  // ── class + object literal breadth ───────────────────────────────────────
  {
    name: 'a class property WITHOUT a value and a static block are skipped',
    code: `${HEADER}let a = state(1)\nexport class K3 { p; q = a; static { log(a) } }\n`,
    assert: ({ code }) => expect(code).toContain('q = a()'),
  },
  {
    name: 'a COMPUTED object key is walked',
    code: `${HEADER}let a = state(1)\nlet k = state('kk')\nconst o = { [k]: a }\nexport const read = () => o\n`,
    assert: ({ code }) => expect(code).toContain('{ [k()]: a() }'),
  },
  {
    name: 'a bare `yield` (no argument) is skipped',
    code: `${HEADER}let a = state(1)\nexport function* gen() { yield; yield a }\n`,
    assert: ({ code }) => expect(code).toContain('yield a()'),
  },

  // ── JSX attribute / child breadth ────────────────────────────────────────
  {
    name: 'boolean, string-literal, element-valued attributes and a spread child',
    code: `${HEADER}let a = state(1)\nexport const V = () => <div hidden id="x" v=<b/>>{...items}{a}</div>\n`,
    assert: ({ code }) => {
      expect(code).toContain('hidden id="x" v=<b/>')
      expect(code).toContain('{a()}')
    },
  },

  // ── writes in VALUE position ─────────────────────────────────────────────
  {
    name: 'compound and logical assignment in EXPRESSION position settle to a value',
    code:
      `${HEADER}let c = state(0)\nexport const e1 = () => take(c += 2)\nexport const e2 = () => take(c ||= 5)\n`,
    assert: ({ code }) => {
      expect(code).toContain('take((c.set(c() + (2)), c()))')
      expect(code).toContain('take((c() || (c.set(5), c())))')
    },
  },
  {
    name: 'destructuring assignment onto store / derived / untracked bindings',
    code:
      `${HEADER}let u2 = state({ k: 1 })\nconst d2 = derived(1 + 1)\nlet plain2 = 0\n` +
      `export function w() {\n  ;({ u2 } = src)\n  ;({ d2 } = src)\n  ;({ plain2 } = src)\n}\n`,
    assert: ({ warnings }) => {
      const msgs = warnings.map((w) => w.message)
      expect(msgs.some((m) => m.includes('destructuring assignment onto plain state `u2`'))).toBe(
        true,
      )
      expect(msgs.some((m) => m.includes('destructuring assignment onto plain state `d2`'))).toBe(
        true,
      )
      expect(msgs.some((m) => m.includes('`plain2`'))).toBe(false)
    },
  },
  {
    name: 'member WRITES: call root, computed store index, untracked root',
    code:
      `${HEADER}let todos = state([{ n: 1 }])\nlet i = 0\n` +
      `export const w1 = () => { getObj().k = 1 }\n` +
      `export const w2 = () => { todos[i] = { n: 2 } }\n` +
      `export const w3 = () => { plainObj.k = 1 }\n`,
    assert: ({ code, warnings }) => {
      expect(code).toContain('getObj().k = 1')
      expect(code).toContain('todos()[i] = { n: 2 }')
      expect(code).toContain('plainObj.k = 1')
      expect(warnings).toHaveLength(0)
    },
  },
  {
    name: 'member UPDATES: call root, computed store index, untracked root',
    code:
      `${HEADER}let todos = state([{ n: 1 }])\nlet i = 0\n` +
      `export const u1 = () => { getObj().k++ }\n` +
      `export const u2 = () => { todos[i]++ }\n` +
      `export const u3 = () => { plainObj.k++ }\n`,
    assert: ({ code, warnings }) => {
      expect(code).toContain('getObj().k++')
      expect(code).toContain('todos()[i]++')
      expect(code).toContain('plainObj.k++')
      expect(warnings).toHaveLength(0)
    },
  },
  {
    name: 'imported state: member write and member update both warn conditionally',
    code: `${HEADER}export const a = () => { remote.k = 1 }\nexport const b = () => { remote.n++ }\n`,
    knownSignals: ['remote'],
    assert: ({ warnings }) => {
      expect(
        warnings.filter((w) => w.message.includes('mutating a property of imported state')),
      ).toHaveLength(2)
    },
  },
]

describe('plain pre-pass — branch battery', () => {
  for (const c of CASES) {
    it(c.name, () => {
      c.assert(run(c))
    })
  }
})

// A `.ts` file cannot carry JSX, so the TS-only angle-bracket shapes get their
// own cases — and they are where the two backends currently DISAGREE (below).
const TS_ASSERTION = `'use plain'\nimport { state } from '@pyreon/core/plain'\nlet a = state(1)\nconst v = <number>plainv\nexport const read = () => [a, v]\n`
const TS_GENERIC_ARROW = `'use plain'\nimport { state } from '@pyreon/core/plain'\nlet a = state(1)\nconst id = <T>(x: T) => x\nexport const read = () => [a, id]\n`

describe('plain pre-pass — .ts-only shapes', () => {
  it('a TSTypeAssertion falls through the expression switch', () => {
    const out = transformPlain(TS_ASSERTION, 'assert.ts', {})
    expect(out).not.toBeNull()
    expect(out!.code).toContain('const v = <number>plainv')
    expect(out!.code).toContain('[a(), v]')
  })

  it('a generic arrow (no trailing comma) is transformed', () => {
    const out = transformPlain(TS_GENERIC_ARROW, 'generic.ts', {})
    expect(out).not.toBeNull()
    expect(out!.code).toContain('const a = signal(1)')
    expect(out!.code).toContain('[a(), id]')
  })
})

describeNative('plain pre-pass — branch battery ↔ native byte-equality', () => {
  const compare = (code: string, filename: string, knownSignals?: string[]) => {
    const js = transformPlain(code, filename, knownSignals ? { knownSignals } : {})
    const rs = nativePlain!(code, filename, knownSignals ?? null)
    if (js === null) {
      expect(rs, `native must return null where JS does\n${code}`).toBeNull()
      return
    }
    expect(rs, `native must transform where JS does\n${code}`).not.toBeNull()
    if (js.code !== rs!.code) {
      const a = js.code.split('\n')
      const b = rs!.code.split('\n')
      const diffs: string[] = []
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) diffs.push(`line ${i + 1}:\n  JS: ${a[i]}\n  RS: ${b[i]}`)
      }
      expect.fail(`code diverged on:\n${code}\n${diffs.join('\n')}`)
    }
    expect(rs!.warnings, `warnings diverged on:\n${code}`).toEqual(js.warnings)
  }

  for (const c of CASES) {
    it(c.name, () => {
      compare(c.code, c.filename ?? 'cov.tsx', c.knownSignals)
    })
  }

  /**
   * `.ts` / `.mts` / `.cts` parse WITHOUT JSX on both backends. The Rust mirror
   * used to build its `SourceType` with `.with_jsx(true)` for EVERY extension
   * (`native/src/plain.rs`), while the JS `getLang` maps those three to `'ts'`
   * with JSX off — so TS-only angle-bracket syntax (an old-style assertion
   * `<T>expr`, a generic arrow `<T>(x) => x` without the trailing comma) made
   * the Rust parse fail and `transform_plain` return `None`. A `None` is a
   * VERDICT ("not a plain module"), so the whole file shipped un-rewritten and
   * its `state()` calls reached the runtime and threw. These two shapes were
   * locked as `it.fails` until the Rust side mirrored `getLang`; they are now
   * ordinary byte-equality specs, bisect-verified against the old binary.
   */
  it('.ts TSTypeAssertion — both backends transform, byte-equal', () => {
    compare(TS_ASSERTION, 'assert.ts')
  })

  it('.ts generic arrow — both backends transform, byte-equal', () => {
    compare(TS_GENERIC_ARROW, 'generic.ts')
  })
})
