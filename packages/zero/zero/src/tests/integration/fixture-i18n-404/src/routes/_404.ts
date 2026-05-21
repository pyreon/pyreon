import { h } from '@pyreon/core'

export default function NotFound() {
  return h('div', { 'data-page': 'not-found' },
    h('h1', null, '404 — i18n Not Found'),
    h('p', null, 'i18n shared 404 — duplicated per locale by expandRoutesForLocales.'),
  )
}
