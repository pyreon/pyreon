/**
 * Live Program Inlay Hints — LSP integration test.
 *
 * Drives the JSON-RPC contract layer with a real LPIH cache file set
 * via `PYREON_LPIH_CACHE` env var. Proves the round-trip works:
 *   1. Cache file → `_readLpihCache` (file IO + JSON parse + validation)
 *   2. `computeReactivityHints({ liveFires })` → merges via @pyreon/compiler
 *   3. `_handleMessage('textDocument/inlayHint')` → returns merged hints
 *
 * Bisect-verified: removing the LPIH wiring from the handler causes
 * `live hints render with 🔥 prefix at creation line` to fail with
 * "expected 0 hints to be > 0".
 */
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _LPIH_CACHE_MAX_BYTES,
  _LPIH_STALE_AFTER_MS,
  _handleMessage,
  _readLpihCache,
  _resetOpenDocuments,
  _uriToFilePath,
  computeReactivityHints,
} from '../lsp/index'

let TMP_DIR: string
let CACHE_PATH: string

beforeAll(async () => {
  // Warm the lazy @pyreon/compiler import once (same as lsp-reactivity.test.ts).
  await computeReactivityHints('warmup.tsx', 'const x = 1')
  TMP_DIR = mkdtempSync(join(tmpdir(), 'lpih-lsp-test-'))
  CACHE_PATH = join(TMP_DIR, 'fires.json')
}, 180_000)

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true })
})

beforeEach(() => {
  _resetOpenDocuments()
  delete process.env.PYREON_LPIH_CACHE
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.PYREON_LPIH_CACHE
})

describe('LPIH cache file reader', () => {
  it('returns [] when path is undefined', async () => {
    expect(await _readLpihCache(undefined)).toEqual([])
  })

  it('returns [] when file does not exist', async () => {
    expect(await _readLpihCache('/no/such/file.json')).toEqual([])
  })

  it('returns [] when file is malformed JSON', async () => {
    writeFileSync(CACHE_PATH, 'not json', 'utf8')
    expect(await _readLpihCache(CACHE_PATH)).toEqual([])
  })

  it('returns [] when shape is wrong (missing fires array)', async () => {
    writeFileSync(CACHE_PATH, JSON.stringify({ wrong: [] }), 'utf8')
    expect(await _readLpihCache(CACHE_PATH)).toEqual([])
  })

  it('parses valid cache file', async () => {
    writeFileSync(
      CACHE_PATH,
      JSON.stringify({
        fires: [
          { file: 'app.tsx', line: 5, count: 100, kind: 'signal' },
          { file: 'app.tsx', line: 7, count: 30, kind: 'effect' },
        ],
      }),
      'utf8',
    )
    const out = await _readLpihCache(CACHE_PATH)
    expect(out).toHaveLength(2)
    expect(out[0]?.count).toBe(100)
    expect(out[1]?.kind).toBe('effect')
  })

  it('filters out malformed entries', async () => {
    writeFileSync(
      CACHE_PATH,
      JSON.stringify({
        fires: [
          { file: 'app.tsx', line: 5, count: 100 }, // valid
          { file: 'app.tsx', line: 'x' }, // line not number
          { count: 5 }, // missing file
          'not an object', // wrong shape
          null,
        ],
      }),
      'utf8',
    )
    const out = await _readLpihCache(CACHE_PATH)
    expect(out).toHaveLength(1)
    expect(out[0]?.line).toBe(5)
  })
})

describe('computeReactivityHints with liveFires', () => {
  it('returns ONLY static hints when no liveFires', async () => {
    const code = `function App() {
  const count = signal(0)
  return <div>{count()}</div>
}`
    const { inlayHints } = await computeReactivityHints('app.tsx', code)
    // At least the {count()} reactive read should produce a hint.
    expect(inlayHints.some((h) => h.label === 'live')).toBe(true)
    // No 🔥 hints because no live fires provided.
    expect(inlayHints.some((h) => h.label.includes('🔥'))).toBe(false)
  })

  it('adds creation-site 🔥 hints when liveFires provided', async () => {
    const code = `function App() {
  const count = signal(0)
  return <div>{count()}</div>
}`
    const { inlayHints } = await computeReactivityHints('app.tsx', code, {
      liveFires: [{ file: 'app.tsx', line: 2, count: 129, kind: 'signal' }],
    })
    const liveHint = inlayHints.find((h) => h.label.includes('🔥'))
    expect(liveHint).toBeDefined()
    expect(liveHint?.label).toContain('signal fired 129×')
    // Hint is at the creation line (line 2 → LSP line 1).
    expect(liveHint?.position.line).toBe(1)
  })

  it('coexists with static reactive hints (additive)', async () => {
    const code = `function App() {
  const count = signal(0)
  return <div>{count()}</div>
}`
    const { inlayHints } = await computeReactivityHints('app.tsx', code, {
      liveFires: [{ file: 'app.tsx', line: 2, count: 5, kind: 'signal' }],
    })
    const staticLive = inlayHints.filter((h) => h.label === 'live').length
    const fireLive = inlayHints.filter((h) => h.label.includes('🔥')).length
    expect(staticLive).toBeGreaterThanOrEqual(1)
    expect(fireLive).toBe(1)
  })

  it('renders multiple creation-site hints for multiple signals', async () => {
    const code = `function App() {
  const a = signal(0)
  const b = signal(0)
  return <div>{a()}{b()}</div>
}`
    const { inlayHints } = await computeReactivityHints('app.tsx', code, {
      liveFires: [
        { file: 'app.tsx', line: 2, count: 10, kind: 'signal' },
        { file: 'app.tsx', line: 3, count: 25, kind: 'signal' },
      ],
    })
    const fireHints = inlayHints.filter((h) => h.label.includes('🔥'))
    expect(fireHints).toHaveLength(2)
  })

  it('drops fires from other files', async () => {
    const { inlayHints } = await computeReactivityHints(
      'app.tsx',
      'const x = 1',
      {
        liveFires: [{ file: 'other.tsx', line: 2, count: 100, kind: 'signal' }],
      },
    )
    expect(inlayHints.some((h) => h.label.includes('🔥'))).toBe(false)
  })
})

describe('LPIH defensive limits', () => {
  it('rejects cache files larger than _LPIH_CACHE_MAX_BYTES', async () => {
    // Build a payload that EXCEEDS the limit. We need to write a file
    // whose stat.size > _LPIH_CACHE_MAX_BYTES (1 MB by default).
    const oversized = JSON.stringify({
      fires: Array.from({ length: 200_000 }, (_, i) => ({
        file: '/abs/very/long/path/that/inflates/the/file/size.tsx',
        line: i + 1,
        count: i,
        kind: 'signal',
      })),
    })
    expect(oversized.length).toBeGreaterThan(_LPIH_CACHE_MAX_BYTES)
    writeFileSync(CACHE_PATH, oversized, 'utf8')
    const fires = await _readLpihCache(CACHE_PATH)
    expect(fires).toEqual([])
  })

  it('accepts cache files at the limit', async () => {
    // Just under the limit. Should parse normally.
    writeFileSync(
      CACHE_PATH,
      JSON.stringify({
        fires: [
          { file: '/abs/app.tsx', line: 1, count: 5, kind: 'signal' },
        ],
      }),
      'utf8',
    )
    const fires = await _readLpihCache(CACHE_PATH)
    expect(fires).toHaveLength(1)
  })

  it('returns [] when cache file is older than _LPIH_STALE_AFTER_MS', async () => {
    writeFileSync(
      CACHE_PATH,
      JSON.stringify({
        fires: [
          { file: '/abs/app.tsx', line: 1, count: 100, kind: 'signal' },
        ],
      }),
      'utf8',
    )
    // Set mtime to 10 minutes ago (well past the 5-minute threshold).
    const tenMinutesAgo = (Date.now() - 10 * 60 * 1000) / 1000
    utimesSync(CACHE_PATH, tenMinutesAgo, tenMinutesAgo)
    const fires = await _readLpihCache(CACHE_PATH)
    expect(fires).toEqual([])
  })

  it('accepts fresh cache files within the stale threshold', async () => {
    writeFileSync(
      CACHE_PATH,
      JSON.stringify({
        fires: [
          { file: '/abs/app.tsx', line: 1, count: 100, kind: 'signal' },
        ],
      }),
      'utf8',
    )
    // mtime is current (writeFileSync just set it).
    const fires = await _readLpihCache(CACHE_PATH)
    expect(fires).toHaveLength(1)
  })

  it('honors injected now() for deterministic stale-filter tests', async () => {
    writeFileSync(
      CACHE_PATH,
      JSON.stringify({
        fires: [
          { file: '/abs/app.tsx', line: 1, count: 5, kind: 'signal' },
        ],
      }),
      'utf8',
    )
    // Simulate "now" 100 hours in the future — file appears very stale.
    const futureNow = (): number => Date.now() + 100 * 60 * 60 * 1000
    const fires = await _readLpihCache(CACHE_PATH, futureNow)
    expect(fires).toEqual([])
  })
})

describe('_uriToFilePath — cross-platform file:// handling', () => {
  it('strips file:// for POSIX paths', () => {
    expect(_uriToFilePath('file:///Users/x/proj/app.tsx')).toBe('/Users/x/proj/app.tsx')
  })

  it('strips file:// + leading slash for Windows paths', () => {
    // node:url's fileURLToPath returns /C:/proj/app.tsx for file:///C:/proj/app.tsx
    // The regex strips the leading / before the drive letter.
    expect(_uriToFilePath('file:///C:/proj/app.tsx')).toBe('C:/proj/app.tsx')
  })

  it('passes non-file:// URIs through unchanged', () => {
    expect(_uriToFilePath('/abs/path/app.tsx')).toBe('/abs/path/app.tsx')
    expect(_uriToFilePath('workspace://app.tsx')).toBe('workspace://app.tsx')
  })

  it('handles percent-encoded paths', () => {
    expect(_uriToFilePath('file:///Users/with%20space/app.tsx')).toBe(
      '/Users/with space/app.tsx',
    )
  })
})

describe('LSP transport — full JSON-RPC roundtrip with LPIH cache', () => {
  it('inlayHint request reads PYREON_LPIH_CACHE and emits 🔥 hints', async () => {
    writeFileSync(
      CACHE_PATH,
      JSON.stringify({
        fires: [
          { file: '/abs/app.tsx', line: 2, count: 240, kind: 'signal' },
        ],
      }),
      'utf8',
    )
    process.env.PYREON_LPIH_CACHE = CACHE_PATH

    const code = `function App() {
  const count = signal(0)
  return <div>{count()}</div>
}`
    await _handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' })
    await _handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///abs/app.tsx', text: code } },
    })

    const res = await _handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'textDocument/inlayHint',
      params: { textDocument: { uri: 'file:///abs/app.tsx' } },
    })
    const hints = res?.result as Array<{ label: string; position: { line: number } }>
    const fireHint = hints.find((h) => h.label.includes('🔥'))
    expect(fireHint).toBeDefined()
    expect(fireHint?.label).toContain('240×')
    expect(fireHint?.position.line).toBe(1) // line 2 → LSP line 1
  })

  it('omits 🔥 hints when PYREON_LPIH_CACHE is unset', async () => {
    const code = `function App() {
  const count = signal(0)
  return <div>{count()}</div>
}`
    await _handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' })
    await _handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///abs/app.tsx', text: code } },
    })

    const res = await _handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'textDocument/inlayHint',
      params: { textDocument: { uri: 'file:///abs/app.tsx' } },
    })
    const hints = res?.result as Array<{ label: string }>
    expect(hints.some((h) => h.label.includes('🔥'))).toBe(false)
    // Static reactive hints still present.
    expect(hints.some((h) => h.label === 'live')).toBe(true)
  })

  it('degrades silently when cache file is malformed', async () => {
    writeFileSync(CACHE_PATH, 'malformed', 'utf8')
    process.env.PYREON_LPIH_CACHE = CACHE_PATH

    const code = `function App() {
  const count = signal(0)
  return <div>{count()}</div>
}`
    await _handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' })
    await _handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///abs/app.tsx', text: code } },
    })

    const res = await _handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'textDocument/inlayHint',
      params: { textDocument: { uri: 'file:///abs/app.tsx' } },
    })
    const hints = res?.result as Array<{ label: string }>
    // No 🔥 hints (malformed cache = empty fires).
    expect(hints.some((h) => h.label.includes('🔥'))).toBe(false)
    // Static analysis still works.
    expect(hints.some((h) => h.label === 'live')).toBe(true)
  })

  it('honors visible-range filter even with LPIH active', async () => {
    writeFileSync(
      CACHE_PATH,
      JSON.stringify({
        fires: [
          { file: '/abs/app.tsx', line: 2, count: 10, kind: 'signal' },
          { file: '/abs/app.tsx', line: 10, count: 20, kind: 'signal' },
        ],
      }),
      'utf8',
    )
    process.env.PYREON_LPIH_CACHE = CACHE_PATH

    // Build a 12-line file with signals on lines 2 and 10.
    const code = `function App() {
  const a = signal(0)
  // line 3
  // line 4
  // line 5
  // line 6
  // line 7
  // line 8
  // line 9
  const b = signal(0)
  // line 11
  return <div>{a()}{b()}</div>
}`
    await _handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' })
    await _handleMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///abs/app.tsx', text: code } },
    })

    // Only ask for hints in lines 0-3 (LSP 0-based).
    const res = await _handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'textDocument/inlayHint',
      params: {
        textDocument: { uri: 'file:///abs/app.tsx' },
        range: { start: { line: 0 }, end: { line: 3 } },
      },
    })
    const hints = res?.result as Array<{ label: string; position: { line: number } }>
    const fireHints = hints.filter((h) => h.label.includes('🔥'))
    // Only the line-2 (LSP line 1) fire is in range.
    expect(fireHints).toHaveLength(1)
    expect(fireHints[0]?.position.line).toBe(1)
  })
})
