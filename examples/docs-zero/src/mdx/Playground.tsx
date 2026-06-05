import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

interface PlaygroundProps {
  code: string
  title?: string
  /** Preview height in px (default 200). */
  height?: number
  /** Layout — `'split'` (side-by-side) or `'stacked'` (preview on top). */
  layout?: 'split' | 'stacked'
}

// Ported from docs/.vitepress/theme/components/Playground.vue.
//
// Same architecture: a textarea-editor (left/top) + a sandboxed iframe
// (right/bottom) that runs the user's code against `@pyreon/reactivity`
// loaded from esm.sh. The iframe's `<script type="module">` carries a
// minimal `h()` / `mount()` shim so the snippets execute against real
// DOM with effect-driven text + attr bindings.
//
// The CSS visual identity (tokens, fonts) lives in `tokens.css` —
// same shared file the rest of the site loads.
export function Playground(props: PlaygroundProps) {
  const code = signal(props.code.trim())
  const layout = props.layout ?? 'split'
  const height = props.height ?? 200

  let iframeEl: HTMLIFrameElement | null = null
  const setIframe = (el: HTMLIFrameElement | null) => {
    iframeEl = el
  }

  const run = () => {
    if (!iframeEl) return
    iframeEl.srcdoc = buildSrcdoc(code(), currentTheme())
  }

  const reset = () => {
    code.set(props.code.trim())
    run()
  }

  onMount(() => {
    run()
    // Re-render the iframe when the host theme flips. `data-theme` on
    // <html> is set by the docs shell pre-paint.
    const observer = new MutationObserver(() => run())
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    })
    return () => observer.disconnect()
  })

  return (
    <div class={`playground playground--${layout}`}>
      {props.title ? <div class="playground__title">{props.title}</div> : null}
      <div class="playground__body">
        <div class="playground__editor">
          <textarea
            class="playground__textarea"
            spellcheck={false}
            value={() => code()}
            onInput={(e: Event) =>
              code.set((e.target as HTMLTextAreaElement).value)
            }
          />
        </div>
        <div class="playground__preview" style={`height: ${height}px`}>
          <iframe
            ref={setIframe}
            class="playground__iframe"
            title={props.title ?? 'Playground'}
            sandbox="allow-scripts"
          />
        </div>
      </div>
      <div class="playground__toolbar">
        <button type="button" onClick={run}>
          Run
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
      </div>
    </div>
  )
}

function currentTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark'
  const t = document.documentElement.getAttribute('data-theme')
  return t === 'light' ? 'light' : 'dark'
}

// Mirrors `buildSrcdoc` from the Vue version — same esm.sh import +
// minimal `h()` / `mount()` shim + same CSS variables so the iframe
// renders against the site's brand tokens.
function buildSrcdoc(code: string, theme: 'dark' | 'light'): string {
  const dark = theme === 'dark'
  const bg = dark ? '#13131A' : '#FAF7F0'
  const fg = dark ? '#E6E0D2' : '#0B0B0F'
  const muted = dark ? '#7F7B8C' : '#8A8696'
  const accent = dark ? '#FF5E1A' : '#C73B05'
  const surface = dark ? '#1A1A22' : '#F4F0E6'
  const border = dark ? '#2A2A35' : '#D8D2C2'
  return `<!DOCTYPE html>
<html data-theme="${dark ? 'dark' : 'light'}">
<head>
<meta charset="utf-8">
<style>
  :root {
    --bg: ${bg}; --fg: ${fg}; --muted: ${muted};
    --accent: ${accent}; --surface: ${surface}; --border: ${border};
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: var(--bg); color: var(--fg); }
  body {
    font-family: 'Space Grotesk', system-ui, -apple-system, sans-serif;
    padding: 16px; font-size: 14px; line-height: 1.5; min-height: 100vh;
  }
  button {
    cursor: pointer; padding: 8px 14px; border: 1px solid var(--border);
    border-radius: 8px; background: var(--surface); color: var(--fg);
    font-family: inherit; font-size: 14px; font-weight: 500;
    transition: background 80ms;
  }
  button:hover { background: var(--accent); color: ${dark ? '#0A0A0E' : '#FFF'}; border-color: var(--accent); }
  input, textarea, select {
    font-family: inherit; font-size: 14px; padding: 6px 10px;
    border: 1px solid var(--border); border-radius: 6px;
    background: var(--surface); color: var(--fg);
  }
  pre.error {
    color: #FF1F8C; font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px; white-space: pre-wrap; padding: 12px;
    background: ${dark ? '#1A0A10' : '#FFF0F4'};
    border: 1px solid #FF1F8C40; border-radius: 6px;
  }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .col { display: flex; gap: 8px; flex-direction: column; }
  .badge {
    display: inline-flex; padding: 2px 8px;
    background: var(--accent); color: ${dark ? '#0A0A0E' : '#FFF'};
    border-radius: 10px; font-size: 12px; font-weight: 600;
  }
  .card {
    padding: 12px; border: 1px solid var(--border);
    border-radius: 8px; background: var(--surface);
  }
  .muted { color: var(--muted); font-size: 13px; }
</style>
</head>
<body>
<div id="app"></div>
<script type="module">
import { signal, computed, effect, batch } from 'https://esm.sh/@pyreon/reactivity@0.13.1'

function h(tag, props, ...children) {
  if (typeof tag === 'function') {
    return tag({ ...props, children: children.length === 1 ? children[0] : children })
  }
  const el = document.createElement(tag)
  if (props) {
    for (const [key, val] of Object.entries(props)) {
      if (key === 'children') continue
      if (key.startsWith('on') && typeof val === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), val)
      } else if (key === 'class' || key === 'className') {
        if (typeof val === 'function') {
          effect(() => { el.className = String(val()) })
        } else el.className = String(val)
      } else if (key === 'style' && typeof val === 'object') {
        Object.assign(el.style, val)
      } else if (typeof val === 'function') {
        effect(() => {
          const v = val()
          if (v === false || v == null) el.removeAttribute(key)
          else el.setAttribute(key, String(v))
        })
      } else {
        el.setAttribute(key, String(val))
      }
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue
    if (typeof child === 'function') {
      const text = document.createTextNode('')
      effect(() => {
        const val = child()
        text.data = val == null || val === false ? '' : String(val)
      })
      el.appendChild(text)
    } else if (child instanceof Node) {
      el.appendChild(child)
    } else {
      el.appendChild(document.createTextNode(String(child)))
    }
  }
  return el
}

function mount(vnode, container) {
  if (vnode instanceof Node) container.appendChild(vnode)
}

try {
${code}
} catch (err) {
  document.getElementById('app').innerHTML = '<pre class="error">' + String(err && err.stack || err) + '</pre>'
}
<\/script>
</body>
</html>`
}
