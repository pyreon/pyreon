<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, useSlots, computed, watch } from 'vue'
import { useData } from 'vitepress'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentOnInput,
} from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import { closeBrackets, autocompletion, closeBracketsKeymap } from '@codemirror/autocomplete'
import { oneDark } from '@codemirror/theme-one-dark'

const props = defineProps<{
  code?: string
  title?: string
  /** Preview height in px (default 200) */
  height?: number
  /** Layout: 'split' (side-by-side) or 'stacked' (preview on top) */
  layout?: 'split' | 'stacked'
}>()

const slots = useSlots()
const { isDark } = useData()

function getInitialCode(): string {
  if (slots.default) {
    const vnodes = slots.default()
    const text = vnodes
      .map((vn: any) => (typeof vn.children === 'string' ? vn.children : ''))
      .join('')
    if (text.trim()) return text.trim()
  }
  return (props.code ?? '').trim()
}

const sourceCode = ref(getInitialCode())
const editorEl = ref<HTMLDivElement | null>(null)
const iframeRef = ref<HTMLIFrameElement | null>(null)
const error = ref('')
const layout = computed(() => props.layout ?? 'split')
const previewHeight = computed(() => props.height ?? 200)

let view: EditorView | null = null
const themeCompartment = new Compartment()

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    fontFamily: 'var(--vp-font-family-mono, ui-monospace, monospace)',
  },
  '.cm-content': {
    padding: '12px 4px',
    caretColor: 'var(--syn-accent-1, #FF5E1A)',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: '1.55',
  },
  '.cm-focused': { outline: 'none' },
  '.cm-line': { padding: '0 8px' },
  '.cm-gutters': {
    background: 'transparent',
    borderRight: '1px solid var(--vp-c-divider)',
    color: 'var(--vp-c-text-3)',
    fontSize: '11px',
  },
  '.cm-activeLineGutter': {
    background: 'var(--vp-c-bg-soft)',
    color: 'var(--vp-c-text-2)',
  },
  '.cm-activeLine': {
    background: 'transparent',
  },
})

function makeExtensions(dark: boolean) {
  return [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    javascript({ jsx: true, typescript: true }),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
      {
        key: 'Mod-Enter',
        run: () => {
          run()
          return true
        },
      },
    ]),
    EditorView.updateListener.of((v) => {
      if (v.docChanged) sourceCode.value = v.state.doc.toString()
    }),
    editorTheme,
    ...(dark ? [oneDark] : []),
  ]
}

function buildSrcdoc(code: string, dark: boolean): string {
  // Tokenized in light theme tokens; iframe inherits same look via these CSS vars.
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
    --bg: ${bg};
    --fg: ${fg};
    --muted: ${muted};
    --accent: ${accent};
    --surface: ${surface};
    --border: ${border};
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: var(--bg); color: var(--fg); }
  body {
    font-family: 'Space Grotesk', system-ui, -apple-system, sans-serif;
    padding: 16px;
    font-size: 14px;
    line-height: 1.5;
    min-height: 100vh;
  }
  button {
    cursor: pointer;
    padding: 8px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--fg);
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    transition: background 80ms;
  }
  button:hover { background: var(--accent); color: ${dark ? '#0A0A0E' : '#FFF'}; border-color: var(--accent); }
  input, textarea, select {
    font-family: inherit;
    font-size: 14px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--fg);
  }
  input:focus, textarea:focus, select:focus {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
    border-color: var(--accent);
  }
  pre.error {
    color: #FF1F8C;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
    white-space: pre-wrap;
    padding: 12px;
    background: ${dark ? '#1A0A10' : '#FFF0F4'};
    border: 1px solid #FF1F8C40;
    border-radius: 6px;
  }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .col { display: flex; gap: 8px; flex-direction: column; }
  .badge {
    display: inline-flex;
    padding: 2px 8px;
    background: var(--accent);
    color: ${dark ? '#0A0A0E' : '#FFF'};
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
  }
  .card {
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }
  .muted { color: var(--muted); font-size: 13px; }
</style>
</head>
<body>
<div id="app"></div>
<script type="module">
import { signal, computed, effect, batch } from 'https://esm.sh/@pyreon/reactivity@0.13.1'

// Minimal h() for playground — renders to real DOM with signal-aware text + attrs
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

function run() {
  error.value = ''
  nextTick(() => {
    if (iframeRef.value) {
      iframeRef.value.srcdoc = buildSrcdoc(sourceCode.value, isDark.value)
    }
  })
}

function reset() {
  sourceCode.value = getInitialCode()
  if (view) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: sourceCode.value } })
  }
  run()
}

async function copy() {
  try {
    await navigator.clipboard.writeText(sourceCode.value)
    copiedHint.value = true
    setTimeout(() => (copiedHint.value = false), 1200)
  } catch {
    /* ignore */
  }
}

const copiedHint = ref(false)

onMounted(() => {
  if (!editorEl.value) return
  view = new EditorView({
    state: EditorState.create({
      doc: sourceCode.value,
      extensions: [themeCompartment.of(makeExtensions(isDark.value))],
    }),
    parent: editorEl.value,
  })
  run()
})

watch(isDark, (dark) => {
  if (view) {
    view.dispatch({
      effects: themeCompartment.reconfigure(makeExtensions(dark)),
    })
  }
  run()
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})
</script>

<template>
  <div class="pyr-playground" :data-layout="layout">
    <div class="pyr-pg-header">
      <div class="pyr-pg-title">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M3 2.5 L13 8 L3 13.5 Z"
            fill="currentColor"
            opacity="0.85"
          />
        </svg>
        <span>{{ title || 'Try it live' }}</span>
      </div>
      <div class="pyr-pg-actions">
        <button class="pyr-pg-btn" @click="copy" title="Copy code">
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
              d="M5 2h7a1 1 0 0 1 1 1v9M3 5h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"
            />
          </svg>
          <span>{{ copiedHint ? 'Copied' : 'Copy' }}</span>
        </button>
        <button class="pyr-pg-btn" @click="reset" title="Reset to original code">
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              d="M3 3.5v3.5h3.5M3 7a5 5 0 1 1 1.5 3.5"
            />
          </svg>
          <span>Reset</span>
        </button>
        <button class="pyr-pg-btn pyr-pg-run" @click="run" title="Run (⌘/Ctrl + Enter)">
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M4 3 L13 8 L4 13 Z" fill="currentColor" />
          </svg>
          <span>Run</span>
        </button>
      </div>
    </div>
    <div class="pyr-pg-body">
      <div class="pyr-pg-pane pyr-pg-editor">
        <div class="pyr-pg-pane-label">CODE</div>
        <div ref="editorEl" class="pyr-pg-cm" />
      </div>
      <div class="pyr-pg-pane pyr-pg-preview">
        <div class="pyr-pg-pane-label">PREVIEW</div>
        <iframe
          ref="iframeRef"
          sandbox="allow-scripts allow-modals"
          :style="{ height: previewHeight + 'px' }"
          title="Live preview"
        />
      </div>
    </div>
    <div v-if="error" class="pyr-pg-error">{{ error }}</div>
  </div>
</template>

<style scoped>
.pyr-playground {
  margin: 24px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: hidden;
  background: var(--vp-c-bg);
  box-shadow: 0 1px 0 var(--vp-c-divider);
}

.pyr-pg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.pyr-pg-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--vp-font-family-mono, ui-monospace, monospace);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}
.pyr-pg-title svg {
  color: var(--syn-accent-1, var(--vp-c-brand-1));
}

.pyr-pg-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.pyr-pg-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  color: var(--vp-c-text-2);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  transition: all 80ms;
}
.pyr-pg-btn:hover {
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  border-color: var(--vp-c-divider);
}
.pyr-pg-run {
  background: var(--syn-accent-1, var(--vp-c-brand-1));
  color: var(--vp-c-bg);
  border-color: var(--syn-accent-1, var(--vp-c-brand-1));
}
.pyr-pg-run:hover {
  background: var(--syn-accent-1, var(--vp-c-brand-1));
  color: var(--vp-c-bg);
  opacity: 0.9;
}

.pyr-pg-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.pyr-playground[data-layout='stacked'] .pyr-pg-body {
  grid-template-columns: 1fr;
}
@media (max-width: 720px) {
  .pyr-pg-body {
    grid-template-columns: 1fr;
  }
}

.pyr-pg-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 200px;
}
.pyr-pg-editor {
  border-right: 1px solid var(--vp-c-divider);
}
@media (max-width: 720px) {
  .pyr-pg-editor {
    border-right: none;
    border-bottom: 1px solid var(--vp-c-divider);
  }
}

.pyr-pg-pane-label {
  position: absolute;
  top: 8px;
  right: 10px;
  font-family: var(--vp-font-family-mono, ui-monospace, monospace);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--vp-c-text-3);
  pointer-events: none;
  user-select: none;
  z-index: 1;
  opacity: 0.6;
}

.pyr-pg-cm {
  flex: 1 1 auto;
  min-height: 200px;
  overflow: auto;
}
.pyr-pg-cm :deep(.cm-editor) {
  height: 100%;
}

.pyr-pg-preview iframe {
  width: 100%;
  border: none;
  background: var(--vp-c-bg);
  display: block;
}

.pyr-pg-error {
  padding: 10px 14px;
  font-size: 12px;
  color: var(--vp-c-danger-1);
  font-family: var(--vp-font-family-mono, ui-monospace, monospace);
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}
</style>
