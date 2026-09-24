// @vitest-environment happy-dom
/**
 * The CLIENT half of `<Form>` / `useSubmission`: the enhanced submit, the
 * redirect and error outcomes, the hydrated server result, and reactive
 * attributes forwarded through `<Form>`. The server half (no-JS posts, the
 * JSON endpoint) lives in `form-actions.test.ts`.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import type { Router } from '@pyreon/router'
import { setActiveRouter } from '@pyreon/router'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _actionStub, _resetActions, Form, useSubmission } from '../actions'

const tick = () => new Promise((r) => setTimeout(r, 0))

function respondWith(body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(body))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function fakeRouter() {
  const r = { revalidate: vi.fn(async () => {}), invalidateLoader: vi.fn(), push: vi.fn(async () => {}) }
  setActiveRouter(r as unknown as Router)
  return r
}

let containers: HTMLElement[] = []
function mountInto(vnode: ReturnType<typeof h>) {
  const el = document.createElement('div')
  document.body.appendChild(el)
  containers.push(el)
  const dispose = mount(vnode, el)
  return { el, dispose }
}

afterEach(() => {
  vi.unstubAllGlobals()
  _resetActions()
  setActiveRouter(null as unknown as Router)
  for (const c of containers) c.remove()
  containers = []
  for (const t of document.querySelectorAll('template[data-zero-action-result]')) t.remove()
})

describe('useSubmission — client outcomes', () => {
  it('a network error settles as error + status 500, not pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    const sub = useSubmission(_actionStub('action_net'))
    await sub.submit({ a: '1' }, { url: 'http://localhost/x' })
    expect(sub.error()).toBe('offline')
    expect(sub.status()).toBe(500)
    expect(sub.pending()).toBe(false)
    expect(sub.input()).toBeUndefined()
  })

  it('a non-Error rejection reports a generic network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw 'nope'
      }),
    )
    const sub = useSubmission(_actionStub('action_net2'))
    await sub.submit(new FormData(), { url: 'http://localhost/x' })
    expect(sub.error()).toBe('Network error')
  })

  it('an error body sets error and does not revalidate', async () => {
    const router = fakeRouter()
    respondWith({ kind: 'error', message: 'Internal error' })
    const sub = useSubmission(_actionStub('action_err'))
    await sub.submit({}, { url: 'http://localhost/x' })
    expect(sub.error()).toBe('Internal error')
    expect(router.revalidate).not.toHaveBeenCalled()
  })

  it('a redirect navigates through the router', async () => {
    const router = fakeRouter()
    respondWith({ kind: 'redirect', to: '/done' })
    const sub = useSubmission(_actionStub('action_redir'))
    await sub.submit({}, { url: 'http://localhost/x' })
    expect(router.push).toHaveBeenCalledWith('/done')
    expect(sub.pending()).toBe(false)
  })

  it('a redirect without a router falls back to a full navigation', async () => {
    respondWith({ kind: 'redirect', to: '/elsewhere' })
    const assign = vi.fn()
    vi.stubGlobal('location', { href: 'http://localhost/x', assign })
    const sub = useSubmission(_actionStub('action_redir2'))
    await sub.submit({}, { url: 'http://localhost/x' })
    expect(assign).toHaveBeenCalledWith('/elsewhere')
  })

  it('without an explicit url, posts to the current page with ?_action=<id>, keeping its query', async () => {
    const fetchMock = respondWith({ kind: 'data', status: 200, data: 1 })
    vi.stubGlobal('location', { href: 'http://localhost/posts?page=2#top', assign: vi.fn() })
    const sub = useSubmission(_actionStub('action_url'))
    await sub.submit({ title: 'x' })
    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost/posts?page=2&_action=action_url')
    const init = fetchMock.mock.calls[0]![1]!
    expect((init.body as FormData).get('title')).toBe('x')
    expect((init.headers as Record<string, string>)['X-Zero-Action']).toBe('1')
  })

  it('reset() clears result, status and error', async () => {
    respondWith({ kind: 'data', status: 201, data: { ok: true } })
    const sub = useSubmission(_actionStub('action_reset'))
    await sub.submit({}, { url: 'http://localhost/x' })
    expect(sub.result()).toEqual({ ok: true })
    expect(sub.status()).toBe(201)
    sub.reset()
    expect(sub.result()).toBeUndefined()
    expect(sub.status()).toBeUndefined()
    expect(sub.error()).toBeUndefined()
  })

  it('two hooks for the same action share one state', async () => {
    respondWith({ kind: 'data', status: 200, data: 'shared' })
    const a = useSubmission(_actionStub('action_shared'))
    const b = useSubmission(_actionStub('action_shared'))
    await a.submit({}, { url: 'http://localhost/x' })
    expect(b.result()).toBe('shared')
  })
})

describe('useSubmission — hydrated server result', () => {
  function seed(id: string, value: string) {
    const t = document.createElement('template')
    t.setAttribute('data-zero-action-result', id)
    t.setAttribute('data-value', value)
    document.body.appendChild(t)
  }

  it('picks up the result a no-JS post rendered on the server', () => {
    seed('action_hyd', JSON.stringify({ id: 'action_hyd', status: 422, data: { error: 'Title is required' } }))
    const sub = useSubmission(_actionStub<{ error: string }>('action_hyd'))
    expect(sub.status()).toBe(422)
    expect(sub.result()).toEqual({ error: 'Title is required' })
  })

  it('ignores a malformed snapshot', () => {
    seed('action_bad', '{not json')
    const sub = useSubmission(_actionStub('action_bad'))
    expect(sub.result()).toBeUndefined()
    expect(sub.status()).toBeUndefined()
  })
})

describe('<Form> — client', () => {
  function submitForm(form: HTMLFormElement) {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  }

  it('intercepts submit, posts via fetch, resets the fields and calls onSuccess', async () => {
    fakeRouter()
    const fetchMock = respondWith({ kind: 'data', status: 200, data: { created: 'hi' } })
    const onSuccess = vi.fn()
    const action = _actionStub<{ created: string }>('action_form')
    const { el } = mountInto(h(Form, { action, onSuccess, class: 'f' }, h('input', { name: 'title', value: 'hi' })))
    const form = el.querySelector('form')!
    expect(form.getAttribute('method')).toBe('post')
    expect(form.getAttribute('action')).toBe('?_action=action_form')
    const input = form.querySelector('input')!
    input.value = 'typed'
    submitForm(form)
    await tick()
    await tick()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0]![1]!.body as FormData).get('title')).toBe('typed')
    expect(onSuccess).toHaveBeenCalledWith({ created: 'hi' })
    expect(input.value).toBe('hi')
  })

  it('resetOnSuccess: false keeps the fields; a failure never calls onSuccess', async () => {
    respondWith({ kind: 'data', status: 422, data: { error: 'bad' } })
    const onSuccess = vi.fn()
    const action = _actionStub('action_keep')
    const { el } = mountInto(h(Form, { action, onSuccess, resetOnSuccess: false }, h('input', { name: 'title' })))
    const form = el.querySelector('form')!
    const input = form.querySelector('input')!
    input.value = 'kept'
    submitForm(form)
    await tick()
    await tick()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(input.value).toBe('kept')
  })

  it('leaves a submit another handler already prevented alone', async () => {
    const fetchMock = respondWith({ kind: 'data', status: 200, data: null })
    const action = _actionStub('action_prevented')
    const { el } = mountInto(h(Form, { action }, h('input', { name: 'title' })))
    const form = el.querySelector('form')!
    const ev = new Event('submit', { bubbles: true, cancelable: true })
    ev.preventDefault()
    form.dispatchEvent(ev)
    await tick()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders the hydrated server result as an inert template', () => {
    const t = document.createElement('template')
    t.setAttribute('data-zero-action-result', 'action_tpl')
    t.setAttribute('data-value', JSON.stringify({ id: 'action_tpl', status: 200, data: 1 }))
    document.body.appendChild(t)
    const { el } = mountInto(h(Form, { action: _actionStub('action_tpl') }))
    const inner = el.querySelector('form > template[data-zero-action-result="action_tpl"]')
    expect(inner).not.toBeNull()
    expect(JSON.parse(inner!.getAttribute('data-value')!)).toEqual({ id: 'action_tpl', status: 200, data: 1 })
  })

  it('keeps a reactive attribute live (props are forwarded by descriptor, not by value)', () => {
    const cls = signal('a')
    const props: Record<string, unknown> = { action: _actionStub('action_cls') }
    Object.defineProperty(props, 'class', { get: () => cls(), enumerable: true, configurable: true })
    const { el } = mountInto(h(Form, props as never))
    const form = el.querySelector('form')!
    expect(form.getAttribute('class')).toBe('a')
    cls.set('b')
    expect(form.getAttribute('class')).toBe('b')
  })
})
