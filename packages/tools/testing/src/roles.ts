/**
 * Pragmatic ARIA-role resolution for `getByRole`. Covers the common implicit
 * roles (the ~90% users query) plus explicit `role="…"`. Not a full ARIA
 * spec implementation — that's a large surface with sharp edges; this handles
 * button / link / heading / textbox / checkbox / radio / listitem / list /
 * img / etc., which is what real component tests reach for.
 */

/** Implicit role for an element, or undefined if it has none we model. */
export function implicitRole(el: Element): string | undefined {
  const tag = el.tagName.toLowerCase()
  switch (tag) {
    case 'button':
      return 'button'
    case 'a':
      return el.hasAttribute('href') ? 'link' : undefined
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return 'heading'
    case 'input': {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase()
      if (type === 'checkbox') return 'checkbox'
      if (type === 'radio') return 'radio'
      if (type === 'range') return 'slider'
      if (type === 'number') return 'spinbutton'
      if (['text', 'email', 'tel', 'url', 'password', 'search'].includes(type)) {
        return type === 'search' ? 'searchbox' : 'textbox'
      }
      return undefined
    }
    case 'textarea':
      return 'textbox'
    case 'select':
      return 'combobox'
    case 'ul':
    case 'ol':
      return 'list'
    case 'li':
      return 'listitem'
    case 'img':
      return el.hasAttribute('alt') && el.getAttribute('alt') === '' ? 'presentation' : 'img'
    case 'nav':
      return 'navigation'
    case 'main':
      return 'main'
    case 'header':
      return 'banner'
    case 'footer':
      return 'contentinfo'
    case 'article':
      return 'article'
    case 'table':
      return 'table'
    case 'dialog':
      return 'dialog'
    case 'form':
      return 'form'
    default:
      return undefined
  }
}

export function roleOf(el: Element): string | undefined {
  return el.getAttribute('role')?.trim() || implicitRole(el)
}

/**
 * Accessible name (simplified): `aria-label` → `aria-labelledby` target text →
 * `alt` (img) → trimmed text content. Covers the common cases; not the full
 * accname algorithm.
 */
export function accessibleName(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label')
  if (ariaLabel) return ariaLabel.trim()

  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const root = el.getRootNode() as ParentNode
    const text = labelledBy
      .split(/\s+/)
      .map((id) => (root as Document | ShadowRoot).getElementById?.(id)?.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) return text
  }

  if (el.tagName.toLowerCase() === 'img') {
    const alt = el.getAttribute('alt')
    if (alt) return alt.trim()
  }

  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}
