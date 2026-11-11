import { For } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { font, motion, radius, text } from '../theme'
import { el, type ButtonAttrs, focusRing, tone } from '../kit/bases'
import { CodeBlock } from '../kit/code'
import { DemoGrid, DemoPanel } from '../kit/demo'
import { Eyebrow } from '../kit/type'
import { AI_CAPTURES, MCP_CAPTURED, MCP_SERVER } from './_capture-ai'
import { Replay, type ReplayKind, type ReplayLine } from './_replay-b'

type QuestionId = keyof typeof AI_CAPTURES

const QUESTIONS: readonly { id: QuestionId; ask: string }[] = [
  { id: 'label', ask: "Why doesn't my label update?" },
  { id: 'list', ask: 'Is this list right?' },
  { id: 'button', ask: "Why doesn't the button count?" },
  { id: 'api', ask: 'How do I write to a signal?' },
]

const Questions = el
  .config({ name: 'AiQuestions' })
  .attrs({ tag: 'fieldset', block: true, gap: 8 })
  .theme(() => ({ marginTop: 12, marginBottom: 20, marginLeft: 0, marginRight: 0, padding: 0, border: 'none', minWidth: 0 }))

const Question = el
  .config({ name: 'AiQuestion' })
  .attrs<ButtonAttrs>({ tag: 'button', block: true, contentAlignX: 'left' })
  .theme((_t, m) => ({
    paddingTop: 13,
    paddingBottom: 13,
    paddingLeft: 16,
    paddingRight: 16,
    borderRadius: radius.note,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: 'transparent',
    color: tone(m, 'mist'),
    fontFamily: font.sans,
    fontSize: text.small.size,
    textAlign: 'left',
    transition: `border-color ${motion.hover}, color ${motion.hover}`,
    hover: { borderColor: tone(m, 'lineHover'), color: tone(m, 'text') },
    focus: focusRing(m),
    pressed: { borderColor: tone(m, 'currentBorder'), backgroundColor: tone(m, 'currentFill'), color: tone(m, 'strong') },
  }))

const Snippet = el
  .config({ name: 'AiSnippet' })
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
 * "Trimmed to fit": lines from the first one matching `from` up to (not
 * including) the first one matching `until` (or the end) are dropped and
 * replaced by a marked note. The kept lines are verbatim.
 */
const TRIM: Partial<Record<QuestionId, { from: RegExp; until?: RegExp }>> = {
  // The footgun summary and the note repeat the inline annotation above them.
  label: { from: /^⚠ \d+ footgun/ },
  // The prose paragraph between the usage and the common mistakes.
  api: { from: /^\*\*Notes:\*\*/, until: /^\*\*Common mistakes/ },
}

const trimmed = (id: QuestionId, result: string): ReplayLine[] => {
  const all = result.split('\n')
  const rule = TRIM[id]
  const start = rule ? all.findIndex((t) => rule.from.test(t)) : -1
  if (!rule || start < 0) return all.map((t) => ({ k: kindOf(t), t }))
  const rest = rule.until ? all.findIndex((t, i) => i > start && rule.until?.test(t)) : -1
  const end = rest < 0 ? all.length : rest
  const n = all.slice(start, end).filter((t) => t.trim() !== '').length
  return [
    ...all.slice(0, start).map((t) => ({ k: kindOf(t), t })),
    { k: 'note' as const, t: `[${n} line${n === 1 ? '' : 's'} of the result trimmed here]` },
    ...all.slice(end).map((t) => ({ k: kindOf(t), t })),
  ]
}

/** Colour only: the text of every line is the tool's, unchanged. */
const kindOf = (t: string): ReplayKind => {
  if (/^(Reactivity map|Found \d|## |✓)/.test(t)) return 'head'
  if (t.includes('⚠') || /^\d+\. \*\*/.test(t)) return 'warn'
  if (t.includes('◆ live') || /^\s+Fix:/.test(t)) return 'ok'
  if (t.includes('○ baked')) return 'dim'
  return 'out'
}

/**
 * AI demo (`ai.json` → demo): four questions, each answered by a real
 * `@pyreon/mcp` tool call (explain_reactivity, validate ×2, get_api). The
 * results in `_capture-ai.ts` were recorded over stdio from the server this
 * repo builds; the assistant's side of the conversation is simulated, and the
 * caption says so.
 */
export default function DemoAi() {
  const active = signal<QuestionId>('label')
  const capture = computed(() => AI_CAPTURES[active()])

  const transcript = computed<ReplayLine[]>(() => {
    const q = QUESTIONS.find((x) => x.id === active())
    const c = capture()
    return [
      { k: 'user', t: `you › ${q?.ask ?? ''}` },
      { k: 'cmd', t: `→ ${c.tool}(${c.args})` },
      ...trimmed(active(), c.result),
    ]
  })

  return (
    <DemoGrid>
      <DemoPanel>
        <Eyebrow>ask</Eyebrow>
        <Questions aria-label="Questions for the assistant">
          <For each={QUESTIONS} by={(q) => q.id}>
            {(q) => (
              <Question
                type="button"
                aria-pressed={() => (active() === q.id ? 'true' : 'false')}
                onClick={() => active.set(q.id)}
              >
                {q.ask}
              </Question>
            )}
          </For>
        </Questions>
        <Eyebrow>{() => (capture().file ? `the snippet · ${capture().file}` : 'no snippet · get_api reads the package manifest')}</Eyebrow>
        {() => {
          const c = capture()
          return c.code ? (
            <Snippet>
              <CodeBlock code={c.code} label={`Snippet ${c.file ?? ''}`} />
            </Snippet>
          ) : null
        }}
      </DemoPanel>
      <Replay
        lines={() => transcript()}
        replayKey={() => active()}
        autoplay
        label="Assistant transcript with MCP tool output"
        title="assistant ↔ @pyreon/mcp"
        command={`stdio · ${MCP_SERVER}`}
        kind="simulated conversation, real tool output"
        source={`results recorded over stdio from the repo's @pyreon/mcp, ${MCP_CAPTURED}`}
      />
    </DemoGrid>
  )
}
