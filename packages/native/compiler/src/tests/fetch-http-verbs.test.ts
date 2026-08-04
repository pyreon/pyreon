// HTTP verbs through `useFetch(url, { method, headers, body })`, and the two
// pre-existing bugs the probe for them surfaced.
//
// ## What was broken
//
// 1. **The init object was READ BY NOBODY.** The parser only ever looked at
//    `arguments[0]`, so `{ method: 'POST', body }` was dropped in silence and
//    BOTH targets emitted a plain GET. The app compiled, ran, and performed
//    the wrong verb with no diagnostic anywhere — worse than not supporting
//    verbs, because nothing said so. Meanwhile `PyreonHttp` had shipped on
//    both runtimes WITH full verb support and nothing lowering to it: Swift
//    had a live URLSession edge no emit called, Android had an executor
//    interface with no implementation at all.
//
// 2. **`fetch.data()` inferred a bare `T`.** Every layer declares it optional
//    (web `signal<T | undefined>`, Swift `var data: T?`, Kotlin
//    `MutableState<T?>`), but the inference said `T`, so the Swift member emit
//    judged the receiver provably non-null and STRIPPED the `?.` the author
//    wrote: `created.data()?.id` became `created.data.id` — uncompilable
//    ("value of optional type 'Item?' must be unwrapped"). It hid because
//    every device-proven example fetches an ARRAY and reads `data() ?? []`, a
//    `??` fallback, never an optional MEMBER access — so the single-object
//    shape, which is the natural one for a POST reply, had never been compiled.
//
// 3. **`fetch.error()` in CALL form inferred `unknown`.** `SERVICE_OPTIONAL_FIELDS`
//    types the MEMBER read as optional, but shared source writes the CALL form
//    (web reads a signal), which fell through — so `{f.error() ? 'a' : 'b'}`
//    emitted a bare `Throwable?` as a Kotlin condition ("condition type
//    mismatch"). Same class as the `if (token)` session-rehydrate shape.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const src = (decl: string, read = `{p.data()?.id ?? 'none'}`) => `
  interface Item { id: string }
  export function P() {
    ${decl}
    return <Stack><Text>Id: ${read}</Text></Stack>
  }
`

const swift = (s: string) => transform(s, { target: 'swift' }).code
const kotlin = (s: string) => transform(s, { target: 'kotlin' }).code

describe('useFetch init — the verb reaches the emitted request', () => {
  const POST = src(
    `const p = useFetch<Item>('http://h/i', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' })`,
  )

  it('lowers a POST to PyreonHttp on Swift, carrying headers and body', () => {
    const out = swift(POST)
    expect(out).toContain('PyreonHttp.send(')
    expect(out).toContain('method: .post')
    expect(out).toContain('headers: ["Content-Type": "application/json"]')
    expect(out).toContain('body: Data("{\\"a\\":1}".utf8)')
    // The pre-fix shape — a bare GET that ignored every option.
    expect(out).not.toContain('URLSession.shared.data(from:')
  })

  it('lowers a POST to PyreonHttp on Kotlin, carrying headers and body', () => {
    const out = kotlin(POST)
    expect(out).toContain('PyreonHttp.send(')
    expect(out).toContain('method = PyreonHttpMethod.POST')
    expect(out).toContain('headers = mapOf("Content-Type" to "application/json")')
    expect(out).toContain('body = "{\\"a\\":1}"')
    expect(out).not.toContain('readText()')
  })

  it('rejects a non-2xx instead of handing an error page to the decoder', () => {
    // A decode failure on an error page reads as "the server sent bad JSON",
    // which sends the reader to their model types instead of the status.
    expect(swift(POST)).toContain('guard __response.isOK else {')
    expect(kotlin(POST)).toContain('if (!__response.isOk) throw PyreonHttpError.BadStatus')
  })

  it('leaves a BARE useFetch on the existing device-proven GET path', () => {
    // Deliberate: that path is device-proven, and re-routing it would put a
    // proven path behind a brand-new Android executor. Unifying the two once
    // this one is device-proven is the follow-up.
    const GET = src(`const p = useFetch<Item>('http://h/i')`)
    expect(swift(GET)).toContain('URLSession.shared.data(from:')
    expect(swift(GET)).not.toContain('PyreonHttp.send(')
    expect(kotlin(GET)).toContain('readText()')
    expect(kotlin(GET)).not.toContain('PyreonHttp.send(')
  })

  it('carries a verb with no body (a DELETE / PUT)', () => {
    const DEL = src(`const p = useFetch<Item>('http://h/i', { method: 'DELETE' })`)
    // Assert on the REQUEST line, not the whole file: SwiftUI's own
    // `var body: some View` also contains "body:".
    const swiftReq = swift(DEL).split('\n').find((l) => l.includes('PyreonHttpRequest('))!
    expect(swiftReq).toContain('method: .delete')
    expect(swiftReq).not.toContain('body:')
    const kotlinReq = kotlin(DEL).split('\n').find((l) => l.includes('PyreonHttpRequest('))!
    expect(kotlinReq).toContain('method = PyreonHttpMethod.DELETE')
    expect(kotlinReq).not.toContain('body =')
  })
})

describe('useFetch init — non-literals WARN rather than silently degrading', () => {
  // The whole bug class was silence. A value the compiler cannot bake must
  // say so: a request that quietly falls back to GET is a data-corrupting
  // no-op, not a missing feature.
  const warnings = (s: string) => transform(s, { target: 'swift' }).warnings ?? []

  it('warns when the init is not an object literal', () => {
    const w = warnings(src(`const p = useFetch<Item>('http://h/i', opts)`))
    expect(w.some((m) => /init must be an object literal/.test(m))).toBe(true)
  })

  it('warns when the method is not a string literal', () => {
    const w = warnings(src(`const p = useFetch<Item>('http://h/i', { method: verb })`))
    expect(w.some((m) => /method must be a string literal/.test(m))).toBe(true)
    expect(w.some((m) => /plain GET/.test(m))).toBe(true)
  })

  it('warns when the body is not a string literal (the JSON.stringify shape)', () => {
    const w = warnings(
      src(`const p = useFetch<Item>('http://h/i', { method: 'POST', body: JSON.stringify(o) })`),
    )
    expect(w.some((m) => /body must be a string literal/.test(m))).toBe(true)
    expect(w.some((m) => /NO body/.test(m))).toBe(true)
  })

  it('names an init option that has no native equivalent', () => {
    const w = warnings(src(`const p = useFetch<Item>('http://h/i', { credentials: 'include' })`))
    expect(w.some((m) => /"credentials" has no native equivalent/.test(m))).toBe(true)
  })
})

describe('fetch container optionality', () => {
  it('KEEPS the ?. on a single-object data read (Swift)', () => {
    // The bug: `created.data()?.id` emitted `created.data.id`, which does not
    // compile. Uncovered because every example reads `data() ?? []`.
    const out = swift(src(`const p = useFetch<Item>('http://h/i')`))
    expect(out).toContain('p.data?.id')
    expect(out).not.toContain('p.data.id')
  })

  it('KEEPS the ?. on a single-object data read (Kotlin)', () => {
    const out = kotlin(src(`const p = useFetch<Item>('http://h/i')`))
    expect(out).toContain('p.data.value?.id')
  })

  it('still emits the ?? array fallback the proven examples use', () => {
    // Regression guard for the inference change: the shape every device gate
    // depends on must be untouched.
    const arr = `
      interface Item { id: string }
      export function P() {
        const p = useFetch<Item[]>('http://h/i')
        const xs = computed(() => p.data() ?? [])
        return <Stack><Text>{xs().length}</Text></Stack>
      }
    `
    expect(swift(arr)).toContain('p.data ?? []')
    expect(kotlin(arr)).toContain('p.data.value ?: listOf()')
  })

  it('turns a truthiness check on error() into a null check, not a bare optional', () => {
    const e = src(`const p = useFetch<Item>('http://h/i')`, `{p.error() ? 'bad' : 'ok'}`)
    expect(swift(e)).toContain('p.error != nil')
    expect(kotlin(e)).toContain('p.error.value != null')
  })
})
