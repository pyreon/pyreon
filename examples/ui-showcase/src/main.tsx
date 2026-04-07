import { createRouter, RouterProvider } from '@pyreon/router'
import { mount } from '@pyreon/runtime-dom'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { App } from './App'
import { routes } from './routes'

const router = createRouter({ routes, mode: 'hash' })

const container = document.getElementById('app')
if (!container) throw new Error('Missing #app element')

mount(
  <PyreonUI theme={theme} mode="system">
    <RouterProvider router={router}>
      <App />
    </RouterProvider>
  </PyreonUI>,
  container,
)
