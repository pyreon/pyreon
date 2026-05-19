import { createPageWire, isContentWireMessage } from './messages'
import { serialize } from './serialize'
import type { HookMessage, PyreonDevtools } from './types'

// --- Pyreon DevTools page-world hook ---
// Injected into the actual page context so it can access
// window.__PYREON_DEVTOOLS__. The `PyreonDevtools` contract + Window
// augmentation live in ./types and are pinned to @pyreon/runtime-dom's
// real exported surface by a compile-time assignability check in
// src/tests/framework-integration.test.ts.

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

  // Announce whether the framework ships the reactive-devtools
  // Foundation. The panel uses this to enable/disable the Signals /
  // Graph / Effects / Profiler / Console tabs (graceful degrade on
  // older @pyreon/runtime-dom).
  const reactive = devtools.reactive
  postToContent({ type: 'reactive-available', available: !!reactive })

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
      case 'toggle-overlay': {
        if (msg.enabled) {
          devtools.enableOverlay()
        } else {
          devtools.disableOverlay()
        }
        break
      }
      case 'reactive-activate': {
        reactive?.activate()
        break
      }
      case 'reactive-deactivate': {
        reactive?.deactivate()
        break
      }
      case 'reactive-poll': {
        if (!reactive) break
        postToContent({
          type: 'reactive-snapshot',
          graph: reactive.getGraph(),
          fires: reactive.getFires(),
        })
        break
      }
      case 'reactive-eval': {
        // The devtools console is an eval surface by definition; this
        // runs in the inspected page's own world (same trust boundary
        // as the browser console the user already has). Bounded,
        // never throws out.
        let ok = true
        let result: string
        try {
          // indirect eval → runs in global (page) scope
          const r = (0, eval)(msg.expr) as unknown
          result =
            typeof r === 'string'
              ? r
              : (() => {
                  try {
                    return JSON.stringify(r) ?? String(r)
                  } catch {
                    return String(r)
                  }
                })()
        } catch (err) {
          ok = false
          result = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
        }
        if (result.length > 2000) result = `${result.slice(0, 2000)}…`
        postToContent({ type: 'reactive-eval-result', ok, result })
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
