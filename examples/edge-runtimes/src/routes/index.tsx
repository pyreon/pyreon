import { state } from '@pyreon/core/plain'

/** Home — server-rendered content plus a counter that proves hydration. */
export default function HomePage() {
  let count = state(0)
  return (
    <div data-testid="home-page">
      <h1>EDGE_HOME_SENTINEL</h1>
      <p>Server-rendered by @pyreon/zero on an edge runtime.</p>
      <button type="button" data-testid="increment" onClick={() => { count = count + 1 }}>
        +
      </button>
      <span data-testid="counter-value">{() => String(count)}</span>
    </div>
  )
}

export const meta = { title: 'Home — Edge Runtimes' }
