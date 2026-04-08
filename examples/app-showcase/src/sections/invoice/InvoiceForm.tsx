import { formatCurrency } from './data/seed'
import type { Invoice, LineItem } from './data/types'
import { useInvoice } from './store'
import {
  AddLineButton,
  FieldGrid,
  FieldGroup,
  FieldGroupSmTop,
  FieldLabel,
  GrandTotalRow,
  LineItemInput,
  LineItemRow,
  LineRemove,
  Section,
  SectionTitle,
  Select,
  SpacedFieldGroup,
  Textarea,
  TextInput,
  TotalRow,
  TotalsBox,
} from './styled'

const CURRENCIES: Invoice['currency'][] = ['USD', 'EUR', 'GBP']

/**
 * Invoice editor form. Bound directly to the invoice store via plain
 * `onInput` handlers — no `useForm` because the line items are a
 * dynamic array and the cost of duplicating the field-array helpers
 * isn't worth it for a single one-off form.
 */
export function InvoiceForm() {
  const inv = useInvoice()
  const { store } = inv

  function setNumber(value: string) {
    store.update('number', value)
  }
  function setIssueDate(value: string) {
    store.update('issueDate', value)
  }
  function setDueDate(value: string) {
    store.update('dueDate', value)
  }
  function setCurrency(value: Invoice['currency']) {
    store.update('currency', value)
  }
  function setTaxRate(value: number) {
    store.update('taxRate', value)
  }
  function setNotes(value: string) {
    store.update('notes', value)
  }

  return (
    <>
      {/* ── Invoice metadata ───────────────────────────────────── */}
      <Section>
        <SectionTitle>Invoice details</SectionTitle>
        <FieldGrid>
          <FieldGroup>
            <FieldLabel for="number">Number</FieldLabel>
            <TextInput
              id="number"
              type="text"
              value={() => store.invoice().number}
              onInput={(e: Event) => setNumber((e.target as HTMLInputElement).value)}
            />
          </FieldGroup>
          <FieldGroup>
            <FieldLabel for="currency">Currency</FieldLabel>
            <Select
              id="currency"
              value={() => store.invoice().currency}
              onInput={(e: Event) =>
                setCurrency((e.target as HTMLSelectElement).value as Invoice['currency'])
              }
            >
              {CURRENCIES.map((c) => (
                <option value={c}>{c}</option>
              ))}
            </Select>
          </FieldGroup>
          <FieldGroup>
            <FieldLabel for="issueDate">Issue date</FieldLabel>
            <TextInput
              id="issueDate"
              type="date"
              value={() => store.invoice().issueDate}
              onInput={(e: Event) => setIssueDate((e.target as HTMLInputElement).value)}
            />
          </FieldGroup>
          <FieldGroup>
            <FieldLabel for="dueDate">Due date</FieldLabel>
            <TextInput
              id="dueDate"
              type="date"
              value={() => store.invoice().dueDate}
              onInput={(e: Event) => setDueDate((e.target as HTMLInputElement).value)}
            />
          </FieldGroup>
        </FieldGrid>
      </Section>

      {/* ── Bill from / Bill to ─────────────────────────────────── */}
      <Section>
        <SectionTitle>Bill from</SectionTitle>
        <FieldGroup>
          <FieldLabel for="fromName">Company / name</FieldLabel>
          <TextInput
            id="fromName"
            type="text"
            value={() => store.invoice().from.name}
            onInput={(e: Event) =>
              store.updateFrom('name', (e.target as HTMLInputElement).value)
            }
          />
        </FieldGroup>
        <SpacedFieldGroup>
          <FieldLabel for="fromEmail">Email</FieldLabel>
          <TextInput
            id="fromEmail"
            type="email"
            value={() => store.invoice().from.email}
            onInput={(e: Event) =>
              store.updateFrom('email', (e.target as HTMLInputElement).value)
            }
          />
        </SpacedFieldGroup>
        <SpacedFieldGroup>
          <FieldLabel for="fromAddress">Address (one line per row)</FieldLabel>
          <Textarea
            id="fromAddress"
            value={() => store.invoice().from.address.join('\n')}
            onInput={(e: Event) =>
              store.updateFrom(
                'address',
                (e.target as HTMLTextAreaElement).value.split('\n').filter(Boolean),
              )
            }
          />
        </SpacedFieldGroup>
      </Section>

      <Section>
        <SectionTitle>Bill to</SectionTitle>
        <FieldGroup>
          <FieldLabel for="toName">Customer name</FieldLabel>
          <TextInput
            id="toName"
            type="text"
            value={() => store.invoice().to.name}
            onInput={(e: Event) => store.updateTo('name', (e.target as HTMLInputElement).value)}
          />
        </FieldGroup>
        <SpacedFieldGroup>
          <FieldLabel for="toEmail">Email</FieldLabel>
          <TextInput
            id="toEmail"
            type="email"
            value={() => store.invoice().to.email}
            onInput={(e: Event) => store.updateTo('email', (e.target as HTMLInputElement).value)}
          />
        </SpacedFieldGroup>
        <SpacedFieldGroup>
          <FieldLabel for="toAddress">Address (one line per row)</FieldLabel>
          <Textarea
            id="toAddress"
            value={() => store.invoice().to.address.join('\n')}
            onInput={(e: Event) =>
              store.updateTo(
                'address',
                (e.target as HTMLTextAreaElement).value.split('\n').filter(Boolean),
              )
            }
          />
        </SpacedFieldGroup>
      </Section>

      {/* ── Line items ──────────────────────────────────────────── */}
      <Section>
        <SectionTitle>Line items</SectionTitle>
        <LineItemList />
        <AddLineButton type="button" onClick={() => store.addLineItem()}>
          + Add line item
        </AddLineButton>

        <FieldGroupSmTop>
          <FieldLabel for="taxRate">Tax rate (%)</FieldLabel>
          <TextInput
            id="taxRate"
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={() => (store.invoice().taxRate * 100).toFixed(1)}
            onInput={(e: Event) =>
              setTaxRate(Number((e.target as HTMLInputElement).value) / 100 || 0)
            }
          />
        </FieldGroupSmTop>

        <TotalsBox>
          {() => {
            const t = store.totals()
            const c = store.invoice().currency
            return (
              <>
                <TotalRow>
                  <span>Subtotal</span>
                  <span>{formatCurrency(t.subtotal, c)}</span>
                </TotalRow>
                {store.invoice().taxRate > 0 ? (
                  <TotalRow>
                    <span>Tax ({(store.invoice().taxRate * 100).toFixed(0)}%)</span>
                    <span>{formatCurrency(t.tax, c)}</span>
                  </TotalRow>
                ) : null}
                <GrandTotalRow>
                  <span>Total</span>
                  <span>{formatCurrency(t.total, c)}</span>
                </GrandTotalRow>
              </>
            )
          }}
        </TotalsBox>
      </Section>

      {/* ── Notes ──────────────────────────────────────────────── */}
      <Section>
        <SectionTitle>Notes</SectionTitle>
        <Textarea
          value={() => store.invoice().notes ?? ''}
          onInput={(e: Event) => setNotes((e.target as HTMLTextAreaElement).value)}
          placeholder="Payment terms, bank details, thank-you note…"
        />
      </Section>
    </>
  )
}

/**
 * Reactive line-items renderer pulled into its own component because
 * a `{() => arr.map(...)}` thunk inside a styled rocketstyle child
 * slot trips TS narrowing — the rocketstyle child type collapses to
 * `VNodeChildAtom`, which doesn't admit a function returning an array.
 *
 * Wrapping the iteration in a sibling component sidesteps the
 * narrowing entirely: the component returns a function, which Pyreon's
 * runtime treats as a reactive children accessor.
 */
function LineItemList() {
  const inv = useInvoice()
  const { store } = inv
  return () =>
    store.invoice().items.map((item: LineItem) => (
      <LineItemRow>
        <LineItemInput
          type="text"
          value={item.description}
          placeholder="Description"
          onInput={(e: Event) =>
            store.updateLineItem(item.id, 'description', (e.target as HTMLInputElement).value)
          }
        />
        <LineItemInput
          type="number"
          min="0"
          value={item.quantity}
          onInput={(e: Event) =>
            store.updateLineItem(
              item.id,
              'quantity',
              Number((e.target as HTMLInputElement).value) || 0,
            )
          }
        />
        <LineItemInput
          type="number"
          min="0"
          step="0.01"
          value={item.unitPrice}
          onInput={(e: Event) =>
            store.updateLineItem(
              item.id,
              'unitPrice',
              Number((e.target as HTMLInputElement).value) || 0,
            )
          }
        />
        <LineRemove
          type="button"
          title="Remove line"
          onClick={() => store.removeLineItem(item.id)}
        >
          ×
        </LineRemove>
      </LineItemRow>
    ))
}
