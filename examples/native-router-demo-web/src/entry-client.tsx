// Entry — boots RouterApp into the #app element via @pyreon/runtime-dom.
//
// Phase R1.3 — the RouterApp source lives in the iOS sibling. Imports
// resolve via path identity, not file duplication: the SAME .tsx file
// renders on web (via Pyreon's JSX runtime + @pyreon/primitives' web
// implementations + @pyreon/router's web runtime) AND compiles to
// SwiftUI (via PMTC's emit table) AND Compose. THREE targets, ONE source.

import { mount } from '@pyreon/runtime-dom'
import { RouterApp } from '../../native-router-demo-ios/src/RouterApp'

const root = document.getElementById('app')
if (root === null) {
  throw new Error('[native-router-demo-web] #app element missing from index.html')
}

mount(RouterApp, root)
