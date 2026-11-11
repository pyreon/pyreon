import { onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { DemoSurface } from '../kit/cards'
import { DemoGrid, DemoPanel, Meters, PaperButton, PaperField, PaperHint, PaperLabel } from '../kit/demo'
import { PaperActions } from '../kit/demo-parts'
import { Signup, type ServerVerdict } from './validation/schema'

/**
 * Validation demo (`validation.json` → demo): one real `@pyreon/validate`
 * schema, validated twice. The browser column is `Signup.parse(value)` in
 * this page: the light format check, and the server-only `email-unique`
 * check listed as `pending`. The server column runs in a Web Worker that
 * imports `@pyreon/validate/server` (strict email + disposable-domain
 * blocklist) and registers `email-unique`, then runs `Signup.parseAsync`.
 * The worker is a separate module graph, so the strict validators never
 * reach the page's copy of the registry, as on a real server. Only the
 * round-trip (about 700 ms) and the user table are simulated.
 */
export default function DemoValidation() {
  const email = signal('ada@example.com')
  const browserFormat = signal('—')
  const browserUnique = signal('—')
  const serverStrict = signal('—')
  const serverUnique = signal('—')
  const issues = signal('')

  let worker: Worker | null = null
  let seq = 0
  const server = (): Worker => {
    if (worker) return worker
    worker = new Worker(new URL('./validation/server.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; verdict: ServerVerdict }>) => {
      // A newer Validate click owns the columns: drop older answers.
      if (e.data.id !== seq) return
      serverStrict.set(e.data.verdict.strict)
      serverUnique.set(e.data.verdict.unique)
      issues.set(e.data.verdict.issues.length ? `Server: ${e.data.verdict.issues.join('; ')}` : 'Server: ok, the account can be created.')
    }
    return worker
  }
  onUnmount(() => worker?.terminate())

  const run = () => {
    const value = email.peek().trim()
    const r = Signup.parse({ email: value })
    browserFormat.set(r.ok ? 'pass' : 'fail')
    browserUnique.set(r.ok && r.pending?.some((p) => p.key === 'email-unique') ? 'pending' : '—')
    serverStrict.set('checking…')
    serverUnique.set('checking…')
    issues.set(r.ok ? 'Browser: valid so far, email-unique is pending the server.' : `Browser: ${r.issues.map((i) => i.message).join('; ')}`)
    server().postMessage({ id: ++seq, email: value })
  }
  onMount(run)

  return (
    <DemoGrid>
      <DemoSurface aria-label="Validation demo">
        <form
          noValidate
          onSubmit={(e: Event) => {
            e.preventDefault()
            run()
          }}
        >
          <PaperLabel for="v-email">Same schema, client and server</PaperLabel>
          <PaperField>
            <input
              id="v-email"
              type="email"
              autoComplete="off"
              aria-describedby="v-email-hint"
              value={() => email()}
              onInput={(e: Event) => email.set((e.currentTarget as HTMLInputElement).value)}
            />
          </PaperField>
          <PaperHint id="v-email-hint">Try ada@example.com (taken), test@mailinator.com (disposable), or your own</PaperHint>
          <PaperActions>
            <PaperButton type="submit" variant="primary">
              Validate
            </PaperButton>
          </PaperActions>
          <PaperHint aria-live="polite">{() => issues()}</PaperHint>
        </form>
      </DemoSurface>
      <DemoPanel note="The server half runs in a Web Worker in this page, with its own copy of @pyreon/validate/server. The round-trip delay and the user table are simulated.">
        <Meters
          label="Checks"
          items={[
            { label: 'browser · format', value: () => browserFormat() },
            { label: 'browser · email-unique', value: () => browserUnique() },
            { label: 'server · strict format', value: () => serverStrict() },
            { label: 'server · email-unique', value: () => serverUnique() },
          ]}
        />
      </DemoPanel>
    </DemoGrid>
  )
}
