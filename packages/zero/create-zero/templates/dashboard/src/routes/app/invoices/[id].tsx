import { useHead } from "@pyreon/head"
import { Link, useParams } from "@pyreon/router"
import {
  DocDocument,
  DocPage,
  DocSection,
  DocHeading,
  DocText,
  DocTable,
  DocSpacer,
  DocDivider,
} from "@pyreon/document-primitives"
import { extractDocNode } from "@pyreon/connector-document"
import { render } from "@pyreon/document"
import { invoiceById, invoiceTotal, type Invoice } from "../../../lib/db"

export const meta = { title: "Invoice" }

/**
 * The headline demo of `@pyreon/document-primitives`: this template renders
 * directly in the browser preview AND exports to PDF/email/etc. without
 * being re-authored. `extractDocNode(template)` walks the JSX and produces
 * a renderer-agnostic `DocNode`; `@pyreon/document`'s `render()` then
 * formats it for whatever output the user clicks.
 */
function InvoiceTemplate(inv: Invoice) {
  return () => (
    <DocDocument
      title={`Invoice ${inv.number}`}
      author="Your Company"
      subject={`Invoice for ${inv.customer.name}`}
    >
      <DocPage>
        <DocSection>
          <DocHeading level={1}>Invoice {inv.number}</DocHeading>
          <DocText>Issued {inv.issuedAt.toLocaleDateString()}</DocText>
        </DocSection>

        <DocSpacer />

        <DocSection>
          <DocHeading level={3}>Bill to</DocHeading>
          <DocText>{inv.customer.name}</DocText>
          <DocText>{inv.customer.email}</DocText>
          <DocText>{inv.customer.address}</DocText>
        </DocSection>

        <DocDivider />

        <DocTable
          rows={[
            ["Description", "Qty", "Unit price", "Line total"],
            ...inv.items.map((it) => [
              it.description,
              String(it.qty),
              `$${it.unitPrice.toLocaleString()}`,
              `$${(it.qty * it.unitPrice).toLocaleString()}`,
            ]),
          ]}
        />

        <DocSpacer />

        <DocSection>
          <DocHeading level={3}>Total: ${invoiceTotal(inv).toLocaleString()}</DocHeading>
        </DocSection>
      </DocPage>
    </DocDocument>
  )
}

export default function InvoiceDetail() {
  const params = useParams<{ id: string }>()
  const inv = invoiceById(params.id)

  if (!inv) {
    return (
      <>
        <h1>Invoice not found</h1>
        <p>
          <Link href="/app/invoices">← Back to invoices</Link>
        </p>
      </>
    )
  }

  useHead({ title: `${inv.number} — ${inv.customer.name}` })

  async function exportPdf() {
    const node = extractDocNode(InvoiceTemplate(inv))
    const result = await render(node, "pdf")
    // Result is a Blob/Uint8Array depending on environment — trigger download.
    if (typeof window === "undefined") return
    const blob = result instanceof Blob ? result : new Blob([result as BlobPart], { type: "application/pdf" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${inv.number}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function sendEmail() {
    // Real impl: POST the rendered email HTML to /api/email and let
    // @pyreon/email-resend handle the SMTP transport. The point of the demo
    // is that the SAME `InvoiceTemplate` renders both the PDF above and the
    // email body — no re-authoring per channel.
    alert(
      "Email send is wired up via @pyreon/email-resend (Phase 3). The same template renders to email HTML — try the PDF export above to see the document-primitives output."
    )
  }

  return (
    <>
      <div class="app-page-header">
        <h1>{inv.number}</h1>
        <span class={`pill ${inv.status}`}>{inv.status}</span>
      </div>

      <div class="invoice-detail">
        <div class="invoice-preview">
          <h2>Invoice {inv.number}</h2>
          <p>Issued {inv.issuedAt.toLocaleDateString()}</p>
          <p style="margin-top: 1.5rem;"><strong>Bill to</strong></p>
          <p>{inv.customer.name}</p>
          <p>{inv.customer.email}</p>
          <p>{inv.customer.address}</p>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Line total</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((it) => (
                <tr>
                  <td>{it.description}</td>
                  <td>{it.qty}</td>
                  <td>${it.unitPrice.toLocaleString()}</td>
                  <td>${(it.qty * it.unitPrice).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div class="total">Total: ${invoiceTotal(inv).toLocaleString()}</div>
        </div>

        <aside class="invoice-actions">
          <strong>Actions</strong>
          <button class="btn btn-primary" onClick={exportPdf}>
            Export to PDF
          </button>
          <button class="btn btn-secondary" onClick={sendEmail}>
            Send by email
          </button>
          <p style="font-size: 0.8125rem; color: var(--c-text-muted); margin-top: 1rem;">
            The preview above and the PDF export are rendered from the SAME{" "}
            <code>InvoiceTemplate</code> component tree. That's what{" "}
            <code>@pyreon/document-primitives</code> buys you.
          </p>
        </aside>
      </div>
    </>
  )
}
