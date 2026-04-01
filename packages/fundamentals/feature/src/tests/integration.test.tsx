import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { mount } from '@pyreon/runtime-dom'
import { resetAllStores } from '@pyreon/store'
import { z } from 'zod'
import { defineFeature } from '../define-feature'
import { defaultInitialValues, extractFields, isReference, reference } from '../schema'

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Schema ─────────────────────────────────────────────────────────────────

const postSchema = z.object({
  title: z.string().min(1),
  body: z.string(),
  published: z.boolean(),
  category: z.enum(['tech', 'lifestyle', 'news']),
  views: z.number().optional(),
})

type PostValues = z.infer<typeof postSchema>

// ─── Mock fetch ─────────────────────────────────────────────────────────────

function createMockFetch(responses: Record<string, { status?: number; body?: unknown }>) {
  return async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === 'string' ? url : url.toString()
    const method = init?.method ?? 'GET'
    const key = `${method} ${urlStr}`

    const match = responses[key] ?? Object.entries(responses).find(([k]) => key.startsWith(k))?.[1]

    if (!match) {
      return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })
    }

    return new Response(match.body !== undefined ? JSON.stringify(match.body) : null, {
      status: match.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

afterEach(() => {
  resetAllStores()
})

// ─── Schema introspection ───────────────────────────────────────────────────

describe('extractFields', () => {
  it('extracts field names and types from Zod schema', () => {
    const fields = extractFields(postSchema)
    expect(fields.length).toBe(5)

    expect(fields[0]).toMatchObject({ name: 'title', type: 'string', optional: false })
    expect(fields[1]).toMatchObject({ name: 'body', type: 'string', optional: false })
    expect(fields[2]).toMatchObject({ name: 'published', type: 'boolean', optional: false })
    expect(fields[3]).toMatchObject({ name: 'category', type: 'enum', optional: false })
    expect(fields[4]).toMatchObject({ name: 'views', type: 'number', optional: true })
  })

  it('generates human-readable labels from camelCase', () => {
    const schema = z.object({
      firstName: z.string(),
      last_name: z.string(),
      emailAddress: z.string(),
    })
    const fields = extractFields(schema)
    expect(fields[0]!.label).toBe('First Name')
    expect(fields[1]!.label).toBe('Last Name')
    expect(fields[2]!.label).toBe('Email Address')
  })

  it('returns empty array for null/undefined/string', () => {
    expect(extractFields(null)).toEqual([])
    expect(extractFields(undefined)).toEqual([])
    expect(extractFields('not a schema')).toEqual([])
  })

  it('handles Zod v3-style schema with _def.shape function', () => {
    const mock = {
      _def: {
        shape: () => ({
          name: { _def: { typeName: 'ZodString' } },
          count: { _def: { typeName: 'ZodNumber' } },
        }),
      },
    }
    const fields = extractFields(mock)
    expect(fields.length).toBe(2)
    expect(fields[0]).toMatchObject({ name: 'name', type: 'string' })
    expect(fields[1]).toMatchObject({ name: 'count', type: 'number' })
  })

  it('handles Zod v4-style schema with _zod.def.shape', () => {
    const mock = {
      _zod: {
        def: {
          shape: {
            email: { _zod: { def: { type: 'string' } } },
          },
        },
      },
    }
    const fields = extractFields(mock)
    expect(fields.length).toBe(1)
    expect(fields[0]).toMatchObject({ name: 'email', type: 'string' })
  })

  it('detects optional wrapper and unwraps inner type', () => {
    const mock = {
      _def: {
        shape: () => ({
          name: {
            _def: {
              typeName: 'ZodOptional',
              innerType: { _def: { typeName: 'ZodString' } },
            },
          },
        }),
      },
    }
    const fields = extractFields(mock)
    expect(fields[0]).toMatchObject({ name: 'name', type: 'string', optional: true })
  })

  it('detects nullable wrapper', () => {
    const mock = {
      _def: {
        shape: () => ({
          value: {
            _def: {
              typeName: 'ZodNullable',
              innerType: { _def: { typeName: 'ZodNumber' } },
            },
          },
        }),
      },
    }
    const fields = extractFields(mock)
    expect(fields[0]).toMatchObject({ name: 'value', type: 'number', optional: true })
  })

  it('extracts enum values', () => {
    const mock = {
      _def: {
        shape: () => ({
          role: {
            _def: {
              typeName: 'ZodEnum',
              values: ['admin', 'user'],
            },
          },
        }),
      },
    }
    const fields = extractFields(mock)
    expect(fields[0]).toMatchObject({
      name: 'role',
      type: 'enum',
      enumValues: ['admin', 'user'],
    })
  })

  it('detects date, array, object types', () => {
    const mock = {
      shape: {
        d: { _def: { typeName: 'ZodDate' } },
        a: { _def: { typeName: 'ZodArray' } },
        o: { _def: { typeName: 'ZodObject' } },
      },
    }
    const fields = extractFields(mock)
    expect(fields[0]).toMatchObject({ name: 'd', type: 'date' })
    expect(fields[1]).toMatchObject({ name: 'a', type: 'array' })
    expect(fields[2]).toMatchObject({ name: 'o', type: 'object' })
  })
})

// ─── defaultInitialValues ───────────────────────────────────────────────────

describe('defaultInitialValues', () => {
  it('generates defaults from field types', () => {
    const fields = extractFields(postSchema)
    const values = defaultInitialValues(fields)

    expect(values.title).toBe('')
    expect(values.body).toBe('')
    expect(values.published).toBe(false)
    expect(values.views).toBe(0)
  })

  it('uses first enum value as default when values are available', () => {
    // Real Zod schemas may or may not expose enum values depending on version.
    // Test with a mock schema that guarantees values are present.
    const mockFields = [
      { name: 'role', type: 'enum' as const, optional: false, label: 'Role', enumValues: ['admin', 'user'] },
    ]
    const values = defaultInitialValues(mockFields)
    expect(values.role).toBe('admin')
  })

  it('falls back to empty string for enum without values', () => {
    const mockFields = [
      { name: 'status', type: 'enum' as const, optional: false, label: 'Status' },
    ]
    const values = defaultInitialValues(mockFields)
    expect(values.status).toBe('')
  })

  it('uses empty string for date type', () => {
    const fields = extractFields(
      z.object({
        createdAt: z.date(),
      }),
    )
    const values = defaultInitialValues(fields)
    expect(values.createdAt).toBe('')
  })
})

// ─── reference() ────────────────────────────────────────────────────────────

describe('reference()', () => {
  it('creates a reference schema object', () => {
    const ref = reference({ name: 'users' })
    expect(ref._featureName).toBe('users')
    expect(isReference(ref)).toBe(true)
  })

  it('isReference returns false for non-references', () => {
    expect(isReference(null)).toBe(false)
    expect(isReference({})).toBe(false)
    expect(isReference('string')).toBe(false)
  })

  it('validates string values as valid references', () => {
    const ref = reference({ name: 'posts' })
    expect(ref.safeParse('abc').success).toBe(true)
    expect(ref.safeParse(42).success).toBe(true)
  })

  it('rejects non-string/number values', () => {
    const ref = reference({ name: 'posts' })
    expect(ref.safeParse(null).success).toBe(false)
    expect(ref.safeParse({}).success).toBe(false)
    expect(ref.safeParse(undefined).success).toBe(false)
  })

  it('async validation works', async () => {
    const ref = reference({ name: 'posts' })
    const result = await ref.safeParseAsync('valid')
    expect(result.success).toBe(true)
  })

  it('extractFields detects reference type', () => {
    const ref = reference({ name: 'users' })
    const schema = {
      shape: {
        authorId: ref,
      },
    }
    const fields = extractFields(schema)
    expect(fields[0]).toMatchObject({
      name: 'authorId',
      type: 'reference',
      referenceTo: 'users',
    })
  })
})

// ─── defineFeature ──────────────────────────────────────────────────────────

describe('defineFeature', () => {
  it('returns feature with name, api, schema, fields, queryKey', () => {
    const posts = defineFeature<PostValues>({
      name: 'posts',
      schema: postSchema,
      api: '/api/posts',
    })

    expect(posts.name).toBe('posts')
    expect(posts.api).toBe('/api/posts')
    expect(posts.schema).toBe(postSchema)
    expect(posts.fields.length).toBe(5)
    expect(posts.queryKey()).toEqual(['posts'])
    expect(posts.queryKey('42')).toEqual(['posts', '42'])
  })

  it('has all CRUD hooks', () => {
    const posts = defineFeature<PostValues>({
      name: 'posts-hooks',
      schema: postSchema,
      api: '/api/posts',
    })

    expect(typeof posts.useList).toBe('function')
    expect(typeof posts.useById).toBe('function')
    expect(typeof posts.useSearch).toBe('function')
    expect(typeof posts.useCreate).toBe('function')
    expect(typeof posts.useUpdate).toBe('function')
    expect(typeof posts.useDelete).toBe('function')
    expect(typeof posts.useForm).toBe('function')
    expect(typeof posts.useTable).toBe('function')
    expect(typeof posts.useStore).toBe('function')
  })

  it('accepts custom initial values', () => {
    const posts = defineFeature<PostValues>({
      name: 'posts-custom-init',
      schema: postSchema,
      api: '/api/posts',
      initialValues: { title: 'Untitled', published: true },
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () => posts.useForm())
    expect(form.values().title).toBe('Untitled')
    expect(form.values().published).toBe(true)
    unmount()
  })
})

// ─── useList ────────────────────────────────────────────────────────────────

describe('useList', () => {
  it('fetches list from API', async () => {
    const mockPosts = [{ title: 'Hello', body: 'World', published: true, category: 'tech' }]

    const posts = defineFeature<PostValues>({
      name: 'posts-list',
      schema: postSchema,
      api: '/api/posts',
      fetcher: createMockFetch({
        'GET /api/posts': { body: mockPosts },
      }) as typeof fetch,
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result: query, unmount } = mountWith(client, () => posts.useList())

    expect(query.isPending()).toBe(true)
    await new Promise((r) => setTimeout(r, 50))
    expect(query.data()).toEqual(mockPosts)
    unmount()
  })

  it('passes query params to URL', async () => {
    let capturedUrl = ''
    const posts = defineFeature<PostValues>({
      name: 'posts-params',
      schema: postSchema,
      api: '/api/posts',
      fetcher: (async (url: string) => {
        capturedUrl = url
        return new Response('[]', { status: 200 })
      }) as typeof fetch,
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { unmount } = mountWith(client, () =>
      posts.useList({ params: { category: 'tech' } }),
    )
    await new Promise((r) => setTimeout(r, 50))
    expect(capturedUrl).toContain('category=tech')
    unmount()
  })
})

// ─── useById ────────────────────────────────────────────────────────────────

describe('useById', () => {
  it('fetches single item by ID', async () => {
    const mockPost = { title: 'Test', body: 'Content', published: true, category: 'tech' }

    const posts = defineFeature<PostValues>({
      name: 'posts-by-id',
      schema: postSchema,
      api: '/api/posts',
      fetcher: createMockFetch({
        'GET /api/posts/1': { body: mockPost },
      }) as typeof fetch,
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result: query, unmount } = mountWith(client, () => posts.useById(1))
    await new Promise((r) => setTimeout(r, 50))
    expect(query.data()).toEqual(mockPost)
    unmount()
  })
})

// ─── useCreate ──────────────────────────────────────────────────────────────

describe('useCreate', () => {
  it('sends POST to API', async () => {
    let capturedMethod = ''
    const posts = defineFeature<PostValues>({
      name: 'posts-create',
      schema: postSchema,
      api: '/api/posts',
      fetcher: (async (_url: string, init?: RequestInit) => {
        capturedMethod = init?.method ?? 'GET'
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      }) as typeof fetch,
    })

    const client = new QueryClient()
    const { result: mutation, unmount } = mountWith(client, () => posts.useCreate())
    mutation.mutate({ title: 'New post' })
    await new Promise((r) => setTimeout(r, 50))
    expect(capturedMethod).toBe('POST')
    expect(mutation.isSuccess()).toBe(true)
    unmount()
  })
})

// ─── useUpdate ──────────────────────────────────────────────────────────────

describe('useUpdate', () => {
  it('sends PUT with id and data', async () => {
    let capturedUrl = ''
    let capturedMethod = ''

    const posts = defineFeature<PostValues>({
      name: 'posts-update',
      schema: postSchema,
      api: '/api/posts',
      fetcher: (async (url: string, init?: RequestInit) => {
        capturedUrl = url
        capturedMethod = init?.method ?? 'GET'
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      }) as typeof fetch,
    })

    const client = new QueryClient()
    const { result: mutation, unmount } = mountWith(client, () => posts.useUpdate())
    mutation.mutate({ id: 42, data: { title: 'Updated' } })
    await new Promise((r) => setTimeout(r, 50))
    expect(capturedUrl).toBe('/api/posts/42')
    expect(capturedMethod).toBe('PUT')
    unmount()
  })
})

// ─── useDelete ──────────────────────────────────────────────────────────────

describe('useDelete', () => {
  it('sends DELETE with id', async () => {
    let capturedUrl = ''
    let capturedMethod = ''

    const posts = defineFeature<PostValues>({
      name: 'posts-delete',
      schema: postSchema,
      api: '/api/posts',
      fetcher: (async (url: string, init?: RequestInit) => {
        capturedUrl = url
        capturedMethod = init?.method ?? 'GET'
        return new Response(null, { status: 204 })
      }) as typeof fetch,
    })

    const client = new QueryClient()
    const { result: mutation, unmount } = mountWith(client, () => posts.useDelete())
    mutation.mutate(7)
    await new Promise((r) => setTimeout(r, 50))
    expect(capturedUrl).toBe('/api/posts/7')
    expect(capturedMethod).toBe('DELETE')
    unmount()
  })
})

// ─── useForm ────────────────────────────────────────────────────────────────

describe('useForm', () => {
  it('creates form with auto-generated initial values', () => {
    const posts = defineFeature<PostValues>({
      name: 'posts-form-auto',
      schema: postSchema,
      api: '/api/posts',
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () => posts.useForm())
    expect(form.values().title).toBe('')
    expect(form.values().body).toBe('')
    expect(form.values().published).toBe(false)
    unmount()
  })

  it('merges custom initial values with auto-generated ones', () => {
    const posts = defineFeature<PostValues>({
      name: 'posts-form-custom',
      schema: postSchema,
      api: '/api/posts',
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () =>
      posts.useForm({ initialValues: { title: 'Draft' } }),
    )
    expect(form.values().title).toBe('Draft')
    expect(form.values().body).toBe('') // auto-generated
    unmount()
  })
})

// ─── useTable ───────────────────────────────────────────────────────────────

describe('useTable', () => {
  it('creates table with columns from schema', () => {
    const posts = defineFeature<PostValues>({
      name: 'posts-table',
      schema: postSchema,
      api: '/api/posts',
    })

    const client = new QueryClient()
    const { result, unmount } = mountWith(client, () =>
      posts.useTable([
        { title: 'A', body: 'B', published: true, category: 'tech', views: 10 },
      ]),
    )

    expect(result.columns.length).toBe(5)
    expect(result.columns[0]!.name).toBe('title')
    expect(typeof result.sorting).toBe('function') // signal
    expect(typeof result.globalFilter).toBe('function') // signal
    unmount()
  })

  it('respects columns option to show subset of fields', () => {
    const posts = defineFeature<PostValues>({
      name: 'posts-table-cols',
      schema: postSchema,
      api: '/api/posts',
    })

    const client = new QueryClient()
    const { result, unmount } = mountWith(client, () =>
      posts.useTable([], { columns: ['title', 'published'] }),
    )

    expect(result.columns.length).toBe(2)
    expect(result.columns[0]!.name).toBe('title')
    expect(result.columns[1]!.name).toBe('published')
    unmount()
  })
})

// ─── useStore ───────────────────────────────────────────────────────────────

describe('useStore', () => {
  it('creates a reactive store with items, selected, loading', () => {
    const posts = defineFeature<PostValues>({
      name: 'posts-store',
      schema: postSchema,
      api: '/api/posts',
    })

    const client = new QueryClient()
    const { result: storeApi, unmount } = mountWith(client, () => posts.useStore())

    const store = storeApi.store
    expect(store.items()).toEqual([])
    expect(store.selected()).toBeNull()
    expect(store.loading()).toBe(false)
    unmount()
  })

  it('select() finds item by id', () => {
    const posts = defineFeature<PostValues & { id: number }>({
      name: 'posts-store-select',
      schema: z.object({
        id: z.number(),
        title: z.string(),
        body: z.string(),
        published: z.boolean(),
        category: z.enum(['tech', 'lifestyle', 'news']),
      }),
      api: '/api/posts',
    })

    const client = new QueryClient()
    const { result: storeApi, unmount } = mountWith(client, () => posts.useStore())

    const store = storeApi.store
    store.items.set([
      { id: 1, title: 'A', body: '', published: true, category: 'tech' },
      { id: 2, title: 'B', body: '', published: false, category: 'news' },
    ])

    store.select(2)
    expect(store.selected()?.title).toBe('B')

    store.clear()
    expect(store.selected()).toBeNull()
    unmount()
  })
})

// ─── Error handling ─────────────────────────────────────────────────────────

describe('error handling', () => {
  it('useList handles 404 error', async () => {
    const posts = defineFeature<PostValues>({
      name: 'posts-error',
      schema: postSchema,
      api: '/api/posts',
      fetcher: (async () => {
        return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })
      }) as typeof fetch,
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result: query, unmount } = mountWith(client, () => posts.useList())
    await new Promise((r) => setTimeout(r, 100))
    expect(query.isError()).toBe(true)
    unmount()
  })

  it('useList handles 500 error with message', async () => {
    const posts = defineFeature<PostValues>({
      name: 'posts-500',
      schema: postSchema,
      api: '/api/posts',
      fetcher: (async () => {
        return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 })
      }) as typeof fetch,
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result: query, unmount } = mountWith(client, () => posts.useList())
    await new Promise((r) => setTimeout(r, 100))
    expect(query.isError()).toBe(true)
    unmount()
  })

  it('useList handles 500 error with errors array', async () => {
    const posts = defineFeature<PostValues>({
      name: 'posts-500-errors',
      schema: postSchema,
      api: '/api/posts',
      fetcher: (async () => {
        return new Response(
          JSON.stringify({ message: 'Validation failed', errors: [{ field: 'title' }] }),
          { status: 500 },
        )
      }) as typeof fetch,
    })

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result: query, unmount } = mountWith(client, () => posts.useList())
    await new Promise((r) => setTimeout(r, 100))
    expect(query.isError()).toBe(true)
    unmount()
  })
})
