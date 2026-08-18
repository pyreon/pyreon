/**
 * Reports what a REAL browser sees. Everything asserted by the spec is a
 * property no node-side test can observe: whether the page is a secure
 * context, and whether the browser consequently DEFINES the gated APIs.
 */
const probe = {
  secureContext: window.isSecureContext,
  protocol: location.protocol,
  // These are `undefined` on an insecure origin — that absence is the entire
  // failure mode `https()` exists to remove.
  hasClipboard: navigator.clipboard !== undefined,
  hasGeolocation: navigator.geolocation !== undefined,
  hasMediaDevices: navigator.mediaDevices !== undefined,
  hasServiceWorker: 'serviceWorker' in navigator,
}

;(window as unknown as { __probe: typeof probe }).__probe = probe
document.querySelector('#app')!.textContent = probe.secureContext ? 'secure' : 'insecure'
