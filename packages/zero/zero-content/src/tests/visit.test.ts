/**
 * `visit` — the first-party replacement for `unist-util-visit`.
 *
 * The remark plugins in this package SPLICE their parent's children and
 * return a resume index, so the traversal details are load-bearing, not
 * cosmetic. The characterization specs pin each detail; the differential
 * block runs the same MUTATING visitor over seeded random trees through
 * both walkers (`unist-util-visit` stays a devDependency for exactly this)
 * and requires the identical visit log AND the identical resulting tree.
 */
import type { Nodes, Parent, Root, RootContent } from 'mdast'
import { visit as upstreamVisit } from 'unist-util-visit'
import { describe, expect, it } from 'vitest'
import { visit } from '../pipeline/visit'

const text = (value: string) => ({ type: 'text' as const, value })
const para = (...children: Array<ReturnType<typeof text>>) => ({
  type: 'paragraph' as const,
  children,
})

describe('visit — traversal characterization', () => {
  it('walks pre-order, depth-first, passing index + parent', () => {
    const tree: Root = { type: 'root', children: [para(text('a'), text('b')), para(text('c'))] }
    const log: string[] = []
    visit(tree, (node, index, parent) => {
      log.push(`${node.type}${'value' in node ? `:${node.value}` : ''}@${index}<${parent?.type}`)
    })
    expect(log).toEqual([
      'root@undefined<undefined',
      'paragraph@0<root',
      'text:a@0<paragraph',
      'text:b@1<paragraph',
      'paragraph@1<root',
      'text:c@0<paragraph',
    ])
  })

  it('filters by node type but still descends through non-matching nodes', () => {
    const tree: Root = { type: 'root', children: [para(text('a')), para(text('b'))] }
    const seen: string[] = []
    visit(tree, 'text', (node) => {
      seen.push(node.value)
    })
    expect(seen).toEqual(['a', 'b'])
  })

  it('resumes at a returned index after the visitor splices its parent', () => {
    const tree: Root = { type: 'root', children: [para(text('x')), para(text('y'))] }
    const seen: string[] = []
    visit(tree, (node, index, parent) => {
      if (node.type === 'paragraph' && parent && index !== undefined && index === 0) {
        parent.children.splice(index, 1, { type: 'html', value: 'open' }, node, { type: 'html', value: 'close' })
        return index + 3
      }
      if (node.type === 'text') seen.push(node.value)
      return undefined
    })
    expect(tree.children.map((c) => c.type)).toEqual(['html', 'paragraph', 'html', 'paragraph'])
    // `x` was reached by descending into the replaced node; the resume index
    // skipped the re-inserted copy, so `x` is seen once.
    expect(seen).toEqual(['x', 'y'])
  })

  it('stops walking the parent when the returned index is out of range', () => {
    const tree: Root = { type: 'root', children: [para(text('a')), para(text('b'))] }
    const seen: string[] = []
    visit(tree, 'paragraph', (node) => {
      seen.push((node.children[0] as { value: string }).value)
      return -1
    })
    expect(seen).toEqual(['a'])
  })
})

// ─── differential ───────────────────────────────────────────────────────────

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let nextId = 0
function makeTree(rand: () => number, depth: number): RootContent {
  if (depth === 0 || rand() < 0.3) return { type: 'text', value: `t${nextId++}` }
  const n = 1 + Math.floor(rand() * 4)
  const children = Array.from({ length: n }, () => makeTree(rand, depth - 1))
  const type = rand() < 0.5 ? 'paragraph' : 'blockquote'
  return { type, children, data: { id: nextId++ } } as unknown as RootContent
}

type Walker = (tree: Root, fn: (node: Nodes, index: number | undefined, parent: Parent | undefined) => number | undefined) => void

function runMutating(walker: Walker, seed: number) {
  nextId = 0
  const rand = rng(seed)
  const tree: Root = { type: 'root', children: [makeTree(rand, 4), makeTree(rand, 4), makeTree(rand, 3)] }
  const decide = rng(seed * 31 + 7)
  const log: string[] = []
  let budget = 400
  walker(tree, (node, index, parent) => {
    if (--budget < 0) return -1
    const id = 'value' in node ? node.value : (node.data as { id?: number } | undefined)?.id
    log.push(`${node.type}:${id}@${index}`)
    if (!parent || index === undefined || node.type === 'root') return undefined
    const r = decide()
    // The plugin shapes: replace with [open, ...children, close] and skip
    // past it; drop the node; or leave it alone.
    if (r < 0.2 && 'children' in node) {
      const kids = node.children as RootContent[]
      parent.children.splice(index, 1, { type: 'html', value: 'o' }, ...kids, { type: 'html', value: 'c' })
      return index + 2 + kids.length
    }
    if (r < 0.3) {
      parent.children.splice(index, 1)
      return index
    }
    return undefined
  })
  return { log, tree: JSON.stringify(tree) }
}

describe('visit — differential against unist-util-visit', () => {
  it.each(Array.from({ length: 200 }, (_, i) => i + 1))('mutating walk, seed %i', (seed) => {
    const upstream: Walker = (tree, fn) => upstreamVisit(tree, fn as never)
    const ours: Walker = (tree, fn) => visit(tree, fn)
    expect(runMutating(ours, seed)).toEqual(runMutating(upstream, seed))
  })
})
