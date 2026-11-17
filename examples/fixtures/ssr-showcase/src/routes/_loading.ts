import { h } from '@pyreon/core'

/**
 * Loading spinner shown during route transitions.
 */
export default function Loading() {
  return h('div', { class: 'loading', 'data-testid': 'loading' }, 'Loading...')
}
