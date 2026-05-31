import type { Rule } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isTestFile } from '../../utils/file-roles'

/**
 * `pyreon/no-module-signal-in-server-package` — flag `export const X = signal(...)`
 * at module scope inside server-side framework packages.
 *
 * **The bug class (Pattern A from the audit campaign).** Server packages
 * are CONCURRENT — many requests run simultaneously through the same Node
 * process, all sharing the module-level state. A module-scoped Pyreon
 * `signal()` is single-instance per process: write `signal.set(X)` for
 * request A, request B's signal reads see X too. Last-writer-wins races
 * between concurrent SSR requests silently corrupt per-request state.
 *
 * Reference bug: `localeSignal` in `@pyreon/zero`'s `i18n-routing.ts` —
 * the dev middleware set the module signal per request, and two concurrent
 * requests with different locales raced the writes (the later request
 * stomped the earlier one before its render finished, so both renders saw
 * the wrong locale). Fix shape: per-request `AsyncLocalStorage` store +
 * a `useX()` hook that prefers the per-request store, falling back to the
 * module signal for client-side use (CSR is single-threaded).
 *
 * **What this rule catches.** Top-level `export const X = signal(...)`
 * (or `computed(...)`) declarations in source files matching one of the
 * server-package roots:
 *
 *   - `packages/zero/zero/src/`
 *   - `packages/core/server/src/`
 *   - `packages/core/runtime-server/src/`
 *
 * **What it allows.**
 *
 *   - Module-scoped signals inside hook bodies (`function useX() { const
 *     s = signal(0); ... }`) — those allocate per call site, no race.
 *   - Module-scoped CONSTANTS that aren't signals.
 *   - Test files (those run synchronously per test; concurrency is a
 *     non-issue).
 *   - Source files inside `exemptPaths` directories (configured per
 *     project).
 *
 * **`exemptPaths` option.** Same shape as the other architecture rules.
 * Use sparingly — module-scoped signals in server code are almost always
 * a bug. Reasonable exemptions:
 *
 *   - The rule's own implementation file (rule introspects itself).
 *   - Compile-time helpers in server packages that don't actually run
 *     per-request (e.g. a singleton config store written ONCE at startup
 *     and never mutated). Note this exemption case explicitly with a
 *     comment in the source so future readers know it's deliberate.
 *
 * **No auto-fix.** The fix shape varies per call site (per-request ALS
 * vs. context system vs. closure capture). Replace the module signal
 * with whichever pattern fits the code's concurrency requirements.
 */

// The default set of paths inside the monorepo where server-side framework
// code lives. Other packages (or out-of-tree consumers) opt in via the
// `additionalPaths` option below.
const DEFAULT_SERVER_PACKAGE_PATHS = [
  'packages/zero/zero/src/',
  'packages/core/server/src/',
  'packages/core/runtime-server/src/',
] as const

// Detect a `signal(...)` or `computed(...)` call expression. The compiler
// detects these too (signal auto-call), so the shape is well-defined.
function isSignalLikeCall(node: any): boolean {
  if (node?.type !== 'CallExpression') return false
  const callee = node.callee
  if (callee?.type !== 'Identifier') return false
  return callee.name === 'signal' || callee.name === 'computed'
}

function getServerPackagePaths(ctx: import('../../types').RuleContext): string[] {
  const opts = ctx.getOptions()
  const additional = opts.additionalPaths
  if (Array.isArray(additional)) {
    const extras = additional.filter((s) => typeof s === 'string' && s.length > 0)
    return [...DEFAULT_SERVER_PACKAGE_PATHS, ...extras]
  }
  return [...DEFAULT_SERVER_PACKAGE_PATHS]
}

function isInServerPackage(filePath: string, paths: string[]): boolean {
  for (const p of paths) {
    if (filePath.includes(p)) return true
  }
  return false
}

export const noModuleSignalInServerPackage: Rule = {
  meta: {
    id: 'pyreon/no-module-signal-in-server-package',
    category: 'architecture',
    description:
      'Forbid module-scoped Pyreon signals in server-side framework packages. Server packages are concurrent — module signals race between requests. Use per-request `AsyncLocalStorage` or the framework context system instead. See the i18n-routing.ts `localeSignal` precedent for the canonical fix shape.',
    severity: 'error',
    fixable: false,
    schema: {
      exemptPaths: 'string[]',
      additionalPaths: 'string[]',
    },
  },
  create(context) {
    const filePath = context.getFilePath()

    // Tests run synchronously per test — no concurrency race.
    if (isTestFile(filePath)) return {}

    // Explicit per-file opt-out.
    if (isPathExempt(context)) return {}

    // Only fire inside the server-package roots.
    const serverPaths = getServerPackagePaths(context)
    if (!isInServerPackage(filePath, serverPaths)) return {}

    // Track nested-function depth so we only fire on TOP-LEVEL declarations.
    // A `signal()` inside a hook body (`function useX() { const s = signal(0) }`)
    // allocates per call — not a module-global.
    let functionDepth = 0

    function enterFunction() {
      functionDepth++
    }
    function exitFunction() {
      functionDepth--
    }

    return {
      // Track function depth so VariableDeclaration only fires at module scope
      FunctionDeclaration: enterFunction,
      'FunctionDeclaration:exit': exitFunction,
      FunctionExpression: enterFunction,
      'FunctionExpression:exit': exitFunction,
      ArrowFunctionExpression: enterFunction,
      'ArrowFunctionExpression:exit': exitFunction,
      MethodDefinition: enterFunction,
      'MethodDefinition:exit': exitFunction,

      VariableDeclaration(node: any) {
        // Only top-level declarations
        if (functionDepth > 0) return

        const declarations = node.declarations
        if (!Array.isArray(declarations)) return

        for (const decl of declarations) {
          const init = decl.init
          if (!init) continue

          // Match `const X = signal(...)` or `const X = computed(...)`.
          if (!isSignalLikeCall(init)) continue

          // Identifier we're naming — used in the message.
          const id = decl.id
          const name = id?.type === 'Identifier' ? id.name : '<unknown>'

          const span = getSpan(decl)
          context.report({
            message:
              `[Pyreon] Module-scoped \`${name} = signal(...)\` in a server-side framework package — this races between concurrent SSR requests. ` +
              `Server packages must use per-request state (\`AsyncLocalStorage\` or the framework context system) instead of module globals. ` +
              `Pattern: declare a per-request store inside an ALS, expose a \`useX()\` hook that reads from the store (or falls back to a module signal for CSR-only use). ` +
              `Reference fix: \`@pyreon/zero/i18n-routing.ts\` \`localeSignal\` (PR-S7).`,
            span,
          })
        }
      },
    }
  },
}
