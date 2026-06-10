import { mount } from '@pyreon/runtime-dom'
import { App } from './app'
import { applyStoredTheme } from './state/identity'

// Apply the persisted theme to <html data-theme> before first paint.
applyStoredTheme()

mount(<App />, document.getElementById('app')!)
