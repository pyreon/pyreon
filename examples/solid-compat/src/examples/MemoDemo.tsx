import { createMemo, createSignal } from "solid-js";
import Demo from "./Demo";

export default function MemoDemo() {
  const [count, setCount] = createSignal(1);
  const doubled = createMemo(() => count() * 2);
  const quadrupled = createMemo(() => doubled() * 2);

  return (
    <Demo
      title="Derived Values"
      apis="createMemo"
      code={`const [count, setCount] = createSignal(1);
const doubled = createMemo(() => count() * 2);
const quadrupled = createMemo(() => doubled() * 2);

// Memos cache: only recompute when deps change
<span>{doubled()} / {quadrupled()}</span>`}
    >
      <p>
        Count: <strong>{count()}</strong> | Doubled: <strong>{doubled()}</strong> | Quadrupled:{" "}
        <strong>{quadrupled()}</strong>
      </p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
    </Demo>
  );
}
