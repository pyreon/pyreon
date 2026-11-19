import { provide } from '@pyreon/core'
import { RouterView } from '@pyreon/router'
import { Theme } from '../theme'

export function layout() {
  provide(Theme, 'dark')
  return (
    <div data-testid="shell">
      <RouterView />
    </div>
  )
}
