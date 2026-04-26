/**
 * perf-dashboard — single-page dashboard that intentionally stresses the
 * layers the harness instruments:
 *
 * - StatsSection: 24 styled cards — stresses `styler.resolve` / `unistyle.styles`
 * - TableSection: 100-row table — stresses `runtime.mountFor.lisOps` when shuffled
 * - FormSection: 10 signal-backed fields — stresses `reactivity.signalWrite`
 * - ModalSection: mount/unmount → `runtime.mount` / `runtime.unmount`
 * - ThemeToggle: whole-theme swap → re-resolves every styled component
 *
 * All state is local signal-based. No router, no zero, no feature packages —
 * the goal is to keep the counter signal clean for whichever layer is under
 * investigation.
 */
import { For, provide, Show } from '@pyreon/core'
import { perfHarness } from '@pyreon/perf-harness'
import { computed, signal } from '@pyreon/reactivity'
import { ThemeContext } from '@pyreon/styler'
import {
  Accent,
  Button,
  Card,
  CardDelta,
  CardLabel,
  CardValue,
  Field,
  GhostButton,
  Grid,
  Header,
  Input,
  ModalBackdrop,
  ModalBody,
  Row,
  Section,
  SectionTitle,
  Shell,
  Table,
  Td,
  Th,
  Title,
} from './components/atoms'
import { darkTheme, lightTheme, type Theme } from './theme'

// ── State ────────────────────────────────────────────────────────────────────

export const themeSignal = signal<Theme>(darkTheme)
export const isLight = computed(() => themeSignal() === lightTheme)

export const rowsSignal = signal<Row[]>(generateRows(100))

export const modalOpen = signal(false)

export const formState = {
  name: signal('Ada Lovelace'),
  email: signal('ada@example.com'),
  role: signal('engineer'),
  team: signal('compilers'),
  bio: signal('Author of the first algorithm.'),
  notifications: signal('immediate'),
  tz: signal('Europe/London'),
  level: signal('senior'),
  language: signal('english'),
  budget: signal('10000'),
}

// ── Journey-shaped state ─────────────────────────────────────────────────────
//
// Three canonical journeys (chat / dashboard / form) that drive the
// architectural-experiments harness. Each is a real-app-shape workload —
// not a synthetic microbenchmark — so wins/regressions show up the way
// they would in production.

interface ChatMessage {
  id: number
  text: string
  author: string
}

let _chatId = 0
function makeChatMessage(): ChatMessage {
  _chatId++
  return {
    id: _chatId,
    text: `Message ${_chatId} — ${'lorem ipsum dolor sit amet '.repeat(2 + (_chatId % 3))}`,
    author: ['ada', 'grace', 'linus', 'guido'][_chatId % 4]!,
  }
}

/** Append-only chat log. Journey: append N messages, scroll. */
export const chatMessages = signal<ChatMessage[]>(
  Array.from({ length: 50 }, () => makeChatMessage()),
)

/**
 * 50 reactive widget values. Journey: start churn, wait 5s, stop. Each tick
 * updates a random subset of widgets — stresses signal write throughput +
 * downstream effect cascade in a real-app shape (live dashboard).
 */
export interface Widget {
  id: number
  sig: ReturnType<typeof signal<number>>
}
export const widgetValues: Widget[] = Array.from({ length: 50 }, (_, i) => ({
  id: i,
  sig: signal(((i * 137) % 9000) + 100),
}))

let _churnIntervalId: ReturnType<typeof setInterval> | null = null
export const churnRunning = signal(false)

export function startWidgetChurn(): void {
  if (_churnIntervalId !== null) return
  churnRunning.set(true)
  _churnIntervalId = setInterval(() => {
    // Update 5 random widgets per tick — same shape as a live dashboard
    // receiving 5 metric updates per 100ms window.
    for (let i = 0; i < 5; i++) {
      const idx = Math.floor(Math.random() * widgetValues.length)
      const w = widgetValues[idx]
      if (w) w.sig.set(Math.floor(Math.random() * 9999))
    }
  }, 100)
}

export function stopWidgetChurn(): void {
  if (_churnIntervalId !== null) {
    clearInterval(_churnIntervalId)
    _churnIntervalId = null
  }
  churnRunning.set(false)
}

/**
 * 30-field form with cross-field validation. Journey: type 60 keystrokes
 * across multiple fields. Stresses per-field signal updates + computed
 * recomputation (the `passwordsMatch` derived signal fires when either
 * password input changes).
 */
export interface FormField {
  id: number
  sig: ReturnType<typeof signal<string>>
}
export const longFormFields: FormField[] = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  sig: signal(`field-${i}-default`),
}))
// NOTE: the explicit `<string>` generic is load-bearing — it bypasses the
// Pyreon Vite plugin's HMR-signal-wrapper regex (which doesn't account for
// type parameters on `signal<T>(...)`). Without it, the plugin rewrites
// `signal('')` → `__hmr_signal(..., signal, '')` and the wrapper somehow
// produces a signal that reads as `undefined` (root cause unknown,
// reproducible only with `''` initial value — `signal(false)` works fine).
// See follow-up issue.
export const passwordSignal = signal<string>('')
export const confirmPasswordSignal = signal<string>('')
export const passwordsMatch = computed(
  () => passwordSignal() === confirmPasswordSignal() && passwordSignal().length >= 6,
)

interface Row {
  id: number
  name: string
  metric: number
  delta: number
  status: 'ok' | 'warn' | 'err'
}

function generateRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Row ${i + 1}`,
    metric: Math.round(((i * 97) % 1000) + Math.random() * 50),
    delta: Math.round(((i * 31) % 200) - 100 + Math.random() * 10),
    status: i % 7 === 0 ? 'err' : i % 3 === 0 ? 'warn' : 'ok',
  }))
}

// ── Sections ─────────────────────────────────────────────────────────────────

const stats = Array.from({ length: 24 }, (_, i) => ({
  label: `Metric ${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) || ''}`,
  value: ((i * 131) % 9900) + 100,
  delta: ((i * 17) % 40) - 20,
}))

function StatsSection() {
  return (
    <Section theme={themeSignal()}>
      <SectionTitle theme={themeSignal()}>Stats</SectionTitle>
      <Grid>
        <For each={() => stats} by={(s: (typeof stats)[number]) => s.label}>
          {(s: (typeof stats)[number]) => (
            <Card theme={themeSignal()}>
              <CardLabel theme={themeSignal()}>{s.label}</CardLabel>
              <CardValue theme={themeSignal()}>{s.value.toLocaleString()}</CardValue>
              <CardDelta theme={themeSignal()} $dir={s.delta >= 0 ? 'up' : 'down'}>
                {s.delta >= 0 ? '+' : ''}
                {s.delta.toString()}%
              </CardDelta>
            </Card>
          )}
        </For>
      </Grid>
    </Section>
  )
}

function TableSection() {
  return (
    <Section theme={themeSignal()}>
      <Row>
        <SectionTitle theme={themeSignal()}>Rows</SectionTitle>
        <div style="flex: 1" />
        <GhostButton
          theme={themeSignal()}
          data-testid="shuffle-rows"
          onClick={() => {
            const arr = [...rowsSignal()]
            for (let i = arr.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1))
              const ai = arr[i] as Row
              const aj = arr[j] as Row
              arr[i] = aj
              arr[j] = ai
            }
            rowsSignal.set(arr)
          }}
        >
          Shuffle
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="regen-rows"
          onClick={() => rowsSignal.set(generateRows(100))}
        >
          Regenerate
        </GhostButton>
      </Row>
      <Table theme={themeSignal()}>
        <thead>
          <tr>
            <Th theme={themeSignal()}>ID</Th>
            <Th theme={themeSignal()}>Name</Th>
            <Th theme={themeSignal()}>Metric</Th>
            <Th theme={themeSignal()}>Δ</Th>
            <Th theme={themeSignal()}>Status</Th>
          </tr>
        </thead>
        <tbody>
          <For each={() => rowsSignal()} by={(r: Row) => r.id}>
            {(r: Row) => (
              <tr>
                <Td theme={themeSignal()}>{r.id}</Td>
                <Td theme={themeSignal()}>{r.name}</Td>
                <Td theme={themeSignal()}>{r.metric}</Td>
                <Td theme={themeSignal()}>
                  {r.delta >= 0 ? '+' : ''}
                  {r.delta}
                </Td>
                <Td theme={themeSignal()}>{r.status}</Td>
              </tr>
            )}
          </For>
        </tbody>
      </Table>
    </Section>
  )
}

function FormSection() {
  type FieldEntry = [string, (typeof formState)[keyof typeof formState]]
  const fields: FieldEntry[] = [
    ['Name', formState.name],
    ['Email', formState.email],
    ['Role', formState.role],
    ['Team', formState.team],
    ['Bio', formState.bio],
    ['Notifications', formState.notifications],
    ['Timezone', formState.tz],
    ['Level', formState.level],
    ['Language', formState.language],
    ['Budget', formState.budget],
  ]

  return (
    <Section theme={themeSignal()}>
      <SectionTitle theme={themeSignal()}>Form</SectionTitle>
      <Grid>
        <For each={() => fields} by={(f: FieldEntry) => f[0]}>
          {(f: FieldEntry) => {
            const [label, sig] = f
            return (
              <Field theme={themeSignal()}>
                {label}
                <Input
                  theme={themeSignal()}
                  value={sig()}
                  onInput={(ev: Event) => {
                    sig.set((ev.currentTarget as HTMLInputElement).value)
                  }}
                />
              </Field>
            )
          }}
        </For>
      </Grid>
    </Section>
  )
}

// ── Journey-shaped sections ──────────────────────────────────────────────────

function ChatSection() {
  const append = (n: number) => {
    const next = [...chatMessages()]
    for (let i = 0; i < n; i++) next.push(makeChatMessage())
    chatMessages.set(next)
  }
  return (
    <Section theme={themeSignal()}>
      <Row>
        <SectionTitle theme={themeSignal()}>Chat (append-heavy)</SectionTitle>
        <div style="flex: 1" />
        <GhostButton
          theme={themeSignal()}
          data-testid="chat-append-1"
          onClick={() => append(1)}
        >
          Append 1
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="chat-append-100"
          onClick={() => append(100)}
        >
          Append 100
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="chat-reset"
          onClick={() => {
            _chatId = 0
            chatMessages.set(Array.from({ length: 50 }, () => makeChatMessage()))
          }}
        >
          Reset
        </GhostButton>
      </Row>
      <div
        style="max-height: 240px; overflow-y: auto; border: 1px solid var(--c, #444); padding: 8px;"
        data-testid="chat-scroll"
      >
        <For each={() => chatMessages()} by={(m: ChatMessage) => m.id}>
          {(m: ChatMessage) => (
            <div style="padding: 4px 0; font-family: monospace; font-size: 12px;">
              <strong>{m.author}</strong>: {m.text}
            </div>
          )}
        </For>
      </div>
    </Section>
  )
}

function WidgetGridSection() {
  return (
    <Section theme={themeSignal()}>
      <Row>
        <SectionTitle theme={themeSignal()}>Live widgets (50)</SectionTitle>
        <div style="flex: 1" />
        <GhostButton
          theme={themeSignal()}
          data-testid="dashboard-churn-start"
          onClick={() => startWidgetChurn()}
        >
          Start churn
        </GhostButton>
        <GhostButton
          theme={themeSignal()}
          data-testid="dashboard-churn-stop"
          onClick={() => stopWidgetChurn()}
        >
          Stop churn
        </GhostButton>
      </Row>
      <Grid>
        <For each={() => widgetValues} by={(w: Widget) => w.id}>
          {(w: Widget) => (
            <Card theme={themeSignal()} data-testid={`widget-${w.id}`}>
              <CardLabel theme={themeSignal()}>Widget {w.id}</CardLabel>
              <CardValue theme={themeSignal()}>{() => w.sig().toLocaleString()}</CardValue>
            </Card>
          )}
        </For>
      </Grid>
    </Section>
  )
}

function LongFormSection() {
  return (
    <Section theme={themeSignal()}>
      <SectionTitle theme={themeSignal()}>Long form (30 fields, cross-field validation)</SectionTitle>
      <Grid>
        <For each={() => longFormFields} by={(f: FormField) => f.id}>
          {(f: FormField) => (
            <Field theme={themeSignal()}>
              Field {f.id}
              <Input
                theme={themeSignal()}
                data-testid={`form-field-${f.id}`}
                value={f.sig()}
                onInput={(ev: Event) => f.sig.set((ev.currentTarget as HTMLInputElement).value)}
              />
            </Field>
          )}
        </For>
        <Field theme={themeSignal()}>
          Password
          <Input
            theme={themeSignal()}
            data-testid="form-password"
            value={passwordSignal()}
            onInput={(ev: Event) =>
              passwordSignal.set((ev.currentTarget as HTMLInputElement).value)
            }
          />
        </Field>
        <Field theme={themeSignal()}>
          Confirm password
          <Input
            theme={themeSignal()}
            data-testid="form-confirm-password"
            value={confirmPasswordSignal()}
            onInput={(ev: Event) =>
              confirmPasswordSignal.set((ev.currentTarget as HTMLInputElement).value)
            }
          />
        </Field>
      </Grid>
      <div data-testid="form-validation-state" style="font-family: monospace; padding: 8px;">
        passwords match (and ≥6 chars):{' '}
        <Accent theme={themeSignal()}>{() => (passwordsMatch() ? 'yes' : 'no')}</Accent>
      </div>
    </Section>
  )
}

function ModalSection() {
  return (
    <Section theme={themeSignal()}>
      <Row>
        <SectionTitle theme={themeSignal()}>Modal</SectionTitle>
        <div style="flex: 1" />
        <Button theme={themeSignal()} data-testid="open-modal" onClick={() => modalOpen.set(true)}>
          Open modal
        </Button>
      </Row>
      <Show when={() => modalOpen()}>
        {() => (
          <ModalBackdrop data-testid="modal-backdrop" onClick={() => modalOpen.set(false)}>
            <ModalBody theme={themeSignal()} onClick={(ev: Event) => ev.stopPropagation()}>
              <h3 style="margin-top: 0;">Hello, modal</h3>
              <p>
                Mounting and unmounting this modal bumps{' '}
                <Accent theme={themeSignal()}>runtime.mount</Accent> /{' '}
                <Accent theme={themeSignal()}>runtime.unmount</Accent> via the surrounding Show's
                conditional mountChild.
              </p>
              <Row>
                <div style="flex: 1" />
                <GhostButton
                  theme={themeSignal()}
                  data-testid="close-modal"
                  onClick={() => modalOpen.set(false)}
                >
                  Close
                </GhostButton>
              </Row>
            </ModalBody>
          </ModalBackdrop>
        )}
      </Show>
    </Section>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────────

export function App() {
  // Reactive theme sink — styler's DynamicStyled reads ThemeContext inside
  // a computed, so changing the themeSignal re-resolves all styled components
  // and swaps their class names in place.
  provide(ThemeContext, () => themeSignal() as unknown as Record<string, unknown>)

  return (
    <Shell theme={themeSignal()}>
      <Header theme={themeSignal()}>
        <Title theme={themeSignal()}>
          Pyreon · <Accent theme={themeSignal()}>perf-dashboard</Accent>
        </Title>
        <Row>
          <GhostButton
            theme={themeSignal()}
            data-testid="toggle-theme"
            onClick={() => themeSignal.set(isLight() ? darkTheme : lightTheme)}
          >
            {() => (isLight() ? '☀ light' : '☾ dark')}
          </GhostButton>
          <GhostButton
            theme={themeSignal()}
            data-testid="open-overlay"
            onClick={() => perfHarness.overlay()}
          >
            ⌃⇧P perf
          </GhostButton>
        </Row>
      </Header>

      <StatsSection />
      <TableSection />
      <FormSection />
      <ChatSection />
      <WidgetGridSection />
      <LongFormSection />
      <ModalSection />
    </Shell>
  )
}
