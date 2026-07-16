/**
 * `@pyreon/testing/query` — happy-dom suite.
 */
import { h } from '@pyreon/core'
import { useQuery, useQueryClient } from '@pyreon/query'
import { waitFor } from '@testing-library/dom'
import { describe, expect, it } from 'vitest'
import { createTestQueryClient, renderWithQueryClient } from '../query'

function Todos() {
  const query = useQuery(() => ({
    queryKey: ['todos'],
    queryFn: () => Promise.resolve([{ id: 1, title: 'write tests' }]),
  }))
  return <ul>{() => (query.data() ?? []).map((t) => h('li', null, t.title))}</ul>
}

function ClientProbe(props: { onClient: (client: unknown) => void }) {
  props.onClient(useQueryClient())
  return null
}

describe('createTestQueryClient', () => {
  it('defaults to retry: false + gcTime: Infinity for queries and mutations', () => {
    const client = createTestQueryClient()
    const defaults = client.getDefaultOptions()
    expect(defaults.queries?.retry).toBe(false)
    expect(defaults.queries?.gcTime).toBe(Number.POSITIVE_INFINITY)
    expect(defaults.mutations?.retry).toBe(false)
    expect(defaults.mutations?.gcTime).toBe(Number.POSITIVE_INFINITY)
  })

  it('user defaultOptions merge OVER the test defaults', () => {
    const client = createTestQueryClient({
      defaultOptions: { queries: { retry: 2, staleTime: 5_000 } },
    })
    const defaults = client.getDefaultOptions()
    expect(defaults.queries?.retry).toBe(2) // user override wins
    expect(defaults.queries?.staleTime).toBe(5_000)
    expect(defaults.queries?.gcTime).toBe(Number.POSITIVE_INFINITY) // default kept
    expect(defaults.mutations?.retry).toBe(false)
  })
})

describe('renderWithQueryClient', () => {
  it('provides a fresh isolated client per call', () => {
    let seenA: unknown
    let seenB: unknown
    const a = renderWithQueryClient(<ClientProbe onClient={(c) => (seenA = c)} />)
    const b = renderWithQueryClient(<ClientProbe onClient={(c) => (seenB = c)} />)
    expect(seenA).toBe(a.client)
    expect(seenB).toBe(b.client)
    expect(a.client).not.toBe(b.client)
  })

  it('a useQuery under the provider resolves against the test client', async () => {
    const { container } = renderWithQueryClient(<Todos />)
    await waitFor(() => {
      expect(container.textContent).toContain('write tests')
    })
  })

  it('setQueryData passthrough seeds/patches the cache', () => {
    const { client, setQueryData } = renderWithQueryClient(<div />)
    setQueryData(['todos'], [{ id: 1 }])
    expect(client.getQueryData(['todos'])).toEqual([{ id: 1 }])
  })

  it('accepts a pre-seeded client', () => {
    const client = createTestQueryClient()
    client.setQueryData(['n'], 42)
    const { client: returned } = renderWithQueryClient(<div />, { client })
    expect(returned).toBe(client)
    expect(returned.getQueryData(['n'])).toBe(42)
  })

  it('composes an outer wrapper', () => {
    const { container } = renderWithQueryClient(<span>inner</span>, {
      wrapper: (children) => <section data-outer="1">{children}</section>,
    })
    expect(container.querySelector('[data-outer="1"]')!.textContent).toBe('inner')
  })
})
