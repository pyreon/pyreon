import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isTestFile } from '../../utils/file-roles'
import { isProjectDependency } from '../../utils/project-deps'

/**
 * `pyreon/no-private-env-in-client` — flag raw `process.env.X` /
 * `import.meta.env.X` reads in client-reachable `@pyreon/zero` code.
 *
 * `process.env` doesn't exist in the browser (the read is `undefined`), and
 * `import.meta.env` is bundler-specific (Vite-only). In a zero app the portable,
 * safe way to read a browser-visible env var is `publicEnv()` from
 * `@pyreon/zero/env` with a `ZERO_PUBLIC_`-prefixed var — which zero inlines into
 * the client bundle at build (and keeps secrets out by construction).
 *
 * Conservative by design (opt-in, `@pyreon/zero`-gated): `process.env.NODE_ENV`
 * and Vite's `import.meta.env` built-ins (`DEV`/`PROD`/`MODE`/`SSR`/`BASE_URL`)
 * are universal and never flagged; obviously server-only files (`.server.*`,
 * `api/` + `server/` dirs, `entry-server`, `.config.*`, `scripts/`) are skipped
 * so a legitimate server-side `process.env.SECRET` isn't touched.
 *
 * Both the direct-access shape (`process.env.X` / `import.meta.env.X`) AND the
 * base-capture / destructuring shape (`const { X } = process.env`, `const e =
 * import.meta.env`) are caught — the latter is a common real leak form.
 */

// Vite's own `import.meta.env` built-ins — always safe, never a leak signal.
const VITE_BUILTIN_ENV = new Set(['DEV', 'PROD', 'MODE', 'SSR', 'BASE_URL'])

/** Server-only file shapes where a raw `process.env` read is legitimate. */
function isServerOnlyFile(path: string): boolean {
  return (
    /\.server\.[jt]sx?$/.test(path) ||
    /[\\/]api[\\/]/.test(path) ||
    /[\\/]server[\\/]/.test(path) ||
    /entry-server\.[jt]sx?$/.test(path) ||
    /\.config\.[jt]s$/.test(path) ||
    /[\\/]scripts?[\\/]/.test(path)
  )
}

/** True when `n` is itself the member chain `process.env`. */
function isProcessEnvNode(n: any): boolean {
  return (
    n?.type === 'MemberExpression' &&
    n.object?.type === 'Identifier' &&
    n.object.name === 'process' &&
    n.property?.type === 'Identifier' &&
    n.property.name === 'env'
  )
}

/** True when `n` is itself the member chain `import.meta.env`. */
function isImportMetaEnvNode(n: any): boolean {
  return (
    n?.type === 'MemberExpression' &&
    n.object?.type === 'MetaProperty' &&
    n.property?.type === 'Identifier' &&
    n.property.name === 'env'
  )
}

/** True when `node.object` is `process.env` (i.e. `node` is `process.env.X`). */
function isProcessEnvBase(node: any): boolean {
  return isProcessEnvNode(node?.object)
}

/** True when `node.object` is `import.meta.env` (i.e. `node` is `import.meta.env.X`). */
function isImportMetaEnvBase(node: any): boolean {
  return isImportMetaEnvNode(node?.object)
}

export const noPrivateEnvInClient: Rule = {
  meta: {
    id: 'pyreon/no-private-env-in-client',
    category: 'ssr',
    description:
      "Flag raw `process.env.X` / `import.meta.env.X` reads in client-reachable @pyreon/zero code — `process.env` is undefined in the browser and `import.meta.env` is bundler-specific. Use `publicEnv()` from `@pyreon/zero/env` with a `ZERO_PUBLIC_`-prefixed var (inlined into the client bundle at build, secrets kept out). Opt-in best-practice, gated on the project depending on @pyreon/zero; `NODE_ENV` + Vite built-ins + server-only files are never flagged.",
    severity: 'warn',
    optIn: true,
    fixable: false,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    const filePath = context.getFilePath()

    if (isTestFile(filePath)) return {}
    if (isPathExempt(context)) return {}
    if (isServerOnlyFile(filePath)) return {}
    // Only fires in projects that actually use zero — where `publicEnv()` exists.
    if (!isProjectDependency(filePath, '@pyreon/zero')) return {}

    const callbacks: VisitorCallbacks = {
      MemberExpression(node: any) {
        const key = node.property?.type === 'Identifier' ? node.property.name : null
        if (key == null) return // computed access (`process.env[k]`) — skip, rarer + dynamic

        if (isProcessEnvBase(node)) {
          if (key === 'NODE_ENV') return
          context.report({
            message: `\`process.env.${key}\` is \`undefined\` in the browser — this read is dead client-side. In a @pyreon/zero app, expose a browser-visible var by prefixing it \`ZERO_PUBLIC_${key}\` and reading it with \`publicEnv()\` from \`@pyreon/zero/env\` (zero inlines it into the client bundle at build). Keep genuinely-secret values on the server (never prefix them \`ZERO_PUBLIC_\`).`,
            span: getSpan(node),
          })
          return
        }

        if (isImportMetaEnvBase(node)) {
          if (VITE_BUILTIN_ENV.has(key)) return
          context.report({
            message: `\`import.meta.env.${key}\` is bundler-specific (Vite-only) — prefer @pyreon/zero's portable, zero-branded env: prefix the var \`ZERO_PUBLIC_${key.replace(/^VITE_/, '')}\` and read it with \`publicEnv()\` from \`@pyreon/zero/env\`. (Vite built-ins \`DEV\`/\`PROD\`/\`MODE\`/\`SSR\`/\`BASE_URL\` are fine.)`,
            span: getSpan(node),
          })
        }
      },

      // Base-capture shape: `const { X } = process.env` / `const e = import.meta.env`.
      // The `MemberExpression` handler only sees `process.env.X` (property `.X`),
      // never the bare `process.env` base — so destructuring / whole-object
      // capture (a common leak form) needs its own visit. No double-report:
      // `const u = process.env.API_URL` has a `.API_URL` init (not the bare base).
      VariableDeclarator(node: any) {
        const init = node.init
        if (isProcessEnvNode(init)) {
          context.report({
            message:
              'Reading `process.env` in client-reachable code is `undefined` in the browser — these values are dead client-side. Expose browser-visible vars by prefixing them `ZERO_PUBLIC_` and reading with `publicEnv()` from `@pyreon/zero/env` (zero inlines them into the client bundle at build). Keep secrets server-side (never prefix them `ZERO_PUBLIC_`).',
            span: getSpan(init),
          })
        } else if (isImportMetaEnvNode(init)) {
          context.report({
            message:
              "Capturing `import.meta.env` in client code is bundler-specific (Vite-only) — prefer @pyreon/zero's portable env: read `publicEnv()` from `@pyreon/zero/env` with `ZERO_PUBLIC_`-prefixed vars.",
            span: getSpan(init),
          })
        }
      },
    }

    return callbacks
  },
}
