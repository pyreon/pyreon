import { describe, expect, it } from 'vitest'
import { transform } from '../index'

// Flow literals reach Swift and Kotlin source as string literals. JSON.stringify
// is not a Kotlin quoter: it leaves `$` unescaped, so a label like "cost $total"
// read a variable on Android and rendered differently from iOS.
const APP = `import { Stack } from '@pyreon/primitives'
import { createFlow } from '@pyreon/flow'
export function App() {
  const flow = createFlow({
    nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' }, ariaLabel: 'node $a' }],
    edges: [{ id: 'e1', source: 'a', target: 'a', label: 'cost $total "q"', ariaLabel: 'edge $x' }],
  })
  return (<Stack>{String(flow.nodes().length)}</Stack>)
}`

describe('flow literals are quoted for the target language', () => {
  it('Kotlin escapes `$` and quotes in node and edge strings', () => {
    const { code } = transform(APP, { target: 'kotlin' })
    expect(code).toContain('label = "cost \\$total \\"q\\""')
    expect(code).toContain('ariaLabel = "edge \\$x"')
    expect(code).toContain('ariaLabel = "node \\$a"')
    expect(code).not.toMatch(/"cost \$total/)
  })

  it('Swift keeps `$` literal and escapes quotes', () => {
    const { code } = transform(APP, { target: 'swift' })
    expect(code).toContain('label: "cost $total \\"q\\""')
  })
})
