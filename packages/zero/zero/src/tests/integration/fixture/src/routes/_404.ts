import { h } from '@pyreon/core'

export default function NotFound() {
  return h('div', null,
    h('h1', null, '404 — Page Not Found'),
    h('p', null, 'The page you are looking for does not exist.'),
  )
}
