<!--
  Svelte 5 form component — idiomatic Felte (the most-used Svelte form lib).

  Felte is uncontrolled: the `use:form` action reads/writes inputs by their
  `name` attribute, and `$errors` is a store. It validates on input + blur by
  default (no per-mode toggle), so the keystroke-blur and keystroke-change
  columns measure the same Felte behavior — noted in METHODOLOGY.

  `@felte/validator-zod`'s `validator({ schema })` runs the SAME shared zod
  schema. The bench wrapper drives this via the component exports below.
-->
<script lang="ts">
  import { validator } from '@felte/validator-zod'
  import { createForm } from 'felte'
  import { FIELD_NAMES, formSchema } from '../../shared/schema'

  const { form, errors, reset, setFields } = createForm({
    extend: validator({ schema: formSchema }),
    onSubmit: () => {},
  })

  // Svelte 5 component exports — callable on the object returned by mount().
  export function resetForm(): void {
    reset()
  }
  export function setField(name: string, value: string): void {
    setFields(name, value, true)
  }
</script>

<form use:form>
  {#each FIELD_NAMES as name (name)}
    <div>
      <input data-field={name} {name} type="text" />
      <span data-error={name}>{$errors[name]?.[0] ?? ''}</span>
    </div>
  {/each}
</form>
