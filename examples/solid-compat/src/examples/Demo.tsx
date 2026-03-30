import { createSignal, Show } from "solid-js";

export default function Demo(props: { title: string; apis: string; code: string; children?: any }) {
  const [showCode, setShowCode] = createSignal(false);

  return (
    <section class="demo">
      <div class="demo-header">
        <h2>{props.title}</h2>
        <div class="demo-meta">
          <span class="api-tags">{props.apis}</span>
          <button type="button" class="code-toggle" onClick={() => setShowCode((v) => !v)}>
            {showCode() ? "Hide Code" : "Show Code"}
          </button>
        </div>
      </div>
      <Show when={showCode}>
        <pre class="code-preview">
          <code>{props.code}</code>
        </pre>
      </Show>
      {props.children}
    </section>
  );
}
