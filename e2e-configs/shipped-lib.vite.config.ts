import { join } from 'node:path'
import { type ConfigEnv, loadConfigFromFile, type Plugin, type UserConfig } from 'vite'

/**
 * Vite config wrapper for the "shipped lib" e2e projects
 * (`e2e-configs/compat-layers.config.ts`). It loads the example's own
 * `vite.config.ts` from the working directory and then removes the `bun`
 * resolve condition, which both the example and `@pyreon/vite-plugin` add.
 *
 * Without `bun`, every `@pyreon/*` import resolves through its `import`
 * condition, which points at the package's built `lib/`. That is what a
 * consumer installing the published packages gets. The ordinary dev-server
 * specs read `src/` through `bun`, so they cannot see a shipped file that
 * differs from its source (#4283: the published compat `lib/jsx-runtime.js`
 * had no `jsxDEV`, so `vite` dev failed for every consumer while the in-repo
 * e2e stayed green).
 *
 * Usage: `vite --config ../../e2e-configs/shipped-lib.vite.config.ts` with the
 * example as `cwd`.
 */
function dropBunCondition(): Plugin {
  const strip = (conditions: string[] | undefined): string[] | undefined =>
    conditions?.filter((c) => c !== 'bun')
  return {
    name: 'pyreon-e2e:shipped-lib',
    // `post` so this runs after `@pyreon/vite-plugin`'s own `config` hook has
    // been merged in; the hook receives the merged config and may mutate it.
    enforce: 'post',
    config(config) {
      if (config.resolve?.conditions) config.resolve.conditions = strip(config.resolve.conditions)
      if (config.ssr?.resolve?.conditions) {
        config.ssr.resolve.conditions = strip(config.ssr.resolve.conditions)
      }
    },
    configEnvironment(_name, env) {
      if (env.resolve?.conditions) env.resolve.conditions = strip(env.resolve.conditions)
    },
  }
}

export default async (env: ConfigEnv): Promise<UserConfig> => {
  const root = process.cwd()
  const loaded = await loadConfigFromFile(env, join(root, 'vite.config.ts'), root)
  if (!loaded) throw new Error(`[Pyreon] shipped-lib e2e: no vite.config.ts in ${root}`)
  const own = loaded.config
  return {
    ...own,
    root,
    plugins: [...(own.plugins ?? []), dropBunCondition()],
  }
}
