import { rawTransferSupported } from 'oxc-parser'
import { _parseOxcWith, _rawTransferActive, parseOxc } from '../oxc-parse'
import { _reactiveCalleeStarts } from '../index'

// Shapes the plugin's two parse consumers care about: reactive callees (the
// signal-name confirmation), `process.env.NODE_ENV` member chains (the
// ast-rewrite define pass), parens (`preserveParens: false`), JSX, TS types,
// and look-alikes inside strings / comments / templates / regex literals.
const SOURCES: Array<[string, string]> = [
  ['a.tsx', `const count = signal(0)\nconst d = computed(() => count() * 2)\neffect(() => console.log(d()))\nexport const App = () => <div class="x">{count()} {"signal(1)"}</div>`],
  ['b.ts', `// signal(0) in a comment\nconst s = 'computed(x)'\nconst t = \`effect(\${signal(1)})\`\nconst re = /signal\\(/g\nif ((process.env.NODE_ENV) !== 'production') warn()`],
  ['c.tsx', `type P<T> = { v: T }\nfunction C<T,>(p: P<T>) { return <>{(p.v as unknown) as string}</> }\nlet x = obj.signal(1); x = (signal)(2)`],
  ['d.ts', `export default class K { #p = 1; static { void 0 } m?.(a ?? b, ...c) {} }`],
  ['e.ts', `const broken = (`],
]

describe('parseOxc', () => {
  it('uses raw transfer exactly when oxc reports it supported', () => {
    expect(_rawTransferActive).toBe(rawTransferSupported())
  })

  for (const [id, code] of SOURCES) {
    for (const preserveParens of [true, false]) {
      it(`raw and JSON arms agree on ${id} (preserveParens=${preserveParens})`, () => {
        const lang = id.endsWith('x') ? 'tsx' : 'ts'
        const json = _parseOxcWith(false, id, code, { sourceType: 'module', lang, preserveParens })
        const live = parseOxc(id, code, { sourceType: 'module', lang, preserveParens })
        expect(live.errors.length).toBe(json.errors.length)
        expect(JSON.stringify(live.program)).toBe(JSON.stringify(json.program))
        if (rawTransferSupported()) {
          const raw = _parseOxcWith(true, id, code, { sourceType: 'module', lang, preserveParens })
          expect(raw.errors.length).toBe(json.errors.length)
          expect(JSON.stringify(raw.program)).toBe(JSON.stringify(json.program))
        }
      })
    }
  }

  it('reactive-callee confirmation sees exactly the real calls', () => {
    const [id, code] = SOURCES[1]!
    const starts = _reactiveCalleeStarts(code, id)!
    // Only the `signal(1)` inside the template interpolation is a real call.
    expect([...starts]).toEqual([code.indexOf('signal(1)')])
    expect(_reactiveCalleeStarts('const broken = (', 'x.ts')).toBeNull()
  })
})
