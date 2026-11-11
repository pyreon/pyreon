import { el } from '../../kit'

/**
 * A panel data table (`table.dt`). The wrapper styles a NATIVE `<table>`
 * inside it — rows of facts a reader scans across, read as a table by
 * assistive tech — because the Element base is a flex box, and a flex `<tr>`
 * is not a table row. Cell roles ride data attributes: `td[data-v="key"]` is
 * the row's subject (ink, mono), `td[data-v="dim"]` a secondary fact, and
 * `tr[data-new]` a row the last rescan brought in.
 */
export const DataTable = el.attrs({ tag: 'div', block: true }).theme((t) => ({
  minWidth: '0',
  overflowX: 'auto',
  extendCss:
    `& table{width:100%;border-collapse:collapse;font-size:${t.size.body};line-height:1.4;}` +
    `& th{padding:8px 12px;text-align:left;font-family:${t.font.mono};font-size:${t.size.tag};font-weight:400;letter-spacing:${t.tracking.lg};text-transform:uppercase;color:${t.faint};border-bottom:${t.hairline};white-space:nowrap;}` +
    `& td{padding:8px 12px;border-bottom:${t.hairline};color:${t.muted};vertical-align:middle;overflow-wrap:anywhere;}` +
    `& td[data-v="key"]{color:${t.text};font-family:${t.font.mono};font-size:${t.size.small};}` +
    `& td[data-v="dim"]{color:${t.faint};font-size:${t.size.small};}` +
    `& tr[data-new]{background:${t.glow};}`,
}))
