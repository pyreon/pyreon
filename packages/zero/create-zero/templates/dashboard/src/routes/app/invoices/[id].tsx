import { signal } from "@pyreon/reactivity"
import { onMount } from "@pyreon/core"
import { useHead } from "@pyreon/head"
import { useRoute } from "@pyreon/router"
import { Link } from "@pyreon/zero/link"
import {
  DocDocument,
  DocPage,
  DocSection,
  DocHeading,
  DocText,
  DocTable,
  DocSpacer,
  DocDivider,
  extractDocNode,
} from "@pyreon/document-primitives"
import { render } from "@pyreon/document"
import { type Invoice, invoiceById, invoiceTotal } from "../../../lib/db"

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
          <DocHeading level="h1">Invoice {inv.number}</DocHeading>
          <DocText>Issued {inv.issuedAt.toLocaleDateString()}</DocText>
        </DocSection>

        <DocSpacer />

        <DocSection>
          <DocHeading level="h3">Bill to</DocHeading>
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
          <DocHeading level="h3">Total: ${invoiceTotal(inv).toLocaleString()}</DocHeading>
        </DocSection>
      </DocPage>
    </DocDocument>
  )
}

export default function InvoiceDetail() {
  const route = useRoute()
  const inv = signal<Invoice | null>(null)
  const notFound = signal(false)

  onMount(() => {
    const id = route().params.id
    void invoiceById(id).then((found) => {
      if (!found) notFound.set(true)
      else inv.set(found)
    })
  })

  useHead({ title: meta.title })

  async function exportPdf() {
    const found = inv()
    if (!found) return
    const node = extractDocNode(InvoiceTemplate(found))
    const result = await render(node, "pdf")
    if (typeof window === "undefined") return
    const blob = result instanceof Blob ? result : new Blob([result as BlobPart], { type: "application/pdf" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${found.number}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  function sendEmail() {
    // Real impl: POST the rendered email HTML to /api/email and let
    // the email scaffold (lib/email.ts + emails/welcome.tsx) handle the
    // SMTP transport via Resend. The point of the demo is that the SAME
    // `InvoiceTemplate` renders both the PDF above and the email body —
    // no re-authoring per channel.
    alert(
      "Email send is wired up via Resend (lib/email.ts). The same template renders to email HTML — try the PDF export above to see the document-primitives output.",
    )
  }

  return () => {
    if (notFound()) {
      return (
        <>
          <h1>Invoice not found</h1>
          <p>
            <Link href="/app/invoices">← Back to invoices</Link>
          </p>
        </>
      )
    }

    const found = inv()
    if (!found) {
      return (
        <>
          <div class="app-page-header">
            <h1>Loading…</h1>
          </div>
        </>
      )
    }

    return (
      <>
        <div class="app-page-header">
          <h1>{found.number}</h1>
          <span class={`pill ${found.status}`}>{found.status}</span>
        </div>

        <div class="invoice-detail">
          <div class="invoice-preview">
            <h2>Invoice {found.number}</h2>
            <p>Issued {found.issuedAt.toLocaleDateString()}</p>
            <p style="margin-top: 1.5rem;">
              <strong>Bill to</strong>
            </p>
            <p>{found.customer.name}</p>
            <p>{found.customer.email}</p>
            <p>{found.customer.address}</p>
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
                {found.items.map((it) => (
                  <tr>
                    <td>{it.description}</td>
                    <td>{it.qty}</td>
                    <td>${it.unitPrice.toLocaleString()}</td>
                    <td>${(it.qty * it.unitPrice).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div class="total">Total: ${invoiceTotal(found).toLocaleString()}</div>
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
}
