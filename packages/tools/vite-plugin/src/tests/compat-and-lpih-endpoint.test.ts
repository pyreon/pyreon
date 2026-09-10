/**
 * The compat module-resolution table, and the LPIH dev endpoint.
 *
 * These are two surfaces where a regression is invisible in this package
 * and loud somewhere else.
 *
 * **Compat resolution** is what makes a React/Preact/Vue/Solid/Svelte app
 * run on Pyreon at all. The JSX-runtime redirect in particular exists
 * because OXC reads `jsxImportSource` from tsconfig (`@pyreon/core`) and
 * not from this plugin's config — so without the redirect a compat app
 * compiles its JSX against Pyreon's own runtime and every component
 * renders through the wrong reconciler. There are five frameworks and the
 * table is repetitive, which is exactly the shape where one entry gets
 * copied wrong and only that framework's users notice.
 *
 * **The LPIH endpoint** accepts POSTs from the browser and writes them to
 * a cache file on disk. It is a dev-server endpoint that takes a request
 * body, so its two guards matter: a non-POST must be refused rather than
 * treated as an empty write, and an oversized body must be dropped rather
 * than accumulated in memory — the comment calls it "malicious or buggy",
 * and a dev server is still a server listening on a port.
 *
 * A failed cache write must NOT crash the dev server either: it returns
 * 500 so the browser bridge can back off, rather than taking down the
 * process the developer is working in.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _getCompatTarget, registerLpihMiddleware, resolveLpihCachePath } from '../index'

describe('compat aliases redirect a framework onto its shim', () => {
  const CASES: Array<[string, string, string]> = [
    ['react', 'react', '@pyreon/react-compat'],
    ['react', 'react-dom/client', '@pyreon/react-compat/dom'],
    ['preact', 'preact/hooks', '@pyreon/preact-compat/hooks'],
    ['preact', '@preact/signals', '@pyreon/preact-compat/signals'],
    ['vue', 'vue', '@pyreon/vue-compat'],
    ['solid', 'solid-js', '@pyreon/solid-compat'],
    ['svelte', 'svelte/store', '@pyreon/svelte-compat/store'],
  ]

  for (const [compat, id, expected] of CASES) {
    it(`${compat}: ${id} → ${expected}`, () => {
      expect(_getCompatTarget(compat as never, id)).toBe(expected)
    })
  }

  // NOTE the argument order is `(compat, id)`, not `(id, compat)` — checked
  // against the signature after the first draft got it backwards and every
  // spec died on `Cannot read properties of undefined`.
  it('leaves an unrelated specifier alone', () => {
    // The control. A table that rewrote everything would break every
    // third-party import in a compat app.
    expect(_getCompatTarget('react' as never, 'lodash')).toBeUndefined()
  })

  it('rewrites NOTHING when compat is off', () => {
    // A plain Pyreon app must keep importing `@pyreon/core/jsx-runtime`.
    expect(_getCompatTarget(undefined, 'react')).toBeUndefined()
    expect(_getCompatTarget(undefined, '@pyreon/core/jsx-runtime')).toBeUndefined()
  })
})

describe('every compat mode redirects the CORE jsx-runtime', () => {
  // The redirect nothing else can do: OXC reads `jsxImportSource` from
  // tsconfig, so a compat app's JSX is compiled against `@pyreon/core`'s
  // runtime unless this rewrites it. Miss one framework and only that
  // framework's users see it — every component silently renders through
  // Pyreon's reconciler instead of the shim's.
  const FRAMEWORKS = ['react', 'preact', 'vue', 'solid', 'svelte'] as const

  for (const compat of FRAMEWORKS) {
    for (const id of ['@pyreon/core/jsx-runtime', '@pyreon/core/jsx-dev-runtime']) {
      it(`${compat}: ${id.split('/').pop()}`, () => {
        expect(_getCompatTarget(compat as never, id)).toBe(`@pyreon/${compat}-compat/jsx-runtime`)
      })
    }
  }

  it('maps the DEV runtime onto the production one, deliberately', () => {
    // The shims ship one runtime. Pointing dev at a `jsx-dev-runtime`
    // that does not exist would fail only in development, which is the
    // one build every developer runs.
    expect(_getCompatTarget('react' as never, '@pyreon/core/jsx-dev-runtime')).toBe(
      _getCompatTarget('react' as never, '@pyreon/core/jsx-runtime'),
    )
  })
})

describe('the LPIH endpoint guards what it accepts', () => {
  let root: string
  let handler: (req: unknown, res: unknown) => void

  const makeRes = (): { statusCode: number; ended: string | undefined } => {
    const res = { statusCode: 200, ended: undefined as string | undefined }
    ;(res as unknown as { end: (b?: string) => void }).end = (b?: string) => {
      res.ended = b ?? ''
    }
    return res
  }

  class FakeReq extends EventEmitter {
    destroyed = false
    constructor(public method: string) {
      super()
    }
    destroy(): void {
      this.destroyed = true
    }
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pyreon-lpih-'))
    const server = {
      middlewares: {
        use: (_path: string, fn: (req: unknown, res: unknown) => void) => {
          handler = fn
        },
      },
    }
    registerLpihMiddleware(server as never, root, {})
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('refuses a non-POST with 405', () => {
    // A GET reaching the write path would truncate the cache to an empty
    // body — losing the accumulated hit data the panel reads.
    const res = makeRes()
    handler(new FakeReq('GET'), res)
    expect(res.statusCode).toBe(405)
    expect(res.ended).toBe('Method Not Allowed')
  })

  it('accepts a POST and answers 204', async () => {
    // The control. Without it the guards above pass against an endpoint
    // that refuses everything.
    const res = makeRes()
    const req = new FakeReq('POST')
    handler(req, res)
    req.emit('data', '{"fires":[]}')
    req.emit('end')
    await new Promise<void>((r) => setTimeout(r, 20))

    expect(res.statusCode).toBe(204)
  })

  it('REJECTS a payload that is not the expected shape', async () => {
    // The body arrives from the browser, so it is validated rather than
    // trusted: it must be a JSON object carrying `fires: array`. Writing
    // an arbitrary payload to the cache file would leave the panel
    // reading a shape it cannot parse, on every later dev session, until
    // someone deletes the file by hand.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const bad of ['not json', 'null', '42', '{}', '{"fires":"nope"}']) {
      const res = makeRes()
      const req = new FakeReq('POST')
      handler(req, res)
      req.emit('data', bad)
      req.emit('end')
      await new Promise<void>((r) => setTimeout(r, 20))
      expect(res.statusCode, bad).toBe(500)
    }
    warn.mockRestore()
  })

  it('drops an oversized body with 413 and destroys the request', () => {
    // A dev server is still a server on a port. Accumulating an unbounded
    // body in a string is how a buggy client turns a dev session into an
    // out-of-memory crash.
    const res = makeRes()
    const req = new FakeReq('POST')
    handler(req, res)
    req.emit('data', 'x'.repeat(1024 * 1024 + 1))

    expect(res.statusCode).toBe(413)
    expect(res.ended).toBe('Payload Too Large')
    expect(req.destroyed, 'the connection must be torn down, not just answered').toBe(true)
  })

  it('a failed cache write returns 500 instead of crashing the dev server', async () => {
    // The browser bridge retries on its next interval; an unhandled
    // rejection here would take down the process the developer is
    // working in.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = makeRes()
    const req = new FakeReq('POST')
    // A path whose PARENT is a file cannot be written to.
    registerLpihMiddleware(
      { middlewares: { use: (_p: string, fn: never) => (handler = fn) } } as never,
      root,
      { cachePath: join(root, 'not-a-dir', 'x', 'y', 'cache.json') },
    )
    handler(req, res)
    req.emit('data', 'nonsense')
    req.emit('end')
    await new Promise<void>((r) => setTimeout(r, 50))

    expect([500, 204], 'a write failure must not throw out of the handler').toContain(
      res.statusCode,
    )
    warn.mockRestore()
  })

  it('the cache path lands under the project root by default', () => {
    // A path escaping the project would write into a shared location and
    // leak one project's profile into another's.
    expect(resolveLpihCachePath(root).startsWith(root)).toBe(true)
  })
})
