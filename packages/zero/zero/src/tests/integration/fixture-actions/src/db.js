// Server-only module: reachable ONLY from action handlers. The client
// bundle must not contain it. The top-level statement is a deliberate
// side effect (a real db client opens a pool at import), so a bundler
// cannot drop the module on its own once the import survives — only the
// transform's import pruning keeps it out of the client.
//
// Plain JS on purpose: a TypeScript transform already elides an import
// whose bindings are unused, which would hide a pruning regression. JS —
// and TS under `verbatimModuleSyntax` — keeps it.
globalThis.__dbPool = 'DB_MODULE_MARKER'
export const db = { save: (v) => ({ saved: v }) }
