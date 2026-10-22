/**
 * `@pyreon/head/native-plugin` — how the document `<head>` API behaves in a native app.
 *
 * A native app has no document, so there is nothing for head tags to describe: `useHead({ title, meta, link, … })`
 * lowers to nothing and `<HeadProvider>` is transparent. That is what lets shared source — one component that sets
 * its page title for the web build — compile for iOS and Android instead of failing on a web-only import.
 * `@pyreon/native-cli` discovers this from `package.json` → `pyreon.native.plugin` when a source file imports
 * `@pyreon/head`.
 *
 * Tooling-only — nothing here is reachable from the web entry points.
 */
export { headPlugin, headPlugin as default } from './native-plugin/plugin'
