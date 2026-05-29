import { h, Show, type VNodeChild } from '@pyreon/core'
import { Element } from '@pyreon/elements'
import { useHead } from '@pyreon/head'
import { RouterView } from '@pyreon/router'
import { PyreonUI } from '@pyreon/ui-core'

const theme = {
  rootSize: 16,
  breakpoints: { xs: 0, sm: 576, md: 768 },
  colors: { primary: '#228be6' },
}

function ThemeSwitch(): VNodeChild {
  useHead({ title: 'theme switch tag' })
  return h('button', { 'data-testid': 'theme-switch' }, 'toggle')
}

// THE EXACT reported shape: <Element afterContent={() => <Show when={...}>
//   <ThemeSwitch /></Show>}>. PR #839's resolveSlot wraps this.
function Header(): VNodeChild {
  return h(Element, {
    tag: 'header',
    content: 'Site title',
    afterContent: () => h(Show, { when: true }, h(ThemeSwitch, null)),
  })
}

export function layout(): VNodeChild {
  useHead({ title: 'site title from layout' })
  return h(PyreonUI, { theme }, h(Header, null), h(RouterView, null))
}
