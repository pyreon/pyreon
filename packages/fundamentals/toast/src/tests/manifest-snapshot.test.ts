import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — toast snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/toast — Toast notifications — toast(), toast.success/error/warning/info/loading, Toaster component, a11y (peer: @pyreon/runtime-dom). Unlike most Pyreon packages, toast uses a module-level signal store — \`toast()\` works from event handlers, effects, or any non-component code. The \`<Toaster />\` component reads from this shared store."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/toast — Toast Notifications

      Imperative toast notifications for Pyreon. Call \`toast()\` from anywhere in your app — no provider or context needed. Preset variants (\`toast.success\`, \`toast.error\`, etc.), a \`toast.promise()\` helper for async operations, and \`toast.update()\` for loading-to-success patterns. Render \`<Toaster />\` once at the app root — it uses Portal, CSS transitions, auto-dismiss, and pause-on-hover. Accessible with \`role="alert"\` and \`aria-live="polite"\` on toast elements.

      \`\`\`typescript
      import { toast, Toaster } from '@pyreon/toast'

      // Mount Toaster once at app root:
      function App() {
        return (
          <>
            <Toaster position="top-right" duration={4000} />
            <MainContent />
          </>
        )
      }

      // Call toast() from anywhere — no provider needed:
      toast('Hello!')

      // Preset variants:
      toast.success('Saved successfully!')
      toast.error('Something went wrong')
      toast.warning('Session expiring soon')
      toast.info('New version available')

      // Loading → success pattern:
      const id = toast.loading('Saving...')
      try {
        await saveData()
        toast.update(id, { type: 'success', message: 'Done!' })
      } catch {
        toast.update(id, { type: 'error', message: 'Save failed' })
      }

      // Promise helper — auto-transitions through states:
      toast.promise(fetchData(), {
        loading: 'Loading...',
        success: 'Loaded!',
        error: 'Failed to load',
      })

      // Dismiss programmatically:
      const toastId = toast('Dismissable')
      toast.dismiss(toastId)  // dismiss one
      toast.dismiss()         // dismiss all
      \`\`\`

      > **Peer dep**: @pyreon/runtime-dom
      >
      > **No provider needed**: Unlike most Pyreon packages, toast uses a module-level signal store — \`toast()\` works from event handlers, effects, or any non-component code. The \`<Toaster />\` component reads from this shared store.
      >
      > **Peer dep**: \`@pyreon/runtime-dom\` is required because \`<Toaster />\` JSX emits \`_tpl()\` calls — declare it in consumer app dependencies.
      >
      > **Pause on hover**: The auto-dismiss timer pauses while the user hovers over a toast and resumes when the cursor leaves. This is built into \`<Toaster />\` with no configuration needed.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(2)
    expect(record['toast/toast']!.notes).toContain('imperative')
    expect(record['toast/toast']!.mistakes?.split('\n').length).toBe(3)
  })
})
