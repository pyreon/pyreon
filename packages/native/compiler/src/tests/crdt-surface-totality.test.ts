import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePyreon } from '../parse'
import { CRDT_DOC_SURFACE, CRDT_MAP_SURFACE } from '../parse-crdt-surface'

/**
 * The classification in `parse-crdt-surface.ts` is only worth anything if it is
 * TOTAL over the web contract. A hand-maintained allowlist rots the moment
 * `CrdtDoc` grows a member — and the rot is silent, because an unclassified
 * member simply never warns and the user meets it as a compiler error inside a
 * generated file.
 *
 * So this test does NOT restate the member names. It parses them out of
 * `@pyreon/sync`'s own `crdt/types.ts` and fails if any is unclassified.
 */
function membersOf(iface: string): string[] {
  const src = readFileSync(
    join(__dirname, '../../../../fundamentals/sync/src/crdt/types.ts'),
    'utf8',
  )
  const start = src.indexOf(`export interface ${iface} {`)
  if (start < 0) throw new Error(`interface ${iface} not found — did it move or get renamed?`)
  const open = src.indexOf('{', start)
  let depth = 0
  let end = open
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  const body = src.slice(open + 1, end)
  // `name(args): Ret` at brace depth 0 of the body.
  const names: string[] = []
  let d = 0
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    const m = /^([a-zA-Z_$][\w$]*)\s*\(/.exec(line)
    if (d === 0 && m) names.push(m[1]!)
    for (const ch of line) {
      if (ch === '{') d++
      else if (ch === '}') d--
    }
  }
  return names
}

describe('CRDT surface classification is total over the web contract', () => {
  it('classifies every CrdtDoc member', () => {
    const members = membersOf('CrdtDoc')
    expect(members.length).toBeGreaterThan(0)
    for (const m of members) {
      expect(
        Object.hasOwn(CRDT_DOC_SURFACE, m),
        `CrdtDoc.${m} is unclassified in CRDT_DOC_SURFACE — classify it as lowered (true) ` +
          `or not (false). An unclassified member never warns, so a user meets it as a ` +
          `Swift/Kotlin error inside a generated file.`,
      ).toBe(true)
    }
  })

  it('classifies every CrdtMap member', () => {
    const members = membersOf('CrdtMap')
    expect(members.length).toBeGreaterThan(0)
    for (const m of members) {
      expect(
        Object.hasOwn(CRDT_MAP_SURFACE, m),
        `CrdtMap.${m} is unclassified in CRDT_MAP_SURFACE.`,
      ).toBe(true)
    }
  })

  it('the parser finds the interfaces at all (guards the extractor itself)', () => {
    // A parse that silently returned [] would make both specs above vacuous.
    expect(membersOf('CrdtDoc')).toContain('getMap')
    expect(membersOf('CrdtMap')).toContain('observe')
  })
})

describe('un-lowered CRDT members warn instead of emitting silently', () => {
  const warn = (src: string) => parsePyreon(src, 'App.tsx').warnings.join('\n')

  it('warns on doc.transact — the member the web contract REQUIRES writes to use', () => {
    const w = warn(`
      import { PyreonCrdtDoc } from '@pyreon/sync'
      export function App() {
        const doc = new PyreonCrdtDoc('a1')
        doc.transact(() => {})
        return <Text>x</Text>
      }
    `)
    expect(w).toContain('CrdtDoc.transact')
    expect(w).toContain('VERBATIM')
  })

  it('warns on doc.destroy', () => {
    const w = warn(`
      import { PyreonCrdtDoc } from '@pyreon/sync'
      export function App() {
        const doc = new PyreonCrdtDoc('a1')
        doc.destroy()
        return <Text>x</Text>
      }
    `)
    expect(w).toContain('CrdtDoc.destroy')
  })

  it('stays QUIET for members that DO lower — the half that proves it is not firing blindly', () => {
    const w = warn(`
      import { PyreonCrdtDoc } from '@pyreon/sync'
      export function App() {
        const doc = new PyreonCrdtDoc('a1')
        const room = doc.getMap('room')
        room.set('k', 'v')
        room.get('k')
        room.has('k')
        room.keys()
        room.observe(() => {})
        return <Text>x</Text>
      }
    `)
    expect(w).not.toContain('NO native counterpart')
  })

  it('does NOT claim an unrelated binding that happens to have .transact', () => {
    // The fixture deliberately ALSO declares a real CRDT doc. Without it the
    // cheap `source.includes('PyreonCrdtDoc')` gate would bail before the
    // identifier matching ran, and this spec would pass while that matching was
    // broken — passing for the wrong reason is not coverage.
    const w = warn(`
      import { PyreonCrdtDoc } from '@pyreon/sync'
      export function App() {
        const doc = new PyreonCrdtDoc('a1')
        doc.getMap('room')
        const db = getDb()
        db.transact(() => {})
        return <Text>x</Text>
      }
    `)
    expect(w).not.toContain('NO native counterpart')
  })

  it('the cheap source gate does not swallow a real finding', () => {
    // Guards the gate itself: a file WITH a doc must still reach the walk.
    const w = warn(`
      import { PyreonCrdtDoc } from '@pyreon/sync'
      export function App() {
        const doc = new PyreonCrdtDoc('a1')
        const go = () => { doc.transact(() => {}) }
        go()
        return <Text>x</Text>
      }
    `)
    // Nested inside a closure — the walk must be deep, not statement-level.
    expect(w).toContain('CrdtDoc.transact')
  })

  it('warns ONCE for a member called in a loop', () => {
    const w = warn(`
      import { PyreonCrdtDoc } from '@pyreon/sync'
      export function App() {
        const doc = new PyreonCrdtDoc('a1')
        doc.transact(() => {})
        doc.transact(() => {})
        return <Text>x</Text>
      }
    `)
    expect(w.split('CrdtDoc.transact').length - 1).toBe(1)
  })
})
