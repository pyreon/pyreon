import { h } from '@pyreon/core'

export default function Home() {
  return h('h1', null, 'Hello from the SSR post-step fixture')
}

export const meta = {
  title: 'Home',
}
