import { registerErrorHandler } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { App } from './App'
import './style.css'

// Surface silently swallowed component errors in dev
registerErrorHandler((ctx) => {
  console.error(`[Pyreon Error] <${ctx.component}> ${ctx.phase}:`, ctx.error)
})

const container = document.getElementById('app')
if (!container) throw new Error('Missing #app element')

mount(<App />, container)
