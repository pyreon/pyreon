/**
 * `atlas dev` — the server itself, booted for real.
 *
 * `server.ts` shipped at 2% line coverage: the whole `atlas dev` command, and
 * the one Atlas surface a user meets FIRST. Nothing in the package had ever
 * started it, so every claim its comments make — "the middleware only claims
 * GET navigations", "a config that could not be read is reported once", "the
 * project's own `resolve.alias` is put back after `configFile: false`" — was
 * prose. Each of those is a silent-degradation shape: the server still starts,
 * and the failure shows up as a blank workbench or an unresolvable import in
 * someone else's project.
 *
 * So these boot a REAL Vite dev server against a real (tiny) project on disk
 * and drive it over HTTP, following `zero`'s `dev-proxy.test.ts`. A mocked Vite
 * would re-assert the shape of the config object this file builds, which is
 * exactly the thing that cannot be wrong in an interesting way.
 *
 * Every spec closes its server in a `finally`. A leaked dev server holds a port
 * and outlives the run.
 */
import { createServer } from 'node:net'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startDevServer, type DevServerHandle } from '../server'

/** A component with no imports at all — discoverable, and cheap to load. */
const HELLO = [
  'export function Hello(props: { name?: string; loud?: boolean }) {',
  '  return props.name ?? null',
  '}',
  '',
].join('\n')

interface FixtureOptions {
  /** Written verbatim as `atlas.config.ts`. */
  config?: string
  /** Written verbatim as `vite.config.ts`. */
  viteConfig?: string
}

let roots: string[] = []

/** A throwaway project: `package.json` + one component, plus whatever is asked for. */
function fixture(options: FixtureOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'atlas-dev-'))
  roots.push(root)
  mkdirSync(join(root, 'src', 'widgets'), { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', private: true, type: 'module' }),
    'utf8',
  )
  writeFileSync(join(root, 'src', 'widgets', 'Hello.tsx'), HELLO, 'utf8')
  if (options.config !== undefined) writeFileSync(join(root, 'atlas.config.ts'), options.config, 'utf8')
  if (options.viteConfig !== undefined) {
    writeFileSync(join(root, 'vite.config.ts'), options.viteConfig, 'utf8')
  }
  return root
}

/**
 * A port the OS says is free.
 *
 * `startDevServer` passes `strictPort: true`, so a port already in use is a
 * boot failure rather than a silent shift to the next one — which is the right
 * behaviour for a tool and the wrong one for a hard-coded test port.
 */
async function freePort(): Promise<number> {
  return await new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => done(port))
    })
  })
}

/** Captured so a spec can assert on the notices, and so they stay off the runner's output. */
let stderr: string[] = []

beforeEach(() => {
  stderr = []
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk))
    return true
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots) rmSync(root, { recursive: true, force: true })
  roots = []
})

describe('the workbench shell middleware', () => {
  it('serves the shell for a navigation and passes through everything else', async () => {
    const root = fixture()
    const port = await freePort()
    let handle: DevServerHandle | undefined
    try {
      handle = await startDevServer({ cwd: root, port })
      const base = `http://localhost:${port}`

      // The claim: a GET navigation gets the workbench, transformed by Vite
      // (the client script is injected by `transformIndexHtml`, so its presence
      // proves the middleware went through Vite rather than returning a string).
      const page = await fetch(`${base}/`)
      expect(page.status).toBe(200)
      expect(page.headers.get('content-type')).toContain('text/html')
      const html = await page.text()
      expect(html).toContain('<div id="atlas-root">')
      expect(html).toContain('/@vite/client')

      // A deep navigation is the same shell — this is what makes the built
      // site's `/<component>/` URLs work in dev too.
      const deep = await fetch(`${base}/fixture-hello/`)
      expect(deep.status).toBe(200)
      expect(await deep.text()).toContain('<div id="atlas-root">')

      // The pairs. Each is a shape the middleware must NOT claim, and each
      // would be claimed by a middleware that only checked the method.
      const dotted = await fetch(`${base}/nothing-here.txt`)
      expect(dotted.status).toBe(404)
      expect(await dotted.text()).not.toContain('atlas-root')

      // Vite's own namespace: served by Vite as a module, not as the shell.
      const internal = await fetch(`${base}/@vite/client`)
      expect(internal.status).toBe(200)
      expect(internal.headers.get('content-type')).toContain('javascript')

      // Not a GET: passed through, so a POST to an unknown path 404s rather
      // than answering with a page.
      const posted = await fetch(`${base}/`, { method: 'POST' })
      expect(await posted.text()).not.toContain('atlas-root')

      // The handle describes what it actually started.
      expect(handle.url).toBe(`http://localhost:${port}/`)
      expect(handle.components).toBe(1)
    } finally {
      await handle?.close()
    }
  }, 120_000)

  it('keeps the query string out of the path it claims', async () => {
    // `/?c=button` is the workbench's own no-routes URL shape. Splitting on
    // `?` is what keeps a query containing a dot from being read as a file.
    const root = fixture()
    const port = await freePort()
    let handle: DevServerHandle | undefined
    try {
      handle = await startDevServer({ cwd: root, port })
      const res = await fetch(`http://localhost:${port}/?c=some.component`)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('<div id="atlas-root">')
    } finally {
      await handle?.close()
    }
  }, 120_000)
})

describe('the title, and what the config contributes', () => {
  it('takes the config title, and the project alias, when the config supplies them', async () => {
    const root = fixture({
      config: [
        "export const title = 'Fixture Design System'",
        // A wrapper is what makes the scan record a config PATH — the
        // generated catalog imports it in the BROWSER, so the file travels as
        // a path rather than a Node-loaded function.
        'export function wrapper(props: { children?: unknown }) { return props.children }',
        "export const alias = { '~': './src' }",
        "export const pages = { Hello: { title: 'Hi', group: 'Greetings' } }",
        "export const projects = [{ name: 'fx', dir: '.' }]",
        "export const presets = { viewports: [{ id: 'full', label: 'Full', width: null }] }",
        '',
      ].join('\n'),
    })
    // An import only the alias can resolve. Without `resolve.alias` being put
    // back after `configFile: false`, Vite fails this transform — which in a
    // real project is the whole workbench covered by an error overlay (#2744).
    writeFileSync(join(root, 'src', 'aliased.ts'), "export { Hello } from '~/widgets/Hello'\n", 'utf8')
    const port = await freePort()
    let handle: DevServerHandle | undefined
    try {
      handle = await startDevServer({ cwd: root, port })
      const html = await (await fetch(`http://localhost:${port}/`)).text()
      expect(html).toContain('<title>Fixture Design System</title>')

      const aliased = await fetch(`http://localhost:${port}/src/aliased.ts`)
      expect(aliased.status).toBe(200)
      // Rewritten to a real path rather than left as a bare `~/…` specifier.
      expect(await aliased.text()).toContain('/src/widgets/Hello.tsx')
    } finally {
      await handle?.close()
    }
  }, 120_000)

  it('lets an explicit title win over the config, and falls back to `atlas` with neither', async () => {
    const withConfig = fixture({ config: "export const title = 'From The Config'\n" })
    const port = await freePort()
    let handle: DevServerHandle | undefined
    try {
      handle = await startDevServer({ cwd: withConfig, port, title: 'From The Flag' })
      const html = await (await fetch(`http://localhost:${port}/`)).text()
      expect(html).toContain('<title>From The Flag</title>')
    } finally {
      await handle?.close()
    }

    const bare = fixture()
    const port2 = await freePort()
    let plain: DevServerHandle | undefined
    try {
      plain = await startDevServer({ cwd: bare, port: port2 })
      const html = await (await fetch(`http://localhost:${port2}/`)).text()
      expect(html).toContain('<title>atlas</title>')
    } finally {
      await plain?.close()
    }
  }, 120_000)
})

describe('what the defaults are', () => {
  it('scans `./src` of the working directory on port 5210 when told nothing', async () => {
    // The zero-argument call is the CLI's own shape (`atlas dev` with no
    // flags), and every default in this file is only reachable through it.
    const root = fixture()
    const before = process.cwd()
    let handle: DevServerHandle | undefined
    try {
      process.chdir(root)
      handle = await startDevServer()
      // 5210 is a preference, not a requirement: a second workbench (or any
      // other process) holding it moves this one to the next free port. The
      // URL reported is the one actually bound.
      const port = Number(new URL(handle.url).port)
      expect(port).toBeGreaterThanOrEqual(5210)
      expect(handle.components).toBe(1)
      const html = await (await fetch(handle.url)).text()
      expect(html).toContain('<title>atlas</title>')
    } finally {
      await handle?.close()
      process.chdir(before)
    }
  }, 120_000)

  it('moves to the next free port when the default is taken, and reports it', async () => {
    const root = fixture()
    const blocker = createServer()
    // If something else already holds 5210 the listen fails; the default is
    // taken either way, which is the case under test.
    await new Promise<void>((done) => {
      blocker.once('error', () => done())
      blocker.listen(5210, () => done())
    })
    let handle: DevServerHandle | undefined
    try {
      handle = await startDevServer({ cwd: root })
      expect(handle.url).not.toBe('http://localhost:5210/')
      expect((await fetch(handle.url)).ok).toBe(true)
    } finally {
      await handle?.close()
      await new Promise<void>((done) => blocker.close(() => done()))
    }
  }, 120_000)
})

describe('a config that could not be used', () => {
  it('reports an invalid atlas.config.ts on stderr and still serves', async () => {
    // The degradation contract: silence here reads as "my config does
    // nothing" with no way to find out why.
    const root = fixture({ config: 'export const title = 123\n' })
    const port = await freePort()
    let handle: DevServerHandle | undefined
    try {
      handle = await startDevServer({ cwd: root, port })
      expect(stderr.join('')).toContain('[Pyreon] atlas dev:')
      expect(stderr.join('')).toContain('title')
      // Still a workbench — the config was optional, and losing it is not
      // a reason to have no server.
      const res = await fetch(`http://localhost:${port}/`)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('<div id="atlas-root">')
    } finally {
      await handle?.close()
    }
  }, 120_000)

  it('reports a vite config that throws, because aliased imports will then fail', async () => {
    const root = fixture({ viteConfig: "throw new Error('this config is broken')\n" })
    const port = await freePort()
    let handle: DevServerHandle | undefined
    try {
      handle = await startDevServer({ cwd: root, port })
      const said = stderr.join('')
      expect(said).toContain('atlas: could not read')
      expect(said).toContain('this config is broken')
      expect((await fetch(`http://localhost:${port}/`)).status).toBe(200)
    } finally {
      await handle?.close()
    }
  }, 120_000)

  it('says nothing when the project is plain', async () => {
    // The control. Both notices above would "pass" against a server that
    // wrote them unconditionally.
    const root = fixture()
    const port = await freePort()
    let handle: DevServerHandle | undefined
    try {
      handle = await startDevServer({ cwd: root, port })
      expect(stderr.join('')).not.toContain('[Pyreon] atlas dev:')
      expect(stderr.join('')).not.toContain('could not read')
    } finally {
      await handle?.close()
    }
  }, 120_000)
})

describe('extra RPC methods', () => {
  it('serves a caller-supplied method, and answers a non-Error throw without dying', async () => {
    const root = fixture()
    const port = await freePort()
    let handle: DevServerHandle | undefined
    try {
      handle = await startDevServer({
        cwd: root,
        port,
        methods: {
          echo: (params) => ({ saw: params.value }),
          // A method that throws a bare string. The channel's error path
          // reads `(err as Error)?.message ?? err`, and the right half of
          // that `??` is only reached by a throw that is not an Error.
          explode: () => {
            throw 'a bare string'
          },
        },
      })
      const rpc = async (method: string, params: Record<string, unknown> = {}): Promise<Response> =>
        await fetch(`http://localhost:${port}/__atlas/rpc`, {
          method: 'POST',
          body: JSON.stringify({ method, params }),
        })

      const ok = await rpc('echo', { value: 42 })
      expect(ok.status).toBe(200)
      expect(await ok.json()).toEqual({ ok: true, result: { saw: 42 } })

      const boom = await rpc('explode')
      expect(boom.status).toBe(500)
      expect(await boom.json()).toEqual({ ok: false, error: 'a bare string' })

      // The server is still up afterwards — the point of answering rather
      // than letting the rejection escape.
      expect((await fetch(`http://localhost:${port}/`)).status).toBe(200)
    } finally {
      await handle?.close()
    }
  }, 120_000)
})
