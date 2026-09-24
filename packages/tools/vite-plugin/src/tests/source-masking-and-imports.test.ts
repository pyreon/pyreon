/**
 * The plugin's hand-rolled source scanners: string/comment masking, offset
 * mapping, and imported-name collection.
 *
 * These sit under every transform this plugin performs, and they are the
 * exact shape the repo's anti-pattern catalog warns about twice over:
 *
 *   * *"a hand-rolled parser over a language with escape contexts (strings,
 *     comments) MUST model those contexts before trusting its bracket
 *     arithmetic"* — the masking pass exists so a later regex or
 *     brace-count never sees a `//` inside a string, or a quote inside a
 *     comment. Get it wrong and the plugin transforms a code-shaped
 *     STRING, or skips real code it mistook for a comment. Both edit the
 *     user's source silently.
 *   * *"a transform that writes imports into user source must reconcile
 *     with every name already in that scope"* — the `_rp` collision class,
 *     where an injected `import { cx }` next to a hand-written one is a
 *     hard "Identifier has already been declared" at build time.
 *
 * Masking must also PRESERVE OFFSETS: the output is indexed against the
 * original source, so a mask that shortens or lengthens the text moves
 * every position after it and the transform edits the wrong bytes.
 * Newlines survive for the same reason — line numbers in diagnostics.
 */
import { describe, expect, it } from 'vitest'
import {
  _collectImportedNames,
  _computeLineStarts,
  _maskComments,
  _maskStringsAndComments,
  _offsetToLineCol,
} from '../index'

/** Masking must never change the length — offsets index the original. */
const sameLength = (src: string, masked: string): void => {
  expect(masked.length, 'masking must preserve every offset').toBe(src.length)
}

describe('masking hides strings and comments, and only those', () => {
  it('leaves ordinary code untouched', () => {
    // The control. A mask that blanked everything would satisfy every
    // "does not see X" spec below.
    const src = 'const a = b + c'
    expect(_maskStringsAndComments(src)).toBe(src)
  })

  it('blanks a line comment but keeps its newline', () => {
    // The newline is what keeps line numbers right in every diagnostic
    // the plugin emits downstream.
    const src = 'a // effect(() => x())\nb'
    const out = _maskStringsAndComments(src)

    sameLength(src, out)
    expect(out, 'the commented call must be invisible').not.toContain('effect')
    expect(out.split('\n')).toHaveLength(2)
  })

  it('blanks a block comment across lines, preserving each newline', () => {
    const src = 'a /* line1\nline2\nline3 */ b'
    const out = _maskStringsAndComments(src)

    sameLength(src, out)
    expect(out).not.toContain('line2')
    expect(out.split('\n'), 'three lines in, three out').toHaveLength(3)
  })

  it('blanks a string, so code-shaped text inside it is not transformed', () => {
    // A recipe catalogue carrying import lines as strings is the real
    // case the catalog cites.
    const src = `const s = "import { signal } from '@pyreon/reactivity'"`
    const out = _maskStringsAndComments(src)

    sameLength(src, out)
    expect(out).not.toContain('signal')
    expect(out.startsWith('const s = '), 'the code around it survives').toBe(true)
  })

  it('honours a BACKSLASH escape inside a string', () => {
    // `"a\\"b"` is one string. A scanner that ends it at the escaped
    // quote treats the rest of the line as code — and the next real quote
    // then opens a string that swallows the code after it.
    const src = 'const s = "a\\"b"; const t = 1'
    const out = _maskStringsAndComments(src)

    sameLength(src, out)
    expect(out, 'the trailing code must survive as code').toContain('const t = 1')
  })

  it('does not see a comment marker INSIDE a string', () => {
    const src = 'const url = "http://x.dev"; const after = 1'
    const out = _maskStringsAndComments(src)

    sameLength(src, out)
    expect(out, 'the // in the URL must not comment out the rest').toContain('const after = 1')
  })

  it('does not see a quote inside a COMMENT', () => {
    // The mirror. An unbalanced quote in a comment would otherwise open a
    // string that runs to the next quote anywhere in the file.
    const src = "// it's fine\nconst after = 1"
    const out = _maskStringsAndComments(src)

    sameLength(src, out)
    expect(out).toContain('const after = 1')
  })

  it('handles a template literal, including an unterminated one', () => {
    const src = 'const t = `hello ${name} there`; const after = 1'
    const out = _maskStringsAndComments(src)

    sameLength(src, out)
    expect(out).toContain('const after = 1')

    // Unterminated: the scanner must run to the end rather than looping.
    expect(() => _maskStringsAndComments('const t = `never closed')).not.toThrow()
  })

  it('handles an unterminated string and an unterminated block comment', () => {
    // Both are ordinary mid-edit states in a dev server, and both are
    // ways to hang a naive scanner.
    for (const src of ['const s = "never closed', 'a /* never closed']) {
      expect(() => _maskStringsAndComments(src), src).not.toThrow()
      sameLength(src, _maskStringsAndComments(src))
    }
  })
})

describe('_maskComments keeps strings intact', () => {
  it('blanks comments but leaves string CONTENT readable', () => {
    // The two maskers differ deliberately: one is for passes that must
    // still read string contents (an import specifier is a string).
    const src = `import x from './a' // comment`
    const out = _maskComments(src)

    sameLength(src, out)
    expect(out, 'the specifier must survive').toContain('./a')
    expect(out).not.toContain('comment')
  })
})

describe('offset → line/col mapping', () => {
  it('maps the first character to 1:1', () => {
    // 0-based anywhere here sends an editor to the wrong place with
    // confidence.
    expect(_offsetToLineCol(0, _computeLineStarts('abc'))).toEqual({ line: 1, col: 1 })
  })

  it('maps across newlines', () => {
    const src = 'ab\ncd\nef'
    const starts = _computeLineStarts(src)

    expect(_offsetToLineCol(3, starts), 'first char of line 2').toEqual({ line: 2, col: 1 })
    expect(_offsetToLineCol(4, starts)).toEqual({ line: 2, col: 2 })
    expect(_offsetToLineCol(6, starts), 'first char of line 3').toEqual({ line: 3, col: 1 })
  })

  it('counts one line start per newline, plus the implicit first', () => {
    expect(_computeLineStarts('a\nb\nc')).toEqual([0, 2, 4])
    expect(_computeLineStarts(''), 'an empty file is still line 1').toEqual([0])
  })

  it('clamps an offset past the end rather than returning NaN', () => {
    const starts = _computeLineStarts('ab')
    const { line, col } = _offsetToLineCol(999, starts)
    expect(Number.isFinite(line) && Number.isFinite(col)).toBe(true)
    expect(line).toBe(1)
  })
})

describe('imported-name collection guards the injection collision', () => {
  it('collects named imports', () => {
    expect([..._collectImportedNames(`import { a, b } from 'm'`)].sort()).toEqual(['a', 'b'])
  })

  it('collects the LOCAL name of a renamed import', () => {
    // `import { cx as classNames }` binds `classNames`. Recording `cx`
    // instead would let an injected `cx` collide with nothing it can see
    // — and miss the name that IS taken.
    expect([..._collectImportedNames(`import { cx as classNames } from 'm'`)]).toEqual([
      'classNames',
    ])
  })

  it('collects a default and a namespace import', () => {
    const names = _collectImportedNames(
      `import React from 'react'\nimport * as ns from 'm'`,
    )
    expect(names.has('React')).toBe(true)
    expect(names.has('ns')).toBe(true)
  })

  it('collects from a TYPE-only import too', () => {
    // `import type { X }` still binds `X` in the module scope, so an
    // injected `X` collides just as hard.
    expect(_collectImportedNames(`import type { Props } from 'm'`).has('Props')).toBe(true)
  })

  it('handles multi-line and multiple import statements', () => {
    const names = _collectImportedNames(
      `import {\n  a,\n  b as c,\n} from 'm'\nimport d from 'n'`,
    )
    expect([...names].sort()).toEqual(['a', 'c', 'd'])
  })

  it('returns an empty set for a file with no imports', () => {
    expect(_collectImportedNames('const a = 1').size).toBe(0)
  })
})
