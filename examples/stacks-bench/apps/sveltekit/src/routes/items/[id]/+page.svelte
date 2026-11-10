<script lang="ts">
	import { formatPrice } from '#lib/price.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<main>
	<h1 id="item-name">{data.item.name}</h1>
	<p>{data.item.description}</p>
	<p class="price">{formatPrice(data.item.price)}</p>
	<a href="/items">Back</a>
</main>
