import { describe, expect, it } from 'vitest'
import { createRichTextEditor } from '../index'
import { htmlToJson, jsonToHtml } from '../html'
import type { JSONContent } from '@tiptap/core'

// The pre-mount / server `html()` is serialized by `jsonToHtml`, not by the
// TipTap engine — so the engine's Link URI allow-list never sees it. Stored
// content with a script URL must not come back out as a live link.
const linked = (href: unknown): JSONContent => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href } }] }],
    },
  ],
})

describe('rich-text serializer URL safety', () => {
  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)',
    'java\tscript:alert(1)',
    '\u0001javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
  ])('jsonToHtml drops an unsafe link href: %j', (href) => {
    expect(jsonToHtml(linked(href))).toBe('<p><a>click</a></p>')
  })

  it('jsonToHtml keeps ordinary hrefs (escaped)', () => {
    expect(jsonToHtml(linked('https://a.example/?x=1&y="2"'))).toBe(
      '<p><a href="https://a.example/?x=1&amp;y=&quot;2&quot;">click</a></p>',
    )
    expect(jsonToHtml(linked('/relative'))).toBe('<p><a href="/relative">click</a></p>')
    expect(jsonToHtml(linked('mailto:a@b.example'))).toBe('<p><a href="mailto:a@b.example">click</a></p>')
  })

  it('SSR / pre-mount editor.html() of stored JSON emits no script link', () => {
    const editor = createRichTextEditor({ content: linked('javascript:alert(document.cookie)') })
    expect(editor.html()).toBe('<p><a>click</a></p>')
  })

  it('htmlToJson judges the entity-DECODED href and drops the link mark', () => {
    const json = htmlToJson('<p><a href="jav&#x61;script:alert(1)">y</a> <a href="/ok">z</a></p>')
    expect(json).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'y' },
            { type: 'text', text: ' ' },
            { type: 'text', text: 'z', marks: [{ type: 'link', attrs: { href: '/ok' } }] },
          ],
        },
      ],
    })
    const editor = createRichTextEditor({ content: '<p>x</p>' })
    editor.json.set(json)
    expect(editor.html()).toBe('<p>y <a href="/ok">z</a></p>')
  })

  it('heading level is clamped to h1..h6 (it is interpolated into a tag name)', () => {
    const doc = (level: unknown): JSONContent => ({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level }, content: [{ type: 'text', text: 't' }] }],
    })
    expect(jsonToHtml(doc(99))).toBe('<h6>t</h6>')
    expect(jsonToHtml(doc(-3))).toBe('<h1>t</h1>')
    expect(jsonToHtml(doc('1 onclick=x'))).toBe('<h1>t</h1>')
    expect(jsonToHtml(doc(3))).toBe('<h3>t</h3>')
  })
})
