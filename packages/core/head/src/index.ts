import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/head
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton('@pyreon/head', '0.24.6', import.meta.url)

export type {
  BaseTag,
  HeadContextValue,
  HeadEntry,
  HeadTag,
  LinkTag,
  MetaTag,
  ScriptTag,
  SpeculationEagerness,
  SpeculationRule,
  SpeculationRules,
  StyleTag,
  UseHeadInput,
} from './context'
export { createHeadContext, HeadContext } from './context'
export type { HeadProviderProps } from './provider'
export { HeadProvider } from './provider'
export { useHead } from './use-head'
