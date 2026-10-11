/** Bind the reactivity package's exports to generic compiler state operations. */
import { type CompilerPlugin } from '@pyreon/native-compiler/plugin-api'

export const reactivityPlugin: CompilerPlugin = {
  name: '@pyreon/reactivity',
  apiVersion: 2,
  modules: ['@pyreon/reactivity'],
  intrinsicCalls: { signal: 'signal', computed: 'computed' },
  unlowered: {
    '@pyreon/reactivity': {
      advice:
        'these have no native emit — writes inside one action already coalesce on both native targets, so drop the `batch(...)` wrapper and set signals directly; for `untrack` / `effectScope`, restructure with plain `computed()`',
      unsupported: ['batch', 'untrack', 'effectScope'],
    },
  },
}
export default reactivityPlugin
