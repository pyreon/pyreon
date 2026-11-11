import { signal } from '@pyreon/reactivity'
import { font, text } from '../theme'
import { el, tone, txt } from '../kit/bases'
import { GlowCard } from '../kit/cards'
import { CodeCard, CodeDiff } from '../kit/code'
import { Segmented } from '../kit/controls'
import { AutoGrid } from '../kit/layout'
import { Code, Eyebrow, Heading } from '../kit/type'
import { CHECK_AFTER, CHECK_BEFORE, type Framework, MIGRATIONS } from './_capture-migrate'
import { lines, Replay, type ReplayLine } from './_replay-b'
import { KitScope } from '../kit/scope'

const FRAMEWORKS: readonly Framework[] = ['React', 'Preact', 'Vue', 'Solid', 'Svelte']

const Stack = el.config({ name: 'MigrateStack' }).attrs({ block: true, gap: 16 }).theme(() => ({ minWidth: 0 }))

const Picker = el
  .config({ name: 'MigratePicker' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 12 })
  .theme(() => ({ flexWrap: 'wrap' }))

const Note = txt
  .config({ name: 'MigrateNote' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, marginTop: 12, fontFamily: font.sans, fontSize: text.caption.size, lineHeight: 1.55, color: tone(m, 'mist') }))

// `pyreon check` on the React pair: real output, with the exit codes it printed.
const CHECK: ReplayLine[] = [
  { k: 'cmd', t: '$ pyreon check src/Counter.tsx' },
  ...lines('out', CHECK_BEFORE).map((l) => ({
    k: l.t.includes('[react:') ? ('err' as const) : l.t.trimStart().startsWith('→') ? ('ok' as const) : l.k,
    t: l.t,
  })),
  { k: 'dim', t: 'exit 1' },
  { k: 'out', t: '' },
  { k: 'note', t: '[the same file after step 2]' },
  { k: 'cmd', t: '$ pyreon check src/Counter.tsx' },
  { k: 'ok', t: CHECK_AFTER },
  { k: 'dim', t: 'exit 0' },
]

/**
 * Migrate demo (`migrate.json` → demo): pick the framework you are coming
 * from. Step one is the config line or import that moves to the compat layer
 * (an ILLUSTRATIVE diff, labelled as one); step two is the same component or
 * store in native Pyreon. Below, real `pyreon check` output on the React
 * pair, before and after (`_capture-migrate.ts`).
 */
export default function DemoMigrate() {
  const fw = signal<Framework>('React')

  return (
    <KitScope>
      <Stack>
        <Picker>
          <Eyebrow>from</Eyebrow>
          <Segmented options={FRAMEWORKS} value={() => fw()} onChange={(v) => fw.set(v)} label="Framework you are coming from" />
        </Picker>
        {() => {
          const m = MIGRATIONS[fw()]
          return (
            <AutoGrid cols={3} gap={12}>
              <GlowCard padding="compact">
                <Eyebrow>step 1 · today · illustrative diff</Eyebrow>
                <Heading size="step" tag="h3">
                  Swap the import
                </Heading>
                <CodeDiff
                  rows={[
                    ['-', m.from],
                    ['+', m.to],
                  ]}
                  label={`Illustrative diff: ${m.from} becomes ${m.to}`}
                />
                <Note>
                  {m.note} Package: <Code>{m.pkg}</Code>.
                </Note>
              </GlowCard>
              <CodeCard label="step 2 · before · illustrative" caption={`Your ${fw()} code.`} code={m.before} rail="del" />
              <CodeCard label="step 2 · after · native Pyreon" caption="The same thing in Pyreon." code={m.after} state="hot" rail="ins" />
            </AutoGrid>
          )
        }}
        <Replay
          lines={() => CHECK}
          label="pyreon check output on the React example"
          title="React example · step 2 before → after"
          command="pyreon check"
          source="captured 2026-11-11 with the worktree CLI on the React pair (pick React above to see the files)"
          autoplay
          delay={160}
        />
      </Stack>
    </KitScope>
  )
}
