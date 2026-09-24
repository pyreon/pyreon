/**
 * The import scan is lexical, so two JavaScript shapes used to derail it:
 *
 * - a REGEX literal holding a quote (`/'/`): every `/` read as division, so
 *   the quote opened a string and flipped string/code for the rest of the
 *   line — hiding a real import, or exposing one written inside a string;
 * - a template NESTED in an interpolation (`${`…`}`): the outer template
 *   ended at the inner one's opening backtick, so the inner template's
 *   contents scanned as code.
 *
 * Both were found in the wild: `@pyreon/compiler`'s diagnose catalog reported
 * a phantom dependency until its source was rewritten to dodge the scanner.
 * These specs go through `scanPackageImports`, the entry the detectors use.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { scanPackageImports, stripNonCode } from '../core/imports'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function scan(source: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'loom-lexer-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'src'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }))
  writeFileSync(join(dir, 'src', 'index.ts'), source)
  return [...scanPackageImports(dir).prod.keys()].sort()
}

describe('regex literals', () => {
  it('a quote inside a regex does not hide the import after it', () => {
    expect(scan(`const re = /'/g; import a from 'real-a'\n`)).toEqual(['real-a'])
  })

  it('a quote inside a regex does not expose an import written in a string', () => {
    expect(scan(`const r = /'/; const t = ' import x from "ghost" '\n`)).toEqual([])
  })

  it('a slash inside a character class does not end the regex', () => {
    expect(scan(`const r = /[/']/; import b from 'real-b'\n`)).toEqual(['real-b'])
  })

  it('division is still division', () => {
    // `a / b / c` must not read `/ b /` as a regex; the quote after it is a
    // real string and the import stays visible.
    expect(scan(`const q = a / b / c; import d from 'real-d'\n`)).toEqual(['real-d'])
    expect(scan(`const q = (x) / 2; const s = 'it'; import e from 'real-e'\n`)).toEqual(['real-e'])
  })

  it('a regex after a keyword is a regex', () => {
    expect(scan(`function f() { return /'/.test(s) }\nimport g from 'real-g'\n`)).toEqual(['real-g'])
  })
})

describe('nested templates', () => {
  it("an inner template's text is not code", () => {
    expect(scan("const s = `${ `import q from 'ghost'` }`\n")).toEqual([])
  })

  it('code after a nested template is still scanned', () => {
    expect(scan("const s = `a ${cond ? `b` : 'c'} d`\nimport h from 'real-h'\n")).toEqual(['real-h'])
  })

  it('a regex inside an interpolation is a regex', () => {
    // The shape in @pyreon/compiler's diagnose catalog: the regex's `"` used
    // to open a string inside the interpolation, which swallowed the closing
    // backtick and flipped every template after it.
    const src = 'const c = `key${m?.match(/"([^"]*)"/)?.[1] ? ` ("${m.match(/"([^"]*)"/)?.[1]}")` : \'\'}.`\n' +
      "const f = 'see `import { x } from \"@pyreon/ghost\"`'\nimport k from 'real-k'\n"
    expect(scan(src)).toEqual(['real-k'])
  })

  it('braces and strings inside an interpolation do not end it early', () => {
    const out = stripNonCode("const s = `${ { a: '}' }.a } tail`; after")
    expect(out).toBe("const s = ; after")
  })
})
