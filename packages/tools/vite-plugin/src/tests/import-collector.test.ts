import { describe, expect, it } from 'vitest'
import {
  _collectImportedNames,
  _extractBalancedArgs,
  _getCompatTarget,
  _handleSsrRequest,
  _isPyreonWorkspaceFile,
  _isTruthyEnv,
  _maskCommentsAndStrings,
  _maskStringsAndComments,
  _skipStringLiteral,
  buildLpihClientScript,
  resolveLpihCachePath,
} from '../index'

describe('_collectImportedNames', () => {
  it('collects named imports', () => {
    const names = _collectImportedNames(`import { A, B } from 'mod'\n`)
    expect(names.has('A')).toBe(true)
    expect(names.has('B')).toBe(true)
  })

  it('uses the LOCAL name when import has rename (A as B)', () => {
    const names = _collectImportedNames(`import { A as Local } from 'mod'\n`)
    expect(names.has('Local')).toBe(true)
    // The original name is not collected — only the local binding.
    expect(names.has('A')).toBe(false)
  })

  it('collects default imports (`import X from "mod"`) — L2064-2066', () => {
    const names = _collectImportedNames(`import Default from 'mod'\n`)
    expect(names.has('Default')).toBe(true)
  })

  it('collects namespace imports (`import * as N from "mod"`) — L2068-2070', () => {
    const names = _collectImportedNames(`import * as NS from 'mod'\n`)
    expect(names.has('NS')).toBe(true)
  })

  it('handles `import type { X }` (TS type-only imports)', () => {
    const names = _collectImportedNames(`import type { TypeA } from 'mod'\n`)
    expect(names.has('TypeA')).toBe(true)
  })

  it('ignores commas / whitespace correctly', () => {
    const names = _collectImportedNames(
      `import { A, B as C, D } from 'm'\nimport E from 'n'\nimport * as F from 'o'\n`,
    )
    expect([...names].sort()).toEqual(['A', 'C', 'D', 'E', 'F'])
  })

  it('returns empty Set for code without imports', () => {
    expect(_collectImportedNames(`const x = 1\nexport function foo() {}\n`).size).toBe(0)
  })

  it('skips empty specifiers (L2055-2056) — trailing comma in named imports', () => {
    const names = _collectImportedNames(`import { A, , B } from 'x'\n`)
    expect(names.has('A')).toBe(true)
    expect(names.has('B')).toBe(true)
    expect(names.size).toBe(2)
  })
})

describe('_maskCommentsAndStrings — block comment branch (L2025-2029)', () => {
  it('replaces block comment content with spaces (preserves newlines)', () => {
    const out = _maskCommentsAndStrings(`const x = /* block\ncomment */ 1`)
    // The comment positions are space-or-newline-only
    expect(out).toContain('const x =')
    expect(out).toContain(' 1')
    expect(out).not.toContain('block')
    expect(out).not.toContain('comment')
  })

  it('replaces line comment content with spaces (L2031-2039)', () => {
    const out = _maskCommentsAndStrings(`const x = 1 // trailing\nconst y = 2`)
    expect(out).not.toContain('trailing')
    expect(out).toContain('const x = 1')
    expect(out).toContain('const y = 2')
  })

  it('handles unterminated block comment (stop = n branch)', () => {
    const out = _maskCommentsAndStrings(`const x = 1 /* never ends`)
    expect(out).toContain('const x = 1')
    expect(out).not.toContain('never')
  })
})

describe('_skipStringLiteral — handles escaped chars (L1355-1356)', () => {
  it('skips an escaped quote character via j+=2 branch', () => {
    // String starts at index 0 (the opening quote), escaped quote inside
    const code = `"escape \\" here"`
    const end = _skipStringLiteral(code, 0, '"')
    // Should land on the FINAL closing quote, not the escaped one
    expect(code[end]).toBe('"')
    expect(end).toBe(code.length - 1)
  })

  it('skips an escaped backslash before quote', () => {
    const code = `"a\\\\" rest`
    const end = _skipStringLiteral(code, 0, '"')
    expect(code[end]).toBe('"')
  })
})

describe('_isPyreonWorkspaceFile (L347-384)', () => {
  it('returns false for empty path / virtual modules (L351)', () => {
    const cache = new Map<string, boolean>()
    expect(_isPyreonWorkspaceFile('', cache)).toBe(false)
    expect(_isPyreonWorkspaceFile('\0virtual', cache)).toBe(false)
  })

  it('returns false for paths outside packages/', () => {
    const cache = new Map<string, boolean>()
    expect(_isPyreonWorkspaceFile('/Users/x/proj/src/foo.ts', cache)).toBe(false)
  })

  it('returns false for paths under examples/ (excluded from workspace detection)', () => {
    const cache = new Map<string, boolean>()
    expect(_isPyreonWorkspaceFile('/abs/packages/examples/demo/src/x.ts', cache)).toBe(false)
  })

  it('uses cached lookup on second call (L363-364)', () => {
    const cache = new Map<string, boolean>()
    // Plant a positive cache entry directly
    cache.set('/abs/packages/core/foo/src', true)
    expect(_isPyreonWorkspaceFile('/abs/packages/core/foo/src/index.ts', cache)).toBe(true)
    // And negative
    const cache2 = new Map<string, boolean>([
      ['/abs/packages/core/bar/src', false],
    ])
    expect(_isPyreonWorkspaceFile('/abs/packages/core/bar/src/index.ts', cache2)).toBe(false)
  })

  it('strips query string from id (L349-350)', () => {
    const cache = new Map<string, boolean>([['/abs/packages/foo/src', false]])
    expect(_isPyreonWorkspaceFile('/abs/packages/foo/src/x.ts?vue&type=script', cache)).toBe(false)
  })
})

describe('_extractBalancedArgs — unbalanced inside rewriteSignals (L1412-1413)', () => {
  it('returns null when arg list never closes', () => {
    // The unbalanced path inside rewriteSignals just continues to the
    // next match. _extractBalancedArgs returning null is the trigger.
    expect(_extractBalancedArgs(`a, b, c\nconst x = 1`, 0)).toBeNull()
  })
})

describe('_handleSsrRequest (L1089-1124)', () => {
  function makeReq(url = '/', headers: Record<string, string | string[]> = {}) {
    return {
      url,
      method: 'GET' as const,
      headers: { host: 'localhost:3000', ...headers },
    } as unknown as import('node:http').IncomingMessage
  }
  function makeRes() {
    const sent: { status: number | null; headers: Record<string, string>; body: string } = {
      status: null,
      headers: {},
      body: '',
    }
    const res = {
      statusCode: 200,
      setHeader(k: string, v: string) {
        sent.headers[k] = v
      },
      end(s: string) {
        sent.body = s
        sent.status = (res as { statusCode: number }).statusCode
      },
    }
    return { res: res as unknown as import('node:http').ServerResponse, sent }
  }

  it('calls next() when entry has no callable handler/default (L1100-1102)', async () => {
    const server = {
      async ssrLoadModule() {
        return { somethingElse: 'not-a-function' }
      },
    } as unknown as import('vite').ViteDevServer
    let nextCalled = false
    await _handleSsrRequest(server, '/entry.ts', '/', makeReq(), makeRes().res, () => {
      nextCalled = true
    })
    expect(nextCalled).toBe(true)
  })

  it('invokes handler + writes html with status + headers (L1105-1124)', async () => {
    const server = {
      async ssrLoadModule() {
        return {
          handler: () =>
            new Response('<html>ok</html>', {
              status: 200,
              headers: { 'x-custom': 'pyreon' },
            }),
        }
      },
      async transformIndexHtml(_: string, html: string) {
        return html.replace('ok', 'transformed')
      },
    } as unknown as import('vite').ViteDevServer
    const { res, sent } = makeRes()
    await _handleSsrRequest(server, '/entry.ts', '/page', makeReq('/page'), res, () => {})
    expect(sent.body).toContain('transformed')
    expect(sent.headers['x-custom']).toBe('pyreon')
    expect(sent.status).toBe(200)
  })

  it('falls back to `default` when `handler` is undefined', async () => {
    const server = {
      async ssrLoadModule() {
        return { default: () => new Response('<html>defaulted</html>', { status: 201 }) }
      },
      async transformIndexHtml(_: string, html: string) {
        return html
      },
    } as unknown as import('vite').ViteDevServer
    const { res, sent } = makeRes()
    await _handleSsrRequest(server, '/x.ts', '/', makeReq(), res, () => {})
    expect(sent.body).toContain('defaulted')
    expect(sent.status).toBe(201)
  })

  it('handles array-valued headers (joins via ", ")', async () => {
    const server = {
      async ssrLoadModule() {
        return {
          handler: (req: Request) =>
            new Response(`got-${req.headers.get('x-multi')}`, { status: 200 }),
        }
      },
      async transformIndexHtml(_: string, html: string) {
        return html
      },
    } as unknown as import('vite').ViteDevServer
    const { res, sent } = makeRes()
    await _handleSsrRequest(
      server,
      '/x.ts',
      '/',
      makeReq('/', { 'x-multi': ['a', 'b'] }),
      res,
      () => {},
    )
    expect(sent.body).toContain('a, b')
  })
})

describe('_isTruthyEnv (L488-492)', () => {
  it('returns false for undefined', () => {
    expect(_isTruthyEnv(undefined)).toBe(false)
  })
  it('returns true for "1" / "true" / "yes" / "on" (case-insensitive)', () => {
    for (const v of ['1', 'true', 'TRUE', 'True', 'yes', 'YES', 'on', 'ON']) {
      expect(_isTruthyEnv(v)).toBe(true)
    }
  })
  it('returns false for other strings', () => {
    for (const v of ['0', 'false', 'no', 'off', '', ' ', 'foo']) {
      expect(_isTruthyEnv(v)).toBe(false)
    }
  })
})

describe('buildLpihClientScript / resolveLpihCachePath', () => {
  it('buildLpihClientScript returns a <script type="module"> with the configured interval', () => {
    const s = buildLpihClientScript(2500)
    expect(s).toContain('<script type="module"')
    expect(s).toContain('2500')
  })

  it('resolveLpihCachePath joins projectRoot with the canonical .pyreon-lpih.json filename', () => {
    const p = resolveLpihCachePath('/abs/proj')
    expect(p).toContain('.pyreon-lpih.json')
    expect(p).toContain('/abs/proj')
  })
})

describe('_maskStringsAndComments (the OTHER mask function, L1607)', () => {
  it('masks block + line comments + strings', () => {
    const out = _maskStringsAndComments(
      `const x = /* block */ 1 // line\nconst y = "str"`,
    )
    expect(out).toContain('const x =')
    expect(out).toContain('const y =')
    expect(out).not.toContain('block')
    expect(out).not.toContain('line')
    expect(out).not.toContain('str')
  })
})

describe('_getCompatTarget (L390-404)', () => {
  it('returns undefined when compat is undefined', () => {
    expect(_getCompatTarget(undefined, '@pyreon/core')).toBeUndefined()
  })

  it('returns undefined for non-aliased non-jsx-runtime imports', () => {
    expect(_getCompatTarget('react', 'some-random-module')).toBeUndefined()
  })

  it('redirects @pyreon/core/jsx-runtime to compat per framework (L396-401)', () => {
    expect(_getCompatTarget('react', '@pyreon/core/jsx-runtime')).toBe('@pyreon/react-compat/jsx-runtime')
    expect(_getCompatTarget('preact', '@pyreon/core/jsx-runtime')).toBe('@pyreon/preact-compat/jsx-runtime')
    expect(_getCompatTarget('vue', '@pyreon/core/jsx-runtime')).toBe('@pyreon/vue-compat/jsx-runtime')
    expect(_getCompatTarget('solid', '@pyreon/core/jsx-runtime')).toBe('@pyreon/solid-compat/jsx-runtime')
    expect(_getCompatTarget('svelte', '@pyreon/core/jsx-runtime')).toBe('@pyreon/svelte-compat/jsx-runtime')
  })

  it('redirects jsx-dev-runtime too', () => {
    expect(_getCompatTarget('react', '@pyreon/core/jsx-dev-runtime')).toBe('@pyreon/react-compat/jsx-runtime')
  })
})

describe('_extractBalancedArgs — handles unbalanced parens (L1377)', () => {
  it('returns null on unclosed parens', () => {
    expect(_extractBalancedArgs(`a, b, c`, 0)).toBeNull()
  })

  it('returns the slice when parens close', () => {
    // Caller passes `start` pointing past the OPENING paren; depth starts at 1.
    expect(_extractBalancedArgs(`a, b)`, 0)).toBe('a, b')
  })

  it('handles nested parens correctly', () => {
    expect(_extractBalancedArgs(`fn(x), y)`, 0)).toBe('fn(x), y')
  })

  it('handles strings containing closing parens (skipStringLiteral branch)', () => {
    expect(_extractBalancedArgs(`"a)b", c)`, 0)).toBe('"a)b", c')
  })
})

