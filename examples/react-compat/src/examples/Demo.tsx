import { useState } from "react"

export default function Demo(props: { title: string; apis: string; code: string; children?: any }) {
  const [showCode, setShowCode] = useState(false)

  return (
    <section class="demo">
      <div class="demo-header">
        <h2>{props.title}</h2>
        <div class="demo-meta">
          <span class="api-tags">{props.apis}</span>
          <button type="button" class="code-toggle" onClick={() => setShowCode((v) => !v)}>
            {showCode ? "Hide Code" : "Show Code"}
          </button>
        </div>
      </div>
      {showCode ? (
        <pre class="code-preview">
          <code>{props.code}</code>
        </pre>
      ) : null}
      {props.children}
    </section>
  )
}
