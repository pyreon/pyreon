import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, validateKotlin } from '../validate'

// A literal row handed to a chart host is rebuilt as the engine struct, and
// the engine types some of those fields as Double. Kotlin does not widen an
// integer literal to Double, so `SankeyLink(value = 8)` failed the Android
// build of native-tasks; every Double field of every literal-array host shares
// the adapter, so GraphNode / GraphLink are pinned alongside Sankey.
const APP = `import { Stack } from '@pyreon/primitives'
import { SankeyChart, GraphChart } from '@pyreon/charts'
const FLOW_NODES = [{ name: 'A' }, { name: 'B' }]
const FLOW_LINKS = [{ source: 'A', target: 'B', value: 8 }, { source: 'B', target: 'A', value: -2 }]
const G_NODES = [{ id: 'a', value: 3, x: 1, y: 2 }]
const G_LINKS = [{ source: 'a', target: 'a', value: 4 }]
export function App() {
  return (
    <Stack>
      <SankeyChart nodes={FLOW_NODES} links={FLOW_LINKS} height={160} />
      <GraphChart nodes={G_NODES} links={G_LINKS} height={160} />
    </Stack>
  )
}`

describe('literal struct rows write Double fields as Doubles', () => {
  it('Kotlin: integer literals become Double literals, strings untouched', () => {
    const { code } = transform(APP, { target: 'kotlin' })
    expect(code).toContain('SankeyLink(source = "A", target = "B", value = 8.0)')
    expect(code).toContain('SankeyLink(source = "B", target = "A", value = -2.0)')
    expect(code).toMatch(/GraphNode\(id = "a"[^)]*value = 3\.0[^)]*x = 1\.0, y = 2\.0\)/)
    expect(code).toContain('GraphLink(source = "a", target = "a", value = 4.0)')
  })

  it('the emitted Kotlin compiles', { skip: !isKotlincAvailable() }, () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
