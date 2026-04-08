import { computed, signal } from '@pyreon/reactivity'
import { defineStore } from '@pyreon/store'
import { SEED_INVOICE, totals } from './data/seed'
import type { Invoice, LineItem } from './data/types'

/**
 * Invoice store.
 *
 * Holds the editable invoice plus a `totals` computed that re-derives
 * subtotal/tax/total whenever any line item or the tax rate changes.
 *
 * Why a flat signal store rather than @pyreon/form:
 *   • The form has a dynamic line-items array. `useForm` doesn't have
 *     first-class field-array support beyond `useFieldArray`, and the
 *     simple `signal<Invoice>` shape is enough for a one-off form.
 *   • The document preview (and the export buttons) read the entire
 *     invoice on every change. A single signal is the cheapest way
 *     to broadcast changes across the page.
 *
 * Real apps with longer/more complex forms would lift line items into
 * `useFieldArray` for the per-field validation hooks.
 */
export const useInvoice = defineStore('invoice', () => {
  const invoice = signal<Invoice>(SEED_INVOICE)

  const computedTotals = computed(() => {
    const inv = invoice()
    return totals(inv.items, inv.taxRate)
  })

  // ── Field updates ──────────────────────────────────────────────────
  function update<K extends keyof Invoice>(field: K, value: Invoice[K]): void {
    invoice.set({ ...invoice(), [field]: value })
  }

  function updateFrom<K extends keyof Invoice['from']>(field: K, value: Invoice['from'][K]): void {
    invoice.set({
      ...invoice(),
      from: { ...invoice().from, [field]: value },
    })
  }

  function updateTo<K extends keyof Invoice['to']>(field: K, value: Invoice['to'][K]): void {
    invoice.set({
      ...invoice(),
      to: { ...invoice().to, [field]: value },
    })
  }

  // ── Line item array operations ──────────────────────────────────────
  function addLineItem(): void {
    const newItem: LineItem = {
      id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      description: 'New line item',
      quantity: 1,
      unitPrice: 0,
    }
    invoice.set({ ...invoice(), items: [...invoice().items, newItem] })
  }

  function updateLineItem<K extends keyof Omit<LineItem, 'id'>>(
    id: string,
    field: K,
    value: LineItem[K],
  ): void {
    invoice.set({
      ...invoice(),
      items: invoice().items.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    })
  }

  function removeLineItem(id: string): void {
    invoice.set({
      ...invoice(),
      items: invoice().items.filter((item) => item.id !== id),
    })
  }

  function reset(): void {
    invoice.set(SEED_INVOICE)
  }

  return {
    invoice,
    totals: computedTotals,
    update,
    updateFrom,
    updateTo,
    addLineItem,
    updateLineItem,
    removeLineItem,
    reset,
  }
})
