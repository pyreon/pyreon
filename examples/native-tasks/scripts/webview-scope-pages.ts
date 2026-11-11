// webview-scope-pages — the loopback pages for the native <WebView> origin-scope
// device proof (#4215). Served by stream-server.ts, so CI's existing server on
// port 8791 is the only thing the iOS and Android lanes need.
//
// TWO ORIGINS from one server: `http://127.0.0.1:8791` (the page the app loads)
// and `http://localhost:8791` (everything else). The host differs, so they are
// different origins to WebKit, Chromium and the hosts' own policy. Both are
// reachable: the iOS Simulator shares the Mac's loopback, and the Android job's
// `adb reverse tcp:8791` serves `localhost` as well as `127.0.0.1`.
//
//   GET  /webview/scope.js?scenario=…&run=…  the main-frame script (below)
//   GET  /webview/main?scenario=…&run=…      a page that runs scope.js
//   GET  /webview/redirect?…                 302 to /webview/main on the OTHER origin
//   ANY  /webview/bounce?…                   303 to /webview/offorigin (a redirect AFTER the pin)
//   GET  /webview/frame                      the cross-origin iframe
//   ANY  /webview/offorigin?run=…            an off-origin page; counts the hit
//   GET  /webview/hits?run=…                 how many times /offorigin was reached
//
// Every outcome goes back over the reverse bridge as one short string, which
// the device test reads in a NATIVE label: asserting inside a WKWebView or an
// Android WebView is what XCUITest and the Compose tree cannot do reliably.
//
// The hit counter is keyed by a per-launch run id, so XCUITest's repetitions
// and relaunches never see each other's hits. It is bounded (oldest run out).

import type { IncomingMessage, ServerResponse } from 'node:http'

export const SAME_ORIGIN = 'http://127.0.0.1:8791'
export const CROSS_ORIGIN = 'http://localhost:8791'

const MAX_RUNS = 256
const hits = new Map<string, number>()

function recordHit(run: string): void {
  if (!hits.has(run) && hits.size >= MAX_RUNS) {
    const oldest = hits.keys().next().value
    if (oldest !== undefined) hits.delete(oldest)
  }
  hits.set(run, (hits.get(run) ?? 0) + 1)
}

// The main-frame script. It waits for the host's data push (which on Android
// arrives after the reverse-bridge shim), reports it, then runs the scenario:
//
//   frames — appends a CROSS-origin iframe, asks it to try every bridge route
//            and to report what it can see, relays that report, then `main:done`.
//   nav    — tries to move the main frame to the other origin by script, by a
//            form POST, and through a same-origin URL the server redirects
//            (GET and POST), waits, then reports its own origin and the
//            server's hit count for the off-origin page. Also shows a link to tap.
//   plain  — only the data report (used by the redirect case).
const SCOPE_JS = `(function () {
  var q = new URLSearchParams((document.currentScript.src.split('?')[1]) || '')
  var run = q.get('run') || '0'
  var scenario = q.get('scenario') || 'plain'
  var SAME = ${JSON.stringify(SAME_ORIGIN)}
  var CROSS = ${JSON.stringify(CROSS_ORIGIN)}
  function post(m) { window.pyreonPostMessage(String(m)) }
  var started = false
  function onData() {
    var d = window.__pyreonData
    if (started || !d || typeof window.pyreonPostMessage !== 'function') return
    started = true
    post('main:data=' + d.secret)
    if (scenario === 'frames') frames()
    else if (scenario === 'nav') nav()
  }
  window.addEventListener('pyreondata', onData)
  var poll = setInterval(function () { if (started) clearInterval(poll); else onData() }, 100)
  function frames() {
    var f = document.createElement('iframe')
    f.src = CROSS + '/webview/frame'
    f.style.cssText = 'width:100%;height:60px;border:0'
    window.addEventListener('message', function (e) {
      if (e.source !== f.contentWindow) return
      if (e.data === 'frame:loaded') { f.contentWindow.postMessage('check', '*'); return }
      post(e.data)
      setTimeout(function () { post('main:done') }, 1500)
    })
    document.body.appendChild(f)
  }
  function nav() {
    var a = document.createElement('a')
    a.href = 'https://example.com/pyreon-webview-scope'
    a.textContent = 'Leave this origin'
    a.style.cssText = 'display:block;padding:40px 8px;font-size:28px'
    document.body.appendChild(a)
    function postTo(url) {
      var form = document.createElement('form')
      form.method = 'POST'
      form.action = url
      document.body.appendChild(form)
      form.submit()
    }
    // Each attempt in turn; one that gets through replaces this page, so the
    // report below never arrives (and the main frame's URL says which one).
    setTimeout(function () { location.href = CROSS + '/webview/offorigin?via=script&run=' + run }, 50)
    setTimeout(function () { postTo(CROSS + '/webview/offorigin?via=post&run=' + run) }, 600)
    // Same-origin requests the SERVER redirects to the other origin.
    setTimeout(function () { location.href = SAME + '/webview/bounce?via=get-redirect&run=' + run }, 1200)
    setTimeout(function () { postTo(SAME + '/webview/bounce?via=post-redirect&run=' + run) }, 1800)
    setTimeout(function () {
      fetch(SAME + '/webview/hits?run=' + run).then(function (r) { return r.text() }).then(function (n) {
        post('nav:still-here origin=' + location.origin + ' hits=' + n)
      }, function (e) { post('nav:hits-failed ' + e) })
    }, 4000)
  }
})()`

// The cross-origin iframe. On 'check' it tries every route a frame could use to
// reach the app — the iOS script-message handler, the Android JS interface
// (with an empty and a null token), a shim of its own, the parent's shim — then
// reports what it could SEE. A `native=webkit` / `native=android` report proves
// the frame really held the native object and called it: only the host's
// frame/origin (iOS) or token (Android) check can have stopped the leak.
const FRAME_HTML = `<!doctype html><html><body style="margin:0;font:12px sans-serif">cross-origin frame<script>
window.addEventListener('message', function (e) {
  if (e.data !== 'check') return
  var w = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.pyreonNative
  var a = window.__pyreonNative
  var parentShim
  try { parentShim = typeof parent.pyreonPostMessage } catch (_) { parentShim = 'blocked' }
  try { if (w) w.postMessage('leak:frame-webkit') } catch (_) {}
  try { if (a) a.postMessage('', 'leak:frame-empty-token') } catch (_) {}
  try { if (a) a.postMessage(null, 'leak:frame-null-token') } catch (_) {}
  try { if (typeof window.pyreonPostMessage === 'function') window.pyreonPostMessage('leak:frame-shim') } catch (_) {}
  try { parent.pyreonPostMessage('leak:frame-parent-shim') } catch (_) {}
  parent.postMessage('frame:native=' + (w ? 'webkit' : a ? 'android' : 'none') +
    ',shim=' + typeof window.pyreonPostMessage + ',data=' + typeof window.__pyreonData +
    ',parent=' + parentShim, '*')
})
parent.postMessage('frame:loaded', '*')
</script></body></html>`

// The page a blocked navigation would have reached. If it ever loads in the
// host it tries every bridge route, so a leak is visible even if the hit
// counter were wrong.
const OFFORIGIN_HTML = `<!doctype html><html><body>off-origin<script>
function leak(m) {
  try { if (typeof window.pyreonPostMessage === 'function') window.pyreonPostMessage(m) } catch (_) {}
  try { window.webkit.messageHandlers.pyreonNative.postMessage(m) } catch (_) {}
  try { window.__pyreonNative.postMessage('', m) } catch (_) {}
}
leak('leak:offorigin')
window.addEventListener('pyreondata', function () { leak('leak:offorigin-data') })
setTimeout(function () { if (window.__pyreonData !== undefined) leak('leak:offorigin-has-data') }, 1500)
</script></body></html>`

function mainHtml(query: string): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;font:16px sans-serif">main<script src="${SAME_ORIGIN}/webview/scope.js?${query}"></script></body></html>`
}

/** Serve a `/webview/*` request. Returns false for any other path. */
export function handleWebViewScope(req: IncomingMessage, res: ServerResponse, path: string): boolean {
  if (!path.startsWith('/webview/')) return false
  const url = new URL(req.url ?? '/', 'http://x')
  const run = url.searchParams.get('run') ?? '0'
  const html = (body: string): void => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(body)
  }
  switch (path) {
    case '/webview/scope.js':
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
      res.end(SCOPE_JS)
      return true
    case '/webview/main':
      html(mainHtml(url.search.slice(1)))
      return true
    case '/webview/redirect':
      // The host's own load follows its server redirects; the origin it LANDS
      // on (here the other one) is the one that gets the data and the bridge.
      res.writeHead(302, { location: `${CROSS_ORIGIN}/webview/landed?${url.search.slice(1)}`, 'cache-control': 'no-store' })
      res.end()
      return true
    case '/webview/landed':
      // Same as /webview/main, but its script comes from its own origin.
      html(mainHtml(url.search.slice(1)).replace(SAME_ORIGIN, CROSS_ORIGIN))
      return true
    case '/webview/bounce':
      // A same-origin URL whose response sends the main frame elsewhere (303,
      // so a POST arrives as a GET).
      req.resume()
      res.writeHead(303, { location: `${CROSS_ORIGIN}/webview/offorigin?${url.search.slice(1)}`, 'cache-control': 'no-store' })
      res.end()
      return true
    case '/webview/frame':
      html(FRAME_HTML)
      return true
    case '/webview/offorigin':
      recordHit(run)
      // Drain a POST body before answering.
      req.resume()
      html(OFFORIGIN_HTML)
      return true
    case '/webview/hits':
      res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' })
      res.end(String(hits.get(run) ?? 0))
      return true
    default:
      res.writeHead(404)
      res.end()
      return true
  }
}
