import { h, Show } from '@pyreon/core'
import { DocsGlyph as Glyph } from './glyph'
import { useLinkClick } from '../site/kit/link'
import { groupId, isActive, normalizeDocsPath, SIDEBAR, type DocsSidebarItem, type SidebarBadge } from './nav'

/** Sidebar badge: mono pill, kind-coloured, its source in the tooltip (a badge never carries a figure the record does not print). */
export function Badge(props: { badge: SidebarBadge }) {
  return (
    <span class={`dx-bdg dx-bdg--${props.badge.kind}`} title={props.badge.source}>
      {props.badge.text}
    </span>
  )
}

export function SearchButton(props: { onOpen: () => void; id?: string | undefined }) {
  return (
    <button type="button" class="dx-search" id={props.id} aria-haspopup="dialog" onClick={() => props.onOpen()}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M10.5 10.5 14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <span>Search docs</span>
      <kbd aria-hidden="true">⌘K</kbd>
    </button>
  )
}

function ItemLink(props: { item: DocsSidebarItem; path: () => string; sub?: boolean; onNavigate?: (() => void) | undefined }) {
  const click = useLinkClick()
  const href = normalizeDocsPath(props.item.href)
  // h(), not JSX: the glyph and the badge are conditional children, which a
  // compiled template re-creates on hydration instead of adopting (#4385).
  return h(
    'a',
    {
      href,
      class: props.sub ? 'dx-side__link dx-side__link--sub' : 'dx-side__link',
      'aria-current': () => (normalizeDocsPath(props.path()) === href ? 'page' : undefined),
      onClick: click(href, () => props.onNavigate?.()),
    },
    props.item.productId ? h(Glyph, { id: props.item.productId, size: 16 }) : null,
    h('span', { class: 'dx-side__text' }, props.item.title),
    props.item.badge ? h(Badge, { badge: props.item.badge }) : null,
  )
}

/**
 * The docs navigation (`_docs.json#sidebar`): search first, then the groups
 * in the Products-menu order. A product's sub-pages show while you are on the
 * product or one of them. The same component fills the desktop column and the
 * "Browse docs" drawer; `idPrefix` keeps their group ids unique on one page.
 */
export function DocsSidebar(props: {
  path: () => string
  onSearch: () => void
  onNavigate?: (() => void) | undefined
  idPrefix: string
  label: string
}) {
  return (
    <nav class="dx-side" aria-label={props.label}>
      <SearchButton onOpen={props.onSearch} />
      {SIDEBAR.map((group) => {
        const id = `${props.idPrefix}-${groupId(group.group)}`
        return (
          <div class="dx-sg">
            <p class="dx-eyebrow dx-sg__title" id={id}>
              {group.group}
            </p>
            <ul class="dx-sg__list" aria-labelledby={id}>
              {group.items.map((item) =>
                // h(): the sub-list is a conditional child (#4385, see ItemLink).
                h(
                  'li',
                  null,
                  h(ItemLink, { item, path: props.path, onNavigate: props.onNavigate }),
                  item.children
                    ? h(
                        Show,
                        { when: () => isActive(item, props.path()) },
                        h(
                          'ul',
                          { class: 'dx-sub' },
                          ...item.children.map((child) =>
                            h('li', null, h(ItemLink, { item: child, path: props.path, sub: true, onNavigate: props.onNavigate })),
                          ),
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
