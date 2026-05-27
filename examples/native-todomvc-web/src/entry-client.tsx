// Entry — boots TodoApp into the #app element via @pyreon/runtime-dom.
//
// Phase E3 — the TodoApp source lives in the iOS sibling. Imports
// resolve via path identity, not file duplication: the SAME .tsx file
// renders on web (via Pyreon's JSX runtime + @pyreon/primitives'
// auto-imported web implementations) AND compiles to SwiftUI (via
// PMTC's canonical-primitive table) AND Compose (same emit table,
// different target). Three targets, one source.

import { mount } from '@pyreon/runtime-dom'
import { TodoApp } from '../../native-todomvc-ios/src/TodoApp'

const root = document.getElementById('app')
if (root === null) {
  throw new Error('[native-todomvc-web] #app element missing from index.html')
}

mount(TodoApp, root)
