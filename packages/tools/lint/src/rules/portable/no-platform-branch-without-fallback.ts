import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * A platform escape hatch used for one target and not the others.
 *
 * `<Web>`, `<NativeIOS>` and `<NativeAndroid>` render on exactly their own
 * target and nothing on the rest. Writing one without a sibling for the other
 * targets is not a compile error anywhere — the component simply renders
 * NOTHING on the platform you did not write, which reads as a layout bug on a
 * device rather than as a missing branch in source.
 *
 * Reported per element rather than per file: two `<Web>` blocks in different
 * components are two separate holes.
 */

const WEB = 'Web'
const IOS = 'NativeIOS'
const ANDROID = 'NativeAndroid'
const PLATFORM_TAGS = new Set([WEB, IOS, ANDROID])

export const noPlatformBranchWithoutFallback: Rule = {
  meta: {
    id: 'pyreon/no-platform-branch-without-fallback',
    category: 'portable',
    description:
      'A `<Web>` / `<NativeIOS>` / `<NativeAndroid>` branch with no sibling for the other targets renders NOTHING there — a blank region on a device rather than an error in source.',
    severity: 'warn',
    optIn: true,
    fixable: false,
  },
  create(context) {
    const seen = new Map<string, { span: { start: number; end: number } }>()

    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        const name = node?.name
        if (name?.type !== 'JSXIdentifier') return
        const tag = String(name.name)
        if (!PLATFORM_TAGS.has(tag)) return
        if (!seen.has(tag)) seen.set(tag, { span: getSpan(node) })
      },
      'Program:exit'() {
        if (seen.size === 0 || seen.size === PLATFORM_TAGS.size) return
        const present = [...seen.keys()]
        const missing = [...PLATFORM_TAGS].filter((t) => !seen.has(t))
        const first = seen.get(present[0] as string)
        if (!first) return
        context.report({
          message: `This file branches on platform with ${present.map((p) => `\`<${p}>\``).join(', ')} but has no ${missing.map((m) => `\`<${m}>\``).join(' / ')} — those targets render NOTHING here. That surfaces as a blank region on a device, not as an error in source. Add the missing branch, or a shared fallback outside the platform blocks.`,
          span: first.span,
        })
      },
    }
    return callbacks
  },
}
