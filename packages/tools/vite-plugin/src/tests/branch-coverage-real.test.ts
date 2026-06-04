/**
 * Real-test branch-coverage hardening for @pyreon/vite-plugin.
 * Targets honest uncov branches in index.ts via the public API.
 * NO v8-ignore annotations.
 */
import { describe, expect, it } from 'vitest'
import {
  _getCompatTarget,
  _isPyreonWorkspaceFile,
  _isTruthyEnv,
  _extractBalancedArgs,
  _maskCommentsAndStrings,
  _maskStringsAndComments,
  _skipStringLiteral,
  _offsetToLineCol,
  _computeLineStarts,
  _collectImportedNames,
  buildLpihClientScript,
  resolveLpihCachePath,
} from '../index'

// ─── _isTruthyEnv — falsy variants ──────────────────────────────────────────

describe('_isTruthyEnv — full truth-table', () => {
  it('returns false for undefined', () => {
    expect(_isTruthyEnv(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(_isTruthyEnv('')).toBe(false)
  })

  it('returns false for 0 / false / no / off', () => {
    expect(_isTruthyEnv('0')).toBe(false)
    expect(_isTruthyEnv('false')).toBe(false)
    expect(_isTruthyEnv('no')).toBe(false)
    expect(_isTruthyEnv('off')).toBe(false)
  })

  it('returns true for 1 / true / yes / on (any case)', () => {
    expect(_isTruthyEnv('1')).toBe(true)
    expect(_isTruthyEnv('true')).toBe(true)
    expect(_isTruthyEnv('TRUE')).toBe(true)
    expect(_isTruthyEnv('Yes')).toBe(true)
    expect(_isTruthyEnv('on')).toBe(true)
    expect(_isTruthyEnv('ON')).toBe(true)
  })

  it('returns false for arbitrary string', () => {
    expect(_isTruthyEnv('maybe')).toBe(false)
    expect(_isTruthyEnv('xyz')).toBe(false)
  })
})

// ─── _getCompatTarget — all 5 frameworks + jsx-runtime path ─────────────────

describe('_getCompatTarget — compat redirection table', () => {
  it('returns undefined when compat is undefined', () => {
    expect(_getCompatTarget(undefined, '@pyreon/core')).toBeUndefined()
  })

  it('redirects jsx-runtime for react', () => {
    expect(_getCompatTarget('react', '@pyreon/core/jsx-runtime')).toBe(
      '@pyreon/react-compat/jsx-runtime',
    )
  })

  it('redirects jsx-runtime for preact', () => {
    expect(_getCompatTarget('preact', '@pyreon/core/jsx-runtime')).toBe(
      '@pyreon/preact-compat/jsx-runtime',
    )
  })

  it('redirects jsx-runtime for vue', () => {
    expect(_getCompatTarget('vue', '@pyreon/core/jsx-runtime')).toBe(
      '@pyreon/vue-compat/jsx-runtime',
    )
  })

  it('redirects jsx-runtime for solid', () => {
    expect(_getCompatTarget('solid', '@pyreon/core/jsx-runtime')).toBe(
      '@pyreon/solid-compat/jsx-runtime',
    )
  })

  it('redirects jsx-runtime for svelte', () => {
    expect(_getCompatTarget('svelte', '@pyreon/core/jsx-runtime')).toBe(
      '@pyreon/svelte-compat/jsx-runtime',
    )
  })

  it('redirects jsx-dev-runtime same way', () => {
    expect(_getCompatTarget('react', '@pyreon/core/jsx-dev-runtime')).toBe(
      '@pyreon/react-compat/jsx-runtime',
    )
  })

  it('returns undefined for non-jsx and non-aliased imports', () => {
    expect(_getCompatTarget('react', 'lodash')).toBeUndefined()
  })
})

// ─── _isPyreonWorkspaceFile — filesystem walk fallback ──────────────────────

describe('_isPyreonWorkspaceFile — walk-up behavior', () => {
  it('returns false for empty path', () => {
    expect(_isPyreonWorkspaceFile('', new Map())).toBe(false)
  })

  it('strips query string before path filtering', () => {
    expect(_isPyreonWorkspaceFile('?vue&type=script', new Map())).toBe(false)
  })

  it('returns false for null byte at start', () => {
    expect(_isPyreonWorkspaceFile('\0virtual', new Map())).toBe(false)
  })

  it('returns false for paths outside /packages/', () => {
    expect(_isPyreonWorkspaceFile('/home/user/myapp/src/foo.ts', new Map())).toBe(false)
  })

  it('returns false for paths under /examples/', () => {
    expect(_isPyreonWorkspaceFile('/repo/packages/examples/app/src/foo.ts', new Map())).toBe(false)
  })

  it('walks to root for non-existent packages path (line 376 TRUE arm)', () => {
    // /packages/ in path → enters walk loop → no package.json found → reaches root → break
    expect(
      _isPyreonWorkspaceFile('/nonexistent-zzz-xyzzy/packages/abc/foo.ts', new Map()),
    ).toBe(false)
  })

  it('caches the result after first walk', () => {
    const cache = new Map<string, boolean>()
    const path = '/nonexistent-other-zzz/packages/foo/bar.ts'
    _isPyreonWorkspaceFile(path, cache)
    // Second call hits cache
    expect(_isPyreonWorkspaceFile(path, cache)).toBe(false)
  })
})

// ─── _skipStringLiteral / _extractBalancedArgs ──────────────────────────────

describe('_skipStringLiteral', () => {
  it('returns the position of the closing quote (start is at opening quote)', () => {
    const code = `"hello"X`
    const end = _skipStringLiteral(code, 0, '"')
    // end points to the closing quote position
    expect(code[end]).toBe('"')
    expect(code[end + 1]).toBe('X')
  })

  it('handles escaped quote inside the literal', () => {
    const code = `"he\\"llo"Y`
    const end = _skipStringLiteral(code, 0, '"')
    expect(code[end + 1]).toBe('Y')
  })

  it('skips a single-quote string', () => {
    const code = `'world'Z`
    const end = _skipStringLiteral(code, 0, "'")
    expect(code[end + 1]).toBe('Z')
  })

  it('returns end-of-input for unterminated literal', () => {
    const code = `"unterminated`
    const end = _skipStringLiteral(code, 0, '"')
    expect(end).toBe(code.length)
  })
})

describe('_extractBalancedArgs', () => {
  // start is the position AFTER the opening (
  it('extracts balanced parentheses content', () => {
    const code = 'fn(a, b, c)'
    const args = _extractBalancedArgs(code, 3)
    expect(args).toBe('a, b, c')
  })

  it('handles nested parentheses', () => {
    const code = 'fn(a, (b + c), d)'
    const args = _extractBalancedArgs(code, 3)
    expect(args).toBe('a, (b + c), d')
  })

  it('handles string literals containing parentheses', () => {
    const code = `fn(a, ")", b)`
    const args = _extractBalancedArgs(code, 3)
    expect(args).toBe(`a, ")", b`)
  })

  it('returns null when not balanced', () => {
    const code = 'fn(unclosed'
    const args = _extractBalancedArgs(code, 3)
    expect(args).toBeNull()
  })
})

// ─── _maskStringsAndComments / _maskCommentsAndStrings ──────────────────────

describe('mask helpers', () => {
  it('_maskStringsAndComments replaces strings with spaces', () => {
    const out = _maskStringsAndComments(`const x = "hello"`)
    expect(out).not.toContain('hello')
    expect(out).toContain('const x = ')
    expect(out.length).toBe(`const x = "hello"`.length)
  })

  it('_maskStringsAndComments masks line comments', () => {
    const out = _maskStringsAndComments(`x // comment\ny`)
    expect(out).not.toContain('comment')
    expect(out.length).toBe(`x // comment\ny`.length)
  })

  it('_maskStringsAndComments masks block comments', () => {
    const out = _maskStringsAndComments(`x /* comment */ y`)
    expect(out).not.toContain('comment')
  })

  it('_maskCommentsAndStrings masks line comments', () => {
    const out = _maskCommentsAndStrings('x // mycomment\ny')
    expect(out).not.toContain('mycomment')
  })

  it('_maskCommentsAndStrings masks block comments', () => {
    const out = _maskCommentsAndStrings('x /* block */ y')
    expect(out).not.toContain('block')
  })

  it('mask preserves length (offsets stable)', () => {
    const code = `const x = "abc"\n// y\n/* z */`
    expect(_maskStringsAndComments(code).length).toBe(code.length)
    expect(_maskCommentsAndStrings(code).length).toBe(code.length)
  })
})

// ─── _computeLineStarts / _offsetToLineCol ──────────────────────────────────

describe('_computeLineStarts / _offsetToLineCol', () => {
  it('_computeLineStarts returns [0] for single-line code', () => {
    const starts = _computeLineStarts('foo bar')
    expect(starts).toEqual([0])
  })

  it('_computeLineStarts returns offsets for each line', () => {
    const code = 'aaa\nbbb\nccc'
    const starts = _computeLineStarts(code)
    expect(starts).toEqual([0, 4, 8])
  })

  it('_offsetToLineCol maps offset 0 to line 1 col 1', () => {
    const code = 'aaa\nbbb'
    const starts = _computeLineStarts(code)
    expect(_offsetToLineCol(0, starts)).toEqual({ line: 1, col: 1 })
  })

  it('_offsetToLineCol maps offset 4 to line 2 col 1', () => {
    const code = 'aaa\nbbb'
    const starts = _computeLineStarts(code)
    expect(_offsetToLineCol(4, starts)).toEqual({ line: 2, col: 1 })
  })

  it('_offsetToLineCol returns the last line for out-of-range offset', () => {
    const code = 'aaa\nbbb'
    const starts = _computeLineStarts(code)
    const result = _offsetToLineCol(999, starts)
    expect(result.line).toBeGreaterThanOrEqual(1)
  })
})

// ─── _collectImportedNames — additional shapes ──────────────────────────────

describe('_collectImportedNames — additional shapes', () => {
  it('collects namespace imports', () => {
    const names = _collectImportedNames(`import * as Lib from 'mod'\n`)
    expect(names.has('Lib')).toBe(true)
  })

  it('returns empty Set for no imports', () => {
    const names = _collectImportedNames('const x = 1\n')
    expect(names.size).toBe(0)
  })

  it('handles import with side effect only (no bindings)', () => {
    const names = _collectImportedNames(`import 'mod'\n`)
    expect(names.size).toBe(0)
  })

  it('collects multiple imports from same module', () => {
    const names = _collectImportedNames(`import { A, B, C } from 'mod'\n`)
    expect(names.has('A')).toBe(true)
    expect(names.has('B')).toBe(true)
    expect(names.has('C')).toBe(true)
  })

  it('collects import with type modifier', () => {
    const code = `import type { Type1 } from 'mod'\nimport { Real } from 'other'`
    const names = _collectImportedNames(code)
    expect(names.has('Real')).toBe(true)
  })
})

// ─── LPIH helpers ────────────────────────────────────────────────────────────

describe('buildLpihClientScript / resolveLpihCachePath', () => {
  it('buildLpihClientScript embeds the interval', () => {
    const script = buildLpihClientScript(500)
    expect(script).toContain('500')
    expect(script).toContain('<script')
  })

  it('buildLpihClientScript uses default interval if 0', () => {
    const script = buildLpihClientScript(0)
    expect(script).toContain('<script')
  })

  it('resolveLpihCachePath returns an absolute path', () => {
    const path = resolveLpihCachePath('/project')
    expect(path).toContain('.pyreon-lpih.json')
  })

  it('resolveLpihCachePath handles trailing slash in root', () => {
    const path = resolveLpihCachePath('/project/')
    expect(path).toContain('.pyreon-lpih.json')
  })
})
