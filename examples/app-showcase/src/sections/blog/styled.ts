import { RouterLink, type RouterLinkProps } from '@pyreon/router'
import { styled } from '@pyreon/styler'
import { Card, Paragraph, Title } from '@pyreon/ui-components'
import { t } from '../../styles'

/**
 * Styled components for the Blog section.
 *
 * Convention (same as todos):
 *   • Raw HTML elements      → `styled('tag')` reading colors via `t(p)`
 *   • Pyreon ui-components   → extend via the rocketstyle chain
 *
 * No inline styles, no hardcoded color tokens — every value flows
 * through the Pyreon theme.
 */

// ─── Page layout ─────────────────────────────────────────────────────
export const BlogPage = styled('div')`
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 32px;
  padding: 32px 40px;
  max-width: 1080px;
`

export const BlogSidebar = styled('aside')`
  display: flex;
  flex-direction: column;
  gap: 24px;
`

export const SidebarSection = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

export const SidebarLabel = Title.attrs({ tag: 'h3' }).theme((theme) => ({
  marginBottom: 8,
  fontSize: 11,
  fontWeight: theme.fontWeight.semibold,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: theme.color.system.dark[400],
}))

/**
 * Tag filter button. We deliberately use `styled('button')` rather
 * than `styled(RouterLink)` here even though the URL is updated:
 * `useUrlState` only listens for `popstate`, so navigating via
 * `RouterLink` (which uses `pushState`) wouldn't update the signal.
 * Calling `tag.set(name)` from an onClick writes the URL via
 * `setParams` AND updates the signal in one step, so the filter
 * stays in sync and the URL stays shareable.
 */
export const TagButton = styled('button')<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px;
  font-size: 13px;
  text-align: left;
  border: none;
  cursor: pointer;
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  background: ${(p) => (p.$active ? t(p).color.system.primary[100] : 'transparent')};
  color: ${(p) => (p.$active ? t(p).color.system.primary.text : t(p).color.system.dark[600])};
  font-weight: ${(p) => (p.$active ? t(p).fontWeight.semibold : t(p).fontWeight.base)};

  &:hover {
    background: ${(p) =>
      p.$active ? t(p).color.system.primary[100] : t(p).color.system.base[100]};
  }
`

export const TagCount = styled('span')`
  font-size: 11px;
  color: ${(p) => t(p).color.system.dark[400]};
`

// ─── Index page ──────────────────────────────────────────────────────
export const BlogMain = styled('div')`
  display: flex;
  flex-direction: column;
`

export const BlogTitle = Title.attrs({ tag: 'h1' }).theme(() => ({
  marginBottom: 4,
}))

export const BlogLead = Paragraph.theme((theme) => ({
  marginBottom: 32,
  fontSize: theme.fontSize.base,
  color: theme.color.system.dark[500],
}))

export const PostList = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

/** Card linking to a post — wraps RouterLink so the click is router-handled. */
export const PostCard = styled(RouterLink)<RouterLinkProps>`
  display: block;
  padding: 24px;
  background: ${(p) => t(p).color.system.light.base};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.large}px;
  text-decoration: none;
  color: inherit;
  transition: ${(p) => t(p).transition.base};

  &:hover {
    border-color: ${(p) => t(p).color.system.primary[300]};
    transform: translateY(-1px);
    box-shadow: ${(p) => t(p).shadows.small};
  }
`

export const PostCardMeta = styled('div')`
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 12px;
  color: ${(p) => t(p).color.system.dark[500]};
  margin-bottom: 8px;
`

export const PostCardTitle = styled('h2')`
  font-size: ${(p) => t(p).headingSize.level3}px;
  font-weight: ${(p) => t(p).fontWeight.bold};
  color: ${(p) => t(p).color.system.dark[800]};
  margin-bottom: 6px;
`

export const PostCardExcerpt = styled('p')`
  font-size: ${(p) => t(p).fontSize.base}px;
  color: ${(p) => t(p).color.system.dark[600]};
  line-height: ${(p) => t(p).lineHeight.base};
  margin-bottom: 12px;
`

export const TagsRow = styled('div')`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`

export const TagChip = styled('span')`
  font-size: 11px;
  padding: 2px 8px;
  background: ${(p) => t(p).color.system.primary[100]};
  color: ${(p) => t(p).color.system.primary.text};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  font-family: ${(p) => t(p).fontFamily.mono};
`

// ─── Empty state (no posts match the filter) ─────────────────────────
export const EmptyCard = Card.theme(() => ({
  padding: 32,
  textAlign: 'center',
}))

export const EmptyText = Paragraph.theme((theme) => ({
  color: theme.color.system.dark[400],
}))

// ─── Post detail page ────────────────────────────────────────────────
export const PostArticle = styled('article')`
  max-width: 720px;
  padding: 32px 40px;
`

export const BackLink = styled(RouterLink)<RouterLinkProps>`
  display: inline-block;
  margin-bottom: 16px;
  font-size: 13px;
  color: ${(p) => t(p).color.system.primary.text};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`

export const PostHeader = styled('header')`
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid ${(p) => t(p).color.system.base[200]};
`

export const PostTitle = styled('h1')`
  font-size: ${(p) => t(p).headingSize.level1}px;
  font-weight: ${(p) => t(p).fontWeight.bold};
  color: ${(p) => t(p).color.system.dark[800]};
  line-height: ${(p) => t(p).lineHeight.small};
  margin-bottom: 12px;
`

export const PostMeta = styled('div')`
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 13px;
  color: ${(p) => t(p).color.system.dark[500]};
  margin-bottom: 16px;
`

export const PostMetaSeparator = styled('span')`
  color: ${(p) => t(p).color.system.base[300]};
`

// ─── Block renderer styles ───────────────────────────────────────────
export const Prose = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 20px;
  font-size: 16px;
  line-height: 1.7;
  color: ${(p) => t(p).color.system.dark[700]};
`

export const ProseP = styled('p')`
  margin: 0;
`

export const ProseH2 = styled('h2')`
  font-size: ${(p) => t(p).headingSize.level3}px;
  font-weight: ${(p) => t(p).fontWeight.bold};
  color: ${(p) => t(p).color.system.dark[800]};
  margin-top: 12px;
`

export const ProseH3 = styled('h3')`
  font-size: ${(p) => t(p).headingSize.level4}px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  color: ${(p) => t(p).color.system.dark[800]};
  margin-top: 8px;
`

export const ProseQuote = styled('blockquote')`
  border-left: 3px solid ${(p) => t(p).color.system.primary[300]};
  padding: 8px 16px;
  margin: 0;
  color: ${(p) => t(p).color.system.dark[600]};
  font-style: italic;
`

export const ProseQuoteCite = styled('footer')`
  margin-top: 8px;
  font-style: normal;
  font-size: 13px;
  color: ${(p) => t(p).color.system.dark[400]};

  &::before {
    content: '— ';
  }
`

export const ProseCode = styled('pre')`
  background: ${(p) => t(p).color.system.dark[800]};
  color: ${(p) => t(p).color.system.light.base};
  padding: 16px 20px;
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  overflow-x: auto;
  font-family: ${(p) => t(p).fontFamily.mono};
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
`

export const ProseList = styled('ul')`
  margin: 0;
  padding-left: 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

export const ProseListItem = styled('li')`
  &::marker {
    color: ${(p) => t(p).color.system.primary[300]};
  }
`

// ─── 404 not-found ───────────────────────────────────────────────────
export const NotFoundCard = Card.theme(() => ({
  padding: 32,
  textAlign: 'center',
}))

export const NotFoundTitle = Title.attrs({ tag: 'h2' }).theme(() => ({
  marginBottom: 8,
}))

export const NotFoundText = Paragraph.theme((theme) => ({
  color: theme.color.system.dark[500],
  marginBottom: 16,
}))
