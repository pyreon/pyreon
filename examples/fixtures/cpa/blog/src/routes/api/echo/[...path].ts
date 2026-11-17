// Regression canary for the dev API dispatcher's catch-all + streaming
// contract. Pinned in tandem with `e2e/cpa-blog.spec.ts`'s `/api/echo/:path*`
// spec. Two failure modes this fixture catches:
//
//   1. **Catch-all matching.** Pattern `[...path].ts` compiles to URL pattern
//      `/api/echo/:path*`. Pre-fix the dev dispatcher's pre-check used a
//      segment-equal-count match that silently rejected any path with more
//      segments than the pattern (the catch-all's whole point). Multi-segment
//      requests like `/api/echo/foo/bar/baz` 404'd in dev despite working in
//      production. The fix swaps the inline matcher for `matchApiRoute`, which
//      is the same matcher `createApiMiddleware` uses internally.
//
//   2. **Streaming responses.** This handler returns a `Response` constructed
//      from a `ReadableStream` that emits chunks across multiple ticks. A
//      buffered dispatcher (pre-fix `Buffer.from(await response.arrayBuffer())`)
//      would coalesce them into a single write — fine for tiny payloads,
//      but breaks SSE / large downloads / any handler that legitimately
//      streams. The fix pipes via `Readable.fromWeb(...).pipe(res)`, which
//      preserves chunk boundaries and auto-cancels the upstream reader on
//      client disconnect.

export function GET({ params }: { params: { path: string } }) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode(`segments: ${params.path}\n`))
      await new Promise((r) => setTimeout(r, 10))
      controller.enqueue(encoder.encode('chunk-2\n'))
      await new Promise((r) => setTimeout(r, 10))
      controller.enqueue(encoder.encode('chunk-3\n'))
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}
