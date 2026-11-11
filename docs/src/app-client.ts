import { routes } from 'virtual:zero/routes'
import { startClient } from '@pyreon/zero/client'
import { registerExamples } from '@pyreon/zero-content'
import 'virtual:zero-content/collections'

/**
 * The full client app: the docs (and any page the docs app navigates to in the
 * browser). `entry-client.ts` loads it only on pages that need the router;
 * marketing pages hydrate their islands instead (`site/static-client.ts`).
 */

// Register the consumer's example files for `<Example file="./..." />`.
// `import.meta.glob` is compile-time resolved relative to THIS file —
// the registry has no other way to reach the consumer's source tree.
// Each entry maps a relative path to a lazy `() => Promise<module>`.
registerExamples(
  import.meta.glob('./examples/**/*.tsx') as Record<
    string,
    () => Promise<unknown>
  >,
)

startClient({ routes })
