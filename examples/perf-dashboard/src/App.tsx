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
import { For, h, provide, Show } from '@pyreon/core'
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
      <ModalSection />
    </Shell>
  )
}
