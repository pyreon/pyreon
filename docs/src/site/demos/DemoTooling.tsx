import { For } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { font, motion, radius, text } from '../theme'
import { el, type ButtonAttrs, focusRing, tone, txt } from '../kit/bases'
import { Pill } from '../kit/controls'
import { DemoGrid, DemoPanel } from '../kit/demo'
import { Eyebrow } from '../kit/type'
import { type Category, FINDINGS, type Severity, SKIPPED } from './_capture-tooling'
import { Replay, type ReplayKind, type ReplayLine } from './_replay-b'

const CATEGORIES: readonly Category[] = ['correctness', 'performance', 'architecture', 'testing']
const PENALTY: Record<Severity, number> = { error: 10, warning: 3, info: 1 }
const ICON: Record<Severity, string> = { error: '✗', warning: '!', info: 'ℹ' }
const RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 }
const TOP = 4

// doctor/score.ts → gradeFor
const grade = (n: number) => (n >= 90 ? 'A' : n >= 80 ? 'B' : n >= 70 ? 'C' : n >= 60 ? 'D' : 'F')
const gradeKind = (g: string): ReplayKind => (g === 'A' ? 'ok' : g === 'B' || g === 'C' ? 'warn' : 'err')
const sevKind = (s: Severity): ReplayKind => (s === 'error' ? 'err' : s === 'warning' ? 'warn' : 'cmd')
const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length))
// doctor/render/text.ts → renderBar (12 cells)
const bar = (score: number) => {
  const filled = Math.round((score / 100) * 12)
  return '█'.repeat(filled) + '░'.repeat(12 - filled)
}

const Cards = el
  .config({ name: 'DoctorFindings' })
  .attrs({ tag: 'ul', block: true, gap: 8, contentAlignX: 'block' })
  .theme(() => ({ listStyle: 'none', margin: 0, marginTop: 12, marginBottom: 14, padding: 0 }))

const Card = el
  .config({ name: 'DoctorFinding' })
  .attrs<ButtonAttrs>({ tag: 'button', block: true, contentAlignX: 'left', gap: 4 })
  .theme((_t, m) => ({
    width: '100%',
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
    fontSize: text.caption.size,
    lineHeight: 1.5,
    transition: `opacity ${motion.hover}, border-color ${motion.hover}`,
    hover: { borderColor: tone(m, 'lineHover') },
    focus: focusRing(m),
    pressed: { opacity: 0.45, extendCss: '& [data-msg] { text-decoration: line-through; }' },
  }))

const Sev = txt
  .config({ name: 'DoctorSeverity' })
  .attrs({ tag: 'b' })
  .theme(() => ({ fontFamily: font.mono, fontWeight: 400, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }))
  .states((_t, m) => ({ error: { color: tone(m, 'err') }, warning: { color: tone(m, 'warn') }, info: { color: tone(m, 'fog') } }))

const Msg = txt
  .config({ name: 'DoctorMessage' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    display: 'block',
    color: tone(m, 'text'),
    extendCss: 'display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;',
  }))

const Where = txt
  .config({ name: 'DoctorWhere' })
  .attrs({ tag: 'code' })
  .theme((_t, m) => ({ fontFamily: font.mono, fontSize: 11.5, color: tone(m, 'fog'), overflowWrap: 'anywhere' }))

const Actions = el
  .config({ name: 'DoctorActions' })
  .attrs({ block: true, contentDirection: 'inline', gap: 8 })
  .theme(() => ({ flexWrap: 'wrap' }))

/**
 * Tooling demo (`tooling.json` → demo): a simulated `pyreon doctor` run whose
 * findings, skip reasons, scoring and layout are doctor's own
 * (`_capture-tooling.ts` names the source of each). Click a finding to fix
 * it, or run `--fix` for the auto-fixable ones; the terminal re-renders the
 * report the way doctor/render/text.ts lays it out.
 */
export default function DemoTooling() {
  const fixed = signal<ReadonlySet<string>>(new Set())
  const runs = signal(0)

  const open = computed(() =>
    FINDINGS.filter((f) => !fixed().has(f.id))
      .slice()
      .sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.category.localeCompare(b.category) || a.code.localeCompare(b.code)),
  )

  const output = computed<ReplayLine[]>(() => {
    const list = open()
    const scores = CATEGORIES.map((c) => {
      const inCat = list.filter((f) => f.category === c)
      const score = Math.max(0, Math.min(100, 100 - inCat.reduce((s, f) => s + PENALTY[f.severity], 0)))
      const e = inCat.filter((f) => f.severity === 'error').length
      const w = inCat.filter((f) => f.severity === 'warning').length
      return { c, score, e, w }
    })
    const all = Math.round(scores.reduce((s, x) => s + x.score, 0) / scores.length)
    const g = grade(all)
    const lines: ReplayLine[] = [
      { k: 'cmd', t: '$ pyreon doctor' },
      { k: 'out', t: '' },
      { k: 'head', t: '  pyreon doctor · project health audit' },
      { k: 'out', t: '' },
      { k: gradeKind(g), t: `  Score:  ${all}/100   Grade: ${g}` },
      { k: 'out', t: '' },
      { k: 'head', t: '  Per category:' },
      { k: 'out', t: '' },
      ...scores.map((s) => ({
        k: gradeKind(grade(s.score)),
        t: `  ${pad(s.c, 14)} ${bar(s.score)} ${pad(String(s.score), 3)} · ${
          s.e + s.w === 0 ? 'clean' : [s.e ? `${s.e}E` : '', s.w ? `${s.w}W` : ''].filter(Boolean).join(' ')
        }`,
      })),
      { k: 'dim', t: `  ${pad('documentation', 14)} skipped` },
      { k: 'dim', t: `  ${pad('best-practices', 14)} clean (advisory — not graded)` },
      { k: 'out', t: '' },
    ]
    if (list.length === 0) {
      lines.push({ k: 'ok', t: '  ✓ No findings. Your project is healthy.' })
    } else {
      const shown = list.slice(0, TOP)
      lines.push({ k: 'head', t: `  Top findings (${shown.length} of ${list.length}):` }, { k: 'out', t: '' })
      for (const f of shown) {
        lines.push({ k: sevKind(f.severity), t: `  ${ICON[f.severity]} ${f.message}  ${f.code}` }, { k: 'cmd', t: `     ${f.location}` })
        if (f.fix) lines.push({ k: 'dim', t: `     fix: ${f.fix}` })
        lines.push({ k: 'out', t: '' })
      }
      if (list.length > TOP) lines.push({ k: 'dim', t: `  …and ${list.length - TOP} more. Run with --json for the full list.` }, { k: 'out', t: '' })
    }
    lines.push({ k: 'dim', t: `  Skipped: ${SKIPPED}` })
    return lines
  })

  const toggle = (id: string) => {
    const next = new Set(fixed.peek())
    if (next.has(id)) next.delete(id)
    else next.add(id)
    fixed.set(next)
  }

  return (
    <DemoGrid>
      <Replay
        lines={() => output()}
        replayKey={() => runs()}
        autoplay
        delay={70}
        label="pyreon doctor output"
        title="~/acme-app"
        command="pyreon doctor"
        kind="simulated run"
        source="finding codes, messages, skip reasons, scoring and layout are doctor's own; the app is made up"
      />
      <DemoPanel note="Errors cost 10 points, warnings 3, info 1, per category; the score is the rounded mean of the measured categories.">
        <Eyebrow>findings · click to mark fixed</Eyebrow>
        <Cards aria-label="Findings">
          <For each={FINDINGS} by={(f) => f.id}>
            {(f) => (
              <li>
                <Card type="button" aria-pressed={() => (fixed().has(f.id) ? 'true' : 'false')} onClick={() => toggle(f.id)}>
                  <Sev state={f.severity}>
                    {f.severity}
                    {f.auto ? ' · auto-fixable' : ''}
                  </Sev>
                  <Msg data-msg="">{f.message}</Msg>
                  <Where>
                    {f.code} · {f.location}
                  </Where>
                </Card>
              </li>
            )}
          </For>
        </Cards>
        <Actions>
          <Pill
            variant="solid"
            onClick={() => {
              fixed.set(new Set([...fixed.peek(), ...FINDINGS.filter((f) => f.auto).map((f) => f.id)]))
              runs.update((n) => n + 1)
            }}
          >
            pyreon doctor --fix
          </Pill>
          <Pill
            onClick={() => {
              fixed.set(new Set())
              runs.update((n) => n + 1)
            }}
          >
            reset
          </Pill>
        </Actions>
      </DemoPanel>
    </DemoGrid>
  )
}
