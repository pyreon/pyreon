import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPortablePath, portablePathsFrom } from '../../utils/portable-paths'

/**
 * CSS-in-JS in a file that has to reach iOS and Android.
 *
 * The whole styler / unistyle / rocketstyle stack is web-only by architecture,
 * not by omission: it emits real CSS into a real stylesheet, and there is no
 * stylesheet on either native target. PMTC's model is compile-time tokens
 * lowered into SwiftUI modifiers and Compose `Modifier` chains.
 *
 * So this is not a thing to port later — a portable file styles through the
 * canonical primitives' token props, and anything that needs a CSS engine
 * belongs in a `<Web>` branch.
 */
const CSS_IN_JS_CALLS = new Set(['styled', 'css', 'keyframes', 'createGlobalStyle', 'rocketstyle'])


export const noCssInJsInPortable: Rule = {
  meta: {
    id: 'pyreon/no-css-in-js-in-portable',
    category: 'portable',
    description:
      'CSS-in-JS in portable source — the styler stack emits real CSS into a real stylesheet, and neither native target has one.',
    severity: 'error',
    optIn: true,
    fixable: false,
    schema: { portablePaths: 'string[]' },
  },
  create(context) {
    const paths = portablePathsFrom(context)
    if (!isPortablePath(context.getFilePath(), paths)) return {}

    const report = (what: string, node: unknown) =>
      context.report({
        message: `\`${what}\` is CSS-in-JS, and this file has to compile for iOS and Android. The styler stack emits real CSS into a real stylesheet; neither native target has one, so this is web-only by architecture rather than by omission — there is no port coming. Style through the canonical primitives' token props, and put anything that genuinely needs a CSS engine behind a \`<Web>\` branch.`,
        span: getSpan(node),
      })

    const callbacks: VisitorCallbacks = {
      // `css\`...\`` / `styled.div\`...\`` — the tagged-template forms.
      TaggedTemplateExpression(node: any) {
        const tag = node?.tag
        if (tag?.type === 'Identifier' && CSS_IN_JS_CALLS.has(String(tag.name))) {
          report(String(tag.name), node)
          return
        }
        if (
          tag?.type === 'MemberExpression' &&
          tag.object?.type === 'Identifier' &&
          String(tag.object.name) === 'styled'
        ) {
          report('styled', node)
        }
      },

      // `styled('div')(...)` / `rocketstyle()(...)` — the call forms.
      CallExpression(node: any) {
        const c = node?.callee
        if (c?.type === 'Identifier' && CSS_IN_JS_CALLS.has(String(c.name))) {
          report(String(c.name), node)
        }
      },
    }
    return callbacks
  },
}
