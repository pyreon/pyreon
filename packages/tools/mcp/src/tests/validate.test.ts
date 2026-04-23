import { detectPyreonPatterns, detectReactPatterns } from '@pyreon/compiler'

// The MCP `validate` tool handler lives in index.ts and simply merges
// the results of both detectors. The handler cannot be exercised in-
// process without standing up an MCP transport, so this test locks
// down the merge contract: for a snippet that carries BOTH React
// patterns (coming-from-React mistakes) AND Pyreon patterns (using-
// Pyreon-wrong mistakes), both detectors must fire and the union must
// be what the handler returns. This is the regression test for the
// T2.5.2 extension that added the Pyreon detector alongside the React
// detector.

describe('MCP validate — merged detector surface', () => {
  it('returns BOTH React and Pyreon diagnostics on a mixed snippet', () => {
    const code = `
      import { useState } from 'react'

      const Counter = ({ count }: { count: number }) => {
        const [local, setLocal] = useState(count)
        return <For each={items}>{(i) => <li className="x" />}</For>
      }
    `
    const react = detectReactPatterns(code)
    const pyreon = detectPyreonPatterns(code)

    const reactCodes = new Set(react.map((d) => d.code))
    const pyreonCodes = new Set(pyreon.map((d) => d.code))

    // React detector catches: useState, react import, className
    expect(reactCodes.has('use-state')).toBe(true)
    expect(reactCodes.has('react-import')).toBe(true)
    expect(reactCodes.has('class-name-prop')).toBe(true)

    // Pyreon detector catches: destructured props, missing `by`
    expect(pyreonCodes.has('props-destructured')).toBe(true)
    expect(pyreonCodes.has('for-missing-by')).toBe(true)
  })

  it('does not double-flag anything between the two detectors', () => {
    // Both detectors know about className — but it belongs to the
    // React detector (coming-from-React mistake). The Pyreon detector
    // must NOT duplicate it.
    const code = `<div className="x" />`
    const reactCodes = new Set(detectReactPatterns(code).map((d) => d.code))
    const pyreonCodes = new Set(detectPyreonPatterns(code).map((d) => d.code))
    expect(reactCodes.has('class-name-prop')).toBe(true)
    // The Pyreon detector does NOT claim className ownership.
    expect(pyreonCodes.has('class-name-prop' as never)).toBe(false)
  })

  it('returns zero diagnostics across both detectors for idiomatic Pyreon code', () => {
    const code = `
      import { signal, effect } from '@pyreon/reactivity'
      import { For } from '@pyreon/core'

      const List = (props: { items: Array<{ id: string; name: string }> }) => {
        const query = signal('')
        effect(() => console.log('query changed', query()))
        return (
          <For each={props.items} by={(i) => i.id}>
            {(i) => <li>{i.name}</li>}
          </For>
        )
      }
    `
    expect(detectReactPatterns(code)).toEqual([])
    expect(detectPyreonPatterns(code)).toEqual([])
  })
})
