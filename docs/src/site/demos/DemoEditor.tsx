import { ColorModeProvider, onUnmount } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
// This module IS the lazy chunk: registry.tools.ts loads it through island(() => import(…)).
// pyreon-lint-disable-next-line pyreon/no-eager-import
import { CodeEditor, createEditor } from '@pyreon/code'
import { signal, watch } from '@pyreon/reactivity'
import { bindRichTextToSignal, createRichTextEditor, RichText } from '@pyreon/rich-text'
import type { JSONContent } from '@pyreon/rich-text'
import { font, paper, radius, text } from '../theme'
import { el, type ButtonAttrs, tone, txt } from '../kit/bases'
import { DemoSurface, GlowCard } from '../kit/cards'
import { DemoGrid, DemoPanel, Meters, PaperButton, PaperHint } from '../kit/demo'
import { Code, Eyebrow } from '../kit/type'

const t = (s: string, bold?: boolean): JSONContent => (bold ? { type: 'text', text: s, marks: [{ type: 'bold' }] } : { type: 'text', text: s })
const p = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content })
const li = (s: string): JSONContent => ({ type: 'listItem', content: [p(t(s))] })

const CONTENT: JSONContent = {
  type: 'doc',
  content: [p(t('Pyreon ships its own '), t('rich text', true), t(' and code editors.')), p(t('Edit this text.'))],
}
const OUTSIDE: JSONContent = {
  type: 'doc',
  content: [
    p(t('A draft saved on '), t('another device', true), t('.')),
    { type: 'bulletList', content: [li('The bound signal changed.'), li('The editor took the new document.'), li('Nothing echoed back.')] },
  ],
}

const asJson = (doc: JSONContent): string => JSON.stringify(doc, null, 2)

const Stack = el.config({ name: 'EditorDemoStack' }).attrs({ block: true, gap: 16 }).theme(() => ({ minWidth: 0 }))

const Toolbar = el
  .config({ name: 'EditorDemoToolbar' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 4, role: 'toolbar' })
  .theme(() => ({ flexWrap: 'wrap' }))

const ToolButton = el
  .config({ name: 'EditorDemoTool' })
  .attrs<ButtonAttrs>({ tag: 'button', contentAlignX: 'center', contentAlignY: 'center' })
  .theme(() => ({
    height: 32,
    minWidth: 36,
    paddingLeft: 10,
    paddingRight: 10,
    borderRadius: radius.small,
    border: '1px solid',
    borderColor: paper.line,
    backgroundColor: paper.field,
    color: paper.text,
    fontFamily: font.system,
    fontSize: 13,
    extendCss: `&:focus-visible { outline: 2px solid ${paper.accent}; outline-offset: 2px; }`,
    pressed: { backgroundColor: paper.text, borderColor: paper.text, color: paper.bg },
    disabled: { color: paper.fog, cursor: 'default', opacity: 0.6 },
  }))

/** The editable area: TipTap renders a `.ProseMirror` contenteditable inside `<RichText>`'s container. */
const Page = el
  .config({ name: 'EditorDemoPage' })
  .attrs({ block: true })
  .theme(() => ({
    minWidth: 0,
    borderRadius: radius.control,
    backgroundColor: paper.field,
    boxShadow: paper.ring,
    extendCss: `
      & .ProseMirror { min-height: 200px; padding: 16px 18px; outline: none; font: 15.5px/1.65 ${font.system}; color: ${paper.text}; border-radius: ${radius.control}px; overflow-wrap: anywhere; }
      & .ProseMirror:focus-visible, & .ProseMirror:focus { box-shadow: inset 0 0 0 2px ${paper.accent}; }
      & .ProseMirror p { margin: 0 0 10px; }
      & .ProseMirror ul { margin: 0 0 10px; padding-left: 22px; }
      & .ProseMirror li p { margin: 0 0 4px; }
    `,
  }))

const CodeBox = el
  .config({ name: 'EditorDemoCode' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    minWidth: 0,
    height: 240,
    borderTop: '1px solid',
    borderColor: tone(m, 'line'),
    fontSize: text.code.size,
    extendCss: `& .cm-editor { height: 100%; } & .cm-scroller { font-family: ${font.mono}; line-height: 1.6; }`,
  }))

const CodeHead = el
  .config({ name: 'EditorDemoCodeHead' })
  .attrs({ block: true, gap: 4 })
  .theme(() => ({ paddingTop: 16, paddingBottom: 14, paddingLeft: { xs: 18, sm: 22 }, paddingRight: { xs: 18, sm: 22 } }))

const Caption = txt
  .config({ name: 'EditorDemoCaption' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontFamily: font.sans, fontSize: text.caption.size, lineHeight: text.caption.lineHeight, color: tone(m, 'mist') }))

function Tool(props: {
  label: string
  pressed?: (() => boolean) | undefined
  disabled?: (() => boolean) | undefined
  onRun: () => void
  children: VNodeChild
}) {
  return (
    <ToolButton
      type="button"
      aria-label={props.label}
      aria-pressed={props.pressed ? () => (props.pressed?.() ? 'true' : 'false') : undefined}
      disabled={props.disabled ? props.disabled() : false}
      // Keep the editor's selection: the command re-focuses it itself.
      onMouseDown={(e: MouseEvent) => e.preventDefault()}
      onClick={props.onRun}
    >
      {props.children}
    </ToolButton>
  )
}

/**
 * Editor demo (`editor.json` → demo): the real `@pyreon/rich-text` editor
 * (TipTap underneath, lazy-loaded on mount). The toolbar runs
 * `editor.chain()?.focus()…run()`; the meters read the editor's own
 * computed signals. "Load from outside" writes a signal bound with
 * `bindRichTextToSignal`, so the document is replaced from the outside
 * without an echo (`onChange` reports user edits only, and the hint counts
 * it). Below, a read-only `@pyreon/code` editor shows `editor.json()` live.
 */
export default function DemoEditor() {
  const userEdits = signal(0)
  const editor = createRichTextEditor({ content: CONTENT, ariaLabel: 'Post body', onChange: () => userEdits.update((n) => n + 1) })
  // Starts as the same document: in JSON format the binding applies the signal to the editor first.
  const draft = signal<JSONContent>(CONTENT)
  const binding = bindRichTextToSignal({ editor, signal: draft })
  const status = signal('')

  const source = createEditor({
    value: asJson(editor.json()),
    language: 'json',
    readOnly: true,
    lineNumbers: true,
    foldGutter: false,
    autocomplete: false,
    // The guides are a repeating background on every .cm-line, so they stripe
    // the whole line width, not only the indentation (reported with this demo).
    // Indent guides stripe the full width of each line (#4393).
    highlightIndentGuides: false,
    ariaLabel: 'The post body as JSON (read only)',
  })
  // Push each new document into the code editor's own value signal.
  watch(
    () => asJson(editor.json()),
    (v) => source.value.set(v),
  )

  onUnmount(() => {
    binding.dispose()
    editor.dispose()
    source.dispose()
  })

  const loadOutside = () => {
    const before = userEdits.peek()
    draft.set(OUTSIDE)
    status.set(`Replaced through the bound signal. onChange calls from the load: ${userEdits.peek() - before}.`)
  }

  return (
    <Stack>
      <DemoGrid>
        <DemoSurface>
          <Toolbar aria-label="Formatting">
            <Tool label="Bold" pressed={() => editor.isActive('bold')} onRun={() => editor.chain()?.focus().toggleBold().run()}>
              <b>B</b>
            </Tool>
            <Tool label="Italic" pressed={() => editor.isActive('italic')} onRun={() => editor.chain()?.focus().toggleItalic().run()}>
              <i>I</i>
            </Tool>
            <Tool label="Bulleted list" pressed={() => editor.isActive('bulletList')} onRun={() => editor.chain()?.focus().toggleBulletList().run()}>
              • list
            </Tool>
            <Tool label="Undo" disabled={() => !editor.canUndo()} onRun={() => editor.chain()?.focus().undo().run()}>
              undo
            </Tool>
          </Toolbar>
          <Page>
            <RichText instance={editor} />
          </Page>
          <div>
            <PaperButton type="button" onClick={loadOutside}>
              Load from outside
            </PaperButton>
          </div>
          <PaperHint aria-live="polite">{() => status()}</PaperHint>
        </DemoSurface>
        <DemoPanel note="Counts come from the document JSON, so they are right before the editor engine has even loaded, and a cursor move re-runs none of them.">
          <Meters
            label="The editor's signals"
            // A zero-width space after "editor." lets a long name wrap on a phone.
            items={[
              { label: 'editor.\u200bwordCount()', value: () => editor.wordCount() },
              { label: 'editor.\u200bcharacterCount()', value: () => editor.characterCount() },
              { label: 'editor.\u200bisEmpty()', value: () => String(editor.isEmpty()) },
              { label: "editor.\u200bisActive('bold')", value: () => String(editor.isActive('bold')) },
            ]}
          />
        </DemoPanel>
      </DemoGrid>
      <GlowCard padding="flush">
        <CodeHead>
          <Eyebrow>@pyreon/code · read only</Eyebrow>
          <Caption>
            <Code>editor.json()</Code>, the document the bound signal carries, live in a CodeMirror editor whose value is a
            signal too.
          </Caption>
        </CodeHead>
        <CodeBox>
          {/* "system" follows the page: the site's theme toggle writes color-scheme on <html>. */}
          <ColorModeProvider mode="system">
            <CodeEditor instance={source} />
          </ColorModeProvider>
        </CodeBox>
      </GlowCard>
    </Stack>
  )
}
