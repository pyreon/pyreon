import { useId } from "preact/hooks";
import Demo from "./Demo";

export default function UseIdDemo() {
  const id1 = useId();
  const id2 = useId();

  return (
    <Demo
      title="useId"
      apis="useId"
      code={`const id = useId() // ":r0:"
// Stable unique string per component instance`}
    >
      <p>
        id1: <strong>{id1}</strong>
      </p>
      <p>
        id2: <strong>{id2}</strong>
      </p>
      <p class="muted">Each call returns a unique, stable identifier</p>
    </Demo>
  );
}
