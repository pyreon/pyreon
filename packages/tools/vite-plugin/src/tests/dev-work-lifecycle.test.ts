import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import pyreon from '../index'

type Hook = (this: unknown, ...args: never[]) => unknown
const QUIET_PERIOD_MS = 1_200
const roots: string[] = []
const plugins: ReturnType<typeof pyreon>[] = []
const servers: ViteDevServer[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close()
  for (const plugin of plugins.splice(0)) await (plugin.closeBundle as unknown as Hook).call(null)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  vi.doUnmock('@pyreon/compiler')
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function fixture(duplicate = true) {
  const root = mkdtempSync(join(tmpdir(), 'pyreon-dev-lifecycle-'))
  roots.push(root)
  const src = join(root, 'packages/app/src')
  mkdirSync(src, { recursive: true })
  writeFileSync(join(root, 'package.json'), '{"name":"lifecycle-fixture","version":"0.0.0"}')
  writeFileSync(
    join(src, 'a.tsx'),
    "export const A = island(() => import('./C'), { name: 'Shared', hydrate: 'load' })",
  )
  if (duplicate)
    writeFileSync(
      join(src, 'b.tsx'),
      "export const B = island(() => import('./C'), { name: 'Shared', hydrate: 'load' })",
    )
  return root
}

function configure(plugin: ReturnType<typeof pyreon>, root: string) {
  const watcher = new EventEmitter()
  ;(plugin.config as unknown as Hook).call(null, { root } as never, { command: 'serve' } as never)
  ;(plugin.configureServer as unknown as Hook).call(null, {
    watcher,
    middlewares: { use() {} },
    moduleGraph: { getModuleById: () => null, invalidateModule() {} },
    config: { logger: { warn() {}, info() {} } },
    ws: { send() {} },
  } as never)
  return watcher
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const islandWarnings = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter((args) => args.some((arg) => String(arg).includes('[Pyreon islands]')))

describe('dev work belongs to its server', { timeout: 10_000 }, () => {
  it('cancels a queued boot audit when the plugin is closed', async () => {
    const root = fixture()
    const plugin = pyreon({ islands: true })
    plugins.push(plugin)
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    configure(plugin, root)
    await (plugin.closeBundle as unknown as Hook).call(null)
    await pause(QUIET_PERIOD_MS)
    expect(islandWarnings(spy)).toEqual([])
  })

  it('removes the watcher and cancels pending context regeneration', async () => {
    const root = fixture()
    const plugin = pyreon({ islands: false })
    plugins.push(plugin)
    const watcher = configure(plugin, root)
    const context = join(root, '.pyreon/context.json')
    expect(existsSync(context)).toBe(true)
    watcher.emit('change', join(root, 'packages/app/src/a.tsx'))
    await (plugin.closeBundle as unknown as Hook).call(null)
    rmSync(context)
    await pause(700)
    expect(existsSync(context)).toBe(false)
    expect(watcher.listenerCount('change')).toBe(0)
  })

  it('does not schedule work from a stale watcher callback after close', async () => {
    vi.useFakeTimers()
    const root = fixture()
    const plugin = pyreon({ islands: false })
    plugins.push(plugin)
    const watcher = configure(plugin, root)
    const pendingChange = watcher.listeners('change')[0] as (file: string) => void
    expect(pendingChange).toBeTypeOf('function')
    await (plugin.closeBundle as unknown as Hook).call(null)
    pendingChange(join(root, 'packages/app/src/a.tsx'))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('disposes once when watcher removal reenters server close', async () => {
    vi.useFakeTimers()
    const root = fixture()
    const plugin = pyreon({ islands: false })
    plugins.push(plugin)
    const watcher = configure(plugin, root)
    const off = vi.spyOn(watcher, 'off')
    let reentrant: unknown
    watcher.on('removeListener', (event) => {
      if (event === 'change') reentrant = (plugin.closeBundle as unknown as Hook).call(null)
    })
    await (plugin.closeBundle as unknown as Hook).call(null)
    await reentrant
    expect(off).toHaveBeenCalledTimes(1)
    expect(watcher.listenerCount('change')).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('refreshes the active server context after its quiet period using its own root', async () => {
    vi.useFakeTimers()
    const first = fixture(false)
    const second = fixture(false)
    const plugin = pyreon({ islands: false })
    plugins.push(plugin)
    const watcher = configure(plugin, first)
    const context = join(first, '.pyreon/context.json')
    rmSync(context)
    watcher.emit('change', join(first, 'packages/app/src/a.tsx'))
    vi.advanceTimersByTime(300)
    watcher.emit('change', join(first, 'packages/app/src/a.tsx'))
    // A config update must not redirect the still-active server's writer.
    ;(plugin.config as unknown as Hook).call(
      null,
      { root: second } as never,
      { command: 'serve' } as never,
    )
    vi.advanceTimersByTime(499)
    expect(existsSync(context)).toBe(false)
    vi.advanceTimersByTime(1)
    expect(existsSync(context)).toBe(true)
    expect(existsSync(join(second, '.pyreon/context.json'))).toBe(false)
  })

  it('replaces old work and keeps the new server audit active', async () => {
    const first = fixture(false)
    const second = fixture(false)
    const plugin = pyreon({ islands: true })
    plugins.push(plugin)
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const oldWatcher = configure(plugin, first)
    configure(plugin, second)
    await pause(QUIET_PERIOD_MS)
    expect(oldWatcher.listenerCount('change')).toBe(0)
    expect(islandWarnings(spy)).toHaveLength(1)
  })

  it('cancels an audit that is already waiting for the compiler module', async () => {
    const actual = await vi.importActual<typeof import('@pyreon/compiler')>('@pyreon/compiler')
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let entered = false
    vi.doMock('@pyreon/compiler', async () => {
      entered = true
      await gate
      return actual
    })
    vi.useFakeTimers()
    const root = fixture()
    const plugin = pyreon({ islands: true })
    plugins.push(plugin)
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      configure(plugin, root)
      await vi.advanceTimersByTimeAsync(1_000)
      await vi.waitFor(() => expect(entered).toBe(true))
      await (plugin.closeBundle as unknown as Hook).call(null)
    } finally {
      release()
      await vi.dynamicImportSettled()
    }
    expect(islandWarnings(spy)).toEqual([])
  })

  it('cleans up through a real middleware-mode Vite server close', async () => {
    const root = fixture()
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const server = await createServer({
      root,
      configFile: false,
      plugins: [pyreon({ islands: true, ssrTemplate: false })],
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
      appType: 'custom',
      logLevel: 'silent',
    })
    servers.push(server)
    await server.close()
    spy.mockClear()
    await pause(QUIET_PERIOD_MS)
    expect(islandWarnings(spy)).toEqual([])
  })
})
