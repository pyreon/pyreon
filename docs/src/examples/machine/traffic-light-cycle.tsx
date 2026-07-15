import { createMachine } from '@pyreon/machine'
import { h } from '@pyreon/core'

/**
 * A traffic light that cycles red → green → yellow → red. `machine.matches()`
 * drives the visual indicator; each state defines exactly one `NEXT`
 * transition, so the cycle can only advance in order — you can never skip
 * a light.
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

  const color = () =>
    light.matches('red') ? '#ef4444' : light.matches('green') ? '#22c55e' : '#eab308'

  return h(
    'div',
    { class: 'col' },
    h(
      'div',
      { class: 'card', style: { textAlign: 'center' } },
      h('div', {
        style: () => ({
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          margin: '4px auto',
          background: color(),
          boxShadow: '0 0 18px ' + color(),
          transition: 'background 0.2s, box-shadow 0.2s',
        }),
      }),
      h('div', { class: 'muted', style: { marginTop: '10px' } }, () => 'state: ' + light()),
    ),
    h(
      'div',
      { class: 'row' },
      h('button', { onClick: () => light.send('NEXT') }, 'NEXT →'),
    ),
  )
}
