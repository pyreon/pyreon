import { h } from '@pyreon/core'
import { RouterView } from '@pyreon/router'

// fs-router reads layouts as `import { layout as _N }` — NAMED export.
export function layout() {
  return h(
    'div',
    { 'data-i18n-layout': 'root' },
    h('header', null, h('span', { 'data-i18n-marker': 'true' }, 'i18n root layout')),
    h(RouterView, null),
  )
}
