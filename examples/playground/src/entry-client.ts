import { routes } from 'virtual:zero/routes'
import { startClient } from '@pyreon/zero/client'
import { batch, computed, effect, signal } from '@pyreon/reactivity'
import { Fragment, h, Show } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'

// Expose Pyreon modules on window for e2e tests
;(window as any).__pyreon = { h, Fragment, Show, mount, signal, computed, effect, batch }

// Don't pass `layout` here — fs-router already wires `_layout.tsx` as a
// nested parent route, so passing the same layout to startClient would
// wrap createApp with the layout AGAIN, mounting it twice in the tree.
// Symptom was duplicate <h1>, duplicate <nav>, and strict-mode locator
// violations in playwright. Same bug class as ssr-showcase (fixed in
// tandem).
startClient({ routes })
