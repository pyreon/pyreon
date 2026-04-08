import { styled } from '@pyreon/styler'
import { Card, Paragraph, Title } from '@pyreon/ui-components'
import { t } from '../../styles'
import type { Card as KanbanCard } from './data/types'

/**
 * Styled components for the Kanban section.
 *
 * Same convention as the rest of the app:
 *   • Raw HTML elements    → `styled('tag')` reading colors via `t(p)`
 *   • Pyreon ui-components → extend via the rocketstyle chain
 *
 * Drag state is driven by `$dragging` / `$dropTarget` transient props
 * so the visual feedback updates without re-mounting the card DOM.
 */

// ─── Page layout ─────────────────────────────────────────────────────
export const KanbanPage = styled('div')`
  padding: 24px 32px 48px;
  max-width: 1200px;
`

export const Header = styled('header')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
`

export const HeaderText = styled('div')`
  display: flex;
  flex-direction: column;
`

export const KanbanTitle = Title.attrs({ tag: 'h1' }).theme(() => ({
  marginBottom: 4,
}))

export const KanbanLead = Paragraph.theme((theme) => ({
  fontSize: theme.fontSize.base,
  color: theme.color.system.dark[500],
}))

// ─── Toolbar ─────────────────────────────────────────────────────────
export const Toolbar = styled('div')`
  display: flex;
  align-items: center;
  gap: 8px;
`

export const ToolbarGroup = styled('div')`
  display: flex;
  gap: 4px;
  padding: 4px;
  background: ${(p) => t(p).color.system.base[100]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
`

export const ToolbarButton = styled('button')<{ $active?: boolean }>`
  padding: 6px 12px;
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  border: none;
  border-radius: ${(p) => t(p).borderRadius.base}px;
  cursor: pointer;
  background: ${(p) => (p.$active ? t(p).color.system.light.base : 'transparent')};
  color: ${(p) => (p.$active ? t(p).color.system.primary.text : t(p).color.system.dark[600])};
  box-shadow: ${(p) => (p.$active ? t(p).shadows.small : 'none')};

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

export const PrimaryButton = styled('button')`
  padding: 8px 16px;
  font-size: 13px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  border: none;
  border-radius: ${(p) => t(p).borderRadius.base}px;
  background: ${(p) => t(p).color.system.primary.base};
  color: ${(p) => t(p).color.system.light.base};
  cursor: pointer;
  transition: ${(p) => t(p).transition.fast};

  &:hover:not(:disabled) {
    background: ${(p) => t(p).color.system.primary[800]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

// ─── Board ───────────────────────────────────────────────────────────
export const BoardGrid = styled('div')`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  align-items: start;
`

export const ColumnRoot = styled('div')<{ $dropTarget?: boolean }>`
  background: ${(p) => t(p).color.system.base[50]};
  border: 1px solid
    ${(p) =>
      p.$dropTarget ? t(p).color.system.primary[300] : t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.large}px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 240px;
  transition: border-color 0.12s, background 0.12s;

  background: ${(p) =>
    p.$dropTarget ? t(p).color.system.primary[50] : t(p).color.system.base[50]};
`

export const ColumnHeader = styled('div')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 8px 8px;
`

export const ColumnTitleRow = styled('div')`
  display: flex;
  align-items: center;
  gap: 8px;
`

export const ColumnSwatch = styled('span')<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  background: ${(p) => p.$color};
`

export const ColumnName = styled('span')`
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${(p) => t(p).color.system.dark[600]};
`

export const ColumnCount = styled('span')`
  font-size: 11px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  color: ${(p) => t(p).color.system.dark[400]};
  background: ${(p) => t(p).color.system.base[100]};
  padding: 1px 8px;
  border-radius: ${(p) => t(p).borderRadius.pill}px;
`

export const CardSlot = styled('div')<{ $dropping?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 24px;
  border-top: 2px solid
    ${(p) => (p.$dropping ? t(p).color.system.primary[300] : 'transparent')};
  padding-top: ${(p) => (p.$dropping ? '6px' : '0')};
  transition: padding-top 0.12s, border-color 0.12s;
`

// ─── Card ────────────────────────────────────────────────────────────
const PRIORITY_COLOR: Record<KanbanCard['priority'], string> = {
  low: '#94a3b8',
  medium: '#f59e0b',
  high: '#ef4444',
}

export const CardRoot = styled('div')<{ $dragging?: boolean; $disabled?: boolean }>`
  background: ${(p) => t(p).color.system.light.base};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  padding: 12px 12px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: ${(p) => (p.$disabled ? 'default' : 'grab')};
  position: relative;
  opacity: ${(p) => (p.$dragging ? 0.4 : 1)};
  transition: box-shadow 0.12s, opacity 0.12s;
  user-select: none;

  &:hover {
    box-shadow: ${(p) => (p.$disabled ? 'none' : t(p).shadows.small)};
  }

  &:active {
    cursor: ${(p) => (p.$disabled ? 'default' : 'grabbing')};
  }
`

export const CardPriorityStripe = styled('span')<{ $priority: KanbanCard['priority'] }>`
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  background: ${(p) => PRIORITY_COLOR[p.$priority]};
`

export const CardTitle = styled('div')`
  font-size: 13px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  color: ${(p) => t(p).color.system.dark[800]};
  line-height: 1.4;
`

export const CardDescription = styled('div')`
  font-size: 12px;
  color: ${(p) => t(p).color.system.dark[500]};
  line-height: 1.5;
`

export const CardFooter = styled('div')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
`

export const TagRow = styled('div')`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
`

export const TagChip = styled('span')`
  font-size: 10px;
  padding: 1px 7px;
  background: ${(p) => t(p).color.system.primary[100]};
  color: ${(p) => t(p).color.system.primary.text};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  font-family: ${(p) => t(p).fontFamily.mono};
`

export const Avatar = styled('span')<{ $color: string }>`
  width: 22px;
  height: 22px;
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  background: ${(p) => p.$color};
  color: ${(p) => t(p).color.system.light.base};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  flex-shrink: 0;
`

export const CardFooterRight = styled('span')`
  display: flex;
  align-items: center;
  gap: 6px;
`

export const RemoveButton = styled('button')`
  background: transparent;
  border: none;
  color: ${(p) => t(p).color.system.dark[400]};
  cursor: pointer;
  padding: 2px 6px;
  font-size: 14px;
  line-height: 1;
  border-radius: ${(p) => t(p).borderRadius.base}px;

  &:hover {
    color: ${(p) => t(p).color.system.error.text};
    background: ${(p) => t(p).color.system.error[100]};
  }

  &:disabled {
    opacity: 0;
    cursor: not-allowed;
  }
`

// ─── New-card composer ───────────────────────────────────────────────
export const NewCardForm = styled('form')`
  display: flex;
  gap: 6px;
  padding: 6px;
  background: ${(p) => t(p).color.system.light.base};
  border: 1px dashed ${(p) => t(p).color.system.base[300]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
`

export const NewCardInput = styled('input')`
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  padding: 6px 8px;
  font-size: 12px;
  color: ${(p) => t(p).color.system.dark[800]};

  &::placeholder {
    color: ${(p) => t(p).color.system.dark[400]};
  }
`

// ─── Hint footer ─────────────────────────────────────────────────────
export const HintFooter = styled('div')`
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 24px;
  padding: 12px 16px;
  background: ${(p) => t(p).color.system.base[50]};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  font-size: 11px;
  color: ${(p) => t(p).color.system.dark[500]};
`

export const HintItem = styled('span')`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`

// ─── Empty card slot card variant ────────────────────────────────────
export const EmptyColumnCard = Card.theme(() => ({
  padding: 16,
  textAlign: 'center',
  background: 'transparent',
  borderColor: 'transparent',
}))

export const EmptyText = Paragraph.theme((theme) => ({
  fontSize: theme.fontSize.small,
  color: theme.color.system.dark[400],
  marginBottom: 0,
}))
