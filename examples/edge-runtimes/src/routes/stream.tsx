import { Suspense } from '@pyreon/core'

async function SlowQuote() {
  await new Promise((resolve) => setTimeout(resolve, 50))
  return <blockquote data-testid="streamed-quote">EDGE_STREAMED_SENTINEL</blockquote>
}

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
