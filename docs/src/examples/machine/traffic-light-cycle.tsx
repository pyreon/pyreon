import { createMachine } from '@pyreon/machine'
import { h } from '@pyreon/core'

/**
 * A traffic light that cycles red → green → yellow → red. Click the light to
 * advance. `machine.matches()` lights exactly one lamp; each state defines a
 * single `NEXT` transition, so the cycle can only advance in order — you can
 * never skip a light.
 */
export default function TrafficLightCycle() {
  const light = createMachine({
    initial: 'red',
    states: {
      red: { on: { NEXT: 'green' } },
      green: { on: { NEXT: 'yellow' } },
      yellow: { on: { NEXT: 'red' } },
    },
  })

  const lamp = (on: () => boolean, color: string) =>
    h('div', {
      style: () => ({
        width: '38px',
        height: '38px',
        borderRadius: '50%',
        background: on() ? color : '#cbd5e1',
        opacity: on() ? 1 : 0.55,
        boxShadow: on() ? '0 0 16px ' + color : 'none',
        transition: 'background 0.2s, opacity 0.2s, box-shadow 0.2s',
      }),
    })

  return h(
    'div',
    { class: 'row', style: { justifyContent: 'center', padding: '20px' } },
    h(
      'button',
      {
        onClick: () => light.send('NEXT'),
        'aria-label': 'advance the light',
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '14px',
          border: 'none',
          borderRadius: '14px',
          cursor: 'pointer',
          background: '#f1f5f9',
        },
      },
      lamp(() => light.matches('red'), '#f87171'),
      lamp(() => light.matches('yellow'), '#fbbf24'),
      lamp(() => light.matches('green'), '#4ade80'),
    ),
  )
}
