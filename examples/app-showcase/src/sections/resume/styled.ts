import { styled } from '@pyreon/styler'
import { Card, Paragraph, Title } from '@pyreon/ui-components'
import { t } from '../../styles'

/**
 * Styled components for the Resume section.
 *
 * Two-column layout: editor form on the left, the actual document
 * primitives tree on the right. The right column has NO custom
 * styling — it just hosts the `<ResumeTemplate>` component, which
 * uses `@pyreon/document-primitives` to render the resume in the
 * browser AND export to PDF/DOCX.
 */

// ─── Page layout ─────────────────────────────────────────────────────
export const ResumePage = styled('div')`
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

export const ResumeTitle = Title.attrs({ tag: 'h1' }).theme(() => ({
  marginBottom: 4,
}))

export const ResumeLead = Paragraph.theme((theme) => ({
  fontSize: theme.fontSize.base,
  color: theme.color.system.dark[500],
}))

export const ToolbarRow = styled('div')`
  display: flex;
  align-items: center;
  gap: 8px;
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

// ─── Two-column workspace ────────────────────────────────────────────
export const Workspace = styled('div')`
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 24px;
  align-items: start;
`

export const FormColumn = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

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

/**
 * Frame around the document preview. The document-primitives render
 * their own styles inside; this wrapper just provides a card-like
 * container with print margins.
 */
export const PreviewFrame = styled('div')`
  background: ${(p) => t(p).color.system.light.base};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.large}px;
  padding: 48px 56px;
  min-height: 720px;
  font-family: ${(p) => t(p).fontFamily.base};
  color: ${(p) => t(p).color.system.dark[800]};
`

// ─── Form sections ───────────────────────────────────────────────────
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

export const SpacedFieldGroup = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
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

// ─── Repeating entry editor ──────────────────────────────────────────
export const EntryRow = styled('div')`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
  border-bottom: 1px solid ${(p) => t(p).color.system.base[100]};

  &:last-of-type {
    border-bottom: none;
  }
`

export const EntryHeader = styled('div')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`

export const EntryRoleInput = styled('input')`
  flex: 1;
  padding: 6px 8px;
  font-size: 13px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  background: ${(p) => t(p).color.system.light.base};
  color: ${(p) => t(p).color.system.dark[800]};
  outline: none;

  &:focus {
    border-color: ${(p) => t(p).color.system.primary[300]};
  }
`

export const EntryRemove = styled('button')`
  background: transparent;
  border: none;
  color: ${(p) => t(p).color.system.dark[400]};
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 4px 8px;
  border-radius: ${(p) => t(p).borderRadius.base}px;

  &:hover {
    color: ${(p) => t(p).color.system.error.text};
    background: ${(p) => t(p).color.system.error[100]};
  }
`

export const AddEntryButton = styled('button')`
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

export { Card }
