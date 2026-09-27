import { h } from '@pyreon/core'
import { ping } from '../extra-actions'

export default function Extra() {
  return h('p', { 'data-id': ping.actionId }, 'extra')
}
