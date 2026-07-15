import { createMachine } from '@pyreon/machine'
import { h } from '@pyreon/core'

/**
 * The smallest useful `createMachine` — an on/off toggle. `machine()` reads
 * the current state reactively; `send('TOGGLE')` flips between the two
 * states. There is no third state, so an impossible value is structurally
 * unreachable.
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
    { class: 'col' },
    h(
      'div',
      { class: 'card', style: { textAlign: 'center' } },
      h('div', { class: 'muted' }, 'switch'),
      h(
        'div',
        {
          style: () => ({
            fontSize: '26px',
            fontWeight: '700',
            marginTop: '6px',
            color: toggle.matches('on') ? '#22c55e' : '#94a3b8',
          }),
        },
        () => (toggle.matches('on') ? '● ON' : '○ OFF'),
      ),
    ),
    h(
      'div',
      { class: 'row' },
      h('button', { onClick: () => toggle.send('TOGGLE') }, 'Toggle'),
    ),
    h('div', { class: 'muted' }, () => 'state: ' + toggle()),
  )
}
