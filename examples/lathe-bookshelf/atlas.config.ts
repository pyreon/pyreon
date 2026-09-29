import { scenarios } from './src/gen/atlas.scenarios'
import { wrapper } from './src/gen/atlas.wrapper'

/**
 * The whole catalog is generated. Nothing here names a component, a scenario
 * or a provider — all of it comes from `openapi.yaml`.
 */
export default {
  title: 'Bookshelf',
  // The `.native.tsx` modules export components shaped for the NATIVE
  // compiler, not for browsing -- they take a render callback and throw
  // without one. Skipping them keeps the report about the previews.
  // `main.tsx` mounts the app at module scope, so importing it in a Node scan
  // throws on `document` -- it is an entry point, not a catalog entry.
  // Patterns match paths RELATIVE TO the scanned `src/`, so this is
  // `main.tsx`: `src/main.tsx` matched nothing and the scan loaded the file.
  ignore: ['.native.tsx', 'main.tsx'],
  scenarios,
  wrapper,
}
