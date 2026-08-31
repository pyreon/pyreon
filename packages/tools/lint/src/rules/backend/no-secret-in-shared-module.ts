import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * A non-public env read in a module a client file can reach.
 *
 * `@pyreon/zero` draws the line at the `ZERO_PUBLIC_` prefix: those values are
 * inlined into the client bundle deliberately, and everything else is a
 * secret. Reading `process.env.STRIPE_SECRET_KEY` in a module that a component
 * imports does not fail the build — the bundler inlines whatever the value was
 * at build time, and the key ships to every browser that loads the page.
 *
 * This runs on `shared` files specifically. A server file reading a secret is
 * correct and is the entire point of having secrets; a shared file doing it is
 * the leak. The role resolver already knows which is which, which is what makes
 * the rule expressible at all — the read itself looks identical in both.
 *
 * The fix is to move the read into a server-only module and pass the RESULT,
 * never the key, across the boundary.
 */
const PUBLIC_PREFIXES = ['ZERO_PUBLIC_', 'PUBLIC_', 'VITE_', 'NEXT_PUBLIC_']
/**
 * Environment plumbing rather than secrets.
 *
 * The model is deny-by-default, matching zero's own: only `ZERO_PUBLIC_`
 * values are meant to cross into the client, so everything else is suspect
 * until named here. That makes this list the rule's false-positive surface,
 * and it earns entries by measurement — the terminal-colour set below was
 * added after the rule reported `FORCE_COLOR` in `@pyreon/ansi` three times,
 * which is a TTY capability check and not a credential.
 *
 * The bar for adding a name: it must be something a build tool or runtime
 * sets about the ENVIRONMENT, never something an operator sets as a secret.
 */
const BENIGN = new Set([
  'NODE_ENV', 'MODE', 'BASE_URL', 'DEV', 'PROD', 'SSR', 'CI', 'TZ',
  // Terminal + colour capability, read by any CLI-adjacent module.
  'FORCE_COLOR', 'NO_COLOR', 'TERM', 'COLORTERM', 'TERM_PROGRAM',
  // Ordinary process plumbing.
  'DEBUG', 'LANG', 'LC_ALL', 'PWD', 'HOME', 'PATH', 'SHELL', 'USER',
])

function envKeyOf(node: any): string | null {
  // `process.env.X` — a member of a member.
  if (node?.type !== 'MemberExpression') return null
  const obj = node.object
  if (
    obj?.type !== 'MemberExpression' ||
    obj.object?.type !== 'Identifier' ||
    String(obj.object.name) !== 'process' ||
    obj.property?.type !== 'Identifier' ||
    String(obj.property.name) !== 'env'
  ) {
    return null
  }
  if (node.computed === true) {
    return node.property?.type === 'Literal' ? String(node.property.value) : null
  }
  return node.property?.type === 'Identifier' ? String(node.property.name) : null
}

export const noSecretInSharedModule: Rule = {
  meta: {
    id: 'pyreon/no-secret-in-shared-module',
    category: 'backend',
    description:
      'A non-public env var read from a file that also runs on the client — the bundler inlines the value, so the secret ships in the browser bundle without failing the build.',
    severity: 'error',
    appliesTo: ['shared', 'client'],
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      MemberExpression(node: any) {
        const key = envKeyOf(node)
        if (key === null) return
        if (BENIGN.has(key)) return
        if (PUBLIC_PREFIXES.some((p) => key.startsWith(p))) return
        context.report({
          message: `\`process.env.${key}\` is read from a file that also runs on the client. Nothing fails: the bundler inlines whatever the value was at build time, and it ships to every browser that loads the page. Only \`ZERO_PUBLIC_\`-prefixed values are meant to cross that line. Move the read into a server-only module and pass the RESULT across, never the key.`,
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
