import {
  Column,
  Divider,
  Document,
  Heading,
  Page,
  Row,
  Section,
  Spacer,
  Table,
  Text,
  type DocNode,
} from '@pyreon/document'
import { formatCurrency, formatDate, totals } from './data/seed'
import type { Invoice } from './data/types'

/**
 * Build a `DocNode` tree from an `Invoice` value.
 *
 * The same template feeds every output format — `render(node, 'pdf')`,
 * `render(node, 'docx')`, `render(node, 'html')`, `render(node, 'md')`,
 * etc. all consume the same tree.
 *
 * The function is plain — no JSX, no signals — so it can run inside
 * a render-time accessor in the live preview AND inside the export
 * button click handlers without any state-tracking surprises.
 */
export function buildInvoiceDoc(invoice: Invoice): DocNode {
  const { subtotal, tax, total } = totals(invoice.items, invoice.taxRate)
  const fmt = (amount: number) => formatCurrency(amount, invoice.currency)

  return Document(
    {
      title: `Invoice ${invoice.number}`,
      author: invoice.from.name,
      subject: `Invoice from ${invoice.from.name} to ${invoice.to.name}`,
      children: [
        Page({
          size: 'A4',
          margin: 48,
          children: [
            // ── Header: company name + invoice number ──────────────────
            Row({
              gap: 16,
              children: [
                Column({
                  width: '60%',
                  children: [
                    Heading({ level: 1, children: invoice.from.name }),
                    Text({
                      size: 11,
                      color: '#6b7280',
                      children: invoice.from.email,
                    }),
                  ],
                }),
                Column({
                  width: '40%',
                  children: [
                    Heading({
                      level: 2,
                      align: 'right',
                      color: '#4338ca',
                      children: 'INVOICE',
                    }),
                    Text({
                      align: 'right',
                      size: 11,
                      color: '#6b7280',
                      children: invoice.number,
                    }),
                  ],
                }),
              ],
            }),

            Spacer({ height: 24 }),
            Divider({ color: '#e5e7eb' }),
            Spacer({ height: 24 }),

            // ── Bill-from / Bill-to / Dates ────────────────────────────
            Row({
              gap: 16,
              children: [
                Column({
                  width: '33%',
                  children: [
                    Text({
                      size: 10,
                      bold: true,
                      color: '#6b7280',
                      children: 'BILL FROM',
                    }),
                    Spacer({ height: 4 }),
                    Text({ bold: true, children: invoice.from.name }),
                    ...invoice.from.address.map((line) =>
                      Text({ size: 11, color: '#6b7280', children: line }),
                    ),
                  ],
                }),
                Column({
                  width: '33%',
                  children: [
                    Text({
                      size: 10,
                      bold: true,
                      color: '#6b7280',
                      children: 'BILL TO',
                    }),
                    Spacer({ height: 4 }),
                    Text({ bold: true, children: invoice.to.name }),
                    ...invoice.to.address.map((line) =>
                      Text({ size: 11, color: '#6b7280', children: line }),
                    ),
                  ],
                }),
                Column({
                  width: '34%',
                  children: [
                    Text({
                      size: 10,
                      bold: true,
                      color: '#6b7280',
                      align: 'right',
                      children: 'INVOICE DATE',
                    }),
                    Text({
                      align: 'right',
                      size: 11,
                      children: formatDate(invoice.issueDate),
                    }),
                    Spacer({ height: 8 }),
                    Text({
                      size: 10,
                      bold: true,
                      color: '#6b7280',
                      align: 'right',
                      children: 'DUE DATE',
                    }),
                    Text({
                      align: 'right',
                      size: 11,
                      children: formatDate(invoice.dueDate),
                    }),
                  ],
                }),
              ],
            }),

            Spacer({ height: 32 }),

            // ── Line items table ───────────────────────────────────────
            Table({
              columns: ['Description', 'Qty', 'Unit price', 'Amount'],
              rows: invoice.items.map((item) => [
                item.description,
                String(item.quantity),
                fmt(item.unitPrice),
                fmt(item.quantity * item.unitPrice),
              ]),
              striped: true,
              headerStyle: {
                background: '#1f2937',
                color: '#ffffff',
                bold: true,
              },
            }),

            Spacer({ height: 24 }),

            // ── Totals (right-aligned) ─────────────────────────────────
            Row({
              gap: 16,
              children: [
                Column({ width: '60%', children: [] }),
                Column({
                  width: '40%',
                  children: [
                    totalLine('Subtotal', fmt(subtotal)),
                    invoice.taxRate > 0
                      ? totalLine(`Tax (${(invoice.taxRate * 100).toFixed(0)}%)`, fmt(tax))
                      : null,
                    Divider({ color: '#e5e7eb' }),
                    Section({
                      children: [
                        Row({
                          children: [
                            Column({
                              width: '60%',
                              children: [Text({ bold: true, size: 14, children: 'Total' })],
                            }),
                            Column({
                              width: '40%',
                              children: [
                                Text({
                                  bold: true,
                                  size: 14,
                                  align: 'right',
                                  color: '#4338ca',
                                  children: fmt(total),
                                }),
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
                  ].filter((node): node is DocNode => node !== null),
                }),
              ],
            }),

            Spacer({ height: 32 }),

            // ── Notes (optional) ───────────────────────────────────────
            ...(invoice.notes
              ? [
                  Divider({ color: '#e5e7eb' }),
                  Spacer({ height: 12 }),
                  Text({
                    size: 10,
                    bold: true,
                    color: '#6b7280',
                    children: 'NOTES',
                  }),
                  Spacer({ height: 4 }),
                  Text({ size: 11, color: '#374151', children: invoice.notes }),
                ]
              : []),
          ],
        }),
      ],
    },
  )
}

/** Helper that builds one row of the totals stack. */
function totalLine(label: string, value: string): DocNode {
  return Section({
    children: [
      Row({
        children: [
          Column({ width: '60%', children: [Text({ size: 11, color: '#6b7280', children: label })] }),
          Column({
            width: '40%',
            children: [Text({ size: 11, align: 'right', children: value })],
          }),
        ],
      }),
    ],
  })
}
