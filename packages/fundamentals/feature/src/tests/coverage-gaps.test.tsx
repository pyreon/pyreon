/**
 * Coverage-gap tests for @pyreon/feature.
 *
 * Each test here drives a specific real code path that the main
 * feature.test.tsx / integration.test.tsx suites don't reach:
 *  - createFetcher error-body branches (no `message`, non-JSON body)
 *  - createValidator custom-validate short-circuit
 *  - useList / useSearch optional `staleTime` / `enabled` spreads
 *  - useUpdate onError with no previous cache (optimistic-rollback skip)
 *  - useTable sorting/global-filter updaters (value + function form) and
 *    the pagination-row-model opt-in
 *  - schema.ts duck-typed v4 / edge-shape introspection paths
 *
 * All are genuine paths driven by real public API calls — no internal
 * reach-ins beyond the duck-typed schema shapes the module is explicitly
 * designed to accept (it validates "any Zod-like object", v3 OR v4).
 */
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { resetAllStores } from '@pyreon/store'
import { z } from 'zod'
import { defineFeature } from '../define-feature'
import { extractFields } from '../schema'

// ─── Helpers (mirrors feature.test.tsx) ─────────────────────────────────────────

function Capture<T>({ fn }: { fn: () => T }) {
  fn()
  return null
}

function mountWith<T>(client: QueryClient, fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement('div')
  document.body.appendChild(el)
  const unmount = mount(
    <QueryClientProvider client={client}>
      <Capture
        fn={() => {
          result = fn()
        }}
      />
    </QueryClientProvider>,
    el,
  )
  return {
    result: result!,
    unmount: () => {
      unmount()
      el.remove()
    },
  }
}

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(['admin', 'editor', 'viewer']),
  age: z.number().optional(),
  active: z.boolean(),
})

type UserValues = z.infer<typeof userSchema>

afterEach(() => {
  resetAllStores()
})

// ─── createFetcher error-body branches ──────────────────────────────────────────

describe('createFetcher — error body parsing', () => {
  // if@36#1: error body is valid JSON but carries no `message` field, so the
  // default `<METHOD> <url> failed: <status>` message is kept.
  it('keeps default message when error body has no `message` field', async () => {
    const users = defineFeature<UserValues>({
      name: 'cg-err-nomessage',
      schema: userSchema,
      api: '/api/users',
      fetcher: (async () =>
        new Response(JSON.stringify({ code: 'E_OOPS' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof fetch,
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result: query, unmount } = mountWith(client, () => users.useList())

    await new Promise((r) => setTimeout(r, 50))
    expect(query.isError()).toBe(true)
    const err = query.error() as Error & { status?: number }
    // No `message` in body → default message format, NOT "E_OOPS".
    expect(err.message).toBe('GET /api/users failed: 500')
    expect(err.status).toBe(500)
    unmount()
  })

  // if@44#1: error body is NOT valid JSON → res.json() throws a plain
  // SyntaxError (no `errors` property), so the catch falls through to the
  // generic Error throw at the bottom of request().
  it('falls back to default message when error body is not JSON', async () => {
    const users = defineFeature<UserValues>({
      name: 'cg-err-nonjson',
      schema: userSchema,
      api: '/api/users',
      fetcher: (async () =>
        new Response('<html>500 oops</html>', {
          status: 503,
          headers: { 'Content-Type': 'text/html' },
        })) as typeof fetch,
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result: query, unmount } = mountWith(client, () => users.useList())

    await new Promise((r) => setTimeout(r, 50))
    expect(query.isError()).toBe(true)
    const err = query.error() as Error & { status?: number; errors?: unknown }
    expect(err.message).toBe('GET /api/users failed: 503')
    expect(err.status).toBe(503)
    expect('errors' in err).toBe(false)
    unmount()
  })
})

// ─── createValidator custom-validate short-circuit ──────────────────────────────

describe('createValidator — custom validate', () => {
  // if@89#0: `config.validate` is provided → createValidator returns it
  // verbatim, skipping the zodSchema introspection branch.
  it('uses the provided custom validate fn over schema-derived validation', async () => {
    let customCalled = false
    const customValidate = (() => {
      customCalled = true
      return { name: 'too short' }
    }) as never

    const users = defineFeature<UserValues>({
      name: 'cg-custom-validate',
      schema: userSchema,
      api: '/api/users',
      validate: customValidate,
      fetcher: (async () => new Response('{}', { status: 200 })) as typeof fetch,
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () => users.useForm())

    // Trigger validation via the form's validate surface so the custom fn runs.
    await form.validate?.()
    expect(customCalled).toBe(true)
    unmount()
  })
})

// ─── useList optional staleTime / enabled spreads ───────────────────────────────

describe('useList — optional options spreads', () => {
  // cond-expr@206#0 + @207#0: both `staleTime` and `enabled` provided → both
  // conditional spreads take the truthy arm.
  it('spreads staleTime and enabled when provided', async () => {
    let fetched = false
    const users = defineFeature<UserValues>({
      name: 'cg-list-stale-enabled',
      schema: userSchema,
      api: '/api/users',
      fetcher: (async () => {
        fetched = true
        return new Response('[]', { status: 200 })
      }) as typeof fetch,
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result: query, unmount } = mountWith(client, () =>
      users.useList({ staleTime: 60_000, enabled: true }),
    )

    await new Promise((r) => setTimeout(r, 50))
    expect(fetched).toBe(true)
    expect(query.isError()).toBe(false)
    unmount()
  })

  it('does not fetch when enabled is false', async () => {
    let fetched = false
    const users = defineFeature<UserValues>({
      name: 'cg-list-disabled',
      schema: userSchema,
      api: '/api/users',
      fetcher: (async () => {
        fetched = true
        return new Response('[]', { status: 200 })
      }) as typeof fetch,
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result: query, unmount } = mountWith(client, () =>
      users.useList({ enabled: false }),
    )

    await new Promise((r) => setTimeout(r, 50))
    expect(fetched).toBe(false)
    expect(query.isFetching()).toBe(false)
    unmount()
  })
})

// ─── useSearch optional staleTime spread ────────────────────────────────────────

describe('useSearch — optional staleTime spread', () => {
  // cond-expr@225#0: `staleTime` provided to useSearch → conditional spread
  // takes the truthy arm.
  it('spreads staleTime when provided', async () => {
    let capturedUrl = ''
    const users = defineFeature<UserValues>({
      name: 'cg-search-stale',
      schema: userSchema,
      api: '/api/users',
      fetcher: (async (url: string) => {
        capturedUrl = url
        return new Response('[]', { status: 200 })
      }) as typeof fetch,
    })

    const term = signal('bob')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { unmount } = mountWith(client, () => users.useSearch(term, { staleTime: 30_000 }))

    await new Promise((r) => setTimeout(r, 50))
    expect(capturedUrl).toContain('q=bob')
    unmount()
  })
})

// ─── useUpdate onError with no previous cache ───────────────────────────────────

describe('useUpdate — onError without previous cache', () => {
  // if@260#1: the PUT fails but no cache entry was pre-populated, so
  // onMutate's `previous` is undefined → onError's `if (context?.previous)`
  // takes the false arm (no rollback write).
  it('does not write a rollback when there is no cached previous value', async () => {
    const users = defineFeature<UserValues & { id: number }>({
      name: 'cg-update-no-previous',
      schema: z.object({
        id: z.number(),
        name: z.string().min(2),
        email: z.string().email(),
        role: z.enum(['admin', 'editor', 'viewer']),
        active: z.boolean(),
      }),
      api: '/api/users',
      fetcher: (async (_url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          return new Response(JSON.stringify({ message: 'Server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('{}', { status: 200 })
      }) as typeof fetch,
    })

    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })

    // Intentionally do NOT pre-populate the cache for [name, id].
    const { result: mutation, unmount } = mountWith(client, () => users.useUpdate())

    mutation.mutate({ id: 99, data: { name: 'Nobody' } })
    await new Promise((r) => setTimeout(r, 100))

    expect(mutation.isError()).toBe(true)
    // onMutate optimistically wrote variables.data; onError did NOT roll back
    // (no previous), so the optimistic value remains.
    const cached = client.getQueryData(['cg-update-no-previous', 99]) as
      | Record<string, unknown>
      | undefined
    expect(cached).toEqual({ name: 'Nobody' })
    unmount()
  })
})

// ─── useTable sorting / global-filter updaters + pagination opt-in ──────────────

describe('useTable — updaters and pagination', () => {
  const tableSchema = z.object({
    name: z.string(),
    email: z.string(),
  })
  type TV = z.infer<typeof tableSchema>
  const rows: TV[] = [
    { name: 'Bob', email: 'b@t.com' },
    { name: 'Alice', email: 'a@t.com' },
  ]

  // cond-expr@379#1 (value updater) + cond-expr@379#0 already covered via fn.
  it('onSortingChange handles both value and function updaters', () => {
    const feat = defineFeature<TV>({
      name: 'cg-table-sort',
      schema: tableSchema,
      api: '/api/x',
    })

    const client = new QueryClient()
    const { result, unmount } = mountWith(client, () => feat.useTable(rows))

    // Value-form updater → cond-expr@379#1 (typeof updater !== 'function').
    result.table().setSorting([{ id: 'name', desc: false }])
    expect(result.sorting()).toEqual([{ id: 'name', desc: false }])

    // Function-form updater → cond-expr@379#0.
    result.table().setSorting((prev) => [...prev, { id: 'email', desc: true }])
    expect(result.sorting()).toEqual([
      { id: 'name', desc: false },
      { id: 'email', desc: true },
    ])
    unmount()
  })

  // FN@384 (onGlobalFilterChange) + cond-expr@386#0/#1.
  it('onGlobalFilterChange handles both value and function updaters', () => {
    const feat = defineFeature<TV>({
      name: 'cg-table-filter',
      schema: tableSchema,
      api: '/api/x',
    })

    const client = new QueryClient()
    const { result, unmount } = mountWith(client, () => feat.useTable(rows))

    // Value-form updater → cond-expr@386#1.
    result.table().setGlobalFilter('ali')
    expect(result.globalFilter()).toBe('ali')

    // Function-form updater → cond-expr@386#0.
    result.table().setGlobalFilter((prev: string) => `${prev}ce`)
    expect(result.globalFilter()).toBe('alice')
    unmount()
  })

  // cond-expr@394#0: pageSize provided → getPaginationRowModel wired in.
  it('wires the pagination row model when pageSize is provided', () => {
    const feat = defineFeature<TV>({
      name: 'cg-table-paginated',
      schema: tableSchema,
      api: '/api/x',
    })

    const many: TV[] = Array.from({ length: 25 }, (_, i) => ({
      name: `User ${i}`,
      email: `u${i}@t.com`,
    }))

    const client = new QueryClient()
    const { result, unmount } = mountWith(client, () => feat.useTable(many, { pageSize: 10 }))

    // With pagination wired, the paginated row model exposes >1 page.
    expect(result.table().getPageCount()).toBeGreaterThan(1)
    unmount()
  })
})

// ─── schema.ts duck-typed introspection edge paths ──────────────────────────────

describe('extractFields — duck-typed edge shapes', () => {
  // if@150#0: a shape entry whose value is not an object (null) →
  // detectFieldType returns { type: 'unknown', optional: false }.
  it('treats a non-object field schema as type "unknown"', () => {
    const fakeSchema = {
      shape: {
        broken: null,
        alsoBroken: 42,
      },
    }

    const fields = extractFields(fakeSchema)
    expect(fields).toHaveLength(2)
    expect(fields[0]).toMatchObject({ name: 'broken', type: 'unknown', optional: false })
    expect(fields[1]).toMatchObject({ name: 'alsoBroken', type: 'unknown', optional: false })
  })

  // binary-expr@187#1 + if@188#0: a v4-only optional wrapper where `_def`
  // is absent so `def?.innerType` is nullish and the right `_zod.def` arm is
  // taken, resolving to an object inner type.
  it('unwraps a v4-only optional wrapper via the _zod.def fallback', () => {
    const fakeSchema = {
      shape: {
        nick: {
          // v4 optional wrapper: no `_def`, only `_zod`.
          _zod: { def: { type: 'optional' } },
        },
      },
    }

    const fields = extractFields(fakeSchema)
    expect(fields).toHaveLength(1)
    // The optional wrapper is detected; the inner `_zod.def` has no concrete
    // type so it maps to the default 'string'.
    expect(fields[0]).toMatchObject({ name: 'nick', optional: true, type: 'string' })
  })

  // if@188#1: an optional wrapper whose inner-type resolution yields a
  // non-object → the `inner` reference is left unchanged.
  it('leaves inner unchanged when the optional inner type is not an object', () => {
    const fakeSchema = {
      shape: {
        flag: {
          // v3-style optional whose innerType is a primitive (not an object).
          _def: { typeName: 'ZodOptional', innerType: 'not-an-object' },
        },
      },
    }

    const fields = extractFields(fakeSchema)
    expect(fields).toHaveLength(1)
    // Optional detected; inner unchanged (still the ZodOptional wrapper),
    // so the type resolves via the wrapper's own typeName → default 'string'.
    expect(fields[0]).toMatchObject({ name: 'flag', optional: true, type: 'string' })
  })

  // if@230#0 + binary-expr@230#1: a v4-only enum whose values live on
  // `_zod.def.values` as an array.
  it('extracts enum values from the v4 _zod.def.values array', () => {
    const fakeSchema = {
      shape: {
        status: {
          _zod: { def: { type: 'enum', values: ['draft', 'live', 'archived'] } },
        },
      },
    }

    const fields = extractFields(fakeSchema)
    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatchObject({
      name: 'status',
      type: 'enum',
      enumValues: ['draft', 'live', 'archived'],
    })
  })
})
