<!-- The interactive widget, as in https://svelte.dev/docs/svelte/$state ; onMount marks hydration. -->
<script lang="ts">
	import { onMount } from 'svelte';

	let count = $state(0);
	onMount(() => {
		performance.mark('stacks:island-ready');
	});
</script>

<button id="counter" type="button" onclick={() => count++}>Count: {count}</button>
