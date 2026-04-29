import { computed, signal } from "@pyreon/reactivity"
import { onMount } from "@pyreon/core"
import { useHead } from "@pyreon/head"
import { type Invoice, invoiceTotal, listInvoices, listUsers, type User } from "../../lib/db"

export const meta = { title: "Overview" }

export default function Dashboard() {
  useHead({ title: meta.title })

  const users = signal<User[]>([])
  const invoices = signal<Invoice[]>([])

  onMount(() => {
    void Promise.all([listUsers(), listInvoices()]).then(([u, i]) => {
      users.set(u)
      invoices.set(i)
    })
  })

  const revenue = computed(() =>
    invoices()
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + invoiceTotal(i), 0),
  )
  const outstanding = computed(() =>
    invoices()
      .filter((i) => i.status === "pending")
      .reduce((sum, i) => sum + invoiceTotal(i), 0),
  )

  return (
    <>
      <div class="app-page-header">
        <h1>Overview</h1>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="label">Users</div>
          <div class="value">{() => users().length}</div>
          <div class="delta">+2 this month</div>
        </div>
        <div class="stat-card">
          <div class="label">Invoices</div>
          <div class="value">{() => invoices().length}</div>
          <div class="delta">{() => invoices().filter((i) => i.status === "paid").length} paid</div>
        </div>
        <div class="stat-card">
          <div class="label">Revenue</div>
          <div class="value">{() => `$${revenue().toLocaleString()}`}</div>
          <div class="delta">YTD</div>
        </div>
        <div class="stat-card">
          <div class="label">Outstanding</div>
          <div class="value">{() => `$${outstanding().toLocaleString()}`}</div>
          <div class="delta" style="color: var(--c-warning);">
            {() => invoices().filter((i) => i.status === "pending").length} pending
          </div>
        </div>
      </div>

      <h2 style="font-size: 1.125rem; margin-bottom: 0.75rem;">Recent invoices</h2>
      <table class="data-table">
        <thead>
          <tr>
            <th>Number</th>
            <th>Customer</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {() =>
            invoices()
              .slice(0, 5)
              .map((inv) => (
                <tr>
                  <td>{inv.number}</td>
                  <td>{inv.customer.name}</td>
                  <td>${invoiceTotal(inv).toLocaleString()}</td>
                  <td>
                    <span class={`pill ${inv.status}`}>{inv.status}</span>
                  </td>
                </tr>
              ))
          }
        </tbody>
      </table>
    </>
  )
}
