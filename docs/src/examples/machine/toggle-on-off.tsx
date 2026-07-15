import { createMachine } from '@pyreon/machine'
import { h } from '@pyreon/core'

/**
 * The smallest useful `createMachine` — an on/off toggle, drawn as a switch.
 * `machine.matches('on')` drives the knob position and track color;
 * `send('TOGGLE')` flips between the two states. There is no third state, so
 * an impossible value is structurally unreachable.
 */
export default function ToggleOnOff() {
  const toggle = createMachine({
    initial: 'off',
    states: {
      off: { on: { TOGGLE: 'on' } },
      on: { on: { TOGGLE: 'off' } },
    },
  })

  return h(
    'div',
    { class: 'row', style: { justifyContent: 'center', padding: '24px' } },
    h(
      'button',
      {
        onClick: () => toggle.send('TOGGLE'),
        'aria-label': 'toggle',
        style: () => ({
          width: '68px',
          height: '36px',
          padding: '4px',
          border: 'none',
          borderRadius: '18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: toggle.matches('on') ? 'flex-end' : 'flex-start',
          background: toggle.matches('on') ? '#22c55e' : '#cbd5e1',
          transition: 'background 0.2s',
        }),
      },
      h('div', {
        style: {
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
        },
      }),
    ),
  )
}
