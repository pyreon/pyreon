import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { state } from '@pyreon/core/plain'
import { Checkbox, Title } from '@pyreon/ui-components'
import { MixedCheckboxDemo } from './MixedCheckboxDemo'

function NativeCheckboxReset() {
  const checked = signal(false)
  return h(
    'form',
    { 'aria-label': 'Native checkbox reset' },
    h(
      'label',
      null,
      h('input', {
        type: 'checkbox',
        checked: () => checked(),
        onChange: (event: Event) => checked.set((event.currentTarget as HTMLInputElement).checked),
      }),
      'Native checkbox',
    ),
    h('output', null, () => String(checked())),
    h('button', { type: 'button', onClick: () => checked.set(false) }, 'Reset checkbox'),
  )
}

export function CheckboxDemo() {
  let agreed = state(false)
  let newsletter = state(true)

  return (
    <div>
      <Title size="h2" style="margin-bottom: 24px">Checkbox</Title>

      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
        <Checkbox checked={agreed} onChange={(v: boolean) => { agreed = v }}>
          I agree to the terms
        </Checkbox>
        <Checkbox checked={newsletter} onChange={(v: boolean) => { newsletter = v }}>
          Subscribe to newsletter
        </Checkbox>
        <Checkbox checked={false} onChange={() => {}} disabled>
          Disabled option
        </Checkbox>
      </div>

      <NativeCheckboxReset />
      <MixedCheckboxDemo />

      <p style="font-size: 13px; color: #6b7280;">
        Agreed: {agreed} | Newsletter: {newsletter}
      </p>
    </div>
  )
}
