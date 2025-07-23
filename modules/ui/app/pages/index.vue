<script setup lang="ts">
import { useAppStore } from '~/stores/app'

const appStore = useAppStore()

// Simple test function
const toggleSidebar = () => {
  appStore.toggleSidebar()
}

const toggleSidebar2 = () => {
  appStore.toggleSidebarCollapsed()
}
</script>

<template>
  <div class="p-8">
    <h1 class="text-3xl font-bold mb-6">CivicPress Dashboard</h1>

    <div class="space-y-4">
      <p>Sidebar Open: {{ appStore.isSidebarOpen ? 'Yes' : 'No' }}</p>
      <p>Sidebar Collapsed: {{ appStore.isSidebarCollapsed ? 'Yes' : 'No' }}</p>
      <p>Theme: {{ appStore.currentTheme }}</p>

      <UButton @click="toggleSidebar">
        Toggle Sidebar
      </UButton>

      <UButton @click="toggleSidebar2">
        Toggle Sidebar 2
      </UButton>
    </div>
  </div>
</template>
