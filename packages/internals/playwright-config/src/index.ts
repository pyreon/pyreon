// Public API — every root-level `playwright.*.config.ts` imports from here.
//
// Relative re-exports use explicit `.ts` extensions: Playwright's config
// loader resolves the package through Node's strict ESM resolver (it reads
// the `default` exports condition — see package.json), which requires
// explicit extensions for relative specifiers. TypeScript with
// `moduleResolution: 'Bundler'` accepts the `.ts` form for typechecking.
export type { DefinePlaywrightConfigOptions, E2eProject } from './config.ts'
export { definePlaywrightConfig } from './config.ts'
export type { E2eWebServer } from './servers.ts'
export { viteDevServer } from './servers.ts'
