/**
 * Prop-derived aliases resolve by LEXICAL binding, not by identifier name
 * (issue #3815).
 *
 * The reactive-props inliner substitutes `props.x` for a `const label =
 * props.x` alias at its JSX use sites. The registry is keyed by name, so
 * before this fix an alias leaked out of the function that declared it:
 *
 *   function First(props) { const label = props.label; return <span>{label}</span> }
 *   function Second()     { const label = 'Second';     return <span>{label}</span> }
 *
 * emitted `props.label` inside `Second` (no `props` binding there →
 * `ReferenceError` at mount, no warning). The native backend had no
 * enclosing-scope shadowing at all; the JS backend only treated a sibling's
 * LOCAL redeclaration as a shadow, so an import / module const / free
 * reference of the same name was still rewritten.
 *
 * Every case runs through BOTH backends and asserts BYTE-IDENTICAL output
 * (the repo's equivalence contract) plus the lexical property the case is
 * about. Bisect: revert the JS frame (`enterPropDerivedScope` /
 * `propDerivedLog`) → the JS-side property specs fail; revert the Rust frame
 * (`walk_block_stmts` / `pd_hide`) → the native specs fail.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

type NativeTransform = (
  code: string,
  filename: string,
  ssr: boolean,
  knownSignals: string[] | null,
) => { code: string }

let native: NativeTransform | null = null
try {
  const req = createRequire(import.meta.url)
  const here = dirname(fileURLToPath(import.meta.url))
  native = (
    req(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as { transformJsx: NativeTransform }
  ).transformJsx
} catch {
  /* native binary absent — JS specs still run, equivalence specs skip */
}

const SIG = `import { signal } from '@pyreon/reactivity'\nexport function A() { const s = signal(0); return <i>{s}</i> }\n`
const FIRST = `export function First(props: { label: string }) {
  const label = props.label
  return <span>{label}</span>
}
`

const js = (src: string): string => transformJSX_JS(src, 't.tsx').code
const rs = (src: string): string => native!('' + src, 't.tsx', false, null).code
const parses = (out: string): boolean => {
  try {
    return (parseSync('o.tsx', out).errors?.length ?? 0) === 0
  } catch {
    return false
  }
}
/** Text from `marker` on (the part of the module the case is about). */
const from = (out: string, marker: string): string => out.slice(out.indexOf(marker))

interface Case {
  name: string
  src: string
  /** Everything after this marker must NOT mention the alias's `props.label`. */
  after?: string
  check?: (out: string) => void
}

const CASES: Case[] = [
  // ── a sibling function's own name for the same identifier ────────────────
  { name: 'sibling const', after: 'Second', src: FIRST + `export function Second() { const label = 'S'; return <span>{label}</span> }` },
  { name: 'sibling let', after: 'Second', src: FIRST + `export function Second() { let label = 'S'; return <span>{label}</span> }` },
  { name: 'sibling parameter', after: 'Second', src: FIRST + `export function Second(label) { return <span>{label}</span> }` },
  { name: 'sibling destructured parameter', after: 'Second', src: FIRST + `export function Second({ label }) { return <span>{label}</span> }` },
  { name: 'sibling destructured body const', after: 'Second', src: FIRST + `export function Second(p) { const { label } = p; return <span>{label}</span> }` },
  { name: 'sibling arrow component', after: 'Second', src: FIRST + `export const Second = () => { const label = 'S'; return <span>{label}</span> }` },
  // ── a name no function declares: import / module const / global ──────────
  { name: 'import of the same name', after: 'Second', src: `import { label } from './x'\n` + FIRST + `export function Second() { return <span>{label}</span> }` },
  { name: 'module const of the same name', after: 'Second', src: FIRST + `const label = 'M'\nexport function Second() { return <span>{label}</span> }` },
  { name: 'free (global) reference', after: 'Second', src: FIRST + `export function Second() { return <span>{label}</span> }` },
  // ── nested scopes inside the SAME component ──────────────────────────────
  { name: 'catch parameter', after: 'Second', src: FIRST + `export function Second() { try { f() } catch (label) { return <span>{label}</span> } return null }` },
  { name: 'for-of head', after: 'Second', src: FIRST + `export function Second() { for (const label of xs) { g(<span>{label}</span>) } return null }` },
  { name: 'callback parameter', after: 'Second', src: FIRST + `export function Second() { return <ul>{xs.map(label => <li>{label}</li>)}</ul> }` },
  { name: 'inner function declaration', after: 'Second', src: FIRST + `export function Second() { function label() { return 1 } return <span>{label()}</span> }` },
  { name: 'sibling blocks of one function', src: `export function A(props) { if (c) { const label = props.a; return <i>{label}</i> } { const label = 'plain'; return <b>{label}</b> } }`, check: (o) => { expect(o).toContain('(props.a)'); expect(from(o, "'plain'")).not.toContain('props.a') } },
  { name: 'module const declared AFTER the aliasing component', src: FIRST + `const label = 'M'\nexport function Second() { return <span>{label}</span> }`, check: (o) => { expect(from(o, 'export function First')).toContain('(props.label)'); expect(from(o, 'function Second')).not.toContain('props.label') } },
  { name: 'alias used after its block ended', src: `export function A(props) { if (c) { const label = props.label; return <i>{label}</i> } return <b>{label}</b> }`, check: (o) => { expect(from(o, 'return _tpl("<b>')).not.toContain('props.label') } },
  { name: 'shadowing block inside the declaring component', src: `export function A(props) { const label = props.label; if (c) { const label = 'x'; return <b>{label}</b> } return <div>{label}</div> }`, check: (o) => { const inner = o.slice(o.indexOf("const label = 'x'"), o.indexOf('return _tpl("<div>')); expect(inner).not.toContain('props.label'); expect(from(o, 'return _tpl("<div>')).toContain('(props.label)') } },
  { name: 'catch parameter inside the declaring component', src: `export function A(props) { const label = props.label; try { g() } catch (label) { return <b>{label}</b> } return <div>{label}</div> }`, check: (o) => { const inner = o.slice(o.indexOf('catch (label)'), o.indexOf('return _tpl("<div>')); expect(inner).not.toContain('props.label'); expect(from(o, 'return _tpl("<div>')).toContain('(props.label)') } },
  // ── things that must KEEP inlining (over-suppression guards) ─────────────
  { name: 'alias still inlines in its own component', src: FIRST, check: (o) => expect(o).toContain('(props.label)') },
  { name: 'alias chain stays reactive', src: `export function A(props) { const a = props.x; const b = a + 1; return <i>{b}</i> }\nexport function B() { const a = 1; const b = a; return <i>{b}</i> }`, check: (o) => { expect(o).toContain('((props.x) + 1)'); expect(from(o, 'function B')).not.toContain('props') } },
  { name: 'alias used inside a nested render callback', src: `export function A(props) { const label = props.label; return <ul>{props.xs.map(x => <li>{label}{x}</li>)}</ul> }\nexport function B() { const label = 'z'; return <ul>{xs.map(x => <li>{label}{x}</li>)}</ul> }`, check: (o) => { expect(o).toContain('{(props.label)}'); expect(from(o, 'function B')).not.toContain('props.label') } },
  { name: 'sibling arrow components, both prop-derived', src: `export const A = (props) => { const label = props.label; return <i>{label}</i> }\nexport const B = (props) => { const label = props.other; return <i>{label}</i> }`, check: (o) => { expect(from(o, 'const A')).toContain('(props.label)'); expect(from(o, 'const B')).toContain('(props.other)'); expect(from(o, 'const B')).not.toContain('props.label') } },
  { name: 'splitProps holder does not leak', src: `export function A(props) { const [own] = splitProps(props, ['a']); const v = own.a; return <i>{v}</i> }\nexport function B() { const v = 'q'; return <i>{v}</i> }`, check: (o) => { expect(o).toContain('(own.a)'); expect(from(o, 'function B')).not.toContain('own.a') } },
  { name: 'nested component declaration inherits the outer alias', src: `export function A(props) { const label = props.label; function Inner() { return <b>{label}</b> } return <div><Inner /></div> }\nexport function B() { const label = 'b'; return <b>{label}</b> }`, check: (o) => { expect(o).toContain('(props.label)'); expect(from(o, 'function B')).not.toContain('props.label') } },
  // ── same class, other name-keyed registries: a FUNCTION-local signal ─────
  // `signalVars` leaked the same way — a sibling's `const s = signal(0)` made
  // an imported / module / free `s` auto-call (`s is not a function`).
  { name: 'signal: sibling import of the same name', src: SIG + `import { s } from './x'\nexport function B() { return <b>{s}</b> }`, check: (o) => { expect(from(o, 'function B')).not.toContain('s()'); expect(from(o, 'function A')).toContain('s()') } },
  { name: 'signal: sibling module const of the same name', src: SIG + `const s = 'm'\nexport function B() { return <b>{s}</b> }`, check: (o) => expect(from(o, 'function B')).not.toContain('s()') },
  { name: 'signal: sibling free reference', src: SIG + `export function B() { return <b>{s}</b> }`, check: (o) => expect(from(o, 'function B')).not.toContain('s()') },
  { name: 'signal: sibling declares its OWN signal of that name', src: SIG + `export function B() { const s = signal(1); return <b>{s}</b> }`, check: (o) => { expect(from(o, 'function A')).toContain('s()'); expect(from(o, 'function B')).toContain('s()') } },
  { name: 'signal: a MODULE-level signal stays visible inside functions', src: `const s = signal(0)\nexport function A() { return <i>{s}</i> }\nexport function B() { return <b>{s}</b> }`, check: (o) => { expect(from(o, 'function A')).toContain('s()'); expect(from(o, 'function B')).toContain('s()') } },
]

describe('prop-derived aliases resolve by lexical binding (#3815)', () => {
  for (const c of CASES) {
    const assertProperty = (out: string): void => {
      expect(parses(out)).toBe(true)
      if (c.after) expect(from(out, c.after)).not.toContain('props.label')
      c.check?.(out)
    }
    it(`JS backend — ${c.name}`, () => assertProperty(js(c.src)))
    it.runIf(native !== null)(`native backend — ${c.name}`, () => assertProperty(rs(c.src)))
    it.runIf(native !== null)(`byte-identical across backends — ${c.name}`, () => {
      expect(rs(c.src)).toBe(js(c.src))
    })
  }

  it('the native binary is present in this environment (a skipped suite is not coverage)', () => {
    expect(native).not.toBeNull()
  })
})
