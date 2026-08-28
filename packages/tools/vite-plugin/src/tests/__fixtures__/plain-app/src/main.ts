import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { App, finish, effectLog } from './App'
import { bump } from './store'

export { bump, finish, effectLog }
export function boot(container: HTMLElement): void {
  mount(h(App, {}), container)
}
