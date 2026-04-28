import { signal } from "@pyreon/reactivity"
import { onMount } from "@pyreon/core"
import { useHead } from "@pyreon/head"
import { Link } from "@pyreon/zero/link"
import { type Invoice, invoiceTotal, listInvoices } from "../../../lib/db"

export const meta = { title: "Invoices" }

export default function Invoices() {
  useHead({ title: meta.title })

  const invoices = signal<Invoice[]>([])

  onMount(() => {
    void listInvoices().then((i) => invoices.set(i))
  })

  return (
    <>
      <div class="app-page-header">
        <h1>Invoices</h1>
        <button class="btn btn-primary">New invoice</button>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>Number</th>
            <th>Customer</th>
            <th>Total</th>
            <th>Status</th>
            <th>Issued</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {() =>
            invoices().map((inv) => (
              <tr>
                <td>
                  <Link href={`/app/invoices/${inv.id}`}>{inv.number}</Link>
                </td>
                <td>{inv.customer.name}</td>
                <td>${invoiceTotal(inv).toLocaleString()}</td>
                <td>
                  <span class={`pill ${inv.status}`}>{inv.status}</span>
                </td>
                <td>{inv.issuedAt.toLocaleDateString()}</td>
                <td>
                  <Link href={`/app/invoices/${inv.id}`} class="btn btn-secondary">
                    Open →
                  </Link>
                </td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </>
  )
}
