import { useHotkey } from '@pyreon/hotkeys'
import { signal } from '@pyreon/reactivity'
import { h } from '@pyreon/core'

/**
 * Arrow keys move the dot — `useHotkey('up' | 'down' | 'left' | 'right', …)`
 * binds each direction (the aliases map to the arrow keys) and cleans up on
 * unmount. The pad buttons do the same thing on click, so the demo works
 * with mouse or keyboard.
 */
export default function HotkeysMoveDot() {
  const BOX_W = 220
  const BOX_H = 140
  const DOT = 26
  const STEP = 28

  const x = signal((BOX_W - DOT) / 2)
  const y = signal((BOX_H - DOT) / 2)
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v))
  const move = (dx: number, dy: number) => {
    x.set(clamp(x.peek() + dx, BOX_W - DOT))
    y.set(clamp(y.peek() + dy, BOX_H - DOT))
  }

  useHotkey('up', () => move(0, -STEP), { preventDefault: true })
  useHotkey('down', () => move(0, STEP), { preventDefault: true })
  useHotkey('left', () => move(-STEP, 0), { preventDefault: true })
  useHotkey('right', () => move(STEP, 0), { preventDefault: true })

  const glyph: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' }
  const pad = (aria: string, dx: number, dy: number) =>
    h('button', {
      onClick: () => move(dx, dy),
      'aria-label': aria,
      style: { width: '34px', height: '30px', border: 'none', borderRadius: '7px', cursor: 'pointer', background: '#60a5fa', color: '#fff', fontSize: '15px', fontWeight: 700 },
    }, glyph[aria] ?? aria)

  return h(
    'div',
    { class: 'col', style: { alignItems: 'center', gap: '14px', padding: '18px' } },
    h(
      'div',
      { style: { position: 'relative', width: `${BOX_W}px`, height: `${BOX_H}px`, borderRadius: '12px', background: '#f1f5f9' } },
      h('div', {
        class: 'dot',
        style: () => ({
          position: 'absolute',
          left: `${x()}px`,
          top: `${y()}px`,
          width: `${DOT}px`,
          height: `${DOT}px`,
          borderRadius: '50%',
          background: '#4ade80',
          transition: 'left 0.12s, top 0.12s',
        }),
      }),
    ),
    h(
      'div',
      { class: 'col', style: { alignItems: 'center', gap: '6px' } },
      pad('up', 0, -STEP),
      h(
        'div',
        { class: 'row', style: { gap: '6px' } },
        pad('left', -STEP, 0),
        pad('down', 0, STEP),
        pad('right', STEP, 0),
      ),
    ),
  )
}
