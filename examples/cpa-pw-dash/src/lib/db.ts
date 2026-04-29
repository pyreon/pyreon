/**
 * In-memory data layer. Holds users + invoices in module state on the
 * server — every dev-server restart resets the data.
 *
 * The exported types (`User`, `Invoice`) and functions (`listUsers`,
 * `listInvoices`, `invoiceById`, `invoiceTotal`) are the contract routes
 * consume. Run `create-pyreon-app --integrations supabase` to overwrite
 * this file with a Supabase-backed implementation that returns the same
 * row shapes — routes don't need to change.
 */

export interface User {
  id: string
  email: string
  name: string
  role: "admin" | "member"
  createdAt: Date
}

export interface InvoiceItem {
  description: string
  qty: number
  unitPrice: number
}

export interface Invoice {
  id: string
  number: string
  customer: { name: string; email: string; address: string }
  items: InvoiceItem[]
  status: "draft" | "pending" | "paid"
  issuedAt: Date
}

const users: User[] = [
  {
    id: "u_1",
    email: "demo@example.com",
    name: "Demo User",
    role: "admin",
    createdAt: new Date("2026-01-04"),
  },
  {
    id: "u_2",
    email: "alice@example.com",
    name: "Alice Jensen",
    role: "member",
    createdAt: new Date("2026-02-11"),
  },
  {
    id: "u_3",
    email: "bob@example.com",
    name: "Bob Patel",
    role: "member",
    createdAt: new Date("2026-03-19"),
  },
]

const invoices: Invoice[] = [
  {
    id: "inv_1001",
    number: "INV-1001",
    customer: {
      name: "Acme Corp",
      email: "ap@acme.com",
      address: "100 Main St, Springfield",
    },
    items: [
      { description: "Pro plan — annual", qty: 1, unitPrice: 1188 },
      { description: "Setup assistance", qty: 2, unitPrice: 250 },
    ],
    status: "paid",
    issuedAt: new Date("2026-04-01"),
  },
  {
    id: "inv_1002",
    number: "INV-1002",
    customer: {
      name: "Globex Industries",
      email: "billing@globex.io",
      address: "55 Tech Plaza, Capital City",
    },
    items: [{ description: "Team plan — quarterly", qty: 1, unitPrice: 297 }],
    status: "pending",
    issuedAt: new Date("2026-04-15"),
  },
  {
    id: "inv_1003",
    number: "INV-1003",
    customer: {
      name: "Initech LLC",
      email: "finance@initech.com",
      address: "9 TPS Way, Houston",
    },
    items: [
      { description: "Enterprise plan — monthly", qty: 1, unitPrice: 599 },
      { description: "Priority support", qty: 1, unitPrice: 199 },
    ],
    status: "draft",
    issuedAt: new Date("2026-04-22"),
  },
]

export async function listUsers(): Promise<User[]> {
  return [...users]
}

export async function listInvoices(): Promise<Invoice[]> {
  return [...invoices]
}

export async function invoiceById(id: string): Promise<Invoice | undefined> {
  return invoices.find((i) => i.id === id)
}

export function invoiceTotal(inv: Invoice): number {
  return inv.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)
}
