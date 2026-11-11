import { For, onUnmount } from '@pyreon/core'
import { computed, defineStore, signal } from '@pyreon/store'
import { DemoSurface, GlowCard } from '../kit/cards'
import { DemoGrid, PaperButton, PaperLabel } from '../kit/demo'
import { createLog, DemoLog, DemoStack, PaperActions, PaperList, PaperMono, PaperRow, PaperText } from '../kit/demo-parts'
import { Eyebrow } from '../kit/type'

/**
 * Store demo (`store.json` → demo): a real `defineStore` cart. `onAction`
 * logs every action call with its arguments; `subscribe` logs every
 * mutation with its `type` and changed keys. Undo keeps each
 * `mutation.state` snapshot and `patch`es the previous one back (the undo
 * recipe on the page).
 */
interface Item {
  name: string
  price: number
}

const PRODUCTS: readonly Item[] = [
  { name: 'Keyboard', price: 129 },
  { name: 'Monitor', price: 349 },
  { name: 'Cable', price: 12 },
]

const useCart = defineStore('pyreon-site-demo-cart', () => {
  const items = signal<Item[]>([])
  const total = computed(() => items().reduce((sum, i) => sum + i.price, 0))
  const add = (item: Item) => items.update((list) => [...list, item])
  const remove = (index: number) => items.update((list) => list.filter((_, i) => i !== index))
  const clear = () => items.set([])
  return { items, total, add, remove, clear }
})

export default function DemoStore() {
  const cart = useCart()
  const actions = createLog(30)
  const mutations = createLog(30)
  const history: Record<string, unknown>[] = [cart.state]
  const depth = signal(0)
  let undoing = false

  // The store is a singleton: drop these listeners when the demo unmounts.
  const offAction = cart.onAction(({ name, args, after }) => {
    after(() => actions.push(`${name}(${args.map((a) => JSON.stringify(a)).join(', ')})`))
  })
  const offMutation = cart.subscribe((mutation) => {
    mutations.push(`${mutation.type} · ${mutation.events.map((e) => e.key).join(', ')}${undoing ? ' (undo)' : ''}`, undoing ? 'accent' : 'plain')
    if (undoing) return
    history.push(mutation.state)
    depth.set(history.length - 1)
  })

  onUnmount(() => {
    offAction()
    offMutation()
  })

  const undo = () => {
    if (history.length < 2) return
    history.pop()
    undoing = true
    cart.patch(history[history.length - 1] as Record<string, unknown>)
    undoing = false
    depth.set(history.length - 1)
  }

  const reset = () => {
    cart.reset()
    history.length = 1
    depth.set(0)
  }

  return (
    <DemoGrid>
      <DemoSurface aria-label="Cart demo">
        <PaperLabel>Products</PaperLabel>
        <For each={PRODUCTS} by={(p) => p.name}>
          {(p) => (
            <PaperRow>
              <span>{`${p.name} · $${p.price}`}</span>
              <PaperButton type="button" aria-label={`Add ${p.name}`} onClick={() => cart.store.add(p)}>
                add()
              </PaperButton>
            </PaperRow>
          )}
        </For>
        <PaperLabel>In the cart</PaperLabel>
        <PaperList aria-label="Cart items">
          <For each={() => cart.store.items().map((item, i) => ({ item, i }))} by={(x) => `${x.i}-${x.item.name}`}>
            {(x) => (
              <li>
                <PaperRow>
                  <span>{x.item.name}</span>
                  <PaperButton type="button" aria-label={`Remove ${x.item.name}`} onClick={() => cart.store.remove(x.i)}>
                    remove()
                  </PaperButton>
                </PaperRow>
              </li>
            )}
          </For>
        </PaperList>
        <PaperText aria-live="polite">
          Total <PaperMono>{() => `$${cart.store.total()}`}</PaperMono> · {() => cart.store.items().length} items
        </PaperText>
        <PaperActions>
          <PaperButton type="button" onClick={() => cart.store.clear()}>
            clear()
          </PaperButton>
          <PaperButton type="button" onClick={undo} disabled={depth() === 0}>
            undo
          </PaperButton>
          <PaperButton type="button" onClick={reset}>
            reset()
          </PaperButton>
        </PaperActions>
      </DemoSurface>
      <GlowCard padding="compact">
        <DemoStack>
          <Eyebrow>onAction</Eyebrow>
          <DemoLog label="onAction log" entries={() => actions.entries()} empty="Call an action." />
          <Eyebrow>subscribe</Eyebrow>
          <DemoLog label="subscribe log" entries={() => mutations.entries()} empty="Each change arrives here as one mutation." />
        </DemoStack>
      </GlowCard>
    </DemoGrid>
  )
}
