import { transform } from '../index'
const APP =
  'interface Slice { value: number }; export function Example() { return <Text>hello</Text> }'
const shadows = (source: string) =>
  transform(source, { target: 'swift' }).warnings.filter((w) => w.includes('SHADOWS'))
describe('compiler driver input contracts', () => {
  it('rejects an unknown target before emitting another language', () => {
    expect(() => transform(APP, { target: 'rust' as never })).toThrow(
      /Unknown native compiler target "rust".*swift, kotlin/,
    )
  })
  it.each([
    "// import { Chart } from '@pyreon/charts'\n",
    "/* import { Chart } from '@pyreon/charts' */\n",
    'const example = "import { Chart } from \'@pyreon/charts\'";\n',
  ])('ignores import text outside the AST: %s', (prefix) => {
    expect(shadows(prefix + APP)).toEqual([])
  })
  it.each([
    "import '@pyreon/charts';",
    "import { Chart } from /* package */ '@pyreon/charts';",
    "import { Chart } from '@pyreon/\\u0063harts';",
    "import type { Slice } from '@pyreon/charts/engine';",
  ])('detects real chart imports: %s', (prefix) => {
    expect(shadows(prefix + APP)).toHaveLength(1)
    expect(shadows(prefix + APP)[0]).toContain("invalid redeclaration of 'Slice'")
  })
  it('ignores non-engine subpaths', () => {
    expect(shadows("import '@pyreon/charts/examples';" + APP)).toEqual([])
  })
})
