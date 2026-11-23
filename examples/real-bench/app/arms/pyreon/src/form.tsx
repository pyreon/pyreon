import { Show } from '@pyreon/core'
import { computed, signal } from '@pyreon/reactivity'
import { useRouter } from '@pyreon/router'
import { CATEGORIES, type Draft, type DraftField, EMPTY_DRAFT, hasErrors, validateDraft } from './data'
import { useCatalog } from './store'

export function NewProduct() {
  const catalog = useCatalog().store
  const router = useRouter()
  const draft = signal<Draft>(EMPTY_DRAFT)
  const submitted = signal(false)
  const errors = computed(() => (submitted() ? validateDraft(draft()) : {}))

  const set = (field: DraftField) => (e: Event) =>
    draft.set({ ...draft(), [field]: (e.target as HTMLInputElement | HTMLSelectElement).value })

  const onSubmit = (e: Event) => {
    e.preventDefault()
    submitted.set(true)
    if (hasErrors(validateDraft(draft()))) return
    const id = catalog.addProduct(draft())
    void router.push(`/products/${id}`)
  }

  const error = (field: DraftField) => (
    <Show when={() => errors()[field] !== undefined}>
      <p id={`error-${field}`} class="error">
        {errors()[field]}
      </p>
    </Show>
  )

  return (
    <>
      <h1>New product</h1>
      <form id="new-form" novalidate onSubmit={onSubmit}>
        <label>
          Name <input id="f-name" name="name" value={draft().name} onInput={set('name')} />
        </label>
        {error('name')}
        <label>
          Category{' '}
          <select id="f-category" name="category" value={draft().category} onChange={set('category')}>
            <option value="">Choose…</option>
            {CATEGORIES.map((c) => (
              <option value={c}>{c}</option>
            ))}
          </select>
        </label>
        {error('category')}
        <label>
          Price <input id="f-price" name="price" inputmode="decimal" value={draft().price} onInput={set('price')} />
        </label>
        {error('price')}
        <label>
          Stock <input id="f-stock" name="stock" inputmode="numeric" value={draft().stock} onInput={set('stock')} />
        </label>
        {error('stock')}
        <button id="f-submit" type="submit">
          Create
        </button>
      </form>
    </>
  )
}
