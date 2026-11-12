import { For } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { font, motion, radius, text } from '../theme'
import { el, type ButtonAttrs, focusRing, tone, txt } from '../kit/bases'
import { CodeBlock } from '../kit/code'
import { DemoGrid, DemoPanel } from '../kit/demo'
import { Eyebrow } from '../kit/type'
import { AFTER_FIX, HAND_FIXED, PLANTED, RUNS } from './_capture-tooling'
import { Replay, type ReplayKind, type ReplayLine } from './_replay-b'

type Step = 'run1' | 'fix' | 'run2' | 'run3'

const STEPS: readonly { id: Step; command: string; label: string; file: string; fileLabel: string }[] = [
  { id: 'run1', command: 'pyreon doctor', label: 'Run doctor', file: PLANTED, fileLabel: 'ColumnStats.tsx · as planted' },
  { id: 'fix', command: 'pyreon doctor --fix', label: 'Apply the auto-fixes', file: AFTER_FIX, fileLabel: 'ColumnStats.tsx · after --fix' },
  { id: 'run2', command: 'pyreon doctor', label: 'Run doctor again', file: AFTER_FIX, fileLabel: 'ColumnStats.tsx · after --fix' },
  { id: 'run3', command: 'pyreon doctor', label: 'Fix the rest by hand, run again', file: HAND_FIXED, fileLabel: 'ColumnStats.tsx · fixed by hand' },
]

/** Colour only: every line is doctor's text, unchanged. */
const kindOf = (t: string): ReplayKind => {
  const s = t.trimStart()
  if (s.startsWith('Score:')) {
    const n = Number(/(\d+)\/100/.exec(s)?.[1] ?? 0)
    return n >= 90 ? 'ok' : n >= 70 ? 'warn' : 'err'
  }
  const bar = /^\S+\s+[█░]+ (\d+)/.exec(s)
  if (bar) {
    const n = Number(bar[1])
    return n >= 90 ? 'ok' : n >= 70 ? 'warn' : 'err'
  }
  if (s.startsWith('✗')) return 'err'
  if (s.startsWith('!')) return 'warn'
  if (s.startsWith('ℹ')) return 'cmd'
  if (/^(pyreon doctor|Per category|Top findings)/.test(s)) return 'head'
  if (s.startsWith('src/')) return 'cmd'
  if (/^(Skipped|Scope|Scanned|exit \d)|skipped$|…and/.test(s) || /^\s{5}\S/.test(t)) return 'dim'
  return 'out'
}

const Steps = el
  .config({ name: 'DoctorSteps' })
  .attrs({ tag: 'fieldset', block: true, gap: 6 })
  .theme(() => ({ margin: 0, marginTop: 12, marginBottom: 18, padding: 0, border: 'none', minWidth: 0 }))

const StepButton = el
  .config({ name: 'DoctorStep' })
  .attrs<ButtonAttrs>({ tag: 'button', block: true, contentAlignX: 'left', gap: 2 })
  .theme((_t, m) => ({
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 14,
    paddingRight: 14,
    borderRadius: radius.note,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: 'transparent',
    color: tone(m, 'mist'),
    textAlign: 'left',
    fontFamily: font.sans,
    fontSize: text.small.size,
    transition: `border-color ${motion.hover}, color ${motion.hover}`,
    hover: { borderColor: tone(m, 'lineHover'), color: tone(m, 'text') },
    focus: focusRing(m),
    pressed: { borderColor: tone(m, 'currentBorder'), backgroundColor: tone(m, 'currentFill'), color: tone(m, 'strong') },
  }))

const Cmd = txt
  .config({ name: 'DoctorStepCmd' })
  .attrs({ tag: 'code' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: text.mono.size, color: tone(m, 'fog') }))

const Snippet = el
  .config({ name: 'DoctorSnippet' })
  .attrs({ block: true })
  .theme((_t, m) => ({
    marginTop: 10,
    minWidth: 0,
    borderRadius: radius.note,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'well'),
    overflow: 'hidden',
  }))

/**
 * Tooling demo (`tooling.json` → demo): four REAL `pyreon doctor` runs on a
 * copy of examples/kanban with one planted file (`_capture-tooling.ts`):
 * the first audit, `--fix`, the re-run, and the re-run after the remaining
 * fixes by hand. Pick a step; the terminal replays exactly what doctor
 * printed, and the left panel shows the planted file at that step.
 */
export default function DemoTooling() {
  const step = signal<Step>('run1')
  const current = computed(() => STEPS.find((s) => s.id === step()) ?? STEPS[0]!)
  const output = computed<ReplayLine[]>(() => [
    { k: 'cmd', t: `$ ${current().command}` },
    ...RUNS[step()].split('\n').map((t) => ({ k: kindOf(t), t })),
  ])

  return (
    <DemoGrid>
      <DemoPanel note="The other findings are the kanban example's own; doctor reports them too.">
        <Eyebrow>steps</Eyebrow>
        <Steps aria-label="doctor runs">
          <For each={STEPS} by={(s) => s.id}>
            {(s) => (
              <StepButton type="button" aria-pressed={() => (step() === s.id ? 'true' : 'false')} onClick={() => step.set(s.id)}>
                <span>
                  {`${STEPS.indexOf(s) + 1}. `}
                  {s.label}
                </span>
                <Cmd>{s.command}</Cmd>
              </StepButton>
            )}
          </For>
        </Steps>
        <Eyebrow>{() => current().fileLabel}</Eyebrow>
        {() => (
          <Snippet>
            <CodeBlock code={current().file} label={current().fileLabel} />
          </Snippet>
        )}
      </DemoPanel>
      <Replay
        lines={() => output()}
        replayKey={() => step()}
        autoplay
        delay={45}
        label="pyreon doctor output"
        title="examples/kanban + a planted ColumnStats.tsx"
        command="pyreon doctor"
        source="captured 2026-11-11 from a copy of examples/kanban with one planted file; the four runs in order"
      />
    </DemoGrid>
  )
}
