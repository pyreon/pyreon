// What the web `useFetch(url)` rejects with for a non-2xx — the contract the native lowering is held to. One corpus,
// executed on both sides: `native-fetch-error-parity.test.ts` (this package) runs it through the REAL hook, and the
// native compiler's `native-query-web-parity.test.ts` runs it through the SHIPPED Swift / Kotlin `fetchError`.

/** A `useFetch(url)` that answers non-2xx: the web hook rejects with `[Pyreon] useFetch <url>: HTTP <status>`. */
export interface FetchErrorCase {
  readonly url: string
  readonly status: number
  readonly message: string
}

export const FETCH_ERROR_CASES: readonly FetchErrorCase[] = [
  { url: 'https://api.example.com/quotes.json', status: 404, message: '[Pyreon] useFetch https://api.example.com/quotes.json: HTTP 404' },
  // `useFetch` names the URL as written — the query string is NOT redacted.
  { url: 'https://api.example.com/x?token=s#f', status: 500, message: '[Pyreon] useFetch https://api.example.com/x?token=s#f: HTTP 500' },
  { url: '/relative/path', status: 418, message: '[Pyreon] useFetch /relative/path: HTTP 418' },
]
