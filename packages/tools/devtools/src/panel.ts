import { createPanelToBackground, isBackgroundForward } from './messages'
import { createPanelApp, type PanelTheme, type PanelTransport } from './panel-app'
import type { HookMessage } from './types'

// --- Extension entry for the panel page ---
// Inside Chrome DevTools the inspected tab comes from `chrome.devtools`.
// Opened as a plain extension page (`panel.html?tabId=N`), the same panel
// attaches to tab N through the same background relay; that is how the
// verification script loads the real panel against a real app, since
// Playwright cannot open the DevTools window itself.

function inspectedTabId(): number | null {
  const fromDevtools = chrome.devtools?.inspectedWindow?.tabId
  if (typeof fromDevtools === 'number') return fromDevtools
  const q = new URLSearchParams(location.search).get('tabId')
  const n = q === null ? Number.NaN : Number.parseInt(q, 10)
  return Number.isFinite(n) ? n : null
}

/** Inside DevTools, follow the DevTools theme; elsewhere `?theme=` or the OS. */
function initialTheme(): PanelTheme {
  const name = chrome.devtools?.panels?.themeName
  if (name === 'dark') return 'dark'
  if (name === 'default') return 'light'
  const q = new URLSearchParams(location.search).get('theme')
  if (q === 'dark' || q === 'light') return q
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

const root = document.getElementById('app')
const tabId = inspectedTabId()
if (!root) {
  throw new Error('[Pyreon] devtools panel: panel.html has no #app element. Rebuild the extension.')
}
if (tabId === null) {
  root.textContent =
    '[Pyreon] This page must be opened from Chrome DevTools (or as panel.html?tabId=<id>).'
} else {
  const port = chrome.runtime.connect({ name: `pyreon-panel-${tabId}` })
  const transport: PanelTransport = {
    send(msg) {
      try {
        port.postMessage(createPanelToBackground(msg))
      } catch {
        // Port closed (extension reloaded); onDisconnect reports it.
      }
    },
    onMessage(cb) {
      port.onMessage.addListener((message: unknown) => {
        if (isBackgroundForward(message)) cb(message.payload as HookMessage)
      })
    },
    onDisconnect(cb) {
      port.onDisconnect.addListener(() => cb())
    },
  }
  const theme = initialTheme()
  document.documentElement.dataset.theme = theme
  const app = createPanelApp(root, transport, { theme })
  // Chrome 99+ reports DevTools theme switches while the panel is open.
  const panels = chrome.devtools?.panels as
    | (typeof chrome.devtools.panels & { setThemeChangeHandler?: (cb: (name: string) => void) => void })
    | undefined
  panels?.setThemeChangeHandler?.((name) => {
    const next: PanelTheme = name === 'dark' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next
    app.setTheme(next)
  })
}
