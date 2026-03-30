import { ErrorBoundary, useState } from "react";
import Demo from "./Demo";

function Bomb(): JSX.Element {
  throw new Error("Boom!");
}

export default function ErrorDemo() {
  const [explode, setExplode] = useState(false);

  return (
    <Demo
      title="Error Handling"
      apis="ErrorBoundary"
      code={`<ErrorBoundary
  fallback={(err) => <p>Caught: {err.message}</p>}
>
  <RiskyComponent />
</ErrorBoundary>`}
    >
      <div class="row">
        <button type="button" onClick={() => setExplode(true)}>
          Trigger Error
        </button>
        <button type="button" onClick={() => setExplode(false)}>
          Reset
        </button>
      </div>
      <ErrorBoundary
        fallback={(err: unknown, _reset: () => void) => (
          <p class="error-msg">Caught: {(err as Error).message}</p>
        )}
      >
        {explode ? <Bomb /> : <p class="muted">No errors yet</p>}
      </ErrorBoundary>
    </Demo>
  );
}
