// Edge labels are the one piece of flow text whose SIZE is set by the flow
// itself (node text comes from the app's renderer). The web writes it as a
// CSS `font-size`; the native views are hand-written copies that drifted
// (iOS 12pt, Android the platform default) while the web said 11px. This
// reads every edge-label text from source on all three targets and requires
// one size.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')

/** Every `font-size: Npx` on an element themed by `--pyreon-flow-edge-label`. */
function webSizes(): number[] {
  const out: number[] = []
  for (const file of ['src/components/flow-component.tsx', 'src/components/edge-base.tsx']) {
    for (const m of read(file).matchAll(/font-size:\s*(\d+)px;[^'"`]*--pyreon-flow-edge-label/g)) out.push(Number(m[1]))
  }
  return out
}

describe('native edge labels use the web edge-label size', () => {
  const sizes = webSizes()

  it('the web defines one edge-label size', () => {
    // The built-in label and <EdgeText>.
    expect(sizes.length).toBeGreaterThanOrEqual(2)
    expect(new Set(sizes).size).toBe(1)
  })

  it('swift: every edge-label text is set at that size', () => {
    const src = read('native/swift/PyreonFlowView.swift')
    // A Text whose colour is the edge-label palette entry, with its font.
    const fonts = [...src.matchAll(/\.font\(\.system\(size: (\d+)\)\)\s*\n\s*\.foregroundStyle\(pyreonFlowEdgeColor\(palette\.edgeLabel\)\)/g)].map((m) => Number(m[1]))
    const labelTexts = [...src.matchAll(/foregroundStyle\(pyreonFlowEdgeColor\(palette\.edgeLabel\)\)/g)].length
    expect(labelTexts).toBeGreaterThanOrEqual(2)
    expect(fonts.length, 'every edge-label Text must set its size').toBe(labelTexts)
    for (const size of fonts) expect(size).toBe(sizes[0])
  })

  it('kotlin: every edge-label text is set at that size', () => {
    const src = read('native/kotlin/com/pyreon/runtime/PyreonFlowView.kt')
    const labelTexts = [...src.matchAll(/color = pyreonFlowEdgeColor\(palette\.edgeLabel\),/g)]
    expect(labelTexts.length).toBeGreaterThanOrEqual(2)
    for (const m of labelTexts) {
      // The Text call the colour argument belongs to: back to its `Text(`, on to its `)`.
      const start = src.lastIndexOf('Text(', m.index)
      const lineStart = src.lastIndexOf('\n', start) + 1
      const indent = src.slice(lineStart, start).match(/^\s*/)![0]
      const end = src.indexOf(`\n${indent})`, m.index)
      expect(end, 'the edge-label Text call must close on its own line').toBeGreaterThan(m.index)
      const call = src.slice(start, end)
      const size = call.match(/fontSize = (\d+)\.sp/)
      expect(size, `edge-label Text at offset ${start} sets no fontSize`).not.toBeNull()
      expect(Number(size![1])).toBe(sizes[0])
    }
  })
})
