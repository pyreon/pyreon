/**
 * Clone a Response with modified headers.
 * Avoids repeating the `new Response(body, { status, statusText, headers })` pattern.
 */
export function withHeaders(response: Response, modify: (headers: Headers) => void): Response {
  const headers = new Headers(response.headers)
  modify(headers)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
