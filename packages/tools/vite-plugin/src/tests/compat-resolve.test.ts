/**
 * Compat-mode `resolveId` and `getCompatTarget` coverage for
 * @pyreon/vite-plugin (PR #323). The existing test file covers
 * compat-mode `transform` short-circuiting; this covers the
 * resolveId hook + the JSX-runtime aliasing branch.
 */

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import pyreonPlugin, { type PyreonPluginOptions } from '../index'

type ConfigHook = (
  userConfig: Record<string, unknown>,
  env: { command: string; isSsrBuild?: boolean },
) => Record<string, unknown>

type ResolveIdCtx = {
  resolve: (
    id: string,
    importer?: string,
    options?: { skipSelf: boolean },
  ) => Promise<{ id: string } | null>
}
type ResolveIdHook = (
  this: ResolveIdCtx,
  id: string,
  importer?: string,
) => Promise<string | undefined>

function bootstrap(opts?: PyreonPluginOptions) {
  const plugin = pyreonPlugin(opts)
  ;(plugin.config as unknown as ConfigHook)({}, { command: 'serve' })
  return plugin
}

async function callResolveId(
  plugin: ReturnType<typeof pyreonPlugin>,
  id: string,
  resolveMap: Record<string, string> = {},
  importer?: string,
): Promise<string | undefined> {
  const hook = plugin.resolveId as ResolveIdHook
  return hook.call(
    {
      resolve: async (specifier: string) => {
        const resolved = resolveMap[specifier]
        return resolved ? { id: resolved } : null
      },
    },
    id,
    importer,
  )
}

describe('compat-mode resolveId — react', () => {
  it('redirects "react" → @pyreon/react-compat', async () => {
    const plugin = bootstrap({ compat: 'react' })
    const resolved = await callResolveId(plugin, 'react', {
      '@pyreon/react-compat': '/abs/react-compat/index.ts',
    })
    expect(resolved).toBe('/abs/react-compat/index.ts')
  })

  it('redirects "react/jsx-runtime" → @pyreon/react-compat/jsx-runtime', async () => {
    const plugin = bootstrap({ compat: 'react' })
    const resolved = await callResolveId(plugin, 'react/jsx-runtime', {
      '@pyreon/react-compat/jsx-runtime': '/abs/react-compat/jsx-runtime.ts',
    })
    expect(resolved).toBe('/abs/react-compat/jsx-runtime.ts')
  })

  it('redirects @pyreon/core/jsx-runtime → @pyreon/react-compat/jsx-runtime in react compat', async () => {
    const plugin = bootstrap({ compat: 'react' })
    const resolved = await callResolveId(plugin, '@pyreon/core/jsx-runtime', {
      '@pyreon/react-compat/jsx-runtime': '/abs/react-compat/jsx-runtime.ts',
    })
    expect(resolved).toBe('/abs/react-compat/jsx-runtime.ts')
  })

  it('redirects @pyreon/core/jsx-dev-runtime in react compat', async () => {
    const plugin = bootstrap({ compat: 'react' })
    const resolved = await callResolveId(plugin, '@pyreon/core/jsx-dev-runtime', {
      '@pyreon/react-compat/jsx-runtime': '/abs/react-compat/jsx-runtime.ts',
    })
    expect(resolved).toBe('/abs/react-compat/jsx-runtime.ts')
  })

  it('returns undefined for non-aliased imports', async () => {
    const plugin = bootstrap({ compat: 'react' })
    const resolved = await callResolveId(plugin, 'lodash', {})
    expect(resolved).toBeUndefined()
  })
})

describe('compat-mode resolveId — preact', () => {
  it('redirects "preact" → @pyreon/preact-compat', async () => {
    const plugin = bootstrap({ compat: 'preact' })
    const resolved = await callResolveId(plugin, 'preact', {
      '@pyreon/preact-compat': '/abs/preact-compat/index.ts',
    })
    expect(resolved).toBe('/abs/preact-compat/index.ts')
  })

  it('redirects "preact/hooks" → @pyreon/preact-compat/hooks', async () => {
    const plugin = bootstrap({ compat: 'preact' })
    const resolved = await callResolveId(plugin, 'preact/hooks', {
      '@pyreon/preact-compat/hooks': '/abs/preact-compat/hooks.ts',
    })
    expect(resolved).toBe('/abs/preact-compat/hooks.ts')
  })

  it('redirects @pyreon/core/jsx-runtime in preact compat', async () => {
    const plugin = bootstrap({ compat: 'preact' })
    const resolved = await callResolveId(plugin, '@pyreon/core/jsx-runtime', {
      '@pyreon/preact-compat/jsx-runtime': '/abs/preact-compat/jsx-runtime.ts',
    })
    expect(resolved).toBe('/abs/preact-compat/jsx-runtime.ts')
  })

  it('redirects @preact/signals → @pyreon/preact-compat/signals', async () => {
    const plugin = bootstrap({ compat: 'preact' })
    const resolved = await callResolveId(plugin, '@preact/signals', {
      '@pyreon/preact-compat/signals': '/abs/preact-compat/signals.ts',
    })
    expect(resolved).toBe('/abs/preact-compat/signals.ts')
  })
})

describe('compat-mode resolveId — vue', () => {
  it('redirects "vue" → @pyreon/vue-compat', async () => {
    const plugin = bootstrap({ compat: 'vue' })
    const resolved = await callResolveId(plugin, 'vue', {
      '@pyreon/vue-compat': '/abs/vue-compat/index.ts',
    })
    expect(resolved).toBe('/abs/vue-compat/index.ts')
  })

  it('redirects @pyreon/core/jsx-runtime in vue compat', async () => {
    const plugin = bootstrap({ compat: 'vue' })
    const resolved = await callResolveId(plugin, '@pyreon/core/jsx-runtime', {
      '@pyreon/vue-compat/jsx-runtime': '/abs/vue-compat/jsx-runtime.ts',
    })
    expect(resolved).toBe('/abs/vue-compat/jsx-runtime.ts')
  })
})

describe('compat-mode resolveId — solid', () => {
  it('redirects "solid-js" → @pyreon/solid-compat', async () => {
    const plugin = bootstrap({ compat: 'solid' })
    const resolved = await callResolveId(plugin, 'solid-js', {
      '@pyreon/solid-compat': '/abs/solid-compat/index.ts',
    })
    expect(resolved).toBe('/abs/solid-compat/index.ts')
  })

  it('redirects @pyreon/core/jsx-runtime in solid compat', async () => {
    const plugin = bootstrap({ compat: 'solid' })
    const resolved = await callResolveId(plugin, '@pyreon/core/jsx-runtime', {
      '@pyreon/solid-compat/jsx-runtime': '/abs/solid-compat/jsx-runtime.ts',
    })
    expect(resolved).toBe('/abs/solid-compat/jsx-runtime.ts')
  })
})

describe('compat-mode resolveId — framework-importer carve-out', () => {
  // Regression: in compat mode, `@pyreon/core/jsx-runtime` must NOT be
  // redirected to the compat package when the importer is itself a
  // `@pyreon/*` workspace-package source file (zero, router, runtime-dom,
  // etc.). Pre-fix, OXC's project-wide importSource was set to the compat
  // package, so framework-internal JSX got rewritten to import a runtime
  // shape it doesn't speak. The fix sets OXC to `@pyreon/core` always and
  // redirects in `resolveId` only for non-framework importers. Caught by
  // `cpa-smoke-app-*-compat` cells in `scripts/scaffold-smoke.ts`.
  // Bisect-verified: dropping the `isPyreonWorkspaceFile(importer)` guard
  // makes these tests fail with the redirected jsx-runtime path.

  const repoRoot = resolve(import.meta.dirname, '../../../../..')
  const frameworkImporter = `${repoRoot}/packages/zero/zero/src/link.tsx`
  const userImporter = `${repoRoot}/examples/some-user-app/src/foo.tsx`

  it('does NOT redirect @pyreon/core/jsx-runtime when imported FROM @pyreon/zero workspace source (react)', async () => {
    const plugin = bootstrap({ compat: 'react' })
    const resolved = await callResolveId(
      plugin,
      '@pyreon/core/jsx-runtime',
      { '@pyreon/react-compat/jsx-runtime': '/abs/react-compat/jsx-runtime.ts' },
      frameworkImporter,
    )
    expect(resolved).toBeUndefined() // pass through to Vite's resolver
  })

  it('does NOT redirect @pyreon/core/jsx-dev-runtime when imported FROM framework source (preact)', async () => {
    const plugin = bootstrap({ compat: 'preact' })
    const resolved = await callResolveId(
      plugin,
      '@pyreon/core/jsx-dev-runtime',
      { '@pyreon/preact-compat/jsx-runtime': '/abs/preact-compat/jsx-runtime.ts' },
      frameworkImporter,
    )
    expect(resolved).toBeUndefined()
  })

  it('STILL redirects @pyreon/core/jsx-runtime when imported FROM user code (react)', async () => {
    const plugin = bootstrap({ compat: 'react' })
    const resolved = await callResolveId(
      plugin,
      '@pyreon/core/jsx-runtime',
      { '@pyreon/react-compat/jsx-runtime': '/abs/react-compat/jsx-runtime.ts' },
      userImporter,
    )
    expect(resolved).toBe('/abs/react-compat/jsx-runtime.ts')
  })

  it('STILL redirects @pyreon/core/jsx-runtime when no importer (entry point)', async () => {
    const plugin = bootstrap({ compat: 'react' })
    const resolved = await callResolveId(
      plugin,
      '@pyreon/core/jsx-runtime',
      { '@pyreon/react-compat/jsx-runtime': '/abs/react-compat/jsx-runtime.ts' },
    )
    expect(resolved).toBe('/abs/react-compat/jsx-runtime.ts')
  })
})

describe('compat-mode resolveId — no compat', () => {
  it('returns undefined for any framework alias when compat is unset', async () => {
    const plugin = bootstrap()
    expect(await callResolveId(plugin, 'react', {})).toBeUndefined()
    expect(await callResolveId(plugin, 'vue', {})).toBeUndefined()
    expect(await callResolveId(plugin, 'preact', {})).toBeUndefined()
    expect(await callResolveId(plugin, 'solid-js', {})).toBeUndefined()
  })

  it('still resolves the HMR runtime virtual id (independent of compat)', async () => {
    const plugin = bootstrap()
    const resolved = await callResolveId(plugin, 'virtual:pyreon/hmr-runtime', {})
    // Internal ID — has the leading '\0' marker convention or similar
    expect(resolved).toBeDefined()
    expect(typeof resolved).toBe('string')
  })
})
