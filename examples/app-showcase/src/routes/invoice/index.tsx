import { Toaster } from '@pyreon/toast'
import { ExportButtons } from '../../sections/invoice/ExportButtons'
import { InvoiceForm } from '../../sections/invoice/InvoiceForm'
import { LivePreview } from '../../sections/invoice/LivePreview'
import { useInvoice } from '../../sections/invoice/store'
import {
  FormColumn,
  Header,
  HeaderText,
  InvoiceLead,
  InvoicePage,
  InvoiceTitle,
  PreviewColumn,
  ResetButton,
  Workspace,
} from '../../sections/invoice/styled'

/**
 * Invoice Builder section.
 *
 * Two-column workspace: the form on the left edits the invoice in a
 * single signal-backed store, the right column shows a live HTML
 * preview of the rendered document. Export buttons in the header
 * generate HTML, Markdown, PDF, and DOCX files via @pyreon/document
 * and trigger a browser download.
 *
 * Demonstrates:
 *   • @pyreon/document      — same template tree drives every output
 *                              format. The PDF and DOCX renderers are
 *                              lazy-loaded by the framework on first
 *                              click, so the section's main chunk
 *                              stays small.
 *   • @pyreon/store         — invoice store with derived totals
 *                              computed
 *   • @pyreon/reactivity    — `effect()` rebuilds the preview HTML on
 *                              every store change
 *   • @pyreon/toast         — loading → success/error feedback on
 *                              export downloads
 *
 * Note: this section uses `@pyreon/document`'s plain factory functions
 * (Document, Page, Heading, Text, …) rather than `@pyreon/document-primitives`'s
 * rocketstyle bridge. Both work — the bridge lets you use the SAME
 * component tree for browser rendering and document export, while
 * the plain factory approach is simpler when the document and the
 * editor are different shapes (form vs document).
 */
export default function InvoiceRoute() {
  const inv = useInvoice()

  return (
    <InvoicePage>
      <Header>
        <HeaderText>
          <InvoiceTitle>Invoice Builder</InvoiceTitle>
          <InvoiceLead>
            Edit the invoice on the left — the preview on the right updates live. Export to
            HTML, Markdown, PDF, or DOCX with one click. Same template tree feeds every format.
          </InvoiceLead>
        </HeaderText>
        <ResetButton type="button" onClick={() => inv.store.reset()}>
          Reset to seed
        </ResetButton>
      </Header>

      <ExportButtons />

      <Workspace>
        <FormColumn>
          <InvoiceForm />
        </FormColumn>
        <PreviewColumn>
          <LivePreview />
        </PreviewColumn>
      </Workspace>

      <Toaster position="bottom-right" />
    </InvoicePage>
  )
}

export const meta = {
  title: 'Invoice Builder — Pyreon App Showcase',
}
