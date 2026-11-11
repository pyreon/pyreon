import { For } from '@pyreon/core'
import { createMachine } from '@pyreon/machine'
import { font, radius, text } from '../theme'
import { el, focusRing, tone, txt } from '../kit/bases'
import { GlowCard } from '../kit/cards'
import { DemoGrid } from '../kit/demo'
import { ButtonRow, createLog, DemoLog, DemoStack } from '../kit/demo-parts'
import { Eyebrow } from '../kit/type'

/**
 * Machine demo (`machine.json` → demo): a real `createMachine` checkout.
 * The event buttons are enabled from `nextEvents()`, which is reactive, so
 * an event the current state does not accept cannot be sent. Every
 * transition reaches `onTransition`, which writes the log.
 */
const STATES = ['cart', 'details', 'paying', 'declined', 'paid'] as const
const EVENTS = ['CHECKOUT', 'BACK', 'PAY', 'SUCCESS', 'DECLINE', 'RETRY'] as const

const Graph = el
  .config({ name: 'MachineGraph' })
  .attrs({ tag: 'ol', block: true, contentDirection: 'inline', gap: 8 })
  .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0 }))

const Node = txt
  .config({ name: 'MachineNode' })
  .attrs({ tag: 'li' })
  .theme((_t, m) => ({
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 12,
    paddingRight: 12,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    borderRadius: radius.pill,
    fontFamily: font.mono,
    fontSize: text.mono.size,
    color: tone(m, 'fog'),
  }))
  .states((_t, m) => ({
    off: {},
    on: {
      color: tone(m, 'text'),
      borderColor: tone(m, 'currentBorder'),
      backgroundColor: tone(m, 'currentFill'),
    },
  }))

const Events = el
  .config({ name: 'MachineEvents' })
  .attrs({ tag: 'fieldset', block: true })
  .theme(() => ({ margin: 0, padding: 0, border: 'none', minWidth: 0 }))

const EventButton = el
  .config({ name: 'MachineEvent' })
  .attrs<{ type?: 'button'; disabled?: boolean | undefined; onClick?: () => void }>({
    tag: 'button',
    contentAlignY: 'center',
  })
  .theme((_t, m) => ({
    minHeight: 34,
    paddingLeft: 12,
    paddingRight: 12,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    borderRadius: radius.note,
    backgroundColor: 'transparent',
    color: tone(m, 'text'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    cursor: 'pointer',
    hover: { borderColor: tone(m, 'lineHover') },
    focus: focusRing(m),
    extendCss: '&:disabled { opacity: .4; cursor: not-allowed; }',
  }))

export default function DemoMachine() {
  const checkout = createMachine({
    initial: 'cart',
    states: {
      cart: { on: { CHECKOUT: 'details' } },
      details: { on: { BACK: 'cart', PAY: 'paying' } },
      paying: { on: { SUCCESS: 'paid', DECLINE: 'declined' } },
      declined: { on: { RETRY: 'paying', BACK: 'details' } },
      paid: {},
    },
  })
  const log = createLog(30)
  checkout.onTransition((from, to, event) => log.push(`${event.type}  ${from} → ${to}`))

  const reset = () => {
    log.push(`reset()  ${checkout()} → cart`, 'accent')
    checkout.reset()
  }

  return (
    <DemoGrid>
      <GlowCard padding="compact">
        <DemoStack>
          <Eyebrow>states · final: paid</Eyebrow>
          <Graph aria-label="Checkout states">
            <For each={STATES} by={(s) => s}>
              {(s) => (
                <Node
                  state={checkout() === s ? 'on' : 'off'}
                  aria-current={checkout() === s ? 'step' : undefined}
                >
                  {s}
                </Node>
              )}
            </For>
          </Graph>
          <Eyebrow>{() => `nextEvents() → [${checkout.nextEvents().join(', ')}]`}</Eyebrow>
          <Events aria-label="Send an event">
            <ButtonRow>
              <For each={EVENTS} by={(e) => e}>
                {(e) => (
                  <EventButton
                    type="button"
                    disabled={!checkout.nextEvents().includes(e)}
                    onClick={() => checkout.send(e)}
                  >
                    {`send('${e}')`}
                  </EventButton>
                )}
              </For>
              <EventButton type="button" onClick={reset}>
                reset()
              </EventButton>
            </ButtonRow>
          </Events>
        </DemoStack>
      </GlowCard>
      <GlowCard padding="compact">
        <DemoStack>
          <Eyebrow>onTransition</Eyebrow>
          <DemoLog
            label="onTransition log"
            entries={() => log.entries()}
            empty="Send CHECKOUT to start."
          />
        </DemoStack>
      </GlowCard>
    </DemoGrid>
  )
}
