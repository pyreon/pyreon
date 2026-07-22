/**
 * Built-in: auto-categorizes a component by its name, merging discovered tags
 * with any existing ones. Feeds catalog navigation + the `findByTag` query.
 */
import type { AtlasPlugin } from './types'
import { defineAtlasPlugin } from './define'

interface CategoryRule {
  tag: string
  pattern: RegExp
}

const CATEGORY_RULES: readonly CategoryRule[] = [
  { tag: 'form', pattern: /button|input|select|checkbox|radio|switch|slider|field|form|textarea|toggle/i },
  { tag: 'layout', pattern: /stack|grid|row|col|container|box|flex|spacer|divider|group/i },
  { tag: 'feedback', pattern: /alert|toast|notification|badge|progress|spinner|loader|skeleton|tooltip/i },
  { tag: 'navigation', pattern: /nav|menu|tab|breadcrumb|pagination|link|drawer|sidebar/i },
  { tag: 'overlay', pattern: /modal|dialog|popover|dropdown|overlay|sheet/i },
  { tag: 'data', pattern: /table|list|tree|card|avatar|tag|chip/i },
]

export function tagsPlugin(): AtlasPlugin {
  return defineAtlasPlugin({
    name: 'atlas:tags',
    decorate(ci) {
      const found = CATEGORY_RULES.filter((r) => r.pattern.test(ci.name)).map((r) => r.tag)
      if (found.length === 0) return ci
      const merged = [...new Set([...ci.tags, ...found])]
      if (merged.length === ci.tags.length) return ci
      return { ...ci, tags: merged }
    },
  })
}
