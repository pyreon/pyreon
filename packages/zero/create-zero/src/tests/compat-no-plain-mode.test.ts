/**
 * A `--compat` project's JSX goes to the compat runtime, not the Pyreon
 * compiler, so Plain Mode (`state()` / `derived()` from `@pyreon/core/plain`,
 * or a `'use plain'` module) never compiles there and throws at runtime. The
 * app template's counter used to ship in Plain Mode for every project; under
 * `--compat` the `/counter` page failed with "state() from
 * '@pyreon/core/plain' reached the runtime". No scaffold with a compat layer
 * may emit a Plain Mode file, for any template or feature set.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scaffold } from '../scaffold'
import { listFiles } from '../template-engine'
import { FEATURES, type ProjectConfig } from '../templates'

const PLAIN = /@pyreon\/core\/plain|['"]use plain['"]/

async function plainModeFiles(config: Partial<ProjectConfig>): Promise<string[]> {
  const dir = mkdtempSync(join(tmpdir(), 'cz-compat-plain-'))
  try {
    await scaffold({
      name: 'compat-app',
      targetDir: dir,
      template: 'app',
      renderMode: 'ssr-stream',
      adapter: 'vercel',
      features: [...(Object.keys(FEATURES) as ProjectConfig['features'])],
      packageStrategy: 'meta',
      integrations: [],
      aiTools: [],
      compat: 'none',
      lint: false,
      typedRoutes: false,
      ...config,
    })
    const files = (await listFiles(dir)).filter((f) => /\.(tsx?|jsx?)$/.test(f))
    return files.filter((f) => PLAIN.test(readFileSync(join(dir, f), 'utf8')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('a --compat scaffold ships no Plain Mode code', () => {
  for (const compat of ['react', 'vue', 'solid', 'preact'] as const) {
    for (const template of ['app', 'blog', 'dashboard'] as const) {
      it(`${template} --compat ${compat}`, async () => {
        expect(await plainModeFiles({ compat, template })).toEqual([])
      })
    }
  }

  it('the control: without compat the app template still teaches Plain Mode', async () => {
    expect(await plainModeFiles({ template: 'app' })).toEqual(['src/routes/counter.tsx'])
  })
})
