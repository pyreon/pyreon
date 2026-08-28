import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isApiRouteFile } from '../../utils/file-roles'

/**
 * A synchronous filesystem or process call on a server file's request path.
 *
 * Node is single-threaded per process: `readFileSync` blocks the event loop
 * for its whole duration, so every OTHER in-flight request waits. At one
 * concurrent user it is invisible; at fifty it is the whole server's latency.
 *
 * Two gates, both learned by measuring rather than guessing. Module-scope is
 * NOT flagged — reading a config once at boot is the correct use of the sync
 * API. And the FILE must actually serve requests: it must be an fs-router API
 * route, or export a request-handler shape (`GET`/`POST`/…, `handler`,
 * `loader`, `action`).
 *
 * Without that second gate the rule fired 134 times on this repo, essentially
 * all of it in Vite plugins, the compiler and the scaffolders — server-role
 * code that is not a request path, where synchronous fs is exactly right. A
 * rule that is wrong about build tooling is a rule that gets switched off
 * before it ever catches the handler it was written for.
 */

/** Exports that mean "this file answers a request". */
const HANDLER_EXPORTS = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
  'handler', 'loader', 'serverLoader', 'action', 'onRequest',
])

const SYNC_CALLS = new Set([
  'readFileSync',
  'writeFileSync',
  'appendFileSync',
  'readdirSync',
  'statSync',
  'existsSync',
  'mkdirSync',
  'rmSync',
  'unlinkSync',
  'execSync',
  'spawnSync',
  'execFileSync',
])

export const noSyncFsInRequestPath: Rule = {
  meta: {
    id: 'pyreon/no-sync-fs-in-request-path',
    category: 'backend',
    description:
      'A synchronous fs/process call inside a server-side function blocks the event loop for every concurrent request. Module-scope boot-time reads are fine and are not flagged.',
    severity: 'warn',
    appliesTo: ['server'],
    fixable: false,
  },
  create(context) {
    const filePath = context.getFilePath()
    /** Findings held until we know the file actually serves requests. */
    const pending: Array<{ name: string; span: { start: number; end: number } }> = []
    let servesRequests = isApiRouteFile(filePath)
    let functionDepth = 0
    const enter = () => {
      functionDepth++
    }
    const exit = () => {
      functionDepth--
    }

    const callbacks: VisitorCallbacks = {
      FunctionDeclaration: enter,
      'FunctionDeclaration:exit': exit,
      FunctionExpression: enter,
      'FunctionExpression:exit': exit,
      ArrowFunctionExpression: enter,
      'ArrowFunctionExpression:exit': exit,
      CallExpression(node: any) {
        if (functionDepth === 0) return
        const callee = node?.callee
        const name =
          callee?.type === 'Identifier'
            ? String(callee.name)
            : callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier'
              ? String(callee.property.name)
              : null
        if (name === null || !SYNC_CALLS.has(name)) return

        pending.push({ name, span: getSpan(node) })
      },
      ExportNamedDeclaration(node: any) {
        const d = node?.declaration
        const named =
          d?.type === 'FunctionDeclaration' && d.id?.type === 'Identifier'
            ? String(d.id.name)
            : d?.type === 'VariableDeclaration'
              ? (d.declarations ?? [])
                  .map((x: any) => (x.id?.type === 'Identifier' ? String(x.id.name) : ''))
                  .find((n: string) => HANDLER_EXPORTS.has(n))
              : undefined
        if (named && HANDLER_EXPORTS.has(named)) servesRequests = true
      },
      'Program:exit'() {
        if (!servesRequests) return
        for (const f of pending) {
          context.report({
            message: `\`${f.name}\` on the request path blocks the event loop — every OTHER in-flight request waits for it. Use the promise form (\`fs/promises\`); a sync read at MODULE scope, once at boot, is fine and is not flagged.`,
            span: f.span,
          })
        }
      },
    }
    return callbacks
  },
}
