import { styled } from '@pyreon/styler'
import { Card, Paragraph, Title } from '@pyreon/ui-components'
import { t } from '../../styles'

/**
 * Styled components for the Invoice Builder section.
 *
 * Two-column layout: form on the left, live HTML preview on the right.
 * The preview pane uses `innerHTML` (set via the styled component's
 * ref) so the document renderer's HTML output can be injected without
 * a sanitization step — the renderer's output is trusted because it
 * comes from `@pyreon/document` directly, not user input.
 */

// ─── Page layout ─────────────────────────────────────────────────────
export const InvoicePage = styled('div')`
  padding: 24px 32px 48px;
  max-width: 1280px;
`

export const Header = styled('header')`
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

export const InvoiceTitle = Title.attrs({ tag: 'h1' }).theme(() => ({
  marginBottom: 4,
}))

export const InvoiceLead = Paragraph.theme((theme) => ({
  fontSize: theme.fontSize.base,
  color: theme.color.system.dark[500],
}))

export const ExportBar = styled('div')`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`

export const ExportButton = styled('button')`
  padding: 8px 14px;
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  background: ${(p) => t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.dark[700]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &:hover:not(:disabled) {
    background: ${(p) => t(p).color.system.base[100]};
    border-color: ${(p) => t(p).color.system.primary[300]};
    color: ${(p) => t(p).color.system.primary.text};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

export const ResetButton = styled('button')`
  padding: 8px 14px;
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  background: transparent;
  color: ${(p) => t(p).color.system.dark[600]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  cursor: pointer;

  &:hover {
    background: ${(p) => t(p).color.system.base[50]};
  }
`

// ─── Two-column layout ───────────────────────────────────────────────
export const Workspace = styled('div')`
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 24px;
  align-items: start;
`

// ─── Form column ─────────────────────────────────────────────────────
export const FormColumn = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

export const Section = Card.theme(() => ({
  padding: 20,
}))

export const SectionTitle = Title.attrs({ tag: 'h3' }).theme((theme) => ({
  marginBottom: 12,
  fontSize: theme.fontSize.medium,
  color: theme.color.system.dark[800],
}))

export const FieldGrid = styled('div')`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
`

export const FieldGroup = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

/** FieldGroup with extra top margin — used between consecutive fields. */
export const SpacedFieldGroup = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
`

/** FieldGroup with extra top margin to push controls below the totals box. */
export const FieldGroupSmTop = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 12px;
`

export const FieldLabel = styled('label')`
  font-size: 11px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  color: ${(p) => t(p).color.system.dark[500]};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

export const TextInput = styled('input')`
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  background: ${(p) => t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.dark[800]};
  outline: none;
  width: 100%;

  &:focus {
    border-color: ${(p) => t(p).color.system.primary[300]};
    box-shadow: 0 0 0 3px ${(p) => t(p).color.system.primary[100]};
  }
`

export const Textarea = styled('textarea')`
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  background: ${(p) => t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.dark[800]};
  outline: none;
  width: 100%;
  resize: vertical;
  min-height: 60px;
  font-family: inherit;
  line-height: 1.5;

  &:focus {
    border-color: ${(p) => t(p).color.system.primary[300]};
    box-shadow: 0 0 0 3px ${(p) => t(p).color.system.primary[100]};
  }
`

export const Select = styled('select')`
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  background: ${(p) => t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.dark[800]};
  cursor: pointer;
  width: 100%;
`

// ─── Line item editor ────────────────────────────────────────────────
export const LineItemRow = styled('div')`
  display: grid;
  grid-template-columns: 1fr 60px 90px 28px;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid ${(p) => t(p).color.system.base[100]};

  &:last-of-type {
    border-bottom: none;
  }
`

export const LineItemInput = styled('input')`
  padding: 6px 8px;
  font-size: 12px;
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  background: ${(p) => t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.dark[800]};
  outline: none;
  width: 100%;

  &:focus {
    border-color: ${(p) => t(p).color.system.primary[300]};
  }
`

export const LineRemove = styled('button')`
  background: transparent;
  border: none;
  color: ${(p) => t(p).color.system.dark[400]};
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 4px;
  border-radius: ${(p) => t(p).borderRadius.base}px;

  &:hover {
    color: ${(p) => t(p).color.system.error.text};
    background: ${(p) => t(p).color.system.error[100]};
  }
`

export const AddLineButton = styled('button')`
  margin-top: 8px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: ${(p) => t(p).fontWeight.medium};
  border: 1px dashed ${(p) => t(p).color.system.base[300]};
  background: transparent;
  color: ${(p) => t(p).color.system.dark[500]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  cursor: pointer;
  width: 100%;

  &:hover {
    border-color: ${(p) => t(p).color.system.primary[300]};
    color: ${(p) => t(p).color.system.primary.text};
    background: ${(p) => t(p).color.system.primary[50]};
  }
`

export const TotalsBox = styled('div')`
  margin-top: 12px;
  padding: 12px;
  background: ${(p) => t(p).color.system.base[50]};
  border-radius: ${(p) => t(p).borderRadius.medium}px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

export const TotalRow = styled('div')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: ${(p) => t(p).color.system.dark[600]};
`

export const GrandTotalRow = styled('div')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: ${(p) => t(p).fontWeight.bold};
  color: ${(p) => t(p).color.system.primary.text};
  padding-top: 8px;
  border-top: 1px solid ${(p) => t(p).color.system.base[200]};
`

// ─── Preview column ──────────────────────────────────────────────────
export const PreviewColumn = styled('div')`
  position: sticky;
  top: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

export const PreviewLabel = styled('div')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  color: ${(p) => t(p).color.system.dark[400]};
`

export const PreviewFrame = styled('div')`
  background: ${(p) => t(p).color.system.light.base};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.large}px;
  padding: 32px;
  min-height: 600px;
  font-family: ${(p) => t(p).fontFamily.base};
  color: ${(p) => t(p).color.system.dark[800]};
  font-size: 13px;
  line-height: 1.5;
  overflow: auto;

  h1, h2, h3, h4, h5, h6 {
    margin: 0 0 8px 0;
  }
  p {
    margin: 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0;
  }
  th, td {
    padding: 8px 10px;
    text-align: left;
    font-size: 12px;
  }
  th {
    background: #1f2937;
    color: #ffffff;
    font-weight: 600;
  }
  tbody tr:nth-child(even) {
    background: #f9fafb;
  }
  hr {
    border: none;
    border-top: 1px solid #e5e7eb;
    margin: 12px 0;
  }
`

// ─── Re-exports ──────────────────────────────────────────────────────
export { Card, Paragraph }
