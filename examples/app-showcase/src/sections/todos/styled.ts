import { styled } from '@pyreon/styler'
import { Badge, Button, Card, Input, Paragraph, Title } from '@pyreon/ui-components'
import { t } from '../../styles'
import type { Todo } from './store/types'

/**
 * Styled components for the Todos section.
 *
 * Convention:
 *   • Raw HTML elements (div, button, span)  → use `styled('tag')`
 *     and read theme via `${(p) => t(p).color.system.x}` interpolation.
 *   • Pyreon ui-components (Card, Button…)   → extend via the rocketstyle
 *     chain `Component.attrs(...).theme((t) => ({...}))`. The `t`
 *     callback parameter is fully typed because @pyreon/ui-theme
 *     augments rocketstyle's ThemeDefault interface.
 *
 * State-driven styles use $-prefixed transient props so the dynamic CSS
 * is resolved per-render and the prop is stripped before reaching the DOM.
 */

// ─── Page layout ─────────────────────────────────────────────────────
export const TodosLayout = styled('div')`
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 24px;
  padding: 32px 40px;
  max-width: 1080px;
`

export const TodosSidebar = styled('aside')`
  display: flex;
  flex-direction: column;
  gap: 24px;
`

export const SidebarSection = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

export const SidebarLabel = Title.attrs({ tag: 'h3' }).theme((theme) => ({
  marginBottom: 8,
  fontSize: 11,
  fontWeight: theme.fontWeight.semibold,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: theme.color.system.dark[400],
}))

export const ProjectButtonRoot = styled('button')<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: none;
  background: ${(p) => (p.$active ? t(p).color.system.primary[100] : 'transparent')};
  color: ${(p) => (p.$active ? t(p).color.system.primary.text : t(p).color.system.dark[600])};
  font-weight: ${(p) => (p.$active ? t(p).fontWeight.semibold : t(p).fontWeight.base)};
  font-size: 13px;
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  cursor: pointer;
  text-align: left;
  width: 100%;

  &:hover {
    background: ${(p) =>
      p.$active ? t(p).color.system.primary[100] : t(p).color.system.base[100]};
  }
`

export const ProjectSwatch = styled('span')<{ $color: string }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: ${(p) => p.$color};
`

export const ProjectLabel = styled('span')`
  flex: 1;
`

export const ProjectCount = styled('span')`
  font-size: 11px;
  color: ${(p) => t(p).color.system.dark[400]};
`

export const ShortcutsList = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: ${(p) => t(p).color.system.dark[500]};
`

export const ShortcutItem = styled('div')`
  display: flex;
  align-items: center;
  gap: 8px;
`

// ─── Main column ─────────────────────────────────────────────────────
export const TodosMain = styled('div')`
  display: flex;
  flex-direction: column;
`

export const TodosTitle = Title.attrs({ tag: 'h1' }).theme(() => ({
  marginBottom: 4,
}))

export const TodosLead = Paragraph.theme((theme) => ({
  marginBottom: 24,
  fontSize: theme.fontSize.base,
  color: theme.color.system.dark[500],
}))

// ─── Add form ────────────────────────────────────────────────────────
export const AddForm = styled('form')`
  margin-bottom: 16px;
`

/** Card variant tuned for the inline add-todo form. */
export const AddCard = Card.attrs({
  direction: 'inline',
  alignY: 'center',
  gap: 8,
}).theme(() => ({
  padding: 12,
}))

export const AddIcon = styled('span')`
  font-size: 18px;
  color: ${(p) => t(p).color.system.primary[300]};
`

/** Borderless input variant for the inline add-todo card (no border or focus ring). */
export const AddInput = Input.theme(() => ({
  borderColor: 'transparent',
  paddingTop: 4,
  paddingBottom: 4,
  paddingLeft: 0,
  paddingRight: 0,
  focus: {
    borderColor: 'transparent',
    boxShadow: 'none',
  },
}))

/**
 * Add-form submit button. Uses `styled('button')` rather than the
 * rocketstyle Button because we need an explicit `type="submit"` (which
 * the rocketstyle Button doesn't expose in its prop surface) so the
 * form submits exactly once whether the user presses Enter or clicks.
 */
export const AddButton = styled('button')`
  background: ${(p) => t(p).color.system.primary.base};
  color: ${(p) => t(p).color.system.light.base};
  border: none;
  border-radius: ${(p) => t(p).borderRadius.base}px;
  padding: 6px 14px;
  font-size: ${(p) => t(p).fontSize.small}px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  cursor: pointer;
  transition: ${(p) => t(p).transition.base};
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: ${(p) => t(p).color.system.primary[800]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

// ─── Toolbar ─────────────────────────────────────────────────────────
export const Toolbar = styled('div')`
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
`

export const ToolbarSearchSlot = styled('div')`
  flex: 1;
`

/**
 * Search input — plain rocketstyle Input (border + focus ring intact),
 * exported as a section-specific alias so the page only imports from
 * one place.
 */
export const SearchInput = Input

export const FilterTabsRoot = styled('div')`
  display: flex;
  gap: 4px;
  padding: 4px;
  background: ${(p) => t(p).color.system.base[100]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
`

export const FilterTab = styled('button')<{ $active?: boolean }>`
  padding: 4px 12px;
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  border: none;
  border-radius: ${(p) => t(p).borderRadius.base}px;
  cursor: pointer;
  background: ${(p) => (p.$active ? t(p).color.system.light.base : 'transparent')};
  color: ${(p) => (p.$active ? t(p).color.system.primary.text : t(p).color.system.dark[500])};
  box-shadow: ${(p) => (p.$active ? t(p).shadows.small : 'none')};
`

/** Badge variant with no-wrap so the count text stays on a single line. */
export const CountBadge = Badge.theme(() => ({
  whiteSpace: 'nowrap',
}))

// ─── Footer ──────────────────────────────────────────────────────────
export const FooterBar = styled('div')`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 24px;
  font-size: 13px;
  color: ${(p) => t(p).color.system.dark[500]};
`

export const FooterActions = styled('div')`
  display: flex;
  gap: 8px;
`

/** Smaller, ghost-style button for footer actions. */
export const FooterButton = Button.theme((theme) => ({
  fontSize: theme.fontSize.small,
}))

// ─── List & item ─────────────────────────────────────────────────────
export const ListContainer = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

/** Empty-state Card variant — centered text, more padding. */
export const EmptyCard = Card.theme(() => ({
  padding: 32,
  textAlign: 'center',
}))

export const EmptyText = Paragraph.theme((theme) => ({
  color: theme.color.system.dark[400],
  marginBottom: 4,
}))

export const EmptyHint = Paragraph.theme((theme) => ({
  color: theme.color.system.dark[400],
  fontSize: theme.fontSize.small,
}))

export const TodoItemRoot = styled('div')<{ $selected?: boolean; $done?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: ${(p) => t(p).color.system.light.base};
  border: 1px solid
    ${(p) => (p.$selected ? t(p).color.system.primary[300] : t(p).color.system.base[200])};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  cursor: pointer;
  box-shadow: ${(p) => (p.$selected ? `0 0 0 3px ${t(p).color.system.primary[100]}` : 'none')};
  transition: border-color 0.12s, box-shadow 0.12s, opacity 0.12s;
  opacity: ${(p) => (p.$done ? 0.6 : 1)};

  &:hover {
    border-color: ${(p) =>
      p.$selected ? t(p).color.system.primary[300] : t(p).color.system.base[300]};
  }
`

export const TodoCheckbox = styled('input')`
  width: 16px;
  height: 16px;
  cursor: pointer;
  flex-shrink: 0;
`

export const TodoBody = styled('div')`
  flex: 1;
  min-width: 0;
`

export const TodoTitle = styled('div')<{ $done?: boolean }>`
  font-size: 14px;
  color: ${(p) => (p.$done ? t(p).color.system.dark[400] : t(p).color.system.dark[800])};
  text-decoration: ${(p) => (p.$done ? 'line-through' : 'none')};
`

export const TodoNotes = styled('div')`
  font-size: 12px;
  color: ${(p) => t(p).color.system.dark[500]};
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

/**
 * Priority pill — colors come from the Pyreon theme's semantic palette
 * (`error`, `warning`, `base`). The `[100]` background and `.text` text
 * variants give a tint+ink pair that already has good contrast.
 */
export const PriorityChip = styled('span')<{ $priority: NonNullable<Todo['priority']> }>`
  font-size: 11px;
  padding: 2px 8px;
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  background: ${(p) => {
    const theme = t(p)
    switch (p.$priority) {
      case 'high':
        return theme.color.system.error[100]
      case 'medium':
        return theme.color.system.warning[100]
      case 'low':
        return theme.color.system.base[100]
    }
  }};
  color: ${(p) => {
    const theme = t(p)
    switch (p.$priority) {
      case 'high':
        return theme.color.system.error.text
      case 'medium':
        return theme.color.system.warning.text
      case 'low':
        return theme.color.system.dark[600]
    }
  }};
  font-weight: ${(p) => t(p).fontWeight.medium};
  text-transform: capitalize;
`

export const TagsRow = styled('div')`
  display: flex;
  gap: 4px;
`

export const DeleteButton = styled('button')`
  background: transparent;
  border: none;
  color: ${(p) => t(p).color.system.dark[400]};
  cursor: pointer;
  padding: 4px 8px;
  font-size: 16px;
  line-height: 1;

  &:hover {
    color: ${(p) => t(p).color.system.dark[600]};
  }
`
