/**
 * Output-injection hardening locks (audit fix).
 *
 * Every renderer turns USER-controlled strings (text, link hrefs, image
 * sources, code, table cells) into a target syntax — HTML, Markdown, Slack
 * mrkdwn, CSV, PDF/DOCX link annotations. Each spec below renders a hostile
 * input and asserts the target syntax was not broken out of.
 */
import { describe, expect, it } from 'vitest'
import {
  Button,
  Code,
  Document,
  Heading,
  Image,
  Link,
  List,
  ListItem,
  Page,
  Table,
  Text,
  getInlineRuns,
} from '../nodes'
import { render } from '../render'
import { sanitizeHref, sanitizeImageSrc } from '../sanitize'
import type { DocNode } from '../types'
import { unzipDump } from './zip-dump-helper'

const wrap = (...children: DocNode[]) =>
  Document({ title: 'inj', children: [Page({ children })] })

const JS = 'javascript:alert(1)'

function allStrings(v: unknown): string[] {
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.flatMap(allStrings)
  if (v && typeof v === 'object') return Object.values(v).flatMap(allStrings)
  return []
}

async function asText(node: DocNode, format: string): Promise<string> {
  const out = await render(node, format)
  return typeof out === 'string' ? out : new TextDecoder('latin1').decode(out)
}

describe('sanitizeHref / sanitizeImageSrc — allowlist', () => {
  const hostile = [
    JS,
    '\x01javascript:alert(1)',
    'java\x00script:alert(1)',
    ' \t\njavascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '&#106;avascript:alert(1)',
    '&#x6A;avascript:alert(1)',
    'javascript&colon;alert(1)',
    'jav&#x09;ascript:alert(1)',
    '&amp;#106;avascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
  ]

  it.each(hostile)('rejects %j', (url) => {
    expect(sanitizeHref(url)).toBe('')
    expect(sanitizeImageSrc(url)).toBe('')
  })

  it('allows http(s), mailto, tel, and relative links', () => {
    for (const ok of [
      'https://example.com/a?b=1&c=2#d',
      'http://example.com',
      'mailto:a@b.c',
      'tel:+123',
      '/relative/path',
      './x',
      '#anchor',
      '?q=1',
      '//cdn.example.com/x',
    ]) {
      expect(sanitizeHref(ok)).toBe(ok)
    }
  })

  it('strips control characters from an otherwise-safe URL', () => {
    expect(sanitizeHref('https://a.com/\x00x\x1f')).toBe('https://a.com/x')
  })

  it('data:image is an image source, not a link destination', () => {
    expect(sanitizeImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(sanitizeHref('data:image/png;base64,AAAA')).toBe('')
  })

  it('is idempotent', () => {
    for (const u of ['https://a.com/x y', 'mailto:a@b.c', '/p', JS]) {
      expect(sanitizeHref(sanitizeHref(u))).toBe(sanitizeHref(u))
    }
  })
})

describe('inline link runs carry only sanitized hrefs', () => {
  it('an unsafe inline href degrades the run to plain text', () => {
    const runs = getInlineRuns(['a ', Link({ href: JS, children: ['x'] }), ' b'])
    expect(runs).toEqual([{ text: 'a x b' }])
  })
})

describe('pdf / docx link annotations are sanitized', () => {
  const doc = () =>
    wrap(
      Link({ href: JS, children: ['standalone'] }),
      Button({ href: 'javascript:alert(2)', children: ['btn'] }),
      Text({ children: ['see ', Link({ href: 'javascript:alert(3)', children: ['inline'] })] }),
    )

  it('pdf emits no javascript: URI action', async () => {
    const s = await asText(doc(), 'pdf')
    expect(s).not.toMatch(/javascript/i)
    // control: the same doc with a SAFE href does carry a URI action, so
    // the absence above is not an artifact of how the PDF is encoded
    const safe = await asText(wrap(Link({ href: 'https://safe.example/x', children: ['s'] })), 'pdf')
    expect(safe).toContain('https://safe.example/x')
  })

  it('docx emits no javascript: hyperlink target', async () => {
    const out = (await render(doc(), 'docx')) as Uint8Array
    const dump = unzipDump(out, 'inj.docx')
    expect(dump).not.toMatch(/javascript/i)
    expect(dump).toContain('inline')
  })
})

describe('markdown-family link destinations cannot break out', () => {
  const breakout = 'https://a.com/x) [evil](javascript:alert(1)'

  for (const format of ['md', 'teams', 'discord'] as const) {
    it(`${format}: a ) in the href does not open a second link`, async () => {
      const out = await asText(wrap(Link({ href: breakout, children: ['ok'] })), format)
      expect(out).not.toMatch(/\]\(javascript:/)
      expect(out).not.toMatch(/\[evil\]\(/)
    })
  }

  it('md: a ] in the label does not close the label early', async () => {
    const out = await asText(
      wrap(Link({ href: 'https://ok.com', children: ['x](javascript:alert(1)) [y'] })),
      'md',
    )
    // an UNESCAPED `](` followed by the payload would be a live second link
    expect(out).not.toMatch(/(?<!\\)\]\(javascript:/)
    expect(out).toContain('(https://ok.com)')
  })

  it('md: image src with ) cannot break out', async () => {
    const out = await asText(wrap(Image({ src: 'https://a.com/i.png) ![x](javascript:1' })), 'md')
    expect(out).not.toMatch(/\]\(javascript:/)
  })
})

describe('slack <url|label> cannot be broken by the URL', () => {
  it('a > or | in the href does not end the link and inject <!channel>', async () => {
    const href = 'https://a.com/?x=1><!channel>|y'
    for (const node of [
      Link({ href, children: ['l'] }),
      Text({ children: ['see ', Link({ href, children: ['l'] })] }),
    ]) {
      const out = JSON.parse(await asText(wrap(node), 'slack')) as {
        blocks: { text: { text: string } }[]
      }
      const mrkdwn = out.blocks.map((b) => b.text.text).join('\n')
      expect(mrkdwn).not.toContain('<!channel>')
      // exactly one link token, whose URL part holds no raw | or >
      expect(mrkdwn.match(/<[^>]*>/g)).toHaveLength(1)
    }
  })
})

describe('markdown text is escaped', () => {
  it('raw HTML in text / heading / list is not live', async () => {
    const payload = '<img src=x onerror=alert(1)>'
    const out = await asText(
      wrap(
        Heading({ children: [payload] }),
        Text({ children: [payload] }),
        List({ children: [ListItem({ children: [payload] })] }),
        Table({ columns: ['c'], rows: [[payload]] }),
      ),
      'md',
    )
    // `\<img` renders as the literal text `<img`; only an UNESCAPED `<`
    // opens raw HTML.
    expect(out).not.toMatch(/(?<!\\)<img/)
    expect(out).toContain('\\<img')
  })

  it('markdown metacharacters in text do not create structure', async () => {
    const out = await asText(wrap(Text({ children: ['# not a heading\n- not a list [a](b)'] })), 'md')
    expect(out).not.toMatch(/^# not/m)
    expect(out).not.toMatch(/^- not/m)
    expect(out).not.toMatch(/(?<!\\)\[a\]\(b\)/)
  })

  it('code block content is emitted verbatim (not escaped)', async () => {
    const out = await asText(wrap(Code({ children: ['a *b* <c>'] })), 'md')
    expect(out).toContain('a *b* <c>')
  })
})

describe('code fences cannot be closed by content', () => {
  const content = 'before\n```\n# escaped heading\n```'

  it('md: the fence is longer than any backtick run in the content', async () => {
    const out = await asText(wrap(Code({ language: 'js', children: [content] })), 'md')
    expect(out).toMatch(/^````js$/m)
    expect(out).toMatch(/^````$/m)
    // the content's own ``` line is inside the block, verbatim
    expect(out).toContain('\n```\n# escaped heading\n```\n````')
  })

  it('md: the language cannot inject a newline / backticks', async () => {
    const out = await asText(
      wrap(Code({ language: 'js\n# evil', children: ['x'] })),
      'md',
    )
    expect(out).not.toMatch(/^# evil/m)
  })

  for (const format of ['slack', 'whatsapp', 'discord', 'teams'] as const) {
    it(`${format}: a literal \`\`\` in code content does not end the block`, async () => {
      const raw = await asText(wrap(Code({ children: [content] })), format)
      const text = format === 'whatsapp' ? raw : allStrings(JSON.parse(raw)).join('\n')
      const fences = text.match(/```/g) ?? []
      expect(fences.length, `${format} output:\n${raw}`).toBe(2)
    })
  }
})

describe('csv', () => {
  it('neutralises formula-leading cells (header and body)', async () => {
    const out = await asText(
      wrap(
        Table({
          columns: ['=HYPERLINK("http://evil")'],
          rows: [['+1+1'], ['-2+3'], ['@SUM(A1)'], ['\tx'], ['\ry'], [-5]],
        }),
      ),
      'csv',
    )
    const lines = out.split(/\n(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    for (const line of lines) {
      if (!line) continue
      expect(line, `line ${JSON.stringify(line)}`).not.toMatch(/^"?[=+@\t\r]/)
      if (line !== '-5') expect(line).not.toMatch(/^"?-/)
    }
    // A real number is not text-prefixed.
    expect(out).toContain('\n-5\n')
  })

  it('a cell containing only \\r is quoted', async () => {
    const out = await asText(wrap(Table({ columns: ['a'], rows: [['x\ry']] })), 'csv')
    expect(out).toContain('"x\ry"')
  })

  it('a newline in the caption does not inject a row', async () => {
    const out = await asText(
      wrap(Table({ columns: ['a'], rows: [['1']], caption: 'cap\n=evil(),x' })),
      'csv',
    )
    // the caption is ONE quoted record; the header is the next record
    expect(out.startsWith('"# cap\n=evil(),x"\na\n')).toBe(true)
  })
})

describe('google-chat / teams list items are escaped like every other text', () => {
  it('google-chat list item < > & are XML-escaped', async () => {
    const out = await asText(
      wrap(List({ children: [ListItem({ children: ['<b>x</b>'] })] })),
      'google-chat',
    )
    expect(out).not.toContain('<b>x</b>')
  })

  it('teams list item markdown toggles are escaped', async () => {
    const out = await asText(
      wrap(List({ children: [ListItem({ children: ['*not bold*'] })] })),
      'teams',
    )
    expect(out).toContain('\\\\*not bold\\\\*')
  })
})

describe('email target=_blank carries rel=noopener', () => {
  it('link and button', async () => {
    const out = await asText(
      wrap(
        Link({ href: 'https://a.com', children: ['l'] }),
        Button({ href: 'https://b.com', children: ['b'] }),
      ),
      'email',
    )
    const blanks = out.match(/<a [^>]*target="_blank"[^>]*>/g) ?? []
    expect(blanks.length).toBeGreaterThanOrEqual(2)
    for (const tag of blanks) expect(tag).toContain('rel="noopener noreferrer"')
  })
})

describe('a sanitized-away href degrades to the plain label', () => {
  for (const format of ['md', 'whatsapp', 'discord', 'teams', 'slack', 'text', 'telegram', 'google-chat'] as const) {
    it(`${format}: no empty link shell`, async () => {
      const out = await asText(
        wrap(
          Link({ href: JS, children: ['LabelOnly'] }),
          Button({ href: JS, children: ['ButtonOnly'] }),
        ),
        format,
      )
      expect(out).toContain('LabelOnly')
      expect(out).not.toContain('()')
      expect(out).not.toMatch(/LabelOnly: ?(\\n|\n|$)/)
      expect(out).not.toContain('<|')
      expect(out).not.toContain('href=""')
      expect(out).not.toMatch(/"url": ""/)
      expect(out).not.toMatch(/javascript/i)
    })
  }
})

describe('edge shapes', () => {
  it('an out-of-range numeric reference is left as-is', () => {
    // (a consumer decodes it to U+FFFD, which never forms a scheme)
    expect(sanitizeHref('https://a.com/&#99999999;')).toBe('https://a.com/&#99999999;')
  })

  it('a URL made only of controls / whitespace is empty', () => {
    expect(sanitizeHref('\x00\x01 ')).toBe('')
    expect(sanitizeImageSrc('\x00\t')).toBe('')
  })

  it('md: ordered-list numbers and 4-space indents at line start are neutralised', async () => {
    const out = await asText(wrap(Text({ children: ['1. one\n    indented code?'] })), 'md')
    expect(out).toContain('1\\. one')
    expect(out).not.toMatch(/^ {4}indented/m)
  })

  it('notion: an empty paragraph still has one (empty) rich_text item', async () => {
    const out = JSON.parse(await asText(wrap(Text({ children: [] })), 'notion')) as {
      children: { paragraph: { rich_text: unknown[] } }[]
    }
    expect(out.children[0]!.paragraph.rich_text).toHaveLength(1)
  })

  it('inline runs ignore empty text children', () => {
    expect(getInlineRuns(['', Link({ href: 'https://a.com', children: ['l'] }), ''])).toEqual([
      { text: 'l', href: 'https://a.com' },
    ])
  })
})
