/**
 * Types for the invoice section.
 *
 * The invoice mirrors a typical small-business invoice: a sender,
 * a recipient, a list of line items, and tax + total computed from
 * the line items. Everything is plain data — the document template
 * reads from this shape and produces a DocNode tree that
 * @pyreon/document renders to PDF, DOCX, HTML, and Markdown.
 */

export interface Party {
  name: string
  email: string
  /** Multi-line address. Each entry renders as its own line. */
  address: string[]
}

export interface LineItem {
  id: string
  description: string
  quantity: number
  /** Unit price in the invoice currency. */
  unitPrice: number
}

export interface Invoice {
  number: string
  /** ISO date the invoice was issued. */
  issueDate: string
  /** ISO date the invoice is due. */
  dueDate: string
  currency: 'USD' | 'EUR' | 'GBP'
  from: Party
  to: Party
  items: LineItem[]
  /** Tax rate as a fraction (e.g. 0.21 for 21%). */
  taxRate: number
  /** Optional notes printed at the bottom. */
  notes?: string
}
