'use server'
// Server Action — https://nextjs.org/docs/app/guides/forms (validation errors via useActionState)
// https://nextjs.org/docs/app/getting-started/mutating-data (revalidatePath + redirect)
// https://nextjs.org/docs/app/api-reference/functions/redirect
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { addItem, validateName } from '@/lib/data'

export type AddItemState = { error: string | null }

export async function createItem(_prevState: AddItemState, formData: FormData): Promise<AddItemState> {
  const check = validateName(formData.get('name'))
  if (!check.ok) {
    return { error: check.error }
  }
  const item = await addItem(check.name)
  revalidatePath('/items')
  redirect(`/items/${item.id}`)
}
