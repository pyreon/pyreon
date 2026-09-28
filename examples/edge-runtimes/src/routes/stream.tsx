import { type ComponentFn, Suspense } from '@pyreon/core'

async function SlowQuoteImpl() {
  await new Promise((resolve) => setTimeout(resolve, 50))
  return <blockquote data-testid="streamed-quote">EDGE_STREAMED_SENTINEL</blockquote>
}
// An async component is valid at SSR time (the stream renderer awaits it
// inside the Suspense boundary) but is not a `ComponentFn` by type — the same
// cast runtime-server's own streaming suites use.
const SlowQuote = SlowQuoteImpl as unknown as ComponentFn

/**
 * Streamed route — the app runs `ssr: { mode: 'stream' }`, so the shell
 * (with the fallback) flushes first and the Suspense boundary's content
 * arrives as a later chunk with its swap script.
 */
export default function StreamPage() {
  return (
    <section data-testid="stream-page">
      <h1>Stream</h1>
      <Suspense fallback={<p data-testid="stream-fallback">loading…</p>}>
        <SlowQuote />
      </Suspense>
    </section>
  )
}
