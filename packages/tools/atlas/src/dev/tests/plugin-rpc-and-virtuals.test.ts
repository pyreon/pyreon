/**
 * The workbench dev plugin: its virtual modules, and the RPC channel the
 * browser half calls back through.
 *
 * A Vite plugin hook is a function on an object, so all of this is drivable
 * with mock objects — no server, no browser. That matters, because the two
 * things it does are the two things a local dev tool most needs to get right.
 *
 * **The RPC channel is a local HTTP endpoint.** Its port is reachable from
 * anything else on the machine, and one of its methods reads files. So the
 * path guard is a real security boundary, not tidiness — and the prefix check
 * has to include the separator, because a bare `startsWith` admits a SIBLING
 * directory (`/proj-evil` passes for root `/proj`).
 *
 * **A failing method must not take the dev server down.** The handler is an
 * async IIFE rather than an async listener precisely because an async
 * listener's rejection is unhandled; a component whose source cannot be read
 * has to answer with an error, not kill the session the developer is working
 * in.
 *
 * The virtual modules are the other half: they are what the browser actually
 * loads, so a missing field there is a workbench that boots with no theme, no
 * groups, or no components at all — and boots successfully, which is why it
 * goes unnoticed.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { atlasDevPlugin, builtinMethods, CATALOG_ID, ENTRY_ID, RPC_PATH } from '../plugin'

let root: string

const write = (rel: string, body: string): string => {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
  return abs
}

/** A discovered-component record shaped like the scan's output. */
const comp = (name: string, source?: string, over: Record<string, unknown> = {}) =>
  ({
    key: name,
    name,
    group: 'Inputs',
    controls: [],
    scenarios: [],
    ...(source === undefined ? {} : { source }),
    ...over,
  }) as never

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-plugin-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('the `source` RPC method', () => {
  it('reads a component file and returns its absolute path', () => {
    // The control. The Docs panel calls this on every component selection;
    // without it the panel is permanently empty and says nothing about why.
    const abs = write('src/Button.tsx', 'export function Button() { return null }\n')
    const methods = builtinMethods({ root, components: [comp('Button', abs)] })
    const r = methods.source!({ component: 'Button' }) as { path: string; source: string }
    expect(r.path).toBe(abs)
    expect(r.source).toContain('export function Button')
  })

  it('resolves a RELATIVE recorded path against the project root', () => {
    write('src/Button.tsx', 'export function Button() { return null }\n')
    const methods = builtinMethods({ root, components: [comp('Button', 'src/Button.tsx')] })
    const r = methods.source!({ component: 'Button' }) as { path: string }
    expect(r.path).toBe(join(root, 'src/Button.tsx'))
  })

  it('REFUSES a path outside the project root', () => {
    // The recorded path came from our own scan, but treating it as trusted is
    // what turns any future caller-supplied path into a traversal. This is a
    // local server anything on the machine can reach; "read any file" is not
    // a capability it should hand out.
    const outside = mkdtempSync(join(tmpdir(), 'atlas-outside-'))
    try {
      const secret = join(outside, 'secret.txt')
      writeFileSync(secret, 'top secret\n')
      const methods = builtinMethods({ root, components: [comp('Button', secret)] })
      expect(() => methods.source!({ component: 'Button' })).toThrow(/outside the project root/)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('refuses a SIBLING directory whose name merely starts with the root', () => {
    // The separator is part of the check. A bare `startsWith(root)` admits
    // `/proj-evil` for root `/proj` — the classic prefix-guard hole, and the
    // one a reviewer is most likely to read past.
    const sibling = `${root}-evil`
    mkdirSync(sibling, { recursive: true })
    try {
      const secret = join(sibling, 'secret.txt')
      writeFileSync(secret, 'top secret\n')
      const methods = builtinMethods({ root, components: [comp('Button', secret)] })
      expect(() => methods.source!({ component: 'Button' })).toThrow(/outside the project root/)
    } finally {
      rmSync(sibling, { recursive: true, force: true })
    }
  })

  it('REFUSES an ambiguous name and lists the candidates', () => {
    // Two packages both exporting a `Button` is ordinary in a monorepo.
    // Picking the first match shows one component's source under the other's
    // heading, which is worse than saying it is ambiguous — so the message
    // has to name what to disambiguate to.
    const a = write('a/Button.tsx', '// package A\n')
    const b = write('b/Button.tsx', '// package B\n')
    const methods = builtinMethods({
      root,
      components: [
        comp('Button', a, { key: 'core/Button', project: 'core' }),
        comp('Button', b, { key: 'ui/Button', project: 'ui' }),
      ],
    })
    expect(() => methods.source!({ component: 'Button' })).toThrow(/ambiguous|core|ui/i)
  })

  it('resolves an ambiguous name when it is QUALIFIED', () => {
    // The escape hatch the refusal above points at.
    const a = write('a/Button.tsx', '// package A\n')
    const b = write('b/Button.tsx', '// package B\n')
    const methods = builtinMethods({
      root,
      components: [
        comp('Button', a, { key: 'core/Button', project: 'core' }),
        comp('Button', b, { key: 'ui/Button', project: 'ui' }),
      ],
    })
    const r = methods.source!({ component: 'core/Button' }) as { source: string }
    expect(r.source).toContain('package A')
  })

  it('reports a component with NO recorded source', () => {
    // A component discovered from a barrel re-export can have no file of its
    // own. The panel must say so rather than reading `undefined` as a path.
    const methods = builtinMethods({ root, components: [comp('Button')] })
    expect(() => methods.source!({ component: 'Button' })).toThrow(/no source/i)
  })

  it('reports an unknown component', () => {
    const methods = builtinMethods({ root, components: [comp('Button', write('a.tsx', ''))] })
    expect(() => methods.source!({ component: 'Nope' })).toThrow()
  })

  it('handles a MISSING `component` param without reading a directory', () => {
    const methods = builtinMethods({ root, components: [] })
    expect(() => methods.source!({})).toThrow()
  })
})

describe('the `components` probe', () => {
  it('lists the discovered names', () => {
    // The cheapest proof the channel works end to end — which is what it is
    // for, so it must not depend on anything else being right.
    const methods = builtinMethods({ root, components: [comp('A'), comp('B')] })
    expect(methods.components!({})).toEqual(['A', 'B'])
  })

  it('answers with an empty list rather than throwing', () => {
    const methods = builtinMethods({ root, components: [] })
    expect(methods.components!({})).toEqual([])
  })
})

describe('the virtual modules the browser half loads', () => {
  const plugin = (over: Record<string, unknown> = {}) =>
    atlasDevPlugin({
      root,
      scanRoot: root,
      entries: [],
      title: 'My Workbench',
      ...over,
    } as never)

  it('resolves only its OWN virtual ids', () => {
    // Claiming an id it does not own would shadow a real module of that name
    // and break the app rather than the workbench.
    const p = plugin()
    expect(p.resolveId?.(CATALOG_ID)).toBeTruthy()
    expect(p.resolveId?.(ENTRY_ID)).toBeTruthy()
    expect(p.resolveId?.('./real-module'), 'not ours').toBeUndefined()
    expect(p.resolveId?.('virtual:something-else')).toBeUndefined()
  })

  it('loads a catalog module for the resolved catalog id', () => {
    const p = plugin()
    const id = p.resolveId?.(CATALOG_ID) as string
    const code = p.load?.(id) as string
    expect(typeof code).toBe('string')
    expect(code, 'the module exports something the entry can import').toContain('export')
  })

  it('loads an entry module that mounts the workbench with the TITLE', () => {
    // The title is the one piece of the config a user sees immediately. A
    // dropped title boots a workbench called "atlas" and looks like the
    // config did not load at all.
    const p = plugin()
    const id = p.resolveId?.(ENTRY_ID) as string
    const code = p.load?.(id) as string
    expect(code).toContain('mount')
    expect(code).toContain('My Workbench')
  })

  it('falls back to a default title when none is configured', () => {
    const p = plugin({ title: undefined })
    const code = p.load?.(p.resolveId?.(ENTRY_ID) as string) as string
    expect(code).toContain('atlas')
  })

  it('never emits an optional config field as `undefined`', () => {
    // Each is spread conditionally, and the distinction is load-bearing: the
    // browser reads a present-but-undefined `pages` as "pages configured, and
    // empty", which silently drops every display title and group ordering the
    // user wrote. Absent means "use the defaults"; present means "use these".
    const p1 = plugin()
    const withNone = p1.load?.(p1.resolveId?.(CATALOG_ID) as string) as string
    expect(withNone).not.toContain('undefined')

    // Same for a configured one: the field may or may not appear depending on
    // what the catalog generator does with it, but `undefined` must never be
    // what it appears AS.
    const p2 = plugin({ configPath: '/x/cfg.ts' })
    const withSome = p2.load?.(p2.resolveId?.(CATALOG_ID) as string) as string
    expect(withSome).not.toContain('undefined')
  })

  it('returns nothing for an id it did not resolve', () => {
    expect(plugin().load?.('some/other/module.ts')).toBeUndefined()
  })
})

describe('the RPC endpoint answers instead of crashing', () => {
  interface Captured {
    status: number
    body: string
    headers: Record<string, string>
    nextCalled: boolean
  }

  /** Drive `configureServer`'s middleware with a mock request/response. */
  async function call(
    methodsOver: Record<string, unknown>,
    req: { method: string; body?: string },
  ): Promise<Captured> {
    const p = atlasDevPlugin({
      root,
      scanRoot: root,
      entries: [],
      methods: methodsOver,
    } as never)

    let handler:
      | ((r: unknown, s: unknown, next: () => void) => void)
      | undefined
    p.configureServer?.({
      middlewares: {
        use: (path: string, h: (r: unknown, s: unknown, next: () => void) => void) => {
          if (path === RPC_PATH) handler = h
        },
      },
    } as never)
    expect(handler, 'the plugin must register its endpoint').toBeTruthy()

    const cap: Captured = { status: 0, body: '', headers: {}, nextCalled: false }
    const listeners: Record<string, (c?: unknown) => void> = {}
    const request = {
      method: req.method,
      on: (e: string, cb: (c?: unknown) => void) => {
        listeners[e] = cb
      },
    }
    const response = {
      setHeader: (k: string, v: string) => {
        cap.headers[k] = v
      },
      set statusCode(v: number) {
        cap.status = v
      },
      get statusCode() {
        return cap.status
      },
      end: (body: string) => {
        cap.body = body
      },
    }
    handler!(request, response, () => {
      cap.nextCalled = true
    })
    if (req.method === 'POST') {
      if (req.body !== undefined) listeners.data?.(req.body)
      listeners.end?.()
      // The handler answers from an async IIFE — let it settle.
      await new Promise((r) => setTimeout(r, 10))
    }
    return cap
  }

  it('answers a well-formed call', async () => {
    // The control for every failure below.
    const cap = await call(
      { ping: () => 'pong' },
      { method: 'POST', body: JSON.stringify({ method: 'ping' }) },
    )
    expect(cap.status).toBe(200)
    expect(JSON.parse(cap.body)).toEqual({ ok: true, result: 'pong' })
    expect(cap.headers['Content-Type']).toContain('json')
  })

  it('AWAITS an async method rather than serialising a promise', async () => {
    // A method that returns a promise and is not awaited serialises as `{}` —
    // the caller gets a successful-looking empty answer.
    const cap = await call(
      { slow: async () => 'later' },
      { method: 'POST', body: JSON.stringify({ method: 'slow' }) },
    )
    expect(JSON.parse(cap.body)).toEqual({ ok: true, result: 'later' })
  })

  it('passes params through', async () => {
    const cap = await call(
      { echo: (p: Record<string, unknown>) => p.value },
      { method: 'POST', body: JSON.stringify({ method: 'echo', params: { value: 42 } }) },
    )
    expect(JSON.parse(cap.body).result).toBe(42)
  })

  it('defaults missing params to an empty object', async () => {
    const cap = await call(
      { count: (p: Record<string, unknown>) => Object.keys(p).length },
      { method: 'POST', body: JSON.stringify({ method: 'count' }) },
    )
    expect(JSON.parse(cap.body).result).toBe(0)
  })

  it('passes a NON-POST request to the next middleware', async () => {
    // The endpoint shares a path space with the dev server. Swallowing a GET
    // would break whatever else is served there.
    const cap = await call({}, { method: 'GET' })
    expect(cap.nextCalled).toBe(true)
    expect(cap.body, 'and answers nothing itself').toBe('')
  })

  it('404s an UNKNOWN method and names the ones it has', async () => {
    // A typo turns into a one-step fix only if the answer lists what exists.
    const cap = await call(
      { alpha: () => 1, beta: () => 2 },
      { method: 'POST', body: JSON.stringify({ method: 'alfa' }) },
    )
    expect(cap.status).toBe(404)
    const parsed = JSON.parse(cap.body) as { ok: boolean; error: string }
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toContain('alfa')
    expect(parsed.error, 'and list the real ones').toContain('alpha')
    expect(parsed.error).toContain('beta')
  })

  it('404s a call with NO method named', async () => {
    const cap = await call({ alpha: () => 1 }, { method: 'POST', body: JSON.stringify({}) })
    expect(cap.status).toBe(404)
  })

  it('500s a MALFORMED body instead of throwing out of the server', async () => {
    const cap = await call({ alpha: () => 1 }, { method: 'POST', body: '{ not json' })
    expect(cap.status).toBe(500)
    expect(JSON.parse(cap.body).ok).toBe(false)
  })

  it('treats an EMPTY body as an empty call', async () => {
    const cap = await call({ alpha: () => 1 }, { method: 'POST', body: '' })
    expect(cap.status, 'no method named → 404, not a parse crash').toBe(404)
  })

  it('500s a THROWING method, with its message, and keeps serving', async () => {
    // A component whose source cannot be read must not kill the session the
    // developer is working in — and the message is the whole diagnosis, so it
    // has to survive into the response.
    const cap = await call(
      {
        boom: () => {
          throw new Error('could not read that')
        },
      },
      { method: 'POST', body: JSON.stringify({ method: 'boom' }) },
    )
    expect(cap.status).toBe(500)
    expect(JSON.parse(cap.body).error).toContain('could not read that')
  })

  it('500s a REJECTING async method', async () => {
    // The async-IIFE half: an async listener's rejection is unhandled and
    // would take the process down instead of answering.
    const cap = await call(
      { boom: async () => Promise.reject(new Error('async failure')) },
      { method: 'POST', body: JSON.stringify({ method: 'boom' }) },
    )
    expect(cap.status).toBe(500)
    expect(JSON.parse(cap.body).error).toContain('async failure')
  })

  it('lets a caller-supplied method OVERRIDE a builtin', async () => {
    // The extension point. A host that wants its own `components` answer must
    // win, or the option is decorative.
    const cap = await call(
      { components: () => ['overridden'] },
      { method: 'POST', body: JSON.stringify({ method: 'components' }) },
    )
    expect(JSON.parse(cap.body).result).toEqual(['overridden'])
  })
})
