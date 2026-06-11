// Fetch-arc compiler shapes (2026-06-10): `??` nullish coalescing,
// fetch-field CALL reads, and computed-over-fetch inference — the three
// gaps the quotes-screen shape test surfaced.
//
// Pre-arc: `??` warned "Unsupported logical operator" and emitted a
// BROKEN `{ "" }` literal; `quotes.data()` (the web signal-read shape)
// kept its call parens (illegal property call on Swift, `.value()` on
// Kotlin); and a computed over fetch data inferred `Any`, failing the
// SwiftUI ForEach typecheck.
//
// Bisect sites: the `'??'` arm in parse.ts's LogicalExpression case;
// the fetch-field call rewrites in both emitters' call cases; the
// `fetches` map in infer-type.ts.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const QUOTES_SRC = `
  type Quote = { id: number; text: string; author: string }
  export function QuotesPage() {
    const quotes = useFetch<Quote[]>('http://127.0.0.1:8787/quotes.json')
    const quoteList = computed(() => quotes.data() ?? [])
    return (
      <Stack gap={3} data-testid="quotes-page">
        <Show when={quotes.isPending}>
          <Text data-testid="quotes-loading">Loading…</Text>
        </Show>
        <For each={quoteList} by={(q) => q.id}>
          {(q) => <Text>{q.text}</Text>}
        </For>
        <Button onPress={() => quotes.refetch()} data-testid="quotes-refetch">Refetch</Button>
      </Stack>
    )
  }
`

describe('?? nullish coalescing', () => {
  it('Swift: lowers to native ?? (parenthesized — Swift precedence is lower than JS)', () => {
    const r = transform(QUOTES_SRC, { target: 'swift' })
    expect(r.code).toContain('(quotes.data ?? [])')
    expect(r.warnings ?? []).not.toContain('Unsupported logical operator: ??.')
  })

  it('Kotlin: lowers to the Elvis operator (parenthesized)', () => {
    const r = transform(QUOTES_SRC, { target: 'kotlin' })
    expect(r.code).toContain('(quotes.data.value ?: listOf())')
    expect(r.warnings ?? []).not.toContain('Unsupported logical operator: ??.')
  })
})

describe('fetch-field CALL reads (web signal-read shape)', () => {
  it('Swift: quotes.data() drops parens to a property read; refetch() keeps them', () => {
    const out = transform(QUOTES_SRC, { target: 'swift' }).code
    expect(out).not.toContain('quotes.data()')
    expect(out).toContain('quotes.refetch()')
  })

  it('Kotlin: quotes.data() reads through .value; refetch() keeps parens, no .value', () => {
    const out = transform(QUOTES_SRC, { target: 'kotlin' }).code
    expect(out).not.toContain('quotes.data.value()')
    expect(out).toContain('quotes.refetch()')
    expect(out).not.toContain('refetch.value')
  })
})

describe('computed-over-fetch inference', () => {
  it('Swift: quoteList infers the decoded array type, not Any', () => {
    const out = transform(QUOTES_SRC, { target: 'swift' }).code
    expect(out).toContain('private var quoteList: [Quote] { (quotes.data ?? []) }')
    expect(out).not.toContain('quoteList: Any')
  })

  it('Kotlin: derivedStateOf body reads MutableState through .value', () => {
    const out = transform(QUOTES_SRC, { target: 'kotlin' }).code
    expect(out).toContain('val quoteList by remember { derivedStateOf { (quotes.data.value ?: listOf()) } }')
  })

  it('isPending in a Show condition stays a bare property (Swift) / .value read (Kotlin)', () => {
    const swift = transform(QUOTES_SRC, { target: 'swift' }).code
    expect(swift).toContain('if quotes.isPending {')
    const kotlin = transform(QUOTES_SRC, { target: 'kotlin' }).code
    expect(kotlin).toContain('if (quotes.isPending.value) {')
  })
})

describe('nullish-expression lowering (round-5, device-found)', () => {
  // `undefined` as a VALUE expression emitted the bare identifier
  // `undefined` (unresolved reference on BOTH targets), and the JS
  // `null` literal emitted the token `null` — valid Kotlin, INVALID
  // Swift (whose nullish value is `nil`). Found building the quotes
  // screen's error state. Bisect sites: the `undefined` arm in
  // parse.ts's Identifier case; the `e.value === null` arms in both
  // literal emits.
  const ERR_SRC = `
    type Quote = { id: number; text: string }
    export function P() {
      const quotes = useFetch<Quote[]>('http://127.0.0.1:8787/q.json')
      return (
        <Stack>
          <Show when={() => quotes.error() !== undefined}>
            <Text data-testid="quotes-error">{quotes.error}</Text>
          </Show>
        </Stack>
      )
    }
  `

  it('Swift: undefined lowers to nil', () => {
    const out = transform(ERR_SRC, { target: 'swift' }).code
    expect(out).toContain('if quotes.error != nil {')
    expect(out).not.toContain('undefined')
  })

  it('Kotlin: undefined lowers to null', () => {
    const out = transform(ERR_SRC, { target: 'kotlin' }).code
    expect(out).toContain('if (quotes.error.value != null) {')
    expect(out).not.toContain('undefined')
  })

  it('Swift: the null literal lowers to nil too', () => {
    const out = transform(
      ERR_SRC.replace('!== undefined', '!== null'),
      { target: 'swift' },
    ).code
    expect(out).toContain('if quotes.error != nil {')
  })
})

describe('Swift `.task` stable-host wrap (device-found)', () => {
  // A fetch-bearing component appends a mount-time `.task { begin →
  // resolve|reject }`. SwiftUI ties a `.task`'s lifetime to the host
  // view's IDENTITY: when attached to a transparent `Group { if
  // isPending … }` (what <Suspense>/<ErrorBoundary> emit), SwiftUI
  // redistributes the modifier onto the if/else BRANCH, so each
  // loading/error flip changes the branch identity and CANCELS +
  // RESTARTS the task → the fetch perpetually thrashes and NEVER
  // settles. On a real Simulator the boundary rendered NOTHING — not
  // even its fallback (compile-only `swiftc -typecheck` can't catch a
  // runtime view-lifecycle bug; only the device gate did).
  //
  // Fix: wrap the fetch-component body in a concrete `ZStack` so `.task`
  // attaches to a STABLE-identity host that fires once on appear; the
  // inner conditional's flips no longer touch it.
  //
  // Bisect: drop the `_hasFetchDecl` ZStack branch in
  // emit-swift.ts:emitSwiftComponent → these specs fail (no ZStack
  // wrapper) and the iOS lifecycle UITest regresses to rendering
  // nothing.
  const SUSPENSE_FETCH = `
    type Quote = { id: number; text: string }
    export function SuspenseDemo() {
      const ok = useFetch<Quote[]>('http://127.0.0.1:8787/quotes.json')
      const okList = computed(() => ok.data() ?? [])
      return (
        <Suspense fallback={<Text data-testid="lc-loading">Loading…</Text>}>
          <For each={okList} by={(q) => q.id}>{(q) => <Text>{q.text}</Text>}</For>
        </Suspense>
      )
    }
  `

  it('Swift: a fetch component wraps its body in a ZStack hosting the .task', () => {
    const out = transform(SUSPENSE_FETCH, { target: 'swift' }).code
    // The body opens with ZStack { … } and the .task trails it.
    expect(out).toContain('var body: some View {\n    ZStack {')
    // The conditional Group is now INSIDE the ZStack, and the .task
    // attaches to the ZStack (stable), not the Group.
    expect(out).toMatch(/ZStack \{[\s\S]*Group \{[\s\S]*if ok\.isPending[\s\S]*\}\s*\}\s*\n\s*\.task \{/)
  })

  it('Swift: a NON-fetch component keeps the bare body (no spurious ZStack)', () => {
    const PLAIN = `
      export function Plain() {
        return <Stack><Text>plain</Text></Stack>
      }
    `
    const out = transform(PLAIN, { target: 'swift' }).code
    expect(out).not.toContain('ZStack {')
    expect(out).not.toContain('.task {')
  })

  it('Kotlin: the fetch harness is a stable LaunchedEffect(Unit) sibling (no wrap needed)', () => {
    // Compose `LaunchedEffect(Unit)` is keyed by the stable `Unit`, so it
    // runs ONCE and is not cancelled when isPending flips (just a
    // recomposition). No ZStack-equivalent wrap is needed or emitted.
    const out = transform(SUSPENSE_FETCH, { target: 'kotlin' }).code
    expect(out).toContain('LaunchedEffect(Unit) {')
    expect(out).not.toContain('ZStack')
  })
})
