import { useComputed, useSignal } from '@preact/signals'
import { useLocation } from 'preact-iso'
import { CATEGORIES, type Draft, type DraftField, EMPTY_DRAFT, hasErrors, validateDraft } from './data'
import { useAppState } from './state'

export function NewProduct() {
  const state = useAppState()
  const { route } = useLocation()
  const draft = useSignal<Draft>(EMPTY_DRAFT)
  const submitted = useSignal(false)
  const errors = useComputed(() => (submitted.value ? validateDraft(draft.value) : {}))

  const set = (field: DraftField) => (e: Event) => {
    draft.value = { ...draft.value, [field]: (e.currentTarget as HTMLInputElement | HTMLSelectElement).value }
  }

  const onSubmit = (e: SubmitEvent) => {
    e.preventDefault()
    submitted.value = true
    if (hasErrors(validateDraft(draft.value))) return
    const id = state.addProduct(draft.value)
    route(`/products/${id}`)
  }

  const error = (field: DraftField) => {
    const message = errors.value[field]
    return (
      message && (
        <p id={`error-${field}`} class="error">
          {message}
        </p>
      )
    )
  }

  return (
    <>
      <h1>New product</h1>
      <form id="new-form" noValidate onSubmit={onSubmit}>
        <label>
          Name <input id="f-name" name="name" value={draft.value.name} onInput={set('name')} />
        </label>
        {error('name')}
        <label>
          Category{' '}
          <select id="f-category" name="category" value={draft.value.category} onChange={set('category')}>
            <option value="">Choose…</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {error('category')}
        <label>
          Price{' '}
          <input id="f-price" name="price" inputMode="decimal" value={draft.value.price} onInput={set('price')} />
        </label>
        {error('price')}
        <label>
          Stock{' '}
          <input id="f-stock" name="stock" inputMode="numeric" value={draft.value.stock} onInput={set('stock')} />
        </label>
        {error('stock')}
        <button id="f-submit" type="submit">
          Create
        </button>
      </form>
    </>
  )
}
