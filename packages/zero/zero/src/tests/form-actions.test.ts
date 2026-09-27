/**
 * Page form posts end to end through `createServer`: the no-JavaScript
 * path of `<Form>` / a route `action` export, and the enhanced JSON path.
 */
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { redirect } from '@pyreon/router'
import type { Middleware } from '@pyreon/server'
import { afterEach, describe, expect, it } from 'vitest'
import { _defineActionWithId, _resetActions, DEFAULT_ACTION_BODY_LIMIT, fail, Form, useSubmission } from '../actions'
import { createServer } from '../entry-server'
import type { RouteMiddlewareEntry } from '../types'

let created: string[] = []

function makeAction() {
  return _defineActionWithId<{ created: string } | ReturnType<typeof fail<{ error: string }>>>(
    'action_test_create',
    async ({ formData }) => {
      const title = String(formData?.get('title') ?? '')
      if (title === 'boom') throw new Error('db password leaked')
      if (title === 'go') throw redirect('/done')
      if (!title) return fail(422, { error: 'Title is required' })
      created.push(title)
      return { created: title }
    },
  )
}

function routesFor(action: ReturnType<typeof makeAction>): RouteRecord[] {
  const NewPost = () => {
    const sub = useSubmission(action)
    const r = sub.result() as { created?: string; error?: string } | undefined
    return h(
      'main',
      null,
      h('p', { id: 'result' }, r?.created ? `created:${r.created}` : r?.error ? `error:${r.error}` : 'none'),
      h('p', { id: 'err' }, sub.error() ?? ''),
      h(Form, { action, class: 'f' }, h('input', { name: 'title' })),
    )
  }
  return [
    { path: '/', component: () => h('p', null, 'home') },
    { path: '/new', component: NewPost },
    { path: '/done', component: () => h('p', null, 'done') },
  ]
}

/** What the generated route-middleware module emits for a route `action` export. */
function routeActionEntry(action: unknown): RouteMiddlewareEntry {
  return {
    pattern: '/new',
    middleware: (ctx) => {
      if (ctx.req.method === 'POST') ctx.locals['zero:routeAction'] = action
    },
  }
}

const post = (path: string, body: BodyInit, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, { method: 'POST', body, headers })

const form = (fields: Record<string, string>) => new URLSearchParams(fields)

afterEach(() => {
  _resetActions()
  created = []
})

describe('<Form> SSR', () => {
  it('renders a real post form targeting the page itself with the action id', async () => {
    const action = makeAction()
    const server = createServer({ routes: routesFor(action) })
    const html = await (await server(new Request('http://localhost/new'))).text()
    expect(html).toContain('method="post"')
    expect(html).toContain('action="?_action=action_test_create"')
    expect(html).toContain('<p id="result">none</p>')
  })
})

describe('no-JS form post', () => {
  it('runs the action and re-renders the page with the result', async () => {
    const action = makeAction()
    const server = createServer({ routes: routesFor(action) })
    const res = await server(post('/new?_action=action_test_create', form({ title: 'hello' }), {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'http://localhost',
    }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const html = await res.text()
    expect(created).toEqual(['hello'])
    expect(html).toContain('<p id="result">created:hello</p>')
    // The result travels to the client for hydration.
    expect(html).toContain('data-zero-action-result="action_test_create"')
  })

  it('a fail() re-renders under its status with its data', async () => {
    const action = makeAction()
    const server = createServer({ routes: routesFor(action) })
    const res = await server(post('/new?_action=action_test_create', form({ title: '' }), {
      'content-type': 'application/x-www-form-urlencoded',
    }))
    expect(res.status).toBe(422)
    expect(await res.text()).toContain('<p id="result">error:Title is required</p>')
  })

  it('a redirect() answers 303 See Other (PRG), prefixed with base', async () => {
    const action = makeAction()
    const server = createServer({ routes: routesFor(action), config: { base: '/app/' } })
    const res = await server(post('/app/new?_action=action_test_create', form({ title: 'go' }), {
      'content-type': 'application/x-www-form-urlencoded',
    }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/app/done')
  })

  it('a thrown error re-renders as 500 without leaking the message in production', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const action = makeAction()
      const server = createServer({ routes: routesFor(action) })
      const res = await server(post('/new?_action=action_test_create', form({ title: 'boom' }), {
        'content-type': 'application/x-www-form-urlencoded',
      }))
      expect(res.status).toBe(500)
      const html = await res.text()
      expect(html).not.toContain('db password')
      expect(html).toContain('<p id="err">Internal server error</p>')
    } finally {
      process.env.NODE_ENV = prev
    }
  })

  it('a plain <form method="post"> reaches the route-level action export', async () => {
    const action = makeAction()
    const server = createServer({ routes: routesFor(action), routeMiddleware: [routeActionEntry(action)] })
    const res = await server(post('/new', form({ title: 'plain' }), {
      'content-type': 'application/x-www-form-urlencoded',
    }))
    expect(res.status).toBe(200)
    expect(created).toEqual(['plain'])
    expect(await res.text()).toContain('created:plain')
  })

  it('a POST to a page without an action is still 405', async () => {
    const action = makeAction()
    const server = createServer({ routes: routesFor(action) })
    const res = await server(post('/', form({ title: 'x' }), { 'content-type': 'application/x-www-form-urlencoded' }))
    expect(res.status).toBe(405)
    expect(created).toEqual([])
  })

  it('a route action that is not a defineAction() result is a 500 with guidance', async () => {
    const action = makeAction()
    const server = createServer({
      routes: routesFor(action),
      routeMiddleware: [routeActionEntry(async () => 'raw')],
    })
    const res = await server(post('/new', form({ title: 'x' }), { 'content-type': 'application/x-www-form-urlencoded' }))
    expect(res.status).toBe(500)
  })

  it('works under an i18n prefix', async () => {
    const action = makeAction()
    const server = createServer({
      routes: routesFor(action),
      routeMiddleware: [routeActionEntry(action)],
      config: { i18n: { locales: ['en', 'de'], defaultLocale: 'en' } },
    })
    const res = await server(post('/de/new', form({ title: 'hallo' }), {
      'content-type': 'application/x-www-form-urlencoded',
    }))
    expect(created).toEqual(['hallo'])
    expect(res.status).not.toBe(405)
  })
})

describe('security', () => {
  it('rejects a cross-origin form post with 403 before the handler runs', async () => {
    const action = makeAction()
    const server = createServer({ routes: routesFor(action) })
    const res = await server(post('/new?_action=action_test_create', form({ title: 'x' }), {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://evil.example',
    }))
    expect(res.status).toBe(403)
    expect(created).toEqual([])
  })

  it('honours actions.corsOrigins for page posts too', async () => {
    const action = makeAction()
    const server = createServer({ routes: routesFor(action), actions: { corsOrigins: ['https://admin.example'] } })
    const res = await server(post('/new?_action=action_test_create', form({ title: 'x' }), {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://admin.example',
    }))
    expect(res.status).toBe(200)
    expect(created).toEqual(['x'])
  })

  it('rejects an oversized body with 413 — by Content-Length and while streaming', async () => {
    const action = makeAction()
    const server = createServer({ routes: routesFor(action), actions: { bodyLimit: 64 } })
    const big = 'title=' + 'a'.repeat(200)
    const declared = await server(post('/new?_action=action_test_create', big, {
      'content-type': 'application/x-www-form-urlencoded',
    }))
    expect(declared.status).toBe(413)
    // No Content-Length: a streamed body must be counted, not trusted.
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(big))
        c.close()
      },
    })
    const streamed = await server(
      new Request('http://localhost/new?_action=action_test_create', {
        method: 'POST',
        body: stream,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        duplex: 'half',
      } as RequestInit),
    )
    expect(streamed.status).toBe(413)
    expect(created).toEqual([])
    expect(DEFAULT_ACTION_BODY_LIMIT).toBe(1024 * 1024)
  })

  it('the JSON endpoint enforces the same body limit', async () => {
    makeAction()
    const server = createServer({ routes: [{ path: '/', component: () => null }], actions: { bodyLimit: 8 } })
    const res = await server(post('/_zero/actions/action_test_create', JSON.stringify({ title: 'long enough' }), {
      'content-type': 'application/json',
    }))
    expect(res.status).toBe(413)
  })

  it('app middleware runs before the action (an auth gate gates it)', async () => {
    const action = makeAction()
    const deny: Middleware = () => new Response('no', { status: 401 })
    const server = createServer({ routes: routesFor(action), middleware: [deny] })
    const res = await server(post('/new?_action=action_test_create', form({ title: 'x' }), {
      'content-type': 'application/x-www-form-urlencoded',
    }))
    expect(res.status).toBe(401)
    expect(created).toEqual([])
  })
})

describe('enhanced submission (X-Zero-Action)', () => {
  const enhanced = { 'content-type': 'application/x-www-form-urlencoded', 'x-zero-action': '1' }

  it('answers JSON data instead of HTML', async () => {
    const action = makeAction()
    const server = createServer({ routes: routesFor(action) })
    const res = await server(post('/new?_action=action_test_create', form({ title: 'js' }), enhanced))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ kind: 'data', status: 200, data: { created: 'js' } })
  })

  it('answers a redirect as data (fetch would follow a 3xx)', async () => {
    const action = makeAction()
    const server = createServer({ routes: routesFor(action) })
    const res = await server(post('/new?_action=action_test_create', form({ title: 'go' }), enhanced))
    expect(await res.json()).toEqual({ kind: 'redirect', to: '/done' })
  })

  it('answers a fail() with its status', async () => {
    const action = makeAction()
    const server = createServer({ routes: routesFor(action) })
    const res = await server(post('/new?_action=action_test_create', form({ title: '' }), enhanced))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ kind: 'data', status: 422, data: { error: 'Title is required' } })
  })
})

describe('fail()', () => {
  it('rejects a non-error status', () => {
    expect(() => fail(200, {})).toThrow(/\[Pyreon\] fail\(200/)
  })
})

describe('generated route-middleware module', () => {
  it('points a page POST at the route `action` export, after the page middleware', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { generateMiddlewareModule } = await import('../fs-router')
    const dir = mkdtempSync(join(tmpdir(), 'zero-route-action-'))
    writeFileSync(
      join(dir, 'new.tsx'),
      `import { defineAction } from '@pyreon/zero/actions'\nexport const middleware = () => {}\nexport const action = defineAction(async () => 1)\nexport default () => null\n`,
    )
    writeFileSync(join(dir, 'plain.tsx'), 'export default () => null\n')
    const code = generateMiddlewareModule(['new.tsx', 'plain.tsx'], dir)
    expect(code).toContain(`import { action as _act`)
    expect(code).toContain('ctx.locals["zero:routeAction"]')
    expect(code.indexOf('middleware as _mw')).toBeLessThan(code.indexOf('action as _act'))
    expect(code).not.toContain('plain.tsx')
  })
})

describe('the page query survives the form post', () => {
  it('formActionSearch keeps the raw query, replaces a previous _action, drops the hash', async () => {
    const { formActionSearch } = await import('../form')
    expect(formActionSearch('a1', '')).toBe('?_action=a1')
    expect(formActionSearch('a1', '/new')).toBe('?_action=a1')
    expect(formActionSearch('a1', '/new?page=2&q=a%20b')).toBe('?page=2&q=a%20b&_action=a1')
    expect(formActionSearch('a1', '/new?_action=old&page=2#top')).toBe('?page=2&_action=a1')
  })

  it('SSR renders the query into the action; POST and re-render loaders see it', async () => {
    const action = makeAction()
    const seen: string[] = []
    const routes = routesFor(action).map((r) =>
      r.path === '/new'
        ? {
            ...r,
            loader: (ctx: { query: Record<string, string> }) => {
              seen.push(ctx.query.page ?? 'none')
              return { page: ctx.query.page ?? 'none' }
            },
          }
        : r,
    ) as RouteRecord[]
    const server = createServer({ routes })
    const html = await (await server(new Request('http://localhost/new?page=2'))).text()
    expect(html).toContain('action="?page=2&amp;_action=action_test_create"')
    seen.length = 0
    const res = await server(post('/new?page=2&_action=action_test_create', form({ title: 'q' }), {
      'content-type': 'application/x-www-form-urlencoded',
    }))
    expect(res.status).toBe(200)
    expect(seen).toEqual(['2'])
    // The re-rendered form keeps the query too.
    expect(await res.text()).toContain('action="?page=2&amp;_action=action_test_create"')
  })
})

describe('middleware runs once per no-JS post', () => {
  it('app + route middleware are not re-run by the re-render; their locals and headers carry over', async () => {
    const action = makeAction()
    let appRuns = 0
    let routeRuns = 0
    const counting: Middleware = (ctx) => {
      appRuns++
      ctx.locals.user = 'ada'
      ctx.headers.set('x-frame-options', 'DENY')
    }
    const { useRequestLocals } = await import('@pyreon/server')
    const routes = routesFor(action).map((r) =>
      r.path === '/new'
        ? { ...r, component: () => h('p', { id: 'user' }, String(useRequestLocals().user ?? 'anon')) }
        : r,
    ) as RouteRecord[]
    const server = createServer({
      routes,
      middleware: [counting],
      routeMiddleware: [{ pattern: '/new', middleware: () => void routeRuns++ }],
    })
    const res = await server(post('/new?_action=action_test_create', form({ title: 'once' }), {
      'content-type': 'application/x-www-form-urlencoded',
    }))
    expect(res.status).toBe(200)
    expect(appRuns).toBe(1)
    expect(routeRuns).toBe(1)
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(await res.text()).toContain('<p id="user">ada</p>')
  })
})
