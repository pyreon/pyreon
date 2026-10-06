import { detectPyreonPatterns, detectReactPatterns } from '@pyreon/compiler/analyze'
import { detectNativePatterns } from '@pyreon/native-compiler/audit'
import { detectNative, NATIVE_CHECKS_SKIPPED_NOTE } from '../native-detect'

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

describe('MCP validate — native (multiplatform) detector', () => {
  it('flags web-only imports + dropped decls in a multiplatform snippet', () => {
    // `class` rather than `interface`: PMTC compiles an interface into a
    // struct / data class, so flagging one told authors to rewrite code that
    // already worked. A class genuinely does not lower.
    //
    // `@pyreon/code` rather than `@pyreon/flow`: `createFlow` now crosses to
    // native (#3295), so `@pyreon/flow` dropped out of `WEB_ONLY_PACKAGES` —
    // `@pyreon/code` wraps CodeMirror (a DOM editor engine) and stays
    // durably web-only regardless of any single component's crossing status.
    const code = `
      import { Stack } from '@pyreon/primitives'
      import { CodeEditor } from '@pyreon/code'
      class Todo { id = 1 }
      export function App() { return (<Stack />) }
    `
    const diags = detectNativePatterns(code)
    const codes = new Set(diags.map((d) => d.code))
    expect(codes.has('native-web-only-import')).toBe(true)
    expect(codes.has('native-unsupported-decl')).toBe(true)
  })

  it('does NOT flag a top-level interface — PMTC compiles one', () => {
    const code = `
      import { Stack } from '@pyreon/primitives'
      interface Todo { id: number }
      export function App() { return (<Stack />) }
    `
    const diags = detectNativePatterns(code)
    expect(diags.filter((d) => d.code === 'native-unsupported-decl')).toHaveLength(0)
  })

  it('does NOT flag a pure-web snippet (no @pyreon/primitives import)', () => {
    // charts + interface, but not a multiplatform component → no native concern.
    const code = `
      import { Chart } from '@pyreon/charts'
      interface T { a: number }
      export const x = 1
    `
    expect(detectNativePatterns(code)).toEqual([])
  })

  it('does NOT flag idiomatic multiplatform code (type alias, no web-only imports)', () => {
    const code = `
      import { Stack, Text } from '@pyreon/primitives'
      type Todo = { id: number; title: string }
      export function App() { return (<Stack><Text>ok</Text></Stack>) }
    `
    expect(detectNativePatterns(code)).toEqual([])
  })
})

// `@pyreon/native-compiler` is an OPTIONAL peer of the MCP server. Its absence
// must be VISIBLE for a snippet the native checks would have examined -- an
// unqualified "No issues found" would certify a multiplatform component that
// nothing audited -- and invisible for a pure-web snippet, which has no native
// story to skip.
describe('MCP validate — native-compiler not installed', () => {
  const notInstalled = async () => undefined
  const MULTIPLATFORM = `import { Stack } from '@pyreon/primitives'\nexport const A = () => <Stack />\n`

  it('reports the checks as SKIPPED for a multiplatform snippet', async () => {
    const r = await detectNative(MULTIPLATFORM, 'a.tsx', notInstalled)
    expect(r).toEqual({ diags: [], skipped: true })
    expect(NATIVE_CHECKS_SKIPPED_NOTE).toContain('@pyreon/native-compiler')
    expect(NATIVE_CHECKS_SKIPPED_NOTE).toContain('install')
  })

  it('stays silent for a pure-web snippet — nothing native was skipped', async () => {
    const r = await detectNative(`import { signal } from '@pyreon/reactivity'\n`, 'a.tsx', notInstalled)
    expect(r).toEqual({ diags: [], skipped: false })
  })

  it('runs the detector when the peer IS present', async () => {
    const r = await detectNative(
      `import { Stack } from '@pyreon/primitives'\nclass C {}\n`,
      'a.tsx',
      async () => ({ detectNativePatterns }),
    )
    expect(r.skipped).toBe(false)
    expect(r.diags.map((d) => d.code)).toContain('native-unsupported-decl')
  })

  it('the default loader resolves the real peer in this workspace', async () => {
    const r = await detectNative(`import { Stack } from '@pyreon/primitives'\nenum E { A }\n`, 'a.tsx')
    expect(r.skipped).toBe(false)
    expect(r.diags.length).toBeGreaterThan(0)
  })
})
