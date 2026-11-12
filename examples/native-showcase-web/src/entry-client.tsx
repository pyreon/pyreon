// Client entry: hydrates the server-rendered markup in #app.
// The app is the shared ../../native-showcase/src/TodayApp.tsx, the same file
// the iOS and Android hosts compile to SwiftUI and Compose.
import { h } from '@pyreon/core'
import { hydrateRoot } from '@pyreon/runtime-dom'
import { TodayApp } from '../../native-showcase/src/TodayApp'

const root = document.getElementById('app')
if (root === null) {
  throw new Error('[native-showcase-web] #app element missing from index.html')
}

hydrateRoot(root, h(TodayApp, {}))
