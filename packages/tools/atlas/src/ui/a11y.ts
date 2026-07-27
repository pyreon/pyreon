/**
 * Runtime a11y checks — run against the RENDERED preview, not against claims.
 *
 * The previous version of the A11y panel pushed two rows unconditionally:
 *
 *   { status: 'ok', title: 'Semantic role',     note: 'renders a native interactive element' }
 *   { status: 'ok', title: 'Keyboard operable', note: 'focusable and activatable via keyboard' }
 *
 * Neither inspected anything. A component with no role and no keyboard access
 * still reported "3 passing" — a false green, which in an accessibility panel is
 * worse than showing nothing, because it actively tells you not to look.
 *
 * These functions take the real rendered element and answer from it. Everything
 * here is pure (element in, verdict out) so the whole matrix is unit-testable in
 * happy-dom without mounting the workbench.
 *
 * Scope, stated honestly: this is a small set of high-signal structural checks,
 * NOT an axe-core replacement — no contrast maths, no landmark/heading-order
 * analysis, no ARIA-attribute validity table. What it will never do is claim a
 * pass it did not verify: anything it cannot determine reports `unknown`.
 */

export type A11yStatus = 'ok' | 'warn' | 'danger' | 'unknown'

export interface A11yCheck {
  status: A11yStatus
  icon: string
  title: string
  note: string
}

/** Tags that are focusable and operable without any author effort. */
const NATIVELY_INTERACTIVE = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary'])

/** Roles that imply the element is meant to be operated. */
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem',
  'option', 'slider', 'spinbutton', 'textbox', 'combobox',
])

const ICON: Record<A11yStatus, string> = { ok: '✓', warn: '!', danger: '✕', unknown: '?' }

function check(status: A11yStatus, title: string, note: string): A11yCheck {
  return { status, icon: ICON[status], title, note }
}

/**
 * The element the checks should run against: the first ELEMENT child of the
 * preview surface (the component under test), not the surface itself.
 */
export function previewSubject(surface: Element | null | undefined): Element | null {
  return surface?.firstElementChild ?? null
}

/** Does the rendered element carry a semantic role (native tag or explicit)? */
export function checkSemanticRole(el: Element | null): A11yCheck {
  if (!el) return check('unknown', 'Semantic role', 'nothing rendered to inspect')
  const tag = el.tagName.toLowerCase()
  const role = el.getAttribute('role')
  if (role) {
    return INTERACTIVE_ROLES.has(role)
      ? check('ok', 'Semantic role', `explicit role="${role}"`)
      : check('ok', 'Semantic role', `role="${role}"`)
  }
  if (NATIVELY_INTERACTIVE.has(tag)) {
    return check('ok', 'Semantic role', `native <${tag}> carries its own role`)
  }
  // A plain div/span with a click handler is the classic offender.
  const clickable = el.hasAttribute('onclick') || tag === 'div' || tag === 'span'
  return clickable
    ? check(
        'warn',
        'Semantic role',
        `renders <${tag}> with no role — assistive tech announces nothing; use a native element or set role=`,
      )
    : check('ok', 'Semantic role', `<${tag}>`)
}

/** Is the rendered element reachable and operable by keyboard? */
export function checkKeyboardOperable(el: Element | null): A11yCheck {
  if (!el) return check('unknown', 'Keyboard operable', 'nothing rendered to inspect')
  const tag = el.tagName.toLowerCase()
  const tabindexAttr = el.getAttribute('tabindex')
  const tabindex = tabindexAttr === null ? null : Number(tabindexAttr)
  const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'

  if (disabled) {
    // Correct and intentional — a disabled control is meant to be skipped.
    return check('ok', 'Keyboard operable', 'disabled — intentionally not focusable')
  }
  if (tabindex !== null && tabindex < 0) {
    return check('warn', 'Keyboard operable', `tabindex="${tabindexAttr}" removes it from tab order`)
  }
  if (tabindex !== null && tabindex > 0) {
    // Positive tabindex hijacks document order — a real WCAG smell.
    return check('warn', 'Keyboard operable', `positive tabindex="${tabindexAttr}" disrupts natural tab order`)
  }
  if (NATIVELY_INTERACTIVE.has(tag)) {
    return check('ok', 'Keyboard operable', `native <${tag}> is focusable and activatable`)
  }
  if (tabindex === 0) {
    return check('ok', 'Keyboard operable', 'tabindex="0" puts it in the tab order')
  }
  const role = el.getAttribute('role')
  if (role && INTERACTIVE_ROLES.has(role)) {
    return check(
      'danger',
      'Keyboard operable',
      `role="${role}" is interactive but the element is not focusable — add tabindex="0" and a key handler`,
    )
  }
  return check('ok', 'Keyboard operable', 'non-interactive content — nothing to operate')
}

/**
 * Does the element expose an accessible name?
 *
 * Text content counts (that is how a `<button>Save</button>` is named), as do
 * `aria-label`, `aria-labelledby`, `title` and `alt`.
 */
export function checkAccessibleName(el: Element | null): A11yCheck {
  if (!el) return check('unknown', 'Accessible name', 'nothing rendered to inspect')
  const tag = el.tagName.toLowerCase()
  const aria = el.getAttribute('aria-label')?.trim()
  const labelledby = el.getAttribute('aria-labelledby')?.trim()
  const title = el.getAttribute('title')?.trim()
  const alt = el.getAttribute('alt')?.trim()
  const text = (el.textContent ?? '').trim()

  if (aria) return check('ok', 'Accessible name', `aria-label="${aria}"`)
  if (labelledby) return check('ok', 'Accessible name', `aria-labelledby="${labelledby}"`)
  if (alt) return check('ok', 'Accessible name', `alt="${alt}"`)
  if (text) return check('ok', 'Accessible name', `named by its text content`)
  if (title) return check('warn', 'Accessible name', 'named only by title= — unreliable on touch devices')

  const interactive = NATIVELY_INTERACTIVE.has(tag) || INTERACTIVE_ROLES.has(el.getAttribute('role') ?? '')
  return interactive
    ? check('danger', 'Accessible name', 'interactive element with no name — screen readers announce nothing')
    : check('ok', 'Accessible name', 'presentational — no name required')
}

/** An `<img>` with no `alt` attribute at all is invisible to assistive tech. */
export function checkImageAlt(el: Element | null): A11yCheck | null {
  if (!el) return null
  const imgs = [
    ...(el.tagName.toLowerCase() === 'img' ? [el] : []),
    ...Array.from(el.querySelectorAll('img')),
  ]
  if (imgs.length === 0) return null
  const missing = imgs.filter((i) => !i.hasAttribute('alt'))
  return missing.length === 0
    ? check('ok', 'Image alt text', `${imgs.length} image(s) declare alt`)
    : check('danger', 'Image alt text', `${missing.length} of ${imgs.length} <img> missing an alt attribute`)
}

export interface A11yReport {
  checks: A11yCheck[]
  fails: number
  warns: number
  passes: number
  /** Checks that could not be determined — reported, never counted as passing. */
  unknowns: number
}

/**
 * Run the full set against a rendered preview surface.
 *
 * `surface` is the preview container; the subject is its first element child.
 * When nothing is rendered every check reports `unknown` rather than `ok`.
 */
export function analyzeA11y(surface: Element | null | undefined): A11yReport {
  const el = previewSubject(surface)
  const checks: A11yCheck[] = [
    checkAccessibleName(el),
    checkSemanticRole(el),
    checkKeyboardOperable(el),
  ]
  const img = checkImageAlt(el)
  if (img) checks.push(img)

  const fails = checks.filter((c) => c.status === 'danger').length
  const warns = checks.filter((c) => c.status === 'warn').length
  const unknowns = checks.filter((c) => c.status === 'unknown').length
  return { checks, fails, warns, unknowns, passes: checks.length - fails - warns - unknowns }
}
