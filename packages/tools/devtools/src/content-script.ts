import {
  createContentWire,
  isBackgroundToContent,
  isPageWireMessage,
} from './messages'
import { SOURCE } from './types'

// --- Content script: pure bridge between page world and background/panel ---

// 1. Inject page-hook.js into the page's main world
const script = document.createElement('script')
script.src = chrome.runtime.getURL('page-hook.js')
script.onerror = () => {
  // Injection failed — page-hook won't run, devtools panel will show no components
}
script.onload = () => script.remove()
;(document.head || document.documentElement).appendChild(script)

// 2. Relay messages from page (page-hook) -> background service worker
window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return
  if (!isPageWireMessage(event.data)) return

  // Forward the hook message payload to the background
  try {
    chrome.runtime.sendMessage({
      source: SOURCE.content,
      payload: event.data.payload,
    })
  } catch {
    // Extension context invalidated (e.g. extension reloaded) — safe to ignore
  }
})

// 3. Relay messages from background/panel -> page (page-hook)
chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, _sendResponse) => {
    if (!isBackgroundToContent(message)) return

    window.postMessage(createContentWire(message.payload), location.origin)
  },
)
