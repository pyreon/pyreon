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
// Runtime VALUE re-export via self-package path so the build externalizes
// the symbol — main entry + every sub-entry resolves to the same
// `lib/context.js` at runtime. The type re-exports above stay as `./context`
// (types erase, externalization doesn't apply). See `ssr.ts` for the full
// rationale + `tests/context-identity.test.ts` for the post-build contract.
export { createHeadContext, HeadContext } from '@pyreon/head/context'
export type { HeadProviderProps } from './provider'
export { HeadProvider } from './provider'
export { useHead } from './use-head'
