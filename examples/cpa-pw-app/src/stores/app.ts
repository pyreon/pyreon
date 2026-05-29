import { defineStore, signal } from '@pyreon/store'

export const useAppStore = defineStore('app', () => {
  const sidebarOpen = signal(true)
  const toggleSidebar = () => sidebarOpen.update((v) => !v)
  return { sidebarOpen, toggleSidebar }
})
