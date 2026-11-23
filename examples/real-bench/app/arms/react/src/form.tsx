import { type ChangeEvent, type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { useCatalog, useCatalogDispatch } from './catalog'
import {
  CATEGORIES,
  type Draft,
  type DraftField,
  draftToProduct,
  EMPTY_DRAFT,
  hasErrors,
  nextProductId,
  validateDraft,
} from './data'

export function NewProduct() {
  const { products } = useCatalog()
  const dispatch = useCatalogDispatch()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [submitted, setSubmitted] = useState(false)
  const errors = submitted ? validateDraft(draft) : {}

  const set = (field: DraftField) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft({ ...draft, [field]: e.target.value })

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitted(true)
    if (hasErrors(validateDraft(draft))) return
    const id = nextProductId(products)
    dispatch({ type: 'add', product: draftToProduct(draft, id) })
    void navigate(`/products/${id}`)
  }

  const error = (field: DraftField) =>
    errors[field] && (
      <p id={`error-${field}`} className="error">
        {errors[field]}
      </p>
    )

  return (
    <>
      <h1>New product</h1>
      <form id="new-form" noValidate onSubmit={handleSubmit}>
        <label>
          Name <input id="f-name" name="name" value={draft.name} onChange={set('name')} />
        </label>
        {error('name')}
        <label>
          Category{' '}
          <select id="f-category" name="category" value={draft.category} onChange={set('category')}>
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
          Price <input id="f-price" name="price" inputMode="decimal" value={draft.price} onChange={set('price')} />
        </label>
        {error('price')}
        <label>
          Stock <input id="f-stock" name="stock" inputMode="numeric" value={draft.stock} onChange={set('stock')} />
        </label>
        {error('stock')}
        <button id="f-submit" type="submit">
          Create
        </button>
      </form>
    </>
  )
}
