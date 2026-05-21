/**
 * R4 — build-time LPIH source-location injection.
 *
 * The Vite plugin rewrites `const x = signal(0)` → `const x = signal(0,
 * { name: "x", __sourceLocation: { file, line, col } })` so the runtime
 * skips the `new Error().stack` capture in `_rdRegister` — saves
 * ~2.2µs per signal creation when devtools is active.
 *
 * Bisect-verified: removing the `__sourceLocation` literal from the
 * injection makes the line/col-correctness tests fail with
 * "expected to include __sourceLocation".
 */
import { describe, expect, it } from 'vitest'
import pyreonPlugin from '../index'
import { _computeLineStarts, _offsetToLineCol } from '../index'

type ConfigHook = (
  userConfig: Record<string, unknown>,
  env: { command: string; isSsrBuild?: boolean },
) => Record<string, unknown>

function createPlugin() {
  const plugin = pyreonPlugin()
  // Simulate Vite calling config() so isBuild / projectRoot are set
  ;(plugin.config as unknown as ConfigHook)({}, { command: 'serve' })
  return plugin
}

async function runTransform(code: string, id: string): Promise<{ code: string } | undefined> {
  const plugin = createPlugin()
  const transformHook = plugin.transform as (
    this: {
      warn: (msg: string) => void
      resolve: (id: string, importer?: string, options?: { skipSelf: boolean }) => Promise<{ id: string } | null>
    },
    code: string,
    id: string,
  ) => Promise<{ code: string; map: null } | undefined>
  return await transformHook.call(
    {
      warn: () => undefined,
      resolve: async () => null,
    },
    code,
    id,
  )
}

const ctx = { transform: runTransform }

// Helper: extract the FIRST `__sourceLocation` literal from transformed code.
function extractLoc(code: string): { file: string; line: number; col: number } | null {
  const m = code.match(
    /__sourceLocation: \{ file: ("(?:[^"\\]|\\.)*"), line: (\d+), col: (\d+) \}/,
  )
  if (!m) return null
  return {
    file: JSON.parse(m[1] ?? '"?"'),
    line: parseInt(m[2] ?? '0', 10),
    col: parseInt(m[3] ?? '0', 10),
  }
}

describe('_computeLineStarts', () => {
  it('starts with offset 0 for line 1', () => {
    expect(_computeLineStarts('hello')).toEqual([0])
  })

  it('records each newline position', () => {
    const code = 'line1\nline2\nline3'
    expect(_computeLineStarts(code)).toEqual([0, 6, 12])
  })

  it('handles empty file', () => {
    expect(_computeLineStarts('')).toEqual([0])
  })

  it('handles trailing newline', () => {
    expect(_computeLineStarts('a\n')).toEqual([0, 2])
  })
})

describe('_offsetToLineCol', () => {
  const starts = _computeLineStarts('line1\nline2\nline3')

  it('offset 0 → line 1 col 1', () => {
    expect(_offsetToLineCol(0, starts)).toEqual({ line: 1, col: 1 })
  })

  it('offset 5 → line 1 col 6 (last char of line 1)', () => {
    expect(_offsetToLineCol(5, starts)).toEqual({ line: 1, col: 6 })
  })

  it('offset 6 → line 2 col 1 (first char after newline)', () => {
    expect(_offsetToLineCol(6, starts)).toEqual({ line: 2, col: 1 })
  })

  it('offset 12 → line 3 col 1', () => {
    expect(_offsetToLineCol(12, starts)).toEqual({ line: 3, col: 1 })
  })

  it('offset at end → last line correct col', () => {
    expect(_offsetToLineCol(16, starts)).toEqual({ line: 3, col: 5 })
  })
})

describe('R4 — injection at function-scope signal() call sites', () => {
  // NOTE: module-scope signals get rewritten to `__hmr_signal(...)` by
  // the HMR pass FIRST. Location injection runs after and skips them
  // (regex matches `signal(` not `__hmr_signal(`). Module-scope signals
  // still pay the runtime stack-capture cost — documented limitation,
  // tracked as a follow-up.

  it('injects __sourceLocation with the resolved module path', async () => {
    const code = `import { signal } from "@pyreon/reactivity"
export function Counter() {
  const count = signal(0)
  return count
}
`
    const result = await ctx.transform(code, '/abs/path/app.tsx')
    expect(result).toBeDefined()
    expect(result!.code).toContain('__sourceLocation')
    const loc = extractLoc(result!.code)
    expect(loc?.file).toBe('/abs/path/app.tsx')
  })

  it('injects correct line for signal call inside function', async () => {
    const code = `import { signal } from "@pyreon/reactivity"
export function Counter() {
  const count = signal(0)
  return count
}
`
    const result = await ctx.transform(code, 'app.tsx')
    const loc = extractLoc(result!.code)
    expect(loc?.line).toBe(3) // `  const count = signal(0)` is line 3
  })

  it('injects different locations for signals on different lines', async () => {
    const code = `import { signal } from "@pyreon/reactivity"
export function Multi() {
  const a = signal(0)
  const b = signal(0)
  const c = signal(0)
  return [a, b, c]
}
`
    const result = await ctx.transform(code, 'app.tsx')
    const locs = [...result!.code.matchAll(/line: (\d+)/g)].map((m) => parseInt(m[1] ?? '0', 10))
    expect(locs).toContain(3)
    expect(locs).toContain(4)
    expect(locs).toContain(5)
  })

  it('skips signals that already have an options arg', async () => {
    const code = `import { signal } from "@pyreon/reactivity"
export function App() {
  const a = signal(0, { name: "custom" })
  return a
}
`
    const result = await ctx.transform(code, 'app.tsx')
    expect(result!.code).not.toContain('__sourceLocation')
  })

  it('does not inject for non-signal calls', async () => {
    const code = `export function App() {
  const a = doSomething(0)
  return a
}
`
    const result = await ctx.transform(code, 'app.tsx')
    expect(result!.code).not.toContain('__sourceLocation')
  })

  it('handles multiline arg in signal() correctly', async () => {
    const code = `import { signal } from "@pyreon/reactivity"
export function App() {
  const obj = signal({
    a: 1,
    b: 2,
  })
  return obj
}
`
    const result = await ctx.transform(code, 'app.tsx')
    // Location anchors at the OPENING signal( — line 3.
    const loc = extractLoc(result!.code)
    expect(loc?.line).toBe(3)
  })
})
