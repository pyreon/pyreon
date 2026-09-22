/**
 * Render a tooltip formatter's HTML into the host's box — safely.
 *
 * An ECharts `formatter` returns HTML (`params.marker` is a styled `<span>`,
 * `<b>` and `<br/>` are everyday), so rendering it as text would show the
 * markup. It is also caller data, so it never reaches `innerHTML`: the string
 * is PARSED (inert — a parsed document runs no script and fetches nothing) and
 * rebuilt node by node from an allow-list. Unknown elements keep their text
 * and lose the element; every attribute but `style` is dropped; `style` keeps
 * only presentational properties, and no value may carry `url(` or
 * `expression(`.
 *
 * Web only: it needs a DOM, which is also the only place a tooltip box exists.
 */

const TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'small', 'sub', 'sup', 'br', 'hr', 'span', 'div', 'p',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'code', 'pre',
])

const STYLE_PROPS = new Set([
  'color', 'background', 'background-color', 'font-weight', 'font-size', 'font-style', 'font-family', 'text-decoration',
  'display', 'width', 'height', 'min-width', 'max-width', 'line-height', 'text-align', 'vertical-align', 'white-space',
  'margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
  'padding', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
  'border', 'border-radius', 'border-color', 'border-width', 'border-style', 'border-bottom', 'border-top',
  'opacity', 'float', 'gap',
])

/** Keep the safe, presentational declarations of a `style` attribute. */
export function safeTooltipStyle(style: string): string {
  const out: string[] = []
  for (const decl of style.split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    const prop = decl.slice(0, i).trim().toLowerCase()
    const value = decl.slice(i + 1).trim()
    if (!STYLE_PROPS.has(prop)) continue
    const lower = value.toLowerCase()
    if (lower.includes('url(') || lower.includes('expression(') || lower.includes('javascript:')) continue
    out.push(`${prop}:${value}`)
  }
  return out.join(';')
}

function copyInto(target: Node, source: Node, doc: Document): void {
  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === 3) {
      target.appendChild(doc.createTextNode(child.textContent ?? ''))
      continue
    }
    if (child.nodeType !== 1) continue
    const el = child as Element
    const tag = el.tagName.toLowerCase()
    if (!TAGS.has(tag)) {
      // An element outside the list keeps its text, never itself — except the
      // two whose TEXT is code, which vanish entirely.
      if (tag !== 'script' && tag !== 'style') copyInto(target, el, doc)
      continue
    }
    const copy = doc.createElement(tag)
    const style = el.getAttribute('style')
    if (style !== null) {
      const safe = safeTooltipStyle(style)
      if (safe !== '') copy.setAttribute('style', safe)
    }
    copyInto(copy, el, doc)
    target.appendChild(copy)
  }
}

/** Replace `box`'s content with the allow-listed rendering of `html`. */
export function renderTooltipHtml(box: HTMLElement, html: string): void {
  const doc = box.ownerDocument
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  box.replaceChildren()
  copyInto(box, parsed.body, doc)
}
