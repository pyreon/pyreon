// Detect whether the inspected page has Pyreon loaded
let panelCreated = false

function createPanel(): void {
  if (panelCreated) return
  panelCreated = true
  chrome.devtools.panels.create('Pyreon', 'icons/pyreon-32.png', 'panel.html')
}

chrome.devtools.inspectedWindow.eval('!!(window.__PYREON_DEVTOOLS__)', (result, _exceptionInfo) => {
  if (result) {
    createPanel()
  }
})

// Re-check periodically for SPAs that bootstrap asynchronously
let retries = 0
const maxRetries = 10

function retryDetection() {
  if (panelCreated || retries >= maxRetries) return
  retries++

  chrome.devtools.inspectedWindow.eval(
    '!!(window.__PYREON_DEVTOOLS__)',
    (result, _exceptionInfo) => {
      if (result) {
        createPanel()
      } else {
        setTimeout(retryDetection, 500)
      }
    },
  )
}

setTimeout(retryDetection, 1000)
