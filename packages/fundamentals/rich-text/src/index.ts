/**
 * @pyreon/rich-text — Reactive WYSIWYG rich-text editor for Pyreon.
 *
 * A thin signal-backed layer over TipTap (the MIT, framework-agnostic
 * headless editor framework built on ProseMirror) — the same adapter
 * shape as `@pyreon/code` (CodeMirror) and `@pyreon/charts` (ECharts).
 * The document state is exposed as signals; the TipTap engine is
 * lazy-loaded on mount so `@tiptap/*` stays out of the initial bundle.
 *
 * @example
 * ```tsx
 * import { createRichTextEditor, RichText, bindRichTextToSignal } from '@pyreon/rich-text'
 * import { signal } from '@pyreon/reactivity'
 *
 * const editor = createRichTextEditor({ content: '<p>Hello</p>' })
 *
 * editor.json()                       // reactive ProseMirror JSON
 * editor.json.set(draft)              // replace content (loop-safe)
 * editor.text()                       // reactive plain text
 * editor.chain()?.toggleBold().run()  // run a command
 *
 * <RichText instance={editor} style="min-height: 12rem" />
 * ```
 */

import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/rich-text
// instances in the same heap. Name + version derived from this package's own
// package.json (single source of truth; the build inlines the literals).
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

// Core
export { createRichTextEditor } from './editor'
// Mount component
export { RichText } from './components/rich-text'
// Signal binding
export { bindRichTextToSignal } from './bind-signal'
export type {
  BindRichTextToSignalOptions,
  RichTextBinding,
  SignalLike,
} from './bind-signal'

// Types
export type {
  JSONContent,
  RichTextConfig,
  RichTextEditor,
  RichTextProps,
} from './types'
