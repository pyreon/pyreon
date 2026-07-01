/**
 * Typed-routes HMR wiring — proves the `.d.ts` regenerates when a route file is
 * ADDED/REMOVED during dev. The regression this locks: the regen used to live in
 * `handleHotUpdate`, which Vite fires ONLY on content edits (`type: "update"`),
 * never on add/delete — so the documented "autocomplete updates on route
 * add/remove" silently did nothing. The regen now lives in the `server.watcher`
 * add/unlink handler; this test drives that real handler through a minimal fake
 * Vite dev server.
 */
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { zeroPlugin } from '../vite-plugin'

/** Minimal fake Vite dev server exposing exactly what `configureServer` touches. */
function fakeServer() {
  const watcher = new EventEmitter() as EventEmitter & { add: (p: string) => void }
  watcher.add = () => {}
  return {
    watcher,
    middlewares: { use: () => {} },
    moduleGraph: { getModuleById: () => undefined, invalidateModule: () => {} },
    ssrFixStacktrace: () => {},
    ws: { send: () => {} },
  }
}

const tick = () => new Promise((r) => setTimeout(r, 60))

describe('typed routes — HMR regen fires on route add/remove (via server.watcher)', () => {
  let root: string
  let routesDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pyreon-typed-hmr-'))
    routesDir = join(root, 'src', 'routes')
    mkdirSync(routesDir, { recursive: true })
    writeFileSync(join(routesDir, 'index.tsx'), 'export default function Home() { return null }')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  function bootPlugin(typedRoutes: boolean) {
    const main = zeroPlugin({ typedRoutes })[0] as {
      configResolved: (c: unknown) => void
      configureServer: (s: unknown) => void
    }
    main.configResolved({ root, define: {}, base: '/' })
    const server = fakeServer()
    main.configureServer(server)
    return server
  }

  it("an 'add' event regenerates pyreon-routes.d.ts with the new route", async () => {
    const server = bootPlugin(true)
    const dts = join(root, 'src', 'pyreon-routes.d.ts')

    // Add a route on disk, then emit the watcher event the way chokidar does.
    writeFileSync(join(routesDir, 'contact.tsx'), 'export default function Contact() { return null }')
    server.watcher.emit('all', 'add', join(routesDir, 'contact.tsx'))
    await tick()

    expect(existsSync(dts)).toBe(true)
    const out = readFileSync(dts, 'utf-8')
    expect(out).toContain('"/contact": Record<string, never>')
    expect(out).toContain('"/": Record<string, never>')
  })

  it("an 'unlink' event regenerates and drops the removed route", async () => {
    const server = bootPlugin(true)
    const dts = join(root, 'src', 'pyreon-routes.d.ts')
    // seed with an about route present
    writeFileSync(join(routesDir, 'about.tsx'), 'export default function About() { return null }')
    server.watcher.emit('all', 'add', join(routesDir, 'about.tsx'))
    await tick()
    expect(readFileSync(dts, 'utf-8')).toContain('"/about"')

    // remove it → unlink event → regen without it
    rmSync(join(routesDir, 'about.tsx'))
    server.watcher.emit('all', 'unlink', join(routesDir, 'about.tsx'))
    await tick()
    expect(readFileSync(dts, 'utf-8')).not.toContain('"/about"')
  })

  it('does NOTHING when typedRoutes is off', async () => {
    const server = bootPlugin(false)
    writeFileSync(join(routesDir, 'contact.tsx'), 'export default function Contact() { return null }')
    server.watcher.emit('all', 'add', join(routesDir, 'contact.tsx'))
    await tick()
    expect(existsSync(join(root, 'src', 'pyreon-routes.d.ts'))).toBe(false)
  })

  it('ignores non-route-file events', async () => {
    const server = bootPlugin(true)
    server.watcher.emit('all', 'add', join(root, 'src', 'components', 'Button.tsx'))
    await tick()
    // no route-dir add → no regen
    expect(existsSync(join(root, 'src', 'pyreon-routes.d.ts'))).toBe(false)
  })
})
