import { styled } from '@pyreon/styler'
import { Card, Paragraph, Title } from '@pyreon/ui-components'
import { t } from '../../styles'

/**
 * Styled components for the Shop section.
 *
 * Same convention as the rest of the app:
 *   • Raw HTML elements    → `styled('tag')` reading colors via `t(p)`
 *   • Pyreon ui-components → extend via the rocketstyle chain
 */

// ─── Page layout ─────────────────────────────────────────────────────
export const ShopPage = styled('div')`
  padding: 24px 32px 48px;
  max-width: 1200px;
`

export const ShopHeader = styled('header')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
`

export const HeaderText = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

export const ShopTitle = Title.attrs({ tag: 'h1' }).theme(() => ({
  marginBottom: 4,
}))

export const ShopLead = Paragraph.theme((theme) => ({
  fontSize: theme.fontSize.base,
  color: theme.color.system.dark[500],
}))

// ─── Toolbar ─────────────────────────────────────────────────────────
export const Toolbar = styled('div')`
  display: flex;
  align-items: center;
  gap: 8px;
`

export const SwitcherGroup = styled('div')`
  display: flex;
  gap: 4px;
  padding: 4px;
  background: ${(p) => t(p).color.system.base[100]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
`

export const SwitcherButton = styled('button')<{ $active?: boolean }>`
  padding: 6px 12px;
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  border: none;
  border-radius: ${(p) => t(p).borderRadius.base}px;
  cursor: pointer;
  background: ${(p) => (p.$active ? t(p).color.system.light.base : 'transparent')};
  color: ${(p) => (p.$active ? t(p).color.system.primary.text : t(p).color.system.dark[600])};
  box-shadow: ${(p) => (p.$active ? t(p).shadows.small : 'none')};
  display: inline-flex;
  align-items: center;
  gap: 6px;
`

export const CartButton = styled('button')`
  padding: 8px 16px;
  font-size: 13px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  border: none;
  background: ${(p) => t(p).color.system.primary.base};
  color: ${(p) => t(p).color.system.light.base};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;

  &:hover {
    background: ${(p) => t(p).color.system.primary[800]};
  }
`

export const CartBadge = styled('span')`
  background: ${(p) => t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.primary.text};
  padding: 1px 8px;
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  font-size: 11px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
`

// ─── Filters bar ─────────────────────────────────────────────────────
export const Filters = styled('div')`
  display: flex;
  gap: 6px;
  margin-bottom: 24px;
  flex-wrap: wrap;
`

export const FilterChip = styled('button')<{ $active?: boolean }>`
  padding: 6px 14px;
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  border: 1px solid
    ${(p) =>
      p.$active ? t(p).color.system.primary[300] : t(p).color.system.base[200]};
  background: ${(p) => (p.$active ? t(p).color.system.primary[100] : t(p).color.system.light.base)};
  color: ${(p) => (p.$active ? t(p).color.system.primary.text : t(p).color.system.dark[600])};
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  cursor: pointer;

  &:hover {
    background: ${(p) =>
      p.$active ? t(p).color.system.primary[100] : t(p).color.system.base[50]};
  }
`

// ─── Product grid ────────────────────────────────────────────────────
export const ProductGrid = styled('div')`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
`

export const ProductCard = styled('article')`
  display: flex;
  flex-direction: column;
  background: ${(p) => t(p).color.system.light.base};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.large}px;
  overflow: hidden;
  transition: ${(p) => t(p).transition.base};

  &:hover {
    border-color: ${(p) => t(p).color.system.primary[300]};
    transform: translateY(-1px);
    box-shadow: ${(p) => t(p).shadows.small};
  }
`

export const ProductImage = styled('div')`
  background: ${(p) => t(p).color.system.base[50]};
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 56px;
`

export const ProductBody = styled('div')`
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
`

export const ProductCategory = styled('span')`
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${(p) => t(p).color.system.dark[400]};
  font-weight: ${(p) => t(p).fontWeight.semibold};
`

export const ProductTitle = styled('h3')`
  font-size: 14px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  color: ${(p) => t(p).color.system.dark[800]};
  margin: 0;
  line-height: 1.3;
`

export const ProductDesc = styled('p')`
  font-size: 12px;
  color: ${(p) => t(p).color.system.dark[500]};
  line-height: 1.5;
  margin: 0;
  flex: 1;
`

export const ProductFooter = styled('div')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
`

export const ProductPrice = styled('div')`
  font-size: 16px;
  font-weight: ${(p) => t(p).fontWeight.bold};
  color: ${(p) => t(p).color.system.dark[800]};
`

export const AddButton = styled('button')`
  padding: 6px 12px;
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  border: none;
  background: ${(p) => t(p).color.system.primary.base};
  color: ${(p) => t(p).color.system.light.base};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  cursor: pointer;

  &:hover {
    background: ${(p) => t(p).color.system.primary[800]};
  }
`

// ─── Cart drawer ─────────────────────────────────────────────────────
export const Backdrop = styled('div')<{ $open: boolean }>`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  opacity: ${(p) => (p.$open ? '1' : '0')};
  pointer-events: ${(p) => (p.$open ? 'auto' : 'none')};
  transition: opacity 0.18s ease-out;
  z-index: 100;
`

export const Drawer = styled('aside')<{ $open: boolean }>`
  position: fixed;
  top: 0;
  right: 0;
  width: 400px;
  max-width: 95vw;
  height: 100vh;
  background: ${(p) => t(p).color.system.light.base};
  border-left: 1px solid ${(p) => t(p).color.system.base[200]};
  box-shadow: -8px 0 24px rgba(15, 23, 42, 0.08);
  z-index: 101;
  display: flex;
  flex-direction: column;
  transform: translateX(${(p) => (p.$open ? '0' : '100%')});
  transition: transform 0.22s ease-out;
`

export const DrawerHeader = styled('header')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid ${(p) => t(p).color.system.base[200]};
`

export const DrawerTitle = styled('h2')`
  font-size: 16px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  color: ${(p) => t(p).color.system.dark[800]};
  margin: 0;
`

export const CloseButton = styled('button')`
  background: transparent;
  border: none;
  color: ${(p) => t(p).color.system.dark[400]};
  font-size: 22px;
  line-height: 1;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: ${(p) => t(p).borderRadius.base}px;

  &:hover {
    background: ${(p) => t(p).color.system.base[100]};
    color: ${(p) => t(p).color.system.dark[800]};
  }
`

export const DrawerBody = styled('div')`
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
`

export const CartLineRow = styled('div')`
  display: grid;
  grid-template-columns: 48px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid ${(p) => t(p).color.system.base[100]};

  &:last-child {
    border-bottom: none;
  }
`

export const LineThumb = styled('div')`
  width: 48px;
  height: 48px;
  background: ${(p) => t(p).color.system.base[50]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
`

export const LineInfo = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`

export const LineTitle = styled('div')`
  font-size: 13px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  color: ${(p) => t(p).color.system.dark[800]};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const LineQtyRow = styled('div')`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: ${(p) => t(p).color.system.dark[500]};
`

export const QtyButton = styled('button')`
  width: 22px;
  height: 22px;
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  background: ${(p) => t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.dark[600]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;

  &:hover {
    background: ${(p) => t(p).color.system.base[100]};
  }
`

export const RemoveLink = styled('button')`
  background: transparent;
  border: none;
  font-size: 11px;
  color: ${(p) => t(p).color.system.error.text};
  cursor: pointer;
  padding: 2px 6px;
  border-radius: ${(p) => t(p).borderRadius.base}px;

  &:hover {
    background: ${(p) => t(p).color.system.error[100]};
  }
`

export const LineTotal = styled('div')`
  font-size: 13px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  color: ${(p) => t(p).color.system.dark[800]};
  text-align: right;
`

export const EmptyDrawer = styled('div')`
  padding: 40px 20px;
  text-align: center;
  color: ${(p) => t(p).color.system.dark[400]};
  font-size: 14px;
`

export const DrawerFooter = styled('footer')`
  border-top: 1px solid ${(p) => t(p).color.system.base[200]};
  padding: 20px 24px;
  background: ${(p) => t(p).color.system.base[50]};
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const SubtotalRow = styled('div')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  color: ${(p) => t(p).color.system.dark[700]};
`

export const SubtotalAmount = styled('span')`
  font-size: 18px;
  font-weight: ${(p) => t(p).fontWeight.bold};
  color: ${(p) => t(p).color.system.dark[800]};
`

export const CheckoutButton = styled('button')`
  padding: 12px 18px;
  font-size: 14px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  border: none;
  background: ${(p) => t(p).color.system.primary.base};
  color: ${(p) => t(p).color.system.light.base};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${(p) => t(p).color.system.primary[800]};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

// ─── Re-exports for component-level use ──────────────────────────────
export { Card }
