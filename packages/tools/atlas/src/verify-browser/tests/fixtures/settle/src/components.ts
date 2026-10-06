/**
 * Components whose preview is time-varying (#3837). Plain `h()` and no JSX on
 * purpose, like the side-effects fixture.
 */
import { h, onMount } from '@pyreon/core'

/**
 * The issue's reproduction: Animate moves a red rectangle for 2s, the finished
 * state is a green rectangle at the final position (the same green the initial
 * paint has). A capture one frame after the click records the RED mid-flight state.
 */
export function MovingCanvas(): ReturnType<typeof h> {
  let canvas: HTMLCanvasElement | null = null
  let frame = 0
  onMount(() => {
    const context = canvas?.getContext('2d')
    if (context) {
      context.fillStyle = '#00ff00'
      context.fillRect(250, 0, 50, 100)
    }
    return () => cancelAnimationFrame(frame)
  })
  function animate(): void {
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    cancelAnimationFrame(frame)
    const start = performance.now()
    const draw = (now: number): void => {
      const progress = Math.min(1, (now - start) / 2000)
      context.clearRect(0, 0, 300, 100)
      context.fillStyle = progress === 1 ? '#00ff00' : '#ff0000'
      context.fillRect(progress * 250, 0, 50, 100)
      if (progress < 1) frame = requestAnimationFrame(draw)
    }
    draw(start)
  }
  return h(
    'div',
    null,
    h('button', { onClick: animate }, 'Animate'),
    h('canvas', {
      width: 300,
      height: 100,
      ref: (el: HTMLCanvasElement | null) => {
        canvas = el
      },
    }),
  )
}

/** A canvas loop that never ends once started: it must FAIL the capture, not be sampled. */
export function EndlessCanvas(): ReturnType<typeof h> {
  let canvas: HTMLCanvasElement | null = null
  let frame = 0
  onMount(() => () => cancelAnimationFrame(frame))
  function spin(): void {
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const loop = (now: number): void => {
      context.clearRect(0, 0, 300, 100)
      context.fillStyle = '#ff0000'
      context.fillRect(((now / 10) % 250) | 0, 0, 50, 100)
      frame = requestAnimationFrame(loop)
    }
    loop(performance.now())
  }
  return h(
    'div',
    null,
    h('button', { onClick: spin }, 'Spin'),
    h('canvas', {
      width: 300,
      height: 100,
      ref: (el: HTMLCanvasElement | null) => {
        canvas = el
      },
    }),
  )
}

/** Nothing time-varying at all: must be captured without waiting the full window. */
export function StaticCard(): ReturnType<typeof h> {
  return h('div', { style: 'width:120px;height:40px;background:#3366cc' }, 'static')
}
