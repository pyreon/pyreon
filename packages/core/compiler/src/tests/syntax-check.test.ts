import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import ts from 'typescript'
import { detectPyreonPatterns, detectReactPatterns, findSyntaxErrors } from '../analyze'
import { auditIslands, formatIslandAudit } from '../island-audit'
import { syntaxErrorsIn } from '../syntax-check'

// The detectors parse with an error-recovering parser, so on input they cannot
// read they return [] and every caller turned that into a clean verdict.
// `findSyntaxErrors` is the shared "did this parse?" answer those callers check.

describe('findSyntaxErrors', () => {
  it('returns [] for code that parses', () => {
    expect(findSyntaxErrors(`export const C = () => <div class="x">{1}</div>`)).toEqual([])
    expect(findSyntaxErrors(`const id = <T,>(x: T) => x`, 'a.tsx')).toEqual([])
    expect(findSyntaxErrors('', 'a.tsx')).toEqual([])
  })

  it('reports the first error with a 1-based line and a 0-based column', () => {
    const errs = findSyntaxErrors(`const ok = 1\nexport const C = () => <div>`, 'a.tsx')
    expect(errs[0]).toEqual({
      message: "JSX element 'div' has no corresponding closing tag.",
      line: 2,
      column: 24,
    })
  })

  it('reports stray tokens, prose and TypeScript-only syntax errors', () => {
    expect(findSyntaxErrors('const x = 1 )) }')[0]?.message).toBe("',' expected.")
    expect(findSyntaxErrors('Please write me a counter component.')[0]?.message).toBe(
      'Unexpected keyword or identifier.',
    )
    expect(findSyntaxErrors('function f(a: ): number { return 1 }')[0]).toMatchObject({
      message: 'Type expected.',
      line: 1,
      column: 14,
    })
  })

  it('parses in the mode the filename names', () => {
    // An angle-bracket cast is valid TypeScript and invalid TSX.
    expect(findSyntaxErrors('const a = <number>b', 'a.ts')).toEqual([])
    expect(findSyntaxErrors('const a = <number>b', 'a.tsx').length).toBeGreaterThan(0)
    // JSX is not valid in a .ts file.
    expect(findSyntaxErrors('const a = <div />', 'a.ts').length).toBeGreaterThan(0)
    expect(findSyntaxErrors('const a = <div />', 'a.jsx')).toEqual([])
  })

  it('a markdown-fenced block PARSES (backticks are template literals), so callers must strip fences themselves', () => {
    // This is why `validate` reported "No issues found" for fenced input: the
    // fence turns the code into a chain of tagged template literals, the
    // detectors see a string, and they find nothing.
    const fenced = '```tsx\nconst C = ({ a }) => <div>{a}</div>\n```'
    expect(findSyntaxErrors(fenced)).toEqual([])
    expect(detectPyreonPatterns(fenced)).toEqual([])
    expect(detectReactPatterns(fenced)).toEqual([])
  })

  it('the detectors still return [] for unparseable input (the gap this check closes)', () => {
    const broken = 'export const C = () => <div>'
    expect(detectPyreonPatterns(broken)).toEqual([])
    expect(findSyntaxErrors(broken).length).toBeGreaterThan(0)
  })

  it('syntaxErrorsIn reads an already-parsed file', () => {
    const sf = ts.createSourceFile('a.tsx', 'const x = (', ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
    expect(syntaxErrorsIn(sf).length).toBeGreaterThan(0)
    const ok = ts.createSourceFile('a.tsx', 'const x = 1', ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX)
    expect(syntaxErrorsIn(ok)).toEqual([])
  })
})

describe('auditIslands — unparseable files', () => {
  let root: string
  const write = (rel: string, body: string) => {
    const full = join(root, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, body)
  }
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pyreon-island-syntax-'))
    mkdirSync(join(root, 'packages'), { recursive: true })
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('lists a file that does not parse and does not claim a clean audit', () => {
    write('packages/app/src/ok.ts', 'export const a = 1\n')
    write('packages/app/src/broken.tsx', 'export const C = () => <div>\n')
    const result = auditIslands(root)
    expect(result.summary.unparseableFiles).toEqual([join('packages', 'app', 'src', 'broken.tsx')])
    const text = formatIslandAudit(result)
    expect(text).toContain('1 file could not be parsed')
    expect(text).toContain('broken.tsx')
    expect(text).not.toContain('✓ No island findings')
  })

  it('a .ts file that is only TSX-invalid (angle-bracket cast) is not unparseable', () => {
    write('packages/app/src/cast.ts', 'declare const b: unknown\nexport const a = <number>b\n')
    const result = auditIslands(root)
    expect(result.summary.unparseableFiles).toEqual([])
    expect(formatIslandAudit(result)).toContain('✓ No island findings')
  })
})
