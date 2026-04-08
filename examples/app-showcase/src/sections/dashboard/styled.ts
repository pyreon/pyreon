import { styled } from '@pyreon/styler'
import { Paragraph, Title } from '@pyreon/ui-components'
import { t } from '../../styles'
import type { Customer, OrderStatus } from './data/types'

/**
 * Styled components for the Dashboard section.
 *
 * Same convention as the other sections:
 *   • Raw HTML elements    → `styled('tag')` reading colors via `t(p)`
 *   • Pyreon ui-components → extend via the rocketstyle chain
 */

// ─── Page layout ─────────────────────────────────────────────────────
export const DashboardPage = styled('div')`
  padding: 32px 40px;
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

export const DashboardTitle = Title.attrs({ tag: 'h1' }).theme(() => ({
  marginBottom: 4,
}))

export const DashboardLead = Paragraph.theme((theme) => ({
  fontSize: theme.fontSize.base,
  color: theme.color.system.dark[500],
}))

// ─── Permission toggle ────────────────────────────────────────────────
export const RoleToggle = styled('div')`
  display: flex;
  gap: 4px;
  padding: 4px;
  background: ${(p) => t(p).color.system.base[100]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
`

export const RoleButton = styled('button')<{ $active?: boolean }>`
  padding: 6px 14px;
  font-size: 13px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  border: none;
  border-radius: ${(p) => t(p).borderRadius.base}px;
  cursor: pointer;
  background: ${(p) => (p.$active ? t(p).color.system.light.base : 'transparent')};
  color: ${(p) => (p.$active ? t(p).color.system.primary.text : t(p).color.system.dark[500])};
  box-shadow: ${(p) => (p.$active ? t(p).shadows.small : 'none')};
`

// ─── KPI strip ───────────────────────────────────────────────────────
export const KpiCard = styled('div')`
  padding: 20px 24px;
  background: ${(p) => t(p).color.system.light.base};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.large}px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

export const KpiLabel = styled('div')`
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${(p) => t(p).color.system.dark[400]};
`

export const KpiValue = styled('div')`
  font-size: ${(p) => t(p).headingSize.level2}px;
  font-weight: ${(p) => t(p).fontWeight.bold};
  color: ${(p) => t(p).color.system.dark[800]};
  line-height: 1.1;
`

export const KpiDelta = styled('div')<{ $trend: 'up' | 'down' }>`
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  color: ${(p) =>
    p.$trend === 'up' ? t(p).color.system.success.text : t(p).color.system.error.text};
`

// ─── Loading skeleton (used while queries fetch) ─────────────────────
export const Skeleton = styled('div')<{ $width?: number }>`
  background: ${(p) => t(p).color.system.base[100]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  height: 14px;
  width: ${(p) => (p.$width !== undefined ? `${p.$width}px` : '100%')};
`

export const SkeletonValue = styled('div')`
  background: ${(p) => t(p).color.system.base[100]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  height: 28px;
  width: 80px;
`

// ─── Charts row ──────────────────────────────────────────────────────
export const ChartCard = styled('div')`
  background: ${(p) => t(p).color.system.light.base};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.large}px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const ChartTitle = Title.attrs({ tag: 'h3' }).theme((theme) => ({
  fontSize: theme.fontSize.medium,
  color: theme.color.system.dark[700],
}))

export const ChartFallback = styled('div')`
  width: 100%;
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${(p) => t(p).color.system.dark[400]};
  font-size: 13px;
`

// ─── Tabs ────────────────────────────────────────────────────────────
export const TabsBar = styled('div')`
  display: flex;
  gap: 4px;
  padding: 4px;
  background: ${(p) => t(p).color.system.base[100]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  margin-bottom: 16px;
  width: fit-content;
`

export const TabButton = styled('button')<{ $active?: boolean }>`
  padding: 6px 16px;
  font-size: 13px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  border: none;
  border-radius: ${(p) => t(p).borderRadius.base}px;
  cursor: pointer;
  background: ${(p) => (p.$active ? t(p).color.system.light.base : 'transparent')};
  color: ${(p) => (p.$active ? t(p).color.system.primary.text : t(p).color.system.dark[500])};
  box-shadow: ${(p) => (p.$active ? t(p).shadows.small : 'none')};
`

// ─── Table ───────────────────────────────────────────────────────────
export const TableCard = styled('div')`
  background: ${(p) => t(p).color.system.light.base};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.large}px;
  overflow: hidden;
`

export const TableToolbar = styled('div')`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid ${(p) => t(p).color.system.base[200]};
`

export const TableSearchInput = styled('input')`
  flex: 1;
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  outline: none;
  background: ${(p) => t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.dark[800]};

  &:focus {
    border-color: ${(p) => t(p).color.system.primary[300]};
    box-shadow: 0 0 0 3px ${(p) => t(p).color.system.primary[100]};
  }

  &::placeholder {
    color: ${(p) => t(p).color.system.dark[400]};
  }
`

export const StatusFilter = styled('select')`
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  background: ${(p) => t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.dark[800]};
  cursor: pointer;
`

export const Table = styled('table')`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`

export const Th = styled('th')<{ $sortable?: boolean }>`
  padding: 12px 16px;
  text-align: left;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  color: ${(p) => t(p).color.system.dark[500]};
  background: ${(p) => t(p).color.system.base[50]};
  border-bottom: 1px solid ${(p) => t(p).color.system.base[200]};
  cursor: ${(p) => (p.$sortable ? 'pointer' : 'default')};
  user-select: none;

  &:hover {
    background: ${(p) => (p.$sortable ? t(p).color.system.base[100] : 'inherit')};
  }
`

export const Td = styled('td')`
  padding: 12px 16px;
  border-bottom: 1px solid ${(p) => t(p).color.system.base[100]};
  color: ${(p) => t(p).color.system.dark[700]};
  vertical-align: middle;
`

export const TableRow = styled('tr')`
  &:hover {
    background: ${(p) => t(p).color.system.base[50]};
  }
`

export const StatusPill = styled('span')<{ $status: OrderStatus }>`
  display: inline-block;
  padding: 2px 10px;
  font-size: 11px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  text-transform: capitalize;
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  background: ${(p) => {
    const theme = t(p)
    switch (p.$status) {
      case 'pending':
        return theme.color.system.warning[100]
      case 'processing':
        return theme.color.system.info[100]
      case 'shipped':
        return theme.color.system.primary[100]
      case 'delivered':
        return theme.color.system.success[100]
      case 'refunded':
        return theme.color.system.base[100]
    }
  }};
  color: ${(p) => {
    const theme = t(p)
    switch (p.$status) {
      case 'pending':
        return theme.color.system.warning.text
      case 'processing':
        return theme.color.system.info.text
      case 'shipped':
        return theme.color.system.primary.text
      case 'delivered':
        return theme.color.system.success.text
      case 'refunded':
        return theme.color.system.dark[600]
    }
  }};
`

export const ActionButton = styled('button')<{ $variant?: 'danger' | 'ghost' }>`
  padding: 4px 12px;
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  border: 1px solid
    ${(p) =>
      p.$variant === 'danger'
        ? t(p).color.system.error.base
        : t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  background: transparent;
  color: ${(p) =>
    p.$variant === 'danger' ? t(p).color.system.error.text : t(p).color.system.dark[600]};
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${(p) =>
      p.$variant === 'danger' ? t(p).color.system.error[100] : t(p).color.system.base[100]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

// ─── Pagination ──────────────────────────────────────────────────────
export const Pagination = styled('div')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid ${(p) => t(p).color.system.base[200]};
  font-size: 12px;
  color: ${(p) => t(p).color.system.dark[500]};
`

export const PageButtons = styled('div')`
  display: flex;
  gap: 4px;
`

export const PageButton = styled('button')<{ $active?: boolean }>`
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
  border: 1px solid
    ${(p) => (p.$active ? t(p).color.system.primary[300] : t(p).color.system.base[200])};
  background: ${(p) => (p.$active ? t(p).color.system.primary[100] : t(p).color.system.light.base)};
  color: ${(p) => (p.$active ? t(p).color.system.primary.text : t(p).color.system.dark[600])};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${(p) =>
      p.$active ? t(p).color.system.primary[100] : t(p).color.system.base[100]};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

// ─── Virtual customers list ──────────────────────────────────────────
export const VirtualScroll = styled('div')`
  height: 480px;
  overflow-y: auto;
  background: ${(p) => t(p).color.system.light.base};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.large}px;
`

/**
 * Inner spacer that gives the scroll container its full virtual
 * height. The height comes from `virtual.totalSize()` and is set via
 * a `--total-h` CSS variable on the JSX site (`style="--total-h: ..."`)
 * so the value updates without invalidating the styled-component class.
 */
export const VirtualInner = styled('div')`
  width: 100%;
  position: relative;
  height: var(--total-h, 0px);
`

/**
 * Virtualized row.
 *
 * Position is set per-render by the virtualizer via two CSS variables
 * on the JSX site: `--row-h` (item size) and `--row-y` (translateY).
 * This is the canonical virtualization pattern — every visible row
 * shares one styled-component class but receives a unique position
 * vector through CSS variables, so the stylesheet stays small even
 * with 1k+ rows.
 *
 * The `style="..."` on the JSX site looks like an inline style but
 * carries no visual styling — only the two positioning variables.
 */
export const CustomerRow = styled('div')`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: var(--row-h);
  transform: translateY(var(--row-y));
  display: grid;
  grid-template-columns: 32px 1fr 100px 90px 110px 90px;
  gap: 16px;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid ${(p) => t(p).color.system.base[100]};
  font-size: 13px;
  color: ${(p) => t(p).color.system.dark[700]};

  &:hover {
    background: ${(p) => t(p).color.system.base[50]};
  }
`

export const CustomerAvatar = styled('div')`
  width: 28px;
  height: 28px;
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  background: ${(p) => t(p).color.system.primary[100]};
  color: ${(p) => t(p).color.system.primary.text};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
`

export const CustomerName = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`

export const CustomerNameMain = styled('div')`
  font-weight: ${(p) => t(p).fontWeight.medium};
  color: ${(p) => t(p).color.system.dark[800]};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const CustomerNameSub = styled('div')`
  font-size: 11px;
  color: ${(p) => t(p).color.system.dark[400]};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const TierBadge = styled('span')<{ $tier: Customer['tier'] }>`
  padding: 2px 10px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  background: ${(p) => {
    const theme = t(p)
    switch (p.$tier) {
      case 'free':
        return theme.color.system.base[100]
      case 'pro':
        return theme.color.system.info[100]
      case 'enterprise':
        return theme.color.system.primary[100]
    }
  }};
  color: ${(p) => {
    const theme = t(p)
    switch (p.$tier) {
      case 'free':
        return theme.color.system.dark[600]
      case 'pro':
        return theme.color.system.info.text
      case 'enterprise':
        return theme.color.system.primary.text
    }
  }};
`

// ─── Empty / error states ────────────────────────────────────────────
export const StateCard = styled('div')`
  padding: 40px 24px;
  text-align: center;
  color: ${(p) => t(p).color.system.dark[400]};
  font-size: 14px;
`
