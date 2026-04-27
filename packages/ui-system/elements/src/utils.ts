// `import.meta.env.DEV` is provided by Vite/Rolldown at build time and
// literal-replaced so prod bundles tree-shake the dev branch to zero bytes.
// Typed through a narrowing interface so downstream packages don't need
// `vite/client` in their tsconfigs to type-check this file transitively.
export const IS_DEVELOPMENT: boolean = process.env.NODE_ENV !== 'production'
