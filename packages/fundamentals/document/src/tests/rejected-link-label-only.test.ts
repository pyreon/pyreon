/**
 * A link or button whose `href` the allowlist rejects (`javascript:`, …)
 * renders as its LABEL, with no link, in every format (#4365).
 *
 * `sanitizeHref` returns `''` for a rejected URL. The HTML renderer then wrote
 * `<a href="">`, which reloads the page when clicked, and email / SVG /
 * Confluence / Notion / DOCX / PPTX built an empty link the same way; the
 * Markdown, chat and PDF renderers already dropped the link. Each format is
 * checked here for the label and for the absence of an empty link target.
 *
 * Bisect-verified: before the fix the html / email / svg / confluence / notion
 * / docx / pptx cases fail on the empty-target assertion.
 */
import { describe, expect, it } from 'vitest'
import { Button, Document, Link, Page } from '../nodes'
import { render } from '../render'
import type { DocNode } from '../types'
import { unzipDump } from './zip-dump-helper'

const doc = (): DocNode =>
  Document({
    title: 'rejected',
    children: [
      Page({
        children: [
          Link({ href: 'javascript:alert(1)', children: ['standalone-label'] }),
          Button({ href: 'javascript:alert(2)', children: ['button-label'] }),
        ],
      }),
    ],
  })

async function output(format: string): Promise<string> {
  const out = await render(doc(), format)
  if (typeof out === 'string') return out
  if (out instanceof Uint8Array) {
    return format === 'pdf' ? new TextDecoder('latin1').decode(out) : unzipDump(out, `rejected.${format}`)
  }
  return JSON.stringify(out)
}

// What an EMPTY link target looks like in each output shape.
const EMPTY_TARGET = /href=""|"href":""|"url":""|"link":""|Target=""/

describe('a rejected href renders the label only', () => {
  for (const format of ['html', 'email', 'svg', 'confluence', 'notion', 'docx', 'pptx', 'md', 'slack', 'teams', 'discord', 'telegram', 'whatsapp', 'google-chat', 'text', 'pdf']) {
    it(format, async () => {
      const s = await output(format)
      expect(s).not.toMatch(/javascript/i)
      expect(s).not.toMatch(EMPTY_TARGET)
      if (format !== 'pdf') {
        expect(s).toContain('standalone-label')
        expect(s).toContain('button-label')
      }
    })
  }

  it('a safe href still links (html control)', async () => {
    const s = (await render(
      Document({ children: [Page({ children: [Link({ href: 'https://ok.example/', children: ['ok'] })] })] }),
      'html',
    )) as string
    expect(s).toContain('<a href="https://ok.example/"')
  })
})
