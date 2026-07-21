import { disabledState, el, focusRing } from '../../factory'

const Pagination = el
  .config({ name: 'Pagination' })
  // `<nav>` is a landmark; a page can have several, so each needs a distinguishing
  // accessible name (WAI-ARIA APG Pagination pattern → `aria-label="pagination"`).
  // A DEFAULT — override with your own `aria-label` when you have multiple paginators.
  .attrs({ tag: 'nav', 'aria-label': 'Pagination', direction: 'inline', alignY: 'center', gap: 4 })
  .theme((t) => ({
    fontSize: t.fontSize.small,
  }))
  .sizes((t) => ({
    small: {
      fontSize: t.fontSize.xSmall,
      paddingTop: t.spacing.xxxSmall,
      paddingBottom: t.spacing.xxxSmall,
      paddingLeft: t.spacing.xxSmall,
      paddingRight: t.spacing.xxSmall,
    },
    medium: {
      fontSize: t.fontSize.small,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.xSmall,
      paddingRight: t.spacing.xSmall,
    },
    large: {
      fontSize: t.fontSize.base,
      paddingTop: t.spacing.xxSmall,
      paddingBottom: t.spacing.xxSmall,
      paddingLeft: t.spacing.small,
      paddingRight: t.spacing.small,
    },
  }))

export default Pagination

/**
 * A page button. `state="active"` marks the CURRENT page — announcing it via
 * `aria-current="page"` (the `.attrs()` callback form, the Breadcrumb/NavLink
 * precedent). Always `type="button"` so it never submits a form.
 */
export const PaginationItem = el
  .config({ name: 'PaginationItem' })
  .attrs<{ state?: 'active' }>((props) => ({
    tag: 'button',
    type: 'button',
    'aria-current': props.state === 'active' ? ('page' as const) : undefined,
  }))
  .theme((t) => ({
    minWidth: 32,
    minHeight: 32,
    paddingLeft: t.spacing.xxSmall,
    paddingRight: t.spacing.xxSmall,
    borderRadius: t.borderRadius.base,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: t.color.system.base[700],
    fontSize: t.fontSize.small,
    cursor: 'pointer',
    transition: t.transition.fast,
    hover: { backgroundColor: t.color.system.base[100] },
    focus: focusRing(t),
    disabled: disabledState(),
  }))
  .states((t) => ({
    active: {
      backgroundColor: t.color.system.primary.base,
      color: t.color.system.light.base,
      hover: { backgroundColor: t.color.system.primary[600] },
    },
  }))

/** Previous-page button (localizable default aria-label). */
export const PaginationPrev = PaginationItem.config({ name: 'PaginationPrev' }).attrs({
  'aria-label': 'Previous page',
})

/** Next-page button (localizable default aria-label). */
export const PaginationNext = PaginationItem.config({ name: 'PaginationNext' }).attrs({
  'aria-label': 'Next page',
})

/** Gap marker — decorative, hidden from AT, not focusable. */
export const PaginationEllipsis = el
  .config({ name: 'PaginationEllipsis' })
  .attrs({ tag: 'span', 'aria-hidden': 'true' })
  .theme((t) => ({
    minWidth: 32,
    textAlign: 'center',
    color: t.color.system.base[400],
    fontSize: t.fontSize.small,
  }))
