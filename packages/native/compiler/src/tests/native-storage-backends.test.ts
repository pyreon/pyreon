// `@pyreon/storage` exports five backends; only `useStorage` lowered. The
// other four warned with the GENERIC line, which left an author unable to
// tell whether their backend was merely unimplemented or genuinely
// impossible — two very different pieces of news.
//
// Two of the four have an exact native analogue and now lower. The other two
// have none at all, and say so by name.
//
//   useSessionStorage → plain state. On the web sessionStorage survives a
//                       reload and dies with the tab; native has neither a
//                       tab nor a reload, so the PROCESS is the session and
//                       in-memory state is the analogue, not an
//                       approximation of one.
//   useMemoryStorage  → plain state, definitionally.
//   useCookie         → nothing. A native app has no cookie jar its own UI
//                       reads from.
//   useIndexedDB      → nothing — but `useDatabase()` lowers to SQLite on
//                       both targets, which is the answer the author wants.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'

const app = (hook: string) => `import { ${hook} } from '@pyreon/storage'
import { Text } from '@pyreon/primitives'
export function App() {
  const v = ${hook}<string>('k', 'd')
  return <Text>{v()}</Text>
}`

describe('process-scoped backends lower to plain state', () => {
  for (const hook of ['useSessionStorage', 'useMemoryStorage'] as const) {
    it(`${hook}: Swift is @State, NOT @AppStorage`, () => {
      const out = transform(app(hook), { target: 'swift' }).code
      expect(out).toContain('@State private var v: String = "d"')
      // The load-bearing negative: persisting would make the value outlive
      // the process, which is the opposite of what both hooks mean.
      expect(out).not.toContain('@AppStorage')
    })

    it(`${hook}: Kotlin is mutableStateOf, NOT rememberSaveable`, () => {
      const out = transform(app(hook), { target: 'kotlin' }).code
      expect(out).toContain('mutableStateOf("d")')
      expect(out).not.toContain('rememberSaveable')
    })

    it(`${hook} emits no warning`, () => {
      expect(transform(app(hook), { target: 'swift' }).warnings).toEqual([])
    })
  }

  it('useStorage still persists — the distinction is the whole point', () => {
    expect(transform(app('useStorage'), { target: 'swift' }).code).toContain('@AppStorage')
  })
})

describe('backends with no analogue decline BY NAME', () => {
  for (const hook of ['useCookie', 'useIndexedDB'] as const) {
    it(`${hook} explains why, and names what to use instead`, () => {
      const w = transform(app(hook), { target: 'swift' }).warnings.join('\n')
      expect(w).toContain('no native analogue')
      // Not the generic "replace it with a hook PMTC lowers" tail.
      expect(w).not.toContain('The lowered set is NATIVE_LOWERED_HOOKS')
    })
  }

  it('the indexedDB advice names useDatabase, which actually lowers', () => {
    const w = transform(app('useIndexedDB'), { target: 'swift' }).warnings.join('\n')
    expect(w).toContain('useDatabase()')
    expect(w).toContain('SQLite')
  })
})

// The module-scope decline moved from a hand-written `useStorage` check in the parser to the plugin's
// `componentOnlyCalls`, which also covers the two process-scoped backends (they used to fall through to a verbatim emit).
describe('a storage hook declared at file scope is named, not printed verbatim', () => {
  for (const hook of ['useStorage', 'useSessionStorage', 'useMemoryStorage'] as const) {
    it(`${hook}: says the placement is wrong, on both targets`, () => {
      const src = `import { ${hook} } from '@pyreon/storage'
import { Text } from '@pyreon/primitives'
const kept = ${hook}('k', 1)
export function App() { return <Text>x</Text> }`
      for (const target of ['swift', 'kotlin'] as const) {
        const w = transform(src, { target }).warnings.join('\n')
        expect(w, target).toContain(`${hook}() lowers to native only INSIDE a component body`)
        expect(w, target).toContain('`kept` is declared at file scope')
      }
    })
  }
})
