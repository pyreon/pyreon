import { createPinia } from 'pinia'
import { createApp } from 'vue'
import './app.css'
import App from './App.vue'
import { router } from './router'

createApp(App).use(createPinia()).use(router).mount('#app')
