// ECharts' default tooltip content (its `tooltipMarkup.ts`), for an option
// tooltip with no formatter: a header, then one row per value — a colour
// dot, the name, and the value floated right in bold. The HTML is ECharts'
// own, element for element and style for style, so the box reads the same.
//
// It is rendered through `renderTooltipHtml`'s allow-list like any tooltip
// HTML; every name and value is escaped here first, so an option's text can
// never become markup.

import type { Double } from './types'

/** One row of the default tooltip: the swatch colour, the name, the shown value. */
export interface TooltipRow {
  color: string
  name: string
  value: string
}

const ROW_TEXT = 'font-size:14px;color:#6d6e73;font-weight:400'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** A CSS colour safe to put in a style attribute (anything else reads as the neutral grey). */
function safeColor(c: string): string {
  return /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|[a-zA-Z]+)$/.test(c) ? c : '#6d6e73'
}

/** ECharts' `addCommas`: the integer part grouped by thousands; anything non-numeric as it is. */
export function tooltipNumber(v: Double | string): string {
  const text = typeof v === 'number' ? String(v) : v
  if (!/^-?\d+(\.\d+)?$/.test(text)) return text
  const [int, frac] = text.split('.')
  const grouped = int!.replace(/(\d{1,3})(?=(?:\d{3})+(?!\d))/g, '$1,')
  return frac === undefined ? grouped : `${grouped}.${frac}`
}

function row(r: TooltipRow): string {
  return (
    '<div style="margin: 0px 0 0;line-height:1;">'
    + `<span style="display:inline-block;margin-right:4px;border-radius:10px;width:10px;height:10px;background-color:${safeColor(r.color)};"></span>`
    + (r.name === '' ? '' : `<span style="${ROW_TEXT};margin-left:2px">${escapeHtml(r.name)}</span>`)
    + `<span style="float:right;margin-left:20px;font-size:14px;color:#6d6e73;font-weight:900">${escapeHtml(r.value)}</span>`
    + '<div style="clear:both"></div></div>'
  )
}

/**
 * The default tooltip body: `header` above its rows. An item tooltip is one
 * row under the series name; an axis tooltip one row per series under the
 * category.
 */
export function tooltipMarkup(header: string, rows: TooltipRow[]): string {
  const body = rows.map((r, i) => (i === 0 ? row(r) : `<div style="margin: 10px 0 0;line-height:1;">${row(r)}<div style="clear:both"></div></div>`)).join('')
  // No header ('' — an unnamed series' item tooltip): the rows alone, as ECharts' `noHeader`.
  if (header === '') return `<div style="margin: 0px 0 0;line-height:1;">${body}<div style="clear:both"></div></div>`
  return (
    '<div style="margin: 0px 0 0;line-height:1;">'
    + `<div style="${ROW_TEXT};line-height:1;">${escapeHtml(header)}</div>`
    + `<div style="margin: 10px 0 0;line-height:1;">${body}<div style="clear:both"></div></div>`
    + '<div style="clear:both"></div></div>'
  )
}
