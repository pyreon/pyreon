import { el, list } from '../../factory'

/**
 * Breadcrumb trail. A11y: rendered as a `<nav aria-label="Breadcrumb">`
 * navigation landmark (WAI-ARIA APG Breadcrumb pattern). Mark the current
 * crumb with `aria-current="page"` on its `<BreadcrumbItem>` (a literal
 * string — never a boolean). Both `tag` and `aria-label` are defaults.
 */
const Breadcrumb = list
  .config({ name: 'Breadcrumb' })
  // A11y — a breadcrumb trail is a navigation landmark. WAI-ARIA APG's
  // Breadcrumb pattern wraps the crumbs in `<nav aria-label="Breadcrumb">` so
  // assistive tech exposes it as a distinctly-named navigation region (a page
  // can have several nav landmarks, hence the label). The `list` base's root
  // Element renders as a styled flex container (a plain `<div>` — it provides
  // gap/indent styling, NOT `<ol>/<li>` markup), so setting `tag: 'nav'`
  // cleanly converts the container to the landmark WITHOUT breaking any list
  // structure. Both `tag` and `aria-label` are DEFAULTS — override the label
  // when you have multiple breadcrumb trails. Mark the CURRENT crumb with
  // `aria-current="page"` on its `<BreadcrumbItem>` (it forwards the string
  // through to the DOM; per WAI-ARIA the value must be the string `"page"`,
  // never a boolean, which would render as a value-less `aria-current=""`).
  .attrs({ tag: 'nav', 'aria-label': 'Breadcrumb', contentDirection: 'inline' })
  .theme((t) => ({
    fontSize: t.fontSize.small,
  }))

export default Breadcrumb

/**
 * A single crumb inside a `<Breadcrumb>`. Pass `aria-current="page"` on the
 * current/last crumb — it forwards straight to the DOM as the literal string
 * (never a boolean).
 */
export const BreadcrumbItem = el
  .config({ name: 'BreadcrumbItem' })
  .attrs({ tag: 'span', direction: 'inline', alignY: 'center' })
  .theme((t) => ({
    color: t.color.system.base[500],
    transition: t.transition.fast,
    textDecoration: 'none',
    hover: {
      color: t.color.system.base[700],
    },
    focus: {
      boxShadow: `0 0 0 3px ${t.color.system.primary[200]}`,
      outline: 'none',
      borderRadius: t.borderRadius.small,
    },
    active: {
      color: t.color.system.dark[800],
      fontWeight: t.fontWeight.medium,
    },
  }))
