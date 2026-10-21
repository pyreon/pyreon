import { promises as fs } from 'node:fs'
import path from 'node:path'
import { registerSingleton } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import content from '../plugin'

// The plugin loads `content.config.ts` through Vite's `ssrLoadModule`. That
// SSR graph evaluates a SECOND copy of the `@pyreon/*` packages the config
// imports (`defineCollection` comes from `@pyreon/zero-content`), so the
// reactivity singleton sentinel sees two module records of one package. That
// is expected here, and the load must run inside the sentinel's silent window
// (as `@pyreon/zero`'s own `ssrLoadModuleQuiet` does); outside it, the
// sentinel throws and the config never loads.
const TMP = path.join(process.cwd(), 'src', 'tests', '__dual_tmp__')
let root: string
const CONFIG = { collections: { docs: { type: 'pages', path: 'src/content/docs', schema: {} } } }

beforeEach(async () => {
  root = path.join(TMP, `d-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await fs.mkdir(path.join(root, 'src', 'content', 'docs'), { recursive: true })
  await fs.writeFile(path.join(root, 'content.config.ts'), 'export default {}')
})
afterEach(async () => {
  await fs.rm(TMP, { recursive: true, force: true })
})

/** A stand-in for Vite's SSR graph: evaluating the config registers a second instance. */
function dualLoadingServer(warnings: string[]) {
  return {
    middlewares: { use: () => {} },
    ssrLoadModule: async (file: string) => {
      registerSingleton('@pyreon/zero-content-dual-probe', '0.0.0', `file:///ssr-graph/${path.basename(file)}`)
      return /content\.config\./.test(file) ? { default: CONFIG } : {}
    },
    config: { logger: { warn: (m: string) => warnings.push(m) } },
  }
}

describe('content.config load — dual-instance window', () => {
  it('loads the config even when its SSR evaluation registers a second instance', async () => {
    // The "outer" instance this plugin process already holds.
    registerSingleton('@pyreon/zero-content-dual-probe', '0.0.0', 'file:///plugin-process/index.js')
    const plugin = content()
    const warnings: string[] = []
    await (plugin.configResolved as (c: unknown) => Promise<void>)({
      root, command: 'serve', base: '/', build: { outDir: 'dist' },
    } as never)
    await (plugin.configureServer as (s: unknown) => Promise<void>)(dualLoadingServer(warnings) as never)
    expect(warnings.filter((w) => w.includes('Failed to load content config'))).toEqual([])
  })
})
