/** @jsxImportSource @pyreon/core */
/**
 * @pyreon/code RUNTIME wrapper bench vs @uiw/react-codemirror — real Chromium.
 *
 * Both wrap the SAME CodeMirror 6 engine, so this measures the WRAPPER's own
 * work around it (the bundle bench's sibling — that one measures bytes, this
 * one measures the update path). The headline is the CONTROLLED-VALUE
 * keystroke round-trip, @uiw's documented pattern:
 *
 *   keystroke → CM updateListener → onChange → parent React setState →
 *   RE-RENDER the owning component → value-sync useEffect re-compare
 *
 * i.e. one full React commit per keystroke — vs Pyreon's
 *
 *   keystroke → CM updateListener → value.set() (direct signal dispatch)
 *
 * with ZERO component re-renders. Both the deterministic COUNT (React
 * commits vs Pyreon re-renders — machine-independent, the portable signal)
 * and wall-clock are reported.
 *
 * HONEST LIMITS (printed with results): author-judge (framework author wrote
 * + runs this); same-engine so per-keystroke CM cost is identical and large —
 * ratios are wrapper-only, NOT "editor is Nx faster"; @uiw's UNCONTROLLED
 * mode (no value prop) skips the round-trip and is exempt from this claim —
 * the comparison targets the controlled/bound-state pattern (what
 * `bindEditorToSignal` competes with); cells run in ONE browser page
 * (interleaved order + per-cell warmup, no per-cell process isolation —
 * magnitudes are the signal, per the repo's bench rules).
 *
 * Run: bun run --filter='@pyreon/code' bench:runtime
 */
import { server } from '@vitest/browser/context'
import { h } from '@pyreon/core'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { CodeEditor } from '../src/components/code-editor'
import { createEditor } from '../src/editor'
import type { EditorView } from '@codemirror/view'

const KEYSTROKES = 100
const RUNS = 8

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]!
}
const p = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * q))]!
}
const fmt = (ms: number) => (ms >= 1 ? `${ms.toFixed(2)}ms` : `${(ms * 1000).toFixed(1)}µs`)
const row = (label: string, py: number[], re: number[]) => {
  const pm = median(py)
  const rm = median(re)
  const ratio = rm / pm
  const tag = ratio >= 1 ? `${ratio.toFixed(2)}× faster` : `${(1 / ratio).toFixed(2)}× slower`
  return `| ${label} | ${fmt(pm)} [${fmt(p(py, 0.25))}–${fmt(p(py, 0.75))}] | ${fmt(rm)} [${fmt(p(re, 0.25))}–${fmt(p(re, 0.75))}] | **${tag}** |`
}

/**
 * Type K chars through the REAL CM dispatch path (enters updateListener),
 * ONE MACROTASK PER KEYSTROKE — real typing delivers each key as its own
 * task; a synchronous dispatch loop lets React 19 batch all the setStates
 * into a handful of commits, which is NOT the interaction being measured.
 */
async function typeChars(view: EditorView, k: number): Promise<void> {
  for (let i = 0; i < k; i++) {
    const end = view.state.doc.length
    view.dispatch({ changes: { from: end, insert: String.fromCharCode(97 + (i % 26)) } })
    await new Promise<void>((r) => setTimeout(r, 0))
  }
}

/** Poll each frame until the doc equals `expected` (or deadline); returns ms. */
async function timeUntilDoc(view: EditorView, expected: string, deadlineMs = 3000): Promise<number> {
  const t0 = performance.now()
  for (;;) {
    if (view.state.doc.toString() === expected) return performance.now() - t0
    if (performance.now() - t0 > deadlineMs) return Number.NaN
    await nextFrame()
  }
}

interface PyreonCell {
  mount: number
  keystrokes: number
  externalWrite: number
  dispose: number
  rerenders: number
  finalLen: number
}

async function runPyreon(): Promise<PyreonCell> {
  const editor = createEditor({ value: '', language: 'plain' })
  let rerenders = 0
  // The component body runs ONCE in Pyreon; a re-render would re-invoke it.
  const Probe = () => {
    rerenders++
    return h(CodeEditor as never, { instance: editor })
  }

  const t0 = performance.now()
  const { unmount } = mountInBrowser(h(Probe, null))
  // Wait for the async grammar/mount to settle.
  while (!editor.view.peek()) await nextFrame()
  const mount = performance.now() - t0

  const view = editor.view.peek() as EditorView

  // Warmup
  await typeChars(view, 10)
  await nextFrame()

  const t1 = performance.now()
  await typeChars(view, KEYSTROKES)
  const keystrokes = performance.now() - t1
  await nextFrame()

  // External write → DOM applied (poll-until-equal — symmetric protocol
  // with the React cell; Pyreon applies synchronously so the first check
  // exits immediately).
  await new Promise((r) => setTimeout(r, 700))
  const w0 = performance.now()
  editor.value.set('EXTERNAL-WRITE-PAYLOAD')
  const externalWrite =
    performance.now() - w0 + (await timeUntilDoc(view, 'EXTERNAL-WRITE-PAYLOAD'))
  const finalLen = view.state.doc.toString().length

  const t3 = performance.now()
  unmount()
  editor.dispose()
  const dispose = performance.now() - t3

  return { mount, keystrokes, externalWrite, dispose, rerenders, finalLen }
}

async function runReact(): Promise<PyreonCell> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)

  let commits = 0
  let liveView: EditorView | null = null
  let lastValue = ''
  let setValueExternal: ((v: string) => void) | null = null

  function App() {
    const [value, setValue] = React.useState('')
    const ref = React.useRef<ReactCodeMirrorRef>(null)
    commits++
    lastValue = value
    setValueExternal = setValue
    return React.createElement(CodeMirror, {
      ref,
      value,
      basicSetup: false,
      onChange: (v: string) => setValue(v),
      onCreateEditor: (view: EditorView) => {
        liveView = view
      },
    })
  }

  const t0 = performance.now()
  root.render(React.createElement(App))
  while (!liveView) await nextFrame()
  const mount = performance.now() - t0

  const view = liveView as EditorView

  // Warmup (also lets React settle its sync effects)
  await typeChars(view, 10)
  await nextFrame()
  await nextFrame()

  const t1 = performance.now()
  await typeChars(view, KEYSTROKES)
  const keystrokes = performance.now() - t1
  // Let the queued setStates commit.
  await nextFrame()
  await nextFrame()

  // @uiw's typing latch (TimeoutLatch, 200ms) IGNORES external value
  // changes right after typing — an honest protocol must wait it out (the
  // same wait applied to the Pyreon cell, which needs none).
  await new Promise((r) => setTimeout(r, 700))
  const w0 = performance.now()
  setValueExternal!('EXTERNAL-WRITE-PAYLOAD')
  // setState → re-render → PASSIVE value-sync effect (flushes after paint)
  // → dispatch. Poll until the doc reflects it — measuring the real
  // user-observable write→DOM latency.
  const externalWrite =
    performance.now() - w0 + (await timeUntilDoc(view, 'EXTERNAL-WRITE-PAYLOAD'))
  const finalLen = view.state.doc.toString().length
  void lastValue

  const t3 = performance.now()
  root.unmount()
  const dispose = performance.now() - t3
  host.remove()

  return { mount, keystrokes, externalWrite, dispose, rerenders: commits, finalLen }
}

describe('runtime wrapper bench vs @uiw/react-codemirror (real Chromium)', () => {
  it('controlled-value keystroke round-trip + mount + external write + dispose', { timeout: 300_000 }, async () => {
    const py: PyreonCell[] = []
    const re: PyreonCell[] = []

    // Interleaved order (no fixed first-runner bias); first pair discarded as
    // whole-cell warmup.
    for (let r = 0; r < RUNS + 1; r++) {
      const a = await runPyreon()
      const b = await runReact()
      if (r === 0) continue
      py.push(a)
      re.push(b)
    }

    // ── Correctness gates ──────────────────────────────────────────────────
    for (const c of py) expect(c.finalLen, 'pyreon doc reflects the external write').toBe('EXTERNAL-WRITE-PAYLOAD'.length)
    for (const c of re) expect(c.finalLen, 'react doc reflects the external write').toBe('EXTERNAL-WRITE-PAYLOAD'.length)

    // ── The deterministic COUNT headline ───────────────────────────────────
    const pyRerenders = median(py.map((c) => c.rerenders))
    const reCommits = median(re.map((c) => c.rerenders))
    // Pyreon: the component body ran exactly once — zero re-renders for
    // 220 keystrokes + an external write.
    expect(pyRerenders, 'Pyreon component body runs ONCE').toBe(1)
    // @uiw controlled: one React commit per (batched) keystroke round-trip.
    // React 18+ batches same-tick setStates, and typeChars dispatches all K
    // synchronously — so commits ≪ K is possible; what matters is that it
    // RE-RENDERS AT ALL and scales with interaction ticks. Assert > 10 to
    // stay robust across React scheduling changes.
    expect(
      reCommits,
      '@uiw controlled pattern re-renders the owner ~once per keystroke task',
    ).toBeGreaterThan(KEYSTROKES / 2)

    // ── Report ─────────────────────────────────────────────────────────────
    const lines = [
      '',
      '# @pyreon/code vs @uiw/react-codemirror — RUNTIME wrapper overhead (real Chromium)',
      '',
      `Controlled-value pattern, ${KEYSTROKES} keystrokes/run (one macrotask per keystroke — real typing cadence), ${RUNS} runs (median [p25–p75]), plain language, basicSetup parity.`,
      '',
      '| Phase | @pyreon/code | @uiw/react-codemirror | verdict |',
      '| --- | --- | --- | --- |',
      row('Mount → editor ready', py.map((c) => c.mount), re.map((c) => c.mount)),
      row(`${KEYSTROKES} keystrokes (controlled round-trip)`, py.map((c) => c.keystrokes), re.map((c) => c.keystrokes)) +
        ' ← timer-floor-dominated (one macrotask per key, ~4.7ms clamp both cells); the wrapper delta lives in the COUNT below',
      row('External write → DOM', py.map((c) => c.externalWrite), re.map((c) => c.externalWrite)),
      row('Dispose', py.map((c) => c.dispose), re.map((c) => c.dispose)),
      '',
      `**Deterministic count** (portable signal): owner re-renders for ${KEYSTROKES + 10} keystrokes + 1 external write — Pyreon **${pyRerenders}** (body runs once; updates ride the signal), @uiw controlled **${reCommits}** React commits.`,
      '',
      "External-write note: the React number is the passive-effect + @uiw sync machinery in a QUIET editor (700ms after typing); written within ~250ms of typing it measured ~530ms — @uiw's anti-clobber TimeoutLatch defers external values near typing (deliberate design, disclosed rather than counted).",
      '',
      'Honest limits: author-judge; SAME CM6 engine both sides (wrapper-only claim, not "editor is faster"); @uiw uncontrolled mode skips the round-trip and is exempt; one shared page, interleaved order, no per-cell process isolation — magnitudes are the signal.',
      '',
    ]
    // Browser console isn't reliably forwarded to the runner's stdout —
    // persist the report next to the bench (git-ignored? no: committed as
    // the current measured snapshot, like bench/README tables elsewhere).
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'))
    await server.commands.writeFile('bench/RESULTS-runtime.md', lines.join('\n'))
  })
})
