// ─── @pyreon/zero/internal-server ───────────────────────────────────────────
//
// INTERNAL ENTRY — NOT PUBLIC API. Nothing exported here carries a semver
// promise: any name can change or disappear in any release. Application code
// must not import it. See "What counts as public API" on the stability page
// (docs/src/content/docs/stability-and-direction.md).
//
// Node-only: the modules behind these names import `node:*`, so they are kept
// off the client-safe `@pyreon/zero/internal`, which plugin-generated browser
// code imports.
//
// What lives here (test-reset helpers):
//   - `_resetVercelRevalidateHandlerCache` — drop the Vercel revalidate
//     handler's cached prerender manifest

export { _resetVercelRevalidateHandlerCache } from './vercel-revalidate-handler'
