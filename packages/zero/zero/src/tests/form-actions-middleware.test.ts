/**
 * `createFormActionMiddleware` in isolation — the branches the end-to-end
 * suite (`form-actions.test.ts`) does not reach through `createServer`:
 * an unknown action id, the enhanced (JSON) form of the refusals, and
 * `base` handling on the 303.
 */
import { redirect } from '@pyreon/router'
import type { MiddlewareContext } from '@pyreon/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _defineActionWithId, _resetActions, resolveActionOptions } from '../actions'
import { createFormActionMiddleware } from '../form-actions-server'

function ctx(url: string, init: RequestInit = {}): MiddlewareContext {
  const req = new Request(url, { method: 'POST', ...init })
  return { req, url: new URL(url), locals: {}, headers: new Headers() } as unknown as MiddlewareContext
}

function middleware(base = '', render = vi.fn(async () => new Response('<p>page</p>', { status: 200 }))) {
  return {
    render,
    mw: createFormActionMiddleware({ routes: [], render, options: resolveActionOptions(), base }),
  }
}

const ENHANCED = { 'X-Zero-Action': '1' }

afterEach(() => {
  _resetActions()
})

describe('createFormActionMiddleware', () => {
  it('ignores non-POSTs and framework-internal paths', async () => {
    const { mw } = middleware()
    expect(await mw(ctx('http://h/p?_action=x', { method: 'GET' }))).toBeUndefined()
    expect(await mw(ctx('http://h/_zero/actions/x?_action=x'))).toBeUndefined()
    expect(await mw(ctx('http://h/_pyreon/x?_action=x'))).toBeUndefined()
  })

  it('an unknown action id is a 404 — text for a form post, JSON when enhanced', async () => {
    const { mw } = middleware()
    const plain = (await mw(ctx('http://h/p?_action=action_missing'))) as Response
    expect(plain.status).toBe(404)
    expect(await plain.text()).toBe('Action not found')
    const json = (await mw(ctx('http://h/p?_action=action_missing', { headers: ENHANCED }))) as Response
    expect(json.status).toBe(404)
    expect(await json.json()).toEqual({ kind: 'error', message: 'Action not found' })
  })

  it('a cross-origin enhanced post is refused as JSON 403', async () => {
    _defineActionWithId('action_x', async () => 1)
    const { mw } = middleware()
    const res = (await mw(
      ctx('http://h/p?_action=action_x', { headers: { ...ENHANCED, Origin: 'https://evil.example' } }),
    )) as Response
    expect(res.status).toBe(403)
    expect(((await res.json()) as { kind: string }).kind).toBe('error')
  })

  it('an enhanced thrown error answers JSON 500, uncached', async () => {
    _defineActionWithId('action_boom', async () => {
      throw new Error('boom')
    })
    const { mw } = middleware()
    const res = (await mw(ctx('http://h/p?_action=action_boom', { headers: ENHANCED, body: new FormData() }))) as Response
    expect(res.status).toBe(500)
    expect(((await res.json()) as { kind: string }).kind).toBe('error')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('prefixes base onto a 303, but not onto a path already under it or an external URL', async () => {
    _defineActionWithId('action_r1', async () => {
      throw redirect('/done')
    })
    _defineActionWithId('action_r2', async () => {
      throw redirect('/app/done')
    })
    const { mw } = middleware('/app')
    const r1 = (await mw(ctx('http://h/app/p?_action=action_r1', { body: new FormData() }))) as Response
    expect(r1.status).toBe(303)
    expect(r1.headers.get('Location')).toBe('/app/done')
    const r2 = (await mw(ctx('http://h/app/p?_action=action_r2', { body: new FormData() }))) as Response
    expect(r2.headers.get('Location')).toBe('/app/done')
  })

  it('a page that does not render 200 keeps its own status on the re-render', async () => {
    _defineActionWithId('action_ok', async () => ({ ok: true }))
    const { mw, render } = middleware('', vi.fn(async () => new Response('missing', { status: 404 })))
    const res = (await mw(ctx('http://h/p?x=1&_action=action_ok', { body: new FormData() }))) as Response
    expect(res.status).toBe(404)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const getReq = render.mock.calls[0]![0] as Request
    expect(getReq.method).toBe('GET')
    expect(new URL(getReq.url).search).toBe('?x=1')
  })
})
