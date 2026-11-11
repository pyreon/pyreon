import type { VNodeChild } from '@pyreon/core'
import { For, Show } from '@pyreon/core'
import { signal, watch } from '@pyreon/reactivity'
import { font, paper, radius, text } from '../theme'
import { el, type ButtonAttrs, focusRing, tone, txt } from './bases'

/**
 * More demo building blocks (beside `kit/demo.tsx`): a log on the dark card,
 * a segmented switch and status tags for the paper surface, the "simulated"
 * label that every simulated demo carries, and small layout rows.
 */

// ─── dark card ─────────────────────────────────────────────────────────────

const LogBox = el
  .config({ name: 'DemoLog' })
  .attrs({ tag: 'ol', block: true, contentAlignX: 'block', contentAlignY: 'top' })
  .theme((_t, m) => ({
    listStyle: 'none',
    margin: 0,
    padding: 14,
    minHeight: 180,
    maxHeight: 300,
    overflowY: 'auto',
    border: '1px solid',
    borderColor: tone(m, 'line'),
    borderRadius: radius.note,
    backgroundColor: tone(m, 'well'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    lineHeight: 1.7,
    color: tone(m, 'mist'),
    focus: focusRing(m),
    extendCss: `& > li { white-space: pre-wrap; overflow-wrap: anywhere; }`,
  }))

const LogLine = txt
  .config({ name: 'DemoLogLine' })
  .attrs({ tag: 'li' })
  .states((_t, m) => ({
    plain: {},
    dim: { color: tone(m, 'fog') },
    ok: { color: tone(m, 'ok') },
    err: { color: tone(m, 'err') },
    accent: { color: tone(m, 'accentText') },
  }))

export type LogTone = 'plain' | 'dim' | 'ok' | 'err' | 'accent'
export interface LogEntry {
  id: number
  text: string
  tone?: LogTone | undefined
}

/**
 * A scrolling log (mono lines on the well). Focusable so keyboard users can
 * scroll it; announced politely. `empty` shows while there are no lines.
 */
export function DemoLog(props: { entries: () => readonly LogEntry[]; label: string; empty?: string | undefined }) {
  let box: HTMLElement | null = null
  // Newest lines are appended: keep the box scrolled to them as they arrive.
  watch(
    () => props.entries().length,
    () => {
      const node = box
      if (node) queueMicrotask(() => (node.scrollTop = node.scrollHeight))
    },
  )
  return (
    <LogBox
      aria-label={props.label}
      aria-live="polite"
      tabIndex={0}
      ref={(n: HTMLElement | null) => {
        box = n
      }}
    >
      <Show when={() => props.entries().length === 0}>
        <LogLine state="dim">{props.empty ?? '(nothing yet)'}</LogLine>
      </Show>
      <For each={() => props.entries()} by={(e) => e.id}>
        {(e) => <LogLine state={e.tone ?? 'plain'}>{e.text}</LogLine>}
      </For>
    </LogBox>
  )
}

/** A log signal that keeps the newest `max` lines: `log.push(line, kind)`, `log.clear()`, read with `log.entries()`. */
export function createLog(max = 40) {
  let seq = 0
  const entries = signal<readonly LogEntry[]>([])
  return {
    entries,
    push(line: string, kind?: LogTone): void {
      entries.update((prev) => {
        const out = [...prev, { id: ++seq, text: line, tone: kind }]
        return out.length > max ? out.slice(out.length - max) : out
      })
    },
    clear(): void {
      entries.set([])
    },
  }
}

const SimBox = txt
  .config({ name: 'SimulatedNote' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    display: 'inline-block',
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 10,
    paddingRight: 10,
    border: '1px dashed',
    borderColor: tone(m, 'line2'),
    borderRadius: radius.note,
    fontFamily: font.mono,
    fontSize: text.mono.size - 0.5,
    lineHeight: 1.45,
    color: tone(m, 'warmText'),
  }))

/** The on-screen label every simulated demo (or simulated part) carries. */
export function SimulatedNote(props: { children?: VNodeChild }) {
  return <SimBox>{props.children}</SimBox>
}

// ─── paper surface ─────────────────────────────────────────────────────────

// A fieldset cannot be a flex container reliably (wrapping breaks), so the
// buttons sit in a wrapping row inside it.
const PaperSegBox = el
  .config({ name: 'PaperSegmented' })
  .attrs({ tag: 'fieldset', block: true })
  .theme(() => ({ margin: 0, padding: 0, border: 'none', minWidth: 0 }))

/** A wrapping row of buttons (use inside a fieldset or anywhere). */
export const ButtonRow = el
  .config({ name: 'DemoButtonRow' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 6 })
  .theme(() => ({ flexWrap: 'wrap', minWidth: 0 }))

const PaperSegLegend = txt
  .config({ name: 'PaperSegLegend' })
  .attrs({ tag: 'legend' })
  .theme(() => ({ padding: 0, marginBottom: 6, fontSize: 13, fontWeight: 600, color: paper.text }))

export const PaperToggle = el
  .config({ name: 'PaperToggle' })
  .attrs<ButtonAttrs>({ tag: 'button', contentAlignY: 'center' })
  .theme(() => ({
    minHeight: 32,
    paddingLeft: 11,
    paddingRight: 11,
    borderRadius: 8,
    border: '1px solid',
    borderColor: paper.line,
    backgroundColor: paper.field,
    color: paper.text,
    fontFamily: font.mono,
    fontSize: 12.5,
    cursor: 'pointer',
    extendCss: `
      &:focus-visible { outline: 2px solid ${paper.accent}; outline-offset: 2px; }
      &[aria-pressed='true'] { border-color: ${paper.accent}; color: ${paper.accent}; box-shadow: inset 0 0 0 1px ${paper.accent}; }
      &:disabled { opacity: .45; cursor: not-allowed; }
    `,
  }))

/** A labelled group of toggle buttons on the paper surface (`aria-pressed`). */
export function PaperSegmented<T extends string>(props: {
  legend: string
  options: readonly T[]
  value: () => T
  onChange: (v: T) => void
  format?: ((v: T) => string) | undefined
}) {
  return (
    <PaperSegBox>
      <PaperSegLegend>{props.legend}</PaperSegLegend>
      <ButtonRow>
        <For each={props.options} by={(o) => o}>
          {(o) => (
            <PaperToggle type="button" aria-pressed={() => (props.value() === o ? 'true' : 'false')} onClick={() => props.onChange(o)}>
              {props.format ? props.format(o) : o}
            </PaperToggle>
          )}
        </For>
      </ButtonRow>
    </PaperSegBox>
  )
}

/** A small status tag on paper: ok | err | warn | idle. */
export const PaperTag = txt
  .config({ name: 'PaperTag' })
  .attrs({ tag: 'span' })
  .theme(() => ({
    display: 'inline-block',
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 9,
    paddingRight: 9,
    borderRadius: 9999,
    fontFamily: font.mono,
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: 'nowrap',
  }))
  .states(() => ({
    idle: { backgroundColor: '#EDE6D6', color: paper.mist },
    ok: { backgroundColor: '#DCF2E3', color: paper.ok },
    err: { backgroundColor: '#FBE3E3', color: paper.err },
    warn: { backgroundColor: '#F6EBD3', color: '#7A4F00' },
  }))

/** A row on paper: label left, value right. */
export const PaperRow = el
  .config({ name: 'PaperRow' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'spaceBetween', contentAlignY: 'center', gap: 10 })
  .theme(() => ({ flexWrap: 'wrap', minWidth: 0, paddingTop: 8, paddingBottom: 8, borderBottom: `1px solid ${paper.line}`, fontSize: 14, color: paper.text }))

/** Buttons in a wrapping row. */
export const PaperActions = el
  .config({ name: 'PaperActions' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme(() => ({ flexWrap: 'wrap', marginTop: 12 }))

/** Paper body text. */
export const PaperText = txt
  .config({ name: 'PaperText' })
  .attrs({ tag: 'p' })
  .theme(() => ({ margin: 0, fontSize: 14, lineHeight: 1.55, color: paper.mist }))

/** Monospace on paper (paths, values). */
export const PaperMono = txt
  .config({ name: 'PaperMono' })
  .attrs({ tag: 'span' })
  .theme(() => ({ fontFamily: font.mono, fontSize: 12.5, color: paper.text, overflowWrap: 'anywhere' }))

/** A vertical stack with a gap. */
export const DemoStack = el.config({ name: 'DemoStack' }).attrs({ block: true, gap: 12 }).theme(() => ({ minWidth: 0 }))

/** An unstyled list on paper (rows bring their own borders). */
export const PaperList = el
  .config({ name: 'PaperList' })
  .attrs({ tag: 'ul', block: true, contentAlignX: 'block' })
  .theme(() => ({ listStyle: 'none', margin: 0, padding: 0, minWidth: 0 }))

/** A checkbox row on paper: `<PaperCheck><input type="checkbox" /><span>label</span></PaperCheck>`; checked text is struck through. */
export const PaperCheck = el
  .config({ name: 'PaperCheck' })
  .attrs({ tag: 'label', block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme(() => ({
    minHeight: 40,
    borderBottom: `1px solid ${paper.line}`,
    fontSize: 14,
    color: paper.text,
    cursor: 'pointer',
    extendCss: `
      & > input { width: 16px; height: 16px; margin: 0; accent-color: ${paper.accent}; }
      & > input:focus-visible { outline: 2px solid ${paper.accent}; outline-offset: 2px; }
      & > input:checked + span { text-decoration: line-through; color: ${paper.fog}; }
    `,
  }))

/** A note line on the dark card. */
export const CardNote = txt
  .config({ name: 'DemoCardNote' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({ margin: 0, fontSize: text.ui.size, lineHeight: 1.6, color: tone(m, 'fog') }))

const CardToggle = el
  .config({ name: 'DemoCardToggle' })
  .attrs<ButtonAttrs & { 'aria-pressed'?: string | (() => string) }>({ tag: 'button', contentAlignY: 'center' })
  .theme((_t, m) => ({
    minHeight: 32,
    paddingLeft: 12,
    paddingRight: 12,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
    color: tone(m, 'fog'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    hover: { color: tone(m, 'text') },
    focus: focusRing(m),
    extendCss: `&[aria-pressed='true'] { color: ${tone(m, 'text')}; border-color: ${tone(m, 'currentBorder')}; background: ${tone(m, 'currentFill')}; }`,
  }))

/**
 * A wrapping set of toggle buttons for the dark card. (The kit's `Segmented`
 * is a flex fieldset, which does not wrap reliably, so its labels squeeze
 * onto two lines on a phone.)
 */
export function CardSegmented<T extends string>(props: { label: string; options: readonly T[]; value: () => T; onChange: (v: T) => void }) {
  return (
    <PaperSegBox aria-label={props.label}>
      <ButtonRow>
        <For each={props.options} by={(o) => o}>
          {(o) => (
            <CardToggle type="button" aria-pressed={() => (props.value() === o ? 'true' : 'false')} onClick={() => props.onChange(o)}>
              {o}
            </CardToggle>
          )}
        </For>
      </ButtonRow>
    </PaperSegBox>
  )
}
