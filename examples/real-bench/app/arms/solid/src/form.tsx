import { useNavigate } from '@solidjs/router'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import { useCatalog } from './catalog'
import { CATEGORIES, type Draft, type DraftField, EMPTY_DRAFT, hasErrors, validateDraft } from './data'

export function NewProduct() {
  const catalog = useCatalog()
  const navigate = useNavigate()
  const [draft, setDraft] = createStore<Draft>({ ...EMPTY_DRAFT })
  const [submitted, setSubmitted] = createSignal(false)
  const errors = createMemo(() => (submitted() ? validateDraft(draft) : {}))

  const set = (field: DraftField) => (e: Event & { currentTarget: HTMLInputElement | HTMLSelectElement }) =>
    setDraft(field, e.currentTarget.value)

  const onSubmit = (e: SubmitEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (hasErrors(validateDraft(draft))) return
    const id = catalog.addProduct({ ...draft })
    navigate(`/products/${id}`)
  }

  const error = (field: DraftField) => (
    <Show when={errors()[field]}>
      {(message) => (
        <p id={`error-${field}`} class="error">
          {message()}
        </p>
      )}
    </Show>
  )

  return (
    <>
      <h1>New product</h1>
      <form id="new-form" novalidate onSubmit={onSubmit}>
        <label>
          Name <input id="f-name" name="name" value={draft.name} onInput={set('name')} />
        </label>
        {error('name')}
        <label>
          Category{' '}
          <select id="f-category" name="category" value={draft.category} onChange={set('category')}>
            <option value="">Choose…</option>
            <For each={CATEGORIES}>{(c) => <option value={c}>{c}</option>}</For>
          </select>
        </label>
        {error('category')}
        <label>
          Price <input id="f-price" name="price" inputmode="decimal" value={draft.price} onInput={set('price')} />
        </label>
        {error('price')}
        <label>
          Stock <input id="f-stock" name="stock" inputmode="numeric" value={draft.stock} onInput={set('stock')} />
        </label>
        {error('stock')}
        <button id="f-submit" type="submit">
          Create
        </button>
      </form>
    </>
  )
}
