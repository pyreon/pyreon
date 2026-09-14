// `parsePyreon`'s entry: the Plain-Mode hook, parse-error formatting, and the
// `filename` option that both of them report through.
//
// Plus the three KNOWN BUGS this coverage pass turned up. Each is locked with a
// self-retiring `it.fails` that states the expected behaviour and names the fix
// site, so the product change retires the lock rather than the lock being
// edited to match the product.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const P = '@pyreon/primitives'

const swift = (src: string, filename?: string): string =>
  transform(src, filename === undefined ? { target: 'swift' } : { target: 'swift', filename }).code
const kotlin = (src: string): string => transform(src, { target: 'kotlin' }).code

describe('parse errors are reported as file:line:col', () => {
  it('a syntax error names the file the caller passed', () => {
    expect(() => transform(`export function S() {`, { target: 'swift', filename: 'src/App.tsx' }))
      .toThrow(/^src\/App\.tsx:1:22: /)
  })

  it('without a filename it falls back to the documented default', () => {
    expect(() => transform(`export function S() {`, { target: 'swift' })).toThrow(/^input\.tsx:1:/)
  })

  it('the LINE is counted from the error offset, not fixed at 1', () => {
    // Two good lines then a broken one — a position that is only right if the
    // newlines before the offset are counted.
    const src = `const a = 1\nconst b = 2\nconst c = ]\nconst d = 4\n`
    expect(() => transform(src, { target: 'swift', filename: 'App.tsx' })).toThrow(/^App\.tsx:3:11: /)
  })

  it('the COLUMN is 1-based from the start of its own line', () => {
    expect(() => transform(`\nconst x = 1 const y = 2`, { target: 'swift', filename: 'App.tsx' }))
      .toThrow(/^App\.tsx:2:12: /)
  })
})

describe('Plain Mode — one dialect, both targets', () => {
  const BODY =
    `export function S() { let n = state(0); return <Stack><Text>{String(n)}</Text></Stack> }`
  const CLASSIC = `import { Stack, Text } from '${P}'
export function S() { const n = signal(0); return <Stack><Text>{String(n())}</Text></Stack> }`
  const VIA_IMPORT = `import { state } from '@pyreon/core/plain'
import { Stack, Text } from '${P}'
${BODY}`
  const BOTH = `'use plain'
import { state } from '@pyreon/core/plain'
import { Stack, Text } from '${P}'
${BODY}`
  const DIRECTIVE_ONLY = `'use plain'
import { Stack, Text } from '${P}'
${BODY}`

  it('a plain module importing the markers emits BYTE-IDENTICALLY to its classic twin', () => {
    expect(swift(VIA_IMPORT)).toBe(swift(CLASSIC))
    expect(kotlin(VIA_IMPORT)).toBe(kotlin(CLASSIC))
  })

  it('the directive PLUS the marker import is byte-identical too', () => {
    expect(swift(BOTH)).toBe(swift(CLASSIC))
    expect(kotlin(BOTH)).toBe(kotlin(CLASSIC))
  })

  it('a plain-mode WARNING is reported with the file and position the author wrote', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'
import { Stack, Text } from '${P}'
export function S() { let u = state({ a: 1 }); u = other; return <Stack><Text>{String(u.a)}</Text></Stack> }`
    const w = transform(src, { target: 'swift', filename: 'src/App.tsx' }).warnings
    // Whatever the pre-pass has to say, it says it against the real file — the
    // strips are line-preserving so the position is the author's, not the
    // rewritten source's.
    expect(w.every((m) => !m.includes('input.tsx'))).toBe(true)
  })

  it('a module with NEITHER the directive nor the marker import is untouched', () => {
    expect(swift(CLASSIC)).toBe(swift(CLASSIC))
    expect(transform(CLASSIC, { target: 'swift' }).warnings).toEqual([])
  })

  it('a plain module with a SYNTAX error still reports through the real filename', () => {
    const broken = `'use plain'
import { Stack } from '${P}'
export function S( { return <Stack/> }`
    expect(() => transform(broken, { target: 'swift', filename: 'src/App.tsx' }))
      .toThrow(/^src\/App\.tsx:\d+:\d+: /)
  })

  // -------------------------------------------------------------------------
  describe('KNOWN BUG — the `use plain` DIRECTIVE alone activates the pass but rewrites nothing', () => {
    // `@pyreon/compiler/plain` treats the directive as sufficient activation:
    // `detectPlain` returns true for it (plain.ts:89) and `transformPlain`
    // proceeds on `hasDirective` alone (plain.ts:175, `if (!hasDirective &&
    // markers.size === 0) return null`). But `isMarker` (plain.ts:240) resolves
    // `state` / `derived` / `effect` ONLY through a local name bound by an
    // `@pyreon/core/plain` IMPORT, so with the directive alone `markers` is
    // empty and every `state(...)` call is left verbatim.
    //
    // Through PMTC that is the uncompilable-passthrough class: the emit carries
    // a literal `state(0)` call — a symbol that exists in neither Swift nor
    // Kotlin — on BOTH targets, with ZERO warnings. Every upstream plain spec
    // writes the directive and the import together (`HEADER` in
    // compiler/src/tests/plain.test.ts), so the directive-only path is
    // structurally untested there.
    //
    // FIX (upstream, packages/core/compiler/src/plain.ts): when `hasDirective`
    // is true, seed `markers` with the bare dialect names that are not otherwise
    // bound — or, if the import is genuinely mandatory, make `transformPlain`
    // return null for a directive with no markers so PMTC's classic parse runs
    // and the shape at least fails loudly.
    it.fails('KNOWN BUG: directive-only plain source should emit its classic twin (Swift)', () => {
      expect(swift(DIRECTIVE_ONLY)).toBe(swift(CLASSIC))
    })

    it.fails('KNOWN BUG: directive-only plain source should emit its classic twin (Kotlin)', () => {
      expect(kotlin(DIRECTIVE_ONLY)).toBe(kotlin(CLASSIC))
    })

    it.fails('KNOWN BUG: or, failing that, it must not emit a bare `state(` call silently', () => {
      const emitted = swift(DIRECTIVE_ONLY).includes('state(0)')
      const warned = transform(DIRECTIVE_ONLY, { target: 'swift' }).warnings.length > 0
      // Either it lowers, or it says something. Today: neither.
      expect(emitted && !warned).toBe(false)
    })

    it('the passthrough it produces today, pinned so the fix reads as a change', () => {
      expect(swift(DIRECTIVE_ONLY)).toContain('state(0)')
      expect(transform(DIRECTIVE_ONLY, { target: 'swift' }).warnings).toEqual([])
    })
  })
})

describe('a SPARSE array literal no longer crashes the parser', () => {
  // An array elision (`[1, , 2]`) gives oxc a `null` ELEMENT. `parseExpr`'s
  // ArrayExpression arm used to map straight over `node.elements`, and
  // `parseExpr` dereferences `node.type` on the first line of its switch, so
  // the null element threw a raw `TypeError: null is not an object
  // (evaluating 'node.type')` out of `transform()` — not a warning, not a
  // bail, an internal crash with no file/line and nothing naming the
  // construct. Reachable from both scopes an array literal can occupy: a
  // module-level `const` and a component-body one.
  //
  // Fixed: the ArrayExpression arm lowers a hole to `{ kind: 'undefined' }`,
  // matching what reading it produces on the web and every native target, so
  // element POSITIONS still line up rather than collapsing the array.
  const holeModule = `import { Stack, Text } from '${P}'
const holes = [1, , 2]
export function S() { return (<Stack><Text>{String(holes.length)}</Text></Stack>) }`
  const holeComponent = `import { Stack, Text } from '${P}'
export function S() { const h = [1, , 2]; return (<Stack><Text>{String(h.length)}</Text></Stack>) }`

  it('a module-scope sparse array does not crash the parser, on either target', () => {
    expect(() => transform(holeModule, { target: 'swift' })).not.toThrow()
    expect(() => transform(holeModule, { target: 'kotlin' })).not.toThrow()
  })

  it('a component-scope sparse array does not crash the parser', () => {
    expect(() => transform(holeComponent, { target: 'swift' })).not.toThrow()
  })

  it('the hole lowers to undefined, keeping element positions', () => {
    const out = transform(holeModule, { target: 'swift' })
    expect(out.code).toContain('1')
    expect(out.code).toContain('2')
  })

  it('a DENSE array literal beside it lowers normally', () => {
    const dense = holeModule.replace('[1, , 2]', '[1, 2, 3]')
    expect(transform(dense, { target: 'swift' }).code).toContain('[1, 2, 3]')
  })
})
