import { createBackgroundForward, createBackgroundToContent, isPanelToBackground } from './messages'
import type { HookMessage } from './types'
import { SOURCE } from './types'

// --- Background service worker: routes messages between panel and content script ---

// Panel ports keyed by tabId
const panelPorts = new Map<number, chrome.runtime.Port>()

// Panel connects with name "pyreon-panel-{tabId}"
chrome.runtime.onConnect.addListener((port) => {
  const match = port.name.match(/^pyreon-panel-(\d+)$/)
  const rawTabId = match?.[1]
  if (rawTabId === undefined) return

  const tabId = Number.parseInt(rawTabId, 10)
  panelPorts.set(tabId, port)

  // Panel sends commands -> forward to content script
  port.onMessage.addListener((message: unknown) => {
    if (!isPanelToBackground(message)) return

    chrome.tabs.sendMessage(tabId, createBackgroundToContent(message.payload)).catch(() => {
      // Content script not ready or tab closed — safe to ignore
    })
  })

  // Clean up on disconnect
  port.onDisconnect.addListener(() => {
    panelPorts.delete(tabId)
  })
})

// Content script sends hook messages -> forward to panel port
chrome.runtime.onMessage.addListener(
  (
    message: { source?: string; payload?: HookMessage },
    sender: chrome.runtime.MessageSender,
    _sendResponse: (response?: unknown) => void,
  ) => {
    if (!message || message.source !== SOURCE.content) return
    if (!sender.tab?.id) return

    const tabId = sender.tab.id
    const port = panelPorts.get(tabId)

    if (port && message.payload) {
      try {
        port.postMessage(createBackgroundForward(tabId, message.payload))
      } catch {
        // Port disconnected between check and send — clean up
        panelPorts.delete(tabId)
      }
    }
  },
)
