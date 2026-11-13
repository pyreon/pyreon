import { createHook } from './hook'
import { createPageWire, isContentWireMessage } from './messages'
import type { PyreonDevtools } from './types'

// --- Pyreon DevTools page-world hook ---
// Injected into the actual page context so it can access
// window.__PYREON_DEVTOOLS__. The `PyreonDevtools` contract + Window
// augmentation live in ./types and are pinned to @pyreon/runtime-dom's
// real exported surface by a compile-time assignability check in
// src/tests/framework-integration.test.ts. The request handling lives in
// ./hook so tests drive the same code with an in-memory transport.

function setup(devtools: PyreonDevtools): void {
  const hook = createHook(devtools, {
    emit: (msg) => window.postMessage(createPageWire(msg), location.origin),
    host: location.host,
    console,
    errorTarget: window,
  })

  // Announce detection. A panel that connects later sends `hello` and
  // gets the same answer, so it never depends on having seen this one.
  hook.handle({ type: 'hello' })

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return
    if (!isContentWireMessage(event.data)) return
    hook.handle(event.data.payload)
  })
}

// Try to detect Pyreon immediately, then poll if not found
function tryDetect(): boolean {
  const devtools = window.__PYREON_DEVTOOLS__
  if (devtools) {
    setup(devtools)
    return true
  }
  return false
}

if (!tryDetect()) {
  let attempts = 0
  const maxAttempts = 10
  const interval = setInterval(() => {
    attempts++
    if (tryDetect() || attempts >= maxAttempts) {
      clearInterval(interval)
    }
  }, 500)
}
