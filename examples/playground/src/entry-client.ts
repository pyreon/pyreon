import { routes } from 'virtual:zero/routes'
import { startClient } from '@pyreon/zero/client'
import { batch, computed, effect, signal } from '@pyreon/reactivity'
import { Fragment, h, Show } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { layout } from './routes/_layout'

// Expose Pyreon modules on window for e2e tests
;(window as any).__pyreon = { h, Fragment, Show, mount, signal, computed, effect, batch }

startClient({ routes, layout })
