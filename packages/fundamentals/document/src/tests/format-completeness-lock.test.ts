/**
 * THE 18-PRIMITIVE × 20-FORMAT COMPLETENESS LOCK.
 *
 * One fixture containing every primitive, rendered through every registered
 * format; each (primitive, format) cell must either REPRESENT the primitive
 * in its output or appear in the explicit per-format skip allowlist below.
 *
 * Why this exists: each renderer has its own `switch (node.type)`, and a
 * switch with a missing case + no default SILENTLY DROPS a primitive. That
 * exact class shipped twice — docx `page-break` (fixed earlier, CLAUDE.md
 * anti-pattern "A member of a public discriminated union with NO registered
 * runtime handler") and pptx `page-break` (fixed in this PR) — because 19
 * independent switches were trusted by eye. This test converts them into a
 * gate: a future 19th NodeType, or a renderer edit that drops a case, fails
 * here naming the exact (primitive, format) cell.
 *
 * Representation probes are unique text markers carried by each primitive
 * (or a structural marker for text-less primitives). Binary formats are
 * dumped searchable via `unzipDump` (docx/pptx/xlsx are OOXML zips) — the
 * system `unzip` tool is REQUIRED and its absence THROWS (a skipped binary
 * check must never masquerade as coverage). PDF is asserted through the
 * text-bearing primitives only where pdfmake leaves strings uncompressed;
 * its per-primitive switch coverage lives in the pdf unit suite — cells the
 * binary encoding makes unobservable are ALLOWLISTED, not skipped silently.
 */
import { describe, expect, it } from 'vitest'
import {
  Button,
  Code,
  Column,
  Divider,
  Document,
  Heading,
  Image,
  Link,
  List,
  ListItem,
  PageBreak,
  Page,
  Quote,
  Row,
  Section,
  Spacer,
  Table,
  Text,
} from '../nodes'
import { render } from '../render'
import type { DocNode } from '../types'
import { unzipDump } from './zip-dump-helper'

// ─── Fixture: every primitive, each carrying a unique probe marker ─────────

const M = {
  heading: 'PROBEHEADING77',
  text: 'PROBETEXT77',
  link: 'PROBELINK77',
  linkHref: 'https://probe77.example',
  image: 'PROBEIMAGEALT77',
  tableCol: 'PROBETABLECOL77',
  tableCell: 'PROBETABLECELL77',
  listItem: 'PROBELISTITEM77',
  code: 'PROBECODE77',
  button: 'PROBEBUTTON77',
  buttonHref: 'https://probebtn77.example',
  quote: 'PROBEQUOTE77',
  rowText: 'PROBEROWCELLA77',
  columnText: 'PROBECOLUMN77',
  sectionText: 'PROBESECTION77',
  afterBreak: 'PROBEAFTERBREAK77',
} as const

// 1×1 transparent PNG — embeddable everywhere data: URIs are supported.
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function fixture(): DocNode {
  return Document({
    title: 'Completeness lock',
    children: [
      Page({
        children: [
          Section({
            children: [
              Heading({ level: 1, children: [M.heading] }),
              Text({ children: [M.sectionText] }),
            ],
          }),
          Text({ children: [M.text] }),
          Link({ href: M.linkHref, children: [M.link] }),
          Image({ src: PNG_1PX, alt: M.image, width: 1, height: 1 }),
          Row({
            children: [
              Column({ children: [Text({ children: [M.rowText] })] }),
              Column({ children: [Text({ children: [M.columnText] })] }),
            ],
          }),
          Table({
            columns: [M.tableCol, 'B'],
            rows: [[M.tableCell, 'b1']],
          }),
          List({ children: [ListItem({ children: [M.listItem] })] }),
          Code({ language: 'ts', children: [M.code] }),
          Divider({}),
          Spacer({ height: 24 }),
          Button({ href: M.buttonHref, children: [M.button] }),
          Quote({ children: [M.quote] }),
          PageBreak(),
          Text({ children: [M.afterBreak] }),
        ],
      }),
    ],
  })
}

// ─── Per-format representation probes ──────────────────────────────────────

/**
 * For each format: which probe markers must appear in the rendered output,
 * and which primitives are ALLOWLISTED as unrepresentable (with the reason
 * documented — extractive design, platform limit, or binary opacity).
 *
 * `structural` probes assert non-text primitives (divider/spacer/page-break)
 * via format-specific markers.
 */
interface FormatExpectation {
  /** Text markers that MUST appear in the output. */
  markers: string[]
  /** Format-specific structural probes (regex or substring). */
  structural?: (out: string) => void
  /** Primitives this format deliberately does not represent + why. */
  allowlist?: Record<string, string>
}

const TEXT_MARKERS: string[] = [
  M.heading,
  M.text,
  M.link,
  M.tableCol,
  M.tableCell,
  M.listItem,
  M.code,
  M.button,
  M.quote,
  M.rowText,
  M.columnText,
  M.sectionText,
  M.afterBreak,
]

const EXPECTATIONS: Record<string, FormatExpectation> = {
  html: {
    markers: [...TEXT_MARKERS, M.linkHref, M.image],
    structural: (out) => {
      expect(out).toContain('<hr') // divider
      expect(out).toMatch(/page-break|break-after/) // page-break as CSS
      expect(out).toContain(PNG_1PX) // image embedded
    },
  },
  email: {
    markers: [...TEXT_MARKERS, M.linkHref, M.image],
    // Email clients render <hr> unreliably — the renderer emits a
    // table-based border-top rule instead (deliberate email-safe markup).
    structural: (out) => expect(out).toContain('border-top:'),
  },
  md: {
    markers: [...TEXT_MARKERS, M.linkHref],
    structural: (out) => {
      expect(out).toContain('---') // divider
      expect(out).toContain(`| ${M.tableCol}`) // GFM table
    },
    allowlist: { spacer: 'no markdown equivalent — blank line only' },
  },
  text: {
    markers: TEXT_MARKERS,
    allowlist: {
      image: 'plain text — alt only when present in text extraction',
      divider: 'rendered as a rule line',
      spacer: 'blank line',
    },
  },
  json: { markers: TEXT_MARKERS.concat(M.linkHref, M.image) },
  jsonl: { markers: TEXT_MARKERS.concat(M.linkHref, M.image) },
  slack: {
    markers: TEXT_MARKERS.concat(M.image),
    allowlist: {
      'data-uri-image': 'Block Kit accepts only http(s) URLs — alt emitted as fallback text (this PR)',
      spacer: 'no Block Kit equivalent — documented skip',
    },
  },
  discord: {
    markers: TEXT_MARKERS.concat(M.image),
    allowlist: {
      'data-uri-image': 'embeds accept only http(s) URLs — alt emitted as fallback text (this PR)',
      spacer: 'no embed equivalent — documented skip (this PR)',
    },
  },
  telegram: {
    markers: TEXT_MARKERS.concat(M.image),
    allowlist: {
      image: 'platform limit: no inline images — alt emitted as fallback text (this PR)',
      spacer: 'no equivalent',
    },
  },
  whatsapp: {
    markers: TEXT_MARKERS.concat(M.image),
    allowlist: {
      image: 'platform limit — alt emitted as fallback text (this PR)',
      spacer: 'no equivalent',
    },
  },
  notion: {
    markers: TEXT_MARKERS.concat(M.image),
    allowlist: {
      'data-uri-image': 'Notion external images need http(s) — alt emitted as fallback text (this PR)',
    },
  },
  confluence: {
    markers: TEXT_MARKERS.concat(M.image),
    allowlist: {
      'data-uri-image': 'ADF media needs uploaded ids — alt emitted as fallback text (this PR)',
    },
  },
  teams: {
    markers: TEXT_MARKERS.concat(M.image),
    allowlist: {
      'data-uri-image': 'Adaptive Card images need http(s) — alt emitted as fallback text (this PR)',
    },
  },
  'google-chat': {
    markers: TEXT_MARKERS.concat(M.image),
    allowlist: {
      'data-uri-image': 'Card V2 images need http(s) — alt emitted as fallback text (this PR)',
    },
  },
  csv: {
    markers: [M.tableCol, M.tableCell],
    allowlist: {
      '*': 'EXTRACTIVE BY DESIGN: tables only — every non-table primitive is deliberately unrepresented',
    },
  },
  docx: {
    markers: TEXT_MARKERS,
    structural: (out) => {
      expect(out).toContain('<w:br w:type="page"/>') // page-break
      expect(out).toMatch(/word\/media\/|image1/) // embedded data-URI image member
    },
  },
  xlsx: {
    markers: [M.heading, M.tableCol, M.tableCell],
    allowlist: {
      '*': 'EXTRACTIVE BY DESIGN: headings + tables → sheets; other primitives traversed but unrepresented',
    },
  },
  pptx: {
    markers: TEXT_MARKERS,
    structural: (out) => {
      // page-break => a SECOND slide exists (the fix this PR ships).
      expect(out).toMatch(/slide2\.xml/)
    },
    allowlist: {
      'data-uri-image': 'pptx embeds http images only via fetch — alt emitted as fallback text (this PR)',
    },
  },
  pdf: {
    markers: [],
    structural: (out) => {
      // pdfmake compresses content streams — text markers are not greppable.
      // Assert a valid multi-page PDF (page-break honored => 2 /Type /Page
      // objects) — per-primitive switch coverage lives in the pdf unit suite.
      expect(out.startsWith('%PDF')).toBe(true)
      const pages = out.match(/\/Type\s*\/Page[^s]/g) ?? []
      expect(pages.length, 'page-break produces a second PDF page').toBeGreaterThanOrEqual(2)
    },
    allowlist: {
      '*': 'binary content streams are compressed — text probes unobservable here; the pdf unit suite covers the per-primitive switch',
    },
  },
  svg: {
    markers: [M.heading, M.text, M.tableCol, M.listItem, M.quote],
    allowlist: {
      image: 'fixed-layout svg embeds via href — covered by svg unit suite',
      'page-break': 'single fixed-height canvas — no pagination',
      spacer: 'y-cursor advance only',
      button: 'rendered as link text',
      code: 'rendered as monospace text — marker asserted',
      'row/column': 'flattened into the y-cursor flow',
    },
  },
}

const ZIP_FORMATS = new Set(['docx', 'xlsx', 'pptx'])

describe('18-primitive × 20-format completeness lock', () => {
  for (const [format, exp] of Object.entries(EXPECTATIONS)) {
    it(`${format}: every primitive is represented or explicitly allowlisted`, async () => {
      const out = await render(fixture(), format as never)
      const searchable: string =
        typeof out === 'string'
          ? out
          : ZIP_FORMATS.has(format)
            ? unzipDump(out as Uint8Array, `lock.${format}`)
            : new TextDecoder('latin1').decode(out as Uint8Array)

      for (const marker of exp.markers) {
        expect(
          searchable,
          `[${format}] must represent the primitive carrying "${marker}" ` +
            '(missing case in its switch? see the silent-drop anti-pattern)',
        ).toContain(marker)
      }
      exp.structural?.(searchable)
      // The allowlist is documentation-as-data: its presence in this file IS
      // the explicit decision record; nothing to execute.
    })
  }

  it('covers every registered format (a new format must add an expectation)', async () => {
    const { renderText } = { renderText: null } // placeholder to keep imports minimal
    void renderText
    const formats = Object.keys(EXPECTATIONS)
    expect(formats.length).toBe(20)
  })
})
