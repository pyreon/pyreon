/**
 * happy-dom replaces the global `Response` with its own, which has no
 * `bytes()`. Shiki 4.6 inflates its Oniguruma wasm with
 * `new Response(stream).bytes()` at import time, so every test that reaches the
 * highlighter would throw `bytes is not a function`. Node and every browser
 * ship `Response#bytes`, so this only fills the gap in the test environment.
 */
if (typeof Response.prototype.bytes !== 'function') {
  Object.defineProperty(Response.prototype, 'bytes', {
    configurable: true,
    writable: true,
    value: async function bytes(this: Response): Promise<Uint8Array<ArrayBuffer>> {
      return new Uint8Array(await this.arrayBuffer())
    },
  })
}
