import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildPluginWebHosts, materializeBuiltWebHosts } from '../web-hosts'
import { mainWithPlugins } from '../cli'

// Package-owned web-host pages: a plugin declares `webHosts`, and `pyreon-native assets` builds the pages of the
// plugins the app SOURCE imports, then writes each where its target's runtime resolves `<WebView src>`.

describe('web-host pages from package plugins', () => {
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pyreon-native-webhosts-'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  /** A dependency of the app whose plugin contributes `files`. */
  function addPlugin(pkg: string, files: { filename: string; content: string }[], module = pkg) {
    const dir = join(root, 'node_modules', ...pkg.split('/'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: pkg, type: 'module', pyreon: { native: { plugin: './plugin.mjs', modules: [module] } } }),
    )
    writeFileSync(
      join(dir, 'plugin.mjs'),
      `export default { name: ${JSON.stringify(pkg)}, apiVersion: 2, modules: [${JSON.stringify(module)}],
  webHosts: () => ${JSON.stringify(files)} }
`,
    )
    const manifest = join(root, 'package.json')
    const prev = existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')) : { name: 'app', dependencies: {} }
    prev.dependencies[pkg] = '1'
    writeFileSync(manifest, JSON.stringify(prev))
  }
  function addSource(imports: string[]) {
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'App.tsx'), imports.map((m) => `import '${m}'`).join('\n'))
  }

  it('builds the pages of plugins the app source imports, and skips the rest', async () => {
    addPlugin('@acme/used', [{ filename: 'used.html', content: 'U' }])
    addPlugin('@acme/idle', [{ filename: 'idle.html', content: 'I' }])
    addSource(['@acme/used'])
    const files = await buildPluginWebHosts(root, join(root, 'src'))
    expect(files.map((f) => f.filename)).toEqual(['used.html'])
  })

  it('two plugins producing one filename is an error naming both owners', async () => {
    addPlugin('@acme/a', [{ filename: 'host.html', content: 'A' }])
    addPlugin('@acme/b', [{ filename: 'host.html', content: 'B' }])
    addSource(['@acme/a', '@acme/b'])
    await expect(buildPluginWebHosts(root, join(root, 'src'))).rejects.toThrow(/"host.html" is produced by both "@acme\/a" and "@acme\/b"/)
  })

  it('a plugin that declares no webHosts is skipped without error', async () => {
    addPlugin('@acme/hosted', [{ filename: 'hosted.html', content: 'H' }])
    addPlugin('@acme/plain', [])
    // Same package shape, but the plugin object carries no `webHosts` at all.
    writeFileSync(
      join(root, 'node_modules', '@acme', 'plain', 'plugin.mjs'),
      `export default { name: '@acme/plain', apiVersion: 2, modules: ['@acme/plain'] }\n`,
    )
    addSource(['@acme/hosted', '@acme/plain'])
    const files = await buildPluginWebHosts(root, join(root, 'src'))
    expect(files.map((f) => f.filename)).toEqual(['hosted.html'])
  })

  it('`assets` reads activation from --app-source, and builds nothing (exit 0) when that source is absent or activates nothing', async () => {
    addPlugin('@acme/used', [{ filename: 'used.html', content: 'U' }])
    mkdirSync(join(root, 'assets'), { recursive: true })
    const argv = (out: string, ...extra: string[]) => ['assets', '--target=ios', `--source=${join(root, 'assets')}`, `--out=${out}`, ...extra]

    // An app source elsewhere than <app>/src, importing the plugin: its page is built.
    mkdirSync(join(root, 'shared-src'), { recursive: true })
    writeFileSync(join(root, 'shared-src', 'App.tsx'), `import '@acme/used'\n`)
    expect(await mainWithPlugins(argv(join(root, 'out-shared'), `--app-source=${join(root, 'shared-src')}`))).toBe(0)
    expect(existsSync(join(root, 'out-shared', 'webhost', 'used.html'))).toBe(true)

    // A source directory that does not exist is not an error, and produces nothing.
    expect(await mainWithPlugins(argv(join(root, 'out-missing'), `--app-source=${join(root, 'no-such-dir')}`))).toBe(0)
    expect(existsSync(join(root, 'out-missing', 'webhost'))).toBe(false)

    // A source that imports no plugin module activates nothing: success, with no pages.
    mkdirSync(join(root, 'empty-src'), { recursive: true })
    writeFileSync(join(root, 'empty-src', 'App.tsx'), `export const x = 1\n`)
    expect(await mainWithPlugins(argv(join(root, 'out-empty'), `--app-source=${join(root, 'empty-src')}`))).toBe(0)
    expect(existsSync(join(root, 'out-empty', 'webhost'))).toBe(false)
  })

  it('`assets` does not attempt web hosts when the image half fails, and reports a non-Error throw from a builder', async () => {
    addPlugin('@acme/used', [{ filename: 'used.html', content: 'U' }])
    addSource(['@acme/used'])

    // A source directory that does not exist fails the image half; the command returns that failure and builds no pages.
    const missing = await mainWithPlugins(['assets', '--target=ios', `--source=${join(root, 'no-assets')}`, `--out=${join(root, 'out-fail')}`])
    expect(missing).not.toBe(0)
    expect(existsSync(join(root, 'out-fail', 'webhost'))).toBe(false)

    // A builder may throw something that is not an Error (a bare string); the message is still reported and the exit is 2.
    mkdirSync(join(root, 'assets'), { recursive: true })
    writeFileSync(
      join(root, 'node_modules', '@acme', 'used', 'plugin.mjs'),
      `export default { name: '@acme/used', apiVersion: 2, modules: ['@acme/used'], webHosts: () => { throw 'bare string failure' } }\n`,
    )
    expect(await mainWithPlugins(['assets', '--target=ios', `--source=${join(root, 'assets')}`, `--out=${join(root, 'out-str')}`])).toBe(2)
  })

  it('materializes where each runtime resolves <WebView src>', () => {
    const files = [{ filename: 'host.html', content: '<html></html>' }]
    const ios = join(root, 'ios')
    const android = join(root, 'android')
    const web = join(root, 'web')
    expect(materializeBuiltWebHosts(files, 'ios', ios)).toEqual({ hosts: 1 })
    expect(materializeBuiltWebHosts(files, 'android', android)).toEqual({ hosts: 1 })
    expect(materializeBuiltWebHosts(files, 'web', web)).toEqual({ hosts: 1 })
    expect(readFileSync(join(ios, 'webhost', 'host.html'), 'utf8')).toBe('<html></html>')
    expect(readFileSync(join(android, 'assets', 'host.html'), 'utf8')).toBe('<html></html>')
    expect(readFileSync(join(web, 'host.html'), 'utf8')).toBe('<html></html>')
    expect(materializeBuiltWebHosts([], 'ios', join(root, 'none'))).toEqual({ hosts: 0 })
    expect(existsSync(join(root, 'none'))).toBe(false)
  })

  it('`assets` builds plugin pages next to the images, honours --no-plugins, and fails loudly when a builder throws', async () => {
    addPlugin('@acme/used', [{ filename: 'used.html', content: 'U' }])
    addSource(['@acme/used'])
    mkdirSync(join(root, 'assets'), { recursive: true })
    const argv = (out: string, ...extra: string[]) => ['assets', '--target=ios', `--source=${join(root, 'assets')}`, `--out=${out}`, ...extra]
    expect(await mainWithPlugins(argv(join(root, 'out1')))).toBe(0)
    expect(existsSync(join(root, 'out1', 'webhost', 'used.html'))).toBe(true)
    expect(await mainWithPlugins(argv(join(root, 'out2'), '--no-plugins'))).toBe(0)
    expect(existsSync(join(root, 'out2', 'webhost', 'used.html'))).toBe(false)

    addPlugin('@acme/broken', [{ filename: 'x.html', content: 'x' }])
    writeFileSync(join(root, 'node_modules', '@acme', 'broken', 'plugin.mjs'),
      `export default { name: '@acme/broken', apiVersion: 2, modules: ['@acme/broken'], webHosts: () => { throw new Error('no bundler') } }\n`)
    addSource(['@acme/used', '@acme/broken'])
    expect(await mainWithPlugins(argv(join(root, 'out3')))).toBe(2)
  })
})
