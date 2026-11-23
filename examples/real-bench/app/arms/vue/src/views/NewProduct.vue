<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CATEGORIES, type Draft, EMPTY_DRAFT, hasErrors, validateDraft } from '../data'
import { useCatalogStore } from '../stores/catalog'

const catalog = useCatalogStore()
const router = useRouter()
const draft = reactive<Draft>({ ...EMPTY_DRAFT })
const submitted = ref(false)
const errors = computed(() => (submitted.value ? validateDraft(draft) : {}))

function onSubmit() {
  submitted.value = true
  if (hasErrors(validateDraft(draft))) return
  const id = catalog.addProduct({ ...draft })
  void router.push(`/products/${id}`)
}
</script>

<template>
  <h1>New product</h1>
  <form id="new-form" novalidate @submit.prevent="onSubmit">
    <label>Name <input id="f-name" v-model="draft.name" name="name" /></label>
    <p v-if="errors.name" id="error-name" class="error">{{ errors.name }}</p>
    <label>
      Category
      <select id="f-category" v-model="draft.category" name="category">
        <option value="">Choose…</option>
        <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
      </select>
    </label>
    <p v-if="errors.category" id="error-category" class="error">{{ errors.category }}</p>
    <label>Price <input id="f-price" v-model="draft.price" name="price" inputmode="decimal" /></label>
    <p v-if="errors.price" id="error-price" class="error">{{ errors.price }}</p>
    <label>Stock <input id="f-stock" v-model="draft.stock" name="stock" inputmode="numeric" /></label>
    <p v-if="errors.stock" id="error-stock" class="error">{{ errors.stock }}</p>
    <button id="f-submit" type="submit">Create</button>
  </form>
</template>
