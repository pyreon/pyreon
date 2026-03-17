import { lazy, Suspense, useState } from "react"
import Demo from "./Demo"

const LazyHeavy = lazy(
  () =>
    new Promise<{ default: (props: Record<string, never>) => any }>((resolve) => {
      setTimeout(() => {
        resolve({
          default: () => <p>Lazy component loaded!</p>,
        })
      }, 1000)
    }),
)

export default function LazyDemo() {
  const [show, setShow] = useState(false)

  return (
    <Demo
      title="Code Splitting"
      apis="lazy, Suspense"
      code={`const LazyComponent = lazy(
  () => import("./HeavyComponent")
);

<Suspense fallback={<p>Loading...</p>}>
  <LazyComponent />
</Suspense>`}
    >
      <button type="button" onClick={() => setShow(true)}>
        Load Component (1s delay)
      </button>
      {show ? (
        <Suspense fallback={<p class="muted">Loading...</p>}>
          <LazyHeavy />
        </Suspense>
      ) : null}
    </Demo>
  )
}
