import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * An `<img>` with no `loading` hint.
 *
 * Every image without `loading="lazy"` competes for bandwidth with the ones
 * actually on screen, which is the common way a page's Largest Contentful
 * Paint gets pushed out by content nobody has scrolled to yet.
 *
 * `info` rather than `warn`, and deliberately so: the rule CANNOT know what is
 * above the fold, and a hero image genuinely should be eager — marking it lazy
 * makes LCP worse, not better. So this is a prompt to make the call, not an
 * assertion that lazy is right. `loading="eager"` satisfies it; the point is
 * that the decision was made.
 *
 * `@pyreon/zero`'s `<Image>` handles this already, which is why the message
 * points there first.
 */
export const requireImgLoadingHint: Rule = {
  meta: {
    id: 'pyreon/require-img-loading-hint',
    category: 'web-perf',
    description:
      'An `<img>` with no `loading` hint competes for bandwidth with on-screen content — the usual way LCP is delayed by images nobody has scrolled to.',
    severity: 'info',
    optIn: true,
    appliesTo: ['client', 'shared'],
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      JSXOpeningElement(node: any) {
        if (node?.name?.type !== 'JSXIdentifier' || String(node.name.name) !== 'img') return
        const attrs = (node.attributes ?? []) as any[]
        // A spread may carry it; the rule cannot see inside, so it stays quiet.
        if (attrs.some((a) => a?.type === 'JSXSpreadAttribute')) return
        const has = attrs.some(
          (a) => a?.type === 'JSXAttribute' && a.name?.type === 'JSXIdentifier' && String(a.name.name) === 'loading',
        )
        if (has) return
        context.report({
          message:
            'This `<img>` states no `loading` hint, so it competes for bandwidth with whatever is actually on screen. Add `loading="lazy"` below the fold — or `loading="eager"` if this IS the hero, where lazy would make LCP worse. The rule cannot tell which; it only asks that the call be made. `@pyreon/zero`\'s `<Image>` handles this plus srcset and a placeholder.',
          span: getSpan(node),
        })
      },
    }
    return callbacks
  },
}
