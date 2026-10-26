// #3987 — an inlined prop-derived name at the START of a statement.
//
// Inlining swaps a prop-derived name for `(<its initializer>)`. In a function
// body written WITHOUT semicolons that text now begins a line with `(`, and ASI
// does not insert a `;` before `(`, so the previous line absorbs it:
//
//   start.set(x)\n(() => {…})()   → start.set(x)(() => {…})()   TypeError at runtime
//   const seq = ++counter\n(props.client).fetchItems()  → parse error
//
// The source was valid and ran correctly un-compiled. The gate is therefore the
// REPARSE of the emitted code (the failure is "emits text that is not what the
// author wrote"), not a string match.

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'oxc-parser'
import { describe, expect, test } from 'vitest'
import { transformJSX_JS } from '../jsx'

type NativeTransform = (code: string, filename: string, ssr: boolean, knownSignals: string[] | null) => { code: string }
let native: NativeTransform | null = null
try {
  const here = dirname(fileURLToPath(import.meta.url))
  native = (createRequire(import.meta.url)(join(here, '..', '..', 'native', 'pyreon-compiler.node')) as { transformJsx: NativeTransform }).transformJsx
} catch {
  /* native binary absent — the JS oracle still runs */
}

const backends: Array<[string, (src: string) => string]> = [
  ['js', (src) => transformJSX_JS(src, 't.tsx').code],
  ...(native ? [['native', (src: string) => native!(src, 't.tsx', false, null).code] as [string, (s: string) => string]] : []),
]

const ISSUE = `import { signal } from '@pyreon/reactivity'

let counter = 0

export function ItemList(props: { client: { fetchItems: (q: string) => Promise<string[]> } }) {
  const items = signal<string[]>([])
  const start = signal('')
  const api = props.client

  const loadItems = () => {
    const seq = ++counter
    api.fetchItems(start()).then((res) => {
      if (seq === counter) items.set(res)
    })
  }

  const pick = (x: string) => {
    start.set(x)
    loadItems()
  }

  return (
    <div>
      <button onClick={() => pick('a')}>A</button>
      <button onClick={loadItems}>Reload</button>
      <ul>{() => items().map((i) => <li>{i}</li>)}</ul>
    </div>
  )
}`

const errors = (code: string): string[] => parseSync('t.tsx', code).errors.map((e) => e.message)

describe.each(backends)('%s backend — semicolon-free inlining parses and keeps its statements apart', (_name, compile) => {
  test("the issue's example (a function const AND a props alias at statement start)", () => {
    const out = compile(ISSUE)
    expect(errors(out)).toEqual([])
    // Both shapes got their separator.
    expect(out).toContain(';(props.client).fetchItems(')
    expect(out).toContain(';(() => {')
  })

  test('a call to an inlined function after a semicolon-free statement', () => {
    const out = compile(`export function C(props: { n: number }) {
  const bump = () => { props.n }
  const go = () => {
    console.log('x')
    bump()
  }
  return <button onClick={go}>x</button>
}`)
    expect(errors(out)).toEqual([])
    expect(out).toMatch(/console\.log\('x'\)\n\s*;\(/)
  })

  test('every statement-start shape: member chain, call, and a switch case', () => {
    const out = compile(`export function C(props: { client: { a(): void; b: { c(): void } } }) {
  const api = props.client
  const run = (k: string) => {
    const seen = k
    api.a()
    api.b.c()
    switch (k) {
      case 'x':
        console.log(k)
        api.a()
    }
  }
  return <button onClick={() => run('x')}>x</button>
}`)
    expect(errors(out)).toEqual([])
    // Parsing is not enough here: `api.a()\n(props.client).b.c()` parses as the
    // CALL `api.a()(props.client).b.c()`, wrong and silent. Each statement that
    // follows a semicolon-free one must be separated explicitly.
    expect(out.match(/;\(props\.client\)\./g)?.length).toBe(3)
    expect(out).not.toMatch(/\)\n\s*\(props\.client\)/)
  })

  // The control group. A `;` that is not needed, or one that CHANGES meaning,
  // would be a regression of its own.
  test('semicolon-style code is byte-identical (no separator added)', () => {
    const out = compile(`export function C(props: { client: { a(): void } }) {
  const api = props.client;
  const run = () => {
    const seq = 1;
    api.a();
  };
  return <button onClick={run}>x</button>;
}`)
    expect(errors(out)).toEqual([])
    expect(out).not.toContain(';(props.client)')
  })

  test('the FIRST statement of a block gets no separator', () => {
    const out = compile(`export function C(props: { client: { a(): void } }) {
  const api = props.client
  const run = () => {
    api.a()
  }
  return <button onClick={run}>x</button>
}`)
    expect(errors(out)).toEqual([])
    expect(out).not.toContain(';(props.client)')
  })

  test('a sole-child statement (`if (c) api.a()`) is NOT given a `;` — it would end the `if` with an empty statement', () => {
    const out = compile(`export function C(props: { client: { a(): void }; on: boolean }) {
  const api = props.client
  const run = () => {
    const seq = 1
    if (props.on) api.a()
  }
  return <button onClick={run}>x</button>
}`)
    expect(errors(out)).toEqual([])
    // No `if (…) ;(…)`: that would make the call unconditional.
    expect(out).not.toMatch(/if \([^)]*\)\s*;\(/)
  })

  test('after a closing block the next statement needs no separator', () => {
    const out = compile(`export function C(props: { client: { a(): void } }) {
  const api = props.client
  const run = () => {
    if (props.client) {
      console.log(1)
    }
    api.a()
  }
  return <button onClick={run}>x</button>
}`)
    expect(errors(out)).toEqual([])
    expect(out).not.toContain(';(props.client)')
  })
})

describe('the two backends agree byte for byte on these shapes', () => {
  test.skipIf(!native)('the issue example emits identically', () => {
    expect(native!(ISSUE, 't.tsx', false, null).code).toBe(transformJSX_JS(ISSUE, 't.tsx').code)
  })
})
