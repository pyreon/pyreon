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
import { field, useForm } from '@pyreon/form'
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
import { DomStressSection } from './components/DomStressSection'
import { QueryStressSection } from './components/QueryStressSection'
import { RxStressSection } from './components/RxStressSection'
import { StoreStressSection } from './components/StoreStressSection'
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

// ── Forms-stress state ───────────────────────────────────────────────────────
//
// Variable-scale `@pyreon/form` benchmark. Default scale is 0 (nothing
// mounted) so the page boots fast. Journeys flip the scale signal to
// trigger a fresh mount of N fields via the per-N FormAtScale instance,
// then optionally drive `useFormState` reads for the smoking-gun
// `form.formStateScan.fieldsRead` counter.
//
// Why a per-scale wrapper component (FormAtScale) rather than `useForm`
// directly inside the section: useForm runs at component setup. Changing
// the scale signal must REMOUNT the inner subtree so a fresh useForm runs
// with the new field count — `<Show when={...}>` toggles mount/unmount;
// pairing it with a keyed inner means each scale change unmounts the old
// form (firing its disposal hooks) and mounts a fresh one. Without the
// remount, the same useForm instance from the FIRST scale would hang
// around forever.

export const formStressScale = signal<number>(0)

// Last-read `useFormState` snapshot — exposed to the journey via the
// window hook so Playwright can read what the latest scan returned. Lets
// us assert "selector narrowed correctly" or "all fields scanned" without
// inspecting the DOM.
export const formStressLastSummary = signal<unknown>(null)

// Last-read `useFormState(form, selector)` value — separate signal for
// `formStateReadSelector` journey so we can compare counter signatures.
export const formStressLastSelectorValue = signal<unknown>(null)

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

// ── Forms-stress section ─────────────────────────────────────────────────────
//
// Variable-scale `@pyreon/form` exercise. Mounted only when
// `formStressScale() > 0`. Each scale change unmounts the prior FormAtScale
// (with its useForm) and mounts a fresh one — this is the boundary the
// `formMount-*` journeys measure.

function FormAtScale(props: { scale: number }) {
  // Generate field defs at component setup. useForm is called ONCE at this
  // setup with N fields → 6×N signals + N effects allocated eagerly.
  const fieldDefs = Array.from({ length: props.scale }, (_, i) => field(`f${i}`, ''))
  const form = useForm({
    fields: fieldDefs,
    onSubmit: () => {},
  })

  // Expose the form to the window helper so the journey can:
  //   1. fill fields by name without DOM lookups (faster Playwright path)
  //   2. trigger useFormState reads to capture the formStateScan counter
  //
  // Cleared by FormStressSection's <Show> when scale flips back to 0.
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __pyreon_perf_forms_active?: { form: unknown; scale: number } }).__pyreon_perf_forms_active =
      { form, scale: props.scale }
  }

  return (
    <Section theme={themeSignal()}>
      <SectionTitle theme={themeSignal()}>
        Forms stress ({props.scale} fields via @pyreon/form)
      </SectionTitle>
      {/* The ready marker carries text so Playwright's default `visible`
          state check (waitForSelector) treats it as visible — a zero-
          sized empty div is "hidden" by default and `record.ts` would
          time out with `locator resolved to hidden ...`. */}
      <div data-testid="forms-stress-ready" data-scale={String(props.scale)}>
        Mounted {props.scale} fields
      </div>
      <Grid>
        <For each={() => Object.keys(form.fields)} by={(name) => name}>
          {(name) => (
            <Field theme={themeSignal()}>
              {name}
              <Input
                theme={themeSignal()}
                data-testid={`forms-stress-field-${name}`}
                value={() => String(form.fields[name as keyof typeof form.fields]?.value() ?? '')}
                onInput={(ev: Event) => {
                  const f = form.fields[name as keyof typeof form.fields]
                  if (f) f.value.set((ev.currentTarget as HTMLInputElement).value as never)
                }}
              />
            </Field>
          )}
        </For>
      </Grid>
    </Section>
  )
}

function FormStressSection() {
  // Use `<For>` keyed by scale so a scale change (e.g. 100 → 1000) FORCES
  // an unmount + remount cycle — the prior FormAtScale's useForm disposes
  // and a fresh one allocates with the new field count. `<Show>` would
  // stay at "true" and re-evaluate children with the new prop instead of
  // remounting, defeating the per-scale isolation we need.
  return (
    <For
      each={() => (formStressScale() > 0 ? [formStressScale()] : [])}
      by={(s: number) => s}
    >
      {(scale: number) => <FormAtScale scale={scale} />}
    </For>
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
      <FormStressSection />
      <ModalSection />
      <StoreStressSection />
      <RxStressSection />
      <QueryStressSection />
      <DomStressSection />
    </Shell>
  )
}
