import type { Invoice, LineItem } from './types'

/**
 * Seed invoice with realistic line items so the demo's preview pane
 * looks populated on first load. The user can edit any field via the
 * form on the left.
 */

export const SEED_LINE_ITEMS: LineItem[] = [
  { id: 'li-1', description: 'Pyreon framework consulting (Q2)', quantity: 40, unitPrice: 175 },
  { id: 'li-2', description: 'Component library audit + recommendations', quantity: 1, unitPrice: 1200 },
  { id: 'li-3', description: 'Performance tuning workshop (full day)', quantity: 1, unitPrice: 2400 },
  { id: 'li-4', description: 'Migration playbook (custom)', quantity: 1, unitPrice: 800 },
]

export const SEED_INVOICE: Invoice = {
  number: 'INV-2026-0042',
  issueDate: '2026-04-08',
  dueDate: '2026-05-08',
  currency: 'USD',
  from: {
    name: 'Pyreon Studio',
    email: 'billing@pyreon.dev',
    address: ['1500 Coastal Highway', 'Suite 200', 'Lewes, DE 19958', 'United States'],
  },
  to: {
    name: 'Acme Engineering',
    email: 'ap@acme-engineering.example',
    address: ['42 Galaxy Way', 'Brooklyn, NY 11201', 'United States'],
  },
  items: SEED_LINE_ITEMS,
  taxRate: 0.0,
  notes: 'Payment terms: net 30. Wire details on the second page of the contract.',
}

/** Compute subtotal/tax/total from a line item array — pure helper. */
export function totals(items: LineItem[], taxRate: number) {
  const subtotal = items.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  const tax = subtotal * taxRate
  const total = subtotal + tax
  return { subtotal, tax, total }
}

/** Format an amount as currency for the locale. */
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Format an ISO date as `Mon DD, YYYY`. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso))
}
