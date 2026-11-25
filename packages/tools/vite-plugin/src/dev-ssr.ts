/* oxlint-disable max-params -- moved verbatim out of index.ts (where the readable baseline covered it) to take it off the public entry */
/**
 * Dev-server SSR request handling: turns a Node request into a web `Request`,
 * runs the app's server entry through Vite's `ssrLoadModule`, and writes the
 * transformed HTML back.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'

/**
 * The request URL for a raw request-target: the ORIGIN from `origin` only,
 * the target only as a path + query. Never `new URL(target, origin)`: that
 * resolves `//other.host/x` (and an absolute-form `http://other.host/x`) to
 * another origin, which handlers read as the request's own. `null` when the
 * Host cannot form a URL. Same contract as `@pyreon/zero`'s
 * `requestUrlFromTarget` (adapters/request-runtime.ts).
 * @internal
 */
export function _requestUrlFromTarget(target: string | undefined, origin: string): URL | null {
  let t = target || '/'
  if (t.charCodeAt(0) !== 47) {
    if (/^[a-z][a-z\d+.-]*:/i.test(t)) {
      try {
        const abs = new URL(t)
        t = abs.pathname.charCodeAt(0) === 47 ? abs.pathname + abs.search : '/'
      } catch {
        t = '/'
      }
    } else {
      t = '/'
    }
  }
  if (/[/?#@\\\s]/.test(origin.slice(origin.indexOf('//') + 2))) return null
  try {
    const url = new URL(origin + t)
    return url.origin === new URL(origin).origin ? url : null
  } catch {
    return null
  }
}

export async function _handleSsrRequest(
  server: ViteDevServer,
  entry: string,
  url: string,
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
): Promise<void> {
  const mod = await server.ssrLoadModule(entry)
  const handler = mod.handler ?? mod.default

  if (typeof handler !== 'function') {
    next()
    return
  }

  const fullUrl =
    _requestUrlFromTarget(url, `http://${req.headers.host ?? 'localhost'}`) ??
    (_requestUrlFromTarget(url, 'http://localhost') as URL)
  const request = new Request(fullUrl.href, {
    method: req.method ?? 'GET',
    headers: Object.entries(req.headers).reduce((h, [k, v]) => {
      if (v) h.set(k, Array.isArray(v) ? v.join(', ') : v)
      return h
    }, new Headers()),
  })

  const response: Response = await handler(request)
  let html = await response.text()

  html = await server.transformIndexHtml(url, html)

  res.statusCode = response.status
  response.headers.forEach((v, k) => {
    res.setHeader(k, v)
  })
  res.end(html)
}
