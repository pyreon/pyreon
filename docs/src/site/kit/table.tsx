import type { VNodeChild } from '@pyreon/core'
import { For, Show } from '@pyreon/core'
import { breakpoints, font, radius, text, weight } from '../theme'
import { el, tone, txt } from './bases'

/**
 * `DataTable` — a real `<table>` (caption, column headers, row headers) that
 * reflows into labelled cards below 768px instead of scrolling the page
 * sideways: every cell then prints its column name above its value
 * (`data-label`, decorative; screen readers still get the table semantics).
 * Used for the content's `table` sections, the compare tables and the text
 * alternative of every benchmark chart.
 */
const Frame = el
  .config({ name: 'DataTable' })
  .attrs({ block: true, contentAlignX: 'block' })
  .theme((_t, m) => ({
    minWidth: 0,
    borderRadius: radius.bench,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'well'),
    overflow: 'hidden',
  }))

const below = `@media (max-width: ${breakpoints.md - 0.02}px)`

const Table = el
  .config({ name: 'DataTableTable' })
  .attrs({ tag: 'table' })
  .theme((_t, m) => ({
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: font.sans,
    fontSize: text.small.size,
    lineHeight: 1.5,
    color: tone(m, 'mist'),
    // Element lays itself out as flex; a table must stay a table (and is
    // re-blocked into cards below 768px).
    extendCss: `
      display: table;
      & caption { text-align: left; padding: 16px 22px; font-family: ${font.mono}; font-size: ${text.caveat.size}px;
        letter-spacing: ${text.caveat.tracking}; color: ${tone(m, 'fog')}; border-bottom: 1px solid ${tone(m, 'line')}; }
      & thead th { text-align: left; font-family: ${font.mono}; font-size: ${text.eyebrowTight.size}px; font-weight: ${weight.medium};
        letter-spacing: ${text.eyebrowTight.tracking}; text-transform: uppercase; color: ${tone(m, 'fog')};
        padding: 14px 18px; border-bottom: 1px solid ${tone(m, 'line')}; }
      & tbody th, & tbody td { text-align: left; vertical-align: top; padding: 14px 18px; border-bottom: 1px solid ${tone(m, 'line')};
        overflow-wrap: anywhere; }
      & tbody tr:last-child th, & tbody tr:last-child td { border-bottom: 0; }
      & tbody th { color: ${tone(m, 'text')}; font-weight: ${weight.regular}; }
      & td[data-num] { font-family: ${font.mono}; font-size: ${text.mono.size}px; white-space: nowrap; }
      & td[data-hot] { color: ${tone(m, 'text')}; }
      ${below} {
        display: block;
        & thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); }
        & tbody, & tr, & tbody th, & tbody td { display: block; }
        & tr { padding: 14px 18px; border-bottom: 1px solid ${tone(m, 'line')}; }
        & tbody tr:last-child { border-bottom: 0; }
        & tbody th, & tbody td { padding: 3px 0; border: 0; }
        & tbody th { font-size: ${text.body.size}px; padding-bottom: 6px; }
        & tbody td[data-label]::before { content: attr(data-label); display: block; font-family: ${font.mono};
          font-size: ${text.eyebrowTight.size}px; letter-spacing: ${text.eyebrowTight.tracking}; text-transform: uppercase;
          color: ${tone(m, 'fog')}; margin-top: 6px; }
        & td[data-num] { white-space: normal; }
      }
    `,
  }))

export interface DataCell {
  content: VNodeChild
  /** Numbers: mono, no wrapping on wide screens. */
  num?: boolean | undefined
  /** The Pyreon column: full text colour. */
  hot?: boolean | undefined
}

export function DataTable(props: {
  caption?: string | undefined
  columns: readonly string[]
  /** One entry per row; the first cell is the row header. */
  rows: readonly { key: string; cells: readonly DataCell[] }[]
  label?: string | undefined
}) {
  return (
    <Frame>
      <Table aria-label={props.label}>
        <Show when={() => !!props.caption}>
          <caption>{props.caption}</caption>
        </Show>
        <thead>
          <tr>
            <For each={props.columns.map((c, i) => ({ c, i }))} by={(x) => x.i}>
              {(x) => <th scope="col">{x.c}</th>}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={props.rows} by={(r) => r.key}>
            {(r) => (
              <tr>
                <For each={r.cells.map((cell, i) => ({ cell, i }))} by={(x) => x.i}>
                  {(x) =>
                    x.i === 0 ? (
                      <th scope="row">{x.cell.content}</th>
                    ) : (
                      <td
                        data-label={props.columns[x.i]}
                        data-num={x.cell.num ? '' : undefined}
                        data-hot={x.cell.hot ? '' : undefined}
                      >
                        {x.cell.content}
                      </td>
                    )
                  }
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </Table>
    </Frame>
  )
}

/** A "Show the numbers as a table" disclosure: the text alternative under a chart. */
const Disclosure = el
  .config({ name: 'TableDisclosure' })
  .attrs({ tag: 'details', block: true })
  .theme((_t, m) => ({
    marginTop: 14,
    extendCss: `
      & > summary { cursor: pointer; display: inline-block; font-family: ${font.mono}; font-size: ${text.caveat.size}px;
        color: ${tone(m, 'fog')}; padding: 6px 0; border-radius: 4px; }
      & > summary:hover { color: ${tone(m, 'text')}; }
      & > summary:focus-visible { outline: 2px solid ${tone(m, 'focus')}; outline-offset: 3px; }
      & > summary + * { margin-top: 12px; }
    `,
  }))

export function TableDisclosure(props: { summary: string; children?: VNodeChild }) {
  return (
    <Disclosure>
      <summary>{props.summary}</summary>
      {props.children}
    </Disclosure>
  )
}

/** Small mono line used under tables and charts. */
export const TableNote = txt
  .config({ name: 'TableNote' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    marginTop: 12,
    fontFamily: font.mono,
    fontSize: text.caveat.size,
    letterSpacing: text.caveat.tracking,
    lineHeight: 1.6,
    color: tone(m, 'fog'),
  }))
