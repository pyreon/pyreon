// The error bodies the native CRUD lowering must read EXACTLY as the web's `createFetcher` does.
//
// One corpus, two executions: `native-error-parity.test.tsx` (this package) runs it through the REAL web hook
// (`useCreate().mutateAsync`, so the real `@pyreon/http` client and `createFetcher`'s extraction), and the native
// compiler's `native-feature-web-parity.test.ts` runs it through the SHIPPED `PyreonHttpResponse.messageError` on Swift
// and Kotlin. Both assert the `message` / `errors` below, so the three agree by construction rather than by review.
//
// Every case is a create (`POST <api>`), whose message URL is the `api` as written.

export const ERROR_API = 'https://api.example.com/todos'

export interface ErrorCase {
  readonly name: string
  readonly status: number
  /** The raw response body. */
  readonly body: string
  /** The thrown error's `message`. */
  readonly message: string
  /** The JSON text of the error's `errors` (natively the text itself; on the web the parsed value), when present. */
  readonly errors?: string
}

const fallback = (status: number): string => `POST ${ERROR_API} failed: ${status}`

export const ERROR_CASES: readonly ErrorCase[] = [
  { name: 'empty body', status: 500, body: '', message: fallback(500) },
  { name: 'the body message', status: 422, body: '{"message":"Title is required"}', message: 'Title is required' },
  { name: 'an empty message is falsy', status: 400, body: '{"message":""}', message: fallback(400) },
  { name: 'an HTML error page', status: 502, body: '<html><body>Bad gateway</body></html>', message: fallback(502) },
  { name: 'invalid JSON (trailing comma)', status: 400, body: '{"message":"x",}', message: fallback(400) },
  { name: 'invalid JSON after the message', status: 400, body: '{"message":"x"} trailing', message: fallback(400) },
  { name: 'a duplicate key keeps its last value', status: 409, body: '{"message":"first","message":"second"}', message: 'second' },
  {
    name: 'escapes decode',
    status: 400,
    body: '{"message":"caf\\u00e9 \\"q\\" \\\\ \\/ \\ud83d\\ude42\\n"}',
    message: 'café "q" \\ / 🙂\n',
  },
  { name: 'whitespace around the object', status: 403, body: ' \n {"message" : "spaced"} \r\n', message: 'spaced' },
  { name: 'a nested message is not read', status: 400, body: '{"error":{"message":"inner"}}', message: fallback(400) },
  { name: 'a non-object body has no message', status: 422, body: '[{"message":"x"}]', message: fallback(422) },
  { name: 'a JSON null body', status: 500, body: 'null', message: fallback(500) },
  {
    name: 'errors alongside the message',
    status: 422,
    body: '{"message":"Invalid","errors":{"title":["required"],"n":[1,2.5e3,-0.5,true,null]}}',
    message: 'Invalid',
    errors: '{"title":["required"],"n":[1,2.5e3,-0.5,true,null]}',
  },
  { name: 'errors without a message', status: 422, body: '{"errors":["a"]}', message: fallback(422), errors: '["a"]' },
  { name: 'falsy errors (0) are absent', status: 422, body: '{"message":"m","errors":0}', message: 'm' },
  { name: 'falsy errors ("") are absent', status: 422, body: '{"errors":""}', message: fallback(422) },
  { name: 'falsy errors (false) are absent', status: 422, body: '{"errors":false}', message: fallback(422) },
  { name: 'falsy errors (null) are absent', status: 422, body: '{"errors":null}', message: fallback(422) },
  { name: 'truthy scalar errors', status: 422, body: '{"errors":"bad"}', message: fallback(422), errors: '"bad"' },
]
