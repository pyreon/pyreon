import { For, onMount } from '@pyreon/core'
import { useInterval } from '@pyreon/hooks'
import { computed, effect, isClient, signal } from '@pyreon/reactivity'
import { keyframes } from '@pyreon/styler'
import { font, motion, radius, text } from '../theme'
import { el, type ButtonAttrs, focusRing, tone, txt } from '../kit/bases'

/**
 * Terminal / transcript replay for the tool product pages (ai, atlas, lathe,
 * loom, tooling, migrate). Every line it shows is text a tool really
 * printed; the demos keep those captures in `_capture-<id>.ts` modules.
 *
 * Render contract:
 *   - The server render (and the first client render) shows EVERY line, so
 *     no-JS readers and screen readers get the whole output and hydration
 *     matches.
 *   - After mount (and on `replayKey` change, or the Replay button) the lines
 *     are hidden and revealed one by one. Hidden lines keep their space
 *     (`visibility: hidden`), so the box never jumps.
 *   - Reduced motion: no animation, everything stays visible.
 */

/**
 * `note` is the one kind that is NOT tool output: a marked annotation of the
 * demo (e.g. "[4 lines trimmed]"), shown in brackets and italics.
 */
export type ReplayKind = 'cmd' | 'out' | 'dim' | 'head' | 'ok' | 'warn' | 'err' | 'user' | 'note'

export interface ReplayLine {
  readonly k: ReplayKind
  readonly t: string
}

/** Shorthand for capture modules: one kind for many lines of real output. */
export const lines = (k: ReplayKind, block: string): ReplayLine[] => block.split('\n').map((t) => ({ k, t }))

const ALL = Number.MAX_SAFE_INTEGER

const reduceMotion = (): boolean => isClient && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const lineIn = keyframes`from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; }`

const Frame = el
  .config({ name: 'ReplayFrame' })
  .attrs({ tag: 'figure', block: true })
  .theme((_t, m) => ({
    margin: 0,
    minWidth: 0,
    overflow: 'hidden',
    borderRadius: radius.panel,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    backgroundColor: tone(m, 'well'),
  }))

const Bar = el
  .config({ name: 'ReplayBar' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme((_t, m) => ({
    flexWrap: 'wrap',
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 16,
    paddingRight: 10,
    borderBottom: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.mono,
    fontSize: 11.5,
    color: tone(m, 'fog'),
  }))

const BarTitle = txt
  .config({ name: 'ReplayBarTitle' })
  .attrs({ tag: 'span' })
  .theme(() => ({ flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere' }))

const BarButton = el
  .config({ name: 'ReplayButton' })
  .attrs<ButtonAttrs>({ tag: 'button', contentAlignY: 'center' })
  .theme((_t, m) => ({
    height: 28,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    backgroundColor: 'transparent',
    color: tone(m, 'mist'),
    fontFamily: font.mono,
    fontSize: 11.5,
    transition: `color ${motion.hover}, border-color ${motion.hover}`,
    hover: { color: tone(m, 'text'), borderColor: tone(m, 'lineHover') },
    focus: focusRing(m),
  }))

const Log = el
  .config({ name: 'ReplayLog' })
  .attrs({ tag: 'section', block: true })
  .theme((_t, m) => ({
    margin: 0,
    paddingTop: 14,
    paddingBottom: 16,
    paddingLeft: 16,
    paddingRight: 16,
    overflow: 'auto',
    fontFamily: font.mono,
    fontSize: text.mono.size,
    lineHeight: 1.7,
    color: tone(m, 'mist'),
    focus: { ...focusRing(m), outlineOffset: '-2px' },
    extendCss: `
      & > div { white-space: pre-wrap; overflow-wrap: anywhere; min-height: 1.7em; padding-left: 2ch; text-indent: -2ch; }
      & > div:not([data-pending]) { animation: ${lineIn} 180ms ${motion.reveal.easing}; }
      & > [data-pending] { visibility: hidden; }
      & > [data-k='cmd'] { color: ${tone(m, 'prompt')}; }
      & > [data-k='user'] { color: ${tone(m, 'accentText')}; }
      & > [data-k='head'] { color: ${tone(m, 'strong')}; font-weight: 500; }
      & > [data-k='out'] { color: ${tone(m, 'text')}; }
      & > [data-k='dim'] { color: ${tone(m, 'fog')}; }
      & > [data-k='ok'] { color: ${tone(m, 'ok')}; }
      & > [data-k='warn'] { color: ${tone(m, 'warn')}; }
      & > [data-k='err'] { color: ${tone(m, 'err')}; }
      & > [data-k='note'] { color: ${tone(m, 'fog')}; font-style: italic; }
      @media (prefers-reduced-motion: reduce) { & > div:not([data-pending]) { animation: none; } }
    `,
  }))

const Source = txt
  .config({ name: 'ReplaySource' })
  .attrs({ tag: 'figcaption' })
  .theme((_t, m) => ({
    display: 'block',
    paddingTop: 10,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 16,
    borderTop: '1px solid',
    borderColor: tone(m, 'line'),
    fontFamily: font.mono,
    fontSize: 11,
    lineHeight: 1.5,
    color: tone(m, 'fog'),
  }))

const Status = txt
  .config({ name: 'ReplayStatus' })
  .attrs({ tag: 'span' })
  .theme(() => ({
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    extendCss: 'clip: rect(0 0 0 0); clip-path: inset(50%); margin: -1px; padding: 0; border: 0;',
  }))

/**
 * A replayed terminal or transcript. `lines` is read reactively: when the
 * demo swaps the capture (a question, a tab), `replayKey` changes and the new
 * output replays. `source` says where the text was captured; the caption
 * always starts with "real output, replayed".
 */
export function Replay(props: {
  lines: () => readonly ReplayLine[]
  label: string
  title: string
  command?: string | undefined
  source: string
  /** Prefix of the caption; defaults to "real output, replayed". */
  kind?: string | undefined
  delay?: number | undefined
  autoplay?: boolean | undefined
  replayKey?: (() => unknown) | undefined
  /** Fixed log height in px (scrolls inside); default grows with content. */
  height?: number | undefined
}) {
  const shown = signal(ALL)
  const playing = signal(false)
  let mounted = false

  const rows = computed(() => props.lines().map((l, i) => ({ ...l, i, key: `${i}|${l.k}|${l.t}` })))

  const play = () => {
    if (!mounted) return
    if (reduceMotion()) {
      shown.set(ALL)
      playing.set(false)
      return
    }
    shown.set(1)
    playing.set(true)
  }
  const skip = () => {
    shown.set(ALL)
    playing.set(false)
  }

  useInterval(
    () => {
      const n = shown.peek() + 1
      if (n >= rows().length) skip()
      else shown.set(n)
    },
    () => (playing() ? (props.delay ?? 380) : null),
  )

  // A new capture (another question / tab) replays from the top.
  effect(() => {
    props.replayKey?.()
    play()
  })

  onMount(() => {
    mounted = true
    if (props.autoplay) play()
    return undefined
  })

  return (
    <Frame>
      <Bar>
        <BarTitle>
          {props.title}
          {props.command ? <span> · {props.command}</span> : null}
        </BarTitle>
        <BarButton type="button" onClick={play}>
          Replay
        </BarButton>
        <BarButton type="button" onClick={skip}>
          Show all
        </BarButton>
        <Status aria-live="polite">{() => (playing() ? 'Replaying the output' : '')}</Status>
      </Bar>
      <Log
        tag="section"
        tabIndex={0}
        aria-label={props.label}
        style={props.height ? `height:${props.height}px` : undefined}
      >
        <For each={() => rows()} by={(r) => r.key}>
          {(r) => (
            <div data-k={r.k} data-pending={() => (r.i >= shown() ? '' : undefined)}>
              {r.t}
            </div>
          )}
        </For>
      </Log>
      <Source>
        {props.kind ?? 'real output, replayed'} · {props.source}
      </Source>
    </Frame>
  )
}
