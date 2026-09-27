import { h } from '@pyreon/core'
import { createPost } from '../actions'

export default function Home() {
  return h('h1', { 'data-action': createPost.actionId }, 'actions fixture')
}
