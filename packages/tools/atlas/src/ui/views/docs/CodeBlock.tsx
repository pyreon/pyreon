/**
 * Syntax-highlighted code, read-only — the workbench dogfooding `@pyreon/code`.
 *
 * Read-only by construction: `editable: false` removes contenteditable
 * entirely (a display surface, not an editor you can type into whose writes
 * are swallowed), and gutters/search/minimap are off so a docs snippet reads
 * as prose rather than as an IDE.
 *
 * `@pyreon/code` is LAZILY imported, and the editor core deliberately
 * registers only the JS family + JSON — so opening the workbench costs
 * nothing until the Docs view asks, and even then it pulls one grammar
 * package rather than the whole `@codemirror/lang-*` set. Until the chunk
 * lands (and permanently, if it fails) the plain `<pre>` renders the same
 * text: highlighting is progressive enhancement, never a blank block.
 */
import { onMount, Show } from '@pyreon/core'
import type { EditorInstance, EditorLanguage } from '@pyreon/code'
import { effect, signal } from '@pyreon/reactivity'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'

type CodeMod = typeof import('@pyreon/code')

/**
 * The loaded module, shared by every block — a bounded module-level memo (one
 * entry: the ES module, which the registry keeps alive anyway).
 *
 * Deliberately a SIGNAL rather than a per-instance `await`: an async
 * continuation that touches component state keeps that component's whole
 * reactive scope alive until the chunk lands, which outlives an unmount and
 * reads — correctly — as retention to `atlas scan`'s leak check (it caught
 * exactly that on the first cut of this file). Loading through a module-level
 * signal means the async closure captures NOTHING from any instance, and each
 * block reacts to the module arriving through an ordinary effect that its own
 * disposal cancels.
 */
const codeMod = signal<CodeMod | null>(null)
let loadStarted = false
function ensureCodeModule(): void {
  if (loadStarted) return
  loadStarted = true
  void import('@pyreon/code')
    .then((mod) => codeMod.set(mod))
    // Highlighting is enhancement: a failed chunk leaves the <pre> fallback.
    .catch(() => undefined)
}

export function CodeBlock(props: {
  model: WorkbenchModel
  /** Accessor — the source arrives asynchronously and the snippet changes per component. */
  code: () => string
  language?: EditorLanguage
  /** `source` caps the height and scrolls in place; `snippet` grows with content. */
  variant?: 'snippet' | 'source'
  testId?: string
}) {
  const m = props.model
  const instance = signal<EditorInstance | null>(null)

  onMount(() => {
    ensureCodeModule()
    return () => instance()?.dispose()
  })

  // Create once the module is here. Living in an EFFECT is what makes the
  // unmount-during-load case safe without a flag: a disposed block's effect
  // never runs again, so no editor is created that nothing would dispose.
  effect(() => {
    const mod = codeMod()
    if (!mod || instance()) return
    instance.set(
      mod.createEditor({
        value: props.code(),
        language: props.language ?? 'tsx',
        theme: m.dark() ? 'dark' : 'light',
        editable: false,
        readOnly: true,
        lineNumbers: false,
        foldGutter: false,
        search: false,
        minimap: false,
        highlightIndentGuides: false,
        // A docs block is read like prose: wrap long lines rather than hiding
        // them behind a horizontal scrollbar the reader has to find.
        lineWrapping: true,
        // The workbench is a DEV tool: report mount failures rather than
        // swallowing them — a silently blank highlight is the failure that is
        // impossible to diagnose from the outside.
        onError: (err: Error) => {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[atlas] code block failed to mount:', err)
          }
        },
      }),
    )
  })

  // The value is a live accessor (source loads async, the snippet follows the
  // selected component) — push it into the editor rather than remounting one.
  effect(() => {
    const editor = instance()
    if (!editor) return
    const next = props.code()
    // pyreon-lint-disable-next-line pyreon/no-peek-in-tracked
    if (next !== editor.value.peek()) editor.value.set(next)
  })

  // Follow the workbench's own dark/light — a light-themed editor on a dark
  // shell is the tell that a component was bolted on rather than themed in.
  effect(() => {
    const editor = instance()
    if (!editor) return
    editor.theme.set(m.dark() ? 'dark' : 'light')
  })

  const testProps = props.testId ? { 'data-testid': props.testId } : {}

  return (
    <Show
      when={() => instance() !== null}
      fallback={<C.UsagePre {...testProps}>{() => props.code()}</C.UsagePre>}
    >
      <C.CodeSurface variant={props.variant ?? 'snippet'} {...testProps}>
        {() => {
          const editor = instance()
          const mod = codeMod()
          if (!editor || !mod) return null
          // `height:auto` overrides the component's `height:100%` base — a
          // docs block is content-sized, not a pane filling a parent that has
          // no height to give. The SOURCE variant adds a max-height so a long
          // file scrolls inside CodeMirror's own scroller (its virtualized,
          // well-trodden path) rather than being clipped by an ancestor.
          const style =
            props.variant === 'source' ? 'height:auto;max-height:420px' : 'height:auto'
          return mod.CodeEditor({ instance: editor, style }) as never
        }}
      </C.CodeSurface>
    </Show>
  )
}
