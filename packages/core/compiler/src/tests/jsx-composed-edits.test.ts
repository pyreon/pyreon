import { createRequire } from 'node:module'
import { parseSync } from 'oxc-parser'
import { transformJSX_JS } from '../jsx'

type Backend = (source: string) => string
const backends: [string, Backend][] = [
  ['JavaScript', (source) => transformJSX_JS(source, 'fixture.tsx').code],
]
try {
  const native = createRequire(import.meta.url)('../../native/pyreon-compiler.node') as {
    transformJsx: (source: string, filename: string, ssr: boolean, known: null) => { code: string }
  }
  backends.push(['Rust', (source) => native.transformJsx(source, 'fixture.tsx', false, null).code])
} catch {
  // The fallback contract always runs; Rust parity additionally runs when built.
}

for (const [name, transform] of backends) {
  describe(`${name} — source edits compose`, () => {
    for (const [expression, expected] of [
      ['show ? label : "default"', 'show() ? (props.label) : "default"'],
      ['label + show', '(props.label) + show()'],
      ['show + label', 'show() + (props.label)'],
      ['show ? longAlias : label', 'show() ? (props.x) : (props.label)'],
    ]) {
      it(`preserves both prop expansion and signal calls: ${expression}`, () => {
        const source = `function C(props) { const show = signal(false); const label = props.label; const longAlias = props.x; return <div class={${expression}}>ok</div> }`
        expect(parseSync('fixture.tsx', source).errors).toEqual([])
        const output = transform(source)
        expect(parseSync('fixture.tsx', output).errors, output).toEqual([])
        expect(output).toContain(expected)
        expect(output).not.toContain('"default"}>')
      })
    }
    it('terminates a static hoist before a top-level JSX statement', () => {
      const source = '<div>{<span>Hello</span>}</div>'
      expect(parseSync('fixture.tsx', source).errors).toEqual([])
      const output = transform(source)
      expect(output).toContain('const _$h0 = /*@__PURE__*/ <span>Hello</span>;')
      expect(parseSync('fixture.tsx', output).errors, output).toEqual([])
    })
  })
}
