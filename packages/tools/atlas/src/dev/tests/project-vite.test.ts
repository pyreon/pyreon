/**
 * What the project's own `vite.config.*` contributes to the workbench app.
 *
 * The real-server and real-build halves are in `cov-dev-server.test.ts` and
 * `cov-build-static.test.ts`; this locks the selection rules with a stand-in
 * for Vite's `loadConfigFromFile`.
 */
import { describe, expect, it } from 'vitest'
import { isAtlasOwnedPlugin, loadProjectViteConfig, projectConfigFields, tailwindSourcePlugin } from '../project-vite'

const loaderFor =
  (config: Record<string, unknown> | null, seen: unknown[] = []) =>
  async (env: unknown, _file: unknown, root: string) => {
    seen.push({ env, root })
    return config ? { path: `${root}/vite.config.ts`, config } : null
  }

describe('loadProjectViteConfig', () => {
  it("keeps the project's plugins but drops its own pyreon() and zero() (Atlas runs its own)", async () => {
    const custom = { name: 'tailwindcss:scan' }
    const config = {
      plugins: [
        { name: 'pyreon' },
        [{ name: 'pyreon-zero' }, { name: 'pyreon-zero-ssg' }, false],
        Promise.resolve(custom),
        null,
      ],
    }
    const got = await loadProjectViteConfig('/proj', 'serve', loaderFor(config))
    expect(got.plugins).toEqual([custom])
    expect(isAtlasOwnedPlugin({ name: 'pyreon-docs-demo' })).toBe(false)
  })

  it('asks for the command Atlas runs, from the PROJECT root', async () => {
    const seen: unknown[] = []
    await loadProjectViteConfig('/proj', 'build', loaderFor({}, seen))
    expect(seen).toEqual([{ env: { command: 'build', mode: 'production' }, root: '/proj' }])
  })

  it('resolves a relative css.postcss against the project, and leaves alias to the scan', async () => {
    const got = await loadProjectViteConfig(
      '/proj',
      'serve',
      loaderFor({
        css: { postcss: './config', modules: { localsConvention: 'camelCase' } },
        resolve: { alias: { '~': './src' }, conditions: ['custom'] },
        define: { __X__: '1' },
        envPrefix: 'APP_',
      }),
    )
    expect(got.css).toEqual({ postcss: '/proj/config', modules: { localsConvention: 'camelCase' } })
    expect(got.resolve).toEqual({ conditions: ['custom'] })
    expect(got.define).toEqual({ __X__: '1' })
    expect(got.envPrefix).toBe('APP_')
  })

  it('no config file is no contribution; an unloadable one is a warning, never fatal', async () => {
    expect(await loadProjectViteConfig('/proj', 'serve', loaderFor(null))).toEqual({ plugins: [], resolve: {}, css: {} })
    const failed = await loadProjectViteConfig('/proj', 'serve', async () => {
      throw new Error('Cannot find package "some-plugin"')
    })
    expect(failed.plugins).toEqual([])
    expect(failed.warning).toContain('Cannot find package "some-plugin"')
  })
})

describe('projectConfigFields', () => {
  it("merges with Atlas's alias and dedupe, and searches PostCSS from the project by default", () => {
    const fields = projectConfigFields({ plugins: [], resolve: { dedupe: ['react'] }, css: {} }, '/proj', {
      alias: [{ find: '~', replacement: '/proj/src' }],
      dedupe: ['@pyreon/core'],
    })
    expect(fields).toEqual({
      resolve: { dedupe: ['@pyreon/core', 'react'], alias: [{ find: '~', replacement: '/proj/src' }] },
      css: { postcss: '/proj' },
    })
  })

  it("the project's own css.postcss wins over the default", () => {
    const fields = projectConfigFields({ plugins: [], resolve: {}, css: { postcss: '/proj/pc' } }, '/proj', {})
    expect(fields.css).toEqual({ postcss: '/proj/pc' })
  })
})

describe('tailwindSourcePlugin — Tailwind v4 scans the PROJECT, not the workbench app', () => {
  // Tailwind's automatic source detection starts at Vite's root, which is the
  // workbench app; a project's Tailwind CSS compiled with no utilities. (The
  // real-Tailwind check is manual — Tailwind is not a repo dependency; see the
  // PR. This locks the rule.)
  const plugin = tailwindSourcePlugin('/proj')

  it('adds the project as a source, relative to the CSS file', () => {
    const out = plugin.transform('@import "tailwindcss";\n', '/proj/src/styles/app.css')
    expect(out).toBe('@import "tailwindcss";\n\n@source "../..";\n')
    expect(plugin.transform("@import 'tailwindcss' layer(x);", '/proj/app.css?direct')).toContain('@source ".";')
  })

  it('leaves a file that names its own sources, and everything else, exactly as written', () => {
    expect(plugin.transform('@import "tailwindcss" source("../src");', '/proj/a.css')).toBeNull()
    expect(plugin.transform('@import "tailwindcss";\n@source "../lib";', '/proj/a.css')).toBeNull()
    expect(plugin.transform('.a { color: red }', '/proj/a.css')).toBeNull()
    expect(plugin.transform('@import "tailwindcss";', '/proj/a.tsx')).toBeNull()
    expect(plugin.transform('@import "tailwindcss";', '/proj/node_modules/lib/a.css')).toBeNull()
  })
})
