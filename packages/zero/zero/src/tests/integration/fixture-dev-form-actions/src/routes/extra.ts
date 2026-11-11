import { h } from '@pyreon/core'
import { defineAction } from '@pyreon/zero/actions'

// Declared on a page NO test renders — only the build-time action manifest
// can make it reachable on a fresh dev server. A page module, so the request
// gate knows which route middleware guards it (this page has none).
export const ping = defineAction(async () => ({ pong: true }))

export default function Extra() {
  return h('p', { 'data-id': ping.actionId }, 'extra')
}
