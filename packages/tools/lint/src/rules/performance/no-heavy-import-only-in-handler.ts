import type { Rule, RuleContext, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { HEAVY_PACKAGES } from '../../utils/imports'

/**
 * A statically-imported heavy module that is referenced ONLY inside
 * deferred scopes — JSX event handlers (`onClick={() => …}`) or lifecycle
 * callbacks (`onMount`/`onUnmount`/`onCleanup`/`effect`/`renderEffect`) —
 * has no reason to sit in the initial bundle. The static `import` forces
 * the heavy chunk to load on first paint even though nothing touches it
 * until the user interacts. Converting it to a dynamic `import()` inside
 * the handler keeps the chunk out of the eager graph for free.
 *
 * Distinct from `pyreon/no-eager-import` (info, fires on EVERY heavy
 * static import including ones genuinely needed at render): this rule is
 * the PRECISE, actionable counterpart — it fires only when it can prove
 * EVERY use of the binding is deferred, so the fix is unambiguous and
 * there is no risk of "but I need it at render". Conservative by
 * construction: any eager reference at all suppresses the report (a
 * false negative is acceptable; a false positive — telling someone to
 * defer an import they need eagerly — is not).
 *
 * Origin: distilled from the Tier-2 resumability spike's L3 heavy-import
 * classification, which was the one part of that analysis with zero
 * false-positive risk. The runtime thesis didn't survive measurement;
 * this defensive lint use of the same detection does.
 *
 * @example
 *   // ✗ flagged — Chart only used in a click handler
 *   import { renderChart } from '@pyreon/charts'
 *   <button onClick={() => renderChart(el)}>Show chart</button>
 *
 *   // ✓ fixed — heavy chunk stays out of the initial bundle
 *   <button onClick={async () => {
 *     const { renderChart } = await import('@pyreon/charts')
 *     renderChart(el)
 *   }}>Show chart</button>
 *
 *   // ✓ not flagged — used at render, must stay static
 *   import { Chart } from '@pyreon/charts'
 *   return <Chart data={data()} />
 */

const DEFERRED_CALLS = new Set([
  'onMount',
  'onUnmount',
  'onCleanup',
  'effect',
  'renderEffect',
])

const FN_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression'])

/** Keys whose subtrees are type-only — never a runtime reference. */
const TYPE_KEYS = new Set([
  'typeAnnotation',
  'returnType',
  'typeParameters',
  'typeArguments',
  'superTypeArguments',
])

interface Use {
  source: string
  importSpan: ReturnType<typeof getSpan>
  eager: boolean
  deferred: boolean
}

function resolveHeavySet(context: RuleContext): Set<string> {
  const opt = context.getOptions().heavyModules
  const extra = Array.isArray(opt) ? opt.filter((s): s is string => typeof s === 'string') : []
  return new Set<string>([...HEAVY_PACKAGES, ...extra])
}

function isStaticValueImport(node: any): boolean {
  // `import type { … }` / `import { type X }` carry no runtime cost.
  return node?.type === 'ImportDeclaration' && node.importKind !== 'type'
}

export const noHeavyImportOnlyInHandler: Rule = {
  meta: {
    id: 'pyreon/no-heavy-import-only-in-handler',
    category: 'performance',
    description:
      'A statically-imported heavy module used only in event handlers / lifecycle callbacks should be a dynamic import().',
    severity: 'warn',
    fixable: false,
    schema: { heavyModules: 'string[]' },
  },
  create(context) {
    const heavy = resolveHeavySet(context)
    // localName → first-seen import binding info + accumulated usage.
    const bindings = new Map<string, Use>()
    // Import node id (span start) → set of local names it binds.
    const importLocals = new Map<number, { node: any; locals: string[] }>()

    const callbacks: VisitorCallbacks = {
      Program(program: any) {
        // ── Pass 1: collect heavy static-import bindings ────────────────
        for (const stmt of (program.body as any[]) ?? []) {
          if (!isStaticValueImport(stmt)) continue
          const source = stmt.source?.value
          if (typeof source !== 'string' || !heavy.has(source)) continue
          const span = getSpan(stmt)
          const locals: string[] = []
          for (const spec of (stmt.specifiers as any[]) ?? []) {
            // Skip `import { type X }` specifiers (no runtime binding).
            if (spec?.importKind === 'type') continue
            const local = spec?.local
            if (local?.type === 'Identifier' && typeof local.name === 'string') {
              locals.push(local.name)
              if (!bindings.has(local.name)) {
                bindings.set(local.name, {
                  source,
                  importSpan: span,
                  eager: false,
                  deferred: false,
                })
              }
            }
          }
          if (locals.length > 0) importLocals.set(span.start, { node: stmt, locals })
        }
        if (bindings.size === 0) return

        // ── Pass 2: controlled walk classifying each reference ──────────
        // oxc's visitor passes no parent and no exit, so own the recursion:
        // `deferredDepth > 0` ⇒ current node is inside a JSX event handler
        // or a lifecycle callback. `inImport` skips the import specifier's
        // own local identifier (a declaration, not a use).
        const walk = (node: any, deferredDepth: number, inImport: boolean): void => {
          if (!node || typeof node.type !== 'string') return

          if (node.type === 'ImportDeclaration') return // bindings only, no uses

          // Heavy-binding reference site. `JSXIdentifier` covers the
          // `<Chart/>` element-name shape — a render-time use of a heavy
          // component; without it, importing a heavy component used ONLY
          // in JSX (not a handler) would false-positive as deferred-only.
          // Attribute-name JSXIdentifiers (`onClick`) harmlessly miss the
          // bindings lookup.
          if ((node.type === 'Identifier' || node.type === 'JSXIdentifier') && !inImport) {
            const b = bindings.get(node.name)
            if (b) {
              if (deferredDepth > 0) b.deferred = true
              else b.eager = true
            }
            return
          }

          // A function that is a JSX `on*` handler value, or a lifecycle
          // callback argument, makes its whole subtree deferred.
          if (node.type === 'JSXAttribute') {
            const attr = node.name?.name
            const expr = node.value?.expression
            if (
              typeof attr === 'string' &&
              /^on[A-Z]/.test(attr) &&
              expr &&
              FN_TYPES.has(expr.type)
            ) {
              walk(expr, deferredDepth + 1, false)
              // Walk the rest of the attribute (name etc.) non-deferred.
              if (node.name) walk(node.name, deferredDepth, false)
              return
            }
          }
          if (node.type === 'CallExpression') {
            const callee = node.callee
            if (callee?.type === 'Identifier' && DEFERRED_CALLS.has(callee.name)) {
              for (const arg of (node.arguments as any[]) ?? []) {
                walk(arg, FN_TYPES.has(arg?.type) ? deferredDepth + 1 : deferredDepth, false)
              }
              walk(callee, deferredDepth, false)
              return
            }
          }
          // Non-computed member property / object-literal key are not
          // references to the binding — skip just that slot.
          if (node.type === 'MemberExpression' && !node.computed) {
            walk(node.object, deferredDepth, inImport)
            return
          }
          if (
            (node.type === 'Property' || node.type === 'ObjectProperty') &&
            !node.computed &&
            node.key?.type === 'Identifier'
          ) {
            walk(node.value, deferredDepth, inImport)
            return
          }

          for (const key of Object.keys(node)) {
            if (
              key === 'type' ||
              key === 'start' ||
              key === 'end' ||
              key === 'range' ||
              key === 'loc' ||
              TYPE_KEYS.has(key)
            ) {
              continue
            }
            const child = node[key]
            if (Array.isArray(child)) {
              for (const c of child) {
                if (c && typeof c === 'object') walk(c, deferredDepth, inImport)
              }
            } else if (child && typeof child === 'object' && typeof child.type === 'string') {
              if (child.type?.startsWith('TS')) continue // type position
              walk(child, deferredDepth, inImport)
            }
          }
        }
        walk(program, 0, false)

        // ── Verdict: fire only when EVERY used local is deferred-only ────
        for (const { node, locals } of importLocals.values()) {
          const used = locals
            .map((n) => bindings.get(n))
            .filter((b): b is Use => !!b && (b.eager || b.deferred))
          if (used.length === 0) continue // unused — not this rule's concern
          if (used.some((b) => b.eager)) continue // needed eagerly — suppress
          const src = used[0]!.source
          context.report({
            message:
              `\`${src}\` is heavy and used ONLY inside event handlers / lifecycle callbacks. ` +
              `Replace the static import with a dynamic \`await import('${src}')\` inside the ` +
              `handler so the chunk stays out of the initial bundle.`,
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
