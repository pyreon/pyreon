/**
 * Styled atoms used across the dashboard. Each one exercises a different
 * slice of the styler → unistyle path:
 *
 * - Panel / Card / StatCard / Button / Input — dynamic styled components
 *   that read the theme via interpolation functions. These hit the
 *   styler resolver on every theme change.
 * - StatValue uses a color-by-state rule via a transient prop.
 */
import { styled } from '@pyreon/styler'
import type { Theme } from '../theme'

type Props = { theme?: Theme }

export const Shell = styled('div')<Props>`
  min-height: 100vh;
  background: ${(p) => p.theme?.bg};
  color: ${(p) => p.theme?.fg};
  font-family: inherit;
`

export const Header = styled('header')<Props>`
  padding: 16px 24px;
  background: ${(p) => p.theme?.panel};
  border-bottom: 1px solid ${(p) => p.theme?.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
`

export const Title = styled('h1')<Props>`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: ${(p) => p.theme?.fg};
`

export const Accent = styled('span')<Props>`
  color: ${(p) => p.theme?.accent};
`

export const Section = styled('section')<Props>`
  padding: 24px;
  border-bottom: 1px solid ${(p) => p.theme?.border};
`

export const SectionTitle = styled('h2')<Props>`
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${(p) => p.theme?.muted};
`

export const Grid = styled('div')`
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
`

export const Card = styled('article')<Props>`
  background: ${(p) => p.theme?.panel};
  border: 1px solid ${(p) => p.theme?.border};
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`

export const CardLabel = styled('div')<Props>`
  color: ${(p) => p.theme?.muted};
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`

export const CardValue = styled('div')<Props>`
  color: ${(p) => p.theme?.fg};
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`

export const CardDelta = styled('div')<Props & { $dir?: 'up' | 'down' }>`
  color: ${(p) => (p.$dir === 'up' ? p.theme?.ok : p.theme?.err)};
  font-size: 11px;
  font-variant-numeric: tabular-nums;
`

export const Button = styled('button')<Props>`
  background: ${(p) => p.theme?.accent};
  color: ${(p) => p.theme?.bg};
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font: inherit;
  font-weight: 500;
  cursor: pointer;
`

export const GhostButton = styled('button')<Props>`
  background: transparent;
  color: ${(p) => p.theme?.fg};
  border: 1px solid ${(p) => p.theme?.border};
  border-radius: 6px;
  padding: 6px 12px;
  font: inherit;
  cursor: pointer;
`

export const Input = styled('input')<Props>`
  background: ${(p) => p.theme?.bg};
  color: ${(p) => p.theme?.fg};
  border: 1px solid ${(p) => p.theme?.border};
  border-radius: 6px;
  padding: 6px 10px;
  font: inherit;
  width: 100%;
  box-sizing: border-box;
`

export const Row = styled('div')`
  display: flex;
  gap: 12px;
  align-items: center;
`

export const Table = styled('table')<Props>`
  width: 100%;
  border-collapse: collapse;
  background: ${(p) => p.theme?.panel};
  border: 1px solid ${(p) => p.theme?.border};
  border-radius: 8px;
  overflow: hidden;
`

export const Th = styled('th')<Props>`
  text-align: left;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${(p) => p.theme?.muted};
  border-bottom: 1px solid ${(p) => p.theme?.border};
`

export const Td = styled('td')<Props>`
  padding: 8px 12px;
  color: ${(p) => p.theme?.fg};
  border-bottom: 1px solid ${(p) => p.theme?.border};
  font-variant-numeric: tabular-nums;
`

export const ModalBackdrop = styled('div')`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
`

export const ModalBody = styled('div')<Props>`
  background: ${(p) => p.theme?.panel};
  border: 1px solid ${(p) => p.theme?.border};
  border-radius: 8px;
  padding: 24px;
  min-width: 320px;
  max-width: 480px;
`

export const Field = styled('label')<Props>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: ${(p) => p.theme?.muted};
`
