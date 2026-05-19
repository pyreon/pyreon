import { createPageWire, isContentWireMessage } from './messages'
import { type DevtoolsComponentEntry, serialize } from './serialize'
import type { HookMessage } from './types'

// --- Pyreon DevTools page-world hook ---
// Injected into the actual page context so it can access window.__PYREON_DEVTOOLS__

interface PyreonDevtools {
  readonly version: string
  getAllComponents(): DevtoolsComponentEntry[]
  highlight(id: string): void
  onComponentMount(cb: (entry: DevtoolsComponentEntry) => void): () => void
  onComponentUnmount(cb: (id: string) => void): () => void
}

declare global {
  interface Window {
    __PYREON_DEVTOOLS__?: PyreonDevtools
  }
}

function postToContent(msg: HookMessage): void {
  window.postMessage(createPageWire(msg), location.origin)
}

function setup(devtools: PyreonDevtools): void {
  // Announce detection
  postToContent({ type: 'pyreon-detected', version: devtools.version })

  // Subscribe to live events
  devtools.onComponentMount((entry) => {
    postToContent({ type: 'component-mount', entry: serialize(entry) })
  })

  devtools.onComponentUnmount((id) => {
    postToContent({ type: 'component-unmount', id })
  })

  // Listen for commands from content script
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return
    if (!isContentWireMessage(event.data)) return

    const msg = event.data.payload

    switch (msg.type) {
      case 'get-all': {
        const entries = devtools.getAllComponents().map(serialize)
        postToContent({ type: 'all-result', entries })
        break
      }
      case 'highlight': {
        if (msg.id) {
          devtools.highlight(msg.id)
        }
        break
      }
    }
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
