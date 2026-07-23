// gen-editors.ts — bundle REAL CodeMirror + TipTap into the `window.CM` /
// `window.TT` globals the code/rich-text WebView hosts wait for.
//
//   bun scripts/gen-editors.ts   ->  assets/cm.js, assets/tt.js
//
// The `/webview` hosts are engine-agnostic on purpose: CodeMirror 6 and TipTap
// are modular ESM with app-chosen extensions (no single UMD like ECharts), so
// the APP bundles its editor and exposes it as a global the host drives. This
// is that bundling step for the demo — it produces two self-contained IIFEs the
// generated CODE_HOST / RICHTEXT_HOST load via `<script src="./assets/…">`.
//
// The assets are gitignored (large, reproducible). A shipping native app would
// inline them instead — `buildCodeHostHtml({ codemirrorScript: <the IIFE> })`
// for an offline, App-Store-safe page.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(import.meta.dir, '..', 'assets')
mkdirSync(dir, { recursive: true })
const tmp = join(dir, '_entry')
mkdirSync(tmp, { recursive: true })

// --- window.CM (CodeMirror 6) — the `buildCodeHostHtml` contract ---
// `basicSetup` gives editing + line numbers + history; `languageFor` is
// optional (add `@codemirror/lang-*` packages + a name->extension map for
// syntax highlighting). Kept minimal to keep the demo's dep surface small.
const cmEntry = `
import { EditorView } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { basicSetup } from 'codemirror'
window.CM = { EditorView, EditorState, Compartment, basicSetup }
`

// --- window.TT (TipTap) — the `buildRichTextHostHtml` contract ---
const ttEntry = `
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
window.TT = {
  createEditor(el, opts) {
    const editor = new Editor({
      element: el,
      extensions: [StarterKit],
      content: opts.content ?? undefined,
      editable: opts.editable !== false,
      onUpdate: ({ editor }) => opts.onUpdate(editor.getJSON()),
    })
    return {
      // emitUpdate:false so a native-pushed setContent does NOT echo through
      // onUpdate — the host's loop guard depends on it.
      setContent: (c) => editor.commands.setContent(c, { emitUpdate: false }),
      setEditable: (on) => editor.setEditable(on),
      destroy: () => editor.destroy(),
    }
  },
}
`

for (const [name, code] of [['cm', cmEntry], ['tt', ttEntry]] as const) {
  const entry = join(tmp, `${name}.entry.js`)
  writeFileSync(entry, code)
  const res = await Bun.build({
    entrypoints: [entry],
    format: 'iife',
    minify: true,
    target: 'browser',
  })
  if (!res.success) {
    console.error(`[gen-editors] ${name} build failed`, res.logs)
    process.exit(1)
  }
  const out = await res.outputs[0].text()
  await Bun.write(join(dir, `${name}.js`), out)
  console.log(`[gen-editors] wrote assets/${name}.js (${(out.length / 1024).toFixed(0)} KB)`)
}
rmSync(tmp, { recursive: true, force: true })
