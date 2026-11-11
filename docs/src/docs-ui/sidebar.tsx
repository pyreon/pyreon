import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { DocsGlyph as Glyph } from './glyph'
import { groupId, isActive, normalizeDocsPath, SIDEBAR, type DocsSidebarItem, type SidebarBadge } from './nav'

/** Sidebar badge: mono pill, kind-coloured, its source in the tooltip (a badge never carries a figure the record does not print). */
export function Badge(props: { badge: SidebarBadge }) {
  return (
    <span class={`dx-bdg dx-bdg--${props.badge.kind}`} title={props.badge.source}>
      {props.badge.text}
    </span>
  )
}

function ItemLink(props: { item: DocsSidebarItem; path: string; sub?: boolean; onNavigate?: (() => void) | undefined }) {
  const href = normalizeDocsPath(props.item.href)
  // h(), not JSX: the glyph and the badge are conditional children, which a
  // compiled template re-creates on hydration instead of adopting (#4385);
  // the drawer's island hydrates this markup.
  return h(
    'a',
    {
      href,
      class: props.sub ? 'dx-side__link dx-side__link--sub' : 'dx-side__link',
      'aria-current': normalizeDocsPath(props.path) === href ? 'page' : undefined,
      onClick: props.onNavigate,
    },
    props.item.productId ? h(Glyph, { id: props.item.productId, size: 16 }) : null,
    h('span', { class: 'dx-side__text' }, props.item.title),
    props.item.badge ? h(Badge, { badge: props.item.badge }) : null,
  )
}

/**
 * The docs navigation (`_docs.json#sidebar`): search first, then the groups
 * in the Products-menu order. A product's sub-pages show while you are on the
 * product or one of them. The same component fills the desktop column (static
 * HTML, with the search box as an island) and the "Browse docs" drawer (inside
 * the drawer's island); `idPrefix` keeps their group ids unique on one page.
 */
export function DocsSidebar(props: {
  path: string
  search: VNodeChild
  onNavigate?: (() => void) | undefined
  idPrefix: string
  label: string
}) {
  return (
    <nav class="dx-side" aria-label={props.label}>
      {props.search}
      {SIDEBAR.map((group) => {
        const id = `${props.idPrefix}-${groupId(group.group)}`
        return (
          <div class="dx-sg">
            <p class="dx-eyebrow dx-sg__title" id={id}>
              {group.group}
            </p>
            <ul class="dx-sg__list" aria-labelledby={id}>
              {group.items.map((item) =>
                // h(): the sub-list is a conditional child (see ItemLink).
                h(
                  'li',
                  null,
                  h(ItemLink, { item, path: props.path, onNavigate: props.onNavigate }),
                  item.children && isActive(item, props.path)
                    ? h(
                        'ul',
                        { class: 'dx-sub' },
                        ...item.children.map((child) =>
                          h('li', null, h(ItemLink, { item: child, path: props.path, sub: true, onNavigate: props.onNavigate })),
                        ),
                      )
                    : null,
                ),
              )}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}
