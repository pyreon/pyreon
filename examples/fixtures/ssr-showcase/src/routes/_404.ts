import { h } from '@pyreon/core'

/**
 * Not found page.
 */
export default function NotFoundPage() {
  return h('div', { class: 'not-found', 'data-testid': 'not-found-page' },
    h('h1', null, '404'),
    h('p', null, 'The page you are looking for does not exist.'),
  )
}
