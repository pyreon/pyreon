/**
 * Tests for the leak-class audit (`scripts/audit-leak-classes.ts`).
 *
 * The script is permissive by design — it produces an ADVISORY report,
 * not a gating CI check. Tests here lock in the structural contract of
 * each detector against synthetic source samples:
 *
 *   - FIRES specs prove the detector catches the leak shape it's supposed to.
 *   - DOES NOT FIRE specs prove false-positive resistance against the
 *     healthy patterns that look similar.
 *
 * "No subprocess-tested scripts" rule (matching e2e-affected.test.ts):
 * the script exports each detector as a pure function `(source, filePath)
 * → Finding[]`, and the tests import + assert directly. The CLI driver
 * at the bottom of the script is gated by `import.meta.main` so it never
 * runs during test import.
 */
import {
  detectPositionBasedPop,
  detectPromiseRaceNoClear,
  detectUnbalancedListeners,
  detectUnboundedCache,
} from '../../../../../scripts/audit-leak-classes'

const FILE = 'src/example.ts'

describe('detectUnboundedCache — Class C', () => {
  it('FIRES on module-level Map with set() and no delete()', () => {
    const src = `
const cache = new Map<string, string>()
export function add(k: string, v: string) {
  cache.set(k, v)
}
`
    const findings = detectUnboundedCache(src, FILE)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.detector).toBe('unbounded-cache')
    expect(findings[0]!.leakClass).toBe('C')
  })

  it('DOES NOT FIRE on module-level Map with delete()', () => {
    const src = `
const cache = new Map<string, string>()
export function add(k: string, v: string) {
  cache.set(k, v)
}
export function evict(k: string) {
  cache.delete(k)
}
`
    const findings = detectUnboundedCache(src, FILE)
    expect(findings).toHaveLength(0)
  })

  it('DOES NOT FIRE on WeakMap (GC-safe)', () => {
    const src = `
const cache = new WeakMap<object, string>()
export function add(k: object, v: string) {
  cache.set(k, v)
}
`
    const findings = detectUnboundedCache(src, FILE)
    expect(findings).toHaveLength(0)
  })

  it('DOES NOT FIRE on local Map inside a function (GC-safe)', () => {
    const src = `
export function build() {
  const local = new Map<string, string>()
  local.set('a', '1')
  return local
}
`
    const findings = detectUnboundedCache(src, FILE)
    expect(findings).toHaveLength(0)
  })

  it('FIRES on exported module-level Map', () => {
    const src = `
export const cache = new Map<string, string>()
cache.set('a', '1')
`
    const findings = detectUnboundedCache(src, FILE)
    expect(findings).toHaveLength(1)
  })

  // A module-level registry RESET via reassignment (`reg = new Map()` between
  // runs — the per-emit-run registry pattern in the native compiler emitters)
  // is bounded, not an unbounded leak. Reassignment to a fresh Map/Set is an
  // eviction-equivalent. Bisect-load-bearing: remove the AssignmentExpression
  // arm and this fires.
  it('DOES NOT FIRE when a module-level Map is reset by reassignment', () => {
    const src = `
let reg: Map<string, string> = new Map()
export function run() {
  reg = new Map()
  reg.set('a', '1')
}
`
    const findings = detectUnboundedCache(src, FILE)
    expect(findings).toHaveLength(0)
  })

  it('DOES NOT FIRE on `new Map()` mentioned only in a string or comment', () => {
    const src = `
// const x = new Map(); x.set(1, 2) — a comment
const codegen = "const m = new Map(); m.set('k', 'v')"
`
    const findings = detectUnboundedCache(src, FILE)
    expect(findings).toHaveLength(0)
  })
})

describe('detectUnbalancedListeners — Class D', () => {
  it('FIRES when addEventListener count exceeds removeEventListener', () => {
    const src = `
window.addEventListener('a', () => {})
window.addEventListener('b', () => {})
`
    const findings = detectUnbalancedListeners(src, FILE)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.leakClass).toBe('D')
  })

  it('DOES NOT FIRE when add and remove counts are balanced', () => {
    const src = `
const h = () => {}
window.addEventListener('a', h)
window.removeEventListener('a', h)
`
    const findings = detectUnbalancedListeners(src, FILE)
    expect(findings).toHaveLength(0)
  })

  it('DOES NOT FIRE with no listeners at all', () => {
    const src = `export function foo() { return 1 }`
    const findings = detectUnbalancedListeners(src, FILE)
    expect(findings).toHaveLength(0)
  })

  it('DOES NOT FIRE when remove exceeds add (defensive double-removal)', () => {
    const src = `
const h = () => {}
window.addEventListener('a', h)
window.removeEventListener('a', h)
window.removeEventListener('a', h) // defensive
`
    const findings = detectUnbalancedListeners(src, FILE)
    expect(findings).toHaveLength(0)
  })

  // The reason detection is AST-based, not regex: `addEventListener` mentioned
  // in a STRING (a compiler emitting it as codegen), a COMMENT (a docstring
  // example), or a TEMPLATE LITERAL (the compiler's `_tpl` bind output) is NOT
  // a real listener registration and must not count. The regex version
  // false-fired on all three — the dominant source of the audit's inflated
  // count. Bisect-load-bearing: revert the detector to `source.match(...)` and
  // this spec fails.
  it('DOES NOT FIRE on addEventListener in strings / comments / codegen (AST, not regex)', () => {
    const src = `
// el.addEventListener("scroll", handler) — a comment, not a call
const codegen = "node.addEventListener('click', h)"
const tpl = \`\${el}.addEventListener("input", \${fn})\`
const detect = (name: string) => name === 'addEventListener'
`
    const findings = detectUnbalancedListeners(src, FILE)
    expect(findings).toHaveLength(0)
  })
})

describe('detectPositionBasedPop — Class A', () => {
  it('FIRES on module-level array with .pop() call', () => {
    const src = `
const stack: string[] = []
export function push(x: string) { stack.push(x) }
export function pop() { stack.pop() }
`
    const findings = detectPositionBasedPop(src, FILE)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.leakClass).toBe('A')
  })

  it('DOES NOT FIRE on module-level array without .pop()', () => {
    const src = `
const items: string[] = []
export function add(x: string) { items.push(x) }
`
    const findings = detectPositionBasedPop(src, FILE)
    expect(findings).toHaveLength(0)
  })

  it('DOES NOT FIRE on local array inside function', () => {
    const src = `
export function reverse() {
  const local: string[] = []
  local.pop()
  return local
}
`
    const findings = detectPositionBasedPop(src, FILE)
    expect(findings).toHaveLength(0)
  })
})

describe('detectPromiseRaceNoClear — Class I', () => {
  it('FIRES on Promise.race with setTimeout and no finally clearTimeout', () => {
    const src = `
async function go() {
  const res = await Promise.race([
    work(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 30_000)
    ),
  ])
  return res
}
`
    const findings = detectPromiseRaceNoClear(src, FILE)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.leakClass).toBe('I')
  })

  it('DOES NOT FIRE when finally has clearTimeout', () => {
    const src = `
async function go() {
  let timeoutId
  try {
    return await Promise.race([
      work(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('timeout')), 30_000)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}
`
    const findings = detectPromiseRaceNoClear(src, FILE)
    expect(findings).toHaveLength(0)
  })

  it('DOES NOT FIRE on Promise.race without setTimeout (no leak shape)', () => {
    const src = `
async function firstResponse(urls: string[]) {
  return Promise.race(urls.map((u) => fetch(u)))
}
`
    const findings = detectPromiseRaceNoClear(src, FILE)
    expect(findings).toHaveLength(0)
  })
})
