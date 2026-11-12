import { describe, expect, it } from 'vitest'
import {
  detectReactPatterns,
  hasReactPatterns,
  REACT_PATTERN_TRIGGERS,
  type ReactDiagnosticCode,
} from '../react-intercept'

// #4304 — `pyreon check` and doctor's react-patterns gate run the detectors
// only on files that pass the `hasReactPatterns` pre-filter. The hand-written
// pre-filter drifted from the detectors (no `.map(`, `onChange`, …), so those
// files were skipped; and five declared codes were never emitted.
//
// The contract, one fixture per code — typed as a `Record` over the union, so
// a new code cannot be added without a fixture here:
//   1. the detector EMITS the code for its fixture (no dead codes), and
//   2. the pre-filter passes the fixture WITHOUT any other React habit in it
//      (each fixture is a file whose ONLY habit is that one).

const FIXTURES: Record<ReactDiagnosticCode, string> = {
  'react-import': `import { createContext } from 'react'\nexport const C = createContext(0)`,
  'react-dom-import': `import { createPortal } from 'react-dom'\nexport const p = createPortal`,
  'react-router-import': `import { Link } from 'react-router-dom'\nexport const L = Link`,
  'use-state': `export function A() { const [n, setN] = useState(0); return n }`,
  'use-effect-mount': `export function A() { useLayoutEffect(() => { go() }, []) }`,
  'use-effect-deps': `export function A(p) { useEffect(() => { go(p.x) }, [p.x]) }`,
  'use-effect-no-deps': `export function A() { useEffect(() => { go() }) }`,
  'use-memo': `export function A(p) { const d = useMemo(() => p.x * 2, [p.x]); return d }`,
  'use-callback': `export function A(p) { const f = useCallback(() => p.go(), [p]); return f }`,
  'use-ref-dom': `export function A() { const el = useRef(null); return <div ref={el} /> }`,
  'use-ref-box': `export function A() { const count = useRef(0); count.current++; return null }`,
  'use-reducer': `export function A() { const [s, d] = useReducer(r, 0); return s }`,
  'memo-wrapper': `export const Fancy = memo(function Fancy() { return <i /> })`,
  'forward-ref': `export const I = forwardRef((props, ref) => <input ref={ref} />)`,
  'class-name-prop': `export const A = () => <div className="x" />`,
  'html-for-prop': `export const A = () => <label htmlFor="x">X</label>`,
  'on-change-input': `export const A = (p) => <input onChange={(e) => p.set(e.currentTarget.value)} />`,
  'dot-value-signal': `import { signal } from '@pyreon/reactivity'\nexport const n = signal(0)\nn.value += 1`,
  'array-map-jsx': `export const L = (p) => <ul>{p.todos.map((t) => <li>{t.text}</li>)}</ul>`,
}

describe('React detector ↔ pre-filter contract', () => {
  for (const [code, src] of Object.entries(FIXTURES) as [ReactDiagnosticCode, string][]) {
    it(`${code}: emitted by the detector, and passes the pre-filter on its own`, () => {
      expect(detectReactPatterns(src, 'fixture.tsx').map((d) => d.code)).toContain(code)
      expect(hasReactPatterns(src)).toBe(true)
      // The fixture's own trigger is what lets it through (not a neighbour's).
      expect(REACT_PATTERN_TRIGGERS[code].test(src)).toBe(true)
    })
  }

  it('the pre-filter still rejects a file with no React habit', () => {
    expect(hasReactPatterns('export const x = 1\nconst ok = a.value === b')).toBe(false)
  })
})
