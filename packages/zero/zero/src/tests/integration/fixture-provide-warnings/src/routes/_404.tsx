import { h, type VNodeChild } from '@pyreon/core'

export default function NotFound(): VNodeChild {
  return h('div', null, h('h1', null, 'Page Not Found'))
}
