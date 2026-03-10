import { h } from "@pyreon/core"

export function About() {
  return (
    <div class="card">
      <h2>About Pyreon</h2>
      <p>
        Pyreon is a fine-grained reactive UI framework with no virtual DOM.
        Components run <em>once</em> — signal updates cause surgical DOM patches.
      </p>
      <ul>
        <li>⚡ Signals-based reactivity (like Solid.js)</li>
        <li>🔧 Compiler-first JSX transform</li>
        <li>🖥️ SSR / SSG via renderToString</li>
        <li>📦 Zero runtime VDOM overhead</li>
      </ul>
    </div>
  )
}
