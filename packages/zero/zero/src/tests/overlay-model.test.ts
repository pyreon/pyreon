import { describe, expect, it } from 'vitest'
import type { OverlayReport } from '../overlay/model'
import {
  classifyStack,
  extractCodeFrame,
  findFix,
  firstAppFrame,
  formatCopyText,
  isLibraryFile,
  packageFromPath,
  parseStack,
} from '../overlay/model'

describe('parseStack', () => {
  it('reads V8 frames, named, anonymous and async', () => {
    const frames = parseStack(
      [
        'TypeError: x is undefined',
        '    and the message goes on',
        '    at Post (/app/src/routes/post.tsx:14:15)',
        '    at /app/src/util.ts:3:9',
        '    at async Promise.all (index 0)',
        '    at async loader (/app/src/routes/a.tsx:5:20)',
        '    at new Promise (<anonymous>)',
      ].join('\n'),
    )
    expect(frames).toEqual([
      { fn: 'Post', file: '/app/src/routes/post.tsx', line: 14, column: 15 },
      { fn: '', file: '/app/src/util.ts', line: 3, column: 9 },
      { fn: 'loader', file: '/app/src/routes/a.tsx', line: 5, column: 20 },
    ])
  })

  it('reads Firefox and Safari frames', () => {
    expect(parseStack('Post@http://localhost:5173/src/routes/post.tsx?t=1:14:15\n@http://localhost:5173/src/x.ts:1:2')).toEqual([
      { fn: 'Post', file: 'http://localhost:5173/src/routes/post.tsx?t=1', line: 14, column: 15 },
      { fn: '', file: 'http://localhost:5173/src/x.ts', line: 1, column: 2 },
    ])
  })

  it('is empty for a missing stack', () => {
    expect(parseStack(undefined)).toEqual([])
    expect(parseStack('Error: no frames')).toEqual([])
  })

  it('handles a hostile line in linear time and keeps the frames around it', () => {
    const hostile = `at ${' (a'.repeat(50_000)}`
    const hostileGecko = `@${'@a'.repeat(50_000)}`
    const stack = [hostile, hostileGecko, '    at ok (/app/a.ts:1:2)'].join('\n')
    const start = performance.now()
    const frames = parseStack(stack)
    expect(performance.now() - start).toBeLessThan(500)
    expect(frames).toEqual([{ fn: 'ok', file: '/app/a.ts', line: 1, column: 2 }])
  })

  it('keeps a Windows drive letter and a URL port inside the file', () => {
    expect(parseStack('    at fn (C:\\app\\a.ts:3:4)')[0]).toMatchObject({ file: 'C:\\app\\a.ts', line: 3, column: 4 })
    expect(parseStack('fn@http://localhost:5173/src/a.tsx:7:8')[0]).toMatchObject({
      fn: 'fn',
      file: 'http://localhost:5173/src/a.tsx',
      line: 7,
      column: 8,
    })
  })
})

describe('library frames', () => {
  it('server: node_modules, Node internals and files outside the root are library', () => {
    const root = '/home/me/app'
    expect(isLibraryFile('/home/me/app/src/routes/a.tsx', root)).toBe(false)
    expect(isLibraryFile('/home/me/app/node_modules/@pyreon/router/lib/index.js', root)).toBe(true)
    expect(isLibraryFile('node:internal/process/task_queues', root)).toBe(true)
    expect(isLibraryFile('/home/me/pyreon/packages/core/router/src/router.ts', root)).toBe(true)
    // A sibling directory that merely starts with the root's name is outside it.
    expect(isLibraryFile('/home/me/app-other/src/a.ts', root)).toBe(true)
  })

  it('browser: Vite /@fs/, /@id/, /@vite/ and node_modules URLs are library, /src/ is the app', () => {
    const root = 'http://localhost:5173'
    expect(isLibraryFile('http://localhost:5173/src/routes/a.tsx?t=123', root)).toBe(false)
    expect(isLibraryFile('http://localhost:5173/@fs/home/me/pyreon/packages/core/runtime-dom/src/hydrate.ts', root)).toBe(true)
    expect(isLibraryFile('http://localhost:5173/node_modules/.vite/deps/@pyreon_runtime-dom.js?v=1', root)).toBe(true)
    expect(isLibraryFile('http://localhost:5173/@id/__x00__virtual:zero/dev-overlay', root)).toBe(true)
    expect(isLibraryFile('http://localhost:5173/@vite/client', root)).toBe(true)
    expect(isLibraryFile('https://cdn.example.com/lib.js', root)).toBe(true)
  })

  it('names the package of a library frame', () => {
    expect(packageFromPath('/app/node_modules/@pyreon/runtime-server/lib/index.js')).toBe('@pyreon/runtime-server')
    expect(packageFromPath('/app/node_modules/vite/dist/node/chunks/dep.js')).toBe('vite')
    expect(packageFromPath('http://x/node_modules/.vite/deps/@pyreon_runtime-dom.js?v=12')).toBe('@pyreon/runtime-dom')
    expect(packageFromPath('/app/src/a.ts')).toBeUndefined()
  })

  it('classifyStack: app frames show a root-relative position, library frames a package', () => {
    const frames = classifyStack(
      [
        'Error: x',
        '    at Today (http://localhost:5173/src/components/Today.tsx?t=9:3:18)',
        '    at hydrateRoot (http://localhost:5173/node_modules/.vite/deps/@pyreon_runtime-dom.js?v=1:10:2)',
      ].join('\n'),
      { root: 'http://localhost:5173' },
    )
    expect(frames.map((f) => [f.fn, f.library, f.where])).toEqual([
      ['Today', false, 'src/components/Today.tsx:3:18'],
      ['hydrateRoot', true, '@pyreon/runtime-dom'],
    ])
    expect(firstAppFrame(frames)?.fn).toBe('Today')
  })
})

describe('extractCodeFrame', () => {
  const src = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].join('\n')

  it('takes three lines before and two after, marking the failing one', () => {
    const f = extractCodeFrame(src, 5, 1)!
    expect(f.lines.map((l) => `${l.highlight ? '>' : ' '}${l.number}${l.text}`)).toEqual([
      ' 2b',
      ' 3c',
      ' 4d',
      '>5e',
      ' 6f',
      ' 7g',
    ])
    expect(f.caret).toBe(1)
  })

  it('clamps at the start and end of the file', () => {
    expect(extractCodeFrame(src, 1)!.lines.map((l) => l.number)).toEqual([1, 2, 3])
    expect(extractCodeFrame(src, 8)!.lines.map((l) => l.number)).toEqual([5, 6, 7, 8])
  })

  it('is undefined for a line outside the file (stale map after an edit)', () => {
    expect(extractCodeFrame(src, 0)).toBeUndefined()
    expect(extractCodeFrame(src, 99)).toBeUndefined()
  })

  it('expands tabs and moves the caret with them; handles CRLF', () => {
    const f = extractCodeFrame('x\r\n\t\tfoo.bar\r\ny', 2, 7)!
    expect(f.lines[1]!.text).toBe('    foo.bar')
    // column 7 is `b` (two tabs + "foo."); each tab widens by one.
    expect(f.caret).toBe(9)
    expect(f.lines[1]!.text[f.caret! - 1]).toBe('b')
  })

  it('no caret without a column', () => {
    expect(extractCodeFrame(src, 3)!.caret).toBeUndefined()
  })
})

describe('findFix', () => {
  it('returns the diagnose catalog entry when one matches', () => {
    const fix = findFix('ReferenceError: localStorage is not defined')
    expect(fix?.cause).toContain('localStorage')
    expect(fix?.fix).toContain('onMount')
  })

  it('returns undefined when no entry matches: the overlay invents nothing', () => {
    expect(findFix('ECONNREFUSED 127.0.0.1:5432')).toBeUndefined()
    expect(findFix('')).toBeUndefined()
  })
})

describe('formatCopyText', () => {
  const report: OverlayReport = {
    kind: 'loader',
    route: '/account/:id',
    url: '/account/7',
    message: "Cannot read properties of undefined (reading 'name')",
    location: { file: '/app/src/routes/account.tsx', display: 'src/routes/account.tsx', line: 5, column: 34 },
    frame: {
      lines: [
        { number: 4, text: '  const account = await fetchAccount()', highlight: false },
        { number: 5, text: '  return { name: account.profile.name }', highlight: true },
        { number: 6, text: '}', highlight: false },
      ],
      caret: 34,
    },
    stack: [
      { fn: 'loader', file: '/app/src/routes/account.tsx', line: 5, column: 34, library: false, where: 'src/routes/account.tsx:5:34' },
      { fn: 'preload', file: '/x', line: 1, column: 1, library: true, where: '@pyreon/router' },
    ],
  }

  it('is plain text with everything the overlay shows', () => {
    expect(formatCopyText(report)).toBe(
      [
        'Pyreon dev error: Loader threw',
        'Route: /account/:id (loader)',
        'URL: /account/7',
        '',
        "Cannot read properties of undefined (reading 'name')",
        '',
        'File: src/routes/account.tsx:5:34',
        '',
        '  4 |   const account = await fetchAccount()',
        '> 5 |   return { name: account.profile.name }',
        '    |                                  ^',
        '  6 | }',
        '',
        'Stack:',
        '  at loader (src/routes/account.tsx:5:34)',
        '  at preload (@pyreon/router) [library]',
      ].join('\n'),
    )
  })

  it('adds the fix and the hydration details when present', () => {
    const text = formatCopyText({
      kind: 'hydration',
      route: '/',
      message: '[Pyreon] Hydration mismatch (text): expected a, got b at root > p > text',
      details: [
        { label: 'Server HTML', value: '"b"' },
        { label: 'Client render', value: '"a"' },
      ],
      fix: { cause: 'They differ.', fix: 'Make them equal.', fixCode: 'onMount(() => …)' },
      stack: [],
      note: '2 more mismatches on this page; see the console.',
    })
    expect(text).toContain('Route: / (client)')
    expect(text).toContain('Server HTML: "b"\nClient render: "a"')
    expect(text).toContain('How to fix it: They differ.\nMake them equal.\nonMount(() => …)')
    expect(text).not.toContain('Stack:')
    expect(text).not.toContain('File:')
    expect(text.endsWith('2 more mismatches on this page; see the console.')).toBe(true)
  })
})
