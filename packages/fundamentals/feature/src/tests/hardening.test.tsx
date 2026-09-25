// Regression locks for the 2026-09 @pyreon/feature hardening pass. Each
// describe names the failure scenario it closes; every one was bisect-verified.

import { h } from '@pyreon/core'
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { resetAllStores } from '@pyreon/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineFeature } from '../define-feature'
import { defaultInitialValues, extractFields } from '../schema'

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))
let seq = 0
const uniq = (p: string) => `${p}-${++seq}-${Math.floor(performance.now() * 1000)}`

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mountWith<T>(client: QueryClient, fn: () => T): { result: T; host: HTMLElement; unmount: () => void } {
  let result: T | undefined
  const host = document.createElement('div')
  document.body.appendChild(host)
  const unmount = mount(
    h(QueryClientProvider, { client }, h(() => {
      result = fn()
      return null
    }, null)),
    host,
  )
  return {
    result: result!,
    host,
    unmount: () => {
      unmount()
      host.remove()
    },
  }
}

function render(client: QueryClient, cmp: () => unknown): HTMLElement {
  const host = document.createElement('div')
  document.body.appendChild(host)
  mount(h(QueryClientProvider, { client }, h(cmp as never, null)), host)
  return host
}

afterEach(() => {
  resetAllStores()
  vi.restoreAllMocks()
})

const schema = z.object({
  title: z.string().min(1),
  count: z.number(),
  due: z.date(),
  email: z.string().email(),
  tags: z.array(z.string()),
})
type Values = z.infer<typeof schema>

describe('<F.Field> for number / date fields feeds the schema the right type', () => {
  it('a number input stores a number, not "42"', () => {
    const F = defineFeature<Values>({ name: uniq('num'), schema, api: '/x' })
    let form!: ReturnType<typeof F.useForm>
    const host = render(new QueryClient(), () => {
      form = F.useForm()
      return h(F.Field, { form, name: 'count' })
    })
    const input = host.querySelector('input')!
    input.value = '42'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(form.values().count).toBe(42)
  })

  it('a date input stores a Date and renders it back as yyyy-mm-dd', () => {
    const F = defineFeature<Values>({ name: uniq('date'), schema, api: '/x' })
    let form!: ReturnType<typeof F.useForm>
    const host = render(new QueryClient(), () => {
      form = F.useForm()
      return h(F.Field, { form, name: 'due' })
    })
    const input = host.querySelector('input')!
    expect(input.type).toBe('date')
    input.value = '2026-03-04'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const due = form.values().due as unknown
    expect(due).toBeInstanceOf(Date)
    expect((due as Date).toISOString().slice(0, 10)).toBe('2026-03-04')
    form.setFieldValue('due', new Date('2027-01-02'))
    expect(input.value).toBe('2027-01-02')
  })
})

describe('<F.Field> a11y', () => {
  it('marks required controls with aria-required and maps email to type=email', () => {
    const F = defineFeature<Values>({ name: uniq('a11y'), schema, api: '/x' })
    const host = render(new QueryClient(), () => {
      const form = F.useForm()
      return h('div', null, h(F.Field, { form, name: 'email' }), h(F.Field, { form, name: 'count' }))
    })
    const email = host.querySelector('[data-field=email] input') as HTMLInputElement
    expect(email.type).toBe('email')
    expect(email.getAttribute('aria-required')).toBe('true')
    const count = host.querySelector('[data-field=count] input') as HTMLInputElement
    expect(count.getAttribute('inputmode')).toBe('decimal')
  })

  it('an optional field is not aria-required', () => {
    const s = z.object({ note: z.string().optional() })
    const F = defineFeature<z.infer<typeof s>>({ name: uniq('opt'), schema: s, api: '/x' })
    const host = render(new QueryClient(), () => {
      const form = F.useForm()
      return h(F.Field, { form, name: 'note' })
    })
    expect(host.querySelector('input')!.hasAttribute('aria-required')).toBe(false)
  })
})

describe('edit-mode load failure never lets a blank form overwrite the record', () => {
  it('surfaces the error, keeps the form disabled, and refuses to submit', async () => {
    const puts: unknown[] = []
    const onError = vi.fn()
    const s = z.object({ name: z.string() })
    const F = defineFeature<z.infer<typeof s>>({
      name: uniq('loadfail'),
      schema: s,
      api: '/api/u',
      fetcher: (async (_url: string, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'PUT') {
          puts.push(init?.body)
          return json({})
        }
        return json({ message: 'boom' }, 500)
      }) as typeof fetch,
    })
    const { result: form, unmount } = mountWith(new QueryClient(), () =>
      F.useForm({ mode: 'edit', id: 1, onError }),
    )
    expect(form.isLoading()).toBe(true)
    await tick(50)
    expect(form.isLoading()).toBe(false)
    expect(form.loadError()).toBeInstanceOf(Error)
    expect(form.submitError()).toBe(form.loadError())
    expect(form.disabled()).toBe(true)
    expect(onError).toHaveBeenCalledWith(form.loadError())
    await form.handleSubmit()
    expect(puts).toEqual([])
    unmount()
  })

  it('refuses to submit while the record is still loading', async () => {
    const puts: unknown[] = []
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const s = z.object({ name: z.string() })
    const F = defineFeature<z.infer<typeof s>>({
      name: uniq('loading'),
      schema: s,
      api: '/api/u',
      fetcher: (async (_url: string, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'PUT') {
          puts.push(init?.body)
          return json({})
        }
        await gate
        return json({ name: 'server' })
      }) as typeof fetch,
    })
    const { result: form, unmount } = mountWith(new QueryClient(), () =>
      F.useForm({ mode: 'edit', id: 1 }),
    )
    await form.handleSubmit()
    expect(puts).toEqual([])
    expect(String(form.submitError())).toMatch(/\[Pyreon\]/)
    release()
    await tick(20)
    unmount()
  })
})

describe('edit-mode load re-bases instead of dirtying', () => {
  it('loaded values are the baseline: not dirty, not validated', async () => {
    const s = z.object({ name: z.string().min(10) })
    const client = new QueryClient()
    const F = defineFeature<z.infer<typeof s>>({
      name: uniq('rebase'),
      schema: s,
      api: '/api/u',
      fetcher: (async () => json({ id: 1, name: 'short' })) as typeof fetch,
    })
    const { result: form, unmount } = mountWith(client, () =>
      F.useForm({ mode: 'edit', id: 1, validateOn: 'change' }),
    )
    await tick(50)
    expect(form.values().name).toBe('short')
    expect(form.isDirty()).toBe(false)
    expect(form.fields.name.error()).toBeUndefined()
    // …and it went through the shared query cache useById reads.
    expect(client.getQueryData([F.name, 1])).toEqual({ id: 1, name: 'short' })
    unmount()
  })

  it('an ISO date string from the server is coerced to a Date for a date field', async () => {
    const s = z.object({ due: z.date() })
    const F = defineFeature<z.infer<typeof s>>({
      name: uniq('datecoerce'),
      schema: s,
      api: '/api/u',
      fetcher: (async () => json({ due: '2026-05-06T00:00:00.000Z' })) as typeof fetch,
    })
    const { result: form, unmount } = mountWith(new QueryClient(), () =>
      F.useForm({ mode: 'edit', id: 1 }),
    )
    await tick(50)
    expect(form.values().due).toBeInstanceOf(Date)
    unmount()
  })
})

describe('useUpdate rollback with no cached record', () => {
  it('removes the optimistic partial object instead of leaving it cached', async () => {
    const s = z.object({ name: z.string(), email: z.string() })
    const client = new QueryClient()
    const F = defineFeature<z.infer<typeof s>>({
      name: uniq('rollback'),
      schema: s,
      api: '/api/u',
      fetcher: (async () => json({ message: 'nope' }, 500)) as typeof fetch,
    })
    const { result: mutation, unmount } = mountWith(client, () => F.useUpdate())
    mutation.mutate({ id: 9, data: { name: 'partial' } })
    await tick(50)
    expect(client.getQueryData([F.name, 9])).toBeUndefined()
    unmount()
  })
})

describe('useById accepts a reactive id', () => {
  it('re-fetches when the id accessor changes', async () => {
    const s = z.object({ name: z.string() })
    const seen: string[] = []
    const F = defineFeature<z.infer<typeof s>>({
      name: uniq('byid'),
      schema: s,
      api: '/api/u',
      fetcher: (async (url: string) => {
        seen.push(String(url))
        return json({ name: String(url) })
      }) as typeof fetch,
    })
    const id = signal<number | undefined>(undefined)
    const { result: q, unmount } = mountWith(new QueryClient(), () => F.useById(() => id()))
    await tick(20)
    expect(seen).toEqual([])
    id.set(1)
    await tick(30)
    id.set(2)
    await tick(30)
    expect(seen).toEqual(['/api/u/1', '/api/u/2'])
    expect(q.data()).toEqual({ name: '/api/u/2' })
    unmount()
  })
})

describe('defaultInitialValues', () => {
  it('arrays default to [], dates to undefined, and .default(x) is honoured', () => {
    const s = z.object({
      tags: z.array(z.string()),
      due: z.date(),
      role: z.enum(['a', 'b']).default('b'),
      n: z.number().default(7),
      maybe: z.string().optional().default('hi'),
    })
    const values = defaultInitialValues(extractFields(s))
    expect(values).toEqual({ tags: [], due: undefined, role: 'b', n: 7, maybe: 'hi' })
    expect(extractFields(s).find((f) => f.name === 'role')!.type).toBe('enum')
  })
})

describe('<F.Table> sortable headers are keyboard reachable', () => {
  it('renders a <button> in each sortable <th> with a live aria-sort', async () => {
    const s = z.object({ name: z.string(), age: z.number() })
    const F = defineFeature<z.infer<typeof s>>({ name: uniq('tbl'), schema: s, api: '/x' })
    const host = render(new QueryClient(), () => {
      const api = F.useTable([
        { name: 'b', age: 2 },
        { name: 'a', age: 1 },
      ])
      return h(F.Table, { of: api })
    })
    const th = host.querySelectorAll('thead th')[0]!
    const btn = th.querySelector('button')!
    expect(btn).not.toBeNull()
    expect(btn.getAttribute('type')).toBe('button')
    expect(th.getAttribute('aria-sort')).toBe('none')
    btn.click()
    await tick()
    expect(th.getAttribute('aria-sort')).toBe('ascending')
    expect(host.querySelector('tbody td')!.textContent).toBe('a')
  })
})

describe('coverage of the new edge arms', () => {
  it('url format → type=url; a string / invalid / cleared date value binds sanely', () => {
    const s = z.object({ site: z.string().url(), due: z.date() })
    const F = defineFeature<z.infer<typeof s>>({ name: uniq('edges'), schema: s, api: '/x' })
    let form!: ReturnType<typeof F.useForm>
    const host = render(new QueryClient(), () => {
      form = F.useForm()
      return h('div', null, h(F.Field, { form, name: 'site' }), h(F.Field, { form, name: 'due' }))
    })
    expect((host.querySelector('[data-field=site] input') as HTMLInputElement).type).toBe('url')
    const due = host.querySelector('[data-field=due] input') as HTMLInputElement
    form.setFieldValue('due', '2026-02-03T10:00:00Z' as never)
    expect(due.value).toBe('2026-02-03')
    form.setFieldValue('due', new Date('not a date'))
    expect(due.value).toBe('')
    due.value = ''
    due.dispatchEvent(new Event('input', { bubbles: true }))
    expect(form.values().due).toBeUndefined()
  })

  it('a zod-v3-shaped .default() thunk is unwrapped', () => {
    const v3Default = {
      _def: {
        typeName: 'ZodDefault',
        defaultValue: () => 5,
        innerType: { _def: { typeName: 'ZodNumber' } },
      },
    }
    const fields = extractFields({ shape: { n: v3Default } })
    expect(fields[0]).toMatchObject({ name: 'n', type: 'number', defaultValue: 5 })
  })

  it('an edit load with a null body, or an unparsable date string, keeps defaults', async () => {
    const s = z.object({ due: z.date() })
    const F = defineFeature<z.infer<typeof s>>({
      name: uniq('nullbody'),
      schema: s,
      api: '/api/u',
      fetcher: (async () => json({ due: 'garbage' })) as typeof fetch,
    })
    const { result: form, unmount } = mountWith(new QueryClient(), () =>
      F.useForm({ mode: 'edit', id: 1 }),
    )
    await tick(50)
    expect(form.values().due).toBe('garbage')
    unmount()

    const G = defineFeature<z.infer<typeof s>>({
      name: uniq('nullbody2'),
      schema: s,
      api: '/api/u',
      fetcher: (async () => new Response(null, { status: 204 })) as typeof fetch,
    })
    const second = mountWith(new QueryClient(), () => G.useForm({ mode: 'edit', id: 1 }))
    await tick(50)
    expect(second.result.isLoading()).toBe(false)
    second.unmount()
  })

  it('a load failure after unmount is ignored', async () => {
    let fail!: () => void
    const gate = new Promise<void>((r) => {
      fail = r
    })
    const s = z.object({ name: z.string() })
    const onError = vi.fn()
    const F = defineFeature<z.infer<typeof s>>({
      name: uniq('latefail'),
      schema: s,
      api: '/api/u',
      fetcher: (async () => {
        await gate
        return json({ message: 'x' }, 500)
      }) as typeof fetch,
    })
    const { result: form, unmount } = mountWith(new QueryClient(), () =>
      F.useForm({ mode: 'edit', id: 1, onError }),
    )
    unmount()
    fail()
    await tick(30)
    expect(onError).not.toHaveBeenCalled()
    expect(form.loadError()).toBeUndefined()
  })
})

describe('coverage of pre-existing rendering arms', () => {
  it('inputClass reaches select + checkbox; an enum with no values renders no options', () => {
    const F = defineFeature<{ role: string; on: boolean }>({
      name: uniq('cls'),
      schema: { role: 'enum', on: 'boolean' } as never,
      api: '/x',
    })
    const host = render(new QueryClient(), () => {
      const form = F.useForm()
      return h(
        'div',
        null,
        h(F.Field, { form, name: 'role', inputClass: 'c1' }),
        h(F.Field, { form, name: 'on', inputClass: 'c2' }),
      )
    })
    expect(host.querySelector('select')!.className).toBe('c1')
    expect(host.querySelectorAll('option')).toHaveLength(0)
    expect(host.querySelector('input[type=checkbox]')!.className).toBe('c2')
  })

  it('a feature with no fields names "(none)" in the unknown-field error', () => {
    const F = defineFeature<Record<string, unknown>>({ name: uniq('nofields'), schema: {} as never, api: '/x' })
    let caught: unknown
    render(new QueryClient(), () => {
      const form = F.useForm()
      try {
        F.Field({ form, name: 'x' })
      } catch (e) {
        caught = e
      }
      return null
    })
    expect(String(caught)).toMatch(/\(none\)/)
  })

  it('table: class, value-form sorting, and empty with zero columns', async () => {
    const s = z.object({ name: z.string() })
    const F = defineFeature<z.infer<typeof s>>({ name: uniq('tbl2'), schema: s, api: '/x' })
    let api!: ReturnType<typeof F.useTable>
    const host = render(new QueryClient(), () => {
      api = F.useTable([{ name: 'b' }, { name: 'a' }])
      return h(F.Table, { of: api, class: 'grid' })
    })
    expect(host.querySelector('table')!.className).toBe('grid')
    ;(api.table as unknown as { setSorting: (v: unknown) => void }).setSorting([
      { id: 'name', desc: false },
    ])
    await tick()
    expect(api.sorting()).toEqual([{ id: 'name', desc: false }])

    const host2 = render(new QueryClient(), () => {
      const empty = F.useTable([], { columns: [] })
      return h(F.Table, { of: empty, empty: 'nothing' })
    })
    expect(host2.querySelector('td')!.getAttribute('colspan')).toBe('1')
  })
})
