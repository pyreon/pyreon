import { styled } from '@pyreon/styler'
import { Badge, Button, Card, Input, Paragraph, Title } from '@pyreon/ui-components'
import { tokens } from '../../styles'
import type { Todo } from './store/types'

/**
 * Styled components for the Todos section.
 *
 * Convention:
 *   • Raw HTML elements (div, button, span)  → use `styled('tag')`
 *   • Pyreon ui-components (Card, Button…)   → extend via the rocketstyle
 *     chain (`Card.attrs(...).theme(...)`) so the existing variants/states
 *     stay intact and our overrides compose with the theme
 *
 * State-driven styles use $-prefixed transient props so the dynamic CSS
 * is resolved per-render and the prop is stripped before reaching the DOM.
 */

const PRIORITY_COLOR: Record<NonNullable<Todo['priority']>, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#6b7280',
}

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

export const SidebarLabel = Title.attrs({ tag: 'h3' }).theme(() => ({
  marginBottom: 8,
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: tokens.textFaint,
}))

export const ProjectButtonRoot = styled('button')<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: none;
  background: ${(p) => (p.$active ? tokens.accentSoft : 'transparent')};
  color: ${(p) => (p.$active ? tokens.accent : tokens.text)};
  font-weight: ${(p) => (p.$active ? 600 : 400)};
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  width: 100%;

  &:hover {
    background: ${(p) => (p.$active ? tokens.accentSoft : tokens.surfaceAlt)};
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
  color: ${tokens.textFaint};
`

export const ShortcutsList = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: ${tokens.textMuted};
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

export const TodosLead = Paragraph.theme(() => ({
  marginBottom: 24,
  fontSize: 14,
  color: tokens.textMuted,
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
  color: #c7d2fe;
`

/** Borderless input variant for the add form. */
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

export const FilterTabsRoot = styled('div')`
  display: flex;
  gap: 4px;
  padding: 4px;
  background: ${tokens.surfaceAlt};
  border-radius: 8px;
`

export const FilterTab = styled('button')<{ $active?: boolean }>`
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  background: ${(p) => (p.$active ? tokens.surface : 'transparent')};
  color: ${(p) => (p.$active ? tokens.accent : tokens.textMuted)};
  box-shadow: ${(p) => (p.$active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none')};
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
  color: ${tokens.textMuted};
`

export const FooterActions = styled('div')`
  display: flex;
  gap: 8px;
`

/** Smaller, ghost-style button for footer actions. */
export const FooterButton = Button.theme(() => ({
  fontSize: 12,
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

export const EmptyText = Paragraph.theme(() => ({
  color: tokens.textFaint,
  marginBottom: 4,
}))

export const EmptyHint = Paragraph.theme(() => ({
  color: tokens.textFaint,
  fontSize: 12,
}))

export const TodoItemRoot = styled('div')<{ $selected?: boolean; $done?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: ${tokens.surface};
  border: 1px solid ${(p) => (p.$selected ? tokens.accentRing : tokens.border)};
  border-radius: 8px;
  cursor: pointer;
  box-shadow: ${(p) => (p.$selected ? `0 0 0 3px ${tokens.accentSoft}` : 'none')};
  transition: border-color 0.12s, box-shadow 0.12s, opacity 0.12s;
  opacity: ${(p) => (p.$done ? 0.6 : 1)};

  &:hover {
    border-color: ${(p) => (p.$selected ? tokens.accentRing : tokens.borderHover)};
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
  color: ${(p) => (p.$done ? tokens.textFaint : tokens.ink)};
  text-decoration: ${(p) => (p.$done ? 'line-through' : 'none')};
`

export const TodoNotes = styled('div')`
  font-size: 12px;
  color: ${tokens.textMuted};
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const PriorityChip = styled('span')<{ $priority: NonNullable<Todo['priority']> }>`
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: ${(p) => `${PRIORITY_COLOR[p.$priority]}1a`};
  color: ${(p) => PRIORITY_COLOR[p.$priority]};
  font-weight: 500;
  text-transform: capitalize;
`

export const TagsRow = styled('div')`
  display: flex;
  gap: 4px;
`

export const DeleteButton = styled('button')`
  background: transparent;
  border: none;
  color: ${tokens.textFaint};
  cursor: pointer;
  padding: 4px 8px;
  font-size: 16px;
  line-height: 1;

  &:hover {
    color: ${tokens.text};
  }
`
