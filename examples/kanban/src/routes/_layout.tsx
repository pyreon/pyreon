import { RouterView } from '@pyreon/router'
import { Toaster } from '@pyreon/toast'
import { installBoardPersistence } from '../lib/board'

// Install board persistence app-wide so card mutations from any route
// reach localStorage. (W15 lesson from HN-clone — scoping persistence
// to a single route loses writes made on other routes.)
installBoardPersistence()

export function layout() {
  return (
    <div class="kanban-app">
      <RouterView />
      <Toaster position="bottom-right" />
    </div>
  )
}
