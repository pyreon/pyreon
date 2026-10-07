import { createCompiler } from '@pyreon/native-compiler'
import { coolgridPlugin } from '../../../../ui-system/coolgrid/src/native-plugin/plugin'
import { explainReport } from '../plugin-commands'

// `explain` reads the file's import statements to attribute element tags to the
// plugin that lowers them. That reader runs on whatever file the user points it
// at, so it must stay linear on hostile text (CodeQL js/polynomial-redos: a
// `[^}]*` body rescans to the end of the file from every unclosed `import {`).

const compiler = createCompiler({ discovered: [coolgridPlugin] })
const explain = (source: string) => explainReport(source, '/app/A.tsx', compiler, '/app')

describe('explain — import statements are read correctly', () => {
  const ROW = `import { Container, Row as GridRow, Col } from '@pyreon/coolgrid'
export function Example() {
  return <Container><GridRow><Col>x</Col></GridRow></Container>
}`

  it('attributes tags imported with renames, to the plugin that lowers them', () => {
    const out = explain(ROW).lines.join('\n')
    expect(out).toContain('Container')
    expect(out).not.toMatch(/error:/)
  })

  it('reads multi-line and `import type` statements and ignores inline type modifiers', () => {
    const source = `import type { Foo } from 'a'
import {
  type Bar,
  Container,
} from '@pyreon/coolgrid'
export function Example() { return <Container>x</Container> }`
    const { lines, exitCode } = explain(source)
    expect(exitCode).toBe(0)
    expect(lines.join('\n')).not.toMatch(/error:/)
  })

  it('does not choke on imports without braces, without `from`, or with an unclosed brace', () => {
    // Inside a comment so the file is still valid source: the import reader
    // scans raw text, and these are the shapes its brace/`from` checks reject.
    for (const fragment of [
      `import 'side-effect'`,
      `import Default from 'x'`,
      `import { A } oops 'x'`,
      `import { A, B`,
    ]) {
      expect(explain(`/* ${fragment} */\nexport function E() { return <Text>x</Text> }`).exitCode).toBe(0)
    }
  })
})

describe('explain — import statement shapes the reader must tolerate', () => {
  const TAIL = `\nexport function E() { return <Text>x</Text> }`
  // Inside a comment so the file stays valid source: the reader scans raw text.
  it.each([
    ['an inline type modifier and a rename', `import { type Bar, Baz as Qux, Plain } from "@pyreon/coolgrid"`],
    ['a type-only import', `import type { Foo } from '@pyreon/coolgrid'`],
    ['a specifier that is not quoted', `import { A } from notquoted`],
    ['a missing closing quote', `import { A } from '@pyreon/coolgrid`],
    ['a specifier broken across lines', `import { A } from '@pyreon/\ncoolgrid'`],
    ['an empty specifier', `import { A } from ''`],
    ['empty braces', `import {} from 'x'`],
    ['a trailing comma and blanks', `import { A, , B, } from 'x'`],
    ['the word import with nothing after it', `import`],
  ])('%s', (_name, fragment) => {
    expect(explain(`/* ${fragment} */${TAIL}`).exitCode).toBe(0)
  })
})

describe('explain — import scanning stays linear on hostile input', () => {
  // The quadratic form needs tens of seconds at this size; the linear scanner
  // needs milliseconds. The bound is loose (a loaded runner is ~10x slower than
  // a laptop) and still orders of magnitude under the broken form.
  const N = 60_000
  const BUDGET_MS = 3000
  const TAIL = `\nexport function E() { return <Text>x</Text> }`

  it.each([
    ['many unclosed import braces', 'import { '.repeat(N)],
    ['one closing brace after many opens', 'import { '.repeat(N) + '} from "x"'],
    ['long whitespace runs inside a specifier list', `import { A${' '.repeat(N)}as${' '.repeat(N)} } from 'x'`],
    ['a huge run of specifiers in one real import', `import { ${'A, '.repeat(N)}Container } from '@pyreon/coolgrid'`],
  ])('%s', (_name, hostile) => {
    const started = performance.now()
    const { exitCode } = explain(`/* ${hostile} */${TAIL}`)
    const elapsed = performance.now() - started
    expect(exitCode).toBe(0)
    expect(elapsed).toBeLessThan(BUDGET_MS)
  })
})
