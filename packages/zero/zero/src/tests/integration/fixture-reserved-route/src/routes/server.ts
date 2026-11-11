import { h } from '@pyreon/core'

// Named after the directory the SSR build writes into `dist/` (#4259).
export default function ServerPage() {
  return h('h1', null, 'RESERVED_FIXTURE_SERVER_PAGE')
}
