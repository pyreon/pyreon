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

const nestedForSource = `function Example(props) {
  const record = () => props.record
  const summary = () => record().summary
  const indices = computed(() => record().items.map((_, index) => index))
  return <Box>
    {record().items.length === 0 ? (
      <Label text={\`Empty \${summary().count}\`} />
    ) : (
      <Box>
        <Row><Label text={String(summary().count)} /></Row>
        <List><For each={indices} by={index => index}>{index =>
          <Label text={\`\${record().items[index]?.name} (\${record().items[index]?.value})\`} />
        }</For></List>
      </Box>
    )}
    <Label text={\`Count \${summary().count} · Total \${summary().total}\`} />
  </Box>
}`

for (const [name, transform] of backends) {
  describe(`${name} — nested For inside implicit conditionals (#3861)`, () => {
    for (const prefix of ['', '// 字😀 before AST spans\n']) {
      for (const explicit of [false, true]) {
        it(`preserves following siblings (Unicode=${!!prefix}, explicit=${explicit})`, () => {
          const source =
            prefix +
            (explicit
              ? nestedForSource.replace(
                  '{record().items.length === 0 ?',
                  '{() => record().items.length === 0 ?',
                )
              : nestedForSource)
          expect(parseSync('fixture.tsx', source).errors).toEqual([])
          const output = transform(source)
          expect(parseSync('fixture.tsx', output).errors, output).toEqual([])
          expect(output.match(/Count /g)).toHaveLength(1)
          expect(output).toMatch(/each=\{(?:_rp\(\(\) => )?indices/)
          expect(output).toBe(transformJSX_JS(source, 'fixture.tsx').code)
        })
      }
    }
  })
}
