import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { getOriginalDoc, MergeView, originalDocChangeEffect, unifiedMergeView } from '@codemirror/merge'
import { ChangeSet, Compartment, EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { VNodeChild } from '@pyreon/core'
import { onUnmount, cx } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { effect } from '@pyreon/reactivity'
import { loadLanguage } from '../languages'
import { resolveTheme } from '../themes'
import type { DiffEditorProps } from '../types'

const readText = (value: string | Signal<string>): string =>
  typeof value === 'string' ? value : value()

/**
 * Side-by-side or inline diff editor using @codemirror/merge.
 *
 * Supports reactive `original` and `modified` props — pass a Signal<string>
 * and the diff view updates automatically when the signal changes.
 *
 * @example
 * ```tsx
 * <DiffEditor
 *   original="const x = 1"
 *   modified="const x = 2"
 *   language="typescript"
 *   theme="dark"
 *   style="height: 400px"
 * />
 * ```
 */
export function DiffEditor(props: DiffEditorProps): VNodeChild {
  // Props are read through `props.*`, never destructured: components run once,
  // so a destructured `theme` / `language` / `original` froze at the first
  // render and `<DiffEditor theme={mode()} />` never followed the signal.
  // `inline` decides which view is BUILT, so it is read once at mount.
  let mergeView: MergeView | null = null
  // Unified (inline) mode builds a single EditorView carrying the
  // unifiedMergeView extension instead of a side-by-side MergeView.
  let unifiedView: EditorView | null = null
  // `containerRef` lazy-loads the language grammar (async), so the component
  // can unmount WHILE that import is in flight. `onUnmount` sets this; the ref
  // bails after the await so it never builds a MergeView that `onUnmount` has
  // already (no-op) torn down — the dispose-during-pending-mount leak.
  let unmounted = false
  const cleanups: (() => void)[] = []

  const languageCompartment = new Compartment()
  const themeCompartment = new Compartment()
  const readOnlyCompartment = new Compartment()

  const views = (): EditorView[] =>
    mergeView ? [mergeView.a, mergeView.b] : unifiedView ? [unifiedView] : []

  const readOnlyExt = (ro: boolean): Extension => [
    EditorView.editable.of(!ro),
    EditorState.readOnly.of(ro),
  ]

  /** Replace an editor's whole doc when `text` differs from it. */
  const syncDoc = (editor: EditorView, text: string): void => {
    if (editor.state.doc.toString() === text) return
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } })
  }

  const containerRef = async (el: Element | null) => {
    if (!el) return

    try {
      const initialLanguage = props.language ?? 'plain'
      const langExt = await loadLanguage(initialLanguage)
      // Unmounted while the grammar loaded — abort before creating a leaked view.
      if (unmounted) return
      const readOnly = props.readOnly ?? true

      const extensions: Extension[] = [
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        languageCompartment.of(langExt),
        themeCompartment.of(resolveTheme(props.theme ?? 'light')),
        readOnlyCompartment.of(readOnlyExt(readOnly)),
      ]

      const originalText = readText(props.original)
      const modifiedText = readText(props.modified)

      // Clear previous content
      ;(el as HTMLElement).innerHTML = ''

      if (props.inline) {
        // ── Unified (inline) diff — ONE editor showing the modified doc with
        // the original rendered as deleted-chunk widgets above each change.
        unifiedView = new EditorView({
          parent: el as HTMLElement,
          state: EditorState.create({
            doc: modifiedText,
            extensions: [
              ...extensions,
              unifiedMergeView({
                original: originalText,
                // Accept/reject chunk buttons only make sense when the
                // modified side is user-editable.
                mergeControls: !readOnly,
                collapseUnchanged: { margin: 3, minSize: 4 },
              }),
            ],
          }),
        })
      } else {
        mergeView = new MergeView({
          a: { doc: originalText, extensions },
          b: { doc: modifiedText, extensions },
          parent: el as HTMLElement,
          collapseUnchanged: { margin: 3, minSize: 4 },
        })
      }

      // ── Reactive props. Each effect reads `props.*` (a reactive getter when
      // the caller passed a signal read) or calls a Signal prop, and skips the
      // no-op first run by comparing against what the view already shows.
      cleanups.push(
        effect(() => {
          const text = readText(props.modified)
          if (unifiedView) syncDoc(unifiedView, text)
          else if (mergeView) syncDoc(mergeView.b, text)
        }).dispose,
      )

      cleanups.push(
        effect(() => {
          const text = readText(props.original)
          if (mergeView) {
            syncDoc(mergeView.a, text)
          } else if (unifiedView) {
            const view = unifiedView
            const orig = getOriginalDoc(view.state)
            if (orig.toString() === text) return
            view.dispatch({
              effects: originalDocChangeEffect(
                view.state,
                ChangeSet.of({ from: 0, to: orig.length, insert: text }, orig.length),
              ),
            })
          }
        }).dispose,
      )

      cleanups.push(
        effect(() => {
          const ext = resolveTheme(props.theme ?? 'light')
          for (const v of views()) v.dispatch({ effects: themeCompartment.reconfigure(ext) })
        }).dispose,
      )

      cleanups.push(
        effect(() => {
          const ro = props.readOnly ?? true
          for (const v of views()) {
            v.dispatch({ effects: readOnlyCompartment.reconfigure(readOnlyExt(ro)) })
          }
        }).dispose,
      )

      // Language loads async — a stale load that resolves after a newer
      // selection (or after unmount) must not win.
      let languageVersion = 0
      cleanups.push(() => {
        languageVersion++
      })
      cleanups.push(
        // This runs inside the async `containerRef` callback (post-mount), not
        // at component setup; the `.then` is the stale-guarded grammar load.
        // pyreon-lint-disable-next-line pyreon/no-imperative-effect-on-create
        effect(() => {
          const lang = props.language ?? 'plain'
          if (lang === initialLanguage && languageVersion === 0) return
          const version = ++languageVersion
          loadLanguage(lang).then((ext) => {
            if (version !== languageVersion || unmounted) return
            for (const v of views()) {
              v.dispatch({ effects: languageCompartment.reconfigure(ext) })
            }
          })
        }).dispose,
      )
    } catch (err) {
      // Build failed (failed grammar import, throwing extension). Surface it
      // instead of leaving an unhandled promise rejection.
      const error = err instanceof Error ? err : new Error(String(err))
      if (props.onError) {
        props.onError(error)
      } else if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.error('[Pyreon] @pyreon/code DiffEditor failed to mount:', error)
      }
    }
  }

  onUnmount(() => {
    unmounted = true
    for (const cleanup of cleanups) cleanup()
    mergeView?.destroy()
    mergeView = null
    unifiedView?.destroy()
    unifiedView = null
  })

  const baseStyle = `width: 100%; height: 100%; overflow: hidden; ${props.style ?? ''}`

  return (
    <div ref={containerRef} class={cx(['pyreon-diff-editor', props.class])} style={baseStyle} />
  )
}
