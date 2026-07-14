/**
 * Cross-validator + end-to-end wiring tests for @pyreon/feature.
 *
 * These exercise the REAL composed primitives (real QueryClient, real
 * `mount`, real `@pyreon/form` FormState, real `@pyreon/table` instance)
 * with REAL validation schemas from THREE libraries — Zod, Valibot, and
 * ArkType — to prove:
 *
 *  1. Schema validation flows into the generated form for ALL Standard
 *     Schema validators, not just Zod. Before the createValidator fix a
 *     Valibot/ArkType schema was silently dropped (no `safeParseAsync`
 *     method), so the documented "Zod / Valibot / ArkType" support was a
 *     silent no-op — the form reported valid while the schema rejected.
 *  2. A schema error surfaces on the RIGHT field (not a whole-form blob).
 *  3. A create/update/delete mutation actually invalidates + refetches the
 *     generated list query (the archetypal cross-package wiring the whole
 *     package exists to provide).
 *  4. The generated table reads the query's data REACTIVELY — a refetch
 *     that changes the data re-renders the table's row model.
 *
 * No mocks of the composed packages: every assertion runs against the real
 * wiring a consumer ships.
 */
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { resetAllStores } from '@pyreon/store'
import { type } from 'arktype'
import * as v from 'valibot'
import { z } from 'zod'
import { defineFeature } from '../define-feature'

// ─── Helpers (mirror the sibling suites) ───────────────────────────────────────

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

afterEach(() => {
  resetAllStores()
})

// ─── 1 + 2. Schema validation flows into the form for every validator ──────────

describe('schema validation flows into the generated form', () => {
  // A shared row shape so all three validators produce the same TValues.
  interface UserRow extends Record<string, unknown> {
    name: string
    email: string
  }

  it('Zod: an invalid field surfaces an error on THAT field', async () => {
    const users = defineFeature<UserRow>({
      name: 'sv-zod',
      schema: z.object({
        name: z.string().min(2),
        email: z.string().email(),
      }),
      api: '/api/users',
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () => users.useForm())

    form.setFieldValue('name', 'Alice')
    form.setFieldValue('email', 'not-an-email')

    const ok = await form.validate()
    expect(ok).toBe(false)
    // The error must land on `email`, not `name` and not a whole-form blob.
    expect(form.errors().email).toBeTruthy()
    expect(form.errors().name).toBeFalsy()
    unmount()
  })

  // Field introspection (extractFields) is Zod-only, so a Valibot/ArkType
  // feature must supply `initialValues` explicitly to register the form's
  // fields. Validation itself then flows through my createValidator fix.
  const nonZodInitial: UserRow = { name: '', email: '' }

  it('Valibot: an invalid field surfaces an error (was a silent no-op before the fix)', async () => {
    const users = defineFeature<UserRow>({
      name: 'sv-valibot',
      schema: v.object({
        name: v.pipe(v.string(), v.minLength(2)),
        email: v.pipe(v.string(), v.email()),
      }) as never,
      initialValues: nonZodInitial,
      api: '/api/users',
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () => users.useForm())

    form.setFieldValue('name', 'Alice')
    form.setFieldValue('email', 'nope')

    const ok = await form.validate()
    // Before the createValidator Standard-Schema branch, `ok` was `true`
    // (validation silently skipped) — the exact silent-drop bug.
    expect(ok).toBe(false)
    expect(form.errors().email).toBeTruthy()
    expect(form.errors().name).toBeFalsy()
    unmount()
  })

  it('Valibot: a fully-valid record passes validation', async () => {
    const users = defineFeature<UserRow>({
      name: 'sv-valibot-ok',
      schema: v.object({
        name: v.pipe(v.string(), v.minLength(2)),
        email: v.pipe(v.string(), v.email()),
      }) as never,
      initialValues: nonZodInitial,
      api: '/api/users',
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () => users.useForm())

    form.setFieldValue('name', 'Alice')
    form.setFieldValue('email', 'alice@example.com')

    expect(await form.validate()).toBe(true)
    expect(form.errors().email).toBeFalsy()
    unmount()
  })

  it('ArkType: an invalid field surfaces an error (was a silent no-op before the fix)', async () => {
    const users = defineFeature<UserRow>({
      name: 'sv-arktype',
      schema: type({
        name: 'string >= 2',
        email: 'string.email',
      }) as never,
      initialValues: nonZodInitial,
      api: '/api/users',
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () => users.useForm())

    form.setFieldValue('name', 'Alice')
    form.setFieldValue('email', 'nope')

    const ok = await form.validate()
    expect(ok).toBe(false)
    expect(form.errors().email).toBeTruthy()
    unmount()
  })

  it('a custom validate fn still wins over an auto-detected schema validator', async () => {
    // config.validate is a plain SchemaValidateFn — it must short-circuit the
    // Standard-Schema auto-detection so the consumer stays in full control.
    const users = defineFeature<UserRow>({
      name: 'sv-custom-over-standard',
      schema: v.object({
        name: v.pipe(v.string(), v.minLength(2)),
        email: v.pipe(v.string(), v.email()),
      }) as never,
      initialValues: nonZodInitial,
      // Custom validator only complains about `name`, never `email`.
      validate: ((values: UserRow) =>
        values.name === 'BAD' ? { name: 'custom says no' } : {}) as never,
      api: '/api/users',
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () => users.useForm())

    form.setFieldValue('name', 'BAD')
    form.setFieldValue('email', 'still-not-an-email') // schema would reject, custom ignores

    const ok = await form.validate()
    expect(ok).toBe(false)
    expect(form.errors().name).toBeTruthy()
    // The Standard-Schema email rule must NOT run — custom validate won.
    expect(form.errors().email).toBeFalsy()
    unmount()
  })
})

// ─── Dev warning: non-Zod schema yields no introspected fields ─────────────────

describe('non-introspectable schema dev warning', () => {
  interface UserRow extends Record<string, unknown> {
    name: string
    email: string
  }

  it('warns when a Valibot schema yields no fields AND no initialValues given', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      defineFeature<UserRow>({
        name: 'warn-valibot',
        schema: v.object({ name: v.string(), email: v.string() }) as never,
        api: '/api/users',
      })
      expect(spy).toHaveBeenCalledTimes(1)
      const msg = String(spy.mock.calls[0]![0])
      expect(msg).toContain('warn-valibot')
      expect(msg).toContain('field introspection only')
      expect(msg).toContain('initialValues')
    } finally {
      spy.mockRestore()
    }
  })

  it('does NOT warn for a Zod schema (fields are introspected)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      defineFeature<UserRow>({
        name: 'warn-zod',
        schema: z.object({ name: z.string(), email: z.string() }),
        api: '/api/users',
      })
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('does NOT warn when a non-Zod schema is paired with explicit initialValues', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      defineFeature<UserRow>({
        name: 'warn-valibot-init',
        schema: v.object({ name: v.string(), email: v.string() }) as never,
        initialValues: { name: '', email: '' },
        api: '/api/users',
      })
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('does NOT warn for a plain non-validator schema (type-only, no ~standard)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      defineFeature<UserRow>({
        name: 'warn-plain',
        schema: { notAValidator: true } as { _output?: UserRow },
        api: '/api/users',
      })
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})

// ─── 3. A mutation invalidates + refetches the generated list query ────────────

describe('mutations invalidate the generated list query', () => {
  interface Todo extends Record<string, unknown> {
    title: string
    done: boolean
  }

  const todoSchema = z.object({ title: z.string(), done: z.boolean() })

  function makeFeature(name: string) {
    let listCalls = 0
    const store: Todo[] = [{ title: 'first', done: false }]
    const feature = defineFeature<Todo>({
      name,
      schema: todoSchema,
      api: '/api/todos',
      fetcher: (async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        if (method === 'GET') {
          listCalls++
          return new Response(JSON.stringify(store), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (method === 'POST') {
          store.push({ title: 'second', done: false })
          return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        if (method === 'PUT' || method === 'DELETE') {
          return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        return new Response('{}', { status: 200 })
      }) as typeof fetch,
    })
    return { feature, calls: () => listCalls }
  }

  it('useCreate() triggers a refetch of an active useList()', async () => {
    const { feature, calls } = makeFeature('mut-create-invalidate')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result, unmount } = mountWith(client, () => ({
      list: feature.useList(),
      create: feature.useCreate(),
    }))

    // Wait for the initial list fetch.
    await new Promise((r) => setTimeout(r, 50))
    expect(result.list.data()?.length).toBe(1)
    const before = calls()
    expect(before).toBeGreaterThanOrEqual(1)

    // Create → onSuccess invalidates [name] which prefix-matches the list key.
    result.create.mutate({ title: 'second', done: false })
    await new Promise((r) => setTimeout(r, 80))

    // The active list observer must have refetched (a NEW GET happened) AND
    // the reactive data() must reflect the new row.
    expect(calls()).toBeGreaterThan(before)
    expect(result.list.data()?.length).toBe(2)
    unmount()
  })

  it('useDelete() also invalidates the list query', async () => {
    const { feature, calls } = makeFeature('mut-delete-invalidate')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result, unmount } = mountWith(client, () => ({
      list: feature.useList(),
      del: feature.useDelete(),
    }))

    await new Promise((r) => setTimeout(r, 50))
    const before = calls()

    result.del.mutate(1)
    await new Promise((r) => setTimeout(r, 80))

    expect(calls()).toBeGreaterThan(before)
    unmount()
  })

  it('useForm() create submit invalidates the list query (its own onSubmit wiring)', async () => {
    // The form's onSubmit has a SEPARATE invalidateQueries block from the
    // mutation hooks — this locks that the create-form path also refreshes
    // any active list view, not just useCreate().
    const { feature, calls } = makeFeature('mut-form-invalidate')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result, unmount } = mountWith(client, () => ({
      list: feature.useList(),
      form: feature.useForm(),
    }))

    await new Promise((r) => setTimeout(r, 50))
    const before = calls()

    result.form.setFieldValue('title', 'second')
    result.form.setFieldValue('done', false)
    await result.form.handleSubmit()
    await new Promise((r) => setTimeout(r, 80))

    expect(calls()).toBeGreaterThan(before)
    expect(result.list.data()?.length).toBe(2)
    unmount()
  })
})

// ─── 4. The generated table reads query data reactively ─────────────────────────

describe('generated table reads query data reactively', () => {
  interface Todo extends Record<string, unknown> {
    title: string
    done: boolean
  }

  it('a refetch that changes the list re-renders the table row model', async () => {
    const rows = signal<Todo[]>([{ title: 'a', done: false }])

    const feature = defineFeature<Todo>({
      name: 'table-reactive',
      schema: z.object({ title: z.string(), done: z.boolean() }),
      api: '/api/todos',
      fetcher: (async () =>
        new Response(JSON.stringify(rows()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof fetch,
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result, unmount } = mountWith(client, () => {
      const list = feature.useList()
      // Wire the table to READ the query's data reactively.
      const t = feature.useTable(() => list.data() ?? [])
      return { list, table: t }
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(result.table.table().getRowModel().rows).toHaveLength(1)

    // Change the data + refetch the SAME query key → data() flips.
    rows.set([
      { title: 'a', done: false },
      { title: 'b', done: true },
      { title: 'c', done: false },
    ])
    await client.refetchQueries({ queryKey: ['table-reactive'] })
    await new Promise((r) => setTimeout(r, 50))

    // The table's row model tracked the reactive data() through the refetch.
    expect(result.list.data()).toHaveLength(3)
    expect(result.table.table().getRowModel().rows).toHaveLength(3)
    unmount()
  })
})
