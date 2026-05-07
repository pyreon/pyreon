import { createHandler } from '@pyreon/server'
import App from './App'

// Single static route — islands are embedded inline via JSX.
// `App` itself is rendered as plain SSR HTML; only `<pyreon-island>` regions
// inside the tree hydrate on the client.
const routes = [
  {
    path: '/',
    component: App,
  },
]

export default createHandler({
  App,
  routes,
})
