import { h } from '@pyreon/core'

export default function About() {
  return h('div', null,
    h('h1', null, 'About'),
    h('p', null, 'Integration test page'),
  )
}

export const meta = {
  title: 'About',
}
