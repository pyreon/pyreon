// Branch matrices for the ASYNC + init-level arms of `emitSwiftComponent`:
// `useFetch` / `useQuery`'s two transports, the `.task` vs `.task(id:)` split,
// the rate-limiter's post-init action attach, and the synced-doc memberwise
// `init(...)` that props are threaded through.
//
// The transports are the sharp pair. A bare GET keeps a hand-written
// URLSession call (device-proven); anything carrying a VERB, HEADERS or a
// BODY routes through `PyreonHttp` instead — and that path adds a status
// guard, because handing an error page to `JSONDecoder` surfaces as "the
// server sent bad JSON" and HIDES the status. Each is asserted against the
// other.
//
// `.task` vs `.task(id:)` is the second: a query whose key is computed from a
// signal or prop must RE-KEY and re-run when it changes (matching the web's
// reactive queryKey), while a static literal key must not pay for that.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const swift = (src: string) => transform(src, { target: 'swift' }).code
const P = '@pyreon/primitives'

describe('useFetch — the bare-GET transport vs PyreonHttp', () => {
  const out = swift(`import { Stack, Text } from '${P}'
import { useFetch } from '@pyreon/hooks'
type U = { id: number }
export function App() {
  const f1 = useFetch<U>('https://x/1')
  const f2 = useFetch<U>('https://x/2', { method: 'POST', headers: { 'X-A': 'b' }, body: '{"n":1}' })
  const f3 = useFetch<U>('https://x/3', { method: 'PUT' })
  const f4 = useFetch<U>('https://x/4', { headers: { 'X-C': 'd' } })
  return (<Stack><Text>{() => \`\${f1.data()?.id}\${f2.data()?.id}\${f3.data()?.id}\${f4.data()?.id}\`}</Text></Stack>)
}`)

  it('a BARE GET keeps the hand-written URLSession call and decodes directly', () => {
    expect(out).toContain(
      'let (bytes, _) = try await URLSession.shared.data(from: URL(string: "https://x/1")!)',
    )
    expect(out).toContain('f1.resolve(try JSONDecoder().decode(U.self, from: bytes))')
  })

  it('a VERB, HEADERS or a BODY — any one of the three — routes through PyreonHttp', () => {
    expect(out).toContain(
      'PyreonHttpRequest(method: .post, url: "https://x/2", headers: ["X-A": "b"], body: Data("{\\"n\\":1}".utf8))',
    )
    // a verb alone: no headers arm, no body arm
    expect(out).toContain('PyreonHttpRequest(method: .put, url: "https://x/3")')
    // headers alone: the method DEFAULTS to GET rather than being omitted
    expect(out).toContain('PyreonHttpRequest(method: .get, url: "https://x/4", headers: ["X-C": "d"])')
  })

  it('the PyreonHttp path REJECTS a non-2xx instead of decoding the error page', () => {
    expect(out).toContain('guard __response.isOK else {')
    expect(out).toContain('throw PyreonHttpError.badStatus(__response.status)')
    expect(out).toContain('f2.resolve(try __response.decode(U.self))')
  })
})

describe('useQuery — `.task` vs `.task(id:)`, and the direct-value fetcher', () => {
  const out = swift(`import { Stack, Text } from '${P}'
import { useQuery } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
type U = { id: number }
export function App(props: { uid: number }) {
  const q = signal<string>('a')
  const qs = useQuery<U>(() => ({ queryKey: ['static'], queryFn: () => fetch('https://x/s').then((r) => r.json()) }))
  const qk = useQuery<U>(() => ({ queryKey: ['u', q()], queryFn: () => fetch('https://x/k').then((r) => r.json()) }))
  const qv = useQuery<number>(() => ({ queryKey: ['v'], queryFn: () => props.uid * 2 }))
  const qm = useQuery<U>(() => ({ queryKey: ['m'], queryFn: () => fetch('https://x/m', { method: 'POST', headers: { 'X-E': 'f' }, body: '{}' }).then((r) => r.json()) }))
  return (<Stack><Text>{() => \`\${qs.data()?.id}\${qk.data()?.id}\${qv.data()}\${qm.data()?.id}\`}</Text></Stack>)
}`)

  it('a STATIC literal key keeps the plain `.task {}` and never re-keys', () => {
    expect(out).toContain('.task {\n        if qs.isStale {')
    expect(out).not.toContain('qs.setKey(')
  })

  it('a key built from a SIGNAL re-keys the harness so a key change re-runs the fetch', () => {
    expect(out).toContain('.task(id: "u:\\(q)") {')
    expect(out).toContain('qk.setKey("u:\\(q)")')
  })

  it('a DIRECT-VALUE queryFn resolves the computed value — no network, no do/catch', () => {
    // the key here is a literal, so `.task(id:)` takes the JSON-stringified
    // queryKey rather than an emitted expression
    expect(out).toContain('.task(id: "v") {')
    expect(out).toContain('qv.setKey("v")')
    expect(out).toContain('qv.resolve(uid * 2)')
  })

  it('a query carrying a verb/headers/body routes through PyreonHttp with the status guard', () => {
    expect(out).toContain('PyreonHttpRequest(method: .post, url: "https://x/m", headers: ["X-E": "f"], body: Data("{}".utf8))')
    expect(out).toContain('qm.resolve(try __response.decode(U.self))')
  })

  it('every query guards on `isStale`, so a FRESH cache hit skips the network', () => {
    for (const n of ['qs', 'qk', 'qv', 'qm']) {
      expect(out).toContain(`if ${n}.isStale {`)
      expect(out).toContain(`${n}.begin()`)
    }
  })
})

describe('rate-limiter actions attach AFTER init', () => {
  it('the closure param is the callback’s own name, or `_` when it takes none', () => {
    // A @State initializer runs before `self` exists, so an action capturing
    // sibling state has to attach in `.onAppear`.
    const out = swift(`import { Stack, Text, Press } from '${P}'
import { signal } from '@pyreon/reactivity'
import { useDebouncedCallback, useThrottledCallback } from '@pyreon/hooks'
export function App() {
  const q = signal<string>('')
  const save = useDebouncedCallback((v: string) => { q.set(v) }, 400)
  const ping = useThrottledCallback(() => { q.set('p') }, 500)
  return (<Stack><Press onPress={() => save('a')}><Text>{() => q()}</Text></Press></Stack>)
}`)
    expect(out).toContain('.onAppear {\n        save.action = { v in q = v }')
    expect(out).toContain('.onAppear {\n        ping.action = { _ in q = "p" }')
  })
})

describe('a synced-doc component gains a memberwise `init(...)` threading its props', () => {
  it('an OPTIONAL prop takes a `= nil` default; a required one does not', () => {
    // Declaring the doc + signals as typed @State with no inline initializer
    // is what forces the explicit init: one @State cannot reference another
    // at property-init time.
    const out = swift(`import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
import { Stack, Text } from '${P}'
export function Collab(props: { room: string; nick?: string; limit?: number }) {
  const doc = new PyreonCrdtDoc()
  const title = syncedSignal({ doc, key: 'title', initial: '' })
  const count = syncedSignal({ doc, key: 'count', initial: 0 })
  const done = syncedSignal({ doc, key: 'done', initial: false })
  return (<Stack><Text>{() => \`\${props.room}\${title()}\${count()}\${done()}\`}</Text></Stack>)
}`)
    expect(out).toContain('init(room: String, nick: String? = nil, limit: Int? = nil) {')
    expect(out).toContain('self.room = room')
    expect(out).toContain('@State private var doc: PyreonCrdtDoc')
    expect(out).toContain('@State private var title: PyreonSyncedSignal<String>')
    expect(out).toContain('@State private var count: PyreonSyncedSignal<Double>')
    expect(out).toContain('@State private var done: PyreonSyncedSignal<Bool>')
    // the doc is built FIRST so each signal's initializer can name its local
    expect(out).toMatch(/let doc = PyreonCrdtDoc\(actor: UUID\(\)\.uuidString\)[\s\S]*_title = State\(initialValue:/)
  })
})

describe('emit-time warnings de-duplicate', () => {
  it('the same unmapped member method on two call sites warns ONCE', () => {
    const r = transform(
      `import { Stack, Text } from '${P}'
import { signal } from '@pyreon/reactivity'
export function App() {
  const xs = signal<number[]>([1])
  const a = () => { xs().copyWithin(0, 1); xs().copyWithin(1, 2) }
  return (<Stack><Text>{() => String(xs().length)}</Text></Stack>)
}`,
      { target: 'swift' },
    )
    const hits = r.warnings.filter((w) => w.includes('copyWithin'))
    expect(hits).toHaveLength(1)
  })

  it('a same-named method on a NON-array, NON-string receiver never warns', () => {
    const r = transform(
      `import { Stack, Text } from '${P}'
type Svc = { copyWithin: (a: number, b: number) => void }
export function App(props: { svc: Svc }) {
  const a = () => { props.svc.copyWithin(0, 1) }
  return (<Stack><Text>hi</Text></Stack>)
}`,
      { target: 'swift' },
    )
    expect(r.warnings.filter((w) => w.includes('copyWithin'))).toEqual([])
  })
})
