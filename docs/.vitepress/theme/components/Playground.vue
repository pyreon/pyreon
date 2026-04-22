<script setup lang="ts">
import { ref, onMounted, watch, nextTick, useSlots } from 'vue'

const props = defineProps<{
  /** Initial source code (alternative to default slot) */
  code?: string
  /** Title shown above the editor */
  title?: string
  /** Height of the preview iframe in px */
  height?: number
}>()

const slots = useSlots()

function getInitialCode(): string {
  // Prefer slot content (avoids Vue template parsing issues with special chars)
  if (slots.default) {
    const vnodes = slots.default()
    const text = vnodes.map((vn: any) => (typeof vn.children === 'string' ? vn.children : '')).join('')
    if (text.trim()) return text.trim()
  }
  return (props.code ?? '').trim()
}

const source = ref(getInitialCode())
const iframeRef = ref<HTMLIFrameElement | null>(null)
const isRunning = ref(false)
const error = ref('')

/**
 * Build the iframe srcdoc that:
 * 1. Imports Pyreon from ESM CDN (esm.sh)
 * 2. Compiles JSX via a simple transform (template literal → h calls)
 * 3. Runs the user code in a sandbox
 */
function buildSrcdoc(code: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; padding: 12px; color: #1a1a2e; background: #fff; }
  button { cursor: pointer; padding: 6px 16px; border: 1px solid #ddd; border-radius: 6px; background: #f8f9fa; font-size: 14px; }
  button:hover { background: #e9ecef; }
  button:active { background: #dee2e6; }
  .output { padding: 8px; border: 1px solid #eee; border-radius: 4px; margin-top: 8px; min-height: 24px; font-size: 14px; }
  .error { color: #dc3545; font-family: monospace; font-size: 13px; white-space: pre-wrap; }
</style>
</head>
<body>
<div id="app"></div>
<script type="module">
import { signal, computed, effect, batch } from 'https://esm.sh/@pyreon/reactivity@0.13.1'

// Minimal h() for playground — renders to real DOM
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
      } else if (key === 'class') {
        el.className = String(val)
      } else if (key === 'style' && typeof val === 'object') {
        Object.assign(el.style, val)
      } else {
        el.setAttribute(key, String(val))
      }
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue
    if (typeof child === 'function') {
      // Reactive text node
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
  document.getElementById('app').innerHTML = '<pre class="error">' + String(err) + '</pre>'
}
<\/script>
</body>
</html>`
}

function run() {
  isRunning.value = true
  error.value = ''
  nextTick(() => {
    if (iframeRef.value) {
      iframeRef.value.srcdoc = buildSrcdoc(source.value)
    }
    isRunning.value = false
  })
}

onMounted(() => {
  run()
})
</script>

<template>
  <div class="playground">
    <div class="playground-header">
      <span class="playground-title">{{ title || 'Live Example' }}</span>
      <button class="playground-run" @click="run" :disabled="isRunning">
        &#9654; Run
      </button>
    </div>
    <div class="playground-body">
      <div class="playground-editor">
        <textarea
          v-model="source"
          spellcheck="false"
          @keydown.ctrl.enter="run"
          @keydown.meta.enter="run"
        />
      </div>
      <div class="playground-preview">
        <iframe
          ref="iframeRef"
          sandbox="allow-scripts allow-modals"
          :style="{ height: (height || 120) + 'px' }"
        />
      </div>
    </div>
    <div v-if="error" class="playground-error">{{ error }}</div>
  </div>
</template>

<style scoped>
.playground {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  margin: 16px 0;
  background: var(--vp-c-bg-soft);
}
.playground-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
}
.playground-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.playground-run {
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-brand-1);
  color: #fff;
  cursor: pointer;
  font-weight: 500;
}
.playground-run:hover {
  opacity: 0.9;
}
.playground-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 120px;
}
@media (max-width: 640px) {
  .playground-body {
    grid-template-columns: 1fr;
  }
}
.playground-editor {
  border-right: 1px solid var(--vp-c-divider);
}
.playground-editor textarea {
  width: 100%;
  height: 100%;
  min-height: 150px;
  resize: vertical;
  border: none;
  padding: 12px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.6;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  outline: none;
  tab-size: 2;
}
.playground-preview iframe {
  width: 100%;
  border: none;
  background: #fff;
}
.playground-error {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--vp-c-danger-1);
  font-family: var(--vp-font-family-mono);
  border-top: 1px solid var(--vp-c-divider);
}
</style>
