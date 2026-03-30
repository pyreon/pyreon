import { useDeferredValue, useState, useTransition } from "react";
import Demo from "./Demo";

export default function TransitionDemo() {
  const [isPending, startTransition] = useTransition();
  const [count, setCount] = useState(0);
  const deferred = useDeferredValue(42);

  return (
    <Demo
      title="Transitions & Deferred"
      apis="useTransition, useDeferredValue"
      code={`// No-ops in Pyreon (no concurrent mode)
// Kept for API compatibility
const [isPending, startTransition] = useTransition();

startTransition(() => {
  setCount(c => c + 1); // runs immediately
});

const deferred = useDeferredValue(value);
// returns value as-is`}
    >
      <p>
        isPending: <strong>{String(isPending)}</strong> | Deferred: <strong>{deferred}</strong>
      </p>
      <button type="button" onClick={() => startTransition(() => setCount((c) => c + 1))}>
        startTransition ({count})
      </button>
      <p class="muted">Both are no-ops — Pyreon has no concurrent mode</p>
    </Demo>
  );
}
