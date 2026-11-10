// https://docs.astro.build/en/guides/actions/
// https://docs.astro.build/en/reference/modules/astro-actions/
// accept: 'form' with no `input` validator: the handler receives the FormData,
// and the shared validateName() is the single source of the validation rule.
import { ActionError, defineAction } from 'astro:actions'
import { addItem, validateName } from '../lib/data'

export const server = {
  addItem: defineAction({
    accept: 'form',
    handler: async (form) => {
      const check = validateName(form.get('name'))
      if (!check.ok) throw new ActionError({ code: 'BAD_REQUEST', message: check.error })
      const item = await addItem(check.name)
      return { id: item.id }
    },
  }),
}
