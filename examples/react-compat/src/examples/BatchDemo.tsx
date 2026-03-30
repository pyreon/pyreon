import { batch, useEffect, useState } from "react";
import Demo from "./Demo";

export default function BatchDemo() {
  const [first, setFirst] = useState("John");
  const [last, setLast] = useState("Doe");
  const [effectRuns, setEffectRuns] = useState(0);

  useEffect(() => {
    setEffectRuns((c) => c + 1);
  }, [first, last]);

  return (
    <Demo
      title="Batched Updates"
      apis="batch"
      code={`const [first, setFirst] = useState("John");
const [last, setLast] = useState("Doe");

// Both updates in a single re-render
batch(() => {
  setFirst("Jane");
  setLast("Smith");
});`}
    >
      <p>
        Name: <strong>{first}</strong> <strong>{last}</strong>
      </p>
      <p class="muted">Effect runs: {effectRuns}</p>
      <button
        type="button"
        onClick={() => {
          batch(() => {
            setFirst((f) => (f === "John" ? "Jane" : "John"));
            setLast((l) => (l === "Doe" ? "Smith" : "Doe"));
          });
        }}
      >
        Swap (batched)
      </button>
    </Demo>
  );
}
