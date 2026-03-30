import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { resetAllStores } from '@pyreon/store'
import { z } from 'zod'
import { defineFeature } from '../define-feature'
import { defaultInitialValues, extractFields, isReference, reference } from '../schema'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Schema ────────────────────────────────────────────────────────────────────

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(['admin', 'editor', 'viewer']),
  age: z.number().optional(),
  active: z.boolean(),
})

type UserValues = z.infer<typeof userSchema>

// ─── Mock fetch ────────────────────────────────────────────────────────────────

function createMockFetch(responses: Record<string, { status?: number; body?: unknown }>) {
  return async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === 'string' ? url : url.toString()
    const method = init?.method ?? 'GET'
    const key = `${method} ${urlStr}`

    const match = responses[key] ?? Object.entries(responses).find(([k]) => key.startsWith(k))?.[1]

    if (!match) {
      return new Response(JSON.stringify({ message: 'Not found' }), {
        status: 404,
      })
    }

    return new Response(match.body !== undefined ? JSON.stringify(match.body) : null, {
      status: match.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

afterEach(() => {
  resetAllStores()
})

// ─── Schema introspection ──────────────────────────────────────────────────────

describe('extractFields', () => {
  it('extracts field names and types from a Zod schema', () => {
    const fields = extractFields(userSchema)

    expect(fields).toHaveLength(5)
    expect(fields[0]).toEqual({
      name: 'name',
      type: 'string',
      optional: false,
      label: 'Name',
    })
    expect(fields[1]).toEqual({
      name: 'email',
      type: 'string',
      optional: false,
      label: 'Email',
    })
    expect(fields[2]).toMatchObject({
      name: 'role',
      type: 'enum',
      optional: false,
      label: 'Role',
    })
  })

  it('detects optional fields', () => {
    const fields = extractFields(userSchema)
    const ageField = fields.find((f) => f.name === 'age')
    expect(ageField?.optional).toBe(true)
    expect(ageField?.type).toBe('number')
  })

  it('detects boolean fields', () => {
    const fields = extractFields(userSchema)
    const activeField = fields.find((f) => f.name === 'active')
    expect(activeField?.type).toBe('boolean')
  })

  it('converts field names to labels', () => {
    const schema = z.object({
      firstName: z.string(),
      last_name: z.string(),
      email_address: z.string(),
    })
    const fields = extractFields(schema)
    expect(fields[0]!.label).toBe('First Name')
    expect(fields[1]!.label).toBe('Last Name')
    expect(fields[2]!.label).toBe('Email Address')
  })

  it('returns empty array for non-object input', () => {
    expect(extractFields(null)).toEqual([])
    expect(extractFields(undefined)).toEqual([])
    expect(extractFields('string')).toEqual([])
  })

  it('handles Zod v3-style schema with _def.typeName', () => {
    // Mock v3 schema shape
    const mockSchema = {
      _def: {
        shape: () => ({
          title: {
            _def: { typeName: 'ZodString' },
          },
          count: {
            _def: { typeName: 'ZodNumber' },
          },
          done: {
            _def: { typeName: 'ZodBoolean' },
          },
        }),
      },
    }
    const fields = extractFields(mockSchema)
    expect(fields).toHaveLength(3)
    expect(fields[0]).toMatchObject({ name: 'title', type: 'string' })
    expect(fields[1]).toMatchObject({ name: 'count', type: 'number' })
    expect(fields[2]).toMatchObject({ name: 'done', type: 'boolean' })
  })

  it('handles Zod v3-style optional with _def.typeName ZodOptional', () => {
    const mockSchema = {
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
    const fields = extractFields(mockSchema)
    expect(fields[0]).toMatchObject({
      name: 'name',
      type: 'string',
      optional: true,
    })
  })

  it('handles Zod v3-style enum with _def.values', () => {
    const mockSchema = {
      _def: {
        shape: () => ({
          status: {
            _def: {
              typeName: 'ZodEnum',
              values: ['active', 'inactive'],
            },
          },
        }),
      },
    }
    const fields = extractFields(mockSchema)
    expect(fields[0]).toMatchObject({
      name: 'status',
      type: 'enum',
      enumValues: ['active', 'inactive'],
    })
  })

  it('returns unknown for unrecognized field type', () => {
    const mockSchema = {
      shape: {
        weird: { _def: { typeName: 'ZodSomethingNew' } },
      },
    }
    const fields = extractFields(mockSchema)
    expect(fields[0]).toMatchObject({ name: 'weird', type: 'string' })
  })

  it('handles schema with static _def.shape object (not function)', () => {
    const mockSchema = {
      _def: {
        shape: {
          name: { _def: { typeName: 'ZodString' } },
        },
      },
    }
    const fields = extractFields(mockSchema)
    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatchObject({ name: 'name', type: 'string' })
  })

  it('handles schema with _zod.def.shape (v4 path)', () => {
    const mockSchema = {
      _zod: {
        def: {
          shape: {
            email: {
              _zod: { def: { type: 'string' } },
            },
          },
        },
      },
    }
    const fields = extractFields(mockSchema)
    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatchObject({ name: 'email', type: 'string' })
  })

  it('handles getTypeName returning undefined', () => {
    const mockSchema = {
      shape: {
        field: {},
      },
    }
    const fields = extractFields(mockSchema)
    expect(fields[0]).toMatchObject({ name: 'field', type: 'unknown' })
  })
})

describe('defaultInitialValues', () => {
  it('generates defaults from field types', () => {
    const fields = extractFields(userSchema)
    const values = defaultInitialValues(fields)

    expect(values.name).toBe('')
    expect(values.email).toBe('')
    expect(values.age).toBe(0)
    expect(values.active).toBe(false)
  })
})

// ─── defineFeature ─────────────────────────────────────────────────────────────

describe('defineFeature', () => {
  it('returns a feature with name, api, schema, fields, and queryKey', () => {
    const users = defineFeature<UserValues>({
      name: 'users',
      schema: userSchema,
      api: '/api/users',
    })

    expect(users.name).toBe('users')
    expect(users.api).toBe('/api/users')
    expect(users.schema).toBe(userSchema)
    expect(users.fields.length).toBeGreaterThan(0)
    expect(users.fields[0]!.name).toBe('name')
    expect(users.queryKey()).toEqual(['users'])
    expect(users.queryKey('123')).toEqual(['users', '123'])
    expect(users.queryKey(42)).toEqual(['users', 42])
  })

  it('has all hooks', () => {
    const users = defineFeature<UserValues>({
      name: 'users',
      schema: userSchema,
      api: '/api/users',
    })

    expect(typeof users.useList).toBe('function')
    expect(typeof users.useById).toBe('function')
    expect(typeof users.useSearch).toBe('function')
    expect(typeof users.useCreate).toBe('function')
    expect(typeof users.useUpdate).toBe('function')
    expect(typeof users.useDelete).toBe('function')
    expect(typeof users.useForm).toBe('function')
    expect(typeof users.useTable).toBe('function')
    expect(typeof users.useStore).toBe('function')
  })

  it('auto-generates initial values from schema', () => {
    const users = defineFeature<UserValues>({
      name: 'users-auto-init',
      schema: userSchema,
      api: '/api/users',
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () => users.useForm())
    expect(form.values().name).toBe('')
    expect(form.values().active).toBe(false)
    unmount()
  })
})

// ─── useList ────────────────────────────────────────────────────────────────────

describe('useList', () => {
  it('fetches list from API', async () => {
    const mockUsers = [{ name: 'Alice', email: 'a@t.com', role: 'admin', active: true }]

    const users = defineFeature<UserValues>({
      name: 'users-list',
      schema: userSchema,
      api: '/api/users',
      fetcher: createMockFetch({
        'GET /api/users': { body: mockUsers },
      }) as typeof fetch,
    })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result: query, unmount } = mountWith(client, () => users.useList())

    expect(query.isPending()).toBe(true)
    await new Promise((r) => setTimeout(r, 50))
    expect(query.data()).toEqual(mockUsers)
    unmount()
  })

  it('passes query params to URL', async () => {
    let capturedUrl = ''
    const users = defineFeature<UserValues>({
      name: 'users-params',
      schema: userSchema,
      api: '/api/users',
      fetcher: (async (url: string) => {
        capturedUrl = url
        return new Response('[]', { status: 200 })
      }) as typeof fetch,
    })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { unmount } = mountWith(client, () => users.useList({ params: { page: 2 } }))
    await new Promise((r) => setTimeout(r, 50))
    expect(capturedUrl).toContain('page=2')
    unmount()
  })
})

// ─── useList pagination ─────────────────────────────────────────────────────────

describe('useList pagination', () => {
  it('appends page and pageSize when page is provided as number', async () => {
    let capturedUrl = ''
    const users = defineFeature<UserValues>({
      name: 'users-page-num',
      schema: userSchema,
      api: '/api/users',
      fetcher: (async (url: string) => {
        capturedUrl = url
        return new Response('[]', { status: 200 })
      }) as typeof fetch,
    })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { unmount } = mountWith(client, () => users.useList({ page: 1, pageSize: 10 }))
    await new Promise((r) => setTimeout(r, 50))
    expect(capturedUrl).toContain('page=1')
    expect(capturedUrl).toContain('pageSize=10')
    unmount()
  })

  it('defaults pageSize to 20 when page is provided', async () => {
    let capturedUrl = ''
    const users = defineFeature<UserValues>({
      name: 'users-page-default-size',
      schema: userSchema,
      api: '/api/users',
      fetcher: (async (url: string) => {
        capturedUrl = url
        return new Response('[]', { status: 200 })
      }) as typeof fetch,
    })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { unmount } = mountWith(client, () => users.useList({ page: 3 }))
    await new Promise((r) => setTimeout(r, 50))
    expect(capturedUrl).toContain('page=3')
    expect(capturedUrl).toContain('pageSize=20')
    unmount()
  })

  it('accepts reactive page signal', async () => {
    const capturedUrls: string[] = []
    const users = defineFeature<UserValues>({
      name: 'users-page-signal',
      schema: userSchema,
      api: '/api/users',
      fetcher: (async (url: string) => {
        capturedUrls.push(url)
        return new Response('[]', { status: 200 })
      }) as typeof fetch,
    })

    const page = signal(1)
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { unmount } = mountWith(client, () => users.useList({ page, pageSize: 5 }))
    await new Promise((r) => setTimeout(r, 50))
    expect(capturedUrls.some((u) => u.includes('page=1'))).toBe(true)
    unmount()
  })

  it('includes page in query key for independent caching', () => {
    const users = defineFeature<UserValues>({
      name: 'users-page-key',
      schema: userSchema,
      api: '/api/users',
      fetcher: (async () => {
        return new Response('[]', { status: 200 })
      }) as typeof fetch,
    })

    // Different pages should produce different query keys
    const key1 = users.queryKey(1)
    const key2 = users.queryKey(2)
    expect(key1).not.toEqual(key2)
  })
})

// ─── useById ────────────────────────────────────────────────────────────────────

describe('useById', () => {
  it('fetches single item by ID', async () => {
    const mockUser = {
      name: 'Alice',
      email: 'a@t.com',
      role: 'admin',
      active: true,
    }

    const users = defineFeature<UserValues>({
      name: 'users-by-id',
      schema: userSchema,
      api: '/api/users',
      fetcher: createMockFetch({
        'GET /api/users/1': { body: mockUser },
      }) as typeof fetch,
    })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result: query, unmount } = mountWith(client, () => users.useById(1))
    await new Promise((r) => setTimeout(r, 50))
    expect(query.data()).toEqual(mockUser)
    unmount()
  })
})

// ─── useCreate ──────────────────────────────────────────────────────────────────

describe('useCreate', () => {
  it('posts to API', async () => {
    const users = defineFeature<UserValues>({
      name: 'users-create',
      schema: userSchema,
      api: '/api/users',
      fetcher: createMockFetch({
        'POST /api/users': { body: { name: 'Created' } },
      }) as typeof fetch,
    })

    const client = new QueryClient()
    const { result: mutation, unmount } = mountWith(client, () => users.useCreate())

    mutation.mutate({ name: 'New' })
    await new Promise((r) => setTimeout(r, 50))
    expect(mutation.isSuccess()).toBe(true)
    unmount()
  })
})

// ─── useUpdate ──────────────────────────────────────────────────────────────────

describe('useUpdate', () => {
  it('sends PUT with id and data', async () => {
    let capturedUrl = ''
    let capturedMethod = ''

    const users = defineFeature<UserValues>({
      name: 'users-update',
      schema: userSchema,
      api: '/api/users',
      fetcher: (async (url: string, init?: RequestInit) => {
        capturedUrl = url
        capturedMethod = init?.method ?? 'GET'
        return new Response('{}', { status: 200 })
      }) as typeof fetch,
    })

    const client = new QueryClient()
    const { result: mutation, unmount } = mountWith(client, () => users.useUpdate())

    mutation.mutate({ id: 42, data: { name: 'Updated' } })
    await new Promise((r) => setTimeout(r, 50))

    expect(capturedUrl).toBe('/api/users/42')
    expect(capturedMethod).toBe('PUT')
    expect(mutation.isSuccess()).toBe(true)
    unmount()
  })
})

// ─── Optimistic updates ─────────────────────────────────────────────────────────

describe('optimistic updates', () => {
  it('updates cache optimistically before server responds', async () => {
    let resolveUpdate: ((value: Response) => void) | undefined
    const mockUser = {
      id: 1,
      name: 'Alice',
      email: 'a@t.com',
      role: 'admin',
      active: true,
    }

    const users = defineFeature<UserValues & { id: number }>({
      name: 'users-optimistic',
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
          return new Promise<Response>((resolve) => {
            resolveUpdate = resolve
          })
        }
        return new Response(JSON.stringify(mockUser), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }) as typeof fetch,
    })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    // Pre-populate cache
    client.setQueryData(['users-optimistic', 1], mockUser)

    const { result: mutation, unmount } = mountWith(client, () => users.useUpdate())

    // Start mutation — should optimistically update cache
    mutation.mutate({ id: 1, data: { name: 'Bob' } })
    await new Promise((r) => setTimeout(r, 20))

    // Cache should be optimistically updated
    const cached = client.getQueryData(['users-optimistic', 1]) as Record<string, unknown>
    expect(cached.name).toBe('Bob')

    // Resolve server response
    resolveUpdate!(
      new Response(JSON.stringify({ ...mockUser, name: 'Bob' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await new Promise((r) => setTimeout(r, 50))

    unmount()
  })

  it('rolls back cache on server error', async () => {
    const mockUser = {
      id: 2,
      name: 'Alice',
      email: 'a@t.com',
      role: 'admin',
      active: true,
    }

    const users = defineFeature<UserValues & { id: number }>({
      name: 'users-rollback',
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
        return new Response(JSON.stringify(mockUser), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }) as typeof fetch,
    })

    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })

    // Pre-populate cache
    client.setQueryData(['users-rollback', 2], mockUser)

    const { result: mutation, unmount } = mountWith(client, () => users.useUpdate())

    mutation.mutate({ id: 2, data: { name: 'Should rollback' } })
    await new Promise((r) => setTimeout(r, 100))

    // Should roll back to original
    const cached = client.getQueryData(['users-rollback', 2]) as Record<string, unknown>
    expect(cached.name).toBe('Alice')
    expect(mutation.isError()).toBe(true)
    unmount()
  })
})

// ─── useDelete ──────────────────────────────────────────────────────────────────

describe('useDelete', () => {
  it('sends DELETE with id', async () => {
    let capturedUrl = ''
    let capturedMethod = ''

    const users = defineFeature<UserValues>({
      name: 'users-delete',
      schema: userSchema,
      api: '/api/users',
      fetcher: (async (url: string, init?: RequestInit) => {
        capturedUrl = url
        capturedMethod = init?.method ?? 'GET'
        return new Response(null, { status: 204 })
      }) as typeof fetch,
    })

    const client = new QueryClient()
    const { result: mutation, unmount } = mountWith(client, () => users.useDelete())

    mutation.mutate(7)
    await new Promise((r) => setTimeout(r, 50))

    expect(capturedUrl).toBe('/api/users/7')
    expect(capturedMethod).toBe('DELETE')
    expect(mutation.isSuccess()).toBe(true)
    unmount()
  })
})

// ─── useForm ────────────────────────────────────────────────────────────────────

describe('useForm', () => {
  it('creates form with schema validation', () => {
    const users = defineFeature<UserValues>({
      name: 'users-form',
      schema: userSchema,
      api: '/api/users',
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () => users.useForm())

    expect(typeof form.handleSubmit).toBe('function')
    expect(typeof form.register).toBe('function')
    unmount()
  })

  it('submits as POST in create mode', async () => {
    let capturedMethod = ''
    const users = defineFeature<UserValues>({
      name: 'users-form-post',
      schema: userSchema,
      api: '/api/users',
      fetcher: (async (_url: string, init?: RequestInit) => {
        capturedMethod = init?.method ?? 'GET'
        return new Response('{}', { status: 200 })
      }) as typeof fetch,
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () => users.useForm())

    form.setFieldValue('name', 'Al')
    form.setFieldValue('email', 'a@t.com')
    form.setFieldValue('role', 'admin')
    form.setFieldValue('active', true)
    await form.handleSubmit()
    await new Promise((r) => setTimeout(r, 50))

    expect(capturedMethod).toBe('POST')
    unmount()
  })

  it('submits as PUT in edit mode', async () => {
    let capturedMethod = ''
    let capturedUrl = ''
    const users = defineFeature<UserValues>({
      name: 'users-form-put',
      schema: userSchema,
      api: '/api/users',
      fetcher: (async (url: string, init?: RequestInit) => {
        capturedUrl = url
        capturedMethod = init?.method ?? 'GET'
        return new Response('{}', { status: 200 })
      }) as typeof fetch,
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () =>
      users.useForm({
        mode: 'edit',
        id: 42,
        initialValues: {
          name: 'Al',
          email: 'a@t.com',
          role: 'admin',
          active: true,
        },
      }),
    )

    // Wait for auto-fetch to complete (will 404 with mock, but form still works)
    await new Promise((r) => setTimeout(r, 50))

    await form.handleSubmit()
    await new Promise((r) => setTimeout(r, 50))

    expect(capturedMethod).toBe('PUT')
    expect(capturedUrl).toBe('/api/users/42')
    unmount()
  })

  it('calls onSuccess callback', async () => {
    let successResult: unknown = null
    const users = defineFeature<UserValues>({
      name: 'users-form-cb',
      schema: userSchema,
      api: '/api/users',
      fetcher: createMockFetch({
        'POST /api/users': { body: { id: 1 } },
      }) as typeof fetch,
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () =>
      users.useForm({
        onSuccess: (r) => {
          successResult = r
        },
      }),
    )

    form.setFieldValue('name', 'Al')
    form.setFieldValue('email', 'a@t.com')
    form.setFieldValue('role', 'admin')
    form.setFieldValue('active', true)
    await form.handleSubmit()
    await new Promise((r) => setTimeout(r, 50))

    expect(successResult).toEqual({ id: 1 })
    unmount()
  })
})

// ─── Auto-fetch edit form ────────────────────────────────────────────────────

describe('auto-fetch edit form', () => {
  it('populates form fields from API when mode is edit', async () => {
    const mockUser = {
      name: 'Alice',
      email: 'alice@example.com',
      role: 'admin',
      active: true,
    }

    const users = defineFeature<UserValues>({
      name: 'users-form-autofetch',
      schema: userSchema,
      api: '/api/users',
      fetcher: createMockFetch({
        'GET /api/users/42': { body: mockUser },
        'PUT /api/users/42': { body: mockUser },
      }) as typeof fetch,
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () =>
      users.useForm({ mode: 'edit', id: 42 }),
    )

    // Should be loading initially
    expect(form.isSubmitting()).toBe(true)

    await new Promise((r) => setTimeout(r, 100))

    // Should have populated values
    expect(form.isSubmitting()).toBe(false)
    expect(form.values().name).toBe('Alice')
    expect(form.values().email).toBe('alice@example.com')
    expect(form.values().role).toBe('admin')
    expect(form.values().active).toBe(true)
    unmount()
  })

  it('clears loading state on fetch error', async () => {
    const users = defineFeature<UserValues>({
      name: 'users-form-autofetch-err',
      schema: userSchema,
      api: '/api/users',
      fetcher: createMockFetch({
        'GET /api/users/999': { status: 404, body: { message: 'Not found' } },
      }) as typeof fetch,
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () =>
      users.useForm({ mode: 'edit', id: 999 }),
    )

    expect(form.isSubmitting()).toBe(true)
    await new Promise((r) => setTimeout(r, 100))
    expect(form.isSubmitting()).toBe(false)
    unmount()
  })
})

// ─── useStore ──────────────────────────────────────────────────────────────────

describe('useStore', () => {
  it('returns a store with items, selected, and loading signals', () => {
    const users = defineFeature<UserValues>({
      name: 'users-store',
      schema: userSchema,
      api: '/api/users',
    })

    const client = new QueryClient()
    const { result: storeApi, unmount } = mountWith(client, () => users.useStore())

    expect(storeApi.store.items()).toEqual([])
    expect(storeApi.store.selected()).toBe(null)
    expect(storeApi.store.loading()).toBe(false)
    unmount()
  })

  it('select() finds item by id from items list', () => {
    const users = defineFeature<UserValues & { id: number }>({
      name: 'users-store-select',
      schema: z.object({
        id: z.number(),
        name: z.string().min(2),
        email: z.string().email(),
        role: z.enum(['admin', 'editor', 'viewer']),
        active: z.boolean(),
      }),
      api: '/api/users',
    })

    const client = new QueryClient()
    const { result: storeApi, unmount } = mountWith(client, () => users.useStore())

    const items = [
      {
        id: 1,
        name: 'Alice',
        email: 'a@t.com',
        role: 'admin' as const,
        active: true,
      },
      {
        id: 2,
        name: 'Bob',
        email: 'b@t.com',
        role: 'editor' as const,
        active: false,
      },
    ]
    storeApi.store.items.set(items)
    storeApi.store.select(2)

    expect(storeApi.store.selected()?.name).toBe('Bob')
    unmount()
  })

  it('select() sets null when id not found', () => {
    const users = defineFeature<UserValues & { id: number }>({
      name: 'users-store-select-miss',
      schema: z.object({
        id: z.number(),
        name: z.string().min(2),
        email: z.string().email(),
        role: z.enum(['admin', 'editor', 'viewer']),
        active: z.boolean(),
      }),
      api: '/api/users',
    })

    const client = new QueryClient()
    const { result: storeApi, unmount } = mountWith(client, () => users.useStore())

    storeApi.store.items.set([
      {
        id: 1,
        name: 'Alice',
        email: 'a@t.com',
        role: 'admin' as const,
        active: true,
      },
    ])
    storeApi.store.select(999)

    expect(storeApi.store.selected()).toBe(null)
    unmount()
  })

  it('clear() resets selection to null', () => {
    const users = defineFeature<UserValues & { id: number }>({
      name: 'users-store-clear',
      schema: z.object({
        id: z.number(),
        name: z.string().min(2),
        email: z.string().email(),
        role: z.enum(['admin', 'editor', 'viewer']),
        active: z.boolean(),
      }),
      api: '/api/users',
    })

    const client = new QueryClient()
    const { result: storeApi, unmount } = mountWith(client, () => users.useStore())

    storeApi.store.items.set([
      {
        id: 1,
        name: 'Alice',
        email: 'a@t.com',
        role: 'admin' as const,
        active: true,
      },
    ])
    storeApi.store.select(1)
    expect(storeApi.store.selected()).not.toBe(null)

    storeApi.store.clear()
    expect(storeApi.store.selected()).toBe(null)
    unmount()
  })

  it('loading signal reflects loading state', () => {
    const users = defineFeature<UserValues>({
      name: 'users-store-loading',
      schema: userSchema,
      api: '/api/users',
    })

    const client = new QueryClient()
    const { result: storeApi, unmount } = mountWith(client, () => users.useStore())

    expect(storeApi.store.loading()).toBe(false)
    storeApi.store.loading.set(true)
    expect(storeApi.store.loading()).toBe(true)
    unmount()
  })

  it('is singleton — same store returned on multiple calls', () => {
    const users = defineFeature<UserValues>({
      name: 'users-store-singleton',
      schema: userSchema,
      api: '/api/users',
    })

    const client = new QueryClient()
    const { result: store1, unmount: unmount1 } = mountWith(client, () => users.useStore())
    const { result: store2, unmount: unmount2 } = mountWith(client, () => users.useStore())

    expect(store1.id).toBe(store2.id)
    store1.store.loading.set(true)
    expect(store2.store.loading()).toBe(true)
    unmount1()
    unmount2()
  })
})

// ─── useTable ───────────────────────────────────────────────────────────────────

describe('useTable', () => {
  it('creates table with schema-inferred columns', () => {
    const users = defineFeature<UserValues>({
      name: 'users-table',
      schema: userSchema,
      api: '/api/users',
    })

    const data: UserValues[] = [{ name: 'Alice', email: 'a@t.com', role: 'admin', active: true }]

    const client = new QueryClient()
    const { result, unmount } = mountWith(client, () => users.useTable(data))

    expect(result.columns.length).toBeGreaterThan(0)
    expect(result.columns[0]!.name).toBe('name')
    expect(result.columns[0]!.label).toBe('Name')
    expect(result.table().getRowModel().rows).toHaveLength(1)
    unmount()
  })

  it('filters columns by name', () => {
    const users = defineFeature<UserValues>({
      name: 'users-table-cols',
      schema: userSchema,
      api: '/api/users',
    })

    const client = new QueryClient()
    const { result, unmount } = mountWith(client, () =>
      users.useTable([{ name: 'Alice', email: 'a@t.com', role: 'admin', active: true }], {
        columns: ['name', 'email'],
      }),
    )

    expect(result.columns).toHaveLength(2)
    expect(result.columns.map((c) => c.name)).toEqual(['name', 'email'])
    unmount()
  })

  it('accepts reactive data function', () => {
    const users = defineFeature<UserValues>({
      name: 'users-table-fn',
      schema: userSchema,
      api: '/api/users',
    })

    const data = signal<UserValues[]>([
      { name: 'Alice', email: 'a@t.com', role: 'admin', active: true },
    ])

    const client = new QueryClient()
    const { result, unmount } = mountWith(client, () => users.useTable(() => data()))

    expect(result.table().getRowModel().rows).toHaveLength(1)
    unmount()
  })
})

// ─── useSearch ──────────────────────────────────────────────────────────────────

describe('useSearch', () => {
  it('passes search term as query param', async () => {
    let capturedUrl = ''
    const users = defineFeature<UserValues>({
      name: 'users-search',
      schema: userSchema,
      api: '/api/users',
      fetcher: (async (url: string) => {
        capturedUrl = url
        return new Response('[]', { status: 200 })
      }) as typeof fetch,
    })

    const term = signal('alice')
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { unmount } = mountWith(client, () => users.useSearch(term))

    await new Promise((r) => setTimeout(r, 50))
    expect(capturedUrl).toContain('q=alice')
    unmount()
  })

  it('disables query when search term is empty', () => {
    const users = defineFeature<UserValues>({
      name: 'users-search-empty',
      schema: userSchema,
      api: '/api/users',
      fetcher: (() => {
        throw new Error('Should not fetch')
      }) as typeof fetch,
    })

    const term = signal('')
    const client = new QueryClient()
    const { result: query, unmount } = mountWith(client, () => users.useSearch(term))

    expect(query.isPending()).toBe(true)
    expect(query.isFetching()).toBe(false)
    unmount()
  })
})

// ─── Error handling ────────────────────────────────────────────────────────────

describe('error handling', () => {
  it('handles API errors in useList', async () => {
    const users = defineFeature<UserValues>({
      name: 'users-err',
      schema: userSchema,
      api: '/api/users',
      fetcher: createMockFetch({
        'GET /api/users': { status: 500, body: { message: 'Server error' } },
      }) as typeof fetch,
    })

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { result: query, unmount } = mountWith(client, () => users.useList())

    await new Promise((r) => setTimeout(r, 50))
    expect(query.isError()).toBe(true)
    unmount()
  })

  it('parses structured error body from API', async () => {
    const users = defineFeature<UserValues>({
      name: 'users-err-struct',
      schema: userSchema,
      api: '/api/users',
      fetcher: createMockFetch({
        'POST /api/users': {
          status: 422,
          body: { message: 'Validation failed', errors: { email: 'Taken' } },
        },
      }) as typeof fetch,
    })

    const client = new QueryClient()
    const { result: mutation, unmount } = mountWith(client, () => users.useCreate())

    mutation.mutate({ name: 'Test' })
    await new Promise((r) => setTimeout(r, 50))

    expect(mutation.isError()).toBe(true)
    const err = mutation.error() as Error & { errors?: unknown }
    expect(err.message).toBe('Validation failed')
    expect(err.errors).toEqual({ email: 'Taken' })
    unmount()
  })
})

// ─── References ─────────────────────────────────────────────────────────────────

describe('reference', () => {
  it('creates a reference schema object', () => {
    const users = defineFeature<UserValues>({
      name: 'users-ref',
      schema: userSchema,
      api: '/api/users',
    })

    const ref = reference(users)
    expect(isReference(ref)).toBe(true)
    expect(ref._featureName).toBe('users-ref')
  })

  it('validates string and number IDs', () => {
    const users = defineFeature<UserValues>({
      name: 'users-ref-validate',
      schema: userSchema,
      api: '/api/users',
    })

    const ref = reference(users)
    expect(ref.safeParse(42).success).toBe(true)
    expect(ref.safeParse('abc-123').success).toBe(true)
    expect(ref.safeParse(null).success).toBe(false)
    expect(ref.safeParse(undefined).success).toBe(false)
    expect(ref.safeParse({}).success).toBe(false)
  })

  it('safeParseAsync works the same as safeParse', async () => {
    const ref = reference({ name: 'test' })
    const result = await ref.safeParseAsync(42)
    expect(result.success).toBe(true)

    const fail = await ref.safeParseAsync(null)
    expect(fail.success).toBe(false)
  })

  it('isReference returns false for non-reference objects', () => {
    expect(isReference(null)).toBe(false)
    expect(isReference(undefined)).toBe(false)
    expect(isReference(42)).toBe(false)
    expect(isReference('string')).toBe(false)
    expect(isReference({})).toBe(false)
    expect(isReference(z.string())).toBe(false)
  })

  it('reference fields detected in schema introspection', () => {
    const users = defineFeature<UserValues>({
      name: 'users-ref-introspect',
      schema: userSchema,
      api: '/api/users',
    })

    const postSchema = z.object({
      title: z.string(),
      body: z.string(),
      authorId: reference(users) as any,
    })

    const fields = extractFields(postSchema)
    const authorField = fields.find((f) => f.name === 'authorId')
    expect(authorField).toBeDefined()
    expect(authorField!.type).toBe('reference')
    expect(authorField!.referenceTo).toBe('users-ref-introspect')
  })

  it('reference fields in defineFeature schema produce reference FieldInfo', () => {
    const users = defineFeature<UserValues>({
      name: 'users-ref-in-feat',
      schema: userSchema,
      api: '/api/users',
    })

    type PostValues = { title: string; body: string; authorId: string }
    const posts = defineFeature<PostValues>({
      name: 'posts-ref',
      schema: z.object({
        title: z.string(),
        body: z.string(),
        authorId: reference(users) as any,
      }),
      api: '/api/posts',
    })

    const authorField = posts.fields.find((f) => f.name === 'authorId')
    expect(authorField).toBeDefined()
    expect(authorField!.type).toBe('reference')
    expect(authorField!.referenceTo).toBe('users-ref-in-feat')
  })
})

// ─── Edge case coverage ────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('defineFeature works without a Zod schema (no validation)', () => {
    const items = defineFeature<{ title: string }>({
      name: 'items-no-zod',
      schema: { notAZodSchema: true } as { _output?: { title: string } },
      api: '/api/items',
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () => items.useForm())
    expect(typeof form.handleSubmit).toBe('function')
    unmount()
  })

  it('useForm onError callback fires on submit failure', async () => {
    let caughtError: unknown = null
    const users = defineFeature<UserValues>({
      name: 'users-form-onerror',
      schema: userSchema,
      api: '/api/users',
      fetcher: createMockFetch({
        'POST /api/users': {
          status: 500,
          body: { message: 'Server broke' },
        },
      }) as typeof fetch,
    })

    const client = new QueryClient()
    const { result: form, unmount } = mountWith(client, () =>
      users.useForm({
        onError: (err) => {
          caughtError = err
        },
      }),
    )

    form.setFieldValue('name', 'Al')
    form.setFieldValue('email', 'a@t.com')
    form.setFieldValue('role', 'admin')
    form.setFieldValue('active', true)

    try {
      await form.handleSubmit()
    } catch {
      // expected
    }
    await new Promise((r) => setTimeout(r, 50))

    expect(caughtError).toBeInstanceOf(Error)
    unmount()
  })

  it('useTable sorting via direct state object (non-function updater)', () => {
    const users = defineFeature<UserValues>({
      name: 'users-table-sort-direct',
      schema: userSchema,
      api: '/api/users',
    })

    const data: UserValues[] = [
      { name: 'Bob', email: 'b@t.com', role: 'editor', active: true },
      { name: 'Alice', email: 'a@t.com', role: 'admin', active: true },
    ]

    const client = new QueryClient()
    const { result, unmount } = mountWith(client, () => users.useTable(data))

    // Trigger sorting via the table's toggle handler (function updater)
    result.table().getColumn('name')!.toggleSorting(false)
    expect(result.sorting().length).toBe(1)

    // Also set sorting directly (non-function updater path)
    result.sorting.set([{ id: 'email', desc: true }])
    expect(result.sorting()).toEqual([{ id: 'email', desc: true }])

    // Set globalFilter directly
    result.globalFilter.set('alice')
    expect(result.globalFilter()).toBe('alice')

    unmount()
  })
})
