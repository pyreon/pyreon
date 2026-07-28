/**
 * `atlas dev` — the workbench server, its virtual modules and the RPC channel.
 * Node only.
 *
 * This file exists at the top level because the build tool derives entries from
 * the export KEY (`"./dev"` → `src/dev.ts`), not from the export target — the
 * same convention `src/ui.ts` follows.
 */
export * from './dev/index'
