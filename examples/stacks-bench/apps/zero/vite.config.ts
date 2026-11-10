// @pyreon/zero arm — configuration as documented:
//   https://pyreon.dev/docs/zero#configuration  (docs/src/content/docs/zero.md → "Configuration")
//   https://pyreon.dev/docs/zero#deployment-adapters  (node adapter → `node dist/index.js`)
// SSR mode, buffered rendering (`ssr.mode` default 'string'), node adapter.
import pyreon from '@pyreon/vite-plugin'
import zero from '@pyreon/zero/server'
import { defineConfig, type Plugin } from 'vite'

/**
 * WORKSPACE-ONLY workaround, not a tuning knob. Inside this monorepo `sharp`
 * (zero's optional peer, imported lazily for `og` images) is resolvable only
 * from packages/zero/zero/node_modules, so the SSR sub-build bundles it instead
 * of leaving it external, and rolldown places its shared runtime helper in the
 * sharp chunk — the server then evaluates sharp at startup and crashes looking
 * for the native binary. An npm consumer either has sharp installed (external)
 * or not (unresolved lazy import); both start. Keeping it external restores
 * that shape. Plugins are forwarded to zero's inner SSR build; `ssr.external`
 * in the top-level config is not (it builds with `configFile: false`).
 */
const externalizeSharp: Plugin = {
  name: 'stacks-bench:externalize-sharp',
  config: () => ({ ssr: { external: ['sharp'] } }),
}

export default defineConfig({
  plugins: [pyreon(), zero({ mode: 'ssr', adapter: 'node', buildSummary: false }), externalizeSharp],
})
