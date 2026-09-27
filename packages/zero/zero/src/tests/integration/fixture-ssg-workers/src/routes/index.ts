import { h } from '@pyreon/core'
import { recordThread } from '../thread-log'

export const loader = async () => {
  await recordThread('/')
  return { ok: true }
}

export default function Home() {
  return h('main', null, h('h1', null, 'Workers fixture'), h('p', null, 'home'))
}
