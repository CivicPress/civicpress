<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()

// Settings navigation items
const settingsItems = [
  {
    label: 'Profile',
    icon: 'i-lucide-user',
    to: '/settings/profile',
    description: 'Manage your account settings'
  },
  {
    label: 'Users',
    icon: 'i-lucide-users',
    to: '/settings/users',
    description: 'Manage system users and roles'
  }
] satisfies NavigationMenuItem[]

// Check if current route is active
const isActive = (path: string) => route.path === path

const breadcrumbItems = [
  {
    label: 'Settings',
    to: '/settings'
  }
]
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar>
        <template #title>
          <h1 class="text-lg font-semibold">
            Settings
          </h1>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UBreadcrumb :items="breadcrumbItems" />

      <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <UCard v-for="item in settingsItems" :key="item.to"
          class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          :class="{ 'ring-2 ring-primary-500': isActive(item.to) }" @click="navigateTo(item.to)">
          <div class="flex items-center gap-4">
            <div class="flex-shrink-0">
              <UIcon :name="item.icon" class="w-8 h-8 text-primary-600 dark:text-primary-400" />
            </div>
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ item.label }}
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {{ item.description }}
              </p>
            </div>
            <UIcon name="i-lucide-chevron-right" class="w-5 h-5 text-gray-400" />
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>