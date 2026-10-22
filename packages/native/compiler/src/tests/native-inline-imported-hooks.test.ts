// Hooks imported from another file (`import { useMe } from './hooks'`), inlined when the calling file is on disk.
//
// Before this, such a call was emitted UNCHANGED — `let me = useMe(auth)` — with zero warnings, and the native build
// failed on a function that does not exist natively. Real apps keep their hooks in a `hooks.ts`, so that was the
// common case failing silently. The module is now read and the hook inlined like a same-file one, carrying the imports
// and types its body needs; anything that cannot cross is NAMED.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { inlineCustomHooks } from '../inline-hooks'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const root = mkdtempSync(join(tmpdir(), 'pyreon-imported-hooks-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** Write `files` under a fresh directory and return the absolute path of `entry`. */
let n = 0
function project(files: Record<string, string>, entry = 'App.tsx'): { path: string; source: string } {
  const dir = join(root, `p${n++}`)
  for (const [rel, text] of Object.entries(files)) {
    const file = join(dir, rel)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, text)
  }
  return { path: join(dir, entry), source: files[entry]! }
}

const both = ['swift', 'kotlin'] as const

const HOOKS = `import { useOidc } from '@pyreon/auth'
import { useQuery } from '@pyreon/query'

export type Me = { name: string; email: string }

export function useMe(auth: ReturnType<typeof useOidc>) {
  return useQuery<Me>(() => ({
    queryKey: ['me', auth.subject() ?? 'anonymous'],
    queryFn: () =>
      fetch('https://api.example.com/me', {
        headers: { authorization: \`Bearer \${auth.accessToken() ?? ''}\` },
      }).then((r) => r.json()),
    enabled: auth.isAuthenticated(),
  }))
}
`

const APP = `import { useOidc } from '@pyreon/auth'
import { Stack, Text } from '@pyreon/primitives'
import { useMe } from './hooks'

export function Account() {
  const auth = useOidc({ issuer: 'https://idp.example', clientId: 'app', redirectUri: 'com.example.app:/cb' })
  const me = useMe(auth)
  return (
    <Stack>
      <Text>{me.data()?.name ?? auth.status()}</Text>
    </Stack>
  )
}
`

describe('a hook imported from ./hooks', () => {
  const p = project({ 'App.tsx': APP, 'hooks.ts': HOOKS })

  it('lowers with zero warnings on both targets, and no call to the hook is left in the emit', () => {
    // Zero warnings alone is what the BROKEN state looked like too — the call was emitted unchanged, silently.
    for (const target of both) {
      const r = transform(p.source, { target, filename: p.path })
      expect(r.warnings, target).toEqual([])
      expect(r.code, target).not.toMatch(/\buseMe\(/)
    }
  })

  it('brings what the body needs: its imports and its types, and drops the spent import', () => {
    const code = inlineCustomHooks(p.source, p.path)!.code
    expect(code).toContain("import { useQuery } from '@pyreon/query'")
    expect(code).toContain('type Me = { name: string; email: string }')
    expect(code).not.toContain("from './hooks'")
    expect(code).toMatch(/const me = useQuery<Me>/)
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(p.source, { target: 'swift', filename: p.path }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(p.source, { target: 'kotlin', filename: p.path }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)

  it('an aliased import inlines under the alias', () => {
    const q = project({ 'App.tsx': APP.replace("import { useMe } from './hooks'", "import { useMe as useProfile } from './hooks'").replace('useMe(auth)', 'useProfile(auth)'), 'hooks.ts': HOOKS })
    for (const target of both) {
      const r = transform(q.source, { target, filename: q.path })
      expect(r.warnings, target).toEqual([])
      expect(r.code, target).not.toMatch(/\buse(Me|Profile)\(/)
    }
  })
})

describe('composition across modules — a hook calling a hook from yet another file', () => {
  const p = project(
    {
      'App.tsx': `import { Stack, Text, Button } from '@pyreon/primitives'
import { useLabelled } from './lib/labelled'

export function App() {
  const { label, increment } = useLabelled('n=')
  return <Stack><Text>{label()}</Text><Button onPress={increment}>+</Button></Stack>
}
`,
      'lib/labelled.ts': `import { computed } from '@pyreon/reactivity'
import { useCounter } from './counter'

export function useLabelled(prefix: string) {
  const { count, increment } = useCounter(10)
  const label = computed(() => prefix + count())
  return { label, increment }
}
`,
      'lib/counter.ts': `import { signal } from '@pyreon/reactivity'

export function useCounter(start: number) {
  const count = signal(start)
  const increment = () => count.set(count() + 1)
  return { count, increment }
}
`,
    },
  )

  it('inlines through both files, rebasing the inner import to the calling file', () => {
    const code = inlineCustomHooks(p.source, p.path)!.code
    expect(code).toMatch(/signal\(10\)/)
    expect(code).toContain("import { computed } from '@pyreon/reactivity'")
    expect(code).not.toMatch(/from '\.\/(lib\/)?(labelled|counter)'/)
    for (const target of both) expect(transform(p.source, { target, filename: p.path }).warnings, target).toEqual([])
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(p.source, { target: 'kotlin', filename: p.path }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})

describe('what cannot be inlined from another file is NAMED — never emitted as an uncompilable call', () => {
  const app = (imp: string) => `import { Stack, Text } from '@pyreon/primitives'
${imp}
export function App() {
  const v = useValue()
  return <Stack><Text>{v()}</Text></Stack>
}
`
  it('the module cannot be found', () => {
    const p = project({ 'App.tsx': app("import { useValue } from './missing'") })
    for (const target of both) {
      expect(transform(p.source, { target, filename: p.path }).warnings.join('\n'), target).toMatch(/useValue\(\) is a hook imported from another file.*'\.\/missing' was not found/)
    }
  })

  it('the file was compiled from memory, so there is no directory to read from', () => {
    const r = transform(app("import { useValue } from './hooks'"), { target: 'swift' })
    expect(r.warnings.join('\n')).toMatch(/compiled from memory rather than from a path/)
  })

  it('the hook uses a value its own module declares', () => {
    const p = project({
      'App.tsx': app("import { useValue } from './hooks'"),
      'hooks.ts': `import { signal } from '@pyreon/reactivity'
const START = 5
export function useValue() { const v = signal(START); return v }
`,
    })
    expect(transform(p.source, { target: 'swift', filename: p.path }).warnings.join('\n')).toMatch(/it uses `START`, which its own module declares/)
  })

  it('a name it needs is already bound differently in the calling file', () => {
    const p = project({
      'App.tsx': `import { Stack, Text } from '@pyreon/primitives'
import { useValue } from './hooks'
import { signal } from './my-signal'
export function App() {
  const v = useValue()
  const w = signal
  return <Stack><Text>{v()}</Text></Stack>
}
`,
      'hooks.ts': `import { signal } from '@pyreon/reactivity'
export function useValue() { const v = signal(1); return v }
`,
    })
    expect(transform(p.source, { target: 'swift', filename: p.path }).warnings.join('\n')).toMatch(/it needs `signal` from '@pyreon\/reactivity', but this file already uses that name/)
  })

  it('the hook is not exported', () => {
    const p = project({
      'App.tsx': app("import { useValue } from './hooks'"),
      'hooks.ts': `import { signal } from '@pyreon/reactivity'
function useValue() { const v = signal(1); return v }
`,
    })
    expect(transform(p.source, { target: 'swift', filename: p.path }).warnings.join('\n')).toMatch(/exports no hook named `useValue`/)
  })
})

describe('types imported from a sibling module are copied in', () => {
  const p = project({
    'App.tsx': `import { Stack, Text } from '@pyreon/primitives'
import { useFetch } from '@pyreon/hooks'
import type { Order } from './types'

export function Orders() {
  const o = useFetch<Order>('https://api.example.com/order')
  return <Stack><Text>{o.data()?.customer.name ?? ''}</Text></Stack>
}
`,
    'types.ts': `export interface Customer { name: string }
export type Order = { id: string; customer: Customer }
`,
  })

  it('the type and the types it names arrive, and the spent import is dropped', () => {
    const code = inlineCustomHooks(p.source, p.path)!.code
    expect(code).toContain('type Order = { id: string; customer: Customer }')
    expect(code).toContain('interface Customer { name: string }')
    expect(code).not.toContain("from './types'")
  })

  it('lowers with zero warnings and synthesises the structs on both targets', () => {
    const s = transform(p.source, { target: 'swift', filename: p.path })
    expect(s.warnings).toEqual([])
    expect(s.code).toMatch(/struct Order: Codable/)
    expect(s.code).toMatch(/struct Customer: Codable/)
    const k = transform(p.source, { target: 'kotlin', filename: p.path })
    expect(k.warnings).toEqual([])
    expect(k.code).toMatch(/data class Order\(/)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(p.source, { target: 'kotlin', filename: p.path }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)

  it('a different same-named declaration here is refused by name', () => {
    const q = project({
      'App.tsx': p.source.replace("import type { Order } from './types'", "import type { Order } from './types'\ninterface Customer { id: number }"),
      'types.ts': `export interface Customer { name: string }
export type Order = { id: string; customer: Customer }
`,
    })
    expect(transform(q.source, { target: 'swift', filename: q.path }).warnings.join('\n')).toMatch(/The type `Order` imported from '\.\/types' cannot be copied in for native: `Customer` is already declared differently/)
  })
})

describe('barrels, default exports and aliased exports are followed to the defining module', () => {
  const COUNTER = `import { signal } from '@pyreon/reactivity'
export function useCounter(start: number) {
  const count = signal(start)
  const increment = () => count.set(count() + 1)
  return { count, increment }
}
`
  const APP = (imp: string, call: string) => `import { Stack, Text, Button } from '@pyreon/primitives'
${imp}
export function App() {
  const { count, increment } = ${call}(1)
  return <Stack><Text>{count()}</Text><Button onPress={increment}>+</Button></Stack>
}
`
  const cases: [string, Record<string, string>, string, string][] = [
    ['a named re-export in a barrel index.ts', { 'hooks/index.ts': "export { useCounter } from './counter'\n", 'hooks/counter.ts': COUNTER }, "import { useCounter } from './hooks'", 'useCounter'],
    ['`export *` in a barrel', { 'hooks/index.ts': "export * from './counter'\n", 'hooks/counter.ts': COUNTER }, "import { useCounter } from './hooks'", 'useCounter'],
    ['a barrel two levels deep', { 'lib/index.ts': "export * from './hooks'\n", 'lib/hooks/index.ts': "export { useCounter } from './counter'\n", 'lib/hooks/counter.ts': COUNTER }, "import { useCounter } from './lib'", 'useCounter'],
    ['a default-exported named hook', { 'counter.ts': COUNTER.replace('export function useCounter', 'export default function useCounter') }, "import useCounter from './counter'", 'useCounter'],
    ['a default-exported anonymous hook', { 'counter.ts': COUNTER.replace('export function useCounter(start: number)', 'export default function (start: number)') }, "import useCounter from './counter'", 'useCounter'],
    ['an aliased export', { 'counter.ts': COUNTER.replace('export function useCounter', 'function useInner') + 'export { useInner as useCounter }\n' }, "import { useCounter } from './counter'", 'useCounter'],
    ['a re-exported default (`export { default as useCounter }`)', { 'hooks.ts': "export { default as useCounter } from './counter'\n", 'counter.ts': COUNTER.replace('export function useCounter', 'export default function useCounter') }, "import { useCounter } from './hooks'", 'useCounter'],
  ]
  for (const [what, files, imp, call] of cases) {
    it(what, () => {
      const p = project({ 'App.tsx': APP(imp, call), ...files })
      for (const target of both) {
        const r = transform(p.source, { target, filename: p.path })
        expect(r.warnings, target).toEqual([])
        expect(r.code, target).not.toMatch(/\buseCounter\(/)
      }
      expect(inlineCustomHooks(p.source, p.path)!.code).toContain("import { signal } from '@pyreon/reactivity'")
    })
  }

  it('a re-export cycle is reported by name, not followed forever', () => {
    const p = project({
      'App.tsx': APP("import { useCounter } from './a'", 'useCounter'),
      'a.ts': "export * from './b'\n",
      'b.ts': "export * from './a'\n",
    })
    expect(transform(p.source, { target: 'swift', filename: p.path }).warnings.join('\n')).toMatch(/useCounter\(\) is a hook imported from another file that cannot be inlined into App/)
  })
})
