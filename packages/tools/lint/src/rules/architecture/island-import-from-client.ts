/**
 * Tier-3 islands DX — `pyreon/island-import-from-client`.
 *
 * `import { island } from '@pyreon/server'` (the main barrel) drags the
 * whole server module graph — `node:fs`/`node:path`/`node:async_hooks` +
 * `registerSingleton` — into any bundle that includes the importing file.
 * In client-reachable code (routes, components — the dominant place
 * islands are declared) this produces the documented double failure: the
 * duplicate-singleton throw during the SSG build of the route AND a dual
 * `@pyreon/core` context split that crashes the hydrated island
 * (`Cannot read properties of undefined (reading 'ref')`).
 *
 * The client-safe subentry `@pyreon/server/client` re-exports `island`
 * and works EVERYWHERE (server included), so the fix is universally safe
 * — which is why the rule fires on every barrel `island` import rather
 * than trying to prove client-reachability from a single file. Files that
 * are server-only BY NAMING CONVENTION (`entry-server.*`, `*.server.*`)
 * are exempt: the barrel import is harmless there and rewriting it is
 * churn.
 *
 * In `@pyreon/zero` apps, `import { island } from '@pyreon/zero'` is the
 * canonical form (zero's main entry re-exports the client-safe island).
 */
import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

const SERVER_ONLY_FILE_RE = /(entry-server\.[jt]sx?|\.server\.[jt]sx?)$/

export const islandImportFromClient: Rule = {
  meta: {
    id: 'pyreon/island-import-from-client',
    category: 'architecture',
    description:
      "Import `island` from '@pyreon/server/client' (or '@pyreon/zero'), never the '@pyreon/server' barrel — the barrel drags node:* + the server singleton into client bundles.",
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    const filePath = context.getFilePath()
    // Server-only files by naming convention keep the barrel import.
    if (SERVER_ONLY_FILE_RE.test(filePath)) return {}

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const source = node.source?.value as string | undefined
        if (source !== '@pyreon/server') return
        for (const spec of node.specifiers ?? []) {
          if (
            spec.type === 'ImportSpecifier'
            && (spec.imported?.name === 'island' || spec.imported?.value === 'island')
          ) {
            context.report({
              message:
                "`island` imported from the '@pyreon/server' barrel — this drags node:* modules + the server singleton into any client bundle that reaches this file (duplicate-singleton throw + dual @pyreon/core context split at hydration). Import from '@pyreon/server/client' instead (client-safe, works on the server too); in @pyreon/zero apps, `import { island } from '@pyreon/zero'`.",
              span: getSpan(node),
            })
            return
          }
        }
      },
    }
    return callbacks
  },
}
