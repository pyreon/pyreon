import { h } from '@pyreon/core'
import { echo } from '../actions'

export default function Home() {
  return h('h1', { 'data-action': echo.actionId }, 'home')
}
