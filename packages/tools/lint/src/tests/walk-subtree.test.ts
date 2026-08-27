import { parseSync, visitorKeys } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { walkSubtree } from '../utils/ast'

/**
 * `walkSubtree` replaced six hand-rolled `Object.keys` walks. The bug those
 * shared: they descend into whatever holds a `.type`, which includes a
 * `parent` back-reference. oxc's raw AST has none, so the rules worked — but
 * an ESLint-shaped AST does, and the walk then climbs back up the tree and
 * recurses until the stack blows.
 */

function parse(src: string): any {
  return parseSync('t.tsx', src, { sourceType: 'module', lang: 'tsx' }).program
}

/** Add ESLint-style `parent` back-references, as a plugin host would. */
function addParents(node: any, parent: any = null): void {
  if (!node || typeof node.type !== 'string') return
  node.parent = parent
  const keys = visitorKeys[node.type]
  if (!keys) return
  for (const key of keys) {
    const child = node[key]
    if (Array.isArray(child)) {
      for (const item of child) addParents(item, node)
    } else if (child && typeof child.type === 'string') {
      addParents(child, node)
    }
  }
}

const SOURCE = `
import { signal, onMount } from '@pyreon/reactivity'
export function Comp(props: { id: string }) {
  const count = signal(0)
  onMount(() => {
    const t = setInterval(() => count.set(count() + 1), 100)
    return () => clearInterval(t)
  })
  return <ul>{[1, 2, 3].map((n) => <li key={n}>{n + count()}</li>)}</ul>
}
`

describe('walkSubtree', () => {
  it('visits the root and every typed descendant exactly once', () => {
    const program = parse(SOURCE)
    const seen: any[] = []
    walkSubtree(program, (n) => {
      seen.push(n)
    })
    expect(seen[0]).toBe(program)
    expect(new Set(seen).size).toBe(seen.length)
    expect(seen.length).toBeGreaterThan(30)
  })

  it('terminates on a parent-bearing AST instead of overflowing the stack', () => {
    // The regression. With the old `Object.keys` walk this recurses
    // root -> child -> parent -> child ... until `RangeError: Maximum call
    // stack size exceeded` — the exact failure seen when the rule set ran
    // inside a host that supplies `parent`.
    const program = parse(SOURCE)
    addParents(program)
    expect(program.body[0].parent).toBe(program)

    let visited = 0
    expect(() => {
      walkSubtree(program, () => {
        visited++
      })
    }).not.toThrow()
    expect(visited).toBeGreaterThan(30)
  })

  it('visits the same nodes with or without parent links', () => {
    const a = parse(SOURCE)
    const b = parse(SOURCE)
    addParents(b)
    const countOf = (p: any) => {
      let n = 0
      walkSubtree(p, () => {
        n++
      })
      return n
    }
    expect(countOf(b)).toBe(countOf(a))
  })

  it('returning false skips the whole subtree, not just one level', () => {
    const program = parse(`function outer() { function inner() { return 1 + 2 } }`)
    const types: string[] = []
    walkSubtree(program, (n) => {
      types.push(n.type)
      if (n.type === 'FunctionDeclaration' && n.id?.name === 'inner') return false
      return undefined
    })
    expect(types).toContain('FunctionDeclaration')
    // `inner`'s body must not be reached.
    expect(types).not.toContain('BinaryExpression')
  })

  it('falls back to own keys for an unknown node type — but never through parent', () => {
    // A shape newer than the installed oxc: no `visitorKeys` entry, so the
    // fallback runs. It must still reach the child, and must still refuse
    // to follow `parent`.
    const child = { type: 'KnownChild', start: 0, end: 1 }
    const root: any = { type: 'FutureNodeShape', start: 0, end: 2, inner: child }
    ;(child as any).parent = root
    expect(visitorKeys['FutureNodeShape']).toBeUndefined()

    const seen: string[] = []
    expect(() => {
      walkSubtree(root, (n) => {
        seen.push(n.type)
      })
    }).not.toThrow()
    expect(seen).toEqual(['FutureNodeShape', 'KnownChild'])
  })

  it("oxc's visitorKeys reach every typed child link the rules rely on", () => {
    // Guards the premise of the refactor: if a future oxc adds a child key
    // that `visitorKeys` omits, walks would silently stop descending and
    // rules would lose findings with no test failing. Measured across this
    // repo, the only omission is `Program.hashbang`, which has no children.
    const program = parse(SOURCE)
    const missed: string[] = []
    const truth = (n: any) => {
      if (!n || typeof n.type !== 'string') return
      const vk = visitorKeys[n.type]
      for (const key of Object.keys(n)) {
        if (['type', 'start', 'end', 'parent', 'range'].includes(key)) continue
        const c = n[key]
        const kids = Array.isArray(c) ? c : c && typeof c.type === 'string' ? [c] : []
        if (kids.length && !(vk?.includes(key) ?? false) && key !== 'hashbang') {
          missed.push(`${n.type}.${key}`)
        }
        for (const k of kids) truth(k)
      }
    }
    truth(program)
    expect([...new Set(missed)]).toEqual([])
  })
})
