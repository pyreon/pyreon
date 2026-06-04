import { onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { themeMode } from './ThemeToggle'

interface DocPlaygroundProps {
  title: string
  code: string
  height: number
}

/**
 * Live playground component — code editor on the left, sandboxed iframe
 * preview on the right. The editor uses CodeMirror 6 loaded lazily so
 * pages without playgrounds don't pay for it.
 *
 * The iframe imports @pyreon/reactivity from esm.sh + a minimal h()
 * shim that supports signals as children + attributes. Helper CSS
 * (button/card/badge/row/col) is baked in so demos can read clean
 * without inline-style walls.
 */
export function DocPlayground(props: DocPlaygroundProps) {
  const code = signal(props.code)
  const copiedHint = signal(false)
  let editorContainer: HTMLDivElement | null = null
  let iframeEl: HTMLIFrameElement | null = null
  let cmView: { destroy(): void; dispatch(spec: unknown): void; state: { doc: { length: number; toString(): string } } } | null = null

  function buildSrcdoc(src: string, dark: boolean): string {
    const bg = dark ? '#0A0A0E' : '#FAF7F0'
    const fg = dark ? '#E6E0D2' : '#0B0B0F'
    const muted = dark ? '#7F7B8C' : '#8A8696'
    const accent = dark ? '#FF5E1A' : '#C73B05'
    const surface = dark ? '#1A1A22' : '#F4F0E6'
    const border = dark ? '#2A2A35' : '#D8D2C2'
    return `<!DOCTYPE html><html data-theme="${dark ? 'dark' : 'light'}">
<head><meta charset="utf-8"><style>
  :root { --bg:${bg};--fg:${fg};--muted:${muted};--accent:${accent};--surface:${surface};--border:${border}; }
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:var(--bg);color:var(--fg)}
  body{font-family:'Space Grotesk',system-ui,sans-serif;padding:16px;font-size:14px;line-height:1.5;min-height:100vh}
  button{cursor:pointer;padding:8px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--fg);font-family:inherit;font-size:14px;font-weight:500;transition:background 80ms}
  button:hover{background:var(--accent);color:${dark ? '#0A0A0E' : '#FFF'};border-color:var(--accent)}
  input,textarea,select{font-family:inherit;font-size:14px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--fg)}
  input:focus,textarea:focus,select:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:var(--accent)}
  pre.error{color:#FF1F8C;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12px;white-space:pre-wrap;padding:12px;background:${dark ? '#1A0A10' : '#FFF0F4'};border:1px solid #FF1F8C40;border-radius:6px}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .col{display:flex;gap:8px;flex-direction:column}
  .badge{display:inline-flex;padding:2px 8px;background:var(--accent);color:${dark ? '#0A0A0E' : '#FFF'};border-radius:10px;font-size:12px;font-weight:600}
  .card{padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--surface)}
  .muted{color:var(--muted);font-size:13px}
</style></head><body>
<div id="app"></div>
<script type="module">
import { signal, computed, effect, batch } from 'https://esm.sh/@pyreon/reactivity@0.13.1'
function h(tag, props, ...children) {
  if (typeof tag === 'function') return tag({ ...props, children: children.length === 1 ? children[0] : children })
  const el = document.createElement(tag)
  if (props) for (const [k, v] of Object.entries(props)) {
    if (k === 'children') continue
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k === 'class' || k === 'className') { if (typeof v === 'function') effect(() => { el.className = String(v()) }); else el.className = String(v) }
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
    else if (typeof v === 'function') effect(() => { const x = v(); if (x === false || x == null) el.removeAttribute(k); else el.setAttribute(k, String(x)) })
    else el.setAttribute(k, String(v))
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue
    if (typeof c === 'function') { const t = document.createTextNode(''); effect(() => { const v = c(); t.data = v == null || v === false ? '' : String(v) }); el.appendChild(t) }
    else if (c instanceof Node) el.appendChild(c)
    else el.appendChild(document.createTextNode(String(c)))
  }
  return el
}
function mount(v, c) { if (v instanceof Node) c.appendChild(v) }
try { ${src} } catch (err) {
  document.getElementById('app').innerHTML = '<pre class="error">' + String(err && err.stack || err) + '</pre>'
}
<\/script>
</body></html>`
  }

  function run() {
    if (iframeEl) iframeEl.srcdoc = buildSrcdoc(code(), themeMode() === 'dark')
  }

  function copy() {
    try {
      navigator.clipboard.writeText(code())
      copiedHint.set(true)
      setTimeout(() => copiedHint.set(false), 1200)
    } catch {
      // ignore
    }
  }

  function reset() {
    code.set(props.code)
    if (cmView) {
      cmView.dispatch({ changes: { from: 0, to: cmView.state.doc.length, insert: props.code } })
    }
    run()
  }

  onMount(() => {
    let alive = true
    // Lazy-load CodeMirror so the bundle stays light on pages without playgrounds.
    Promise.all([
      import('@codemirror/state'),
      import('@codemirror/view'),
      import('@codemirror/commands'),
      import('@codemirror/language'),
      import('@codemirror/autocomplete'),
      import('@codemirror/lang-javascript'),
      import('@codemirror/theme-one-dark'),
    ]).then(([state, view, commands, language, autocomplete, langJs, oneDark]) => {
      if (!alive || editorContainer == null) return
      const ext = view.EditorView.theme({
        '&': { height: '100%', fontSize: '13px', fontFamily: 'JetBrains Mono, ui-monospace, monospace' },
        '.cm-content': { padding: '12px 4px', caretColor: '#FF5E1A' },
        '.cm-scroller': { lineHeight: '1.55' },
        '.cm-focused': { outline: 'none' },
        '.cm-line': { padding: '0 8px' },
        '.cm-gutters': {
          background: 'transparent',
          borderRight: '1px solid var(--hairline)',
          color: 'var(--text-dim)',
          fontSize: '11px',
        },
        '.cm-activeLineGutter': { background: 'var(--bg-well)', color: 'var(--text-muted)' },
        '.cm-activeLine': { background: 'transparent' },
      })
      const baseExt = [
        view.lineNumbers(),
        view.highlightActiveLine(),
        commands.history(),
        language.indentOnInput(),
        language.bracketMatching(),
        autocomplete.closeBrackets(),
        autocomplete.autocompletion(),
        language.syntaxHighlighting(language.defaultHighlightStyle, { fallback: true }),
        langJs.javascript({ jsx: true, typescript: true }),
        view.keymap.of([
          ...autocomplete.closeBracketsKeymap,
          ...commands.defaultKeymap,
          ...commands.historyKeymap,
          commands.indentWithTab,
          { key: 'Mod-Enter', run: () => (run(), true) },
        ]),
        view.EditorView.updateListener.of((u) => {
          if (u.docChanged) code.set(u.state.doc.toString())
        }),
        ext,
      ]
      const extensions = themeMode() === 'dark' ? [...baseExt, oneDark.oneDark] : baseExt
      cmView = new view.EditorView({
        state: state.EditorState.create({ doc: code(), extensions }),
        parent: editorContainer,
      })
    })
    run()
  })

  onUnmount(() => {
    cmView?.destroy()
  })

  return (
    <div class="pyr-playground">
      <div class="pyr-pg-header">
        <div class="pyr-pg-title">
          <span class="pyr-pg-icon">▶</span>
          <span>{props.title}</span>
        </div>
        <div class="pyr-pg-actions">
          <button class="pyr-pg-btn" onClick={copy} title="Copy code">
            <span>{() => (copiedHint() ? 'Copied' : 'Copy')}</span>
          </button>
          <button class="pyr-pg-btn" onClick={reset} title="Reset to original">
            <span>Reset</span>
          </button>
          <button class="pyr-pg-btn pyr-pg-run" onClick={run} title="Run (⌘/Ctrl+Enter)">
            <span>Run</span>
          </button>
        </div>
      </div>
      <div class="pyr-pg-body">
        <div class="pyr-pg-pane pyr-pg-editor">
          <div class="pyr-pg-pane-label">CODE</div>
          <div
            class="pyr-pg-cm"
            ref={(el) => {
              editorContainer = el as HTMLDivElement | null
            }}
          />
        </div>
        <div class="pyr-pg-pane pyr-pg-preview">
          <div class="pyr-pg-pane-label">PREVIEW</div>
          <iframe
            sandbox="allow-scripts allow-modals"
            style={{ height: props.height + 'px' }}
            title="Live preview"
            ref={(el) => {
              iframeEl = el as HTMLIFrameElement | null
            }}
          />
        </div>
      </div>
    </div>
  )
}
