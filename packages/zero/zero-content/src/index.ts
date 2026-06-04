// ─── @pyreon/zero-content main entry ──────────────────────────────────────
//
// Client-safe exports only. The Vite plugin lives at
// `@pyreon/zero-content/plugin` (Node-only — pulls in remark/unified/etc).

import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/zero-content
// instances in the same heap. Diagnostic; not load-bearing.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

// ─── Config helpers ────────────────────────────────────────────────────────

export {
  defineConfig,
  defineCollection,
  defineComponents,
  mergeComponents,
} from './config'

// ─── Types ────────────────────────────────────────────────────────────────

export type {
  CollectionDefinition,
  CollectionEntry,
  CollectionSchemas,
  ComponentsRegistry,
  ContentConfig,
  ContentModule,
  Heading,
} from './types'
