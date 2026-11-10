<!-- /items — https://svelte.dev/docs/kit/load + https://svelte.dev/docs/kit/form-actions (use:enhance, form prop) -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import Counter from '#lib/Counter.svelte';
	import { formatPrice } from '#lib/price.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<main>
	<h1>Items</h1>
	<Counter />
	<ul id="items">
		{#each data.items as item (item.id)}
			<li><a href="/items/{item.id}">{item.name}</a> <span class="price">{formatPrice(item.price)}</span></li>
		{/each}
	</ul>
	<form method="POST" use:enhance>
		<input name="name" />
		<button type="submit">Add</button>
	</form>
	{#if form?.error}<p id="form-error">{form.error}</p>{/if}
</main>
