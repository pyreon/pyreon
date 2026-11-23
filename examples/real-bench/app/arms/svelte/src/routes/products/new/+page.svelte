<script lang="ts">
  import { goto } from '$app/navigation'
  import { catalog } from '#lib/catalog.svelte.ts'
  import { CATEGORIES, type Draft, EMPTY_DRAFT, hasErrors, validateDraft } from '#lib/data.ts'

  let draft = $state<Draft>({ ...EMPTY_DRAFT })
  let submitted = $state(false)
  const errors = $derived(submitted ? validateDraft(draft) : {})

  function onsubmit(e: SubmitEvent) {
    e.preventDefault()
    submitted = true
    if (hasErrors(validateDraft(draft))) return
    const id = catalog.addProduct({ ...draft })
    void goto(`/products/${id}`)
  }
</script>

<h1>New product</h1>
<form id="new-form" novalidate {onsubmit}>
  <label>Name <input id="f-name" name="name" bind:value={draft.name} /></label>
  {#if errors.name}<p id="error-name" class="error">{errors.name}</p>{/if}
  <label>
    Category
    <select id="f-category" name="category" bind:value={draft.category}>
      <option value="">Choose…</option>
      {#each CATEGORIES as c (c)}
        <option value={c}>{c}</option>
      {/each}
    </select>
  </label>
  {#if errors.category}<p id="error-category" class="error">{errors.category}</p>{/if}
  <label>Price <input id="f-price" name="price" inputmode="decimal" bind:value={draft.price} /></label>
  {#if errors.price}<p id="error-price" class="error">{errors.price}</p>{/if}
  <label>Stock <input id="f-stock" name="stock" inputmode="numeric" bind:value={draft.stock} /></label>
  {#if errors.stock}<p id="error-stock" class="error">{errors.stock}</p>{/if}
  <button id="f-submit" type="submit">Create</button>
</form>
