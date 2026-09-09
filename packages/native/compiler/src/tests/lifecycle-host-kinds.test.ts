// `LIFECYCLE_HOST_DECL_KINDS` (emit-swift.ts) decides whether a component body
// is wrapped in a concrete `ZStack`. Getting it wrong is the device-found
// SwiftUI class: a `.task` / `.onAppear` attached to a TRANSPARENT
// `Group { if … else … }` is redistributed onto the conditional's BRANCHES, so
// it is cancelled and re-applied on every state flip.
//
// It was ten hand-listed `_has*` booleans, sixty lines from the emits that
// create the requirement, and had been widened five times. Four kinds that DO
// emit a lifecycle modifier were never added — including `sortable`, whose own
// comment says it has "the same `.onAppear` rationale as table-state", which IS
// in the list.
//
// So the list is not trusted here: the answer is DERIVED from the emitter
// source, and the set must agree with it exactly.
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SWIFT = readFileSync(join(resolve(import.meta.dirname, '..'), 'emit-swift.ts'), 'utf8')

/** Every `for (const d of c.decls) { if (d.kind !== 'X') continue; … }` block,
 *  paired with whether its body appends a lifecycle modifier.
 *
 *  The block extent is BRACE-MATCHED from its enclosing `for` rather than
 *  windowed to the next marker: a decl block can be ~200 lines from its
 *  neighbour, and a fixed window bled into the next block and reported
 *  `signal` and `router` as lifecycle-emitting. A scan that over-reports is as
 *  useless as one that under-reports — it just fails in the other direction. */
function derivedLifecycleKinds(): { emitting: Set<string>; scanned: number } {
  const marker = /if \(d\.kind !== '([a-z-]+)'(?: \|\| [^)]*)?\) continue/g
  const emitting = new Set<string>()
  let scanned = 0
  for (const m of SWIFT.matchAll(marker)) {
    const kind = m[1]!
    const at = m.index!
    const loopAt = SWIFT.lastIndexOf('for (const d of c.decls', at)
    if (loopAt === -1) continue
    const open = SWIFT.indexOf('{', loopAt)
    if (open === -1 || open > at) continue
    let depth = 0
    let end = SWIFT.length
    for (let i = open; i < SWIFT.length; i++) {
      const ch = SWIFT[i]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    scanned++
    const body = SWIFT.slice(at, end)
    // `.background(Button…)` is how a keyboard shortcut rides on the body — the
    // same redistribution hazard as a lifecycle modifier proper.
    if (/`\s*\.(onAppear|onDisappear|task)\b/.test(body) || /`\s*\.background\(/.test(body)) {
      emitting.add(kind)
    }
  }
  return { emitting, scanned }
}

/** The set as the emitter declares it. Read from source so the test does not
 *  need the emitter to export a private const. */
function declaredSet(): Set<string> {
  const block = /const LIFECYCLE_HOST_DECL_KINDS: ReadonlySet<DeclIR\['kind'\]> = new Set\(\[([\s\S]*?)\]\)/.exec(
    SWIFT,
  )
  expect(block, 'LIFECYCLE_HOST_DECL_KINDS not found in emit-swift.ts').not.toBeNull()
  return new Set([...block![1]!.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!))
}

describe('LIFECYCLE_HOST_DECL_KINDS covers every lifecycle-emitting decl', () => {
  it('the scan finds decl blocks at all (an empty scan would pass vacuously)', () => {
    const { scanned } = derivedLifecycleKinds()
    expect(scanned).toBeGreaterThan(10)
  })

  it('every decl kind that emits a lifecycle modifier is in the set', () => {
    const { emitting } = derivedLifecycleKinds()
    const declared = declaredSet()
    const missing = [...emitting].filter((k) => !declared.has(k)).sort()
    expect(missing, 'these emit .task/.onAppear/.onDisappear but get no stable ZStack host').toEqual(
      [],
    )
  })

  it('the four kinds this audit found are present', () => {
    const declared = declaredSet()
    for (const k of ['sortable', 'form', 'rate-limited', 'hotkey']) {
      expect(declared.has(k), k).toBe(true)
    }
  })

  it('`fetch` and `query` are still present (the original device-found pair)', () => {
    const declared = declaredSet()
    expect(declared.has('fetch')).toBe(true)
    expect(declared.has('query')).toBe(true)
  })
})
