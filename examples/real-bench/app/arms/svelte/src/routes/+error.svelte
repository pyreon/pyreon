<script lang="ts">
  import { page } from '$app/state'
</script>

{#if page.status === 404}
  <h1 id="not-found">Not found</h1>
{:else}
  <h1>{page.error?.message}</h1>
{/if}
