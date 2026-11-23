/* oxlint-disable max-lines-per-function -- buildSession is one declarative table of the session's steps, read top to bottom as the user's script; splitting it would scatter the expected state across helpers. */
/**
 * The scripted user session, shared by the correctness gate and the memory
 * pass so the two cannot drift.
 *
 * `buildSession(k)` returns the k-th session's steps with every expectation
 * computed HERE, in the harness, from `shared/data.ts` (the same file every
 * arm copies verbatim) and a model of the app state. `runSteps` is the
 * in-page runner: it is passed to `page.evaluate`, so it must stay
 * self-contained (no imports, no closure over this module).
 *
 * A step performs its actions the way a user's input reaches the page (the
 * native value setter, then `input`/`change` events; `element.click()`), then
 * waits until EVERY expectation holds. The wait is a MutationObserver plus an
 * immediate check, so a framework that commits synchronously, in a microtask
 * or in a later task is each caught at the first moment its DOM is right. A
 * step that does not reach its expectations within the timeout fails the arm.
 * The duration of a step is action start → expectations hold (no paint).
 */
import {
  CATEGORIES,
  countLabel,
  createProducts,
  type Draft,
  draftToProduct,
  ERRORS,
  favButtonLabel,
  favIcon,
  favouritesLabel,
  type Filters,
  formatPrice,
  formatRating,
  formatStock,
  nextProductId,
  pageCount,
  pageLabel,
  pageSlice,
  type Product,
  selectProducts,
  summarize,
  summaryLabel,
} from '../shared/data'

export type Action =
  | { kind: 'input'; sel: string; value: string }
  | { kind: 'select'; sel: string; value: string }
  | { kind: 'click'; sel: string }

/** Every field set must hold. `absent` means no element matches `sel`. */
export interface Check {
  sel?: string
  path?: string
  text?: string
  absent?: true
  count?: number
  attr?: [string, string]
  value?: string
  disabled?: boolean
}

export interface Step {
  label: string
  act: Action[]
  expect: Check[]
}

export interface StepsResult {
  /** null when every step held; else the first failure, with what the page showed. */
  failure: string | null
  /** Per completed step, ms from the first action to the moment every expectation held. */
  durations: number[]
}

const FIRST_ROW = '#products tbody tr:first-child'
const FIRST_LINK = `${FIRST_ROW} td:first-child a`
const FIRST_FAV = `${FIRST_ROW} .fav`

/** The filters the session uses; chosen so the filtered list has at least two pages. */
export const SESSION_QUERY = 'an'
export const SESSION_CATEGORY = 'Garden'
export const SESSION_SORT = 'price-desc'
/** The sort the session switches to while on page 2 (a filter change returns to page 1). */
export const SESSION_RESORT = 'stock'

/** What the time-to-interactive probe types, and the count it waits for. */
export function ttiProbe(): { query: string; initialCount: string; expectedCount: string } {
  const all = createProducts()
  const hit = selectProducts(all, { query: SESSION_QUERY, category: '', sort: 'name' })
  return {
    query: SESSION_QUERY,
    initialCount: countLabel(all.length),
    expectedCount: countLabel(hit.length),
  }
}

function listChecks(list: Product[], page: number): Check[] {
  const rows = pageSlice(list, page)
  const first = rows[0]
  return [
    { sel: '#count', text: countLabel(list.length) },
    { sel: '#summary', text: summaryLabel(summarize(list)) },
    { sel: '#page', text: pageLabel(page, pageCount(list.length)) },
    { sel: '#products tbody tr', count: rows.length },
    ...(first
      ? [
          { sel: FIRST_ROW, attr: ['data-id', String(first.id)] as [string, string] },
          {
            sel: FIRST_LINK,
            text: first.name,
            attr: ['href', `/products/${first.id}`] as [string, string],
          },
          { sel: `${FIRST_ROW} td:nth-child(3)`, text: formatPrice(first.priceCents) },
          { sel: `${FIRST_ROW} td:nth-child(4)`, text: formatStock(first.stock) },
        ]
      : []),
    { sel: '#prev', disabled: page === 1 },
    { sel: '#next', disabled: page === pageCount(list.length) },
  ]
}

function detailChecks(p: Product, fav: boolean): Check[] {
  return [
    { sel: '#detail-name', text: p.name },
    { sel: '#detail-category', text: p.category },
    { sel: '#detail-price', text: formatPrice(p.priceCents) },
    { sel: '#detail-stock', text: formatStock(p.stock) },
    { sel: '#detail-rating', text: formatRating(p.rating) },
    { sel: '#detail-fav', text: favButtonLabel(fav), attr: ['aria-pressed', String(fav)] },
  ]
}

const allErrorsShown: Check[] = [
  { sel: '#error-name', text: ERRORS.name },
  { sel: '#error-category', text: ERRORS.category },
  { sel: '#error-price', text: ERRORS.price },
  { sel: '#error-stock', text: ERRORS.stock },
]

/**
 * The k-th session (k ≥ 1) on a page that has run sessions 1…k-1 before it and
 * starts on any route with default filters and no favourites. It ends on
 * `/products` with default filters and no favourites, having added one product.
 */
export function buildSession(k: number): Step[] {
  const products = createProducts()
  for (let i = 1; i < k; i++) {
    products.push(draftToProduct(sessionDraft(i), nextProductId(products)))
  }
  const base: Filters = { query: '', category: '', sort: 'name' }
  const q: Filters = { ...base, query: SESSION_QUERY }
  const qc: Filters = { ...q, category: SESSION_CATEGORY }
  const qcs: Filters = { ...qc, sort: SESSION_SORT }
  const qcr: Filters = { ...qc, sort: SESSION_RESORT }
  const listQ = selectProducts(products, q)
  const listQc = selectProducts(products, qc)
  const listQcs = selectProducts(products, qcs)
  if (pageCount(listQcs.length) < 2) {
    throw new Error('[real-bench/app] session filters must leave at least two pages')
  }
  const target = pageSlice(listQcs, 2)[0] as Product
  const draft = sessionDraft(k)
  const added = draftToProduct(draft, nextProductId(products))
  const after = [...products, added]

  return [
    {
      label: 'open the list',
      act: [{ kind: 'click', sel: '#nav-products' }],
      expect: [
        { path: '/products' },
        { sel: '#fav-count', text: favouritesLabel(0) },
        ...listChecks(selectProducts(products, base), 1),
      ],
    },
    {
      label: `search "${SESSION_QUERY}"`,
      act: [{ kind: 'input', sel: '#search', value: SESSION_QUERY }],
      expect: listChecks(listQ, 1),
    },
    {
      label: `category ${SESSION_CATEGORY}`,
      act: [{ kind: 'select', sel: '#category', value: SESSION_CATEGORY }],
      expect: listChecks(listQc, 1),
    },
    {
      label: `sort ${SESSION_SORT}`,
      act: [{ kind: 'select', sel: '#sort', value: SESSION_SORT }],
      expect: listChecks(listQcs, 1),
    },
    {
      label: 'next page',
      act: [{ kind: 'click', sel: '#next' }],
      expect: listChecks(listQcs, 2),
    },
    {
      label: 'favourite the first row',
      act: [{ kind: 'click', sel: FIRST_FAV }],
      expect: [
        { sel: '#fav-count', text: favouritesLabel(1) },
        { sel: FIRST_FAV, text: favIcon(true), attr: ['aria-pressed', 'true'] },
      ],
    },
    {
      label: 'open its detail',
      act: [{ kind: 'click', sel: FIRST_LINK }],
      expect: [
        { path: `/products/${target.id}` },
        ...detailChecks(target, true),
        { sel: '#products', absent: true },
      ],
    },
    {
      label: 'unfavourite on the detail',
      act: [{ kind: 'click', sel: '#detail-fav' }],
      expect: [{ sel: '#fav-count', text: favouritesLabel(0) }, ...detailChecks(target, false)],
    },
    {
      label: 'back to the list (filters and page kept)',
      act: [{ kind: 'click', sel: '#back' }],
      expect: [
        { path: '/products' },
        ...listChecks(listQcs, 2),
        { sel: '#search', value: SESSION_QUERY },
        { sel: '#category', value: SESSION_CATEGORY },
        { sel: '#sort', value: SESSION_SORT },
        { sel: FIRST_FAV, text: favIcon(false), attr: ['aria-pressed', 'false'] },
      ],
    },
    {
      label: `sort ${SESSION_RESORT} from page 2 (back to page 1)`,
      act: [{ kind: 'select', sel: '#sort', value: SESSION_RESORT }],
      expect: listChecks(selectProducts(products, qcr), 1),
    },
    {
      label: 'open the form',
      act: [{ kind: 'click', sel: '#nav-new' }],
      expect: [{ path: '/products/new' }, { sel: '#new-form' }, { sel: '.error', absent: true }],
    },
    {
      label: 'submit it empty',
      act: [{ kind: 'click', sel: '#f-submit' }],
      expect: [{ path: '/products/new' }, ...allErrorsShown],
    },
    {
      label: 'fix the name',
      act: [{ kind: 'input', sel: '#f-name', value: draft.name }],
      expect: [{ sel: '#error-name', absent: true }, ...allErrorsShown.slice(1)],
    },
    {
      label: 'fill the rest',
      act: [
        { kind: 'select', sel: '#f-category', value: draft.category },
        { kind: 'input', sel: '#f-price', value: draft.price },
        { kind: 'input', sel: '#f-stock', value: draft.stock },
      ],
      expect: [{ sel: '.error', absent: true }],
    },
    {
      label: 'create',
      act: [{ kind: 'click', sel: '#f-submit' }],
      expect: [{ path: `/products/${added.id}` }, ...detailChecks(added, false)],
    },
    {
      label: 'back to the list via the nav',
      act: [{ kind: 'click', sel: '#nav-products' }],
      expect: [
        { path: '/products' },
        ...listChecks(selectProducts(after, qcr), 1),
        { sel: '#sort', value: SESSION_RESORT },
      ],
    },
    {
      label: 'reset the filters',
      act: [{ kind: 'click', sel: '#reset' }],
      expect: [
        ...listChecks(selectProducts(after, base), 1),
        { sel: '#search', value: '' },
        { sel: '#category', value: '' },
      ],
    },
    {
      label: 'find the new product',
      act: [{ kind: 'input', sel: '#search', value: draft.name }],
      expect: listChecks(selectProducts(after, { ...base, query: draft.name }), 1),
    },
    {
      label: 'reset again',
      act: [{ kind: 'click', sel: '#reset' }],
      expect: listChecks(selectProducts(after, base), 1),
    },
  ]
}

export function sessionDraft(k: number): Draft {
  return {
    name: `Session Product ${k}`,
    category: CATEGORIES[k % CATEGORIES.length] as string,
    price: '12.50',
    stock: '7',
  }
}

/** Direct loads the gate makes in a fresh page each (deep links and not-found). */
export function directLoads(): Array<{ path: string; expect: Check[] }> {
  const all = createProducts()
  const p = all[41] as Product
  return [
    {
      path: '/products',
      expect: listChecks(selectProducts(all, { query: '', category: '', sort: 'name' }), 1),
    },
    {
      path: `/products/${p.id}`,
      expect: [...detailChecks(p, false), { sel: '#fav-count', text: favouritesLabel(0) }],
    },
    { path: '/products/new', expect: [{ sel: '#new-form' }, { sel: '.error', absent: true }] },
    {
      path: '/products/999999',
      expect: [{ sel: '#not-found', text: 'Not found' }, { sel: '#nav-products' }],
    },
    { path: '/products/abc', expect: [{ sel: '#not-found', text: 'Not found' }] },
    { path: '/no-such-page', expect: [{ sel: '#not-found', text: 'Not found' }] },
  ]
}

/**
 * In-page step runner. SELF-CONTAINED: Playwright serialises it into the page.
 * Resolves (never rejects) with the first failure, if any.
 */
export function runSteps(arg: { steps: Step[]; timeoutMs: number }): Promise<StepsResult> {
  const durations: number[] = []
  const describe = (c: Check): string => {
    if (c.path !== undefined) return `path ${location.pathname} (want ${c.path})`
    const els = document.querySelectorAll(c.sel as string)
    const el = els[0] as HTMLInputElement | undefined
    if (c.absent) return `${c.sel}: ${els.length} present (want none)`
    if (!el) return `${c.sel}: missing`
    const parts = [`${c.sel}: text "${(el.textContent ?? '').trim()}"`]
    if (c.count !== undefined) parts.push(`count ${els.length} (want ${c.count})`)
    if (c.text !== undefined) parts.push(`want text "${c.text}"`)
    if (c.attr) parts.push(`${c.attr[0]}="${el.getAttribute(c.attr[0])}" (want "${c.attr[1]}")`)
    if (c.value !== undefined) parts.push(`value "${el.value}" (want "${c.value}")`)
    if (c.disabled !== undefined) parts.push(`disabled ${el.disabled} (want ${c.disabled})`)
    return parts.join(', ')
  }
  const holds = (c: Check): boolean => {
    if (c.path !== undefined && location.pathname.replace(/\/$/, '') !== c.path) return false
    if (c.sel === undefined) return true
    const els = document.querySelectorAll(c.sel)
    if (c.absent) return els.length === 0
    if (c.count !== undefined && els.length !== c.count) return false
    const el = els[0] as HTMLInputElement | undefined
    if (!el) return c.count === 0
    if (c.text !== undefined && (el.textContent ?? '').trim() !== c.text) return false
    if (c.attr && el.getAttribute(c.attr[0]) !== c.attr[1]) return false
    if (c.value !== undefined && el.value !== c.value) return false
    if (c.disabled !== undefined && el.disabled !== c.disabled) return false
    return true
  }
  const act = (a: Action): void => {
    const el = document.querySelector(a.sel) as HTMLElement | null
    if (!el) throw new Error(`no element for ${a.sel}`)
    if (a.kind === 'click') {
      el.click()
      return
    }
    const proto = a.kind === 'select' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    // The prototype setter, not `el.value =`: React tracks the last value it set
    // and ignores an event whose value did not change through the native setter.
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, a.value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    if (a.kind === 'select') el.dispatchEvent(new Event('change', { bubbles: true }))
  }
  const waitFor = (step: Step, t0: number): Promise<string | null> =>
    new Promise((resolve) => {
      let settled = false
      const finish = (failure: string | null) => {
        if (settled) return
        settled = true
        mo.disconnect()
        clearTimeout(timer)
        if (failure === null) durations.push(performance.now() - t0)
        resolve(failure)
      }
      const check = () => {
        if (step.expect.every(holds)) finish(null)
      }
      const mo = new MutationObserver(check)
      mo.observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      })
      const timer = setTimeout(() => {
        const bad = step.expect.filter((c) => !holds(c)).map(describe)
        finish(
          `step "${step.label}" did not reach its expected state in ${arg.timeoutMs} ms: ${bad.slice(0, 4).join(' | ')}`,
        )
      }, arg.timeoutMs)
      // Synchronous commits are already in the DOM; also re-check after the
      // microtask queue drains and on the next task for routers that commit
      // without a DOM mutation we observe (a path change alone).
      check()
      queueMicrotask(check)
      setTimeout(check, 0)
    })
  return (async () => {
    for (const step of arg.steps) {
      const t0 = performance.now()
      try {
        for (const a of step.act) act(a)
      } catch (e) {
        return { failure: `step "${step.label}": ${String(e)}`, durations }
      }
      const failure = await waitFor(step, t0)
      if (failure !== null) return { failure, durations }
    }
    return { failure: null, durations }
  })()
}
