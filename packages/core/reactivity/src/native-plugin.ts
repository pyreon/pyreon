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
        '`effectScope` has no native emit — a component\'s effects already stop with the component on both native targets; restructure with plain `effect()` / `computed()` (`batch`, `untrack` and `.peek()` DO lower, as their plain evaluation)',
      unsupported: ['effectScope'],
    },
  },
}
export default reactivityPlugin
