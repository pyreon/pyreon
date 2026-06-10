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
