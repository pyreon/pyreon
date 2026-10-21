/**
 * The web-host PAGE for `<RichTextWebView>` on native: `buildRichTextHostHtml` around a TipTap bundled from the app's
 * own install. The entry assigns the `window.TT` factory the host bridge waits for.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundleWebHostScript, type WebHostFile } from '@pyreon/native-compiler/plugin-api'
import { buildRichTextHostHtml } from '../webview'
import { RICH_TEXT_HOST_FILENAME } from './lowering'

/**
 * The `window.TT` entry: StarterKit (paragraphs, headings, lists, bold / italic / code, blockquote, history) — the
 * document model `createRichTextEditor` defaults to. `setContent` pushes WITHOUT emitting an update, so a value the
 * host pushed in is not echoed back as an edit.
 */
export const RICH_TEXT_HOST_ENTRY = `import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
window.TT = {
  createEditor(el, opts) {
    const editor = new Editor({
      element: el,
      extensions: [StarterKit],
      content: opts.content,
      editable: opts.editable,
      onUpdate: ({ editor: e }) => opts.onUpdate(e.getJSON()),
    })
    return {
      setContent: (c) => editor.commands.setContent(c, { emitUpdate: false }),
      setEditable: (on) => editor.setEditable(on),
      destroy: () => editor.destroy(),
    }
  },
}
`

/** This package's directory: where its own dependencies (the TipTap core) resolve from under an isolated install. */
function packageDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir
    dir = dirname(dir)
  }
  return dirname(fileURLToPath(import.meta.url))
}

/** `webHosts` for `@pyreon/rich-text`: the one page every `<RichTextWebView>` in the app loads. */
export async function buildRichTextHosts({ appDir }: { appDir: string }): Promise<WebHostFile[]> {
  const tiptapScript = await bundleWebHostScript({
    source: RICH_TEXT_HOST_ENTRY,
    resolveDirs: [packageDir(), appDir],
  })
  return [{ filename: RICH_TEXT_HOST_FILENAME, content: buildRichTextHostHtml({ tiptapScript }) }]
}
