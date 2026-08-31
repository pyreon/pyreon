import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPortablePath, portablePathsFrom } from '../../utils/portable-paths'

/**
 * A Pyreon-flavoured component using `provide()` / `onMount()` with no
 * `nativeCompat()` marker.
 *
 * The `*-compat` JSX runtimes wrap every user component in
 * `wrapCompatComponent` so React/Preact/Vue/Solid-style state semantics work
 * inside Pyreon's mount pipeline. A component whose body calls `provide()` or
 * `onMount()` then has its setup running in the WRAPPER's accessor rather than
 * Pyreon's setup frame: the provide lands in a context stack that is torn down,
 * and effects re-run without live signal access.
 *
 * What makes this worth a static rule is that it is invisible to unit tests.
 * A synchronous mount preserves the provided context even when wrapped, so the
 * obvious test passes; the failure needs a second render cycle, and the repo
 * currently catches it with exactly one e2e.
 *
 * `nativeCompat(Component)` routes the component through `h(type, props)`
 * directly and costs one call.
 */
const SETUP_CALLS = new Set(['provide', 'onMount', 'onUnmount', 'onUpdate', 'effect'])


export const requireNativeCompatMarker: Rule = {
  meta: {
    id: 'pyreon/require-native-compat-marker',
    category: 'portable',
    description:
      'A component using `provide()` / `onMount()` without `nativeCompat()` breaks under the compat JSX runtimes — its setup runs in the wrapper, not Pyreon’s setup frame, and unit tests cannot see it.',
    severity: 'warn',
    optIn: true,
    fixable: false,
    schema: { portablePaths: 'string[]' },
  },
  create(context) {
    const paths = portablePathsFrom(context)
    if (!isPortablePath(context.getFilePath(), paths)) return {}

    const source = context.getSourceText?.() ?? ''
    // One marker anywhere in the file is enough — components are marked at
    // their export, not at their declaration.
    const fileHasMarker = /\bnativeCompat\s*\(/.test(source)

    const callbacks: VisitorCallbacks = {
      FunctionDeclaration(node: any) {
        if (fileHasMarker) return
        const id = node?.id
        if (id?.type !== 'Identifier') return
        const name = String(id.name)
        // Components are PascalCase by convention; a helper is not a component.
        if (!/^[A-Z]/.test(name)) return

        let found: string | null = null
        const walk = (n: any, d = 0): void => {
          if (!n || typeof n !== 'object' || d > 8 || found !== null) return
          if (
            n.type === 'CallExpression' &&
            n.callee?.type === 'Identifier' &&
            SETUP_CALLS.has(String(n.callee.name))
          ) {
            found = String(n.callee.name)
            return
          }
          for (const k of Object.keys(n)) {
            if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'parent') continue
            const v = (n as Record<string, unknown>)[k]
            if (Array.isArray(v)) for (const c of v) walk(c, d + 1)
            else if (v && typeof v === 'object') walk(v, d + 1)
          }
        }
        walk(node.body)
        if (found === null) return

        context.report({
          message: `\`${name}\` calls \`${found}()\` at setup but nothing in this file marks a component with \`nativeCompat()\`. Under the \`*-compat\` JSX runtimes every component is wrapped, so this setup runs in the wrapper's accessor instead of Pyreon's setup frame — the provide lands in a torn-down context stack and effects lose live signal access. A synchronous mount still passes, which is why unit tests do not catch it. Wrap the export: \`export default nativeCompat(${name})\`.`,
          span: getSpan(id),
        })
      },
    }
    return callbacks
  },
}
