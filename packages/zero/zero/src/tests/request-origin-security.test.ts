/**
 * The class "the request URL / origin is derived from attacker-controlled
 * request parts": a request-target resolved as a URL relative to a base (the
 * node runner, the dev server), a host-derived absolute URL stored in the
 * shared ISR cache, and build internals (`.vite/manifest.json`) served as
 * static files.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { afterEach, describe, expect, it } from 'vitest'
import { isHiddenStaticPath, REQUEST_RUNTIME, requestUrlFromTarget } from '../adapters/request-runtime'
import { stageClientThenServer } from '../adapters/stage'
import { createServer } from '../entry-server'
import { ssgPlugin } from '../ssg-plugin'

const emitted = new Function(`${REQUEST_RUNTIME}\nreturn [__pyreonRequestUrl, __pyreonIsHiddenPath]`)() as [
  typeof requestUrlFromTarget,
  typeof isHiddenStaticPath,
]

const TARGETS: Array<[string | undefined, string | null]> = [
  ['/a/b?c=1', 'http://victim.example/a/b?c=1'],
  [undefined, 'http://victim.example/'],
  ['', 'http://victim.example/'],
  // Scheme-relative: stays a PATH, never another origin.
  ['//attacker.example/_zero/actions/x', 'http://victim.example//attacker.example/_zero/actions/x'],
  ['/\\attacker.example/x', 'http://victim.example//attacker.example/x'],
  ['///attacker.example', 'http://victim.example///attacker.example'],
  // Absolute-form: only the path + query are used.
  ['http://attacker.example/_zero/actions/x?a=1', 'http://victim.example/_zero/actions/x?a=1'],
  ['HTTPS://attacker.example', 'http://victim.example/'],
  ['javascript:alert(1)', 'http://victim.example/'],
  // Asterisk-form and garbage map to the root.
  ['*', 'http://victim.example/'],
  ['attacker.example/x', 'http://victim.example/'],
  ['@attacker.example/x', 'http://victim.example/'],
]

describe('requestUrlFromTarget — origin from Host, target only as a path', () => {
  it.each(TARGETS)('%j', (target, expected) => {
    expect(requestUrlFromTarget(target, 'http://victim.example')?.href ?? null).toBe(expected)
    expect(emitted[0](target, 'http://victim.example')?.href ?? null).toBe(expected)
  })

  it('never yields an origin other than the one it was given', () => {
    for (const [target] of TARGETS) {
      expect(requestUrlFromTarget(target, 'https://victim.example:8443')?.origin).toBe(
        'https://victim.example:8443',
      )
    }
  })

  it('returns null when the Host cannot form the given origin', () => {
    for (const host of ['victim.example/evil', 'a b', 'victim.example?x', 'victim.example#x']) {
      expect(requestUrlFromTarget('/x', `http://${host}`)).toBeNull()
      expect(emitted[0]('/x', `http://${host}`)).toBeNull()
    }
  })
})

describe('isHiddenStaticPath', () => {
  const CASES: Array<[string, boolean]> = [
    ['/.vite/manifest.json', true],
    ['/%2evite/manifest.json', true],
    ['/%2Evite/manifest.json', true],
    ['/.env', true],
    ['/a/.git/config', true],
    ['/a\\.git\\config', true],
    ['/.well-known/security.txt', false],
    ['/a/.well-known/x', true],
    ['/assets/index-abc.js', false],
    ['/robots.txt', false],
    ['/file.with.dots.txt', false],
    ['/%E0%A4%A', false],
  ]
  it.each(CASES)('%s → %s', (path, hidden) => {
    expect(isHiddenStaticPath(path)).toBe(hidden)
    expect(emitted[1](path)).toBe(hidden)
  })
})

const TMP = join(import.meta.dirname, '..', '..', '.test-request-origin')
afterEach(async () => {
  await rm(TMP, { recursive: true, force: true })
})

describe('build internals never reach the deployed client', () => {
  it('adapter staging does not copy .vite/ into the client dir', async () => {
    const src = join(TMP, 'dist')
    await mkdir(join(src, '.vite'), { recursive: true })
    await mkdir(join(src, 'server'), { recursive: true })
    await writeFile(join(src, '.vite', 'manifest.json'), '{}')
    await writeFile(join(src, 'index.html'), '<html></html>')
    await writeFile(join(src, 'server', 'entry-server.js'), 'export default () => {}')
    await stageClientThenServer(
      { clientOutDir: src, serverEntry: join(src, 'server', 'entry-server.js') },
      { clientDest: join(TMP, 'out', 'client'), serverDest: join(TMP, 'out', 'server') },
    )
    expect(existsSync(join(TMP, 'out', 'client', 'index.html'))).toBe(true)
    expect(existsSync(join(TMP, 'out', 'client', '.vite'))).toBe(false)
  })

  // A hybrid SSR/ISR build with no `renderMode = 'ssg'` route returned from
  // closeBundle before the manifest cleanup, leaving dist/.vite/manifest.json.
  it('the SSG plugin removes the manifest it enabled even when it has nothing to prerender', async () => {
    const root = join(TMP, 'app')
    await mkdir(join(root, 'src', 'routes'), { recursive: true })
    await writeFile(join(root, 'src', 'routes', 'index.tsx'), 'export default () => null\n')
    await mkdir(join(root, 'dist', '.vite'), { recursive: true })
    await writeFile(join(root, 'dist', '.vite', 'manifest.json'), '{}')
    const plugin = ssgPlugin({ mode: 'ssr' }) as unknown as {
      config: (c: object, env: object) => unknown
      configResolved: (r: object) => void
      closeBundle: () => Promise<void>
    }
    expect(plugin.config({}, { command: 'build', mode: 'production', isSsrBuild: false })).toEqual({
      build: { manifest: true },
    })
    plugin.configResolved({
      root,
      base: '/',
      build: { outDir: 'dist', ssr: false, assetsDir: 'assets', assetsInlineLimit: 4096 },
      logger: { info() {}, warn() {}, warnOnce() {}, error() {} },
      plugins: [],
      command: 'build',
      mode: 'production',
    })
    await plugin.closeBundle()
    expect(existsSync(join(root, 'dist', '.vite', 'manifest.json'))).toBe(false)
  })

  it('keeps a manifest the user enabled', async () => {
    const root = join(TMP, 'app-user')
    await mkdir(join(root, 'src', 'routes'), { recursive: true })
    await writeFile(join(root, 'src', 'routes', 'index.tsx'), 'export default () => null\n')
    await mkdir(join(root, 'dist', '.vite'), { recursive: true })
    await writeFile(join(root, 'dist', '.vite', 'manifest.json'), '{"user":1}')
    const plugin = ssgPlugin({ mode: 'ssr' }) as unknown as {
      config: (c: object, env: object) => unknown
      configResolved: (r: object) => void
      closeBundle: () => Promise<void>
    }
    plugin.config({ build: { manifest: true } }, { command: 'build', mode: 'production', isSsrBuild: false })
    plugin.configResolved({
      root,
      base: '/',
      build: { outDir: 'dist', ssr: false, assetsDir: 'assets', assetsInlineLimit: 4096 },
      logger: { info() {}, warn() {}, warnOnce() {}, error() {} },
      plugins: [],
      command: 'build',
      mode: 'production',
    })
    await plugin.closeBundle()
    expect(await readFile(join(root, 'dist', '.vite', 'manifest.json'), 'utf-8')).toBe('{"user":1}')
  })
})

describe('og:image under ISR', () => {
  const ogImage = (html: string) => /og:image" content="([^"]+)/.exec(html)?.[1]
  const routes = [
    { path: '/blog', component: () => h('p', null, 'post'), og: () => h('svg', null) },
  ] as unknown as RouteRecord[]

  // The og:image URL was injected INSIDE the ISR-cached handler from the
  // request's Host, so one request with a spoofed Host set the og:image every
  // later visitor got from the cache.
  it('a spoofed Host never reaches another visitor through the cache', async () => {
    const handler = createServer({
      routes,
      config: { mode: 'isr', isr: { revalidate: 60 } },
    })
    const first = await handler(new Request('http://attacker.example/blog'))
    expect(ogImage(await first.text())).toBe('http://attacker.example/_zero/og/blog.png')
    const later = await handler(new Request('https://victim.example/blog'))
    expect(later.headers.get('x-isr-cache')).toBe('HIT')
    expect(ogImage(await later.text())).toBe('https://victim.example/_zero/og/blog.png')
  })

  it('uses routeOg.siteUrl when set, whatever the Host', async () => {
    const handler = createServer({
      routes,
      config: { mode: 'isr', isr: { revalidate: 60 }, routeOg: { siteUrl: 'https://victim.example/ignored' } },
    })
    const res = await handler(new Request('http://attacker.example/blog'))
    expect(ogImage(await res.text())).toBe('https://victim.example/_zero/og/blog.png')
  })
})
