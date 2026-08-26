// The provider the WEB requires must be carryable in shared source.
//
// `@pyreon/query`'s `useQuery` reads its client from `<QueryClientProvider>` on
// the web — omit it and the hook throws `No QueryClient found`. The native
// lowering is self-contained: `useQuery` becomes a `PyreonQuery` that holds its
// own state, so there is no client and nothing to provide.
//
// That asymmetry meant the shape a web app MUST write had no native dispatch
// entry, and fell through to the generic path, which emitted a
// `QueryClientProvider(client:)` view that exists on neither target, plus junk
// for the client binding. Both silent: zero warnings, and nothing in the suite
// compiled the result. Same class as the `<RouterLink>` gap.
//
// NOTE the first cut of this test used `createQueryClient()` — a name I made
// up. `@pyreon/query` re-exports the query-core class, so the real API is
// `new QueryClient()`, and the recognizer keyed on a function that does not
// exist. It passed, because the compiler pattern-matches call names and never
// resolves the import. Wiring the provider into a real app is what exposed it.
//
// The lowering is therefore: the provider is TRANSPARENT (its children are the
// whole emit) and the client binding emits NOTHING.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `import { QueryClientProvider, QueryClient, useQuery } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const client = new QueryClient()
  const q = useQuery<string>(() => ({ queryKey: ['g'], queryFn: () => fetch('https://e.com/g').then((r) => r.text()) }))
  return (<QueryClientProvider client={client}><Stack><Text>{q.data}</Text></Stack></QueryClientProvider>)
}`

describe('<QueryClientProvider> is transparent on native', () => {
  it('emits neither the provider nor the client binding (Swift)', () => {
    const { code, warnings } = transform(SRC, { target: 'swift' })
    expect(code).not.toContain('QueryClientProvider')
    expect(code).not.toContain('QueryClient(')
    // ...while the children it wrapped still render, and the query still lowers.
    expect(code).toContain('PyreonQuery<String>')
    expect(code).toContain('Text(verbatim:')
    expect(warnings ?? []).toEqual([])
  })

  it('emits neither the provider nor the client binding (Kotlin)', () => {
    const { code, warnings } = transform(SRC, { target: 'kotlin' })
    expect(code).not.toContain('QueryClientProvider')
    expect(code).not.toContain('QueryClient(')
    expect(code).toContain('PyreonQuery<String>')
    expect(code).toContain('Text(text =')
    expect(warnings ?? []).toEqual([])
  })

  // The load-bearing pair. An emit assertion cannot tell a valid view from an
  // invented one — only the compiler can, and the shipped bug was precisely an
  // invented view that read fine as a string.
  // The spec that would have caught the fabricated name. The recognizer keys on
  // a source pattern and never resolves the import, so it cannot tell a real
  // export from an invented one — this asserts against the package's OWN export
  // list, which can.
  it('keys on a name @pyreon/query actually exports', async () => {
    const queryExports = await import('@pyreon/query')
    expect(Object.keys(queryExports)).toContain('QueryClient')
    expect(Object.keys(queryExports)).not.toContain('createQueryClient')
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift typechecks', () => {
    const r = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.error).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error).toBe(true)
  })
})
