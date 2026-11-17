import { h } from '@pyreon/core'

/**
 * Error boundary page.
 */
export default function ErrorPage() {
  return h('div', { class: 'error-page', 'data-testid': 'error-page' },
    h('h1', null, 'Something went wrong'),
    h('p', null, 'An error occurred while rendering this page.'),
  )
}
