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
import {
  _computeLineStarts,
  _maskStringsAndComments,
  _offsetToLineCol,
} from '../index'

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

describe('R8 — extension to computed() and effect() calls', () => {
  it('injects { name, __sourceLocation } into bound computed() call', async () => {
    const code = `import { signal, computed } from "@pyreon/reactivity"
export function App() {
  const s = signal(0)
  const doubled = computed(() => s() * 2)
  return doubled
}
`
    const result = await ctx.transform(code, '/abs/app.tsx')
    expect(result).toBeDefined()
    expect(result!.code).toMatch(
      /computed\(\(\) => s\(\) \* 2, \{ name: "doubled", __sourceLocation: \{ file: "\/abs\/app\.tsx", line: \d+, col: \d+ \} \}\)/,
    )
  })

  it('injects { name, __sourceLocation } into bound effect() call', async () => {
    const code = `import { signal, effect } from "@pyreon/reactivity"
export function App() {
  const s = signal(0)
  const e = effect(() => { console.log(s()) })
  return e
}
`
    const result = await ctx.transform(code, '/abs/app.tsx')
    expect(result).toBeDefined()
    expect(result!.code).toMatch(
      /effect\(\(\) => \{ console\.log\(s\(\)\) \}, \{ name: "e", __sourceLocation: \{ file: "\/abs\/app\.tsx", line: \d+, col: \d+ \} \}\)/,
    )
  })

  it('injects { __sourceLocation } into unbound effect() call (no name)', async () => {
    const code = `import { signal, effect } from "@pyreon/reactivity"
export function App() {
  const s = signal(0)
  effect(() => { console.log(s()) })
}
`
    const result = await ctx.transform(code, '/abs/app.tsx')
    expect(result).toBeDefined()
    // Unbound effect — `name:` MUST be absent.
    expect(result!.code).toMatch(
      /effect\(\(\) => \{ console\.log\(s\(\)\) \}, \{ __sourceLocation: \{ file: "\/abs\/app\.tsx", line: \d+, col: \d+ \} \}\)/,
    )
    // Targeted assertion — the unbound effect call must NOT have a name field
    // (the bound `const s = signal(...)` line DOES have `name: "s"`, hence
    // a global "no name:" check would false-fire).
    expect(result!.code).not.toMatch(
      /effect\(\(\) => \{ console\.log\(s\(\)\) \}, \{ name:/,
    )
  })

  it('injects different lines for signal + computed + effect on different lines', async () => {
    const code = `import { signal, computed, effect } from "@pyreon/reactivity"
export function App() {
  const s = signal(0)
  const d = computed(() => s() * 2)
  effect(() => { console.log(d()) })
}
`
    const result = await ctx.transform(code, 'app.tsx')
    const lines = [...result!.code.matchAll(/line: (\d+)/g)].map((m) => parseInt(m[1] ?? '0', 10))
    expect(lines).toContain(3) // signal
    expect(lines).toContain(4) // computed
    expect(lines).toContain(5) // effect
  })

  it('does NOT double-inject when bound effect() also matches unbound pattern', async () => {
    // Critical: `const e = effect(...)` MUST be processed by pass 1 only.
    // If pass 2 also matches it, we'd emit `effect(fn, { ... }, { ... })`
    // which becomes a 3-arg call — silently breaks runtime behavior.
    const code = `import { effect } from "@pyreon/reactivity"
export function App() {
  const e = effect(() => {})
  return e
}
`
    const result = await ctx.transform(code, 'app.tsx')
    // Exactly ONE `__sourceLocation` literal in the output.
    const matches = result!.code.match(/__sourceLocation/g) ?? []
    expect(matches).toHaveLength(1)
    // The name MUST still appear (pass 1 ran), so pass 2 didn't take over.
    expect(result!.code).toContain('name: "e"')
  })

  it('skips computed() that already has 2 args (custom equals)', async () => {
    const code = `import { signal, computed } from "@pyreon/reactivity"
export function App() {
  const s = signal(0)
  const d = computed(() => s(), { equals: Object.is })
  return d
}
`
    const result = await ctx.transform(code, 'app.tsx')
    // computed() with existing options — skip. (The signal() above WILL
    // inject; just don't touch the computed.)
    expect(result!.code).not.toContain(
      'computed(() => s(), { equals: Object.is }, {',
    )
  })

  it('skips effect() that already has 2 args (existing options)', async () => {
    const code = `import { effect } from "@pyreon/reactivity"
export function App() {
  effect(() => {}, { name: "preset" })
}
`
    const result = await ctx.transform(code, 'app.tsx')
    // No double-injection — there should still be exactly ONE options arg.
    expect(result!.code).not.toMatch(/effect\(\(\) => \{\}, \{ name: "preset" \}, \{/)
  })

  it('does NOT match member-access .effect() — only bare effect calls', async () => {
    const code = `export function App() {
  const obj = { effect: () => {} }
  obj.effect()
  return obj
}
`
    const result = await ctx.transform(code, 'app.tsx')
    // \`obj.effect()\` must not be rewritten — pass 2's negative lookbehind
    // forbids leading \`.\` to avoid touching method calls.
    expect(result!.code).not.toContain('__sourceLocation')
  })

  it('does NOT match identifier-ending-in-effect calls (sideEffect, etc.)', async () => {
    const code = `export function App() {
  function sideEffect() {}
  sideEffect()
  return null
}
`
    const result = await ctx.transform(code, 'app.tsx')
    // \`sideEffect(\` ends in \`effect(\` but is preceded by an identifier char.
    // Negative lookbehind \`(?<![\\w\$.])\` excludes it.
    expect(result!.code).not.toContain('__sourceLocation')
  })

  it('handles computed() with custom-equals signature unbound at expression position', async () => {
    // A `computed()` expression used as an arg — no binding. We choose NOT
    // to inject location for unbound computed/signal (conservative: only
    // unbound effect, which is the common anonymous-effect pattern).
    const code = `import { computed } from "@pyreon/reactivity"
export function App(deriver) {
  deriver(computed(() => 1))
}
`
    const result = await ctx.transform(code, 'app.tsx')
    // No injection on unbound computed — that's a deliberate scope choice.
    expect(result!.code).not.toContain('__sourceLocation')
  })

  it('injects for ALL three primitives in the same file with no conflicts', async () => {
    const code = `import { signal, computed, effect } from "@pyreon/reactivity"
export function App() {
  const s = signal(0)
  const d = computed(() => s() + 1)
  const e = effect(() => { console.log(d()) })
  effect(() => { console.log(s()) })
  return [s, d, e]
}
`
    const result = await ctx.transform(code, 'app.tsx')
    // Each gets exactly one `__sourceLocation` injection — 4 total.
    const matches = result!.code.match(/__sourceLocation/g) ?? []
    expect(matches).toHaveLength(4)
    // Bound forms carry `name:` — count: s, d, e = 3.
    const names = result!.code.match(/name: "[sde]"/g) ?? []
    expect(names).toHaveLength(3)
  })
})

describe('_maskStringsAndComments', () => {
  it('preserves length so positions line up with original', () => {
    const code = 'const x = "hello"; const y = 1'
    expect(_maskStringsAndComments(code)).toHaveLength(code.length)
  })

  it('masks `"..."` string content', () => {
    const code = 'const x = "effect(()=>1)"'
    const masked = _maskStringsAndComments(code)
    // Outside of string: unchanged
    expect(masked.slice(0, 11)).toBe('const x =  ')
    // Inside string (positions 11..24): all spaces
    expect(masked.slice(11, 25)).toMatch(/^ +$/)
  })

  it("masks `'...'` string content", () => {
    const code = "const x = 'signal(0)'"
    const masked = _maskStringsAndComments(code)
    expect(masked.includes('signal(0)')).toBe(false)
  })

  it('masks template-literal text content', () => {
    const code = 'const x = `effect(() => 1)`'
    const masked = _maskStringsAndComments(code)
    expect(masked.includes('effect(')).toBe(false)
  })

  it('KEEPS template-literal `${...}` interpolations as code', () => {
    // The CRITICAL contract — interpolation bodies can contain real
    // reactive primitive calls that DO deserve injection.
    const code = 'const x = `value: ${signal(0)}`'
    const masked = _maskStringsAndComments(code)
    expect(masked.includes('signal(0)')).toBe(true)
  })

  it('handles nested braces inside `${...}` correctly', () => {
    const code = 'const x = `${{ a: signal(0) }}`'
    const masked = _maskStringsAndComments(code)
    // The `signal(0)` inside the object literal inside the interpolation
    // must survive masking.
    expect(masked.includes('signal(0)')).toBe(true)
  })

  it('masks `// ...` line comments to end of line', () => {
    const code = 'const x = 1 // effect(() => 2)\nconst y = 3'
    const masked = _maskStringsAndComments(code)
    // The `effect(` mention in the comment is gone.
    expect(masked.includes('effect(')).toBe(false)
    // `const y = 3` after the newline survives.
    expect(masked.includes('const y = 3')).toBe(true)
  })

  it('masks `/* ... */` block comments across newlines', () => {
    const code = 'const x = 1 /* effect(\n  () => 2\n) */\nconst y = signal(0)'
    const masked = _maskStringsAndComments(code)
    expect(masked.includes('effect(')).toBe(false)
    // Newlines INSIDE the block comment are preserved so line numbers
    // don't shift.
    expect(masked.split('\n')).toHaveLength(code.split('\n').length)
    // Code AFTER the block comment survives.
    expect(masked.includes('signal(0)')).toBe(true)
  })

  it('handles escape sequences in strings (`\\"` doesn\'t end the string)', () => {
    const code = 'const x = "with \\"effect(\\" inside"'
    const masked = _maskStringsAndComments(code)
    expect(masked.includes('effect(')).toBe(false)
  })

  it('handles escape sequences in template literals (`\\`` doesn\'t end)', () => {
    const code = 'const x = `with \\`effect(\\` inside`'
    const masked = _maskStringsAndComments(code)
    expect(masked.includes('effect(')).toBe(false)
  })

  it('does not touch code outside strings/comments', () => {
    const code = 'const x = signal(0); const y = computed(() => 1); effect(() => 2)'
    const masked = _maskStringsAndComments(code)
    // Verbatim — no string/comment regions to mask.
    expect(masked).toBe(code)
  })

  it('preserves newlines so injected line numbers stay correct', () => {
    const code = 'line1\n"line2"\nline3'
    const masked = _maskStringsAndComments(code)
    expect(masked.split('\n')).toHaveLength(3)
  })
})

describe('injectSignalNames — string-region false-positive prevention', () => {
  it('does NOT inject into `effect(` inside a template literal (docstring)', async () => {
    const code = `import { signal } from "@pyreon/reactivity"
export function App() {
  const docs = \`
    Use effect() like this:
      effect(() => console.log(state))
  \`
  return docs
}
`
    const result = await ctx.transform(code, '/abs/app.tsx')
    // The template literal's content must NOT be modified.
    expect(result!.code).toContain('Use effect() like this:')
    expect(result!.code).toContain('effect(() => console.log(state))')
    // No __sourceLocation injection (the only `effect(` is inside the string).
    expect(result!.code).not.toContain('__sourceLocation')
  })

  it('does NOT inject into `signal(` / `computed(` inside a template literal', async () => {
    const code = `import { signal } from "@pyreon/reactivity"
export function App() {
  const docs = \`
    Pattern: const count = signal(0)
    Pattern: const doubled = computed(() => count() * 2)
  \`
  return docs
}
`
    const result = await ctx.transform(code, '/abs/app.tsx')
    expect(result!.code).toContain('const count = signal(0)')
    expect(result!.code).toContain('const doubled = computed(() => count() * 2)')
    // The template-literal content stays verbatim — no __sourceLocation.
    expect(result!.code).not.toContain('__sourceLocation')
  })

  it('does NOT inject into `effect(` inside a "..." string', async () => {
    // Common shape: throw new Error('effect() must be called inside ...')
    const code = `import { signal } from "@pyreon/reactivity"
export function App() {
  throw new Error("effect() must be called inside a component")
}
`
    const result = await ctx.transform(code, '/abs/app.tsx')
    expect(result!.code).toContain('"effect() must be called inside a component"')
    expect(result!.code).not.toContain('__sourceLocation')
  })

  it('does NOT inject into `effect(` inside a line comment', async () => {
    const code = `import { signal, effect } from "@pyreon/reactivity"
export function App() {
  // TODO: replace effect(() => log()) with watch()
  const x = signal(0)
  return x
}
`
    const result = await ctx.transform(code, '/abs/app.tsx')
    // signal(0) gets injected; the comment-mention of effect(...) does not.
    expect(result!.code).toContain('signal(0, { name: "x"')
    // The comment line is verbatim.
    expect(result!.code).toContain('// TODO: replace effect(() => log()) with watch()')
    // Only ONE __sourceLocation — the signal call.
    const matches = result!.code.match(/__sourceLocation/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('STILL injects into real `effect(` calls outside strings — false-negative guard', async () => {
    const code = `import { signal, effect } from "@pyreon/reactivity"
export function App() {
  const docs = \`effect(() => x)\`  // fake call in string — must NOT inject
  const s = signal(0)              // real — MUST inject
  effect(() => { console.log(s()) }) // real — MUST inject
  return docs
}
`
    const result = await ctx.transform(code, '/abs/app.tsx')
    // The string's content survives.
    expect(result!.code).toContain('`effect(() => x)`')
    // Two real reactive calls → two __sourceLocation injections.
    const matches = result!.code.match(/__sourceLocation/g) ?? []
    expect(matches).toHaveLength(2)
    // The signal is bound, has a name.
    expect(result!.code).toContain('name: "s"')
  })

  it('handles real `signal()` call INSIDE template-literal `${...}` interpolation', async () => {
    // Interpolation bodies are real code — `signal()` there should
    // still be tracked.
    const code = `import { signal } from "@pyreon/reactivity"
export function App() {
  const make = () => {
    const s = signal(0)
    return \`value: \${s()}\`
  }
  return make()
}
`
    const result = await ctx.transform(code, '/abs/app.tsx')
    expect(result!.code).toContain('signal(0, { name: "s"')
  })
})
