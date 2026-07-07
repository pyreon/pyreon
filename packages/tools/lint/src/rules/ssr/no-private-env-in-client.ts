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
 * `api/` dirs, `entry-server`, `.config.*`, `scripts/`) are skipped so a
 * legitimate server-side `process.env.SECRET` isn't touched.
 */

// Vite's own `import.meta.env` built-ins — always safe, never a leak signal.
const VITE_BUILTIN_ENV = new Set(['DEV', 'PROD', 'MODE', 'SSR', 'BASE_URL'])

/** Server-only file shapes where a raw `process.env` read is legitimate. */
function isServerOnlyFile(path: string): boolean {
  return (
    /\.server\.[jt]sx?$/.test(path) ||
    /[\\/]api[\\/]/.test(path) ||
    /entry-server\.[jt]sx?$/.test(path) ||
    /\.config\.[jt]s$/.test(path) ||
    /[\\/]scripts?[\\/]/.test(path)
  )
}

/** True when `node.object` is the member chain `process.env`. */
function isProcessEnvBase(node: any): boolean {
  const obj = node?.object
  return (
    obj?.type === 'MemberExpression' &&
    obj.object?.type === 'Identifier' &&
    obj.object.name === 'process' &&
    obj.property?.type === 'Identifier' &&
    obj.property.name === 'env'
  )
}

/** True when `node.object` is the member chain `import.meta.env`. */
function isImportMetaEnvBase(node: any): boolean {
  const obj = node?.object
  return (
    obj?.type === 'MemberExpression' &&
    obj.object?.type === 'MetaProperty' &&
    obj.property?.type === 'Identifier' &&
    obj.property.name === 'env'
  )
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
    }

    return callbacks
  },
}
