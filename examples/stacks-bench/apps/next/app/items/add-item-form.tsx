'use client'
// Form + Server Action + useActionState for the validation error —
// https://nextjs.org/docs/app/guides/forms#validation-errors
import { useActionState } from 'react'
import { type AddItemState, createItem } from './actions'

const initialState: AddItemState = { error: null }

export function AddItemForm() {
  const [state, formAction] = useActionState(createItem, initialState)

  return (
    <>
      <form action={formAction}>
        <input name="name" />
        <button type="submit">Add</button>
      </form>
      {state.error && <p id="form-error">{state.error}</p>}
    </>
  )
}
